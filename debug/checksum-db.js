'use strict';

let _I = "";
for (let arg of process.argv)
    if (/^-I=/.test(arg)) {
        _I = arg.split(/=(.*)/s)[1];
        break;
    }

const DB = require('../src/database');

const ignoreTables = ['_backupCache', 'sinkShares'];
var ignoreTables_regex = new RegExp(ignoreTables.join("|"), "i");
function listTables() {
    return new Promise((resolve, reject) => {
        DB.query("SHOW TABLES").then(result => {
            let tables = [];
            for (let i in result)
                for (let j in result[i])
                    if (!ignoreTables_regex.test(result[i][j]))
                        tables.push(result[i][j]);
            resolve(tables);
        }).catch(error => reject(error))
    })
}

function checksumTable(table) {
    return new Promise((resolve, reject) => {
        DB.query("CHECKSUM TABLE ??", [table]).then(result => {
            let checksum = result[0].Checksum;
            DB.query("SELECT COUNT(*) AS rec_count FROM ??", [table])
                .then(result => resolve({ table, rec_count: result[0].rec_count, checksum }))
                .catch(error => reject(error))
        }).catch(error => reject(error))
    })
}

function CheckDB() {
    return new Promise((resolve, reject) => {
        const config = require(`../args/config${_I}.json`);
        DB.connect(config["sql_user"], config["sql_pwd"], config["sql_db"], config["sql_host"]).then(pool => {
            listTables().then(tables => {
                Promise.allSettled(tables.map(t => checksumTable(t))).then(results => {
                    let records = results.filter(r => r.status === "fulfilled").map(r => r.value);
                    console.table(records);
                    let errors = results.filter(r => r.status === "rejected");
                    if (errors.length)
                        console.error(errors.map(r => r.reason));
                    resolve(true);
                }).catch(error => reject(error))
            }).catch(error => reject(error))
        }).catch(error => reject(error))
    })
}

CheckDB().then(_ => process.exit(0)).catch(error => { console.error(error); process.exit(1); })