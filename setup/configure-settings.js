const fs = require('fs');
const path = require('path');
const getInput = require('./getInput');

let _I = "";
for (let arg of process.argv)
    if (/^-I=/.test(arg)) {
        _I = arg.split(/=(.*)/s)[1];
        break;
    }

var config, flag_new;
try {
    config = require(`../args/config${_I}.json`);
    flag_new = false;
} catch (error) {
    config = {
        "secret": null,
        "port": "8080",

        "sql_user": null,
        "sql_pwd": null,
        "sql_db": "flobtc",
        "sql_host": "localhost"
    };
    flag_new = true;
}

function flaggedYesOrNo(text) {
    return new Promise((resolve) => {
        if (flag_new)
            resolve(true);
        else
            getInput.YesOrNo(text)
                .then(result => resolve(result))
                .catch(error => reject(error))
    })
}

function configurePort() {
    return new Promise(resolve => {
        getInput.Text('Enter port', config["port"]).then(port => {
            config["port"] = port;
            resolve(true);
        })
    })
}

function configureSQL() {
    return new Promise(resolve => {
        flaggedYesOrNo('Do you want to re-configure mySQL connection').then(value => {
            if (value) {
                console.log('Enter mySQL connection values: ')
                getInput.Text('MySQL Host', config['sql_host']).then(host => {
                    config['sql_host'] = host;
                    getInput.Text('Database name', config['sql_db']).then(dbname => {
                        config['sql_db'] = dbname;
                        getInput.Text('MySQL username', config['sql_user']).then(sql_user => {
                            config['sql_user'] = sql_user;
                            getInput.Text('MySQL password', config['sql_pwd']).then(sql_pwd => {
                                config['sql_pwd'] = sql_pwd;
                                resolve(true);
                            })
                        })
                    })
                })
            } else
                resolve(false);
        })
    })
}

function randomizeSessionSecret() {
    return new Promise((resolve) => {
        flaggedYesOrNo('Do you want to randomize the session secret').then(value => {
            if (value) {
                let N = Math.floor(Math.random() * (64 - 32 + 1)) + 32;
                var secret = '';
                var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                for (var i = 0; i < N; i++)
                    secret += characters.charAt(Math.floor(Math.random() * characters.length));
                config['secret'] = secret;
                resolve(true);
            } else
                resolve(false);
        })
    })
}

function configure() {
    return new Promise((resolve, reject) => {
        configurePort().then(port_result => {
            randomizeSessionSecret().then(secret_result => {
                configureSQL().then(sql_result => {
                    fs.writeFile(path.resolve(__dirname, '..', 'args', `config${_I}.json`), JSON.stringify(config), 'utf8', (err) => {
                        if (err) {
                            console.error(err);
                            return reject(false);
                        }
                        console.log('Configuration successful!');
                        /*
                        if (sql_result) {
                            getInput.YesOrNo('Do you want to create schema in the database').then(value => {
                                if (value) {
                                    const createSchema = require('./create-schema');
                                    createSchema().then(result => resolve(result))
                                        .catch(error => {
                                            console.log('Retry using: \n' + 'npm run create-schema');
                                            reject(error);
                                        });
                                } else {
                                    console.log('To create schema, use: \n' + 'npm run create-schema');
                                    resolve(true);
                                }
                            });
                        } else
                        */
                        resolve(true);
                    })
                })
            })
        });
    })
}

if (!module.parent)
    configure().then(_ => null).catch(error => console.error(error)).finally(_ => process.exit(0));
else
    module.exports = configure;