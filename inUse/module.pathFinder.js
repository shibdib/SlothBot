let cache = require('module.cache');
let doNotAggress = RawMemory.segments[2];
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
            let cacheWorthy = true;
            creep.memory.path = creep.room.findPath(creep.pos, target.pos, {
                costCallback: function (roomName, costMatrix) {
                    const creeps = creep.room.find(FIND_CREEPS);
                    if (creeps.length > 0) {
                        for (let i = 0; i < creeps.length; i++) {
                            if (creep.pos.getRangeTo(creeps[i]) <= 1) {
                                cacheWorthy = false;
                                costMatrix.set(creeps[i].pos.x, creeps[i].pos.y, 255);
                            }
                        }
                    }

                    for (let i = 1; i < 49; i++) {
                        let room = creep.room.name;
                        let border = (new RoomPosition(1, i, room));
                        costMatrix.set(border['x'], border['y'], 100);
                        let border2 = (new RoomPosition(i, 1, room));
                        costMatrix.set(border2['x'], border2['y'], 100);
                        let border3 = (new RoomPosition(48, i, room));
                        costMatrix.set(border3['x'], border3['y'], 100);
                        let border4 = (new RoomPosition(i, 48, room));
                        costMatrix.set(border4['x'], border4['y'], 100);
                    }

                    const hostileCreeps = creep.room.find(FIND_CREEPS, {filter: (s) => _.includes(doNotAggress, s.owner['username']) === false});
                    if (hostileCreeps.length > 0) {
                        cacheWorthy = false;
                        for (let i = 0; i < hostileCreeps.length; i++) {
                            costMatrix.set(hostileCreeps[i].pos.x, hostileCreeps[i].pos.y, 255);
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
                maxOps: 10000, serialize: true, ignoreCreeps: true, maxRooms: maxRooms, plainCost: 5, swampCost: 15
            });
            if (cacheWorthy === true) {
                cache.cachePath(creep.pos, target.pos, creep.memory.path);
            }
        }
        creep.moveByPath(creep.memory.path);
        creep.memory.pathAge = 0;
        creep.memory.pathLimit = (creep.memory.path.length + 3) / 2;
    }
    creep.memory.pathAge++;
    if (creep.moveByPath(creep.memory.path) !== OK) {
        creep.room.visual.circle(creep.pos, {fill: 'transparent', radius: 0.55, stroke: 'red'});
        let cacheWorthy = true;
        creep.memory.path = creep.room.findPath(creep.pos, target.pos, {
            costCallback: function (roomName, costMatrix) {
                const creeps = creep.room.find(FIND_CREEPS);
                if (creeps.length > 0) {
                    for (let i = 0; i < creeps.length; i++) {
                        if (creep.pos.getRangeTo(creeps[i]) <= 1) {
                            cacheWorthy = false;
                            costMatrix.set(creeps[i].pos.x, creeps[i].pos.y, 255);
                        }
                    }
                }

                for (let i = 1; i < 49; i++) {
                    let room = creep.room.name;
                    let border = (new RoomPosition(1, i, room));
                    costMatrix.set(border['x'], border['y'], 100);
                    let border2 = (new RoomPosition(i, 1, room));
                    costMatrix.set(border2['x'], border2['y'], 100);
                    let border3 = (new RoomPosition(48, i, room));
                    costMatrix.set(border3['x'], border3['y'], 100);
                    let border4 = (new RoomPosition(i, 48, room));
                    costMatrix.set(border4['x'], border4['y'], 100);
                }

                const hostileCreeps = creep.room.find(FIND_CREEPS, {filter: (s) => _.includes(doNotAggress, s.owner['username']) === false});
                if (hostileCreeps.length > 0) {
                    cacheWorthy = false;
                    for (let i = 0; i < hostileCreeps.length; i++) {
                        costMatrix.set(hostileCreeps[i].pos.x, hostileCreeps[i].pos.y, 255);
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
            maxOps: 10000, serialize: true, ignoreCreeps: true, maxRooms: maxRooms, plainCost: 5, swampCost: 15
        });
        if (cacheWorthy === true) {
            cache.cachePath(creep.pos, target.pos, creep.memory.path);
        }
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
            let cacheWorthy = true;
            creep.memory.path = creep.room.findPath(creep.pos, target, {
                costCallback: function (roomName, costMatrix) {
                    const creeps = creep.room.find(FIND_CREEPS);
                    if (creeps.length > 0) {
                        for (let i = 0; i < creeps.length; i++) {
                            if (creep.pos.getRangeTo(creeps[i]) <= 1) {
                                cacheWorthy = false;
                                costMatrix.set(creeps[i].pos.x, creeps[i].pos.y, 255);
                            }
                        }
                    }

                    for (let i = 1; i < 49; i++) {
                        let room = creep.room.name;
                        let border = (new RoomPosition(1, i, room));
                        costMatrix.set(border['x'], border['y'], 100);
                        let border2 = (new RoomPosition(i, 1, room));
                        costMatrix.set(border2['x'], border2['y'], 100);
                        let border3 = (new RoomPosition(48, i, room));
                        costMatrix.set(border3['x'], border3['y'], 100);
                        let border4 = (new RoomPosition(i, 48, room));
                        costMatrix.set(border4['x'], border4['y'], 100);
                    }

                    const hostileCreeps = creep.room.find(FIND_CREEPS, {filter: (s) => _.includes(doNotAggress, s.owner['username']) === false});
                    if (hostileCreeps.length > 0) {
                        cacheWorthy = false;
                        for (let i = 0; i < hostileCreeps.length; i++) {
                            costMatrix.set(hostileCreeps[i].pos.x, hostileCreeps[i].pos.y, 255);
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
                maxOps: 10000, serialize: true, ignoreCreeps: true, maxRooms: maxRooms, plainCost: 5, swampCost: 15
            });
            if (cacheWorthy === true) {
                cache.cachePath(creep.pos, target, creep.memory.path);
            }
        }
        creep.moveByPath(creep.memory.path);
        creep.memory.pathAge = 0;
        creep.memory.pathLimit = (creep.memory.path.length + 3) / 2;
    }
    creep.memory.pathAge++;
    if (creep.moveByPath(creep.memory.path) !== OK) {
        creep.room.visual.circle(creep.pos, {fill: 'transparent', radius: 0.55, stroke: 'red'});
        let cacheWorthy = true;
        creep.memory.path = creep.room.findPath(creep.pos, target, {
            costCallback: function (roomName, costMatrix) {
                const creeps = creep.room.find(FIND_CREEPS);
                if (creeps.length > 0) {
                    for (let i = 0; i < creeps.length; i++) {
                        if (creep.pos.getRangeTo(creeps[i]) <= 1) {
                            cacheWorthy = false;
                            costMatrix.set(creeps[i].pos.x, creeps[i].pos.y, 255);
                        }
                    }
                }

                for (let i = 1; i < 49; i++) {
                    let room = creep.room.name;
                    let border = (new RoomPosition(1, i, room));
                    costMatrix.set(border['x'], border['y'], 100);
                    let border2 = (new RoomPosition(i, 1, room));
                    costMatrix.set(border2['x'], border2['y'], 100);
                    let border3 = (new RoomPosition(48, i, room));
                    costMatrix.set(border3['x'], border3['y'], 100);
                    let border4 = (new RoomPosition(i, 48, room));
                    costMatrix.set(border4['x'], border4['y'], 100);
                }

                const hostileCreeps = creep.room.find(FIND_CREEPS, {filter: (s) => _.includes(doNotAggress, s.owner['username']) === false});
                if (hostileCreeps.length > 0) {
                    cacheWorthy = false;
                    for (let i = 0; i < hostileCreeps.length; i++) {
                        costMatrix.set(hostileCreeps[i].pos.x, hostileCreeps[i].pos.y, 255);
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
            maxOps: 10000, serialize: true, ignoreCreeps: true, maxRooms: maxRooms, plainCost: 5, swampCost: 15
        });
        if (cacheWorthy === true) {
            cache.cachePath(creep.pos, target, creep.memory.path);
        }
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
    if (creep.moveByPath(creep.memory.path) !== OK) {
        creep.memory.path = creep.room.findPath(creep.pos, target.pos, {
            maxOps: 10000, serialize: true, ignoreCreeps: false, ignoreDestructibleStructures: true
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
        maxOps: 10000, serialize: serialize, ignoreCreeps: true, maxRooms: maxRooms
    });
}
module.exports.FindPath = profiler.registerFN(FindPath, 'FindPathModule');