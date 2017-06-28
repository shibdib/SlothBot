/**
 * Created by rober on 5/16/2017.
 */
let functions = require('module.functions');
const profiler = require('screeps-profiler');


let constructionSites = _.filter(Game.constructionSites);

module.exports.roomBuilding = function (spawnName) {
    let spawn = Game.spawns[spawnName];
    roadSources(spawn);
    roadSpawns(spawn);
    buildExtensions(spawn);
    buildTower(spawn);
    buildStorage(spawn);
    buildLinks(spawn);
    //borderWalls(spawn);
};

function roadSources(spawn) {
    if (constructionSites.length > 30) {
        if (spawn.room.controller.level >= 3) {
            const sources = spawn.room.find(FIND_SOURCES);
            for (i = 0; i < sources.length; i++) {
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


// TODO redo this so they're closer together
function buildExtensions(spawn) {
    for (let i = getRandomInt(-12, 12); i < 12; i++) {
        const pos = new RoomPosition(spawn.pos.x + i, spawn.pos.y - getRandomInt(-12, 12), spawn.room.name);
        const pos2 = new RoomPosition(pos.x + 1, pos.y + 1, spawn.room.name);
        const pos3 = new RoomPosition(pos.x + 1, pos.y - 1, spawn.room.name);
        const pos4 = new RoomPosition(pos.x + 1, pos.y, spawn.room.name);
        const pos5 = new RoomPosition(pos.x - 1, pos.y + 1, spawn.room.name);
        const pos6 = new RoomPosition(pos.x - 1, pos.y - 1, spawn.room.name);
        const pos7 = new RoomPosition(pos.x - 1, pos.y, spawn.room.name);
        const pos8 = new RoomPosition(pos.x, pos.y - 1, spawn.room.name);
        const pos9 = new RoomPosition(pos.x, pos.y + 1, spawn.room.name);
        if (functions.checkPos(pos) === false || functions.checkPos(pos2) === false || functions.checkPos(pos3) === false || functions.checkPos(pos4) === false || functions.checkPos(pos5) === false || functions.checkPos(pos6) === false || functions.checkPos(pos7) === false || functions.checkPos(pos8) === false || functions.checkPos(pos9) === false) {
            continue;
        }
        if (pos.createConstructionSite(STRUCTURE_EXTENSION) !== OK) {
            break;
        }
        pos4.createConstructionSite(STRUCTURE_ROAD);
        pos7.createConstructionSite(STRUCTURE_ROAD);
        pos8.createConstructionSite(STRUCTURE_ROAD);
        pos9.createConstructionSite(STRUCTURE_ROAD);
        pos2.createConstructionSite(STRUCTURE_EXTENSION);
        pos3.createConstructionSite(STRUCTURE_EXTENSION);
        pos5.createConstructionSite(STRUCTURE_EXTENSION);
        pos6.createConstructionSite(STRUCTURE_EXTENSION);
        break;
    }
}
buildExtensions = profiler.registerFN(buildExtensions, 'buildExtensionsBuilder');

function buildTower(spawn) {
    if (spawn.room.controller.level >= 3) {
        for (let i = getRandomInt(-3, 3); i < 6; i++) {
            const pos = new RoomPosition(spawn.pos.x + i, spawn.pos.y - getRandomInt(-3, 3), spawn.room.name);
            const pos4 = new RoomPosition(pos.x + 1, pos.y, spawn.room.name);
            const pos7 = new RoomPosition(pos.x - 1, pos.y, spawn.room.name);
            const pos8 = new RoomPosition(pos.x, pos.y - 1, spawn.room.name);
            const pos9 = new RoomPosition(pos.x, pos.y + 1, spawn.room.name);
            if (functions.checkPos(pos) === false || functions.checkPos(pos4) === false || functions.checkPos(pos7) === false || functions.checkPos(pos8) === false || functions.checkPos(pos9) === false) {
                continue;
            }
            if (pos.createConstructionSite(STRUCTURE_TOWER) !== OK) {
                break;
            }
            pos4.createConstructionSite(STRUCTURE_ROAD);
            pos7.createConstructionSite(STRUCTURE_ROAD);
            pos8.createConstructionSite(STRUCTURE_ROAD);
            pos9.createConstructionSite(STRUCTURE_ROAD);
            break;
        }
    }
}
buildTower = profiler.registerFN(buildTower, 'buildTowerBuilder');

function buildStorage(spawn) {
    if (spawn.room.controller.level >= 4) {
        let pos = new RoomPosition(spawn.room.controller.pos.x, spawn.room.controller.pos.y - 4, spawn.room.name);
        if (Game.map.getTerrainAt(pos) !== 'wall') {
            if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
                pos.createConstructionSite(STRUCTURE_STORAGE);
            }
        } else {
            let pos = new RoomPosition(spawn.room.controller.pos.x, spawn.room.controller.pos.y + 4, spawn.room.name);
            if (Game.map.getTerrainAt(pos) !== 'wall') {
                if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
                    pos.createConstructionSite(STRUCTURE_STORAGE);
                }
            } else {
                let pos = new RoomPosition(spawn.room.controller.pos.x - 4, spawn.room.controller.pos.y, spawn.room.name);
                if (Game.map.getTerrainAt(pos) !== 'wall') {
                    if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
                        pos.createConstructionSite(STRUCTURE_STORAGE);
                    }
                } else {
                    let pos = new RoomPosition(spawn.room.controller.pos.x + 4, spawn.room.controller.pos.y, spawn.room.name);
                    if (Game.map.getTerrainAt(pos) !== 'wall') {
                        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
                            pos.createConstructionSite(STRUCTURE_STORAGE);
                        }
                    }
                }
            }
        }
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
        for (i = 0; i < 50; i++) {
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