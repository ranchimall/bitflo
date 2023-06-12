const fs = require('fs');
const path = require('path');
let DB = require('../src/database');

let _I = "";
for (let arg of process.argv)
    if (/^-I=/.test(arg)) {
        _I = arg.split(/=(.*)/s)[1];
        break;
    }

function createSchema() {
    const config = require(`../args/config${_I}.json`);
    return new Promise((resolve, reject) => {
        fs.readFile(path.resolve(__dirname, '..', 'args', `schema.sql`), 'utf8', (err, data) => {
            if (err) {
                console.error(err);
                return reject(null);
            }
            DB.connect(config["sql_user"], config["sql_pwd"], config["sql_db"], config["sql_host"]).then(_ => {
                let txQueries = data.split(';');
                txQueries.pop();
                txQueries = txQueries.map(q => q.trim().replace(/\n/g, ' '));
                //console.log(txQueries);
                DB.transaction(txQueries).then(_ => {
                    console.log('SQL Schema created successfully!');
                    resolve(true);
                }).catch(error => {
                    console.error(error.message);
                    console.log('SQL Schema creation failed! Check user permission');
                    reject(true);
                });
            }).catch(error => {
                console.error(error);
                console.log('Unable to connect to MySQL database! Check user permission');
                reject(false);
            });
        });
    });
}

if (!module.parent)
    createSchema().then(_ => null).catch(_ => null).finally(_ => process.exit(0));
else
    module.exports = createSchema;