'use strict';

const coupling = require('./coupling');
const price = require("./price");
const background = require('./background');
const DB = require("./database");
const blockchain = require('./blockchain');
const keys = require('./keys');

const {
    TRADE_HASH_PREFIX,
    TRANSFER_HASH_PREFIX
} = require('./_constants')["market"];

const eCode = require('../docs/scripts/floTradeAPI').errorCode;
const pCode = require('../docs/scripts/floTradeAPI').processCode;

const updateBalance = background.updateBalance = coupling.updateBalance;

function login(floID, proxyKey) {
    return new Promise((resolve, reject) => {
        DB.query("INSERT INTO UserSession (floID, proxyKey) VALUE (?) ON DUPLICATE KEY UPDATE session_time=DEFAULT, proxyKey=?", [[floID, proxyKey], proxyKey])
            .then(result => resolve("Login Successful"))
            .catch(error => reject(error))
    })
}

function logout(floID) {
    return new Promise((resolve, reject) => {
        DB.query("DELETE FROM UserSession WHERE floID=?", [floID])
            .then(result => resolve("Logout successful"))
            .catch(error => reject(error))
    })
}

function getRateHistory(asset, duration) {
    return new Promise((resolve, reject) => {
        if (!asset || !keys.assets.isTradeable(asset))
            reject(INVALID(eCode.INVALID_ASSET_NAME, `Invalid asset(${asset})`));
        else
            price.getHistory(asset, duration)
                .then(result => resolve(result))
                .catch(error => reject(error))
    })
}

function getBalance(floID, asset) {
    return new Promise((resolve, reject) => {
        if (floID && !floCrypto.validateAddr(floID))
            reject(INVALID(eCode.INVALID_FLO_ID, `Invalid floID(${floID})`));
        else if (asset && !keys.assets.includes(asset))
            reject(INVALID(eCode.INVALID_ASSET_NAME, `Invalid asset(${asset})`));
        else if (!floID && !asset)
            reject(INVALID(eCode.MISSING_PARAMETER, 'Missing parameters: requires atleast one (floID, asset)'));
        else {
            var promise;
            if (floID && asset)
                promise = getBalance.floID_asset(floID, asset);
            else if (floID)
                promise = getBalance.floID(floID);
            else if (asset)
                promise = getBalance.asset(asset);
            promise.then(result => resolve(result)).catch(error => reject(error))
        }
    })
}

getBalance.floID_asset = (floID, asset) => new Promise((resolve, reject) => {
    DB.query("SELECT quantity AS balance FROM UserBalance WHERE floID=? AND asset=?", [floID, asset]).then(result => resolve({
        floID,
        asset,
        balance: result.length ? global.toStandardDecimal(result[0].balance) : 0
    })).catch(error => reject(error))
});

getBalance.floID = (floID) => new Promise((resolve, reject) => {
    DB.query("SELECT asset, quantity AS balance FROM UserBalance WHERE floID=?", [floID]).then(result => {
        let response = {
            floID,
            balance: {}
        };
        for (let row of result)
            response.balance[row.asset] = global.toStandardDecimal(row.balance);
        resolve(response);
    }).catch(error => reject(error))
});

getBalance.asset = (asset) => new Promise((resolve, reject) => {
    DB.query("SELECT floID, quantity AS balance FROM UserBalance WHERE asset=?", [asset]).then(result => {
        let response = {
            asset: asset,
            balance: {}
        };
        for (let row of result)
            response.balance[row.floID] = global.toStandardDecimal(row.balance);
        resolve(response);
    }).catch(error => reject(error))
});

const getAssetBalance = (floID, asset) => new Promise((resolve, reject) => {
    let promises = [];
    promises.push(DB.query("SELECT IFNULL(SUM(quantity), 0) AS balance FROM UserBalance WHERE floID=? AND asset=?", [floID, asset]));
    promises.push(asset === floGlobals.currency ?
        DB.query("SELECT IFNULL(SUM(quantity*maxPrice), 0) AS locked FROM BuyOrder WHERE floID=?", [floID]) :
        DB.query("SELECT IFNULL(SUM(quantity), 0) AS locked FROM SellOrder WHERE floID=? AND asset=?", [floID, asset])
    );
    Promise.all(promises).then(result => resolve({
        total: result[0][0].balance,
        locked: result[1][0].locked,
        net: result[0][0].balance - result[1][0].locked
    })).catch(error => reject(error))
});

getAssetBalance.check = (floID, asset, amount) => new Promise((resolve, reject) => {
    getAssetBalance(floID, asset).then(balance => {
        if (balance.total < amount)
            reject(INVALID(eCode.INSUFFICIENT_BALANCE, `Insufficient ${asset}`));
        else if (balance.net < amount)
            reject(INVALID(eCode.INSUFFICIENT_BALANCE, `Insufficient ${asset} (Some are locked in orders)`));
        else
            resolve(true);
    }).catch(error => reject(error))
});

function addSellOrder(floID, asset, quantity, min_price) {
    return new Promise((resolve, reject) => {
        if (!floCrypto.validateAddr(floID))
            return reject(INVALID(eCode.INVALID_FLO_ID, `Invalid floID (${floID})`));
        else if (typeof quantity !== "number" || quantity <= 0)
            return reject(INVALID(eCode.INVALID_NUMBER, `Invalid quantity (${quantity})`));
        else if (typeof min_price !== "number" || min_price <= 0)
            return reject(INVALID(eCode.INVALID_NUMBER, `Invalid min_price (${min_price})`));
        else if (!keys.assets.isTradeable(asset))
            return reject(INVALID(eCode.INVALID_ASSET_NAME, `Invalid asset (${asset})`));
        getAssetBalance.check(floID, asset, quantity).then(_ => {
            DB.query("INSERT INTO SellOrder(floID, asset, quantity, price) VALUES (?)", [[floID, asset, quantity, min_price]]).then(result => {
                resolve('Sell Order placed successfully');
                console.debug("sell order placed");
                coupling.initiate(asset);
            }).catch(error => reject(error));
        }).catch(error => reject(error));
    });
}

function addBuyOrder(floID, asset, quantity, max_price) {
    return new Promise((resolve, reject) => {
        if (!floCrypto.validateAddr(floID))
            return reject(INVALID(eCode.INVALID_FLO_ID, `Invalid floID (${floID})`));
        else if (typeof quantity !== "number" || quantity <= 0)
            return reject(INVALID(eCode.INVALID_NUMBER, `Invalid quantity (${quantity})`));
        else if (typeof max_price !== "number" || max_price <= 0)
            return reject(INVALID(eCode.INVALID_NUMBER, `Invalid max_price (${max_price})`));
        else if (!keys.assets.isTradeable(asset))
            return reject(INVALID(eCode.INVALID_ASSET_NAME, `Invalid asset (${asset})`));
        getAssetBalance.check(floID, floGlobals.currency, quantity * max_price).then(_ => {
            DB.query("INSERT INTO BuyOrder(floID, asset, quantity, maxPrice) VALUES (?)", [[floID, asset, quantity, max_price]]).then(result => {
                console.debug("before resolve")
                resolve('Buy Order placed successfully');
                console.debug("buy order placed");
                coupling.initiate(asset);
            }).catch(error => reject(error));
        }).catch(error => reject(error));
    });
}

function cancelOrder(type, id, floID) {
    return new Promise((resolve, reject) => {
        if (!floCrypto.validateAddr(floID))
            return reject(INVALID(eCode.INVALID_FLO_ID, `Invalid floID (${floID})`));
        let tableName;
        if (type === "buy")
            tableName = "BuyOrder";
        else if (type === "sell")
            tableName = "SellOrder";
        else
            return reject(INVALID(eCode.INVALID_TYPE, "Invalid Order type! Order type must be buy (or) sell"));
        DB.query("SELECT floID, asset FROM ?? WHERE id=?", [tableName, id]).then(result => {
            if (result.length < 1)
                return reject(INVALID(eCode.NOT_FOUND, "Order not found!"));
            else if (result[0].floID !== floID)
                return reject(INVALID(eCode.NOT_OWNER, "Order doesnt belong to the current user"));
            let asset = result[0].asset;
            //Delete the order 
            DB.query("DELETE FROM ?? WHERE id=?", [tableName, id]).then(result => {
                resolve(tableName + "#" + id + " cancelled successfully");
                coupling.initiate(asset);
            }).catch(error => reject(error));
        }).catch(error => reject(error));
    });
}

function getAccountDetails(floID) {
    return new Promise((resolve, reject) => {
        let promises = [
            DB.query("SELECT asset, quantity FROM UserBalance WHERE floID=?", [floID]),
            DB.query("SELECT id, asset, quantity, price, time_placed FROM SellOrder WHERE floID=?", [floID]),
            DB.query("SELECT id, asset, quantity, maxPrice, time_placed FROM BuyOrder WHERE floID=?", [floID])
        ];
        Promise.allSettled(promises).then(results => {
            let response = {
                floID: floID,
                time: Date.now()
            };
            results.forEach((a, i) => {
                if (a.status === "rejected")
                    console.error(a.reason);
                else
                    switch (i) {
                        case 0:
                            response.tokenBalance = a.value;
                            break;
                        case 1:
                            response.sellOrders = a.value;
                            break;
                        case 2:
                            response.buyOrders = a.value;
                            break;
                    }
            });
            DB.query("SELECT * FROM TradeTransactions WHERE seller=? OR buyer=?", [floID, floID])
                .then(result => response.transactions = result)
                .catch(error => console.error(error))
                .finally(_ => resolve(response));
        });
    });
}

function getUserTransacts(floID) {
    return new Promise((resolve, reject) => {
        DB.query("SELECT mode, asset, amount, txid, locktime, r_status FROM VaultTransactions WHERE floID=?", [floID])
            .then(result => resolve(result))
            .catch(error => reject(error))
    })
}

/*
function getTransactionDetails(txid) {
    return new Promise((resolve, reject) => {
        let tableName, type;
        if (txid.startsWith(TRANSFER_HASH_PREFIX)) {
            tableName = 'TransferTransactions';
            type = 'transfer';
        } else if (txid.startsWith(TRADE_HASH_PREFIX)) {
            tableName = 'TradeTransactions';
            type = 'trade';
        } else
            return reject(INVALID(eCode.INVALID_TX_ID, "Invalid TransactionID"));
        DB.query("SELECT * FROM ?? WHERE txid=?", [tableName, txid]).then(result => {
            if (result.length) {
                let details = result[0];
                details.type = type;
                if (tableName === 'TransferTransactions') //As json object is stored for receiver in transfer (to support one-to-many)
                    details.receiver = JSON.parse(details.receiver);
                resolve(details);
            } else
                reject(INVALID(eCode.NOT_FOUND, "Transaction not found"));
        }).catch(error => reject(error))
    })
}
*/

/*
function transferAsset(sender, receivers, asset) {
    return new Promise((resolve, reject) => {
        if (!floCrypto.validateAddr(sender))
            reject(INVALID(eCode.INVALID_FLO_ID, `Invalid sender (${sender})`));
        else if (!keys.assets.includes(asset))
            reject(INVALID(eCode.INVALID_ASSET_NAME, `Invalid asset (${asset})`));
        else {
            let invalidIDs = [],
                totalAmount = 0;
            for (let floID in receivers)
                if (!floCrypto.validateAddr(floID))
                    invalidIDs.push(floID);
                else
                    totalAmount += receivers[floID];
            if (invalidIDs.length)
                reject(INVALID(eCode.INVALID_FLO_ID, `Invalid receiver (${invalidIDs})`));
            else getAssetBalance.check(sender, asset, totalAmount).then(_ => {
                let txQueries = [];
                txQueries.push(updateBalance.consume(sender, asset, totalAmount));
                for (let floID in receivers)
                    txQueries.push(updateBalance.add(floID, asset, receivers[floID]));
                let time = Date.now();
                let hash = TRANSFER_HASH_PREFIX + Crypto.SHA256(JSON.stringify({
                    sender: sender,
                    receiver: receivers,
                    asset: asset,
                    totalAmount: totalAmount,
                    tx_time: time,
                }));
                txQueries.push([
                    "INSERT INTO TransferTransactions (sender, receiver, asset, totalAmount, tx_time, txid) VALUE (?)",
                    [[sender, JSON.stringify(receivers), asset, totalAmount, new Date(time), hash]]
                ]);
                DB.transaction(txQueries)
                    .then(result => resolve(hash))
                    .catch(error => reject(error))
            }).catch(error => reject(error))
        }
    })
}
*/

function depositAsset(floID, asset, txid) {
    return new Promise((resolve, reject) => {
        if (!floCrypto.validateAddr(floID))
            return reject(INVALID(eCode.INVALID_FLO_ID, `Invalid floID (${floID})`));
        else if (!keys.assets.includes(asset))
            return reject(INVALID(eCode.INVALID_ASSET_NAME, "Invalid Asset"));
        var f;
        switch (asset) {
            case "FLO": f = depositFLO(floID, txid); break;
            case "BTC": f = depositBTC(floID, txid); break;
            default: f = depositToken(floID, txid); break;
        }
        f.then(result => resolve(result)).catch(error => reject(error));
    })
}

function withdrawAsset(floID, asset, amount) {
    return new Promise((resolve, reject) => {
        if (!floCrypto.validateAddr(floID))
            return reject(INVALID(eCode.INVALID_FLO_ID, `Invalid floID (${floID})`));
        else if (!keys.assets.includes(asset))
            return reject(INVALID(eCode.INVALID_ASSET_NAME, "Invalid Asset"));
        else if (typeof amount !== "number" || amount <= 0)
            return reject(INVALID(eCode.INVALID_NUMBER, `Invalid amount (${amount})`));
        var f;
        switch (asset) {
            case "FLO": f = withdrawFLO(floID, txid); break;
            case "BTC": f = withdrawBTC(floID, txid); break;
            default: f = withdrawToken(floID, asset, txid); break;
        }
        f.then(result => resolve(result)).catch(error => reject(error));
    })
}

function depositFLO(floID, txid) {
    return new Promise((resolve, reject) => {
        DB.query("SELECT r_status FROM VaultTransactions WHERE txid=? AND floID=? AND asset=?", [txid, floID, "FLO"]).then(result => {
            if (result.length) {
                switch (result[0].r_status) {
                    case pCode.STATUS_PENDING:
                        return reject(INVALID(eCode.DUPLICATE_ENTRY, "Transaction already in process"));
                    case pCode.STATUS_REJECTED:
                        return reject(INVALID(eCode.DUPLICATE_ENTRY, "Transaction already rejected"));
                    case pCode.STATUS_SUCCESS:
                        return reject(INVALID(eCode.DUPLICATE_ENTRY, "Transaction already used to add coins"));
                }
            } else
                DB.query("INSERT INTO VaultTransactions(floID, mode, asset_type, asset, txid, r_status) VALUES (?)", [[floID, pCode.VAULT_MODE_DEPOSIT, pCode.ASSET_TYPE_COIN, "FLO", txid, pCode.STATUS_PENDING]])
                    .then(result => resolve("Deposit request in process"))
                    .catch(error => reject(error));
        }).catch(error => reject(error))
    });
}

function withdrawFLO(floID, amount) {
    return new Promise((resolve, reject) => {
        getAssetBalance.check(floID, "FLO", amount).then(_ => {
            let txQueries = [];
            txQueries.push(updateBalance.consume(floID, "FLO", amount));
            DB.transaction(txQueries).then(result => {
                blockchain.withdrawAsset.init(floID, "FLO", amount);
                resolve("Withdrawal request is in process");
            }).catch(error => reject(error));
        }).catch(error => reject(error));
    });
}

function depositBTC(floID, txid) {
    return new Promise((resolve, reject) => {
        DB.query("SELECT r_status FROM VaultTransactions WHERE txid=? AND floID=? AND asset=?", [txid, floID, "BTC"]).then(result => {
            if (result.length) {
                switch (result[0].r_status) {
                    case pCode.STATUS_PENDING:
                        return reject(INVALID(eCode.DUPLICATE_ENTRY, "Transaction already in process"));
                    case pCode.STATUS_REJECTED:
                        return reject(INVALID(eCode.DUPLICATE_ENTRY, "Transaction already rejected"));
                    case pCode.STATUS_SUCCESS:
                        return reject(INVALID(eCode.DUPLICATE_ENTRY, "Transaction already used to add coins"));
                }
            } else
                DB.query("INSERT INTO VaultTransactions(floID, mode, asset_type, asset, txid, r_status) VALUES (?)", [[floID, pCode.VAULT_MODE_DEPOSIT, pCode.ASSET_TYPE_COIN, "BTC", txid, pCode.STATUS_PENDING]])
                    .then(result => resolve("Deposit request in process"))
                    .catch(error => reject(error));
        }).catch(error => reject(error))
    });
}

function withdrawBTC(floID, amount) {
    return new Promise((resolve, reject) => {
        getAssetBalance.check(floID, "BTC", amount).then(_ => {
            let txQueries = [];
            txQueries.push(updateBalance.consume(floID, "BTC", amount));
            DB.transaction(txQueries).then(result => {
                blockchain.withdrawAsset.init(floID, "BTC", amount);
                resolve("Withdrawal request is in process");
            }).catch(error => reject(error));
        }).catch(error => reject(error));
    });
}

function depositToken(floID, txid) {
    return new Promise((resolve, reject) => {
        DB.query("SELECT r_status FROM VaultTransactions WHERE txid=? AND floID=? AND asset_type=?", [txid, floID, pCode.ASSET_TYPE_TOKEN]).then(result => {
            if (result.length) {
                switch (result[0].r_status) {
                    case pCode.STATUS_PENDING:
                        return reject(INVALID(eCode.DUPLICATE_ENTRY, "Transaction already in process"));
                    case pCode.STATUS_REJECTED:
                        return reject(INVALID(eCode.DUPLICATE_ENTRY, "Transaction already rejected"));
                    case pCode.STATUS_SUCCESS:
                        return reject(INVALID(eCode.DUPLICATE_ENTRY, "Transaction already used to add tokens"));
                }
            } else
                DB.query("INSERT INTO VaultTransactions(floID, mode, asset_type, txid, r_status) VALUES (?)", [[floID, pCode.VAULT_MODE_DEPOSIT, pCode.ASSET_TYPE_TOKEN, txid, pCode.STATUS_PENDING]])
                    .then(result => resolve("Deposit request in process"))
                    .catch(error => reject(error));
        }).catch(error => reject(error))
    });
}

function withdrawToken(floID, token, amount) {
    return new Promise((resolve, reject) => {
        //Check for FLO balance (transaction fee)
        let required_flo = floGlobals.sendAmt + floGlobals.fee;
        getAssetBalance.check(floID, "FLO", required_flo).then(_ => {
            getAssetBalance.check(floID, token, amount).then(_ => {
                let txQueries = [];
                txQueries.push(updateBalance.consume(floID, "FLO", required_flo));
                txQueries.push(updateBalance.consume(floID, token, amount));
                DB.transaction(txQueries).then(result => {
                    //Send Token to user via token API
                    blockchain.withdrawAsset.init(floID, token, amount);
                    resolve("Withdrawal request is in process");
                }).catch(error => reject(error));
            }).catch(error => reject(error));
        }).catch(error => reject(error));
    });
}

module.exports = {
    login,
    logout,
    addBuyOrder,
    addSellOrder,
    cancelOrder,
    getRateHistory,
    getBalance,
    getAccountDetails,
    getUserTransacts,
    //getTransactionDetails,
    //transferAsset,
    depositAsset,
    withdrawAsset
};