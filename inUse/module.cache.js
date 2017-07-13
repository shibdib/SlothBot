//Path Cache
//Credit - https://gist.github.com/derofim/72b7a5e1a57b77877892
const profiler = require('screeps-profiler');

let doNotAggress = RawMemory.segments[2];


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
        if (cached.tick + EST_TICKS_PER_DAY < tick || cached.tick === undefined) {
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
    let sk = undefined;
    let towers = undefined;
    if (room) {
        let cache = Memory.roomCache || {};
        let sources = room.find(FIND_SOURCES);
        hostiles = room.find(FIND_CREEPS, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(doNotAggress, e.owner['username']) === false});
        towers = room.find(FIND_STRUCTURES, {filter: (e) => e.structureType === STRUCTURE_TOWER && _.includes(doNotAggress, e.owner['username']) === false});
        if (room.find(FIND_STRUCTURES, {filter: (e) => e.structureType === STRUCTURE_KEEPER_LAIR}).length > 0) sk = true;
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
            towers: towers.length,
            hostiles: hostiles.length,
            sk: sk
        };
        Memory.roomCache = cache;
        if (sk) {
            for (let key in Game.spawns) {
                if (Game.map.getRoomLinearDistance(Game.spawns[key].pos.roomName, room.name) <= 2) {
                    if (Game.spawns[key].room.memory.skRooms) {
                        let skMem = Game.spawns[key].room.memory.skRooms;
                        skMem.push(room.name);
                    } else {
                        Game.spawns[key].room.memory.skRooms = {};
                    }
                }
            }
        }
    }
};
