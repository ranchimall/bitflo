const getBestSeller = (asset) => new Promise((resolve, reject) => {
    DB.query("SELECT SellOrder.id, SellOrder.floID, SellOrder.quantity FROM SellOrder" +
        " INNER JOIN UserBalance ON UserBalance.floID = SellOrder.floID AND UserBalance.asset = SellOrder.asset" +
        " WHERE UserBalance.quantity >= SellOrder.quantity AND SellOrder.asset = ?" +
        " ORDER BY SellOrder.price ASC, SellOrder.time_placed ASC" +
        " LIMIT 1", [asset]
    ).then(result => {
        if (result.length)
            resolve(result[0]);
        else
            reject(null);
    }).catch(error => reject(error))
});

const getBestBuyer = (asset) => new Promise((resolve, reject) => {
    DB.query("SELECT BuyOrder.id, BuyOrder.floID, BuyOrder.quantity FROM BuyOrder" +
        " INNER JOIN UserBalance ON UserBalance.floID = BuyOrder.floID AND UserBalance.asset = ?" +
        " WHERE UserBalance.quantity >= BuyOrder.maxPrice * BuyOrder.quantity AND BuyOrder.asset = ?" +
        " ORDER BY BuyOrder.maxPrice DESC, BuyOrder.time_placed ASC" +
        " LIMIT 1", [floGlobals.currency, asset]
    ).then(result => {
        if (result.length)
            resolve(result[0]);
        else
            reject(null);
    }).catch(error => reject(error))
});