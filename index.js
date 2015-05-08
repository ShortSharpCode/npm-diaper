var npmconf = require('npmconf');
var R = require('ramda');
var request = require('superagent');
var semver = require('semver');
var async = require('async');
var tar = require('tar');
var zlib = require('zlib');

var mergeFields = function mergeFields(left, right) {
    return R.converge(R.merge, R.prop(left), R.prop(right));
};

var allDependencies = mergeFields('dependencies', 'devDependencies');
var basicValue = R.pick(['name', 'version']);
var sortByHead = R.sortBy(R.head);
var dependencyPairs = R.compose(sortByHead, R.toPairs, R.prop('dependencies'));
var versions = R.compose(R.keys, R.prop('versions'));
var validSemvers = R.filter(semver.valid);

var onConfig = R.curry(function onConfig (metadata, next, err, config) {
    if (err) return next(err);

    var grab = grabber(config.get('registry'));

    resolve(R.assoc('dependencies', allDependencies(metadata), metadata), [], function (err, resolved) {
        if (err) return next(err);
        next(null, resolved);
    });

    function resolve (meta, path, next) {
        var name = R.prop('name', meta);
        var value = basicValue(meta);
        var addResolved = R.ifElse(R.isEmpty, R.always(value), R.assoc('dependencies', R.__, value));

        if (R.find(R.eq(name), path)) return next(null, value);
        path = R.append(name, path);

        async.map(dependencyPairs(meta), function (item, next) {
            grab.getVersion(R.head(item), R.last(item), function (err, res) {
                if (err) return next(err);
                resolve(res, path, next);
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

    function addVersion (module, version, versionMeta) {
        var meta = repo[module] || {versions: {}};
        meta = R.assoc(version, versionMeta || {name: module, version: version}, meta);
    }

    function getMetaFromTarball(url, next) {
        var found = false;
        request
            .get(url)
            .on('error', next)
            .pipe(zlib.Unzip())
            .on('error', next)
            .pipe(tar.Parse())
            .on('entry', function (entry) {
                if (!found && entry.type === 'File' && /^([^\/]+\/)?package.json$/.test(entry.path)) {
                    found = true;
                    streamToString(entry, function (err, string) {
                        if (err) return next(err);
                        try {
                            next(null, JSON.parse(string));
                        } catch (err) {
                            next(err);
                        }
                    });
                }
            }).
            on('end', function() {
                if (!found) next();
            });
    }

    function streamToString(stream, next) {
        var string = ''
        next = R.once(next);
        stream.on('data', function (data) {
            string += data.toString()
        })
        stream.on('end', function () {
            next(null, string)
        })
        stream.on('error', next);
    }

    function getVersion (module, range,  next) {
        if (/^https?:\/\//.test(range)) {
            getMetaFromTarball(range, function (err, versionMeta) {
                if (err) return next(err);
                addVersion(module, range, versionMeta);
                next(null, versionMeta);
            });
        } else {
            var exactMatch = R.compose(R.find(R.eq(range)), versions);
            var tagMatch = R.path(['dist-tags', range]);
            var fuzzyMatch = function fuzzyMatch (meta) {
                return semver.maxSatisfying(validSemvers(versions(meta)), range);
            };

            getMeta(module, function (err, meta) {
                if (err) return next(err);
                var match = exactMatch(meta) || tagMatch(meta) || fuzzyMatch(meta);
                if (!match) return next(versionError(module, range));
                next(null, meta.versions[match]);
            });
        }
    }

    return {
        getVersion: getVersion
    };
}

module.exports = function diaper (meta, next) {
    npmconf.load(onConfig(meta, next));
};
