'use strict';

const pCode = require('../docs/scripts/floTradeAPI').processCode;
const { collectAndCall } = require('./backup/head');
const keys = require('./keys');
const DB = require("./database");

const TYPE_VAULT = "VAULT"

const SINK_GROUP = {
    [TYPE_VAULT]: keys.sink_groups.TRADE
}

const balance_locked = {},
    balance_cache = {},
    callbackCollection = {
        [TYPE_VAULT]: {}
    };

function getBalance(sinkID, asset) {
    switch (asset) {
        case "FLO":
            return floBlockchainAPI.getBalance(sinkID);
        case "BTC":
            let btc_id = btcOperator.convert.legacy2bech(sinkID);
            return btcOperator.getBalance(btc_id);
        default:
            return floTokenAPI.getBalance(sinkID, asset);
    }
}

function getSinkID(type, quantity, asset, sinkList = null) {
    return new Promise((resolve, reject) => {
        if (!sinkList)
            sinkList = keys.sink_chest.list(SINK_GROUP[type]).map(s => [s, s in balance_cache ? balance_cache[s][asset] || 0 : 0]) //TODO: improve sorting
                .sort((a, b) => b[1] - a[1]).map(x => x[0]);
        if (!sinkList.length)
            return reject(`Insufficient balance for asset(${asset}) in chest(${SINK_GROUP[type]})`);
        let sinkID = sinkList.shift();
        getBalance(sinkID, asset).then(balance => {
            if (!(sinkID in balance_cache))
                balance_cache[sinkID] = {};
            balance_cache[sinkID][asset] = balance;
            if (balance > (quantity + (sinkID in balance_locked ? balance_locked[sinkID][asset] || 0 : 0)))
                return resolve(sinkID);
            else
                getSinkID(type, quantity, asset, sinkList)
                    .then(result => resolve(result))
                    .catch(error => reject(error))
        }).catch(error => {
            console.error(error);
            getSinkID(type, quantity, asset, sinkList)
                .then(result => resolve(result))
                .catch(error => reject(error))
        });
    })
}

const WITHDRAWAL_MESSAGE = {
    [TYPE_VAULT]: "(withdrawal from market)"
}

function sendTx(floID, asset, quantity, sinkID, sinkKey, message) {
    switch (asset) {
        case "FLO":
            return floBlockchainAPI.sendTx(sinkID, floID, quantity, sinkKey, message);
        case "BTC":
            let btc_sinkID = btcOperator.convert.legacy2bech(sinkID),
                btc_receiver = btcOperator.convert.legacy2bech(floID);
            return btcOperator.sendTx(btc_sinkID, sinkKey, btc_receiver, quantity, null, { fee_from_receiver: true });
        default:
            return floTokenAPI.sendToken(sinkKey, quantity, floID, message, asset);
    }
}

const updateSyntax = {
    [TYPE_VAULT]: "UPDATE VaultTransactions SET r_status=?, txid=? WHERE id=?"
};

function sendAsset(floID, asset, quantity, type, id) {
    quantity = global.toStandardDecimal(quantity);
    getSinkID(type, quantity, asset).then(sinkID => {
        let callback = (sinkKey) => {
            //Send asset to user via API
            sendTx(floID, asset, quantity, sinkID, sinkKey, WITHDRAWAL_MESSAGE[type]).then(txid => {
                if (!txid)
                    console.error("Transaction not successful");
                else //Transaction was successful, Add in database
                    DB.query(updateSyntax[type], [pCode.STATUS_CONFIRMATION, txid, id])
                        .then(_ => null).catch(error => console.error(error));
            }).catch(error => console.error(error)).finally(_ => {
                delete callbackCollection[type][id];
                balance_locked[sinkID][asset] -= quantity;
            });
        }
        collectAndCall(sinkID, callback); //TODO: add timeout to prevent infinite wait
        callbackCollection[type][id] = callback;
        if (!(sinkID in balance_locked))
            balance_locked[sinkID] = {};
        balance_locked[sinkID][asset] = (balance_locked[sinkID][asset] || 0) + quantity;
    }).catch(error => console.error(error))
}

function withdrawAsset_init(floID, asset, amount) {
    amount = global.toStandardDecimal(amount);
    let asset_type = ["FLO", "BTC"].includes(asset) ? pCode.ASSET_TYPE_COIN : pCode.ASSET_TYPE_TOKEN;
    DB.query("INSERT INTO VaultTransactions (floID, mode, asset_type, asset, amount, r_status) VALUES (?)", [[floID, pCode.VAULT_MODE_WITHDRAW, asset_type, asset, amount, pCode.STATUS_PENDING]])
        .then(result => sendAsset(floID, asset, amount, TYPE_VAULT, result.insertId))
        .catch(error => console.error(error))
}

function withdrawAsset_retry(floID, asset, amount, id) {
    if (id in callbackCollection[TYPE_VAULT])
        console.debug("A callback is already pending for this Coin transfer");
    else sendAsset(floID, asset, amount, TYPE_VAULT, id);
}

module.exports = {
    withdrawAsset: {
        init: withdrawAsset_init,
        retry: withdrawAsset_retry
    }
}