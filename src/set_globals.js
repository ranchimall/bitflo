'use strict';
//fetch for node js (used in floBlockchainAPI.js)
global.fetch = require("node-fetch");

//Set browser paramaters from param.json (or param-default.json)
var param;
try {
    param = require('../args/param.json');
} catch {
    param = require('../args/param-default.json');
} finally {
    for (let p in param)
        global[p] = param[p];
}

global.toStandardDecimal = num => parseFloat((parseInt(num * 1e8) * 1e-8).toFixed(8))

if (!process.argv.includes("--debug"))
    global.console.debug = () => null;

/*
//Trace the debug logs in node js
var debug = console.debug;
console.debug = function() {
    debug.apply(console, arguments);
    console.trace();
};
*/