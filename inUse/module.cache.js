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
    if (Memory.pathCache && Memory.pathCache.length > 2500) {
        for (i = 5; Memory.pathCache.length < 2500; i++) {
            if (Memory.pathCache.length > 2500) { //1500 entries ~= 100kB
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
module.exports.cacheRoomStructure = function (id) {
    let structure = Game.getObjectById(id);
    let room = structure.room;
    let cache = room.memory.structureCache || {};
    let key = room.name + '.' + structure.pos.x + '.' + structure.pos.y;
    cache[key] = {
        id: structure.id,
        type: structure.structureType,
        room: structure.room.name,
        posX: structure.pos.x,
        posY: structure.pos.y
    };
    room.memory.structureCache = cache;
};

module.exports.getRoomStructures = function (id, room) {
    let cache = Memory.room.structureCache;
    if (cache) {
        let cachedPath = cache[getStructureKey(from, to)];
        if (cachedPath) {
            cachedPath.uses += 1;
            Memory.room.structureCache = cache;
            return cachedPath;
        }
    } else {
        return null;
    }
};
