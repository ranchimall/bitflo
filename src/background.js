'use strict';

const keys = require('./keys');
const blockchain = require('./blockchain');
const pCode = require('../docs/scripts/floTradeAPI').processCode;
const DB = require("./database");
const coupling = require('./coupling');
const price = require('./price');

const {
    PERIOD_INTERVAL,
    REQUEST_TIMEOUT
} = require('./_constants')['background'];

var updateBalance; // container for updateBalance function

const verifyTx = {};

function confirmDepositFLO() {
    DB.query("SELECT id, floID, txid FROM VaultTransactions WHERE mode=? AND asset=? AND asset_type=? AND r_status=?", [pCode.VAULT_MODE_DEPOSIT, "FLO", pCode.ASSET_TYPE_COIN, pCode.STATUS_PENDING]).then(results => {
        results.forEach(r => {
            verifyTx.FLO(r.floID, r.txid, keys.sink_groups.TRADE).then(amount => {
                var txQueries = [];
                txQueries.push(updateBalance.add(r.floID, "FLO", amount));
                txQueries.push(["UPDATE VaultTransactions SET r_status=?, amount=? WHERE id=?", [pCode.STATUS_SUCCESS, amount, r.id]]);
                DB.transaction(txQueries)
                    .then(result => console.info("FLO deposited:", r.floID, amount))
                    .catch(error => console.error(error))
            }).catch(error => {
                console.error(error);
                if (error[0])
                    DB.query("UPDATE VaultTransactions SET r_status=? WHERE id=?", [pCode.STATUS_REJECTED, r.id])
                        .then(_ => null).catch(error => console.error(error));
            });
        })
    }).catch(error => console.error(error))
}

verifyTx.FLO = function (sender, txid, group) {
    return new Promise((resolve, reject) => {
        floBlockchainAPI.getTx(txid).then(tx => {
            let vin_sender = tx.vin.filter(v => v.addr === sender)
            if (!vin_sender.length)
                return reject([true, "Transaction not sent by the sender"]);
            if (vin_sender.length !== tx.vin.length)
                return reject([true, "Transaction input containes other floIDs"]);
            if (!tx.blockheight)
                return reject([false, "Transaction not included in any block yet"]);
            if (!tx.confirmations)
                return reject([false, "Transaction not confirmed yet"]);
            let amount = tx.vout.reduce((a, v) => keys.sink_chest.includes(group, v.scriptPubKey.addresses[0]) ? a + v.value : a, 0);
            if (amount == 0)
                return reject([true, "Transaction receiver is not market ID"]); //Maybe reject as false? (to compensate delay in chestsList loading from other nodes)
            else
                resolve(amount);
        }).catch(error => reject([false, error]))
    })
}

function confirmDepositBTC() {
    DB.query("SELECT id, floID, txid FROM VaultTransactions WHERE mode=? AND asset=? AND asset_type=? AND r_status=?", [pCode.VAULT_MODE_DEPOSIT, "BTC", pCode.ASSET_TYPE_COIN, pCode.STATUS_PENDING]).then(results => {
        results.forEach(r => {
            verifyTx.BTC(r.floID, r.txid, keys.sink_groups.TRADE).then(amount => {
                var txQueries = [];
                txQueries.push(updateBalance.add(r.floID, "BTC", amount));
                txQueries.push(["UPDATE VaultTransactions SET r_status=?, amount=? WHERE id=?", [pCode.STATUS_SUCCESS, amount, r.id]]);
                DB.transaction(txQueries)
                    .then(result => console.info("BTC deposited:", r.floID, amount))
                    .catch(error => console.error(error))
            }).catch(error => {
                console.error(error);
                if (error[0])
                    DB.query("UPDATE VaultTransactions SET r_status=? WHERE id=?", [pCode.STATUS_REJECTED, r.id])
                        .then(_ => null).catch(error => console.error(error));
            });
        })
    }).catch(error => console.error(error))
}

verifyTx.BTC = function (sender, txid, group) {
    return new Promise((resolve, reject) => {
        btcOperator.getTx(txid).then(tx => {
            let vin_sender = tx.inputs.filter(v => floCrypto.isSameAddr(v.address, sender))
            if (!vin_sender.length)
                return reject([true, "Transaction not sent by the sender"]);
            if (vin_sender.length !== tx.inputs.length)
                return reject([true, "Transaction input containes other floIDs"]);
            if (!tx.block)
                return reject([false, "Transaction not included in any block yet"]);
            if (!tx.confirmations)
                return reject([false, "Transaction not confirmed yet"]);
            let amount = tx.outputs.reduce((a, v) =>
                keys.sink_chest.includes(group, floCrypto.toFloID(v.address, { bech: [coinjs.bech32.version] })) ? a + parseFloat(v.value) : a, 0);
            if (amount == 0)
                return reject([true, "Transaction receiver is not market ID"]); //Maybe reject as false? (to compensate delay in chestsList loading from other nodes)
            else
                resolve(amount);
        }).catch(error => reject([false, error]))
    })
}

/*
function confirmDepositToken() {
    DB.query("SELECT id, floID, txid FROM VaultTransactions WHERE mode=? AND asset_type=? AND r_status=?", [pCode.VAULT_MODE_DEPOSIT, pCode.ASSET_TYPE_TOKEN, pCode.STATUS_PENDING]).then(results => {
        results.forEach(r => {
            verifyTx.token(r.floID, r.txid, keys.sink_groups.TRADE).then(({ token, amount, flo_amount }) => {
                DB.query("SELECT id FROM VaultTransactions where floID=? AND mode=? AND asset=? AND asset_type=? AND txid=?", [r.floID, pCode.VAULT_MODE_DEPOSIT, "FLO", pCode.ASSET_TYPE_COIN, r.txid]).then(result => {
                    let txQueries = [];
                    //Add the FLO balance if necessary
                    if (!result.length) {
                        txQueries.push(updateBalance.add(r.floID, "FLO", flo_amount));
                        txQueries.push(["INSERT INTO VaultTransactions(txid, floID, mode, asset_type, asset, amount, r_status) VALUES (?)", [[r.txid, r.floID, pCode.VAULT_MODE_DEPOSIT, pCode.ASSET_TYPE_COIN, "FLO", flo_amount, pCode.STATUS_SUCCESS]]]);
                    }
                    txQueries.push(["UPDATE VaultTransactions SET r_status=?, asset=?, amount=? WHERE id=?", [pCode.STATUS_SUCCESS, token, amount, r.id]]);
                    txQueries.push(updateBalance.add(r.floID, token, amount));
                    DB.transaction(txQueries)
                        .then(result => console.info("Token deposited:", r.floID, token, amount))
                        .catch(error => console.error(error));
                }).catch(error => console.error(error));
            }).catch(error => {
                console.error(error);
                if (error[0])
                    DB.query("UPDATE VaultTransactions SET r_status=? WHERE id=?", [pCode.STATUS_REJECTED, r.id])
                        .then(_ => null).catch(error => console.error(error));
            });
        })
    }).catch(error => console.error(error))
}

verifyTx.token = function (sender, txid, group, currencyOnly = false) {
    return new Promise((resolve, reject) => {
        floTokenAPI.getTx(txid).then(tx => {
            if (tx.parsedFloData.type !== "transfer")
                return reject([true, "Transaction type not 'transfer'"]);
            else if (tx.parsedFloData.transferType !== "token")
                return reject([true, "Transaction transfer is not 'token'"]);
            var token = tx.parsedFloData.tokenIdentification,
                amount = tx.parsedFloData.tokenAmount;
            if (currencyOnly && token !== floGlobals.currency)
                return reject([true, "Token not currency"]);
            else if (!currencyOnly && ((!keys.assets.includes(token) && token !== floGlobals.currency) || token === "FLO"))
                return reject([true, "Token not authorised"]);
            let vin_sender = tx.transactionDetails.vin.filter(v => v.addr === sender)
            if (!vin_sender.length)
                return reject([true, "Transaction not sent by the sender"]);
            let flo_amount = tx.transactionDetails.vout.reduce((a, v) => keys.sink_chest.includes(group, v.scriptPubKey.addresses[0]) ? a + v.value : a, 0);
            if (flo_amount == 0)
                return reject([true, "Transaction receiver is not market ID"]); //Maybe reject as false? (to compensate delay in chestsList loading from other nodes)
            else
                resolve({ token, amount, flo_amount });
        }).catch(error => reject([false, error]))
    })
}
*/

function retryVaultWithdrawal() {
    DB.query("SELECT id, floID, asset, asset_type, amount FROM VaultTransactions WHERE mode=? AND r_status=?", [pCode.VAULT_MODE_WITHDRAW, pCode.STATUS_PENDING]).then(results => {
        results.forEach(r => {
            if (r.asset_type == pCode.ASSET_TYPE_COIN) {
                if (r.asset == "FLO" || r.asset == "BTC")
                    blockchain.withdrawAsset.retry(r.floID, r.asset, r.amount, r.id);
            } else if (r.asset_type == pCode.ASSET_TYPE_TOKEN)
                blockchain.withdrawAsset.retry(r.floID, r.asset, r.amount, r.id)
        })
    }).catch(error => console.error(error))
}

function confirmVaultWithdraw() {
    DB.query("SELECT id, floID, asset, asset_type, amount, txid FROM VaultTransactions WHERE mode=? AND r_status=?", [pCode.VAULT_MODE_WITHDRAW, pCode.STATUS_CONFIRMATION]).then(results => {
        results.forEach(r => {
            if (r.asset_type == pCode.ASSET_TYPE_COIN) {
                if (r.asset == "FLO")
                    floBlockchainAPI.getTx(r.txid).then(tx => {
                        if (!tx.blockheight || !tx.confirmations) //Still not confirmed
                            return;
                        DB.query("UPDATE VaultTransactions SET r_status=? WHERE id=?", [pCode.STATUS_SUCCESS, r.id])
                            .then(result => console.info("FLO withdrawed:", r.floID, r.amount))
                            .catch(error => console.error(error))
                    }).catch(error => console.error(error));
                else if (r.asset == "BTC")
                    btcOperator.getTx(r.txid).then(tx => {
                        if (!tx.block || !tx.confirmations) //Still not confirmed
                            return;
                        DB.query("UPDATE VaultTransactions SET r_status=? WHERE id=?", [pCode.STATUS_SUCCESS, r.id])
                            .then(result => console.info("BTC withdrawed:", r.floID, r.amount))
                            .catch(error => console.error(error))
                    }).catch(error => console.error(error));
            } else if (r.asset_type == pCode.ASSET_TYPE_TOKEN)
                floTokenAPI.getTx(r.txid).then(tx => {
                    if (!tx.transactionDetails.blockheight || !tx.transactionDetails.confirmations) //Still not confirmed
                        return;
                    DB.query("UPDATE VaultTransactions SET r_status=? WHERE id=?", [pCode.STATUS_SUCCESS, r.id])
                        .then(result => console.info("Token withdrawed:", r.floID, r.asset, r.amount))
                        .catch(error => console.error(error));
                }).catch(error => console.error(error));
        })
    }).catch(error => console.error(error));
}

//Periodic Process

function processAll() {
    //deposit-withdraw asset balance
    if (keys.sink_chest.list(keys.sink_groups.TRADE).length) {
        confirmDepositFLO();
        confirmDepositBTC();
        //confirmDepositToken();    //commented as its only BTC to FLO and vise versa for now
        retryVaultWithdrawal();
        confirmVaultWithdraw();
    }
}

var lastSyncBlockHeight = 0;

function periodicProcess() {
    floBlockchainAPI.promisedAPI('api/blocks?limit=1').then(result => {
        if (lastSyncBlockHeight < result.blocks[0].height) {
            lastSyncBlockHeight = result.blocks[0].height;
            processAll();
            console.log("Last Block :", lastSyncBlockHeight);
        }
    }).catch(error => console.error(error));
}

function periodicProcess_start() {
    periodicProcess_stop();
    periodicProcess();
    //keys.assets.tradeList.forEach(asset => coupling.initiate(asset)); //Trigger pairing only when order placed
    periodicProcess.instance = setInterval(periodicProcess, PERIOD_INTERVAL);
}

function periodicProcess_stop() {
    if (periodicProcess.instance !== undefined) {
        clearInterval(periodicProcess.instance);
        delete periodicProcess.instance;
    }
    coupling.stopAll();
}

module.exports = {
    blockchain,
    periodicProcess: {
        start: periodicProcess_start,
        stop: periodicProcess_stop
    },
    set updateBalance(f) {
        updateBalance = f;
    }
}