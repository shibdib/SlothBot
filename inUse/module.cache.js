//Path Cache
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
    } else {
        return null;
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
    return getPosKey(from) + '$' + getPosKey(to);
}

function getPosKey(pos) {
    return pos.x + 'x' + pos.y + pos.roomName;
}

//Room Cache
///////////////////////////////////////////////////
//STRUCTURE CACHE
///////////////////////////////////////////////////
module.exports.cacheRoomStructures = function (id, type, quantity, room) {
    let cache = Memory.room.structureCache || {};
    let key = id + '.' + room.name;
    cache[id] = {
        id: id,
        type: type,
        quantity: quantity
    };
    Memory.room.structureCache = cache;
};

module.exports.getRoomStructures = function (type, room) {
    let cache = Memory.room.structureCache;
    if (cache) {
        let cachedPath = cache[getPathKey(from, to)];
        if (cachedPath) {
            cachedPath.uses += 1;
            Memory.room.structureCache = cache;
            return cachedPath;
        }
    } else {
        return null;
    }
};
