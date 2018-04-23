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
    let structures = this.structures;
    let spawn = _.filter(structures, (s) => s.structureType === STRUCTURE_SPAWN);
    if (!spawn.length) {
        buildTowers(this, structures);
        return rebuildSpawn(this, structures);
    }
    // Clean bad roads
    if (Game.time % 500 === 0) {
        for (let key in this.structures) {
            if (this.structures[key].structureType === STRUCTURE_ROAD) {
                if (this.structures[key].pos.checkForImpassible()) this.structures[key].destroy();
            }
        }
    }
    buildExtensions(this);
    buildLinks(this);
    buildStorage(this);
    buildTerminal(this);
    buildSpawn(this, structures);
    buildTowers(this, structures);
    buildWalls(this, structures);
    if (_.size(Game.constructionSites) > 75) return;
    controllerSupplier(this, structures);
    buildLabs(this, structures);
    buildNuker(this, structures);
    buildObserver(this, structures);
    buildPowerSpawn(this, structures);
    buildExtractor(this, structures);
    if (Game.time % 500 === 0) buildRoads(this, structures);
};

function buildExtensions(room) {
    let extensionCount = room.getExtensionCount();
    if (!room.memory.extensionHub || !room.memory.extensionHub.x) return findExtensionHub(room);
    let hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
    if (_.filter(hub.lookFor(LOOK_STRUCTURES), (s) => s.structureType === STRUCTURE_RAMPART).length) {
        switch (hub.createConstructionSite(STRUCTURE_SPAWN)) {
            case OK:
                break;
            case ERR_RCL_NOT_ENOUGH:
        }
    } else {
        switch (hub.createConstructionSite(STRUCTURE_RAMPART)) {
            case OK:
                break;
            case ERR_RCL_NOT_ENOUGH:
        }
    }
    let inBuild = _.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_EXTENSION).length || 0;
    if (_.filter(room.structures, (s) => s.structureType === STRUCTURE_EXTENSION).length + inBuild < extensionCount) {
        for (let i = 2; i < 8; i++) {
            let x;
            let y;
            i = _.round(i);
            x = getRandomInt(1, i);
            y = getRandomInt(1, i);
            x = _.sample([x, -x]);
            y = _.sample([y, -y]);
            let pos = new RoomPosition(hub.x + x, hub.y + y, hub.roomName);
            if (pos.checkForAllStructure().length > 0 || pos.getRangeTo(hub) < 2 || pos.x === hub.x || pos.y === hub.y
                || !room.findPath(pos, hub, {range: 1}) || room.findPath(pos, hub, {
                    range: 1,
                    ignoreDestructibleStructures: true,
                    ignoreCreeps: true
                }).length > 7) continue;
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
        let pos = new RoomPosition(getRandomInt(12, 38), getRandomInt(12, 38), room.name);
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
    if (room.level < 4) return;
    let controllerContainer = _.filter(room.controller.pos.findInRange(structures, 1), (s) => s.structureType === STRUCTURE_CONTAINER)[0];
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
    if (room.level >= 6) {
        let controllerLink = _.filter(room.controller.pos.findInRange(structures, 2), (s) => s.structureType === STRUCTURE_LINK)[0];
        if (!controllerLink && room.memory.storageLink) {
            let zoneTerrain = room.lookForAtArea(LOOK_TERRAIN, controllerContainer.pos.y - 1, controllerContainer.pos.x - 1, controllerContainer.pos.y + 1, controllerContainer.pos.x + 1, true);
            for (let key in zoneTerrain) {
                if (_.filter(controllerContainer.pos.findInRange(FIND_CONSTRUCTION_SITES, 1), (s) => s.structureType === STRUCTURE_LINK)[0]) break;
                let position = new RoomPosition(zoneTerrain[key].x, zoneTerrain[key].y, room.name);
                if (position.checkForAllStructure().length > 0 || position.checkForImpassible()) continue;
                position.createConstructionSite(STRUCTURE_LINK);
                break;
            }
        } else if (controllerLink) {
            room.memory.controllerLink = controllerLink.id;
        }
    }
}

function buildWalls(room, structures) {
    let tower = _.filter(room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.my);
    if (!tower.length) return;
    let barrier = _.min(_.filter(room.structures, (s) => (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) && (s.pos.x === 2 || s.pos.y === 2 || s.pos.x === 1 || s.pos.y === 1)), 'hits');
    if (barrier.hits > barrier.hits < 500000 * room.controller.level) {
        for (let store of _.filter(structures, (s) => protectedStructures.includes(s.structureType))) {
            room.createConstructionSite(store.pos, STRUCTURE_RAMPART);
        }
    }
    if (room.controller.level < 2) return;
    let neighboring = Game.map.describeExits(room.name);
    if (neighboring && !TEN_CPU) {
        if (neighboring['1']) {
            let exits = room.find(FIND_EXIT_TOP);
            let terrain = room.lookForAtArea(LOOK_TERRAIN, 1, 0, 2, 49, true);
            for (let key in terrain) {
                let position = new RoomPosition(terrain[key].x, terrain[key].y, room.name);
                if (position.getRangeTo(position.findClosestByRange(exits)) !== 2 || position.checkForWall()) continue;
                if (position.x % 2) {
                    position.createConstructionSite(STRUCTURE_RAMPART);
                    if (room.controller.level >= 4 && position.checkForRampart() && !position.checkForRoad()) {
                        position.createConstructionSite(STRUCTURE_ROAD);
                    }
                } else {
                    if (position.checkForObstacleStructure() && !position.checkForBarrierStructure()) {
                        position.createConstructionSite(STRUCTURE_RAMPART);
                    } else {
                        position.createConstructionSite(STRUCTURE_WALL);
                    }
                }
            }
        }
        if (neighboring['3']) {
            let exits = room.find(FIND_EXIT_RIGHT);
            let terrain = room.lookForAtArea(LOOK_TERRAIN, 0, 47, 49, 48, true);
            for (let key in terrain) {
                let position = new RoomPosition(terrain[key].x, terrain[key].y, room.name);
                if (position.getRangeTo(position.findClosestByRange(exits)) !== 2 || position.checkForWall()) continue;
                if (position.y % 2) {
                    position.createConstructionSite(STRUCTURE_RAMPART);
                    if (room.controller.level >= 4 && position.checkForRampart() && !position.checkForRoad()) {
                        position.createConstructionSite(STRUCTURE_ROAD);
                    }
                } else {
                    if (position.checkForObstacleStructure() && !position.checkForBarrierStructure()) {
                        position.createConstructionSite(STRUCTURE_RAMPART);
                    } else {
                        position.createConstructionSite(STRUCTURE_WALL);
                    }
                }
            }
        }
        if (neighboring['5']) {
            let exits = room.find(FIND_EXIT_BOTTOM);
            let terrain = room.lookForAtArea(LOOK_TERRAIN, 47, 0, 49, 48, true);
            for (let key in terrain) {
                let position = new RoomPosition(terrain[key].x, terrain[key].y, room.name);
                if (position.getRangeTo(position.findClosestByRange(exits)) !== 2 || position.checkForWall()) continue;
                if (position.x % 2) {
                    position.createConstructionSite(STRUCTURE_RAMPART);
                    if (room.controller.level >= 4 && position.checkForRampart() && !position.checkForRoad()) {
                        position.createConstructionSite(STRUCTURE_ROAD);
                    }
                } else {
                    if (position.checkForObstacleStructure() && !position.checkForBarrierStructure()) {
                        position.createConstructionSite(STRUCTURE_RAMPART);
                    } else {
                        position.createConstructionSite(STRUCTURE_WALL);
                    }
                }
            }
        }
        if (neighboring['7']) {
            let exits = room.find(FIND_EXIT_LEFT);
            let terrain = room.lookForAtArea(LOOK_TERRAIN, 0, 1, 49, 2, true);
            for (let key in terrain) {
                let position = new RoomPosition(terrain[key].x, terrain[key].y, room.name);
                if (position.getRangeTo(position.findClosestByRange(exits)) !== 2 || position.checkForWall()) continue;
                if (position.y % 2) {
                    position.createConstructionSite(STRUCTURE_RAMPART);
                    if (room.controller.level >= 4 && position.checkForRampart() && !position.checkForRoad()) {
                        position.createConstructionSite(STRUCTURE_ROAD);
                    }
                } else {
                    if (position.checkForObstacleStructure() && !position.checkForBarrierStructure()) {
                        position.createConstructionSite(STRUCTURE_RAMPART);
                    } else {
                        position.createConstructionSite(STRUCTURE_WALL);
                    }
                }
            }
        }
    }
    if (room.controller.level === 9) {
        let hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
        let safeZone = room.lookForAtArea(LOOK_TERRAIN, hub.y - 10, hub.x - 10, hub.y + 10, hub.x + 10, true);
        for (let key in safeZone) {
            let position = new RoomPosition(safeZone[key].x, safeZone[key].y, room.name);
            if (position && position.getRangeTo(hub) === 10 && room.findPath(position, hub, {
                range: 0,
                ignoreDestructibleStructures: true,
                ignoreCreeps: true
            }).length < 12) {
                position.createConstructionSite(STRUCTURE_RAMPART);
                if (!position.checkForImpassible() && room.findPath(position, hub, {
                    range: 0,
                    ignoreDestructibleStructures: true,
                    ignoreCreeps: true
                }).length < 12) position.createConstructionSite(STRUCTURE_ROAD);
            }
        }
    }
}

function buildStorage(room) {
    if (room.controller.level < 4) return;
    let storage = room.storage;
    if (!storage) {
        let hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
        let safeZone = shuffle(room.lookForAtArea(LOOK_TERRAIN, hub.y - 5, hub.x - 5, hub.y + 5, hub.x + 5, true));
        for (let key in safeZone) {
            let position = new RoomPosition(safeZone[key].x, safeZone[key].y, room.name);
            if (position.checkForAllStructure().length > 0 || !room.findPath(position, hub, {
                    range: 1,
                    ignoreCreeps: true
                }).length
                || room.findPath(position, hub, {
                    range: 1,
                    ignoreDestructibleStructures: true,
                    ignoreCreeps: true
                }).length > 7) continue;
            position.createConstructionSite(STRUCTURE_STORAGE);
        }
    }
}

function buildTerminal(room) {
    if (room.controller.level < 6) return;
    let terminal = room.terminal;
    let storage = room.storage;
    if (!terminal && storage) {
        let hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
        let safeZone = shuffle(room.lookForAtArea(LOOK_TERRAIN, hub.y - 5, hub.x - 5, hub.y + 5, hub.x + 5, true));
        for (let key in safeZone) {
            let position = new RoomPosition(safeZone[key].x, safeZone[key].y, room.name);
            if (position.checkForAllStructure().length > 0 || !room.findPath(position, hub, {
                    range: 1,
                    ignoreCreeps: true
                }).length
                || room.findPath(position, hub, {
                    range: 1,
                    ignoreDestructibleStructures: true,
                    ignoreCreeps: true
                }).length > 7) continue;
            position.createConstructionSite(STRUCTURE_TERMINAL);
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
            if (position.checkForAllStructure().length > 0 || !room.findPath(position, hub, {
                    range: 1,
                    ignoreCreeps: true
                }).length
                || room.findPath(position, hub, {
                    range: 1,
                    ignoreDestructibleStructures: true,
                    ignoreCreeps: true
                }).length > 7) continue;
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
            if (position.checkForAllStructure().length > 0 || !room.findPath(position, hub, {
                    range: 1,
                    ignoreCreeps: true
                }).length
                || room.findPath(position, hub, {
                    range: 1,
                    ignoreDestructibleStructures: true,
                    ignoreCreeps: true
                }).length > 7) continue;
            position.createConstructionSite(STRUCTURE_POWER_SPAWN);
        }
    }
}

function buildSpawn(room, structures) {
    if (room.controller.level < 7) return;
    let spawn = _.filter(structures, (s) => s.structureType === STRUCTURE_SPAWN);
    if (spawn.length < 3) {
        let hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
        let safeZone = shuffle(room.lookForAtArea(LOOK_TERRAIN, hub.y - 7, hub.x - 7, hub.y + 7, hub.x + 7, true));
        for (let key in safeZone) {
            let position = new RoomPosition(safeZone[key].x, safeZone[key].y, room.name);
            if (position.checkForAllStructure().length > 0 || !room.findPath(position, hub, {
                    range: 1,
                    ignoreCreeps: true
                }).length
                || room.findPath(position, hub, {
                    range: 1,
                    ignoreDestructibleStructures: true,
                    ignoreCreeps: true
                }).length > 7) continue;
            position.createConstructionSite(STRUCTURE_SPAWN);
        }
    }
}

function buildLabs(room, structures) {
    if (room.controller.level < 6) return;
    let terminal = room.terminal;
    if (!room.memory.reactionRoom) {
        let lab = _.filter(structures, (s) => s.structureType === STRUCTURE_LAB);
        let sites = _.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_LAB);
        if (lab.length + sites.length < 2 && terminal) {
            let safeZone = shuffle(room.lookForAtArea(LOOK_TERRAIN, terminal.pos.y - 2, terminal.pos.x - 2, terminal.pos.y + 2, terminal.pos.x + 2, true));
            let hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
            for (let key in safeZone) {
                let position = new RoomPosition(safeZone[key].x, safeZone[key].y, room.name);
                if (position.getRangeTo(terminal.pos) === 2) {
                    if (position.checkForAllStructure().length > 0 || !room.findPath(position, terminal.pos, {
                            range: 1,
                            ignoreCreeps: true
                        }).length
                        || room.findPath(position, hub, {
                            range: 1,
                            ignoreDestructibleStructures: true,
                            ignoreCreeps: true
                        }).length > 7) continue;
                    position.createConstructionSite(STRUCTURE_LAB);
                    break;
                }
            }
        }
    } else {
        let labs = _.filter(structures, (s) => s.structureType === STRUCTURE_LAB);
        // New reaction room conversion
        if (labs[0] && labs[0].pos.getRangeTo(terminal) === 2) {
            for (let key in labs) {
                labs[key].destroy();
            }
        }
        let sites = room.find(FIND_CONSTRUCTION_SITES, {filter: (s) => s.structureType === STRUCTURE_LAB})[0];
        if (labs.length === 0 && !sites) {
            let hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
            let labHub = room.lookForAtArea(LOOK_TERRAIN, hub.y - 9, hub.x - 9, hub.y + 9, hub.x + 9, true);
            let good;
            for (let key in labHub) {
                let position = new RoomPosition(labHub[key].x, labHub[key].y, room.name);
                if (position.getRangeTo(hub) > 8) {
                    if (position.x > 44 || position.x < 6 || position.y > 44 || position.y < 6 || position.checkForWall() || position.checkForAllStructure().length > 0) continue;
                    let surrounding = room.lookForAtArea(LOOK_TERRAIN, position.y - 3, position.x - 3, position.y + 3, position.x + 3, true);
                    for (let key in surrounding) {
                        let labPos = new RoomPosition(labHub[key].x, labHub[key].y, room.name);
                        good = false;
                        if (labPos.checkForWall() || labPos.checkForAllStructure().length > 0) break;
                        good = true;
                        if (good) {
                            return position.createConstructionSite(STRUCTURE_LAB);
                        }
                    }
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

function buildLinks(room) {
    if (room.controller.level < 5) return;
    let storage = room.storage;
    if (storage) {
        let built = _.filter(storage.pos.findInRange(storage.room.structures, 2), (s) => s.structureType === STRUCTURE_LINK);
        let inBuild = _.filter(storage.pos.findInRange(storage.room.constructionSites, 2), (s) => s.structureType === STRUCTURE_LINK);
        if (storage && !built.length && !inBuild.length) {
            if (_.filter(storage.room.constructionSites, (s) => s.structureType === STRUCTURE_LINK).length) return;
            let zoneTerrain = room.lookForAtArea(LOOK_TERRAIN, storage.pos.y - 1, storage.pos.x - 1, storage.pos.y + 1, storage.pos.x + 1, true);
            for (let key in zoneTerrain) {
                if (_.filter(storage.pos.findInRange(storage.room.constructionSites, 2), (s) => s.structureType === STRUCTURE_LINK)[0]) break;
                let position = new RoomPosition(zoneTerrain[key].x, zoneTerrain[key].y, room.name);
                if (position.checkForAllStructure().length > 0) continue;
                return position.createConstructionSite(STRUCTURE_LINK);
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
                if (position.checkForAllStructure().length > 0 || !room.findPath(position, hub, {
                        range: 1,
                        ignoreCreeps: true
                    }).length
                    || room.findPath(position, hub, {
                        range: 1,
                        ignoreDestructibleStructures: true,
                        ignoreCreeps: true
                    }).length > 7) continue;
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
    if (Game.time % 100 !== 0 || (room.controller.level < 4 || _.size(Game.constructionSites) >= 45)) return;
    let spawner = shuffle(_.filter(structures, (s) => s.structureType === STRUCTURE_SPAWN))[0];
    let mineral = room.mineral[0];
    let extensions = _.filter(room.structures, (s) => s.structureType === STRUCTURE_EXTENSION);
    for (let source of room.sources) {
        buildRoadAround(room, source.pos);
        buildRoadFromTo(room, spawner, source);
    }
    for (let extension of extensions) {
        buildRoadFromTo(room, extension, spawner);
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
    let neighboring = Game.map.describeExits(spawner.pos.roomName);
    if (neighboring) {
        if (neighboring['1']) {
            let exits = spawner.room.find(FIND_EXIT_TOP);
            let middle = _.round(exits.length / 2);
            buildRoadFromTo(spawner.room, spawner, exits[middle]);
        }
        if (neighboring['3']) {
            let exits = spawner.room.find(FIND_EXIT_RIGHT);
            let middle = _.round(exits.length / 2);
            buildRoadFromTo(spawner.room, spawner, exits[middle]);
        }
        if (neighboring['5']) {
            let exits = spawner.room.find(FIND_EXIT_BOTTOM);
            let middle = _.round(exits.length / 2);
            buildRoadFromTo(spawner.room, spawner, exits[middle]);
        }
        if (neighboring['7']) {
            let exits = spawner.room.find(FIND_EXIT_LEFT);
            let middle = _.round(exits.length / 2);
            buildRoadFromTo(spawner.room, spawner, exits[middle]);
        }
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
        let pos = new RoomPosition(point.x, point.y, room.name);
        if (pos.checkForImpassible()) continue;
        buildRoad(pos);
    }
}

function buildRoadAround(room, position) {
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (xOff !== 0 || yOff !== 0) {
                let pos = new RoomPosition(position.x + xOff, position.y + yOff, room.name);
                if (pos.checkForImpassible()) continue;
                buildRoad(pos);
            }
        }
    }
}

function buildRoad(position) {
    //if (position.checkForWall() || position.checkForObstacleStructure() || position.checkForRoad()) return;
    position.createConstructionSite(STRUCTURE_ROAD);
}

function rebuildSpawn(room) {
    if (!room.memory.extensionHub || !room.memory.extensionHub.x) return findExtensionHub(room);
    let hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
    if (_.filter(hub.lookFor(LOOK_STRUCTURES), (s) => s.structureType === STRUCTURE_RAMPART).length) {
        switch (hub.createConstructionSite(STRUCTURE_SPAWN)) {
            case OK:
                break;
            case ERR_RCL_NOT_ENOUGH:
        }
    } else {
        switch (hub.createConstructionSite(STRUCTURE_RAMPART)) {
            case OK:
                break;
            case ERR_RCL_NOT_ENOUGH:
        }
    }
}

function isEven(n) {
    return n % 2 === 0;
}

function isOdd(n) {
    return Math.abs(n % 2) === 1;
}