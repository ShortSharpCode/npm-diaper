#! /usr/bin/env node

var diaper = require('./index.js');
var path = require('path');
var fs = require('fs');
var R = require('ramda');

function onErr (err) {
    console.error('ERR:', err.stack || err.message || err);
    throw err;
}

function usage(exitCode) {
    var logger = exitCode ? console.error.bind(console) : console.log.bind(console);
    logger('Usage: npm-diaper [path]');
    logger('');
    logger('Prints out JSON of node modules that would be installed if npm install was run given path.');
    logger('Uses current working directory if no path is specified.');
    process.exit(exitCode);
}

if (process.argv.length > 3) {
    usage(1);
}

if (R.indexOf(process.argv[2], ['--help', '-h', '-?']) !== -1) {
    usage(0);
}

var param = path.resolve(path.join(process.cwd(), process.argv[2] || ''));

if (!fs.existsSync(param)) {
    console.error(param + ' does not exist');
    process.exit(1);
}

fs.stat(param, function (err, stat) {
    if (err) onErr(err);

    if (!stat.isDirectory()) {
        console.error(param + ' is not a directory');
        process.exit(1);
    }

    var packagePath = path.join(param, 'package.json');

    if (!fs.existsSync(packagePath)) {
        console.error(param + ' does not contain package.json');
        process.exit(1);
    }

    diaper(require(packagePath), function (err, resolved) {
        if (err) onErr(err);

        console.log(JSON.stringify(resolved, null, 4));
    });
});
