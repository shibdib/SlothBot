let cache = require('module.cache');
const profiler = require('screeps-profiler');


function Move(creep, target, exempt = false, maxRooms = 1) {
    if (creep.fatigue > 0) {
        creep.room.visual.circle(creep.pos, {fill: 'transparent', radius: 0.55, stroke: 'black'});
        return;
    }
    if (creep.memory.pathAge === null || creep.memory.pathAge === undefined || creep.memory.pathLimit === null || creep.memory.pathLimit === undefined) {
        creep.memory.pathAge = 0;
        creep.memory.pathLimit = 0;
    }
    if (!creep.memory.pathPos){
        creep.memory.pathPos = creep.pos;
    }
    if (creep.memory.pathPos.x === creep.pos.x && creep.memory.pathPos.y === creep.pos.y) {
        creep.memory.pathPosTime++;
    } else {
        creep.memory.pathPos = creep.pos;
        creep.memory.pathPosTime = 1;
    }
    if (creep.memory.pathPosTime > 3){
        creep.memory.pathAge = 999;
        creep.room.visual.circle(creep.pos, {fill: 'transparent', radius: 0.55, stroke: 'blue'});
    }
    if (creep.memory.pathAge >= creep.memory.pathLimit) {
        if (cache.getPath(creep.pos, target.pos)) {
            creep.memory.path = cache.getPath(creep.pos, target.pos);
        } else {
            creep.memory.path = creep.room.findPath(creep.pos, target.pos, {
                costCallback: function (roomName, costMatrix) {
                    const roads = creep.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_ROAD});
                    for (let i = 0; i < roads.length; i++) {
                        costMatrix.set(roads[i].pos.x, roads[i].pos.y, 0);
                    }
                    const impassible = creep.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType === OBSTACLE_OBJECT_TYPES});
                    for (let i = 0; i < impassible.length; i++) {
                        costMatrix.set(impassible[i].pos.x, impassible[i].pos.y, 255);
                    }
                    const creeps = creep.room.find(FIND_CREEPS);
                    for (let i = 0; i < creeps.length; i++) {
                        if (creep.pos.getRangeTo(creeps[i]) <= 2) {
                            costMatrix.set(creeps[i].pos.x, creeps[i].pos.y, 255);
                        }
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
                maxOps: 100000, serialize: true, ignoreCreeps: true, maxRooms: maxRooms, plainCost: 5, swampCost: 15
            });
            cache.cachePath(creep.pos, target.pos, creep.memory.path);
        }
        creep.moveByPath(creep.memory.path);
        creep.memory.pathAge = 0;
        creep.memory.pathLimit = (creep.memory.path.length + 3) / 2;
    }
    creep.memory.pathAge++;
    if (creep.moveByPath(creep.memory.path) !== OK) {
        creep.room.visual.circle(creep.pos, {fill: 'transparent', radius: 0.55, stroke: 'red'});
        creep.memory.path = creep.room.findPath(creep.pos, target.pos, {
            costCallback: function (roomName, costMatrix) {
                const roads = creep.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_ROAD});
                for (let i = 0; i < roads.length; i++) {
                    costMatrix.set(roads[i].pos.x, roads[i].pos.y, 1);
                }
                const impassible = creep.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType === OBSTACLE_OBJECT_TYPES});
                for (let i = 0; i < impassible.length; i++) {
                    costMatrix.set(impassible[i].pos.x, impassible[i].pos.y, 255);
                }
                const creeps = creep.room.find(FIND_CREEPS);
                for (let i = 0; i < creeps.length; i++) {
                    if (creep.pos.getRangeTo(creeps[i]) <= 2) {
                        costMatrix.set(creeps[i].pos.x, creeps[i].pos.y, 255);
                    }
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
            maxOps: 100000, serialize: true, ignoreCreeps: true, maxRooms: maxRooms, plainCost: 5, swampCost: 15
        });
        cache.cachePath(creep.pos, target.pos, creep.memory.path);
        creep.moveByPath(creep.memory.path);
        creep.memory.pathAge = 0;
        creep.memory.pathLimit = (creep.memory.path.length + 3) / 2;
    }
}
module.exports.Move = profiler.registerFN(Move, 'moveModule');

function MoveToPos(creep, target, exempt = false, maxRooms = 1) {
    if (creep.fatigue > 0) {
        creep.room.visual.circle(creep.pos, {fill: 'transparent', radius: 0.55, stroke: 'black'});
        return;
    }
    if (creep.memory.pathAge === null || creep.memory.pathAge === undefined || creep.memory.pathLimit === null || creep.memory.pathLimit === undefined) {
        creep.memory.pathAge = 0;
        creep.memory.pathLimit = 0;
    }
    if (creep.memory.pathAge >= creep.memory.pathLimit) {
        if (cache.getPath(creep.pos, target)) {
            creep.memory.path = cache.getPath(creep.pos, target);
        } else {
            creep.memory.path = creep.room.findPath(creep.pos, target, {
                costCallback: function (roomName, costMatrix) {
                    const roads = creep.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_ROAD});
                    for (let i = 0; i < roads.length; i++) {
                        costMatrix.set(roads[i].pos.x, roads[i].pos.y, 0);
                    }
                    const impassible = creep.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType === OBSTACLE_OBJECT_TYPES});
                    for (let i = 0; i < impassible.length; i++) {
                        costMatrix.set(impassible[i].pos.x, impassible[i].pos.y, 255);
                    }
                    const creeps = creep.room.find(FIND_CREEPS);
                    for (let i = 0; i < creeps.length; i++) {
                        if (creep.pos.getRangeTo(creeps[i]) <= 2) {
                            costMatrix.set(creeps[i].pos.x, creeps[i].pos.y, 255);
                        }
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
                maxOps: 100000, serialize: true, ignoreCreeps: true, maxRooms: maxRooms, plainCost: 5, swampCost: 15
            });
            cache.cachePath(creep.pos, target, creep.memory.path);
        }
        creep.moveByPath(creep.memory.path);
        creep.memory.pathAge = 0;
        creep.memory.pathLimit = (creep.memory.path.length + 3) / 2;
    }
    creep.memory.pathAge++;
    if (creep.moveByPath(creep.memory.path) !== OK) {
        creep.room.visual.circle(creep.pos, {fill: 'transparent', radius: 0.55, stroke: 'red'});
        creep.memory.path = creep.room.findPath(creep.pos, target, {
            costCallback: function (roomName, costMatrix) {
                const roads = creep.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_ROAD});
                for (let i = 0; i < roads.length; i++) {
                    costMatrix.set(roads[i].pos.x, roads[i].pos.y, 1);
                }
                const impassible = creep.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType === OBSTACLE_OBJECT_TYPES});
                for (let i = 0; i < impassible.length; i++) {
                    costMatrix.set(impassible[i].pos.x, impassible[i].pos.y, 255);
                }
                const creeps = creep.room.find(FIND_CREEPS);
                for (let i = 0; i < creeps.length; i++) {
                    if (creep.pos.getRangeTo(creeps[i]) <= 2) {
                        costMatrix.set(creeps[i].pos.x, creeps[i].pos.y, 255);
                    }
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
            maxOps: 100000, serialize: true, ignoreCreeps: true, maxRooms: maxRooms, plainCost: 5, swampCost: 15
        });
        cache.cachePath(creep.pos, target, creep.memory.path);
        creep.moveByPath(creep.memory.path);
        creep.memory.pathAge = 0;
        creep.memory.pathLimit = (creep.memory.path.length + 3) / 2;
    }
}
module.exports.MoveToPos = profiler.registerFN(MoveToPos, 'MoveToPosModule');


function AttackMove(creep, target) {
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
}
module.exports.AttackMove = profiler.registerFN(AttackMove, 'AttackMoveModule');



function FindPath(creep, target, serialize = false, exempt = false, maxRooms = 1) {
    return creep.room.findPath(creep.pos, target.pos, {
        costCallback: function (roomName, costMatrix) {
            const impassible = creep.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType === OBSTACLE_OBJECT_TYPES});
            for (let i = 0; i < impassible.length; i++) {
                costMatrix.set(impassible[i].pos.x, impassible[i].pos.y, 255);
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
        maxOps: 100000, serialize: serialize, ignoreCreeps: true, maxRooms: maxRooms
    });
}
module.exports.FindPath = profiler.registerFN(FindPath, 'FindPathModule');