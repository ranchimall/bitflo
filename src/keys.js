'use strict';

const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');
const DB = require("./database");

var _I = ""; //Instance support
for (let arg of process.argv)
    if (/^-I=/.test(arg)) {
        _I = arg.split(/=(.*)/s)[1];
        break;
    }

const {
    SHARES_PER_NODE,
    SHARE_THRESHOLD,
    SHUFFLE_INTERVAL
} = require("./_constants")["keys"];

const PRIV_EKEY_MIN = 32,
    PRIV_EKEY_MAX = 48,
    PRIME_FILE_TYPE = 'binary',
    INDEX_FILE_TYPE = 'utf-8',
    UNSIGNED_INT_MIN = 0,
    UNSIGNED_INT_MAX = 4294967295,
    INDEX_FILE_NAME_LENGTH = 16,
    INDEX_FILE_EXT = '.txt',
    MIN_DUMMY_FILES = 16,
    MAX_DUMMY_FILES = 24,
    MIN_DUMMY_SIZE_MUL = 0.5,
    MAX_DUMMY_SIZE_MUL = 1.5,
    SIZE_FACTOR = 100,
    LOCK_RETRY_MIN_TIME = 1 * 1000,
    LOCK_RETRY_MAX_TIME = 2 * 1000;

var node_priv, e_key, node_id, node_pub; //containers for node-key wrapper
const _x = {
    get node_priv() {
        if (!node_priv || !e_key)
            throw Error("keys not set");
        return Crypto.AES.decrypt(node_priv, e_key);
    },
    set node_priv(key) {
        node_pub = floCrypto.getPubKeyHex(key);
        node_id = floCrypto.getFloID(node_pub);
        if (!key || !node_pub || !node_id)
            throw Error("Invalid Keys");
        let n = floCrypto.randInt(PRIV_EKEY_MIN, PRIV_EKEY_MAX)
        e_key = floCrypto.randString(n);
        node_priv = Crypto.AES.encrypt(key, e_key);
    },
    args_dir: path.resolve(__dirname, '..', 'args'),
    get index_dir() {
        return path.join(this.args_dir, `indexes${_I}`)
    },
    get prime_file() {
        return path.join(this.args_dir, `prime_index${_I}.b`)
    },
    get index_file() {
        try {
            let data = fs.readFileSync(this.prime_file, PRIME_FILE_TYPE),
                fname = Crypto.AES.decrypt(data, this.node_priv);
            return path.join(this.index_dir, fname + INDEX_FILE_EXT);
        } catch (error) {
            console.debug(error);
            throw Error("Prime-Index Missing/Corrupted");
        }
    }
}

function initialize() {
    return new Promise((resolve, reject) => {
        fs.readFile(_x.prime_file, PRIME_FILE_TYPE, (err, res) => {
            var data, cur_filename, new_filename, priv_key;
            try {
                priv_key = _x.node_priv;
            } catch (error) {
                return reject(error);
            }
            if (!err) {
                if (res.length) { //prime file not empty
                    try {
                        cur_filename = Crypto.AES.decrypt(res, priv_key);
                    } catch (error) {
                        console.debug(error);
                        return reject("Prime file corrupted");
                    } try { //read data from index file
                        let tmp = fs.readFileSync(path.join(_x.index_dir, cur_filename + INDEX_FILE_EXT), INDEX_FILE_TYPE);
                        tmp = Crypto.AES.decrypt(tmp, priv_key);
                        JSON.parse(tmp); //check if data is JSON parse-able
                        data = tmp;
                    } catch (error) {
                        console.debug(error);
                        return reject("Index file corrupted");
                    }
                }
            }
            try {
                if (!fs.existsSync(_x.index_dir)) {
                    fs.mkdirSync(_x.index_dir);
                }
            } catch (error) {
                console.debug(error);
                return reject("Index directory creation failed");
            }
            try { //delete all old dummy files
                let files = fs.readdirSync(_x.index_dir);
                for (const file of files)
                    if (!cur_filename || file !== cur_filename + INDEX_FILE_EXT)    //check if file is current file
                        fs.unlinkSync(path.join(_x.index_dir, file));
            } catch (error) {
                console.debug(error);
                return reject("Clear index directory failed");
            } try { //create files (dummy and new index file)
                let N = floCrypto.randInt(MIN_DUMMY_FILES, MAX_DUMMY_FILES),
                    k = floCrypto.randInt(0, N);
                if (typeof data === 'undefined' || data.length == 0)  //no existing data, initialize
                    data = JSON.stringify({});
                let data_size = data.length;
                for (let i = 0; i <= N; i++) {
                    let f_data, f_name = floCrypto.randString(INDEX_FILE_NAME_LENGTH);
                    if (i == k) {
                        new_filename = f_name;
                        f_data = data;
                    } else {
                        let d_size = data_size * (floCrypto.randInt(MIN_DUMMY_SIZE_MUL * SIZE_FACTOR, MAX_DUMMY_SIZE_MUL * SIZE_FACTOR) / SIZE_FACTOR);
                        f_data = floCrypto.randString(d_size, false);
                    }
                    f_data = Crypto.AES.encrypt(f_data, priv_key);
                    fs.writeFileSync(path.join(_x.index_dir, f_name + INDEX_FILE_EXT), f_data, INDEX_FILE_TYPE);
                }
            } catch (error) {
                console.debug(error);
                return reject("Index file creation failed");
            } try { //update prime file
                let en_filename = Crypto.AES.encrypt(new_filename, priv_key);
                fs.writeFileSync(_x.prime_file, en_filename, PRIME_FILE_TYPE);
            } catch (error) {
                console.debug(error);
                return reject("Update prime file failed");
            }
            if (cur_filename)
                fs.unlink(path.join(_x.index_dir, cur_filename + INDEX_FILE_EXT), err => err ? console.debug(err) : null);
            shuffle.interval = setInterval(shuffle, SHUFFLE_INTERVAL);
            resolve("Key management initiated");
        })
    })
}

function shuffle() {
    readIndexFile().then(data => {
        let new_filename, cur_filename = Crypto.AES.decrypt(fs.readFileSync(_x.prime_file, PRIME_FILE_TYPE), _x.node_priv);
        fs.readdir(_x.index_dir, (err, files) => {
            if (err)
                return console.error(err);
            data = JSON.stringify(data);
            let data_size = data.length;
            for (let file of files) {
                let f_data, f_name = floCrypto.randString(INDEX_FILE_NAME_LENGTH);
                if (file === cur_filename + INDEX_FILE_EXT) {
                    new_filename = f_name;
                    f_data = data;
                } else {
                    let d_size = data_size * (floCrypto.randInt(MIN_DUMMY_SIZE_MUL * SIZE_FACTOR, MAX_DUMMY_SIZE_MUL * SIZE_FACTOR) / SIZE_FACTOR);
                    f_data = floCrypto.randString(d_size, false);
                }
                f_data = Crypto.AES.encrypt(f_data, _x.node_priv);
                //rename and rewrite the file
                try {
                    fs.renameSync(path.join(_x.index_dir, file), path.join(_x.index_dir, f_name + INDEX_FILE_EXT));
                    fs.writeFileSync(path.join(_x.index_dir, f_name + INDEX_FILE_EXT), f_data, INDEX_FILE_TYPE);
                } catch (error) {
                    console.error(error)
                }
            }
            //update prime file
            if (!new_filename)
                return console.error("Index file has not been renamed");
            let en_filename = Crypto.AES.encrypt(new_filename, _x.node_priv);
            try {
                fs.writeFileSync(_x.prime_file, en_filename, PRIME_FILE_TYPE);
            } catch (error) {
                console.error(error);
            }
        })
    }).catch(error => console.error(error))
}

function readIndexFile() {
    return new Promise((resolve, reject) => {
        fs.readFile(_x.index_file, INDEX_FILE_TYPE, (err, data) => {
            if (err) {
                console.debug(err);
                return reject('Unable to read Index file');
            }
            try {
                data = JSON.parse(Crypto.AES.decrypt(data, _x.node_priv));
                resolve(data);
            } catch {
                reject("Index file corrupted");
            }
        })
    })
}

function writeIndexFile(data) {
    return new Promise((resolve, reject) => {
        let en_data = Crypto.AES.encrypt(JSON.stringify(data), _x.node_priv);
        fs.writeFile(_x.index_file, en_data, INDEX_FILE_TYPE, (err) => {
            if (err) {
                console.debug(err);
                return reject('Unable to write Index file');
            } else resolve("Updated Index file");
        })
    })
}

function getShares(group, id, ignoreDiscarded = true) {
    return new Promise((resolve, reject) => {
        checkIfDiscarded(id).then(result => {
            if (ignoreDiscarded && result != false)
                return reject("Trying to get share for discarded ID");
            readIndexFile().then(data => {
                if (!(group in data))
                    reject("Group not found in Index file");
                else if (!(id in data[group]))
                    reject("ID not found in Index file");
                else {
                    let ref = data[group][id].shift();
                    DB.query("SELECT share FROM sinkShares WHERE num IN (?)", [data[group][id]])
                        .then(result => resolve({ ref, shares: result.map(r => Crypto.AES.decrypt(r.share, _x.node_priv)) }))
                        .catch(error => reject(error))
                }
            }).catch(error => reject(error))
        }).catch(error => reject(error))
    })
}

function storeShareAtRandom(share) {
    return new Promise((resolve, reject) => {
        let rand = floCrypto.randInt(UNSIGNED_INT_MIN, UNSIGNED_INT_MAX);
        DB.query("INSERT INTO sinkShares(num, share) VALUE (?)", [[rand, share]])
            .then(result => resolve(result.insertId)).catch(error => {
                if (error.code === "ER_DUP_ENTRY")
                    storeShareAtRandom(share) //try again (with diff rand_num)
                        .then(result => resolve(result))
                        .catch(error => reject(error))
                else
                    reject(error);
            })
    })
}

function addShare(group, id, ref, share) {
    return new Promise((resolve, reject) => {
        checkIfDiscarded(id).then(result => {
            if (result != false)
                return reject("Trying to store share for discarded ID");
            lockfile.lock(_x.index_file, { retries: { forever: true, minTimeout: LOCK_RETRY_MIN_TIME, maxTimeout: LOCK_RETRY_MAX_TIME } }).then(release => {
                const releaseAndReject = err => {
                    release().then(_ => null).catch(error => console.error(error));
                    reject(err);
                }
                readIndexFile().then(data => {
                    if (!(group in data))
                        data[group] = {};
                    if (!(id in data[group]))
                        data[group][id] = [ref];
                    else if (ref < data[group][id][0])
                        return reject("reference is lower than current");
                    else if (ref > data[group][id][0]) {
                        let old_shares = data[group][id];
                        data[group][id] = [ref];
                        old_shares.shift();
                        DB.query("DELETE FROM sinkShares WHERE num in (?)", [old_shares])//delete old shares
                            .then(_ => null).catch(error => console.error(error));
                    }
                    let encrypted_share = Crypto.AES.encrypt(share, _x.node_priv);
                    console.debug(ref, '|sinkID:', id, '|EnShare:', encrypted_share);
                    storeShareAtRandom(encrypted_share).then(i => {
                        data[group][id].push(i);
                        writeIndexFile(data).then(_ => resolve(i)).catch(error => reject(error))
                            .finally(_ => release().then(_ => null).catch(error => console.error(error)));
                    }).catch(error => releaseAndReject(error))
                }).catch(error => releaseAndReject(error))
            }).catch(error => reject(error))
        }).catch(error => reject(error))
    })
}

function generateShares(sinkKey, total_n, min_n) {
    let shares = floCrypto.createShamirsSecretShares(sinkKey, total_n * SHARES_PER_NODE, min_n * SHARES_PER_NODE * SHARE_THRESHOLD);
    let node_shares = Array(total_n);
    for (let i = 0; i < total_n; i++)
        node_shares[i] = shares.splice(0, SHARES_PER_NODE);
    return node_shares;
}

function getStoredList(group = null) {
    return new Promise((resolve, reject) => {
        readIndexFile().then(data => {
            if (group !== null) {
                if (group in data)
                    resolve(Object.keys(data.group));
                else
                    reject("Group not found in Index file");
            } else {
                let ids = {};
                for (let group in data)
                    ids[group] = Object.keys(data[group]);
                resolve(ids);
            }
        }).catch(error => reject(error))
    })
}

function getDiscardedList() {
    return new Promise((resolve, reject) => {
        DB.query("SELECT floID, discard_time FROM discardedSinks")
            .then(result => resolve(Object.fromEntries(result.map(r => [r.floID, r.discard_time]))))
            .catch(error => reject(error))
    })
}

function checkIfDiscarded(id) {
    return new Promise((resolve, reject) => {
        DB.query("SELECT discard_time FROM discardedSinks WHERE floID=?", [id])
            .then(result => resolve(result.length ? result[0].discard_time : false))
            .catch(error => reject(error))
    })
}

function discardSink(id) {
    return new Promise((resolve, reject) => {
        DB.query("INSERT INTO discardedSinks(floID) VALUE (?)", [id])
            .then(result => resolve(`Discarded ${id}`))
            .catch(error => reject(error))
    })
}

//Sink groups and chest
const sink_groups = {
    get TRADE() { return "TRADE" },
    get list() { //total list
        return [this.TRADE]
    },
    get initial_list() { //list to generate when starting server
        return [this.TRADE]
    },
    get generate_list() { //list allowed to generate 
        return [this.TRADE]
    }
};

const sink_ids = {}, sink_chest = {
    reset() {
        for (let i in sink_ids)
            delete sink_ids[i];
    },
    set_id(group, id, value) {
        if (!(group in sink_ids))
            sink_ids[group] = {};
        sink_ids[group][id] = value;
    },
    rm_id(group, id) {
        return delete sink_ids[group][id];
    },
    get_id(group, id) {
        return sink_ids[group][id];
    },
    list(group) {
        return Object.keys(sink_ids[group] || {});
    },
    active_list(group) {
        let ids = [];
        if (group in sink_ids)
            for (let id in sink_ids[group])
                if (sink_ids[group][id])
                    ids.push(id);
        return ids;
    },
    includes(group, id) {
        return group in sink_ids ? (id in sink_ids[group]) : null;
    },
    isActive(group, id) {
        return group in sink_ids ? (id in sink_ids && sink_ids[id]) : null;
    },
    pick(group) {
        let ids = this.list(group),
            i = floCrypto.randInt(0, ids.length - 1);
        return ids[i];
    },
    active_pick(group) {
        let ids = this.active_list(group),
            i = floCrypto.randInt(0, ids.length - 1);
        return ids[i];
    },
    find_group(id) {
        let group = null;
        for (let g in sink_ids)
            if (id in sink_ids[g]) {
                group = g; break;
            }
        return group;
    },
    get_all() {
        let ids = {};
        for (let g in sink_ids)
            ids[g] = Object.keys(sink_ids[g])
        return ids;
    }
};

//Asset list
var assetList, currency, tradeList; //container for allowed assets, currency and trade asset
const assets = {
    set_list(assets) {
        if (Array.isArray(assets))
            assetList = assets;
    },
    get list() { return Array.from(assetList) },
    includes(asset) { return assetList.includes(asset) },
    set_currency(c) { currency = c },
    get currency() { return currency },
    isCurrency(asset) { return asset === currency },
    set_tradeable(assets) {
        if (Array.isArray(assets))
            tradeList = assets;
    },
    get tradeList() { return Array.from(tradeList) },
    isTradeable(asset) { return tradeList.includes(asset) }
}

module.exports = {
    init: initialize,
    getShares,
    addShare,
    generateShares,
    getStoredList,
    getDiscardedList,
    checkIfDiscarded,
    discardSink,
    set node_priv(key) {
        _x.node_priv = key;
    },
    get node_priv() {
        return _x.node_priv;
    },
    get node_id() {
        return node_id;
    },
    get node_pub() {
        return node_pub;
    },
    get sink_groups() {
        return sink_groups;
    },
    get sink_chest() {
        return sink_chest;
    },
    get assets() {
        return assets;
    }
}