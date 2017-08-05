/**
 * Created by rober on 5/16/2017.
 */
let functions = require('module.functions');
let _ = require('lodash');
const profiler = require('screeps-profiler');


let protectedStructures = [
    STRUCTURE_SPAWN,
    STRUCTURE_STORAGE,
    STRUCTURE_TOWER,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_TERMINAL,
    STRUCTURE_CONTAINER,
    STRUCTURE_NUKER,
    STRUCTURE_OBSERVER,
    STRUCTURE_LINK
];

function roomBuilding() {
    for (let name in Game.spawns) {
        let spawn = Game.spawns[name];
        if (!spawn.room.memory.primarySpawn) {
            spawn.room.memory.primarySpawn = spawn.id;
        } else if (spawn.room.memory.primarySpawn === spawn.id) {
            let structures = spawn.room.find(FIND_STRUCTURES);
            buildRoads(spawn, structures);
            buildExtensions(spawn);
            buildTower(spawn);
            buildStorage(spawn);
            buildRamparts(spawn, structures);
            borderWalls(spawn, structures);
            for (let key in Game.constructionSites) {
                let sources = spawn.room.find(FIND_SOURCES);
                if (Game.constructionSites[key].pos.checkForAllStructure().length > 0 || Game.constructionSites[key].pos.getRangeTo(sources[0]) <= 1 || Game.constructionSites[key].pos.getRangeTo(sources[1]) <= 1) {
                    if (!_.includes(protectedStructures, Game.constructionSites[key].structureType) && Game.constructionSites[key].structureType !== STRUCTURE_ROAD && Game.constructionSites[key].structureType !== STRUCTURE_RAMPART) {
                        Game.constructionSites[key].remove();
                    }
                }
            }
        }
    }
}
module.exports.roomBuilding = profiler.registerFN(roomBuilding, 'roomBuilding');

function buildRoads(spawn, structures) {
    let spawner = _.filter(structures, (s) => s.structureType === STRUCTURE_SPAWN)[0];
    let mineral = spawn.room.find(FIND_MINERALS)[0];

    for (let source of spawn.room.find(FIND_SOURCES)) {
        buildRoadAround(spawn.room, source.pos);
        buildRoadFromTo(spawn.room, spawner, source);
    }

    if (spawn.room.controller) {
        buildRoadAround(spawn.room, spawn.room.controller.pos);
        let target = spawn.room.controller.pos.findClosestByRange(FIND_SOURCES);
        if (target) {
            buildRoadFromTo(spawn.room, spawn.room.controller, target);
        }
    }

    if (mineral) {
        buildRoadAround(spawn.room, mineral.pos);
        buildRoadFromTo(spawn.room, spawner, mineral);
    }
}
buildRoads = profiler.registerFN(buildRoads, 'buildRoadsBuilder');

function buildRamparts(spawn, structures) {
    if (spawn.room.controller.level >= 4) {
        for (let store of _.filter(structures, (s) => protectedStructures.includes(s.structureType))) {
            spawn.room.createConstructionSite(store.pos, STRUCTURE_RAMPART);
        }
    }
}
buildRamparts = profiler.registerFN(buildRamparts, 'buildRampartsBuilder');

function buildExtensions(spawn) {
    if (spawn.room.controller.level >= 2) {
        if (_.filter(spawn.room.memory.structureCache, 'type', 'extension').length < spawn.room.getExtensionCount()) {
            let x;
            let y;
            for (let i = 1; i < 8; i++) {
                x = getRandomInt(-_.round(i, 0), _.round(i, 0));
                y = getRandomInt(-_.round(i, 0), _.round(i, 0));
                let pos = new RoomPosition(spawn.pos.x + x, spawn.pos.y + y, spawn.pos.roomName);
                if (pos.checkForAllStructure().length > 0 || pos.getRangeTo(spawn) === 1) continue;
                switch (pos.createConstructionSite(STRUCTURE_EXTENSION)) {
                    case OK:
                        if (pos.findInRange(FIND_STRUCTURES, 1, {filter: (s) => s.structureType === STRUCTURE_ROAD}).length > 0) continue;
                        let path = spawn.room.findPath(spawn.pos, pos, {
                            maxOps: 10000, serialize: false, ignoreCreeps: true, maxRooms: 1, ignoreRoads: false
                        });
                        for (let p = 0; p < path.length; p++) {
                            if (path[p] !== undefined) {
                                let build = new RoomPosition(path[p].x, path[p].y, spawn.room.name);
                                const roadCheck = build.lookFor(LOOK_STRUCTURES);
                                const constructionCheck = build.lookFor(LOOK_CONSTRUCTION_SITES);
                                if (constructionCheck.length > 0 || roadCheck.length > 0) {
                                } else {
                                    build.createConstructionSite(STRUCTURE_ROAD);
                                }
                            }
                        }
                        continue;
                    case ERR_RCL_NOT_ENOUGH:
                        break;
                }
            }
        }
    }
}
buildExtensions = profiler.registerFN(buildExtensions, 'buildExtensionsRoom');

function buildTower(spawn) {
    if (spawn.room.controller.level >= 3) {
        let x;
        let y;
        x = getRandomInt(-spawn.room.controller.level, spawn.room.controller.level);
        y = getRandomInt(-spawn.room.controller.level, spawn.room.controller.level);
        let pos = new RoomPosition(spawn.pos.x + x, spawn.pos.y + y, spawn.pos.roomName);
        if (pos.checkForAllStructure().length > 0) return;
        let buildReturn = pos.createConstructionSite(STRUCTURE_TOWER);
        if (buildReturn === OK) {
            if (pos.findInRange(FIND_STRUCTURES, 1, {filter: (s) => s.structureType === STRUCTURE_ROAD}).length > 0) return;
            let path = spawn.room.findPath(spawn.pos, pos, {
                maxOps: 10000, serialize: false, ignoreCreeps: true, maxRooms: 1, ignoreRoads: false
            });
            for (let i = 0; i < path.length; i++) {
                if (path[i] !== undefined) {
                    let build = new RoomPosition(path[i].x, path[i].y, spawn.room.name);
                    const roadCheck = build.lookFor(LOOK_STRUCTURES);
                    const constructionCheck = build.lookFor(LOOK_CONSTRUCTION_SITES);
                    if (constructionCheck.length > 0 || roadCheck.length > 0) {
                    } else {
                        build.createConstructionSite(STRUCTURE_ROAD);
                    }
                }
            }
        }
    }
}
buildTower = profiler.registerFN(buildTower, 'buildTowerBuilder');

function buildStorage(spawn) {
    if (spawn.room.controller.level >= 4) {
        let x;
        let y;
        x = getRandomInt(-2, 2);
        y = getRandomInt(-2, 2);
        spawn.room.createConstructionSite(spawn.pos.x + x, spawn.pos.y + y, STRUCTURE_STORAGE);
    }
}
buildStorage = profiler.registerFN(buildStorage, 'buildStorageBuilder');

function borderWalls(spawn, structures) {
    if (spawn.room.memory.borderWallCache) spawn.room.memory.borderWallCache = undefined;
    if (spawn.room.memory.borderWallPlans) {
        let wall = spawn.room.memory.borderWallPlans;
        for (let key in wall) {
            let pos = new RoomPosition(wall[key].x, wall[key].y, spawn.room.name);
            let state = pos.lookFor(LOOK_STRUCTURES);
            if (state[0] && state[0].structureType === wall[key].type) {
            } else if (!state[0]) {
                pos.createConstructionSite(wall[key].type);
            } else if (state[0] && state[0].structureType !== wall[key].type) {
                pos.createConstructionSite(wall[key].type);
            }
        }
    } else {
        let cache = spawn.room.memory.borderWallPlans || {};
        if (spawn.room.controller.level >= 3) {
            let exits = spawn.room.memory.neighboringRooms;
            let construction = spawn.room.find(FIND_CONSTRUCTION_SITES, {filter: (r) => r.structureType === STRUCTURE_RAMPART || r.structureType === STRUCTURE_WALL});
            let rampart = _.filter(structures, (r) => r.structureType === STRUCTURE_RAMPART || r.structureType === STRUCTURE_WALL);
            if (!exits) {
                spawn.room.memory.neighboringRooms = Game.map.describeExits(spawn.pos.roomName);
                borderWalls(spawn);
            }
            if (exits[1]) {
                for (let i = 0; i < 50; i++) {
                    let pos = new RoomPosition(i, 3, spawn.room.name);
                    let border = new RoomPosition(i, 0, spawn.room.name);
                    if (!border.checkForWall() && !pos.checkForWall()) {
                        let path = spawn.room.findPath(border, spawn.pos, {
                            costCallback: function (roomName, costMatrix) {
                                for (let i = 0; i < rampart.length; i++) {
                                    costMatrix.set(rampart[i].pos.x, rampart[i].pos.y, 255);
                                }
                                for (let i = 0; i < construction.length; i++) {
                                    costMatrix.set(construction[i].pos.x, construction[i].pos.y, 255);
                                }
                            },
                            maxOps: 500, serialize: false, ignoreCreeps: true, maxRooms: 1, ignoreRoads: true
                        });
                        if (path[1]) {
                            let pos = new RoomPosition(path[1].x, path[1].y, spawn.room.name);
                            let nearbyRamps = pos.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
                            let nearbyWalls = pos.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
                            const buildRamps = pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
                            const buildWalls = pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
                            const roadCheck = pos.lookFor(LOOK_STRUCTURES);
                            if ((roadCheck.length > 0 && (roadCheck[0].structureType !== STRUCTURE_WALL)) && nearbyRamps.length + buildRamps.length === 0) {
                                let key = formatPos(pos);
                                if (Memory.roomCache[key]) delete Memory.roomCache[key];
                                cache[key] = {
                                    type: STRUCTURE_RAMPART,
                                    x: pos.x,
                                    y: pos.y
                                };
                                spawn.room.memory.borderWallPlans = cache;
                            } else if (nearbyRamps.length + buildRamps.length > 0 && nearbyWalls.length + buildWalls.length === 0) {
                                let key = formatPos(pos);
                                if (Memory.roomCache[key]) delete Memory.roomCache[key];
                                cache[key] = {
                                    type: STRUCTURE_WALL,
                                    x: pos.x,
                                    y: pos.y
                                };
                                spawn.room.memory.borderWallPlans = cache;
                            } else {
                                let key = formatPos(pos);
                                if (Memory.roomCache[key]) delete Memory.roomCache[key];
                                cache[key] = {
                                    type: STRUCTURE_RAMPART,
                                    x: pos.x,
                                    y: pos.y
                                };
                                spawn.room.memory.borderWallPlans = cache;
                            }
                        }
                    }
                }
            }
            if (exits[7]) {
                for (let i = 0; i < 50; i++) {
                    let pos = new RoomPosition(3, i, spawn.room.name);
                    let border = new RoomPosition(0, i, spawn.room.name);
                    if (!border.checkForWall() && !pos.checkForWall()) {
                        let path = spawn.room.findPath(border, spawn.pos, {
                            costCallback: function (roomName, costMatrix) {
                                for (let i = 0; i < rampart.length; i++) {
                                    costMatrix.set(rampart[i].pos.x, rampart[i].pos.y, 255);
                                }
                                for (let i = 0; i < construction.length; i++) {
                                    costMatrix.set(construction[i].pos.x, construction[i].pos.y, 255);
                                }
                            },
                            maxOps: 10000, serialize: false, ignoreCreeps: true, maxRooms: 1, ignoreRoads: true
                        });
                        if (path[1]) {
                            let pos = new RoomPosition(path[1].x, path[1].y, spawn.room.name);
                            let nearbyRamps = pos.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
                            let nearbyWalls = pos.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
                            const buildRamps = pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
                            const buildWalls = pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
                            const roadCheck = pos.lookFor(LOOK_STRUCTURES);
                            if ((roadCheck.length > 0 && (roadCheck[0].structureType !== STRUCTURE_WALL)) && nearbyRamps.length + buildRamps.length === 0) {
                                let key = formatPos(pos);
                                if (Memory.roomCache[key]) delete Memory.roomCache[key];
                                cache[key] = {
                                    type: STRUCTURE_RAMPART,
                                    x: pos.x,
                                    y: pos.y
                                };
                                spawn.room.memory.borderWallPlans = cache;
                            } else if (nearbyRamps.length + buildRamps.length > 0 && nearbyWalls.length + buildWalls.length === 0) {
                                let key = formatPos(pos);
                                if (Memory.roomCache[key]) delete Memory.roomCache[key];
                                cache[key] = {
                                    type: STRUCTURE_WALL,
                                    x: pos.x,
                                    y: pos.y
                                };
                                spawn.room.memory.borderWallPlans = cache;
                            } else {
                                let key = formatPos(pos);
                                if (Memory.roomCache[key]) delete Memory.roomCache[key];
                                cache[key] = {
                                    type: STRUCTURE_RAMPART,
                                    x: pos.x,
                                    y: pos.y
                                };
                                spawn.room.memory.borderWallPlans = cache;
                            }
                        }
                    }
                }
            }
            if (exits[3]) {
                for (let i = 0; i < 50; i++) {
                    let pos = new RoomPosition(47, i, spawn.room.name);
                    let border = new RoomPosition(49, i, spawn.room.name);
                    if (!border.checkForWall() && !pos.checkForWall()) {
                        let path = spawn.room.findPath(border, spawn.pos, {
                            costCallback: function (roomName, costMatrix) {
                                for (let i = 0; i < rampart.length; i++) {
                                    costMatrix.set(rampart[i].pos.x, rampart[i].pos.y, 255);
                                }
                                for (let i = 0; i < construction.length; i++) {
                                    costMatrix.set(construction[i].pos.x, construction[i].pos.y, 255);
                                }
                            },
                            maxOps: 10000, serialize: false, ignoreCreeps: true, maxRooms: 1, ignoreRoads: true
                        });
                        if (path[1]) {
                            let pos = new RoomPosition(path[1].x, path[1].y, spawn.room.name);
                            let nearbyRamps = pos.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
                            let nearbyWalls = pos.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
                            const buildRamps = pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
                            const buildWalls = pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
                            const roadCheck = pos.lookFor(LOOK_STRUCTURES);
                            if ((roadCheck.length > 0 && (roadCheck[0].structureType !== STRUCTURE_WALL)) && nearbyRamps.length + buildRamps.length === 0) {
                                let key = formatPos(pos);
                                if (Memory.roomCache[key]) delete Memory.roomCache[key];
                                cache[key] = {
                                    type: STRUCTURE_RAMPART,
                                    x: pos.x,
                                    y: pos.y
                                };
                                spawn.room.memory.borderWallPlans = cache;
                            } else if (nearbyRamps.length + buildRamps.length > 0 && nearbyWalls.length + buildWalls.length === 0) {
                                let key = formatPos(pos);
                                if (Memory.roomCache[key]) delete Memory.roomCache[key];
                                cache[key] = {
                                    type: STRUCTURE_WALL,
                                    x: pos.x,
                                    y: pos.y
                                };
                                spawn.room.memory.borderWallPlans = cache;
                            } else {
                                let key = formatPos(pos);
                                if (Memory.roomCache[key]) delete Memory.roomCache[key];
                                cache[key] = {
                                    type: STRUCTURE_RAMPART,
                                    x: pos.x,
                                    y: pos.y
                                };
                                spawn.room.memory.borderWallPlans = cache;
                            }
                        }
                    }
                }
            }
            if (exits[5]) {
                for (let i = 0; i < 50; i++) {
                    let pos = new RoomPosition(i, 47, spawn.room.name);
                    let border = new RoomPosition(i, 49, spawn.room.name);
                    if (!border.checkForWall() && !pos.checkForWall()) {
                        let path = spawn.room.findPath(border, spawn.pos, {
                            costCallback: function (roomName, costMatrix) {
                                for (let i = 0; i < rampart.length; i++) {
                                    costMatrix.set(rampart[i].pos.x, rampart[i].pos.y, 255);
                                }
                                for (let i = 0; i < construction.length; i++) {
                                    costMatrix.set(construction[i].pos.x, construction[i].pos.y, 255);
                                }
                            },
                            maxOps: 10000, serialize: false, ignoreCreeps: true, maxRooms: 1, ignoreRoads: true
                        });
                        if (path[1]) {
                            let pos = new RoomPosition(path[1].x, path[1].y, spawn.room.name);
                            let nearbyRamps = pos.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
                            let nearbyWalls = pos.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
                            const buildRamps = pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
                            const buildWalls = pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
                            const roadCheck = pos.lookFor(LOOK_STRUCTURES);
                            if ((roadCheck.length > 0 && (roadCheck[0].structureType !== STRUCTURE_WALL)) && nearbyRamps.length + buildRamps.length === 0) {
                                let key = formatPos(pos);
                                if (Memory.roomCache[key]) delete Memory.roomCache[key];
                                cache[key] = {
                                    type: STRUCTURE_RAMPART,
                                    x: pos.x,
                                    y: pos.y
                                };
                                spawn.room.memory.borderWallPlans = cache;
                            } else if (nearbyRamps.length + buildRamps.length > 0 && nearbyWalls.length + buildWalls.length === 0) {
                                let key = formatPos(pos);
                                if (Memory.roomCache[key]) delete Memory.roomCache[key];
                                cache[key] = {
                                    type: STRUCTURE_WALL,
                                    x: pos.x,
                                    y: pos.y
                                };
                                spawn.room.memory.borderWallPlans = cache;
                            } else {
                                let key = formatPos(pos);
                                if (Memory.roomCache[key]) delete Memory.roomCache[key];
                                cache[key] = {
                                    type: STRUCTURE_RAMPART,
                                    x: pos.x,
                                    y: pos.y
                                };
                                spawn.room.memory.borderWallPlans = cache;
                            }
                        }
                    }
                }
            }
        }
    }
}
borderWalls = profiler.registerFN(borderWalls, 'borderWallsBuilder');

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function buildRoadFromTo(room, start, end) {
    let path = start.pos.findPathTo(end, {ignoreCreeps: true, ignoreRoads: true});
    for (let point of path) {
        buildRoad(new RoomPosition(point.x, point.y, room.name));
    }
}

buildRoadFromTo = profiler.registerFN(buildRoadFromTo, 'buildRoadFromToFunctionBuilder');
function buildRoadAround(room, position) {
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (xOff !== 0 || yOff !== 0) {
                buildRoad(new RoomPosition(position.x + xOff, position.y + yOff, room.name));
            }
        }
    }
}

buildRoadAround = profiler.registerFN(buildRoadAround, 'buildRoadAroundFunctionBuilder');

function buildRoad(position) {
    if (position.checkForWall() || position.checkForObstacleStructure() || position.checkForRoad()) return;
    position.createConstructionSite(STRUCTURE_ROAD);
}

buildRoad = profiler.registerFN(buildRoad, 'buildRoadFunctionBuilder');

function formatPos(pos) {
    return pos.x + pos.y;
}