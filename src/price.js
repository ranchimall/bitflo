'use strict';
const DB = require("./database");

var currentRate = {}; //container for FLO price (from API or by model)

//store FLO price in database every 1 hr
function storeHistory(asset, rate) {
    DB.query("INSERT INTO PriceHistory (asset, rate) VALUE (?)", [[asset, global.toStandardDecimal(rate)]])
        .then(_ => null).catch(error => console.error(error))
}

function getHistory(asset, duration = '') {
    return new Promise((resolve, reject) => {
        let { statement, values } = getHistory.getRateStatement(asset, duration);
        DB.query(statement, values)
            .then(result => resolve(result))
            .catch(error => reject(error))
    });
}

getHistory.statement = {
    'all-time': "SELECT DATE(rec_time) AS time, AVG(rate) as rate FROM PriceHistory WHERE asset=? GROUP BY time ORDER BY time",
    'year': "SELECT DATE(rec_time) AS time, AVG(rate) as rate FROM PriceHistory WHERE asset=? AND rec_time >= NOW() - INTERVAL ? year GROUP BY time ORDER BY time",
    'month': "SELECT DATE(rec_time) AS time, AVG(rate) as rate FROM PriceHistory WHERE asset=? AND rec_time >= NOW() - INTERVAL ? month GROUP BY time ORDER BY time",
    'week': "SELECT rec_time AS time, rate FROM PriceHistory WHERE asset=? AND rec_time >= NOW() - INTERVAL ? week ORDER BY time",
    'day': "SELECT rec_time AS time, rate FROM PriceHistory WHERE asset=? AND rec_time >= NOW() - INTERVAL ? day ORDER BY time"
}

getHistory.getRateStatement = (asset, duration) => {
    let n = duration.match(/\d+/g),
        d = duration.match(/\D+/g);
    n = n ? n[0] || 1 : 1;
    d = d ? d[0].replace(/[-\s]/g, '') : "";

    switch (d.toLowerCase()) {
        case "day":
        case "days":
            return { statement: getHistory.statement['day'], values: [asset, n] };
        case "week":
        case "weeks":
            return { statement: getHistory.statement['week'], values: [asset, n] };
        case "month":
        case "months":
            return { statement: getHistory.statement['month'], values: [asset, n] };
        case "year":
        case "years":
            return { statement: getHistory.statement['year'], values: [asset, n] };
        case "alltime":
            return { statement: getHistory.statement['all-time'], values: [asset] };
        default:
            return { statement: getHistory.statement['day'], values: [asset, 1] };
    }
}

module.exports = {
    getHistory,
    storeHistory,
    get currentRates() {
        return Object.assign({}, currentRate);
    }
}