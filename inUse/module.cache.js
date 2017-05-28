//Credit - https://gist.github.com/derofim/72b7a5e1a57b77877892

module.exports.cachePath = function (from, to, path) {
    let key = getPathKey(from, to);
    let cache = Memory.pathCache || {};
    cache[key] = {
        path: path,
        uses: 1
    };
    Memory.pathCache = cache;
};

module.exports.getPath = function (from, to) {
    let cache = Memory.pathCache;
    if(cache) {
        let cachedPath = cache[getPathKey(from, to)];
        if(cachedPath) {
            cachedPath.uses += 1;
            Memory.pathCache = cache;
            return cachedPath;
        }
    }
};

module.exports.cleanPathCache = function () {
    if (Memory.pathCache && _.size(Memory.pathCache) > 1500) {
        for (i = 5; Memory.pathCache < 1500; i++) {
            if (_.size(Memory.pathCache) > 1500) { //1500 entries ~= 100kB
                console.log('Cleaning path cache (usage == ' + i + ')...');
                let counter = 0;
                for (let key in Memory.pathCache) {
                    let cached = Memory.pathCache[key];
                    if (cached.uses <= i) {
                        Memory.pathCache[key] = undefined;
                        counter += 1;
                    }
                }
                Game.notify('Path cache of usage ' + i + ' cleaned! ' + counter + ' paths removed', 6 * 60);
            }
        }
    }
};


function getPathKey(from, to) {
    //console.log("getPathKey= "+getPosKey(from) + '$' + getPosKey(to));
    return getPosKey(from) + '$' + getPosKey(to);
}

function getPosKey(pos) {
    return pos.x + 'x' + pos.y + pos.roomName;
}