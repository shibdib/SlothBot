let cache = require('module.cache');
module.exports.Move = function (creep, target, exempt = false, maxRooms = 1) {
    if (creep.fatigue > 0) {
        return;
    }
    if (creep.memory.pathAge === null || creep.memory.pathAge === undefined || creep.memory.pathLimit === null || creep.memory.pathLimit === undefined) {
        creep.memory.pathAge = 0;
        creep.memory.pathLimit = 0;
    }
    if (creep.memory.pathAge >= creep.memory.pathLimit) {
    if (cache.getPath(creep.pos, target.pos)){
        creep.memory.path = cache.getPath(creep.pos, target.pos);
    } else {
        creep.memory.path = creep.room.findPath(creep.pos, target.pos, {
            costCallback: function (roomName, costMatrix) {
                const noRoads = creep.room.find(!FIND_STRUCTURES);
                for (let i = 0; i < noRoads.length; i++) {
                    costMatrix.set(noRoads[i].pos.x, noRoads[i].pos.y, 50);
                }
                const roads = creep.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_ROAD});
                for (let i = 0; i < roads.length; i++) {
                    costMatrix.set(roads[i].pos.x, roads[i].pos.y, 0);
                }
                const creeps = creep.room.find(FIND_CREEPS);
                for (let i = 0; i < creeps.length; i++) {
                    costMatrix.set(creeps[i].pos.x, creeps[i].pos.y, 255);
                }
                for (let i = 0; i < 20; i++) {
                    let avoid = 'avoid' + i;
                    if (Game.flags[avoid]) {
                        costMatrix.set(Game.flags[avoid].pos.x, Game.flags[avoid].pos.y, 100);
                    }
                }
                if (exempt !== true) {
                    const source = creep.room.find(FIND_SOURCES);
                    for (let i = 0; i < source.length; i++) {
                        costMatrix.set(source[i].pos.x, source[i].pos.y, 35);
                        costMatrix.set(source[i].pos.x + 1, source[i].pos.y, 35);
                        costMatrix.set(source[i].pos.x, source[i].pos.y + 1, 35);
                        costMatrix.set(source[i].pos.x - 1, source[i].pos.y, 35);
                        costMatrix.set(source[i].pos.x, source[i].pos.y - 1, 35);
                        costMatrix.set(source[i].pos.x - 1, source[i].pos.y - 1, 35);
                        costMatrix.set(source[i].pos.x + 1, source[i].pos.y + 1, 35);
                        costMatrix.set(source[i].pos.x + 1, source[i].pos.y - 1, 35);
                        costMatrix.set(source[i].pos.x - 1, source[i].pos.y + 1, 35);
                    }
                }
            },
            maxOps: 100000, serialize: true, ignoreCreeps: false, maxRooms: maxRooms, plainCost: 5, swampCost: 15
        });
        cache.cachePath(creep.pos, target.pos, creep.memory.path);
    }
        creep.moveByPath(creep.memory.path);
        creep.memory.pathAge = 0;
        creep.memory.pathLimit = (creep.memory.path.length + 3) / 2;
    }
    creep.memory.pathAge++;
    if (creep.moveByPath(creep.memory.path) !== OK) {
        creep.memory.path = creep.room.findPath(creep.pos, target.pos, {
            costCallback: function (roomName, costMatrix) {
                const noRoads = creep.room.find(!FIND_STRUCTURES);
                for (let i = 0; i < noRoads.length; i++) {
                    costMatrix.set(noRoads[i].pos.x, noRoads[i].pos.y, 50);
                }
                const roads = creep.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_ROAD});
                for (let i = 0; i < roads.length; i++) {
                    costMatrix.set(roads[i].pos.x, roads[i].pos.y, 0);
                }
                const creeps = creep.room.find(FIND_CREEPS);
                for (let i = 0; i < creeps.length; i++) {
                    costMatrix.set(creeps[i].pos.x, creeps[i].pos.y, 255);
                }
                for (let i = 0; i < 20; i++) {
                    let avoid = 'avoid' + i;
                    if (Game.flags[avoid]) {
                        costMatrix.set(Game.flags[avoid].pos.x, Game.flags[avoid].pos.y, 100);
                    }
                }
                if (exempt !== true) {
                    const source = creep.room.find(FIND_SOURCES);
                    for (let i = 0; i < source.length; i++) {
                        costMatrix.set(source[i].pos.x, source[i].pos.y, 35);
                        costMatrix.set(source[i].pos.x + 1, source[i].pos.y, 35);
                        costMatrix.set(source[i].pos.x, source[i].pos.y + 1, 35);
                        costMatrix.set(source[i].pos.x - 1, source[i].pos.y, 35);
                        costMatrix.set(source[i].pos.x, source[i].pos.y - 1, 35);
                        costMatrix.set(source[i].pos.x - 1, source[i].pos.y - 1, 35);
                        costMatrix.set(source[i].pos.x + 1, source[i].pos.y + 1, 35);
                        costMatrix.set(source[i].pos.x + 1, source[i].pos.y - 1, 35);
                        costMatrix.set(source[i].pos.x - 1, source[i].pos.y + 1, 35);
                    }
                }
            },
            maxOps: 100000, serialize: true, ignoreCreeps: false, maxRooms: maxRooms, plainCost: 5, swampCost: 15
        });
        cache.cachePath(creep.pos, target.pos, creep.memory.path);
        creep.moveByPath(creep.memory.path);
        creep.memory.pathAge = 0;
        creep.memory.pathLimit = (creep.memory.path.length + 3) / 2;
    }
};
module.exports.AttackMove = function (creep, target) {
    if (creep.fatigue > 0) {
        return;
    }
    creep.memory.path = creep.room.findPath(creep.pos, target.pos, {
        maxOps: 100000, serialize: true, ignoreCreeps: false
    });
    if (creep.moveByPath(creep.memory.path) !== OK) {
        creep.memory.path = creep.room.findPath(creep.pos, target.pos, {
            maxOps: 100000, serialize: true, ignoreCreeps: false, ignoreDestructibleStructures: true
        });
        creep.moveByPath(creep.memory.path);
    }
};
module.exports.FindPath = function (creep, target, serialize = false, exempt = false, maxRooms = 1) {
    if (cache.getPath(creep.pos, target.pos)) {
        if (serialize === true) {
            return Room.serializePath(cache.getPath(creep.pos, target.pos));
        }
        return cache.getPath(creep.pos, target.pos);
    }
    let path = creep.room.findPath(creep.pos, target.pos, {
        costCallback: function (roomName, costMatrix) {
            const noRoads = creep.room.find(!FIND_STRUCTURES);
            for (let i = 0; i < noRoads.length; i++) {
                costMatrix.set(noRoads[i].pos.x, noRoads[i].pos.y, 50);
            }
            const roads = creep.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_ROAD});
            for (let i = 0; i < roads.length; i++) {
                costMatrix.set(roads[i].pos.x, roads[i].pos.y, 0);
            }
            const creeps = creep.room.find(FIND_CREEPS);
            for (let i = 0; i < creeps.length; i++) {
                costMatrix.set(creeps[i].pos.x, creeps[i].pos.y, 255);
            }
            for (let i = 0; i < 20; i++) {
                let avoid = 'avoid' + i;
                if (Game.flags[avoid]) {
                    costMatrix.set(Game.flags[avoid].pos.x, Game.flags[avoid].pos.y, 100);
                }
            }
            if (exempt !== true) {
                const source = creep.room.find(FIND_SOURCES);
                for (let i = 0; i < source.length; i++) {
                    costMatrix.set(source[i].pos.x, source[i].pos.y, 35);
                    costMatrix.set(source[i].pos.x + 1, source[i].pos.y, 35);
                    costMatrix.set(source[i].pos.x, source[i].pos.y + 1, 35);
                    costMatrix.set(source[i].pos.x - 1, source[i].pos.y, 35);
                    costMatrix.set(source[i].pos.x, source[i].pos.y - 1, 35);
                    costMatrix.set(source[i].pos.x - 1, source[i].pos.y - 1, 35);
                    costMatrix.set(source[i].pos.x + 1, source[i].pos.y + 1, 35);
                    costMatrix.set(source[i].pos.x + 1, source[i].pos.y - 1, 35);
                    costMatrix.set(source[i].pos.x - 1, source[i].pos.y + 1, 35);
                }
            }
        },
        maxOps: 100000, serialize: serialize, ignoreCreeps: false, maxRooms: maxRooms, plainCost: 5, swampCost: 15
    });
    if (serialize === true) {
        cache.cachePath(creep.pos, target.pos, path);
    } else {
        cache.cachePath(creep.pos, target.pos, Room.serializePath(path));
    }
    return path;
};