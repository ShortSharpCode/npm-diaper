#! /usr/bin/env node

var diaper = require('./index.js');
var path = require('path');
var fs = require('fs');
var R = require('ramda');
var grabber = require('./lib/grabber');

function onErr (err) {
    console.error('ERR:', err.stack || err.message || err);
    throw err;
}

function usage(exitCode) {
    var logger = exitCode ? console.error.bind(console) : console.log.bind(console);
    logger('Usage: npm-diaper (with no args in a package dir)');
    logger('Usage: npm-diaper <name>');
    logger('Usage: npm-diaper <name>@<tag>');
    logger('Usage: npm-diaper <name>@<version>');
    logger('Usage: npm-diaper <name>@<version range>');
    logger('');
    logger('Prints out JSON of node modules that would be installed if npm install was run with given args.');
    logger('Uses current working directory if no path is specified.');
    process.exit(exitCode);
}

if (process.argv.length > 3) {
    usage(1);
}

if (R.indexOf(process.argv[2], ['--help', '-h', '-?']) !== -1) {
    usage(0);
}

var meta;
if (process.argv[2]) {
    var pair = process.argv[2].split('@');
    grabber.getVersion(pair[0], pair[1] || 'latest', function (err, meta) {
        if (err) onErr(err);

        diaper(meta, function (err, resolved) {
            if (err) onErr(err);
            console.log(JSON.stringify(resolved, null, 4));
        });
    });
} else {
    var packagePath = path.join(process.cwd(), 'package.json');

    if (!fs.existsSync(packagePath)) {
        console.error(param + ' does not contain package.json');
        process.exit(1);
    }

    diaper(require(packagePath), function (err, resolved) {
        if (err) onErr(err);
        console.log(JSON.stringify(resolved, null, 4));
    });
}
