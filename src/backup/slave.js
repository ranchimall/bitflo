'use strict';

const keys = require("../keys");
const DB = require("../database");
const { getTableHashes } = require("./sync");

const {
    BACKUP_INTERVAL,
    BACKUP_SYNC_TIMEOUT,
    CHECKSUM_INTERVAL,
    HASH_N_ROW
} = require("../_constants")["backup"];

var masterWS = null; //Container for Master websocket connection

var intervalID = null;

function startSlaveProcess(ws, init) {
    if (!ws) throw Error("Master WS connection required");
    //stop existing process
    stopSlaveProcess();
    //set masterWS
    ws.on('message', processDataFromMaster);
    masterWS = ws;
    let sinks_stored = {};
    Promise.all([keys.getStoredList(), keys.getDiscardedList()]).then(result => {
        let stored_list = result[0],
            discarded_list = result[1];
        for (let group in stored_list) {
            sinks_stored[group] = [];
            for (let id of stored_list[group])
                if (!(id in discarded_list))
                    sinks_stored[group].push(id);
        }
    }).catch(error => console.error(error)).finally(_ => {
        //inform master
        let message = {
            floID: keys.node_id,
            pubKey: keys.node_pub,
            sinks: sinks_stored,
            req_time: Date.now(),
            type: "SLAVE_CONNECT"
        }
        message.sign = floCrypto.signData(message.type + "|" + message.req_time, keys.node_priv);
        ws.send(JSON.stringify(message));
        //start sync
        if (init)
            requestInstance.open();
        intervalID = setInterval(() => requestInstance.open(), BACKUP_INTERVAL);
    })
}

function stopSlaveProcess() {
    if (masterWS !== null) {
        masterWS.onclose = () => null;
        masterWS.close();
        requestInstance.close();
        masterWS = null;
    }
    if (intervalID !== null) {
        clearInterval(intervalID);
        intervalID = null;
    }
}

function requestBackupSync(checksum_trigger, ws) {
    return new Promise((resolve, reject) => {
        DB.query('SELECT MAX(u_time) as last_time FROM _backup').then(result => {
            let request = {
                floID: keys.node_id,
                pubKey: keys.node_pub,
                type: "BACKUP_SYNC",
                last_time: result[0].last_time,
                checksum: checksum_trigger,
                req_time: Date.now()
            };
            request.sign = floCrypto.signData(request.type + "|" + request.req_time, keys.node_priv);
            ws.send(JSON.stringify(request));
            resolve(request);
        }).catch(error => reject(error))
    })
}

const requestInstance = {
    ws: null,
    cache: null,
    checksum: null,
    delete_data: null,
    add_data: null,
    request: null,
    onetime: null,
    last_response_time: null,
    checksum_count_down: 0
};

requestInstance.open = function (ws = null) {
    const self = this;
    //Check if there is an active request 
    if (self.request) {
        console.log("A request is already active");
        if (self.last_response_time < Date.now() - BACKUP_SYNC_TIMEOUT)
            self.close();
        else
            return;
    }
    //Use websocket connection if passed, else use masterWS if available
    if (ws) {
        ws.on('message', processDataFromMaster);
        self.onetime = true;
    } else if (masterWS)
        ws = masterWS;
    else return console.warn("Not connected to master");

    requestBackupSync(!self.checksum_count_down || self.onetime, ws).then(request => {
        self.request = request;
        self.cache = [];
        self.last_response_time = Date.now();
        self.ws = ws;
    }).catch(error => console.error(error))
}

requestInstance.close = function () {
    const self = this;
    if (self.onetime)
        self.ws.close();
    else
        self.checksum_count_down = self.checksum_count_down ? self.checksum_count_down - 1 : CHECKSUM_INTERVAL;
    self.onetime = null;
    self.ws = null;
    self.cache = null;
    self.checksum = null;
    self.delete_data = null;
    self.add_data = null;
    self.request = null;
    self.last_response_time = null;
}

function processDataFromMaster(message) {
    try {
        message = JSON.parse(message);
        //console.debug("Master:", message);
        if (message.command.startsWith("SYNC"))
            processBackupData(message);
        else switch (message.command) {
            case "SINK_SHARE":
                storeSinkShare(message.group, message.sinkID, message.share, message.ref);
                break;
            case "SEND_SHARE":
                sendSinkShare(message.group, message.sinkID, message.pubKey);
                break;
            case "REQUEST_ERROR":
                console.log(message.error);
                if (message.type === "BACKUP_SYNC")
                    requestInstance.close();
                break;
        }
    } catch (error) {
        console.error(error);
    }
}

function storeSinkShare(group, sinkID, share, ref) {
    share = floCrypto.decryptData(share, keys.node_priv);
    keys.addShare(group, sinkID, ref, share)
        .then(_ => null).catch(error => console.error(error));
}

function sendSinkShare(group, sinkID, pubKey) {
    keys.getShares(group, sinkID).then(({ ref, shares }) => {
        shares.forEach(s => {
            let response = {
                type: "SINK_SHARE",
                sinkID, ref,
                share: floCrypto.encryptData(s, pubKey),
                floID: keys.node_id,
                pubKey: keys.node_pub,
                req_time: Date.now()
            }
            response.sign = floCrypto.signData(response.type + "|" + response.req_time, keys.node_priv); //TODO: strengthen signature
            masterWS.send(JSON.stringify(response));
        })
    }).catch(error => console.error(error));
}

function processBackupData(response) {
    //TODO: Sync improvements needed. (2 types)
    //1. Either sync has to be completed or rollback all
    //2. Each table/data should be treated as independent chunks
    const self = requestInstance;
    self.last_response_time = Date.now();
    switch (response.command) {
        case "SYNC_END":
            if (response.status) {
                storeBackupData(self.cache, self.checksum).then(result => {
                    updateBackupTable(self.add_data, self.delete_data);
                    if (result) {
                        console.log("Backup Sync completed successfully");
                        self.close();
                    } else
                        console.log("Waiting for re-sync data");
                }).catch(_ => {
                    console.warn("Backup Sync was not successful");
                    self.close();
                });
            } else {
                console.info("Backup Sync was not successful! Failed info: ", response.info);
                self.close();
            }
            break;
        case "SYNC_DELETE":
            self.delete_data = response.delete_data;
            self.cache.push(cacheBackupData(null, response.delete_data));
            break;
        case "SYNC_HEADER":
            self.add_data = response.add_data;
            break;
        case "SYNC_UPDATE":
            self.cache.push(cacheBackupData(response.table, response.data));
            break;
        case "SYNC_CHECKSUM":
            self.checksum = response.checksum;
            break;
        case "SYNC_HASH":
            verifyHash(response.hashes)
                .then(mismatch => requestTableChunks(mismatch, self.ws))
                .catch(error => {
                    console.error(error);
                    self.close();
                });
            break;
    }
}

const cacheBackupData = (tableName, dataCache) => new Promise((resolve, reject) => {
    DB.query("INSERT INTO _backupCache (t_name, data_cache) VALUE (?, ?)", [tableName, JSON.stringify(dataCache)])
        .then(_ => resolve(true)).catch(error => {
            console.error(error);
            reject(false);
        })
});

function storeBackupData(cache_promises, checksum_ref) {
    return new Promise((resolve, reject) => {
        Promise.allSettled(cache_promises).then(_ => {
            console.log("START: BackupCache -> Tables");
            //Process 'Users' table 1st as it provides foreign key attribute to other tables
            DB.query("SELECT * FROM _backupCache WHERE t_name=?", ["Users"]).then(data => {
                Promise.allSettled(data.map(d => updateTableData("Users", JSON.parse(d.data_cache)))).then(result => {
                    storeBackupData.commit(data, result).then(_ => {
                        DB.query("SELECT * FROM _backupCache WHERE t_name IS NOT NULL").then(data => {
                            Promise.allSettled(data.map(d => updateTableData(d.t_name, JSON.parse(d.data_cache)))).then(result => {
                                storeBackupData.commit(data, result).then(_ => {
                                    DB.query("SELECT * FROM _backupCache WHERE t_name IS NULL").then(data => {
                                        Promise.allSettled(data.map(d => deleteTableData(JSON.parse(d.data_cache)))).then(result => {
                                            storeBackupData.commit(data, result).then(_ => {
                                                console.log("END: BackupCache -> Tables");
                                                if (!checksum_ref) //No checksum verification
                                                    resolve(true);
                                                else
                                                    verifyChecksum(checksum_ref)
                                                        .then(result => resolve(result))
                                                        .catch(error => reject(error))
                                            });
                                        })
                                    })
                                })
                            })
                        }).catch(error => {
                            console.error(error);
                            console.warn("ABORT: BackupCache -> Tables");
                            reject(false);
                        });
                    })
                })
            }).catch(error => {
                console.error(error);
                console.warn("ABORT: BackupCache -> Tables");
                reject(false);
            })
        })
    })

}

storeBackupData.commit = function (data, result) {
    let promises = [];
    for (let i = 0; i < data.length; i++)
        switch (result[i].status) {
            case "fulfilled":
                promises.push(DB.query("DELETE FROM _backupCache WHERE id=?", data[i].id));
                break;
            case "rejected":
                console.error(result[i].reason);
                promises.push(DB.query("UPDATE _backupCache SET fail=TRUE WHERE id=?", data[i].id));
                break;
        }
    return Promise.allSettled(promises);
}

function updateBackupTable(add_data, delete_data) {
    //update _backup table for added data
    DB.transaction(add_data.map(r => [
        "INSERT INTO _backup (t_name, id, mode, u_time) VALUE (?, ?, TRUE, ?) ON DUPLICATE KEY UPDATE mode=TRUE, u_time=?",
        [r.t_name, r.id, validateValue(r.u_time), validateValue(r.u_time)]
    ])).then(_ => null).catch(error => console.error(error));
    //update _backup table for deleted data
    DB.transaction(delete_data.map(r => [
        "INSERT INTO _backup (t_name, id, mode, u_time) VALUE (?, ?, NULL, ?) ON DUPLICATE KEY UPDATE mode=NULL, u_time=?",
        [r.t_name, r.id, validateValue(r.u_time), validateValue(r.u_time)]
    ])).then(_ => null).catch(error => console.error(error));
}

function deleteTableData(data) {
    return new Promise((resolve, reject) => {
        let delete_needed = {};
        data.forEach(r => r.t_name in delete_needed ? delete_needed[r.t_name].push(r.id) : delete_needed[r.t_name] = [r.id]);
        let queries = [];
        for (let table in delete_needed)
            queries.push(["DELETE FROM ?? WHERE id IN (?)", [table, delete_needed[table]]]);
        DB.transaction(queries).then(_ => resolve(true)).catch(error => reject(error));
    })
}

function updateTableData(table, data) {
    return new Promise((resolve, reject) => {
        if (!data.length)
            return resolve(null);
        let cols = Object.keys(data[0]);
        let values = data.map(r => cols.map(c => validateValue(r[c])));
        let statement = "INSERT INTO ?? (??) VALUES ? ON DUPLICATE KEY UPDATE " + Array(cols.length).fill("??=VALUES(??)").join();
        let query_values = [table, cols, values];
        cols.forEach(c => query_values.push(c, c));
        DB.query(statement, query_values).then(_ => resolve(true)).catch(error => reject(error));
    })
}

const validateValue = val => (typeof val === "string" && /\.\d{3}Z$/.test(val)) ? new Date(val) : val;

function verifyChecksum(checksum_ref) {
    return new Promise((resolve, reject) => {
        DB.query("CHECKSUM TABLE ??", [Object.keys(checksum_ref)]).then(result => {
            let checksum = Object.fromEntries(result.map(r => [r.Table.split(".").pop(), r.Checksum]));
            let mismatch = [];
            for (let table in checksum)
                if (checksum[table] != checksum_ref[table])
                    mismatch.push(table);
            //console.debug("Checksum-mismatch:", mismatch);
            if (!mismatch.length) //Checksum of every table is verified.
                resolve(true);
            else { //If one or more tables checksum is not correct, re-request the table data
                requestHash(mismatch);
                resolve(false);
            }
        }).catch(error => {
            console.error(error);
            reject(false);
        })
    })
}

function requestHash(tables) {
    //TODO: resync only necessary data (instead of entire table)
    let self = requestInstance;
    let request = {
        floID: keys.node_id,
        pubKey: keys.node_pub,
        type: "HASH_SYNC",
        tables: tables,
        req_time: Date.now()
    };
    request.sign = floCrypto.signData(request.type + "|" + request.req_time, keys.node_priv);
    self.ws.send(JSON.stringify(request));
    self.request = request;
    self.checksum = null;
    self.cache = [];
}

function verifyHash(hashes) {
    const convertIntArray = obj => Object.keys(obj).map(i => parseInt(i));
    const checkHash = (table, hash_ref) => new Promise((res, rej) => {
        getTableHashes(table).then(hash_cur => {
            for (let i in hash_ref)
                if (hash_ref[i] === hash_cur[i]) {
                    delete hash_ref[i];
                    delete hash_cur[i];
                }
            res([convertIntArray(hash_ref), convertIntArray(hash_cur)]);
        }).catch(error => rej(error))
    })
    return new Promise((resolve, reject) => {
        let tables = Object.keys(hashes);
        Promise.allSettled(tables.map(t => checkHash(t, hashes[t]))).then(result => {
            let mismatch = {};
            for (let t in tables)
                if (result[t].status === "fulfilled") {
                    mismatch[tables[t]] = result[t].value; //Data that are incorrect/missing/deleted
                    //Data to be deleted (incorrect data will be added by resync)
                    let id_end = result[t].value[1].map(i => i * HASH_N_ROW); //eg if i=2 AND H_R_C = 5 then id_end = 2 * 5 = 10 (ie, range 6-10)
                    Promise.allSettled(id_end.map(i =>
                        DB.query("DELETE FROM ?? WHERE id BETWEEN ? AND ?", [tables[t], i - HASH_N_ROW + 1, i]) //eg, i - HASH_N_ROW + 1 = 10 - 5 + 1 = 6
                    )).then(_ => null);
                } else
                    console.error(result[t].reason);
            //console.debug("Hash-mismatch", mismatch);
            resolve(mismatch);
        }).catch(error => reject(error))
    })
}

function requestTableChunks(tables, ws) {
    let request = {
        floID: keys.node_id,
        pubKey: keys.node_pub,
        type: "RE_SYNC",
        tables: tables,
        req_time: Date.now()
    };
    request.sign = floCrypto.signData(request.type + "|" + request.req_time, keys.node_priv);
    ws.send(JSON.stringify(request));
}

module.exports = {
    get masterWS() {
        return masterWS;
    },
    start: startSlaveProcess,
    stop: stopSlaveProcess,
    syncRequest: ws => requestInstance.open(ws)
}