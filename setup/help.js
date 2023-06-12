let message = `
Trade market
---------------

npm install                     - Install the app and node modules.
npm run help                    - List all commands.
npm run setup                   - Finish the setup (configure and reset password).
npm run configure               - Configure the node.
npm run reset-password          - Reset the password (for private-key).

npm start                       - Start the application (main).

NOTE: argument 'PASSWORD' required for 'npm start'
npm start -- -PASSWORD=<password>

(Optional) Multiple instance can be run/setup on the same dir with different config files by using argument 'I'.
<command> -- -I=<instance_ID>

(Optional) 'console.debug' is now turned off by default. pass argument '--debug' to turn it on
npm start -- -PASSWORD=<password> --debug
`;

console.log(message);