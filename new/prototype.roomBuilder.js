let protectedStructures = [
    STRUCTURE_SPAWN,
    STRUCTURE_STORAGE,
    STRUCTURE_TOWER,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_TERMINAL,
    STRUCTURE_CONTAINER,
    STRUCTURE_NUKER,
    STRUCTURE_OBSERVER,
    STRUCTURE_LINK,
    STRUCTURE_LAB
];

Room.prototype.buildRoom = function () {
    if (!this.memory.extensionHub || !this.memory.extensionHub.x) findExtensionHub(this);
    if (_.size(Game.constructionSites) > 75) return;
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
    controllerSupplier(this, structures);
    buildExtensions(this);
    buildLinks(this, structures);
    buildStorage(this, structures);
    buildTerminal(this, structures);
    buildTowers(this, structures);
    buildLabs(this, structures);
    buildNuker(this, structures);
    buildObserver(this, structures);
    buildPowerSpawn(this, structures);
    buildExtractor(this, structures);
    if (_.size(Game.constructionSites) > 50) return;
    buildWalls(this, structures);
    buildRoads(this, structures);
};

function buildExtensions(room) {
    let extensionCount = room.getExtensionCount();
    if (!room.memory.extensionHub || !room.memory.extensionHub.x) return findExtensionHub(room);
    let hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
    switch (hub.createConstructionSite(STRUCTURE_SPAWN)) {
        case OK:
            break;
        case ERR_RCL_NOT_ENOUGH:
    }
    if (_.filter(room.structures, (s) => s.structureType === STRUCTURE_EXTENSION).length < extensionCount) {
        for (let i = 1; i < 8; i++) {
            let x;
            let y;
            x = getRandomInt(1, 5);
            y = getRandomInt(1, 5);
            if (extensionCount >= 60) {
                x = getRandomInt(7, 8);
                y = getRandomInt(7, 8);
            }
            x = _.sample([x, -x]);
            y = _.sample([y, -y]);
            let pos = new RoomPosition(hub.x + x, hub.y + y, hub.roomName);
            if (pos.checkForAllStructure().length > 0) continue;
            switch (pos.createConstructionSite(STRUCTURE_EXTENSION)) {
                case OK:
                    if (_.filter(pos.findInRange(FIND_STRUCTURES, 1), (s) => s.structureType === STRUCTURE_ROAD).length > 0) continue;
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

function findExtensionHub(room) {
    for (let i = 1; i < 249; i++) {
        let inBuildSpawn = _.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_SPAWN && s.my)[0];
        if (inBuildSpawn) {
            room.memory.extensionHub = {};
            room.memory.extensionHub.x = inBuildSpawn.pos.x;
            room.memory.extensionHub.y = inBuildSpawn.pos.y;
            return;
        }
        let spawn = _.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN && s.my)[0];
        if (spawn) {
            room.memory.extensionHub = {};
            room.memory.extensionHub.x = spawn.pos.x;
            room.memory.extensionHub.y = spawn.pos.y;
            return;
        }
        let pos = new RoomPosition(getRandomInt(11, 39), getRandomInt(11, 39), room.name);
        let closestStructure = pos.findClosestByRange(FIND_STRUCTURES);
        let terrain = Game.rooms[pos.roomName].lookForAtArea(LOOK_TERRAIN, pos.y - 3, pos.x - 3, pos.y + 3, pos.x + 3, true);
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
            room.memory.extensionHub = {};
            room.memory.extensionHub.x = pos.x;
            room.memory.extensionHub.y = pos.y;
        }
    }
}

function controllerSupplier(room, structures) {
    let controllerContainer = _.filter(room.controller.pos.findInRange(structures, 1), (s) => s.structureType === STRUCTURE_CONTAINER)[0];
    if (room.controller.level < 5) {
        if (!controllerContainer) {
            let controllerBuild = _.filter(room.controller.pos.findInRange(FIND_CONSTRUCTION_SITES, 1), (s) => s.structureType === STRUCTURE_CONTAINER)[0];
            if (!controllerBuild) {
                let containerSpots = room.lookForAtArea(LOOK_TERRAIN, room.controller.pos.y - 1, room.controller.pos.x - 1, room.controller.pos.y + 1, room.controller.pos.x + 1, true);
                for (let key in containerSpots) {
                    let position = new RoomPosition(containerSpots[key].x, containerSpots[key].y, room.name);
                    if (position && position.getRangeTo(room.controller) === 1) {
                        if (!position.checkForImpassible()) {
                            position.createConstructionSite(STRUCTURE_CONTAINER);
                            break;
                        }
                    }
                }
            }
        } else {
            room.memory.controllerContainer = controllerContainer.id;
        }
    } else {
        let controllerLink = _.filter(room.controller.pos.findInRange(structures, 2), (s) => s.structureType === STRUCTURE_LINK)[0];
        let inBuild = _.filter(room.controller.pos.findInRange(FIND_CONSTRUCTION_SITES, 2), (s) => s.structureType === STRUCTURE_LINK)[0];
        if (!controllerLink && !inBuild && room.memory.storageLink) {
            let zoneTerrain = room.lookForAtArea(LOOK_TERRAIN, room.controller.pos.y - 2, room.controller.pos.x - 2, room.controller.pos.y + 2, room.controller.pos.x + 2, true);
            for (let key in zoneTerrain) {
                let position = new RoomPosition(zoneTerrain[key].x, zoneTerrain[key].y, room.name);
                if (position.checkForAllStructure().length > 0 || position.checkForImpassible()) continue;
                position.createConstructionSite(STRUCTURE_LINK);
                break;
            }
        } else if (controllerLink) {
            room.memory.controllerLink = controllerLink.id;
            if (controllerContainer) {
                room.memory.controllerContainer = undefined;
                controllerContainer.destroy();
            }
        }
    }
}

function buildWalls(room, structures) {
    let extensionCount = room.getExtensionCount();
    if (room.controller.level < 3) return;
    for (let store of _.filter(structures, (s) => protectedStructures.includes(s.structureType))) {
        room.createConstructionSite(store.pos, STRUCTURE_RAMPART);
    }
    let hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
    let safeZone = room.lookForAtArea(LOOK_TERRAIN, hub.y - 6, hub.x - 6, hub.y + 6, hub.x + 6, true);
    for (let key in safeZone) {
        let position = new RoomPosition(safeZone[key].x, safeZone[key].y, room.name);
        if (position && position.getRangeTo(hub) === 6) {
            position.createConstructionSite(STRUCTURE_RAMPART);
            if (!position.checkForImpassible()) position.createConstructionSite(STRUCTURE_ROAD);
        }
    }
    if (extensionCount > 90) {
        let outerRing = room.lookForAtArea(LOOK_TERRAIN, hub.y - 9, hub.x - 9, hub.y + 9, hub.x + 9, true);
        for (let key in outerRing) {
            let position = new RoomPosition(outerRing[key].x, outerRing[key].y, room.name);
            if (position && position.getRangeTo(hub) === 9) {
                position.createConstructionSite(STRUCTURE_RAMPART);
                if (!position.checkForImpassible()) position.createConstructionSite(STRUCTURE_ROAD);
            }
        }
    }
}

function buildStorage(room, structures) {
    if (room.controller.level < 4) return;
    let storage = _.filter(structures, (s) => s.structureType === STRUCTURE_STORAGE)[0];
    if (!storage) {
        let hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
        let safeZone = room.lookForAtArea(LOOK_TERRAIN, hub.y - 2, hub.x - 2, hub.y + 2, hub.x + 2, true);
        for (let key in safeZone) {
            let position = new RoomPosition(safeZone[key].x, safeZone[key].y, room.name);
            if (position.getRangeTo(hub) === 2) {
                if (position.checkForAllStructure().length > 0) continue;
                position.createConstructionSite(STRUCTURE_STORAGE);
            }
        }
    }
}

function buildTerminal(room, structures) {
    if (room.controller.level < 6) return;
    let terminal = _.filter(structures, (s) => s.structureType === STRUCTURE_TERMINAL)[0];
    let storage = _.filter(structures, (s) => s.structureType === STRUCTURE_STORAGE)[0];
    if (!terminal && storage) {
        let safeZone = shuffle(room.lookForAtArea(LOOK_TERRAIN, storage.pos.y - 2, storage.pos.x - 2, storage.pos.y + 2, storage.pos.x + 2, true));
        for (let key in safeZone) {
            let position = new RoomPosition(safeZone[key].x, safeZone[key].y, room.name);
            if (position.getRangeTo(storage) === 2) {
                if (position.checkForAllStructure().length > 0) continue;
                position.createConstructionSite(STRUCTURE_TERMINAL);
            }
        }
    }
}

function buildExtractor(room, structures) {
    if (room.controller.level < 6) return;
    let extractor = _.filter(structures, (s) => s.structureType === STRUCTURE_EXTRACTOR)[0];
    if (!extractor) {
        let mineral = Game.getObjectById(room.memory.mineralId);
        mineral.pos.createConstructionSite(STRUCTURE_EXTRACTOR);
    }
}

function buildObserver(room, structures) {
    if (room.controller.level < 8) return;
    let observer = _.filter(structures, (s) => s.structureType === STRUCTURE_OBSERVER)[0];
    if (!observer) {
        let hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
        let safeZone = shuffle(room.lookForAtArea(LOOK_TERRAIN, hub.y - 4, hub.x - 4, hub.y + 4, hub.x + 4, true));
        for (let key in safeZone) {
            let position = new RoomPosition(safeZone[key].x, safeZone[key].y, room.name);
            if (position.checkForAllStructure().length > 0) continue;
            position.createConstructionSite(STRUCTURE_OBSERVER);
        }
    }
}

function buildNuker(room, structures) {
    if (room.controller.level < 8) return;
    let nuker = _.filter(structures, (s) => s.structureType === STRUCTURE_NUKER)[0];
    if (!nuker) {
        let hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
        let safeZone = shuffle(room.lookForAtArea(LOOK_TERRAIN, hub.y - 4, hub.x - 4, hub.y + 4, hub.x + 4, true));
        for (let key in safeZone) {
            let position = new RoomPosition(safeZone[key].x, safeZone[key].y, room.name);
            if (position.checkForAllStructure().length > 0) continue;
            position.createConstructionSite(STRUCTURE_NUKER);
        }
    }
}

function buildPowerSpawn(room, structures) {
    if (room.controller.level < 8) return;
    let powerSpawn = _.filter(structures, (s) => s.structureType === STRUCTURE_POWER_SPAWN)[0];
    if (!powerSpawn) {
        let hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
        let safeZone = shuffle(room.lookForAtArea(LOOK_TERRAIN, hub.y - 4, hub.x - 4, hub.y + 4, hub.x + 4, true));
        for (let key in safeZone) {
            let position = new RoomPosition(safeZone[key].x, safeZone[key].y, room.name);
            if (position.checkForAllStructure().length > 0) continue;
            position.createConstructionSite(STRUCTURE_POWER_SPAWN);
        }
    }
}

function buildLabs(room, structures) {
    if (room.controller.level < 6) return;
    if (!room.memory.reactionRoom) {
        let lab = _.filter(structures, (s) => s.structureType === STRUCTURE_LAB)[0];
        let sites = room.find(FIND_CONSTRUCTION_SITES, {filter: (s) => s.structureType === STRUCTURE_LAB})[0];
        let terminal = _.filter(structures, (s) => s.structureType === STRUCTURE_TERMINAL)[0];
        if (!lab && !sites && terminal) {
            let safeZone = shuffle(room.lookForAtArea(LOOK_TERRAIN, terminal.pos.y - 2, terminal.pos.x - 2, terminal.pos.y + 2, terminal.pos.x + 2, true));
            for (let key in safeZone) {
                let position = new RoomPosition(safeZone[key].x, safeZone[key].y, room.name);
                if (position.getRangeTo(terminal.pos) === 2) {
                    if (position.checkForAllStructure().length > 0) continue;
                    position.createConstructionSite(STRUCTURE_LAB);
                }
            }
        }
    } else {
        let labs = _.filter(structures, (s) => s.structureType === STRUCTURE_LAB);
        let sites = room.find(FIND_CONSTRUCTION_SITES, {filter: (s) => s.structureType === STRUCTURE_LAB})[0];
        if (labs.length === 0 && !sites) {
            for (let i = 1; i < 249; i++) {
                let labPos;
                let pos = new RoomPosition(getRandomInt(11, 39), getRandomInt(11, 39), room.name);
                let labHub = room.lookForAtArea(LOOK_TERRAIN, pos.y - 5, pos.x - 5, pos.y + 5, pos.x + 5, true);
                let good;
                for (let key in labHub) {
                    labPos = new RoomPosition(labHub[key].x, labHub[key].y, room.name);
                    good = false;
                    if (labPos.checkForAllStructure().length > 0) break;
                    good = true;
                }
                if (good) {
                    labPos.createConstructionSite(STRUCTURE_LAB);
                    break;
                }
            }
        } else if (labs[0]) {
            let labHub = room.lookForAtArea(LOOK_TERRAIN, labs[0].pos.y - 2, labs[0].pos.x - 2, labs[0].pos.y + 2, labs[0].pos.x + 2, true);
            buildRoadFromTo(room, labs[0], room.controller);
            for (let key in labHub) {
                let position = new RoomPosition(labHub[key].x, labHub[key].y, room.name);
                if (position.checkForAllStructure().length > 0) continue;
                switch (position.createConstructionSite(STRUCTURE_LAB)) {
                    case OK:
                        continue;
                    case ERR_RCL_NOT_ENOUGH:
                        return;
                }
            }
        }
    }
}

function buildLinks(room, structures) {
    if (room.controller.level < 5) return;
    let storage = _.filter(structures, (s) => s.structureType === STRUCTURE_STORAGE)[0];
    if (storage) {
        let inBuild = _.filter(storage.pos.findInRange(storage.room.constructionSites, 2), (s) => s.structureType === STRUCTURE_LINK);
        let built = _.filter(storage.pos.findInRange(storage.room.structures, 2), (s) => s.structureType === STRUCTURE_LINK);
        if (storage && built.length === 0 && inBuild.length === 0) {
            let zoneTerrain = room.lookForAtArea(LOOK_TERRAIN, storage.pos.y - 1, storage.pos.x - 1, storage.pos.y + 1, storage.pos.x + 1, true);
            for (let key in zoneTerrain) {
                let position = new RoomPosition(zoneTerrain[key].x, zoneTerrain[key].y, room.name);
                if (position.checkForAllStructure().length > 0) continue;
                position.createConstructionSite(STRUCTURE_LINK);
            }
        }
    }
}

function buildTowers(room, structures) {
    if (room.controller.level < 3) return;
    let tower = _.filter(structures, (s) => s.structureType === STRUCTURE_TOWER);
    if (tower.length < 6) {
        let hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
        let safeZone = shuffle(room.lookForAtArea(LOOK_TERRAIN, hub.y - 5, hub.x - 5, hub.y + 5, hub.x + 5, true));
        for (let key in safeZone) {
            let position = new RoomPosition(safeZone[key].x, safeZone[key].y, room.name);
            if (position.getRangeTo(hub) === 5) {
                if (position.checkForImpassible()) continue;
                if (position.checkForAllStructure().length > 0) continue;
                switch (position.createConstructionSite(STRUCTURE_TOWER)) {
                    case OK:
                        continue;
                    case ERR_RCL_NOT_ENOUGH:
                        return;
                }
            }
        }
    }
}

function buildRoads(room, structures) {
    if (room.controller.level < 3 || _.size(Game.constructionSites) >= 45) return;
    let spawner = shuffle(_.filter(structures, (s) => s.structureType === STRUCTURE_SPAWN))[0];
    let mineral = room.mineral[0];
    for (let source of room.sources) {
        buildRoadAround(room, source.pos);
        buildRoadFromTo(room, spawner, source);
    }
    if (room.controller) {
        buildRoadAround(room, room.controller.pos);
        let target = room.controller.pos.findClosestByRange(room.sources);
        if (target) {
            buildRoadFromTo(room, room.controller, target);
        }
    }
    if (mineral) {
        buildRoadAround(room, mineral.pos);
        buildRoadFromTo(room, spawner, mineral);
    }
    try {
        buildRoadFromTo(room, spawner, spawner.pos.findClosestByPath(FIND_EXIT_TOP));
    } catch (e) {
    }
    try {
        buildRoadFromTo(room, spawner, spawner.pos.findClosestByPath(FIND_EXIT_RIGHT));
    } catch (e) {
    }
    try {
        buildRoadFromTo(room, spawner, spawner.pos.findClosestByPath(FIND_EXIT_BOTTOM));
    } catch (e) {
    }
    try {
        buildRoadFromTo(room, spawner, spawner.pos.findClosestByPath(FIND_EXIT_LEFT));
    } catch (e) {
    }
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

function buildRoadFromTo(room, start, end) {
    let path = start.pos.findPathTo(end, {
        maxOps: 10000, serialize: false, ignoreCreeps: true, maxRooms: 1, ignoreRoads: false
    });
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
    //if (position.checkForWall() || position.checkForObstacleStructure() || position.checkForRoad()) return;
    position.createConstructionSite(STRUCTURE_ROAD);
}