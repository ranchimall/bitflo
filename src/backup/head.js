'use strict';

const keys = require('../keys');
const K_Bucket = require('../../docs/scripts/floTradeAPI').K_Bucket;
const slave = require('./slave');
const sync = require('./sync');
const WebSocket = require('ws');

const { BACKUP_INTERVAL } = require("../_constants")["backup"];
const { DISCARD_COOLDOWN } = require("../_constants")["keys"];

var _app, _wss; //Container for app and wss
var nodeList, nodeURL, nodeKBucket; //Container for (backup) node list
const connectedSlaves = {},
    shares_collected = {},
    shares_pending = {},
    discarded_sinks = [];

var _mode = null;
const SLAVE_MODE = 0,
    MASTER_MODE = 1;

//Shares
function generateShares(sinkKey) {
    let nextNodes = nodeKBucket.nextNode(keys.node_id, null),
        aliveNodes = Object.keys(connectedSlaves);
    nextNodes.unshift(keys.node_id);
    aliveNodes.unshift(keys.node_id);
    let shares, mappedShares = {};
    shares = keys.generateShares(sinkKey, nextNodes.length, aliveNodes.length);
    for (let i in nextNodes)
        mappedShares[nextNodes[i]] = shares[i];
    return mappedShares;
}

function sendShares(ws, sinkID) {
    if (!(sinkID in shares_pending) || !(ws.floID in shares_pending[sinkID].shares))
        return;
    let { ref, group } = shares_pending[sinkID],
        shares = shares_pending[sinkID].shares[ws.floID];
    delete shares_pending[sinkID].shares[ws.floID]; //delete the share after sending it to respective slave
    shares.forEach(s => ws.send(JSON.stringify({
        command: "SINK_SHARE",
        sinkID, ref, group,
        share: floCrypto.encryptData(s, ws.pubKey)
    })));
}

function sendSharesToNodes(sinkID, group, shares) {
    if (discarded_sinks.includes(sinkID)) { //sinkID is discarded, abort the new shares
        let i = discarded_sinks.findIndex(sinkID);
        discarded_sinks.splice(i, 1);
        return;
    }
    let ref = Date.now();
    shares_pending[sinkID] = { shares, group, ref };
    if (keys.node_id in shares) {
        shares_pending[sinkID].shares[keys.node_id].forEach(s =>
            keys.addShare(group, sinkID, ref, s).then(_ => null).catch(error => console.error(error)));
        delete shares_pending[sinkID].shares[keys.node_id];
    }
    for (let node in shares)
        if (node in connectedSlaves)
            sendShares(connectedSlaves[node], sinkID);
    keys.sink_chest.set_id(group, sinkID, ref);
}

function requestShare(ws, group, sinkID) {
    ws.send(JSON.stringify({
        command: "SEND_SHARE",
        group, sinkID,
        pubKey: keys.node_pub
    }));
}

/*
function transferMoneyToNewSink(oldSinkID, oldSinkKey, newSink) {
    const transferToken = token => new Promise((resolve, reject) => {
        floTokenAPI.getBalance(oldSinkID, token).then(tokenBalance => {
            floBlockchainAPI.writeData(oldSinkID, `send ${tokenBalance} ${token}# |Trade-market New sink`, oldSinkKey, newSink.floID, false)
                .then(txid => resolve(txid))
                .catch(error => reject(error))
        })
    });
    return new Promise((resolve, reject) => {
        console.debug("Transferring tokens to new Sink:", newSink.floID)
        Promise.allSettled(tokenList.map(token => transferToken(token))).then(result => {
            let failedFlag = false;
            tokenList.forEach((token, i) => {
                if (result[i].status === "fulfilled")
                    console.log(token, result[i].value);
                else {
                    failedFlag = true;
                    console.error(token, result[i].reason);
                }
            });
            if (failedFlag)
                return reject("Some token transfer has failed");
            floBlockchainAPI.getBalance(oldSinkID).then(floBalance => {
                floTokenAPI.getBalance(oldSinkID).then(cashBalance => {
                    floBlockchainAPI.sendTx(oldSinkID, newSink.floID, floBalance - floGlobals.fee, oldSinkKey, `send ${cashBalance} ${floGlobals.currency}# |Trade-market New sink`)
                        .then(result => resolve(result))
                        .catch(error => reject(error))
                }).catch(error => reject(error));
            }).catch(error => reject(error))
        });
    })
}
*/

function collectAndCall(group, sinkID, callback, timeout = null) {
    if (!(callback instanceof Function))
        throw Error("callback should be a function");
    if (!(sinkID in shares_collected)) { //if not already collecting shares for sinkID, then initiate collection
        shares_collected[sinkID] = { group, ref: 0, callbacks: [], shares: {} };
        for (let floID in connectedSlaves)
            requestShare(connectedSlaves[floID], group, sinkID);
        keys.getShares(group, sinkID)
            .then(({ ref, shares }) => shares.forEach(s => collectShares(sinkID, ref, s)))
            .catch(error => console.error(error))
    }
    shares_collected[sinkID].callbacks.push(callback);
    if (timeout)
        setTimeout(() => {
            if (sinkID in shares_collected) {
                let i = shares_collected[sinkID].callbacks.indexOf(callback);
                delete shares_collected[sinkID].callbacks[i]; //deleting will empty the index, but space will be there so that order of other indexes are not affected
            }
        }, timeout);
}

collectAndCall.isAlive = (sinkID, callbackRef) => (sinkID in shares_collected && shares_collected[sinkID].callbacks.indexOf(callbackRef) != -1);

function collectShares(sinkID, ref, share) {
    if (_mode !== MASTER_MODE)
        return console.warn("Not serving as master");
    if (!(sinkID in shares_collected))
        return console.debug("Received shares for sink thats not been collected right now");
    if (shares_collected[sinkID].ref > ref)
        return console.debug("Received expired share");
    else if (shares_collected[sinkID].ref < ref) {
        shares_collected[sinkID].ref = ref;
        shares_collected[sinkID].shares = [];
    }
    if (shares_collected[sinkID].shares.includes(share))
        return console.debug("Received duplicate share");
    shares_collected[sinkID].shares.push(share);
    try {
        let sinkKey = floCrypto.retrieveShamirSecret(shares_collected[sinkID].shares);
        if (floCrypto.verifyPrivKey(sinkKey, sinkID)) {
            console.debug("Shares collected successfully for", sinkID);
            shares_collected[sinkID].callbacks.forEach(fn => fn instanceof Function ? fn(sinkKey) : null);
            delete shares_collected[sinkID];
        }
    } catch {
        //Unable to retrive sink private key. Waiting for more shares! Do nothing for now
    };
}

function connectWS(floID) {
    let url = nodeURL[floID];
    return new Promise((resolve, reject) => {
        const ws = new WebSocket('wss://' + url);
        ws.on('open', _ => resolve(ws));
        ws.on('error', error => reject(error));
    })
}

function connectToMaster(i = 0, init = false) {
    if (i >= nodeList.length) {
        console.error("No master is found and Node not in list. This should not happen!");
        process.exit(1);
    }
    let floID = nodeList[i];
    if (floID === keys.node_id)
        serveAsMaster(init);
    else
        connectWS(floID).then(ws => {
            ws.floID = floID;
            ws.onclose = () => connectToMaster(i);
            serveAsSlave(ws, init);
        }).catch(error => {
            console.log(`Node(${floID}) is offline`);
            connectToMaster(i + 1, init)
        });
}

function informLiveNodes(init) {
    let message = {
        floID: keys.node_id,
        type: "UPDATE_MASTER",
        pubKey: keys.node_pub,
        req_time: Date.now()
    };
    message.sign = floCrypto.signData(message.type + "|" + message.req_time, keys.node_priv);
    message = JSON.stringify(message);
    let nodes = nodeList.filter(n => n !== keys.node_id);
    Promise.allSettled(nodes.map(n => connectWS(n))).then(result => {
        let flag = false;
        for (let i in result)
            if (result[i].status === "fulfilled") {
                let ws = result[i].value;
                ws.send(message);
                ws.close();
                flag = true;
            } else
                console.warn(`Node(${nodes[i]}) is offline`);
        if (init && flag)
            syncRequest();
        keys.getStoredList().then(stored_list => {
            if (Object.keys(stored_list).length) {
                keys.getDiscardedList().then(discarded_list => {
                    let cur_time = Date.now();
                    for (let group in stored_list)
                        stored_list[group].forEach(id => {
                            if (!(id in discarded_list))
                                reconstructShares(group, id)
                            else if (cur_time - discarded_list[id] < DISCARD_COOLDOWN) //sinkID still in cooldown period
                                keys.sink_chest.set_id(group, id, null);
                        });
                }).catch(error => console.error(error))
            } else if (init && !flag) {
                console.log("Starting the server...");
                //generate a sinkID for each group in starting list
                keys.sink_groups.initial_list.forEach(group =>
                    generateSink(group).then(_ => null).catch(e => console.error(e)));
            }
        }).catch(error => console.error(error));
    });
}

function syncRequest(cur = keys.node_id) {
    //Sync data from next available node
    let nextNode = nodeKBucket.nextNode(cur);
    if (!nextNode)
        return console.warn("No nodes available to Sync");
    connectWS(nextNode)
        .then(ws => slave.syncRequest(ws))
        .catch(_ => syncRequest(nextNode));
}

function updateMaster(floID) {
    let currentMaster = _mode === MASTER_MODE ? keys.node_id : slave.masterWS.floID;
    if (nodeList.indexOf(floID) < nodeList.indexOf(currentMaster))
        connectToMaster();
}

function reconstructAllActiveShares() {
    if (_mode !== MASTER_MODE)
        return console.debug("Not serving as master");
    console.debug("Reconstructing shares for all active IDs")
    let group_list = keys.sink_groups.list;
    group_list.forEach(g => {
        //active ids also ignore ids that are in queue for reconstructing shares
        let active_ids = keys.sink_chest.active_list(g);
        active_ids.forEach(id => reconstructShares(g, id));
    });
}

function reconstructShares(group, sinkID) {
    if (_mode !== MASTER_MODE)
        return console.warn(`Not serving as master, but reconstruct-shares is called for ${sinkID}(${group})`);
    keys.sink_chest.set_id(group, sinkID, null);
    collectAndCall(group, sinkID, sinkKey => sendSharesToNodes(sinkID, group, generateShares(sinkKey)));
}

function slaveConnect(floID, pubKey, ws, slave_sinks) {
    if (_mode !== MASTER_MODE)
        return console.warn("Not serving as master");
    ws.floID = floID;
    ws.pubKey = pubKey;
    connectedSlaves[floID] = ws;

    //Send shares if need to be delivered
    for (let sinkID in shares_pending)
        if (floID in shares_pending[sinkID].shares)
            sendShares(ws, sinkID);
    //Request shares if any
    for (let sinkID in shares_collected)
        requestShare(ws, shares_collected[sinkID].group, sinkID);
    //check if sinks in slaves are present
    if (slave_sinks instanceof Object) {
        for (let group in slave_sinks)
            for (let sinkID of slave_sinks[group]) {
                if (!keys.sink_chest.includes(group, sinkID))
                    keys.checkIfDiscarded(sinkID)
                        .then(result => result === false ? reconstructShares(group, sinkID) : null)
                        .catch(error => console.error(error))
            }
    }
}

const eCode = require('../../docs/scripts/floTradeAPI').errorCode;

function generateSink(group) {
    return new Promise((resolve, reject) => {
        if (!keys.sink_groups.generate_list.includes(group))
            return reject(INVALID(eCode.INVALID_VALUE, `Invalid Group ${group}`));
        try {
            let newSink = floCrypto.generateNewID();
            console.debug("Generated sink:", group, newSink.floID);
            sendSharesToNodes(newSink.floID, group, generateShares(newSink.privKey));
            resolve(`Generated ${newSink.floID} (${group})`);
        } catch (error) {
            reject(error)
        }
    })
}

function reshareSink(id) {
    return new Promise((resolve, reject) => {
        if (!floCrypto.validateAddr(id))
            return reject(INVALID(eCode.INVALID_VALUE, `Invalid ID ${id}`));
        else {
            let group = keys.sink_chest.find_group(id);
            if (!group)
                return reject(INVALID(eCode.NOT_FOUND, `ID ${id} not found`));
            else keys.checkIfDiscarded(id).then(result => {
                if (result)
                    return reject(INVALID(eCode.NOT_FOUND, `ID is discarded`));
                try {
                    reconstructShares(group, id);
                    resolve(`Resharing ${id} (${group})`);
                } catch (error) {
                    reject(error);
                }
            }).catch(error => reject(error))
        }

    })
}

function discardSink(id) {
    return new Promise((resolve, reject) => {
        if (!floCrypto.validateAddr(id))
            return reject(INVALID(eCode.INVALID_VALUE, `Invalid ID ${id}`));
        else if (!keys.sink_chest.find_group(id))
            return reject(INVALID(eCode.NOT_FOUND, `ID ${id} not found`));
        else keys.checkIfDiscarded(id).then(result => {
            if (result)
                return reject(INVALID(eCode.DUPLICATE_ENTRY, `ID already discarded`));
            keys.discardSink(id).then(result => {
                console.debug("Discarded sink:", id);
                resolve(result);
            }).catch(error => reject(error))
        }).catch(error => reject(error))
    })
}

function checkForDiscardedSinks() {
    let cur_time = Date.now(),
        all_sinks = keys.sink_chest.get_all();
    for (let group in all_sinks)
        all_sinks[group].forEach(id => keys.checkIfDiscarded(id).then(result => {
            console.debug(group, id);   //Check if group is correctly mapped, or if its changed by loop
            if (result != false) {
                if (cur_time - result > DISCARD_COOLDOWN)
                    keys.sink_chest.rm_id(group, id);
                else
                    keys.sink_chest.set_id(group, id, null);
                if (id in shares_collected && !discarded_sinks.includes(id))
                    discarded_sinks.push(id);
            }
        }).catch(error => console.debug(error)))
}

//Master interval process
function intervalProcess() {
    checkForDiscardedSinks();
}

intervalProcess.start = () => {
    intervalProcess.stop();
    intervalProcess.instance = setInterval(intervalProcess, BACKUP_INTERVAL);
}

intervalProcess.stop = () => {
    if (intervalProcess.instance !== undefined) {
        clearInterval(intervalProcess.instance);
        delete intervalProcess.instance;
    }
}

//Node becomes master
function serveAsMaster(init) {
    console.info('Starting master process');
    slave.stop();
    _mode = MASTER_MODE;
    keys.sink_chest.reset();
    intervalProcess.start();
    informLiveNodes(init);
    _app.resume();
}

//Node becomes slave
function serveAsSlave(ws, init) {
    console.info('Starting slave process');
    intervalProcess.stop();
    _app.pause();
    slave.start(ws, init);
    _mode = SLAVE_MODE;
}

//Transmistter
function startBackupTransmitter(server) {
    _wss = new WebSocket.Server({
        server
    });
    _wss.on('connection', ws => {
        ws.on('message', message => {
            //verify if from a backup node
            try {
                let invalid = null,
                    request = JSON.parse(message);
                //console.debug(request);
                if (!nodeList.includes(request.floID))
                    invalid = `floID ${request.floID} not in nodeList`;
                else if (request.floID !== floCrypto.getFloID(request.pubKey))
                    invalid = "Invalid pubKey";
                else if (!floCrypto.verifySign(request.type + "|" + request.req_time, request.sign, request.pubKey))
                    invalid = "Invalid signature";
                //TODO: check if request time is valid;
                else switch (request.type) {
                    case "BACKUP_SYNC":
                        sync.sendBackupData(request.last_time, request.checksum, ws);
                        break;
                    case "HASH_SYNC":
                        sync.sendTableHash(request.tables, ws);
                        break;
                    case "RE_SYNC":
                        sync.sendTableData(request.tables, ws);
                        break;
                    case "UPDATE_MASTER":
                        updateMaster(request.floID);
                        break;
                    case "SLAVE_CONNECT":
                        slaveConnect(request.floID, request.pubKey, ws, request.sinks);
                        break;
                    case "SINK_SHARE":
                        collectShares(request.sinkID, request.ref, floCrypto.decryptData(request.share, keys.node_priv))
                    default:
                        invalid = "Invalid Request Type";
                }
                if (invalid)
                    ws.send(JSON.stringify({
                        type: request.type,
                        command: "REQUEST_ERROR",
                        error: invalid
                    }));
            } catch (error) {
                console.error(error);
                ws.send(JSON.stringify({
                    command: "REQUEST_ERROR",
                    error: 'Unable to process the request!'
                }));
            }
        });
        ws.on('close', () => {
            // remove from connected slaves (if needed)
            if (ws.floID in connectedSlaves)
                delete connectedSlaves[ws.floID];
        })
    });
}

function initProcess(app) {
    _app = app;
    startBackupTransmitter(_app.server);
    connectToMaster(0, true);
}

module.exports = {
    init: initProcess,
    collectAndCall,
    reconstructAllActiveShares,
    sink: {
        generate: generateSink,
        reshare: reshareSink,
        discard: discardSink
    },
    set nodeList(list) {
        nodeURL = list;
        nodeKBucket = new K_Bucket(floGlobals.adminID, Object.keys(nodeURL));
        nodeList = nodeKBucket.order;
    },
    get nodeList() {
        return nodeList;
    },
    get wss() {
        return _wss;
    }
};