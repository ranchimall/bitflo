'use strict';
global.floGlobals = require('../docs/scripts/floGlobals');
require('./set_globals');
require('../docs/scripts/lib');
global.floCrypto = require('../docs/scripts/floCrypto');
global.floBlockchainAPI = require('../docs/scripts/floBlockchainAPI');
global.floTokenAPI = require('../docs/scripts/floTokenAPI');
global.btcOperator = require('../docs/scripts/btcOperator');

const keys = require('./keys');
const DB = require("./database");
const App = require('./app');

const backup = require('./backup/head');

const {
    BLOCKCHAIN_REFRESH_INTERVAL
} = require("./_constants")["app"];

(function () {
    const { adminID, application, currency } = require("../docs/scripts/floTradeAPI");
    floGlobals.adminID = adminID;
    floGlobals.application = application;
    keys.assets.set_currency(currency);
})();

var app;

function refreshData(startup = false) {
    return new Promise((resolve, reject) => {
        refreshDataFromBlockchain().then(changes => {
            loadDataFromDB(changes, startup).then(_ => {
                if (!startup && changes.nodes)
                    backup.reconstructAllActiveShares();
                //app.refreshData(backup.nodeList);
                resolve("Data refresh successful")
            }).catch(error => reject(error))
        }).catch(error => reject(error))
    })
}

function refreshDataFromBlockchain() {
    return new Promise((resolve, reject) => {
        DB.query("SELECT txid FROM LastTx WHERE floID=?", [floGlobals.adminID]).then(result => {
            var query_options = { sentOnly: true, pattern: floGlobals.application };

            let lastTx = result.length ? result[0].txid : undefined;
            if (typeof lastTx == 'string' && /^[0-9a-f]{64}/i.test(lastTx))//lastTx is txid of last tx
                query_options.after = lastTx;
            else if (!isNaN(lastTx))//lastTx is tx count (*backward support)
                query_options.ignoreOld = parseInt(lastTx);

            floBlockchainAPI.readData(floGlobals.adminID, query_options).then(result => {
                let promises = [],
                    nodes_change = false,
                    assets_change = false;
                result.data.reverse().forEach(data => {
                    var content = JSON.parse(data)[floGlobals.application];
                    //Node List
                    if (content.Nodes) {
                        nodes_change = true;
                        if (content.Nodes.remove)
                            for (let n of content.Nodes.remove)
                                promises.push(DB.query("DELETE FROM NodeList WHERE floID=?", [n]));
                        if (content.Nodes.add)
                            for (let n in content.Nodes.add)
                                promises.push(DB.query("INSERT INTO NodeList (floID, uri) VALUE (?) ON DUPLICATE KEY UPDATE uri=?", [[n, content.Nodes.add[n]], content.Nodes.add[n]]));
                        if (content.Nodes.update)
                            for (let n in content.Nodes.update)
                                promises.push(DB.query("UPDATE NodeList SET uri=? WHERE floID=?", [content.Nodes.update[n], n]));
                    }
                    //Asset List
                    if (content.Assets) {
                        assets_change = true;
                        for (let a in content.Assets)
                            promises.push(DB.query("INSERT INTO AssetList (asset, isTradeable) VALUE (?) ON DUPLICATE KEY UPDATE isTradeable=?", [[a, content.Assets[a]], content.Assets[a]]));
                    }
                });
                promises.push(DB.query("INSERT INTO LastTx (floID, txid) VALUE (?) ON DUPLICATE KEY UPDATE txid=?", [[floGlobals.adminID, result.lastItem], result.lastItem]));
                //Check if all save process were successful
                Promise.allSettled(promises).then(results => {
                    //console.debug(results.filter(r => r.status === "rejected"));
                    if (results.reduce((a, r) => r.status === "rejected" ? ++a : a, 0))
                        console.warn("Some blockchain data might not have been saved in database correctly");
                    resolve({
                        nodes: nodes_change,
                        assets: assets_change
                    });
                });
            }).catch(error => reject(error));
        }).catch(error => reject(error))
    })
}

function loadDataFromDB(changes, startup) {
    return new Promise((resolve, reject) => {
        let promises = [];
        if (startup || changes.nodes)
            promises.push(loadDataFromDB.nodeList());
        if (startup || changes.assets)
            promises.push(loadDataFromDB.assetList());
        Promise.all(promises)
            .then(_ => resolve("Data load successful"))
            .catch(error => reject(error))
    })
}

loadDataFromDB.nodeList = function () {
    return new Promise((resolve, reject) => {
        DB.query("SELECT floID, uri FROM NodeList").then(result => {
            let nodes = {}
            for (let i in result)
                nodes[result[i].floID] = result[i].uri;
            //update dependents
            backup.nodeList = nodes;
            resolve(nodes);
        }).catch(error => reject(error))
    })
}

loadDataFromDB.assetList = function () {
    return new Promise((resolve, reject) => {
        DB.query("SELECT asset, isTradeable FROM AssetList").then(result => {
            let assets = [], tradeAssets = [];
            for (let i in result) {
                assets.push(result[i].asset);
                if (result[i].isTradeable)
                    tradeAssets.push(result[i].asset);
            }
            //update dependents
            keys.assets.set_list(assets);
            keys.assets.set_tradeable(tradeAssets);
            resolve(assets);
        }).catch(error => reject(error))
    })
}

module.exports = function startServer() {
    let _pass, _I = "";
    for (let arg of process.argv) {
        if (/^-I=/.test(arg))
            _I = arg.split(/=(.*)/s)[1];
        else if (/^-password=/i.test(arg))
            _pass = arg.split(/=(.*)/s)[1];
    }
    const config = require(`../args/config${_I}.json`);
    try {
        let _tmp = require(`../args/keys${_I}.json`);
        _tmp = floCrypto.retrieveShamirSecret(_tmp);
        if (!_pass) {
            console.error('Password not entered!');
            process.exit(1);
        }
        keys.node_priv = Crypto.AES.decrypt(_tmp, _pass);
    } catch (error) {
        console.error('Unable to load private key!');
        process.exit(1);
    }

    console.log("Logged in as", keys.node_id);

    DB.connect(config["sql_user"], config["sql_pwd"], config["sql_db"], config["sql_host"]).then(result => {
        keys.init().then(result => {
            console.log(result);
            app = new App(config['secret']);
            refreshData(true).then(_ => {
                app.start(config['port']).then(result => {
                    console.log(result);
                    backup.init(app);
                    setInterval(() => {
                        refreshData()
                            .then(result => console.log(result))
                            .catch(error => console.error(error))
                    }, BLOCKCHAIN_REFRESH_INTERVAL);
                }).catch(error => console.error(error))
            }).catch(error => console.error(error))
        }).catch(error => console.error(error))
    }).catch(error => console.error(error));
};