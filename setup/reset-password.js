const fs = require('fs');
const getInput = require('./getInput');

global.floGlobals = require('../docs/scripts/floGlobals');
require('../src/set_globals');
require('../docs/scripts/lib');
const floCrypto = require('../docs/scripts/floCrypto');
const path = require('path');

let _I = "";
for (let arg of process.argv)
    if (/^-I=/.test(arg)) {
        _I = arg.split(/=(.*)/s)[1];
        break;
    }

function validateKey(privKey) {
    return new Promise((resolve, reject) => {
        try {
            if (!privKey || privKey === "")
                throw 'Private Key cannot be empty!';
            let floID = floCrypto.getFloID(privKey);
            if (!floID || !floCrypto.verifyPrivKey(privKey, floID))
                throw 'Invalid Private Key!';
            return resolve(privKey);
        } catch (error) {
            getInput.Text(error + ' Re-Enter: (Cancel)', 'Cancel').then(value => {
                if (value === 'Cancel')
                    return reject(true);
                validateKey(value)
                    .then(result => resolve(result))
                    .catch(error => reject(error))
            });
        }
    })
}

function getPassword() {
    return new Promise((resolve, reject) => {
        getInput.Text(`Enter a password [Minimum 8 characters]`, 'Cancel').then(value1 => {
            if (value1 === 'Cancel')
                return reject(true);
            else if (value1.length < 8) {
                console.log('Password length must be minimum of 8 characters');
                getPassword()
                    .then(result => resolve(result))
                    .catch(error => reject(error))
            } else {
                getInput.Text(`Re-enter password`).then(value2 => {
                    if (value1 !== value2) {
                        console.log('Passwords doesnot match! Try again.');
                        getPassword()
                            .then(result => resolve(result))
                            .catch(error => reject(error))
                    } else
                        resolve(value1);
                })
            }
        });
    })
}

function resetPassword() {
    return new Promise((resolve, reject) => {
        getInput.Text(`Enter private key`).then(value => {
            validateKey(value).then(privKey => {
                getPassword().then(password => {
                    let encrypted = Crypto.AES.encrypt(privKey, password);
                    let randNum = floCrypto.randInt(10, 15);
                    let splitShares = floCrypto.createShamirsSecretShares(encrypted, randNum, randNum);
                    fs.writeFile(path.resolve(__dirname, '..', 'args', `keys${_I}.json`), JSON.stringify(splitShares), 'utf8', (err) => {
                        if (err) {
                            console.error(err);
                            return reject(false);
                        }
                        console.log('Password reset successful!');
                        resolve(true);
                    })
                }).catch(error => {
                    console.log('Password reset cancelled!');
                    reject(true);
                })
            }).catch(error => {
                console.log('Password reset cancelled!');
                reject(true);
            })
        })
    })
}

if (!module.parent)
    resetPassword().then(_ => null).catch(_ => null).finally(_ => process.exit(0));
else
    module.exports = resetPassword;