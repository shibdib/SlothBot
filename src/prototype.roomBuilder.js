let shib = require("shibBench");
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
    let structures = this.structures;
    cleanRoom(this, structures);
    if (!this.memory.extensionHub || !this.memory.extensionHub.x) return findExtensionHub(this);
    let spawn = _.filter(structures, (s) => s.structureType === STRUCTURE_SPAWN);
    if (!spawn.length) {
        buildTowers(this, structures);
        rebuildSpawn(this, structures);
        return;
    }
    // Clean bad roads
    if (Game.time % 500 === 0) {
        for (let key in this.structures) {
            if (this.structures[key].structureType === STRUCTURE_ROAD) {
                if (this.structures[key].pos.checkForImpassible()) this.structures[key].destroy();
            }
        }
    }
    buildLabs(this, structures);
    buildExtensions(this);
    buildLinks(this);
    buildStorage(this);
    buildTerminal(this);
    buildSpawn(this, structures);
    buildWalls(this, structures);
    buildTowers(this, structures);
    controllerSupplier(this, structures);
    buildMineralContainer(this, structures);
    buildNuker(this, structures);
    buildObserver(this, structures);
    buildPowerSpawn(this, structures);
    buildExtractor(this, structures);
    if (Game.time % 500 === 0) buildRoads(this, structures);
};

function cleanRoom(room, structures) {
    for (let key in structures) {
        if (structures[key] && structures[key].owner && !structures[key].my) {
            structures[key].destroy();
        }
    }
}

function buildExtensions(room) {
    let extensionCount = room.getExtensionCount();
    if (!room.memory.extensionHub || !room.memory.extensionHub.x) return findExtensionHub(room);
    let hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
    if (_.filter(hub.lookFor(LOOK_STRUCTURES), (s) => s.structureType === STRUCTURE_RAMPART).length) {
        switch (hub.createConstructionSite(STRUCTURE_SPAWN)) {
            case OK:
                break;
        }
    } else {
        switch (hub.createConstructionSite(STRUCTURE_RAMPART)) {
            case OK:
                break;
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
            if (pos.checkIfOutOfBounds() || pos.checkForAllStructure().length > 0 || pos.checkForRoad() || pos.getRangeTo(hub) < 2 || pos.x === hub.x || pos.y === hub.y
                || !room.findPath(pos, hub, {range: 1}) || room.findPath(pos, hub, {
                    range: 1,
                    ignoreDestructibleStructures: true,
                    ignoreCreeps: true
                }).length > 8 || pos.getRangeTo(pos.findClosestByRange(FIND_EXIT)) < 4) continue;
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
                                buildRoad(build, room);
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
    for (let i = 1; i < 1000; i++) {
        let searched = [];
        let hubSearch = room.memory.hubSearch || 0;
        if (hubSearch >= 750) {
            abandonRoom(room.name);
            Memory.roomCache[room.name].noClaim = true;
            log.a(room.name + ' has been abandoned due to being unable to find a suitable hub location.');
            Game.notify(room.name + ' has been abandoned due to being unable to find a suitable hub location.');
            return;
        }
        let pos = new RoomPosition(getRandomInt(9, 40), getRandomInt(9, 40), room.name);
        let clean = pos.x + '.' + pos.y;
        if (!_.includes(searched, clean)) {
            searched.push(clean);
            room.memory.hubSearch = hubSearch + 1;
            let closestStructure = pos.findClosestByRange(FIND_STRUCTURES);
            let terrain = Game.rooms[pos.roomName].lookForAtArea(LOOK_TERRAIN, pos.y - 3, pos.x - 3, pos.y + 3, pos.x + 3, true);
            let wall = false;
            for (let key in terrain) {
                let position = new RoomPosition(terrain[key].x, terrain[key].y, room.name);
                if (!position.checkForImpassible()) {
                    continue;
                }
                wall = true;
                break;
            }
            if (pos.getRangeTo(closestStructure) >= 4 && !wall) {
                room.memory.extensionHub = {};
                room.memory.extensionHub.x = pos.x;
                room.memory.extensionHub.y = pos.y;
                room.memory.hubSearch = undefined;
            }
        }
    }
}

function controllerSupplier(room, structures) {
    let controllerContainer = _.filter(room.controller.pos.findInRange(structures, 1), (s) => s.structureType === STRUCTURE_CONTAINER)[0];
    if (!controllerContainer) {
        let controllerBuild = _.filter(room.controller.pos.findInRange(FIND_CONSTRUCTION_SITES, 1), (s) => s.structureType === STRUCTURE_CONTAINER)[0];
        if (!controllerBuild) {
            for (let xOff = -1; xOff <= 1; xOff++) {
                for (let yOff = -1; yOff <= 1; yOff++) {
                    if (xOff !== 0 || yOff !== 0) {
                        let pos = new RoomPosition(room.controller.pos.x + xOff, room.controller.pos.y + yOff, room.name);
                        if (!pos.checkForImpassible()) return pos.createConstructionSite(STRUCTURE_CONTAINER);
                    }
                }
            }
        }
    } else {
        room.memory.controllerContainer = controllerContainer.id;
    }
    if (room.level >= 6 && controllerContainer) {
        let controllerLink = _.filter(room.controller.pos.findInRange(structures, 2), (s) => s.structureType === STRUCTURE_LINK)[0];
        if (!controllerLink) {
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

function buildMineralContainer(room, structures) {
    if (room.level < 6) return;
    let extractor = _.filter(room.structures, (s) => s.structureType === STRUCTURE_EXTRACTOR)[0];
    if (!extractor) return;
    let extractorContainer = _.filter(extractor.pos.findInRange(structures, 1), (s) => s.structureType === STRUCTURE_CONTAINER)[0];
    if (!extractorContainer) {
        let extractorBuild = _.filter(extractor.pos.findInRange(FIND_CONSTRUCTION_SITES, 1), (s) => s.structureType === STRUCTURE_CONTAINER)[0];
        if (!extractorBuild) {
            let containerSpots = room.lookForAtArea(LOOK_TERRAIN, extractor.pos.y - 1, extractor.pos.x - 1, extractor.pos.y + 1, extractor.pos.x + 1, true);
            for (let key in containerSpots) {
                let position = new RoomPosition(containerSpots[key].x, containerSpots[key].y, room.name);
                if (position && position.getRangeTo(extractor) === 1) {
                    if (!position.checkForImpassible()) {
                        position.createConstructionSite(STRUCTURE_CONTAINER);
                        break;
                    }
                }
            }
        }
    } else {
        room.memory.extractorContainer = extractorContainer.id;
    }
}

function buildWalls(room, structures) {
    let hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
    if (room.controller.level >= 5) {
        for (let store of _.filter(structures, (s) => protectedStructures.includes(s.structureType))) {
            room.createConstructionSite(store.pos, STRUCTURE_RAMPART);
        }
        for (let store of _.filter(structures, (s) => s.structureType === STRUCTURE_EXTENSION && s.pos.getRangeTo(hub) >= 8)) {
            room.createConstructionSite(store.pos, STRUCTURE_RAMPART);
        }
    }
    if (!room.memory.bunkerComplete) {
        cpu = Game.cpu.getUsed();
        let exits = room.find(FIND_EXIT);
        let closestExitRange = hub.getRangeTo(hub.findClosestByPath(exits));
        let buildRange = 7;
        if (closestExitRange < 9) buildRange = closestExitRange - 2;
        let neighboring = Game.map.describeExits(room.name);
        let checkCount = room.memory.bunkerPosCheck || 0;
        room.memory.bunkerPosCheck = checkCount + 1;
        if (neighboring) {
            if (neighboring['1']) {
                let exits = room.find(FIND_EXIT_TOP);
                let targetExit = hub.findClosestByPath(exits);
                let baseline = room.findPath(hub, targetExit, {
                    swampCost: 1,
                    ignoreDestructibleStructures: true,
                    ignoreCreeps: true,
                });
                for (let i = 0; i < 100; i++) {
                    let path = room.findPath(hub, targetExit, {
                        costCallback: function (roomName, costMatrix) {
                            if (room.memory.bunkerPos) {
                                for (let location of room.memory.bunkerPos) {
                                    costMatrix.set(location.x, location.y, 255);
                                }
                            }
                        }, swampCost: 1,
                        ignoreDestructibleStructures: true,
                        ignoreCreeps: true,
                    });
                    if (path.length > buildRange && path.length >= baseline.length * 0.8) {
                        let pathPos = new RoomPosition(path[buildRange].x, path[buildRange].y, room.name);

                        room.memory.bunkerPos = room.memory.bunkerPos || [];
                        let entry = {"x": pathPos.x, "y": pathPos.y};
                        if (!_.includes(room.memory.bunkerPos, entry)) room.memory.bunkerPos.push(entry);
                    }
                }
            }
            if (neighboring['3']) {
                let exits = room.find(FIND_EXIT_RIGHT);
                let targetExit = hub.findClosestByPath(exits);
                let baseline = room.findPath(hub, targetExit, {
                    swampCost: 1,
                    ignoreDestructibleStructures: true,
                    ignoreCreeps: true,
                });
                for (let i = 0; i < 100; i++) {
                    let path = room.findPath(hub, targetExit, {
                        costCallback: function (roomName, costMatrix) {
                            if (room.memory.bunkerPos) {
                                for (let location of room.memory.bunkerPos) {
                                    costMatrix.set(location.x, location.y, 255);
                                }
                            }
                        }, swampCost: 1,
                        ignoreDestructibleStructures: true,
                        ignoreCreeps: true,
                    });
                    if (path.length > buildRange && path.length >= baseline.length * 0.8) {
                        let pathPos = new RoomPosition(path[buildRange].x, path[buildRange].y, room.name);
                        room.memory.bunkerPos = room.memory.bunkerPos || [];
                        let entry = {"x": pathPos.x, "y": pathPos.y};
                        if (!_.includes(room.memory.bunkerPos, entry)) room.memory.bunkerPos.push(entry);
                    }
                }
            }
            if (neighboring['5']) {
                let exits = room.find(FIND_EXIT_BOTTOM);
                let targetExit = hub.findClosestByPath(exits);
                let baseline = room.findPath(hub, targetExit, {
                    swampCost: 1,
                    ignoreDestructibleStructures: true,
                    ignoreCreeps: true,
                });
                for (let i = 0; i < 100; i++) {
                    let path = room.findPath(hub, targetExit, {
                        costCallback: function (roomName, costMatrix) {
                            if (room.memory.bunkerPos) {
                                for (let location of room.memory.bunkerPos) {
                                    costMatrix.set(location.x, location.y, 255);
                                }
                            }
                        }, swampCost: 1,
                        ignoreDestructibleStructures: true,
                        ignoreCreeps: true,
                    });
                    if (path.length > buildRange && path.length >= baseline.length * 0.8) {
                        let pathPos = new RoomPosition(path[buildRange].x, path[buildRange].y, room.name);
                        room.memory.bunkerPos = room.memory.bunkerPos || [];
                        let entry = {"x": pathPos.x, "y": pathPos.y};
                        if (!_.includes(room.memory.bunkerPos, entry)) room.memory.bunkerPos.push(entry);
                    }
                }
            }
            if (neighboring['7']) {
                let exits = room.find(FIND_EXIT_LEFT);
                let targetExit = hub.findClosestByPath(exits);
                let baseline = room.findPath(hub, targetExit, {
                    swampCost: 1,
                    ignoreDestructibleStructures: true,
                    ignoreCreeps: true,
                });
                for (let i = 0; i < 100; i++) {
                    let path = room.findPath(hub, targetExit, {
                        costCallback: function (roomName, costMatrix) {
                            if (room.memory.bunkerPos) {
                                for (let location of room.memory.bunkerPos) {
                                    costMatrix.set(location.x, location.y, 255);
                                }
                            }
                        }, swampCost: 1,
                        ignoreDestructibleStructures: true,
                        ignoreCreeps: true,
                    });
                    if (path.length > buildRange && path.length >= baseline.length * 0.8) {
                        let pathPos = new RoomPosition(path[buildRange].x, path[buildRange].y, room.name);
                        room.memory.bunkerPos = room.memory.bunkerPos || [];
                        let entry = {"x": pathPos.x, "y": pathPos.y};
                        if (!_.includes(room.memory.bunkerPos, entry)) room.memory.bunkerPos.push(entry);
                    }
                }
            }
            if (room.memory.bunkerPosCheck === 5) {
                room.memory.bunkerPosCheck = undefined;
                room.memory.bunkerComplete = true;
            }
        }
    }
    let tower = _.filter(structures, (s) => s.structureType === STRUCTURE_TOWER);
    if (!tower.length) return;
    for (let location of room.memory.bunkerPos) {
        let rampPos = new RoomPosition(location.x, location.y, room.name);
        if (rampPos && !rampPos.checkIfOutOfBounds()) {
            if (!rampPos.checkForBarrierStructure()) {
                room.visual.circle(rampPos, {
                    fill: 'red',
                    radius: 0.55,
                    stroke: 'red'
                });
                rampPos.createConstructionSite(STRUCTURE_RAMPART);
            } else if (!rampPos.checkForRoad() && !rampPos.checkForObstacleStructure()) {
                room.visual.circle(rampPos, {
                    fill: 'blue',
                    radius: 0.55,
                    stroke: 'blue'
                });
                buildRoad(rampPos, room);
            } else {
                room.visual.circle(rampPos, {
                    fill: 'green',
                    radius: 0.55,
                    stroke: 'green'
                });
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
            if (position.checkIfOutOfBounds() || position.checkForAllStructure().length > 0 || !room.findPath(position, hub, {
                    range: 1,
                    ignoreCreeps: true
                }).length
                || room.findPath(position, hub, {
                    range: 1,
                    ignoreDestructibleStructures: true,
                    ignoreCreeps: true
                }).length > 7 || position.getRangeTo(position.findClosestByRange(FIND_EXIT)) < 5) continue;
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
            if (position.checkIfOutOfBounds() || position.checkForAllStructure().length > 0 || !room.findPath(position, hub, {
                    range: 1,
                    ignoreCreeps: true
                }).length
                || room.findPath(position, hub, {
                    range: 1,
                    ignoreDestructibleStructures: true,
                    ignoreCreeps: true
                }).length > 7 || position.getRangeTo(position.findClosestByRange(FIND_EXIT)) < 5) continue;
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
            if (position.checkIfOutOfBounds() || position.checkForAllStructure().length > 0 || position.getRangeTo(position.findClosestByRange(FIND_EXIT)) < 5) continue;
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
            if (position.checkIfOutOfBounds() || position.checkForAllStructure().length > 0 || !room.findPath(position, hub, {
                    range: 1,
                    ignoreCreeps: true
                }).length
                || room.findPath(position, hub, {
                    range: 1,
                    ignoreDestructibleStructures: true,
                    ignoreCreeps: true
                }).length > 7 || position.getRangeTo(position.findClosestByRange(FIND_EXIT)) < 5) continue;
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
            if (position.checkIfOutOfBounds() || position.checkForAllStructure().length > 0 || !room.findPath(position, hub, {
                    range: 1,
                    ignoreCreeps: true
                }).length
                || room.findPath(position, hub, {
                    range: 1,
                    ignoreDestructibleStructures: true,
                    ignoreCreeps: true
                }).length > 7 || position.getRangeTo(position.findClosestByRange(FIND_EXIT)) < 5) continue;
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
            if (position.checkIfOutOfBounds() || position.checkForAllStructure().length > 0 || !room.findPath(position, hub, {
                    range: 1,
                    ignoreCreeps: true
                }).length
                || room.findPath(position, hub, {
                    range: 1,
                    ignoreDestructibleStructures: true,
                    ignoreCreeps: true
                }).length > 7 || position.getRangeTo(position.findClosestByRange(FIND_EXIT)) < 5) continue;
            position.createConstructionSite(STRUCTURE_SPAWN);
        }
    }
}

function buildLabs(room, structures) {
    if (room.controller.level < 6) return;
    let terminal = room.terminal;
    if (room.controller.level >= 7 && (!room.memory.boostLab || !Game.getObjectById(room.memory.boostLab))) {
        let lab = _.filter(structures, (s) => s.structureType === STRUCTURE_LAB && s.pos.getRangeTo(terminal) === 1)[0];
        if (lab) return room.memory.boostLab = lab.id;
        let sites = _.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_LAB && s.pos.getRangeTo(terminal) === 1);
        if (!sites.length) {
            let terminalZone = shuffle(room.lookForAtArea(LOOK_TERRAIN, terminal.pos.y - 1, terminal.pos.x - 1, terminal.pos.y + 1, terminal.pos.x + 1, true));
            for (let key in terminalZone) {
                let position = new RoomPosition(terminalZone[key].x, terminalZone[key].y, room.name);
                if (position.checkIfOutOfBounds() || position.checkForImpassible()) continue;
                switch (position.createConstructionSite(STRUCTURE_LAB)) {
                    case OK:
                        break;
                    case ERR_RCL_NOT_ENOUGH:
                        let labs = _.filter(structures, (s) => s.structureType === STRUCTURE_LAB && (!room.memory.boostLab || s.id !== room.memory.boostLab));
                        labs[0].destroy();
                }
                break;
            }
        }
    } else {
        let labs = _.filter(structures, (s) => s.structureType === STRUCTURE_LAB && (!room.memory.boostLab || s.id !== room.memory.boostLab));
        let sites = room.find(FIND_CONSTRUCTION_SITES, {filter: (s) => s.structureType === STRUCTURE_LAB})[0];
        if (labs.length === 0 && !sites) {
            let hub = new RoomPosition(25, 25, room.name);
            let labHub = room.lookForAtArea(LOOK_TERRAIN, hub.y - 20, hub.x - 20, hub.y + 20, hub.x + 20, true);
            let good;
            for (let key in labHub) {
                let position = new RoomPosition(labHub[key].x, labHub[key].y, room.name);
                if (position.checkForImpassible()) continue;
                let surrounding = room.lookForAtArea(LOOK_TERRAIN, position.y - 3, position.x - 3, position.y + 3, position.x + 3, true);
                for (let key in surrounding) {
                    let labPos = new RoomPosition(surrounding[key].x, surrounding[key].y, room.name);
                    good = false;
                    if (labPos.checkForImpassible() || labPos.x < 3 || labPos.x > 47 || labPos.y < 3 || labPos.y > 47) break;
                    good = true;
                }
                if (good) return position.createConstructionSite(STRUCTURE_LAB);
            }
        } else if (labs[0]) {
            let labHub = room.lookForAtArea(LOOK_TERRAIN, labs[0].pos.y - 2, labs[0].pos.x - 2, labs[0].pos.y + 2, labs[0].pos.x + 2, true);
            buildRoadFromTo(room, labs[0], room.controller);
            for (let key in labHub) {
                let position = new RoomPosition(labHub[key].x, labHub[key].y, room.name);
                if (position.checkForWall() || position.checkForAllStructure().length > 0) continue;
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
    if (room.controller.level < 5 || room.memory.storageLink) return;
    if (room.memory.controllerLink) {
        Game.getObjectById(room.memory.controllerLink).destroy();
        room.memory.controllerLink = undefined;
    }
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
                if (position.checkIfOutOfBounds() || position.checkForAllStructure().length > 0) continue;
                return position.createConstructionSite(STRUCTURE_LINK);
            }
        }
    }
}

function buildTowers(room, structures) {
    if (room.controller.level < 3) return;
    let tower = _.filter(structures, (s) => s.structureType === STRUCTURE_TOWER);
    if (tower.length < 6 && room.memory.bunkerPos) {
        for (let location of shuffle(room.memory.bunkerPos)) {
            let buildPos = new RoomPosition(location.x, location.y, room.name);
            if (buildPos.checkForObstacleStructure()) continue;
            switch (buildPos.createConstructionSite(STRUCTURE_TOWER)) {
                case OK:
                    break;
                case ERR_RCL_NOT_ENOUGH:
                    return;
            }
        }
    }
}

function buildRoads(room, structures) {
    let spawner = shuffle(_.filter(structures, (s) => s.structureType === STRUCTURE_SPAWN))[0];
    for (let source of room.sources) {
        buildRoadAround(room, source.pos);
        buildRoadFromTo(room, spawner, source);
    }
    buildRoadAround(room, spawner.pos);
    let mineral = room.mineral[0];
    let extensions = _.filter(room.structures, (s) => s.structureType === STRUCTURE_EXTENSION);
    for (let extension of extensions) {
        buildRoadFromTo(room, spawner, extension);
    }
    if (room.controller) {
        buildRoadAround(room, room.controller.pos);
        let target = room.controller.pos.findClosestByRange(room.sources);
        if (target) {
            buildRoadFromTo(room, room.controller, target);
        }
        let container = Game.getObjectById(room.memory.controllerContainer);
        if (container) {
            buildRoadFromTo(room, container, target);
        }
    }
    if (mineral && room.controller.level > 5) {
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
    let target;
    if (end instanceof RoomPosition) target = end; else target = end.pos;
    let path = getRoad(room, start.pos, target);
    if (!path) {
        path = start.pos.findPathTo(end, {
            maxOps: 10000,
            serialize: false,
            ignoreCreeps: true,
            maxRooms: 1,
            costCallback: function (roomName, costMatrix) {
                let terrain = new Room.Terrain(this.name);
                for (let y = 0; y < 50; y++) {
                    for (let x = 0; x < 50; x++) {
                        let tile = terrain.get(x, y);
                        if (tile === 0) costMatrix.set(x, y, 15);
                        if (tile === 1) costMatrix.set(x, y, 200);
                        if (tile === 2) costMatrix.set(x, y, 15);
                    }
                }
                for (let site of room.constructionSites) {
                    if (site.structureType === STRUCTURE_ROAD) {
                        costMatrix.set(site.pos.x, site.pos.y, 1);
                    }
                }
                for (let road of room.structures) {
                    if (road.structureType === STRUCTURE_ROAD) {
                        costMatrix.set(road.pos.x, road.pos.y, 1);
                    }
                }
            },
        });
        if (path.length) return cacheRoad(room, start.pos, target, path); else return;
    }
    for (let point of JSON.parse(path)) {
        let pos = new RoomPosition(point.x, point.y, room.name);
        buildRoad(pos, room);
    }
}

function buildRoadAround(room, position) {
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (xOff !== 0 || yOff !== 0) {
                let pos = new RoomPosition(position.x + xOff, position.y + yOff, room.name);
                buildRoad(pos, room);
            }
        }
    }
}

function buildRoad(position, room) {
    if (position.checkForRoad() || position.checkForImpassible() || _.size(room.find(FIND_CONSTRUCTION_SITES)) >= 10) return;
    if (room.controller.level < 5) {
        if (position.checkForSwamp()) position.createConstructionSite(STRUCTURE_ROAD);
    } else {
        position.createConstructionSite(STRUCTURE_ROAD);
    }
}

function cacheRoad(room, from, to, path) {
    let key = getPathKey(from, to);
    let cache = room.memory._roadCache || {};
    let tick = Game.time;
    cache[key] = {
        path: JSON.stringify(path),
        tick: tick
    };
    room.memory._roadCache = cache;
}

function getRoad(room, from, to) {
    let cache;
    if (room.memory._roadCache && _.size(room.memory._roadCache)) cache = room.memory._roadCache; else return;
    if (!cache) return;
    let cachedPath = cache[getPathKey(from, to)];
    if (cachedPath) {
        return cachedPath.path;
    } else {
        return;
    }
}

function getPathKey(from, to) {
    return getPosKey(from) + '$' + getPosKey(to);
}

function getPosKey(pos) {
    return pos.x + 'x' + pos.y;
}

function rebuildSpawn(room) {
    if (!room.memory.extensionHub || !room.memory.extensionHub.x) return findExtensionHub(room);
    let hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
    if (!hub.checkForConstructionSites()) {
        switch (hub.createConstructionSite(STRUCTURE_SPAWN)) {
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

abandonRoom = function (room) {
    for (let key in Game.rooms[room].creeps) {
        Game.rooms[room].creeps[key].memory.recycle = true;
    }
    let overlordFor = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === room);
    for (let key in overlordFor) {
        overlordFor[key].memory.recycle = true;
    }
    for (let key in Game.rooms[room].structures) {
        Game.rooms[room].structures[key].destroy();
    }
    for (let key in Game.rooms[room].constructionSites) {
        console.log(6)
        Game.rooms[room].constructionSites[key].remove();
    }
    delete Game.rooms[room].memory;
    let noClaim = Memory.noClaim || [];
    noClaim.push(room.name);
    Memory.noClaim = noClaim;
    Game.rooms[room].controller.unclaim();
};