var npmconf = require('npmconf');
var R = require('ramda');
var async = require('async');
var grabber = require('./lib/grabber');

var mergeFields = function mergeFields(left, right) {
    return R.converge(R.merge, R.prop(left), R.prop(right));
};

var allDependencies = mergeFields('dependencies', 'devDependencies');
var basicValue = R.pick(['name', 'version']);
var sortByHead = R.sortBy(R.head);
var dependencyPairs = R.compose(sortByHead, R.toPairs, R.prop('dependencies'));

function resolve (meta, path, next) {
    var name = R.prop('name', meta);
    var value = basicValue(meta);
    var addResolved = R.ifElse(R.isEmpty, R.always(value), R.assoc('dependencies', R.__, value));

    if (R.find(R.eq(name), path)) return next(null, value);

    async.map(dependencyPairs(meta), function (item, next) {
        grabber.getVersion(R.head(item), R.last(item), function (err, res) {
            if (err) return next(err);
            resolve(res, R.append(name, path), next);
        });
    }, function (err, resolved) {
        if (err) return next(err);
        next(null, addResolved(resolved));
    });
}

module.exports = function diaper (metadata, next) {
    resolve(R.assoc('dependencies', allDependencies(metadata), metadata), [], function (err, resolved) {
        if (err) return next(err);
        next(null, resolved);
    });
};
