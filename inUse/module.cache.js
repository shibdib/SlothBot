//Path Cache
//Credit - https://gist.github.com/derofim/72b7a5e1a57b77877892
const profiler = require('screeps-profiler');

let doNotAggress = RawMemory.segments[2];

function cachePath(from, to, path) {
    let key = getPathKey(from, to);
    let cache = Memory.pathCache || {};
    let tick = Game.time;
    cache[key] = {
        path: path,
        uses: 1,
        tick: tick
    };
    Memory.pathCache = cache;
}
module.exports.cachePath = profiler.registerFN(cachePath, 'cachePath');

function getPath(from, to) {
    let cache = Memory.pathCache;
    if (cache) {
        let cachedPath = cache[getPathKey(from, to)];
        if (cachedPath) {
            cachedPath.uses += 1;
            Memory.pathCache = cache;
            return cachedPath.path;
        }
    } else {
        return null;
    }
}
module.exports.getPath = profiler.registerFN(getPath, 'getPath');

module.exports.cleanPathCache = function () {
    let counter = 0;
    let tick = Game.time;
    for (let key in Memory.pathCache) {
        let cached = Memory.pathCache[key];
        if (cached.tick + 200 < tick || cached.tick === undefined) {
            Memory.pathCache[key] = undefined;
            counter += 1;
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
module.exports.cacheRoomStructures = function (id) {
    let structure = Game.getObjectById(id);
    if (structure) {
        let room = structure.room;
        let cache = room.memory.structureCache || {};
        let key = room.name + '.' + structure.pos.x + '.' + structure.pos.y;
        cache[key] = {
            id: structure.id,
            type: structure.structureType
        };
        room.memory.structureCache = cache;
    }
};


//Room intel
module.exports.cacheRoomIntel = function (creep) {
    let room = Game.rooms[creep.pos.roomName];
    let owner = undefined;
    let level = undefined;
    let hostiles = undefined;
    if (room) {
        let cache = Memory.roomCache || {};
        let sources = room.find(FIND_SOURCES);
        hostiles = room.find(FIND_CREEPS, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(doNotAggress, e.owner['username']) === false});
        let minerals = room.find(FIND_MINERALS);
        if (room.controller) {
            owner = room.controller.owner;
            level = room.controller.level;
        }
        let key = room.name;
        cache[key] = {
            cached: Game.time,
            name: room.name,
            sources: sources,
            minerals: minerals,
            owner: owner,
            level: level,
            hostiles: hostiles.length
        };
        Memory.roomCache = cache;
    }
};
