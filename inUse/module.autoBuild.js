/**
 * Created by rober on 5/16/2017.
 */
let functions = require('module.functions');
module.exports.roomBuilding = function (spawnName) {
    let spawn = Game.spawns[spawnName];
    roadSources(spawn);
    buildExtensions(spawn);
    buildTower(spawn);
    buildStorage(spawn);
    buildLinks(spawn);
};

function roadSources(spawn) {
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

function buildExtensions(spawn) {
    for (let i = getRandomInt(-6, 6); i < 6; i++) {
        const pos = new RoomPosition(spawn.pos.x + i, spawn.pos.y - getRandomInt(-6, 6), spawn.room.name);
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

function buildTower(spawn) {
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

function buildStorage(spawn) {
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

function buildLinks(spawn) {
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

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}