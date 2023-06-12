'use strict';

const price = require("./price");
const DB = require("./database");

const {
    WAIT_TIME,
    TRADE_HASH_PREFIX
} = require("./_constants")["market"];

const updateBalance = {};
updateBalance.consume = (floID, asset, amount) => ["UPDATE UserBalance SET quantity=quantity-? WHERE floID=? AND asset=?", [amount, floID, asset]];
updateBalance.add = (floID, asset, amount) => ["INSERT INTO UserBalance (floID, asset, quantity) VALUE (?) ON DUPLICATE KEY UPDATE quantity=quantity+?", [[floID, asset, amount], amount]];

const couplingInstance = {},
    couplingTimeout = {};

function stopAllInstance() {
    for (let asset in couplingTimeout) {
        if (couplingTimeout[asset])
            clearTimeout(couplingTimeout[asset]);
        delete couplingInstance[asset];
        delete couplingTimeout[asset];
    }
}

function startCouplingForAsset(asset) {
    console.debug("startCouplingForAsset")
    if (couplingInstance[asset] === true) { //if coupling is already running for asset
        /*if (updatePrice) { //wait until current instance is over
            if (couplingTimeout[asset]) clearTimeout(couplingTimeout[asset]);
            couplingTimeout[asset] = setTimeout(() => startCouplingForAsset(asset, true), WAIT_TIME);
        }*/
        return;
    }
    couplingInstance[asset] = true; //set instance as running
    recursiveCoupling(asset);
}

const getBestSeller = (asset) => new Promise((resolve, reject) => {
    DB.query("SELECT SellOrder.id, SellOrder.floID, SellOrder.quantity, SellOrder.price FROM SellOrder" +
        " INNER JOIN UserBalance ON UserBalance.floID = SellOrder.floID AND UserBalance.asset = SellOrder.asset" +
        " WHERE UserBalance.quantity >= SellOrder.quantity AND SellOrder.asset = ?" +
        " ORDER BY SellOrder.price ASC, SellOrder.time_placed ASC" +
        " LIMIT 1", [asset]
    ).then(result => {
        if (result.length)
            resolve(result[0]);
        else
            resolve(null);
    }).catch(error => reject(error))
});

const getBestBuyer = (asset, sell_price) => new Promise((resolve, reject) => {
    DB.query("SELECT BuyOrder.id, BuyOrder.floID, BuyOrder.quantity FROM BuyOrder" +
        " INNER JOIN UserBalance ON UserBalance.floID = BuyOrder.floID AND UserBalance.asset = ?" +
        " WHERE UserBalance.quantity >= BuyOrder.maxPrice * BuyOrder.quantity AND BuyOrder.asset = ? AND BuyOrder.maxPrice >= ?" +
        " ORDER BY BuyOrder.maxPrice DESC, BuyOrder.time_placed ASC" +
        " LIMIT 1", [floGlobals.currency, asset, sell_price]
    ).then(result => {
        if (result.length)
            resolve(result[0]);
        else
            resolve(null);
    }).catch(error => reject(error))
});

function recursiveCoupling(asset) {
    console.debug("recursiveCoupling")
    processCoupling(asset).then(result => {
        if (!result) { //no valid orders to pair: exit pairing
            console.debug("No valid orders to pair");
            delete couplingInstance[asset];
            return;
        }
        console.log(result);
        if (couplingInstance[asset] === true)
            recursiveCoupling(asset);
    }).catch(error => {
        console.error(error)
        delete couplingInstance[asset];
    })
}

function processCoupling(asset) {
    return new Promise((resolve, reject) => {
        getBestSeller(asset).then(best_sell => {
            console.debug("Sell:", best_sell);
            if (!best_sell) //no valid sell orders 
                return resolve(null);
            let sell_rate = best_sell.price;
            getBestBuyer(asset, sell_rate).then(best_buy => {
                console.debug("Buy:", best_buy);
                if (!best_buy) //no valid buy orders 
                    return resolve(null);
                let quantity = Math.min(best_buy.quantity, best_sell.quantity);
                let txQueries = processOrders(best_sell, best_buy, asset, sell_rate, quantity);
                //begin audit
                beginAudit(best_sell.floID, best_buy.floID, asset, sell_rate, quantity).then(audit => {
                    //process txn query in SQL
                    DB.transaction(txQueries).then(_ => {
                        audit.end();
                        price.storeHistory(asset, sell_rate);
                        resolve(`Transaction was successful! BuyOrder:${best_buy.id}| SellOrder:${best_sell.id}`)
                    }).catch(error => reject(error));
                }).catch(error => reject(error));
            }).catch(error => reject(error))
        }).catch(error => reject(error))
    })
}

function processOrders(seller_best, buyer_best, asset, sell_rate, quantity) {
    let txQueries = [];
    if (quantity > buyer_best.quantity || quantity > seller_best.quantity)
        throw Error("Tx quantity cannot be more than order quantity");

    //Process Buy Order
    if (quantity == buyer_best.quantity)
        txQueries.push(["DELETE FROM BuyOrder WHERE id=?", [buyer_best.id]]);
    else
        txQueries.push(["UPDATE BuyOrder SET quantity=quantity-? WHERE id=?", [quantity, buyer_best.id]]);

    //Process Sell Order
    if (quantity == seller_best.quantity)
        txQueries.push(["DELETE FROM SellOrder WHERE id=?", [seller_best.id]]);
    else
        txQueries.push(["UPDATE SellOrder SET quantity=quantity-? WHERE id=?", [quantity, seller_best.id]]);

    //Update cash/asset balance for seller and buyer
    let totalAmount = sell_rate * quantity;
    txQueries.push(updateBalance.add(seller_best.floID, floGlobals.currency, totalAmount));
    txQueries.push(updateBalance.consume(buyer_best.floID, floGlobals.currency, totalAmount));
    txQueries.push(updateBalance.consume(seller_best.floID, asset, quantity));
    txQueries.push(updateBalance.add(buyer_best.floID, asset, quantity));

    //Record transaction
    let time = Date.now();
    let hash = TRADE_HASH_PREFIX + Crypto.SHA256(JSON.stringify({
        seller: seller_best.floID,
        buyer: buyer_best.floID,
        asset: asset,
        quantity: quantity,
        unitValue: sell_rate,
        tx_time: time,
    }));
    txQueries.push([
        "INSERT INTO TradeTransactions (seller, buyer, asset, quantity, unitValue, tx_time, txid) VALUES (?)",
        [[seller_best.floID, buyer_best.floID, asset, quantity, sell_rate, new Date(time), hash]]
    ]);

    return txQueries;
}

function beginAudit(sellerID, buyerID, asset, unit_price, quantity) {
    return new Promise((resolve, reject) => {
        auditBalance(sellerID, buyerID, asset).then(old_bal => resolve({
            end: () => endAudit(sellerID, buyerID, asset, old_bal, unit_price, quantity)
        })).catch(error => reject(error))
    })
}

function endAudit(sellerID, buyerID, asset, old_bal, unit_price, quantity) {
    auditBalance(sellerID, buyerID, asset).then(new_bal => {
        DB.query("INSERT INTO AuditTrade (asset, quantity, unit_price, total_cost," +
            " sellerID, seller_old_cash, seller_old_asset, seller_new_cash, seller_new_asset," +
            " buyerID, buyer_old_cash, buyer_old_asset, buyer_new_cash, buyer_new_asset)" +
            " Value (?)", [[
                asset, quantity, unit_price, quantity * unit_price,
                sellerID, old_bal[sellerID].cash, old_bal[sellerID].asset, new_bal[sellerID].cash, new_bal[sellerID].asset,
                buyerID, old_bal[buyerID].cash, old_bal[buyerID].asset, new_bal[buyerID].cash, new_bal[buyerID].asset,
            ]]).then(_ => null).catch(error => console.error(error))
    }).catch(error => console.error(error));
}

function auditBalance(sellerID, buyerID, asset) {
    return new Promise((resolve, reject) => {
        let balance = {
            [sellerID]: {
                cash: 0,
                asset: 0
            },
            [buyerID]: {
                cash: 0,
                asset: 0
            }
        };
        DB.query("SELECT floID, quantity, asset FROM UserBalance WHERE floID IN (?) AND asset IN (?)", [[sellerID, buyerID], [floGlobals.currency, asset]]).then(result => {
            for (let i in result) {
                if (result[i].asset === floGlobals.currency)
                    balance[result[i].floID].cash = result[i].quantity;
                else if (result[i].asset === asset)
                    balance[result[i].floID].asset = result[i].quantity;
            }
            resolve(balance);
        }).catch(error => reject(error))
    })
}

module.exports = {
    initiate: startCouplingForAsset,
    stopAll: stopAllInstance,
    updateBalance
}