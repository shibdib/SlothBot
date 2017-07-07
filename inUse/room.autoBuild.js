/**
 * Created by rober on 5/16/2017.
 */
let functions = require('module.functions');
const profiler = require('screeps-profiler');


let constructionSites = _.filter(Game.constructionSites);

function roomBuilding() {
    for (let name in Game.spawns) {
        let spawn = Game.spawns[name];
        if (!spawn.room.memory.primarySpawn) {
            spawn.room.memory.primarySpawn = spawn.id;
        } else if (spawn.room.memory.primarySpawn === spawn.id) {
            roadSources(spawn);
            buildExtensions(spawn);
            buildTower(spawn);
            buildStorage(spawn);
            borderWalls(spawn);
            for (let key in Game.constructionSites) {
                let sources = spawn.room.find(FIND_SOURCES);
                if (Game.constructionSites[key].pos.checkForObstacleStructure() || Game.constructionSites[key].pos.getRangeTo(sources[0]) <= 1|| Game.constructionSites[key].pos.getRangeTo(sources[1]) <= 1 || Game.constructionSites[key].pos.checkForRoad()) {
                    if (Game.constructionSites[key].structureType !== STRUCTURE_CONTAINER) {
                        Game.constructionSites[key].remove();
                    }
                }
            }
        }
    }
}
module.exports.roomBuilding = profiler.registerFN(roomBuilding, 'roomBuilding');

function roadSources(spawn) {
    if (constructionSites.length > 30) {
        if (spawn.room.controller.level >= 3) {
            const sources = spawn.room.find(FIND_SOURCES);
            for (let i = 0; i < sources.length; i++) {
                let path = spawn.room.findPath(spawn.pos, sources[i].pos, {
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
}
roadSources = profiler.registerFN(roadSources, 'roadSourcesBuilder');

function roadSpawns(spawn) {
    if (constructionSites.length > 30) {
        if (spawn.room.controller.level >= 6) {
            let spawns = _.filter(Game.spawns, (s) => s.pos.roomName !== spawn.pos.roomName);
            for (let i = 0; i < spawns.length; i++) {
                let path = spawn.room.findPath(spawn.pos, spawns[i].pos, {
                    maxOps: 10000, serialize: false, ignoreCreeps: true, maxRooms: 16, ignoreRoads: false
                });
                let z = 0;
                for (let i = 0; i < path.length; i++) {
                    if (path[i] !== undefined) {
                        if (z > 10) {
                            return;
                        }
                        let build = new RoomPosition(path[i].x, path[i].y, spawn.room.name);
                        const roadCheck = build.lookFor(LOOK_STRUCTURES);
                        const constructionCheck = build.lookFor(LOOK_CONSTRUCTION_SITES);
                        if (constructionCheck.length > 0 || roadCheck.length > 0) {
                        } else {
                            build.createConstructionSite(STRUCTURE_ROAD);
                            z++;
                        }
                    }
                }
            }
        }
    }
}
roadSpawns = profiler.registerFN(roadSpawns, 'roadSpawnsBuilder');

function buildExtensions(spawn) {
    let x;
    let y;
    for (let i = 1; i < 5; i++) {
        x = getRandomInt(-spawn.room.controller.level, spawn.room.controller.level);
        y = getRandomInt(-spawn.room.controller.level, spawn.room.controller.level);
        if (spawn.room.createConstructionSite(spawn.pos.x + x, spawn.pos.y + y, STRUCTURE_EXTENSION) === OK) {
            spawn.room.createConstructionSite(spawn.pos.x + x - 1, spawn.pos.y + y, STRUCTURE_ROAD);
            spawn.room.createConstructionSite(spawn.pos.x + x, spawn.pos.y + y - 1, STRUCTURE_ROAD);
            spawn.room.createConstructionSite(spawn.pos.x + x + 1, spawn.pos.y + y, STRUCTURE_ROAD);
            spawn.room.createConstructionSite(spawn.pos.x + x, spawn.pos.y + y + 1, STRUCTURE_ROAD);
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
        spawn.room.createConstructionSite(spawn.pos.x + x, spawn.pos.y + y, STRUCTURE_TOWER);
    }
}
buildTower = profiler.registerFN(buildTower, 'buildTowerBuilder');

function buildStorage(spawn) {
    if (spawn.room.controller.level >= 4) {
        let x;
        let y;
        x = getRandomInt(-spawn.room.controller.level, spawn.room.controller.level);
        y = getRandomInt(-spawn.room.controller.level, spawn.room.controller.level);
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

function borderWalls(spawn) {
    if (spawn.room.controller.level >= 3) {
        for (let i = 0; i < 50; i++) {
            let pos = new RoomPosition(i, 3, spawn.room.name);
            let border = new RoomPosition(i, 0, spawn.room.name);
            if (Game.map.getTerrainAt(border) !== 'wall' && Game.map.getTerrainAt(pos) !== 'wall') {
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
                    let build = new RoomPosition(path[1].x, path[1].y, spawn.room.name);
                    let nearbyRamps = build.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
                    let nearbyWalls = build.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
                    const buildRamps = build.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
                    const buildWalls = build.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
                    const roadCheck = build.lookFor(LOOK_STRUCTURES);
                    const constructionCheck = build.lookFor(LOOK_CONSTRUCTION_SITES);
                    if (roadCheck.length > 0 && roadCheck[0].structureType === STRUCTURE_WALL) {
                        spawn.memory.wallCheck = false;
                    } else if (constructionCheck.length > 0) {
                        spawn.memory.wallCheck = false;
                    } else if (roadCheck.length > 0 && (roadCheck[0].structureType !== STRUCTURE_WALL || roadCheck[0].structureType !== STRUCTURE_RAMPART)) {
                        build.createConstructionSite(STRUCTURE_RAMPART);
                        spawn.memory.wallCheck = false;
                    } else if (nearbyRamps.length + buildRamps.length > 0 && nearbyWalls.length + buildWalls.length === 0) {
                        build.createConstructionSite(STRUCTURE_WALL);
                        spawn.memory.wallCheck = false;
                    } else {
                        build.createConstructionSite(STRUCTURE_RAMPART);
                        spawn.memory.wallCheck = false;
                    }
                }
            }
            let pos2 = new RoomPosition(3, i, spawn.room.name);
            let border2 = new RoomPosition(0, i, spawn.room.name);
            if (Game.map.getTerrainAt(border2) !== 'wall' && Game.map.getTerrainAt(pos2) !== 'wall') {
                let path = spawn.room.findPath(border2, spawn.pos, {
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
                    let build = new RoomPosition(path[1].x, path[1].y, spawn.room.name);
                    let nearbyRamps = build.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
                    let nearbyWalls = build.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
                    const buildRamps = build.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
                    const buildWalls = build.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
                    const roadCheck = build.lookFor(LOOK_STRUCTURES);
                    const constructionCheck = build.lookFor(LOOK_CONSTRUCTION_SITES);
                    if (roadCheck.length > 0 && roadCheck[0].structureType === STRUCTURE_WALL) {
                        spawn.memory.wallCheck = false;
                    } else if (constructionCheck.length > 0) {
                        spawn.memory.wallCheck = false;
                    } else if (roadCheck.length > 0 && (roadCheck[0].structureType !== STRUCTURE_WALL || roadCheck[0].structureType !== STRUCTURE_RAMPART)) {
                        build.createConstructionSite(STRUCTURE_RAMPART);
                        spawn.memory.wallCheck = false;
                    } else if (nearbyRamps.length + buildRamps.length > 0 && nearbyWalls.length + buildWalls.length === 0) {
                        build.createConstructionSite(STRUCTURE_WALL);
                        spawn.memory.wallCheck = false;
                    } else {
                        build.createConstructionSite(STRUCTURE_RAMPART);
                        spawn.memory.wallCheck = false;
                    }
                }
            }
            let pos3 = new RoomPosition(47, i, spawn.room.name);
            let border3 = new RoomPosition(49, i, spawn.room.name);
            if (Game.map.getTerrainAt(border3) !== 'wall' && Game.map.getTerrainAt(pos3) !== 'wall') {
                let path = spawn.room.findPath(border3, spawn.pos, {
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
                    let build = new RoomPosition(path[1].x, path[1].y, spawn.room.name);
                    let nearbyRamps = build.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
                    let nearbyWalls = build.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
                    const buildRamps = build.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
                    const buildWalls = build.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
                    const roadCheck = build.lookFor(LOOK_STRUCTURES);
                    const constructionCheck = build.lookFor(LOOK_CONSTRUCTION_SITES);
                    if (roadCheck.length > 0 && roadCheck[0].structureType === STRUCTURE_WALL) {
                        spawn.memory.wallCheck = false;
                    } else if (constructionCheck.length > 0) {
                        spawn.memory.wallCheck = false;
                    } else if (roadCheck.length > 0 && (roadCheck[0].structureType !== STRUCTURE_WALL || roadCheck[0].structureType !== STRUCTURE_RAMPART)) {
                        build.createConstructionSite(STRUCTURE_RAMPART);
                        spawn.memory.wallCheck = false;
                    } else if (nearbyRamps.length + buildRamps.length > 0 && nearbyWalls.length + buildWalls.length === 0) {
                        build.createConstructionSite(STRUCTURE_WALL);
                        spawn.memory.wallCheck = false;
                    } else {
                        build.createConstructionSite(STRUCTURE_RAMPART);
                        spawn.memory.wallCheck = false;
                    }
                }
            }
            let pos4 = new RoomPosition(i, 47, spawn.room.name);
            let border4 = new RoomPosition(i, 49, spawn.room.name);
            if (Game.map.getTerrainAt(border4) !== 'wall' && Game.map.getTerrainAt(pos4) !== 'wall') {
                let path = spawn.room.findPath(border4, spawn.pos, {
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
                    let build = new RoomPosition(path[1].x, path[1].y, spawn.room.name);
                    let nearbyRamps = build.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
                    let nearbyWalls = build.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
                    const buildRamps = build.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
                    const buildWalls = build.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
                    const roadCheck = build.lookFor(LOOK_STRUCTURES);
                    const constructionCheck = build.lookFor(LOOK_CONSTRUCTION_SITES);
                    if (roadCheck.length > 0 && roadCheck[0].structureType === STRUCTURE_WALL) {
                        spawn.memory.wallCheck = false;
                    } else if (constructionCheck.length > 0) {
                        spawn.memory.wallCheck = false;
                    } else if (roadCheck.length > 0 && (roadCheck[0].structureType !== STRUCTURE_WALL || roadCheck[0].structureType !== STRUCTURE_RAMPART)) {
                        build.createConstructionSite(STRUCTURE_RAMPART);
                        spawn.memory.wallCheck = false;
                    } else if (nearbyRamps.length + buildRamps.length > 0 && nearbyWalls.length + buildWalls.length === 0) {
                        build.createConstructionSite(STRUCTURE_WALL);
                        spawn.memory.wallCheck = false;
                    } else {
                        build.createConstructionSite(STRUCTURE_RAMPART);
                        spawn.memory.wallCheck = false;
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