var npmconf = require('npmconf');
var R = require('ramda');
var request = require('superagent');
var semver = require('semver');
var async = require('async');

var mergeFields = function mergeFields(left, right) {
    return R.converge(R.merge, R.prop(left), R.prop(right));
};

var allDependencies = mergeFields('dependencies', 'devDependencies');

var basicValue = R.pick(['name', 'version']);

var sortByHead = R.sortBy(R.head)

var dependencyPairs = R.compose(sortByHead, R.toPairs, R.prop('dependencies'));

var onConfig = R.curry(function onConfig (metadata, next, err, config) {
    if (err) return next(err);

    var grab = grabber(config.get('registry'));

    resolve(R.assoc('dependencies', allDependencies(metadata), metadata), function (err, resolved) {
        if (err) return next(err);

        next(null, resolved);
    });

    function resolve (meta, next) {
        var value = basicValue(meta);
        var addResolved = R.ifElse(R.isEmpty, R.always(value), R.assoc('dependencies', R.__, value));

        async.map(dependencyPairs(meta), function (item, next) {
            grab.getVersion(R.head(item), R.last(item), function (err, res) {
                if (err) return next(err);

                resolve(res, next);
            });
        }, function (err, resolved) {
            if (err) return next(err);

            next(null, addResolved(resolved));
        });
    }
});


function grabber(registry) {
    var repo = {};

    function httpError (url, status) {
        return new Error('HTTP Error getting ' + url + '. Status: ' + res.status);
    }

    function versionError (module, range) {
        return new Error('No matching version for: ' + module + '@' + range);
    }


    function getMeta (module, next) {
        var meta = repo[module];
        if (meta) return next(null, meta);
        var url = registry + module;

        request
            .get(url)
            .end(function (err, res) {
                if (err) return next(err);
                if (res.status >= 400) return next(httpError(url, status));
                repo = R.assoc(module, res.body, repo);
                getMeta(module, next);
            });
    }

    function getVersion (module, range,  next) {
        getMeta(module, function (err, meta) {
            if (err) return next(err);
            var match = semver.maxSatisfying(R.keys(meta.versions), range);
            if (!match) return next(versionError(module, range));
            next(null, meta.versions[match]);
        });
    }

    return {
        getVersion: getVersion
    };
}

module.exports = function diaper (meta, next) {
    npmconf.load(onConfig(meta, next));
};
