#! /usr/bin/env node

var diaper = require('./index.js');
var path = require('path');
var fs = require('fs');
var R = require('ramda');
var async = require('async');
var grabber = require('./lib/grabber');

function onErr (err) {
    console.error('ERR:', err.stack || err.message || err);
    throw err;
}

function usage(exitCode) {
    var logger = exitCode ? console.error.bind(console) : console.log.bind(console);
    logger('Usage: npm-diaper [-v] (with no args in a package dir)');
    logger('Usage: npm-diaper [-v] <name>');
    logger('Usage: npm-diaper [-v] <name>@<tag>');
    logger('Usage: npm-diaper [-v] <name>@<version>');
    logger('Usage: npm-diaper [-v] <name>@<version range>');
    logger('');
    logger('Prints out JSON of node modules that would be installed if npm install was run with given args.');
    logger('Uses current working directory if no path is specified.');
    logger('');
    logger('Optional arguments:');
    logger(helpOpts.join(', ') + '\tshow this message and exit');
    logger(versionOpts.join(', ') + '\tprint out the resolved version of root module');
    process.exit(exitCode);
}

function metaFromPackage(args, next) {
   var packagePath = path.join(process.cwd(), 'package.json');

   if (!fs.existsSync(packagePath)) {
       next(new Error(param + ' does not contain package.json'));
   }

   next(null, require(packagePath));
}

function metaFromGrabber(args, next) {
    var pair = R.head(args).split('@');
    grabber.getVersion(pair[0], pair[1] || 'latest', next);
}

function getVersion(meta, next) {
    next(null, meta.version);
}

var doesOverlap = function (left, right) {
    return !R.isEmpty(R.intersection(left, right));
}

var args = R.drop(2, process.argv);
var helpOpts = ['--help', '-h', '-?'];
var versionOpts = ['--version', '-v'];

if (args.length > 2) usage(1);
if (doesOverlap(helpOpts, args)) usage(0);

var version = doesOverlap(versionOpts, args);
args = R.reject(R.contains(R.__, versionOpts), args);

var getMeta = R.isEmpty(args) ? metaFromPackage : metaFromGrabber;
var getResult = (version) ? getVersion : diaper;
var getResult = async.compose(getResult, getMeta);

getResult(args, function (err, result) {
    if (err) onErr(err);
    console.log(JSON.stringify(result, null, 4));
});
