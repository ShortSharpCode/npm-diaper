var R = require('ramda');
var request = require('superagent');
var semver = require('semver');
var tar = require('tar');
var zlib = require('zlib');
var fs = require('fs');
var npmconf = require('npmconf');

var versions = R.compose(R.keys, R.prop('versions'));
var validSemvers = R.filter(semver.valid);
var err;
var instance;
var loading = false;
var queue = [];

function init(next) {
    if (err || instance) return next(err, instance);
    queue.push(next);
    if (!loading) {
        loading = true;
        npmconf.load(function (err, config) {
            err = err;
            instance = config && grabber(config.get('registry'));
            R.forEach(function (next) { next(err, instance) }, queue);
        });
    }
}

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

module.exports = {
    getVersion: function getVersion(module, range, next) {
        init(function (err, grab) {
            if (err) return next(err);
            grab.getVersion(module, range, next);
        });
    }
}
