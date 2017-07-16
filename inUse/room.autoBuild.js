/**
 * Created by rober on 5/16/2017.
 */
let functions = require('module.functions');
let _ = require('lodash');
const profiler = require('screeps-profiler');


let constructionSites = _.filter(Game.constructionSites);
let protectedStructures = [
    STRUCTURE_SPAWN,
    STRUCTURE_STORAGE,
    STRUCTURE_TOWER,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_TERMINAL,
    STRUCTURE_CONTAINER,
    STRUCTURE_NUKER,
    STRUCTURE_OBSERVER
];

function roomBuilding() {
    for (let name in Game.spawns) {
        let spawn = Game.spawns[name];
        if (!spawn.room.memory.primarySpawn) {
            spawn.room.memory.primarySpawn = spawn.id;
        } else if (spawn.room.memory.primarySpawn === spawn.id) {
            buildRoads(spawn);
            buildExtensions(spawn);
            buildTower(spawn);
            buildStorage(spawn);
            buildRamparts(spawn);

            if (Game.time % 300 === 0) {
                borderWalls(spawn);
            }
            for (let key in Game.constructionSites) {
                let sources = spawn.room.find(FIND_SOURCES);
                if (Game.constructionSites[key].pos.checkForAllStructure().length > 0 || Game.constructionSites[key].pos.getRangeTo(sources[0]) <= 1 || Game.constructionSites[key].pos.getRangeTo(sources[1]) <= 1) {
                    if (!_.includes(protectedStructures, Game.constructionSites[key].structureType) || Game.constructionSites[key].structureType === STRUCTURE_ROAD) {
                        Game.constructionSites[key].remove();
                    }
                }
            }
        }
    }
}
module.exports.roomBuilding = profiler.registerFN(roomBuilding, 'roomBuilding');

function buildRoads(spawn) {
    let spawner = spawn.room.find(FIND_MY_SPAWNS)[0];

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
}
buildRoads = profiler.registerFN(buildRoads, 'buildRoadsBuilder');

function buildRamparts(spawn) {
    if (spawn.room.controller.level >= 4) {
        for (let store of spawn.room.find(FIND_STRUCTURES, {filter: (s) => protectedStructures.includes(s.structureType)})) {
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
            for (let i = 1; i < 5; i++) {
                x = getRandomInt(-spawn.room.controller.level, spawn.room.controller.level);
                y = getRandomInt(-spawn.room.controller.level, spawn.room.controller.level);
                let pos = new RoomPosition(spawn.pos.x + x, spawn.pos.y + y, spawn.pos.roomName);
                if (pos.checkForAllStructure().length > 0) continue;
                switch (pos.createConstructionSite(STRUCTURE_EXTENSION)) {
                    case OK:
                        if (pos.findInRange(FIND_STRUCTURES, 1, {filter: (s) => s.structureType === STRUCTURE_ROAD}).length > 0) continue;
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

function buildLinks(spawn) {
    if (spawn.room.controller.level >= 5) {
        let storage = spawn.room.find(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE});
        let containers = spawn.room.find(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER});
        if (storage.length > 0) {
            let storageLink = storage[0].pos.findInRange(FIND_STRUCTURES, 1, {filter: (s) => s.structureType === STRUCTURE_LINK});
            let storageLinkInBuild = storage[0].pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (s) => s.structureType === STRUCTURE_LINK});
            if (storageLink.length === 0 && storageLinkInBuild.length === 0) {
                const pos = new RoomPosition(storage[0].pos.x + 1, storage[0].pos.y, storage[0].room.name);
                const pos2 = new RoomPosition(storage[0].pos.x - 1, storage[0].pos.y, storage[0].room.name);
                if (functions.checkPos(pos) !== false) {
                    pos.createConstructionSite(STRUCTURE_LINK);
                } else if (functions.checkPos(pos2) !== false) {
                    pos2.createConstructionSite(STRUCTURE_LINK);
                }
                return null;
            } else if (containers.length > 0) {
                for (let i = 0; i < containers.length; i++) {
                    let containerLink = containers[i].pos.findInRange(FIND_STRUCTURES, 1, {filter: (s) => s.structureType === STRUCTURE_LINK});
                    let containerLinkInBuild = storage[0].pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (s) => s.structureType === STRUCTURE_LINK});
                    if (containerLink.length === 0 && containerLinkInBuild.length === 0) {
                        const pos = new RoomPosition(containers[i].pos.x + 1, containers[i].pos.y, containers[i].room.name);
                        const pos2 = new RoomPosition(containers[i].pos.x - 1, containers[i].pos.y, containers[i].room.name);
                        if (functions.checkPos(pos) !== false) {
                            pos.createConstructionSite(STRUCTURE_LINK);
                        } else if (functions.checkPos(pos2) !== false) {
                            pos2.createConstructionSite(STRUCTURE_LINK);
                        }
                        return null;
                    }
                }
            }
        }
    }
}
buildLinks = profiler.registerFN(buildLinks, 'buildLinksBuilder');

function innerWalls(spawn) {
    if (spawn.room.controller.level >= 3) {
        let build = spawn.room.lookForAtArea(LOOK_STRUCTURES, spawn.pos.y - 9, spawn.pos.x - 9, spawn.pos.y + 9, spawn.pos.x + 9, true);
        for (let i = 0; i < build.length; i++) {
            let pos = new RoomPosition(build[i].x, build[i].y, spawn.pos.roomName);
            if (spawn.pos.getRangeTo(pos) === 9 && !pos.checkForWall()) {
                let nearbyRamps = pos.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
                let nearbyWalls = pos.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
                const buildRamps = pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
                const buildWalls = pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
                const roadCheck = pos.lookFor(LOOK_STRUCTURES);
                if (roadCheck.length > 0 && (roadCheck[0].structureType !== STRUCTURE_WALL || roadCheck[0].structureType !== STRUCTURE_RAMPART)) {
                    pos.createConstructionSite(STRUCTURE_RAMPART);
                } else if (nearbyRamps.length + buildRamps.length > 0 && nearbyWalls.length + buildWalls.length === 0) {
                    pos.createConstructionSite(STRUCTURE_WALL);
                } else {
                    pos.createConstructionSite(STRUCTURE_RAMPART);
                }
            }
        }
    }
}
innerWalls = profiler.registerFN(innerWalls, 'innerWallsBuilder');

function borderWalls(spawn) {
    if (spawn.room.controller.level >= 3) {
        let exits = spawn.room.memory.neighboringRooms;
        if (exits[1]) {
            for (let i = 0; i < 50; i++) {
                let pos = new RoomPosition(i, 3, spawn.room.name);
                let border = new RoomPosition(i, 0, spawn.room.name);
                if (!border.checkForWall() && !pos.checkForWall()) {
                    let path = spawn.room.findPath(border, spawn.pos, {
                        costCallback: function (roomName, costMatrix) {
                            const rampart = spawn.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_RAMPART || r.structureType === STRUCTURE_WALL});
                            for (let i = 0; i < rampart.length; i++) {
                                costMatrix.set(rampart[i].pos.x, rampart[i].pos.y, 255);
                            }
                            const construction = spawn.room.find(FIND_CONSTRUCTION_SITES, {filter: (r) => r.structureType === STRUCTURE_RAMPART || r.structureType === STRUCTURE_WALL});
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
                        if (roadCheck.length > 0 && (roadCheck[0].structureType !== STRUCTURE_WALL || roadCheck[0].structureType !== STRUCTURE_RAMPART)) {
                            pos.createConstructionSite(STRUCTURE_RAMPART);
                        } else if (nearbyRamps.length + buildRamps.length > 0 && nearbyWalls.length + buildWalls.length === 0) {
                            pos.createConstructionSite(STRUCTURE_WALL);
                        } else {
                            pos.createConstructionSite(STRUCTURE_RAMPART);
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
                            const rampart = spawn.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_RAMPART || r.structureType === STRUCTURE_WALL});
                            for (let i = 0; i < rampart.length; i++) {
                                costMatrix.set(rampart[i].pos.x, rampart[i].pos.y, 255);
                            }
                            const construction = spawn.room.find(FIND_CONSTRUCTION_SITES, {filter: (r) => r.structureType === STRUCTURE_RAMPART || r.structureType === STRUCTURE_WALL});
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
                        if (roadCheck.length > 0 && (roadCheck[0].structureType !== STRUCTURE_WALL || roadCheck[0].structureType !== STRUCTURE_RAMPART)) {
                            pos.createConstructionSite(STRUCTURE_RAMPART);
                        } else if (nearbyRamps.length + buildRamps.length > 0 && nearbyWalls.length + buildWalls.length === 0) {
                            pos.createConstructionSite(STRUCTURE_WALL);
                        } else {
                            pos.createConstructionSite(STRUCTURE_RAMPART);
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
                            const rampart = spawn.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_RAMPART || r.structureType === STRUCTURE_WALL});
                            for (let i = 0; i < rampart.length; i++) {
                                costMatrix.set(rampart[i].pos.x, rampart[i].pos.y, 255);
                            }
                            const construction = spawn.room.find(FIND_CONSTRUCTION_SITES, {filter: (r) => r.structureType === STRUCTURE_RAMPART || r.structureType === STRUCTURE_WALL});
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
                        if (roadCheck.length > 0 && (roadCheck[0].structureType !== STRUCTURE_WALL || roadCheck[0].structureType !== STRUCTURE_RAMPART)) {
                            pos.createConstructionSite(STRUCTURE_RAMPART);
                        } else if (nearbyRamps.length + buildRamps.length > 0 && nearbyWalls.length + buildWalls.length === 0) {
                            pos.createConstructionSite(STRUCTURE_WALL);
                        } else {
                            pos.createConstructionSite(STRUCTURE_RAMPART);
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
                            const rampart = spawn.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_RAMPART || r.structureType === STRUCTURE_WALL});
                            for (let i = 0; i < rampart.length; i++) {
                                costMatrix.set(rampart[i].pos.x, rampart[i].pos.y, 255);
                            }
                            const construction = spawn.room.find(FIND_CONSTRUCTION_SITES, {filter: (r) => r.structureType === STRUCTURE_RAMPART || r.structureType === STRUCTURE_WALL});
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
                        if (roadCheck.length > 0 && (roadCheck[0].structureType !== STRUCTURE_WALL || roadCheck[0].structureType !== STRUCTURE_RAMPART)) {
                            pos.createConstructionSite(STRUCTURE_RAMPART);
                        } else if (nearbyRamps.length + buildRamps.length > 0 && nearbyWalls.length + buildWalls.length === 0) {
                            pos.createConstructionSite(STRUCTURE_WALL);
                        } else {
                            pos.createConstructionSite(STRUCTURE_RAMPART);
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
function buildRoadAround(room, position) {
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (xOff !== 0 || yOff !== 0) {
                buildRoad(new RoomPosition(position.x + xOff, position.y + yOff, room.name));
            }
        }
    }
}
function buildRoad(position) {
    const roadableStructures = [
        STRUCTURE_RAMPART,
        STRUCTURE_CONTAINER
    ];
    if (_.any(position.lookFor(LOOK_STRUCTURES), (s) => !roadableStructures.includes(s.structureType))) return;
    position.createConstructionSite(STRUCTURE_ROAD);
}