const getInput = require("./getInput");

let message = `
Trade Market is installed
To list all commands, use: 
npm run help
`;
console.log(message);

getInput.YesOrNo('Do you want to finish the setup now').then(value => {
    if (value) {
        let configureSettings = require('./configure-settings');
        configureSettings()
            .then(_ => console.log('To Re-configure, use:'))
            .catch(_ => console.log('Finish the configuration later using: '))
            .finally(_ => {
                console.log('npm run configure');
                getInput.YesOrNo('Do you want to Reset password for private key now').then(value => {
                    if (value) {
                        let resetPassword = require('./reset-password');
                        resetPassword()
                            .then(_ => console.log('To reset the password again, use: '))
                            .catch(_ => console.log('Reset the password later using: '))
                            .finally(_ => {
                                console.log('npm run reset-password');
                                process.exit(0);
                            })
                    } else {
                        console.log('Reset the password later using:\n' + 'npm run reset-password');
                        process.exit(0);
                    }
                })
            })
    } else {
        console.log('Finish the setup later using:\n' + 'npm run setup');
        process.exit(0);
    }
})