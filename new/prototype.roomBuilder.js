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

Room.prototype.buildRoom = function () {
    if (Game.constructionSites.length > 75) return;
    let structures = this.find(FIND_STRUCTURES);
    if (!this.memory.extensionHub) {
        for (let key in Game.spawns) {
            if (Game.spawns[key].pos.roomName === this.name) {
                this.memory.extensionHub = {};
                this.memory.extensionHub.x = Game.spawns[key].pos.x;
                this.memory.extensionHub.y = Game.spawns[key].pos.y;
            }
        }
    }
    buildExtensions(this);
    buildRoads(this, structures);
    buildWalls(this, structures);
    buildStorage(this, structures);
    buildTowers(this, structures);
};

function buildExtensions(room) {
    let extensionCount = room.getExtensionCount();
    if (_.filter(room.memory.structureCache, 'type', 'extension').length < extensionCount) {
        let hub;
        if (extensionCount <= 30) {
            hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
        } else {
            if (room.memory.extensionHub2) {
                hub = new RoomPosition(room.memory.extensionHub2.x, room.memory.extensionHub2.y, room.name);
            } else {
                findExtensionHub(room, true);
                hub = new RoomPosition(room.memory.extensionHub2.x, room.memory.extensionHub2.y, room.name);
            }
        }
        switch (hub.createConstructionSite(STRUCTURE_SPAWN)) {
            case OK:
            case ERR_RCL_NOT_ENOUGH:
        }
        for (let i = 1; i < 8; i++) {
            let x = getRandomInt(1, 5);
            x = _.sample([x, -x]);
            let y = getRandomInt(1, 5);
            y = _.sample([y, -y]);
            let pos = new RoomPosition(hub.x + x, hub.y + y, hub.roomName);
            if (pos.checkForAllStructure().length > 0) continue;
            switch (pos.createConstructionSite(STRUCTURE_EXTENSION)) {
                case OK:
                    if (pos.findInRange(FIND_STRUCTURES, 1, {filter: (s) => s.structureType === STRUCTURE_ROAD}).length > 0) continue;
                    let path = Game.rooms[hub.roomName].findPath(hub, pos, {
                        maxOps: 10000, serialize: false, ignoreCreeps: true, maxRooms: 1, ignoreRoads: false
                    });
                    for (let p = 0; p < path.length; p++) {
                        if (path[p] !== undefined) {
                            let build = new RoomPosition(path[p].x, path[p].y, hub.roomName);
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

buildExtensions = profiler.registerFN(buildExtensions, 'buildExtensionsRoom');

function findExtensionHub(room, second = false) {
    for (let i = 1; i < 249; i++) {
        let pos = new RoomPosition(getRandomInt(8, 41), getRandomInt(8, 41), room.name);
        let closestStructure = pos.findClosestByRange(FIND_STRUCTURES);
        let terrain = Game.rooms[pos.roomName].lookForAtArea(LOOK_TERRAIN, pos.y - 4, pos.x - 4, pos.y + 4, pos.x + 4, true);
        let wall = false;
        for (let key in terrain) {
            let position = new RoomPosition(terrain[key].x, terrain[key].y, room.name);
            if (!position.checkForWall()) {
                continue;
            }
            wall = true;
            break;
        }
        if (pos.getRangeTo(closestStructure) >= 4 && wall === false) {
            if (second === false) {
                room.memory.extensionHub = {};
                room.memory.extensionHub.x = pos.x;
                room.memory.extensionHub.y = pos.y;
                return;
            } else {
                room.memory.extensionHub2 = {};
                room.memory.extensionHub2.x = pos.x;
                room.memory.extensionHub2.y = pos.y;
                return;
            }
        }
    }
}

findExtensionHub = profiler.registerFN(findExtensionHub, 'findExtensionHub');

function buildWalls(room, structures) {
    if (room.controller.level < 3) return;
    for (let store of _.filter(structures, (s) => protectedStructures.includes(s.structureType))) {
        room.createConstructionSite(store.pos, STRUCTURE_RAMPART);
    }
    let hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
    let safeZone = Game.rooms[hub.roomName].lookForAtArea(LOOK_TERRAIN, hub.y - 6, hub.x - 6, hub.y + 6, hub.x + 6, true);
    for (let key in safeZone) {
        let position = new RoomPosition(safeZone[key].x, safeZone[key].y, room.name);
        if (position.getRangeTo(hub) === 6) {
            position.createConstructionSite(STRUCTURE_RAMPART);
        }
    }
}

buildWalls = profiler.registerFN(buildWalls, 'buildWalls');

function buildStorage(room, structures) {
    if (room.controller.level < 4) return;
    let storage = _.filter(structures, (s) => s.structureType === STRUCTURE_STORAGE)[0];
    if (!storage) {
        let hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
        let safeZone = Game.rooms[hub.roomName].lookForAtArea(LOOK_TERRAIN, hub.y - 2, hub.x - 2, hub.y + 2, hub.x + 2, true);
        for (let key in safeZone) {
            let position = new RoomPosition(safeZone[key].x, safeZone[key].y, room.name);
            if (position.getRangeTo(hub) === 2) {
                if (position.checkForAllStructure().length > 0) continue;
                position.createConstructionSite(STRUCTURE_STORAGE);
            }
        }
    }
}

buildStorage = profiler.registerFN(buildStorage, 'buildStorage');

function buildTowers(room, structures) {
    if (room.controller.level < 4) return;
    let storage = _.filter(structures, (s) => s.structureType === STRUCTURE_STORAGE)[0];
    if (!storage) {
        let hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
        let safeZone = Game.rooms[hub.roomName].lookForAtArea(LOOK_TERRAIN, hub.y - 5, hub.x - 5, hub.y + 5, hub.x + 5, true);
        for (let key in safeZone) {
            let position = new RoomPosition(safeZone[key].x, safeZone[key].y, room.name);
            if (position.getRangeTo(hub) === 5) {
                if (position.checkForAllStructure().length > 0) continue;
                position.createConstructionSite(STRUCTURE_TOWER);
            }
        }
    }
}

buildTowers = profiler.registerFN(buildTowers, 'buildTowers');

function buildRoads(room, structures) {
    let spawner = _.filter(structures, (s) => s.structureType === STRUCTURE_SPAWN)[0];
    let mineral = room.find(FIND_MINERALS)[0];
    for (let source of room.find(FIND_SOURCES)) {
        buildRoadAround(room, source.pos);
        buildRoadFromTo(room, spawner, source);
    }
    if (room.controller) {
        buildRoadAround(room, room.controller.pos);
        let target = room.controller.pos.findClosestByRange(FIND_SOURCES);
        if (target) {
            buildRoadFromTo(room, room.controller, target);
        }
    }
    if (mineral) {
        buildRoadAround(room, mineral.pos);
        buildRoadFromTo(room, spawner, mineral);
    }
    if (room.memory.neighboringRooms) {
        if (room.memory.neighboringRooms['1']) {
            buildRoadFromTo(room, spawner, spawner.pos.findClosestByRange(FIND_EXIT_TOP));
        }
        if (room.memory.neighboringRooms['3']) {
            buildRoadFromTo(room, spawner, spawner.pos.findClosestByRange(FIND_EXIT_RIGHT));
        }
        if (room.memory.neighboringRooms['5']) {
            buildRoadFromTo(room, spawner, spawner.pos.findClosestByRange(FIND_EXIT_BOTTOM));
        }
        if (room.memory.neighboringRooms['7']) {
            buildRoadFromTo(room, spawner, spawner.pos.findClosestByRange(FIND_EXIT_LEFT));
        }
    }
}

buildRoads = profiler.registerFN(buildRoads, 'buildRoadsBuilder');

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

function buildRoadFromTo(room, start, end) {
    let path = start.pos.findPathTo(end, {ignoreCreeps: true, ignoreRoads: false});
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
    //if (position.checkForWall() || position.checkForObstacleStructure() || position.checkForRoad()) return;
    position.createConstructionSite(STRUCTURE_ROAD);
}

buildRoad = profiler.registerFN(buildRoad, 'buildRoadFunctionBuilder');