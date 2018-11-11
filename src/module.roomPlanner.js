/**
 * Created by rober on 5/16/2017.
 */
module.exports.buildRoom = function (room) {
    if (_.size(room.memory.layout) && room.memory.layoutVersion === 1.2 && _.size(room.memory.bunkerHub)) return buildFromLayout(room);
    layoutRoom(room);
};
module.exports.hubCheck = function (room) {
    return findHub(room)
};

function layoutRoom(room) {
    if (!_.size(room.memory.bunkerHub)) return findHub(room);
    if (!room.memory.bunkerType) room.memory.bunkerType = 1;
    let yVar, xVar, buildTemplate;
    if (room.memory.bunkerType === 1) {
        buildTemplate = template;
        yVar = 16;
        xVar = 15;
    } else if (room.memory.bunkerType === 2) {
        buildTemplate = template2;
        yVar = 25;
        xVar = 25;
    } else if (room.memory.bunkerType === 3) {
        buildTemplate = template3;
        yVar = 25;
        xVar = 25;
    } else if (room.memory.bunkerType === 4) {
        buildTemplate = template4;
        yVar = 25;
        xVar = 25;
    }
    let hub = new RoomPosition(room.memory.bunkerHub.x, room.memory.bunkerHub.y, room.name);
    let xOffset = difference(hub.x, xVar);
    if (hub.x < xVar) xOffset *= -1;
    let yOffset = difference(hub.y, yVar);
    if (hub.y < yVar) yOffset *= -1;
    let layout = [];
    for (let type of buildTemplate) {
        for (let s of type.pos) {
            let structure = {};
            structure.structureType = type.type;
            structure.x = s.x + xOffset;
            structure.y = s.y + yOffset;
            layout.push(structure);
        }
    }
    room.memory.layout = JSON.stringify(layout);
    room.memory.layoutVersion = 1.2;
}

function buildFromLayout(room) {
    if (!room.memory.bunkerType) room.memory.bunkerType = 1;
    let level = room.controller.level;
    let layout = JSON.parse(room.memory.layout);
    let extensionLevel = getLevel(room);
    // Build preset layout
    if (level === 8) {
        let filter = _.filter(layout, (s) => s.structureType !== STRUCTURE_ROAD);
        for (let structure of filter) {
            let pos = new RoomPosition(structure.x, structure.y, room.name);
            if (level !== extensionLevel && (structure.structureType !== STRUCTURE_EXTENSION && structure.structureType !== STRUCTURE_SPAWN && structure.structureType !== STRUCTURE_TOWER)) continue;
            if (!pos.checkForConstructionSites() && !pos.checkForAllStructure().length) pos.createConstructionSite(structure.structureType);
        }
    } else if (level < 8 && level >= 6) {
        let filter = _.filter(layout, (s) => s.structureType !== STRUCTURE_OBSERVER && s.structureType !== STRUCTURE_POWER_SPAWN && s.structureType !== STRUCTURE_NUKER && s.structureType !== STRUCTURE_ROAD);
        for (let structure of filter) {
            let pos = new RoomPosition(structure.x, structure.y, room.name);
            if (level !== extensionLevel && (structure.structureType !== STRUCTURE_EXTENSION && structure.structureType !== STRUCTURE_SPAWN && structure.structureType !== STRUCTURE_TOWER)) continue;
            if (!pos.checkForConstructionSites() && !pos.checkForAllStructure().length) pos.createConstructionSite(structure.structureType);
        }
    } else if (level < 6 && level >= 3) {
        let filter = _.filter(layout, (s) => s.structureType !== STRUCTURE_OBSERVER && s.structureType !== STRUCTURE_POWER_SPAWN && s.structureType !== STRUCTURE_NUKER && s.structureType !== STRUCTURE_TERMINAL && s.structureType !== STRUCTURE_ROAD);
        for (let structure of filter) {
            let pos = new RoomPosition(structure.x, structure.y, room.name);
            if (level !== extensionLevel && (structure.structureType !== STRUCTURE_EXTENSION && structure.structureType !== STRUCTURE_SPAWN && structure.structureType !== STRUCTURE_TOWER)) continue;
            if (!pos.checkForConstructionSites() && !pos.checkForAllStructure().length) pos.createConstructionSite(structure.structureType);
        }
    } else {
        let filter = _.filter(layout, (s) => s.structureType !== STRUCTURE_OBSERVER && s.structureType !== STRUCTURE_POWER_SPAWN && s.structureType !== STRUCTURE_NUKER && s.structureType !== STRUCTURE_TERMINAL && s.structureType !== STRUCTURE_TOWER && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART);
        for (let structure of filter) {
            let pos = new RoomPosition(structure.x, structure.y, room.name);
            if (level !== extensionLevel && (structure.structureType !== STRUCTURE_EXTENSION && structure.structureType !== STRUCTURE_SPAWN && structure.structureType !== STRUCTURE_TOWER)) continue;
            if (!pos.checkForConstructionSites() && !pos.checkForAllStructure().length) pos.createConstructionSite(structure.structureType);
        }
    }
    // Hub
    if (room.memory.bunkerType === 1) {
        let hub = new RoomPosition(room.memory.bunkerHub.x, room.memory.bunkerHub.y, room.name);
        if (level >= 5) {
            delete room.memory.hubContainer;
            if (hub.checkForAllStructure()[0]) {
                if (hub.checkForAllStructure()[0].structureType === STRUCTURE_LINK) room.memory.hubLink = hub.checkForAllStructure()[0].id;
                if (hub.checkForAllStructure()[0].structureType === STRUCTURE_CONTAINER) hub.checkForAllStructure()[0].destroy();
            }
            if (!hub.checkForConstructionSites() && !hub.checkForAllStructure().length) hub.createConstructionSite(STRUCTURE_LINK);
        } else {
            if (hub.checkForAllStructure()[0] && hub.checkForAllStructure()[0].structureType === STRUCTURE_CONTAINER) {
                room.memory.hubContainer = hub.checkForAllStructure()[0].id;
            }
            if (!hub.checkForConstructionSites() && !hub.checkForAllStructure().length) hub.createConstructionSite(STRUCTURE_CONTAINER);
        }
    }
    // Ramparts on buildings
    if (level >= 7 && level === extensionLevel) {
        for (let store of _.filter(room.structures, (s) => protectedStructures.includes(s.structureType))) {
            room.createConstructionSite(store.pos, STRUCTURE_RAMPART);
        }
    }
    // Roads
    if (level >= 3 && !_.size(room.constructionSites) && level === extensionLevel) {
        let filter = _.filter(layout, (s) => s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_RAMPART);
        for (let structure of filter) {
            let pos = new RoomPosition(structure.x, structure.y, room.name);
            if (!pos.checkForConstructionSites() && !pos.checkForAllStructure().length && !pos.checkForWall() && !pos.checkForRoad()) pos.createConstructionSite(STRUCTURE_ROAD);
        }
        if (level >= 4) {
            let spawn = shuffle(_.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN))[0];
            // Controller Road
            buildRoadAround(room, room.controller.pos);
            let container = Game.getObjectById(room.memory.controllerContainer);
            if (container) {
                buildRoadFromTo(room, spawn, container);
            }
            // Source Roads
            for (let source of room.sources) {
                buildRoadAround(room, source.pos);
                buildRoadFromTo(room, spawn, source);
            }
            // Neighboring Roads
            let neighboring = Game.map.describeExits(spawn.pos.roomName);
            if (neighboring) {
                if (neighboring['1']) {
                    let exits = spawn.room.find(FIND_EXIT_TOP);
                    let middle = _.round(exits.length / 2);
                    buildRoadFromTo(spawn.room, spawn, exits[middle]);
                }
                if (neighboring['3']) {
                    let exits = spawn.room.find(FIND_EXIT_RIGHT);
                    let middle = _.round(exits.length / 2);
                    buildRoadFromTo(spawn.room, spawn, exits[middle]);
                }
                if (neighboring['5']) {
                    let exits = spawn.room.find(FIND_EXIT_BOTTOM);
                    let middle = _.round(exits.length / 2);
                    buildRoadFromTo(spawn.room, spawn, exits[middle]);
                }
                if (neighboring['7']) {
                    let exits = spawn.room.find(FIND_EXIT_LEFT);
                    let middle = _.round(exits.length / 2);
                    buildRoadFromTo(spawn.room, spawn, exits[middle]);
                }
            }
            // Mineral Roads/Harvester
            if (level >= 6) {
                let mineral = room.find(FIND_MINERALS)[0];
                let spawn = shuffle(_.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN))[0];
                if (!mineral.pos.checkForAllStructure().length && !mineral.pos.checkForConstructionSites()) mineral.pos.createConstructionSite(STRUCTURE_EXTRACTOR);
                buildRoadAround(room, mineral.pos);
                buildRoadFromTo(room, spawn, mineral);
            }
        }
    }
    // Controller
    let controllerContainer = Game.getObjectById(room.memory.controllerContainer);
    if (!controllerContainer) {
        controllerContainer = _.filter(room.controller.pos.findInRange(room.structures, 1), (s) => s.structureType === STRUCTURE_CONTAINER)[0];
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
    } else if (room.controller.level >= 6) {
        let controllerLink = _.filter(room.controller.pos.findInRange(room.structures, 2), (s) => s.structureType === STRUCTURE_LINK)[0];
        if (!controllerLink) {
            let zoneTerrain = room.lookForAtArea(LOOK_TERRAIN, controllerContainer.pos.y - 1, controllerContainer.pos.x - 1, controllerContainer.pos.y + 1, controllerContainer.pos.x + 1, true);
            for (let key in zoneTerrain) {
                if (_.filter(controllerContainer.pos.findInRange(FIND_CONSTRUCTION_SITES, 1), (s) => s.structureType === STRUCTURE_LINK)[0]) break;
                let position = new RoomPosition(zoneTerrain[key].x, zoneTerrain[key].y, room.name);
                if (position.checkForAllStructure().length > 0 || position.checkForImpassible()) continue;
                position.createConstructionSite(STRUCTURE_LINK);
                break;
            }
        } else {
            room.memory.controllerLink = controllerLink.id;
        }
    }
    // Cleanup
    let noRoad = _.filter(room.structures, (s) => OBSTACLE_OBJECT_TYPES.includes(s.structureType) && s.pos.checkForRoad());
    if (noRoad.length) noRoad.forEach((s) => s.pos.checkForRoad().destroy());
}

function findHub(room) {
    if (room.memory.bunkerHub) return;
    if (!room.memory.typeSearch) room.memory.typeSearch = 1;
    for (let i = 1; i < 1000; i++) {
        let searched = [];
        let hubSearch = room.memory.newHubSearch || 0;
        if (hubSearch >= 3000) {
            if (room.memory.typeSearch === 1) {
                room.memory.typeSearch = 2;
                room.memory.newHubSearch = undefined;
                return false;
            } else if (room.memory.typeSearch === 2) {
                room.memory.typeSearch = 3;
                room.memory.newHubSearch = undefined;
                return false;
            } else if (room.memory.typeSearch === 3) {
                room.memory.typeSearch = 4;
                room.memory.newHubSearch = undefined;
                return false;
            }
            if (!room.memory.extensionHub) abandonRoom(room.name); else {
                room.memory.noBunkerPos = true;
                log.a(room.name + ' was unable to find a position for the new bunker.');
                Game.notify(room.name + ' was unable to find a position for the new bunker.');
                return false;
            }
            Memory.roomCache[room.name].noClaim = true;
            log.a(room.name + ' has been abandoned due to being unable to find a suitable hub location.');
            Game.notify(room.name + ' has been abandoned due to being unable to find a suitable hub location.');
            return;
        }
        let pos = new RoomPosition(getRandomInt(9, 40), getRandomInt(9, 40), room.name);
        let clean = pos.x + '.' + pos.y;
        if (!_.includes(searched, clean)) {
            searched.push(clean);
            room.memory.newHubSearch = hubSearch + 1;
            let controller = room.controller;
            let closestSource = pos.findClosestByRange(FIND_SOURCES);
            let terrain;
            if (room.memory.typeSearch === 1) terrain = Game.rooms[pos.roomName].lookForAtArea(LOOK_TERRAIN, pos.y - 6, pos.x - 5, pos.y + 4, pos.x + 5, true);
            if (room.memory.typeSearch === 2) terrain = Game.rooms[pos.roomName].lookForAtArea(LOOK_TERRAIN, pos.y + 4, pos.x - 9, pos.y - 5, pos.x + 8, true);
            if (room.memory.typeSearch === 3) terrain = Game.rooms[pos.roomName].lookForAtArea(LOOK_TERRAIN, pos.y + 5, pos.x - 9, pos.y - 5, pos.x + 9, true);
            if (room.memory.typeSearch === 4) terrain = Game.rooms[pos.roomName].lookForAtArea(LOOK_TERRAIN, pos.y - 7, pos.x - 10, pos.y + 7, pos.x + 10, true);
            let wall = false;
            for (let key in terrain) {
                let position = new RoomPosition(terrain[key].x, terrain[key].y, room.name);
                if (!position.checkIfOutOfBounds() && !position.checkForWall()) {
                    continue;
                }
                wall = true;
                break;
            }
            if (pos.getRangeTo(controller) >= 2 && !wall && pos.getRangeTo(closestSource) >= 2) {
                room.memory.bunkerHub = {};
                room.memory.bunkerHub.x = pos.x;
                room.memory.bunkerHub.y = pos.y;
                room.memory.bunkerType = room.memory.typeSearch;
                room.memory.hubSearch = undefined;
                layoutRoom(room);
                return true;
            }
        }
    }
}

abandonRoom = function (room) {
    for (let key in Game.rooms[room].creeps) {
        Game.rooms[room].creeps[key].suicide();
    }
    let overlordFor = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === room);
    for (let key in overlordFor) {
        overlordFor[key].suicide();
    }
    for (let key in Game.rooms[room].structures) {
        Game.rooms[room].structures[key].destroy();
    }
    for (let key in Game.rooms[room].constructionSites) {
        Game.rooms[room].constructionSites[key].remove();
    }
    delete Game.rooms[room].memory;
    let noClaim = Memory.noClaim || [];
    noClaim.push(room.name);
    Memory.noClaim = noClaim;
    Game.rooms[room].controller.unclaim();
};

function difference(num1, num2) {
    return (num1 > num2) ? num1 - num2 : num2 - num1
}

let template = [
    {
        "type": STRUCTURE_RAMPART,
        "pos": [{"x": 10, "y": 9}, {"x": 11, "y": 9}, {"x": 12, "y": 9}, {"x": 13, "y": 9}, {"x": 14, "y": 9}, {
            "x": 15,
            "y": 9
        }, {"x": 16, "y": 9}, {"x": 17, "y": 9}, {"x": 18, "y": 9}, {"x": 19, "y": 9}, {"x": 20, "y": 9}, {
            "x": 9,
            "y": 10
        }, {"x": 10, "y": 10}, {"x": 20, "y": 10}, {"x": 21, "y": 10}, {"x": 9, "y": 11}, {"x": 21, "y": 11}, {
            "x": 9,
            "y": 12
        }, {"x": 21, "y": 12}, {"x": 9, "y": 13}, {"x": 21, "y": 13}, {"x": 9, "y": 14}, {"x": 21, "y": 14}, {
            "x": 9,
            "y": 15
        }, {"x": 21, "y": 15}, {"x": 9, "y": 16}, {"x": 21, "y": 16}, {"x": 9, "y": 17}, {"x": 21, "y": 17}, {
            "x": 9,
            "y": 18
        }, {"x": 21, "y": 18}, {"x": 9, "y": 19}, {"x": 21, "y": 19}, {"x": 9, "y": 20}, {"x": 10, "y": 20}, {
            "x": 20,
            "y": 20
        }, {"x": 21, "y": 20}, {"x": 10, "y": 21}, {"x": 11, "y": 21}, {"x": 12, "y": 21}, {"x": 13, "y": 21}, {
            "x": 14,
            "y": 21
        }, {"x": 15, "y": 21}, {"x": 16, "y": 21}, {"x": 17, "y": 21}, {"x": 18, "y": 21}, {"x": 19, "y": 21}, {
            "x": 20,
            "y": 21
        }]
    },
    {
        "type": STRUCTURE_LAB,
        "pos": [{"x": 11, "y": 10}, {"x": 19, "y": 10}, {"x": 10, "y": 11}, {"x": 11, "y": 11}, {
            "x": 19,
            "y": 11
        }, {"x": 20, "y": 11}, {"x": 15, "y": 12}, {"x": 14, "y": 19}, {"x": 15, "y": 19}, {"x": 16, "y": 19}]
    },
    {
        "type": STRUCTURE_ROAD,
        "pos": [{"x": 12, "y": 10}, {"x": 18, "y": 10}, {"x": 13, "y": 11}, {"x": 17, "y": 11}, {
            "x": 10,
            "y": 12
        }, {"x": 13, "y": 12}, {"x": 17, "y": 12}, {"x": 11, "y": 13}, {"x": 14, "y": 13}, {"x": 16, "y": 13}, {
            "x": 12,
            "y": 14
        }, {"x": 15, "y": 14}, {"x": 13, "y": 15}, {"x": 14, "y": 15}, {"x": 16, "y": 15}, {"x": 17, "y": 15}, {
            "x": 11,
            "y": 16
        }, {"x": 12, "y": 16}, {"x": 15, "y": 16}, {"x": 18, "y": 16}, {"x": 19, "y": 16}, {"x": 12, "y": 17}, {
            "x": 13,
            "y": 17
        }, {"x": 17, "y": 17}, {"x": 18, "y": 17}, {"x": 12, "y": 18}, {"x": 14, "y": 18}, {"x": 16, "y": 18}, {
            "x": 18,
            "y": 18
        }, {"x": 11, "y": 19}, {"x": 13, "y": 19}, {"x": 17, "y": 19}, {"x": 19, "y": 19}, {"x": 18, "y": 14},
            {"x": 19, "y": 13}, {"x": 20, "y": 12}]
    },
    {
        "type": STRUCTURE_EXTENSION,
        "pos": [{"x": 13, "y": 10}, {"x": 14, "y": 10}, {"x": 15, "y": 10}, {"x": 16, "y": 10}, {
            "x": 17,
            "y": 10
        }, {"x": 12, "y": 11}, {"x": 14, "y": 11}, {"x": 16, "y": 11}, {"x": 18, "y": 11}, {"x": 11, "y": 12}, {
            "x": 12,
            "y": 12
        }, {"x": 14, "y": 12}, {"x": 16, "y": 12}, {"x": 18, "y": 12}, {"x": 19, "y": 12}, {"x": 10, "y": 13}, {
            "x": 12,
            "y": 13
        }, {"x": 13, "y": 13}, {"x": 15, "y": 13}, {"x": 17, "y": 13}, {"x": 18, "y": 13}, {"x": 20, "y": 13}, {
            "x": 10,
            "y": 14
        }, {"x": 11, "y": 14}, {"x": 13, "y": 14}, {"x": 14, "y": 14}, {"x": 16, "y": 14}, {"x": 17, "y": 14}, {
            "x": 19,
            "y": 14
        }, {"x": 20, "y": 14}, {"x": 10, "y": 15}, {"x": 11, "y": 15}, {"x": 19, "y": 15}, {"x": 20, "y": 15}, {
            "x": 10,
            "y": 16
        }, {"x": 20, "y": 16}, {"x": 10, "y": 17}, {"x": 11, "y": 17}, {"x": 19, "y": 17}, {"x": 20, "y": 17}, {
            "x": 10,
            "y": 18
        }, {"x": 11, "y": 18}, {"x": 13, "y": 18}, {"x": 15, "y": 18}, {"x": 17, "y": 18}, {"x": 19, "y": 18}, {
            "x": 20,
            "y": 18
        }, {"x": 10, "y": 19}, {"x": 12, "y": 19}, {"x": 18, "y": 19}, {"x": 20, "y": 19}, {"x": 11, "y": 20}, {
            "x": 12,
            "y": 20
        }, {"x": 13, "y": 20}, {"x": 14, "y": 20}, {"x": 15, "y": 20}, {"x": 16, "y": 20}, {"x": 17, "y": 20}, {
            "x": 18,
            "y": 20
        }, {"x": 19, "y": 20}]
    },
    {
        "type": STRUCTURE_TOWER,
        "pos": [{"x": 12, "y": 15}, {"x": 18, "y": 15}, {"x": 13, "y": 16}, {"x": 17, "y": 16}, {
            "x": 12,
            "y": 17
        }, {"x": 18, "y": 17}]
    },
    {"type": STRUCTURE_STORAGE, "pos": [{"x": 15, "y": 15}]},
    {"type": STRUCTURE_TERMINAL, "pos": [{"x": 14, "y": 16}]},
    {"type": STRUCTURE_POWER_SPAWN, "pos": [{"x": 16, "y": 16}]},
    {"type": STRUCTURE_SPAWN, "pos": [{"x": 14, "y": 17}, {"x": 15, "y": 17}, {"x": 16, "y": 17}]},
    {"type": STRUCTURE_OBSERVER, "pos": [{"x": 15, "y": 11}]}
];

let template2 = [
    {
        "type": STRUCTURE_RAMPART,
        "pos": [{"x": 27, "y": 16}, {"x": 28, "y": 16}, {"x": 29, "y": 16}, {
            "x": 30,
            "y": 16
        }, {"x": 31, "y": 16}, {"x": 26, "y": 17}, {"x": 27, "y": 17}, {"x": 31, "y": 17}, {
            "x": 32,
            "y": 17
        }, {"x": 25, "y": 18}, {"x": 26, "y": 18}, {"x": 32, "y": 18}, {"x": 33, "y": 18}, {
            "x": 25,
            "y": 19
        }, {"x": 33, "y": 19}, {"x": 34, "y": 19}, {"x": 23, "y": 20}, {"x": 24, "y": 20}, {
            "x": 25,
            "y": 20
        }, {"x": 34, "y": 20}, {"x": 22, "y": 21}, {"x": 23, "y": 21}, {"x": 33, "y": 21}, {
            "x": 34,
            "y": 21
        }, {"x": 21, "y": 22}, {"x": 22, "y": 22}, {"x": 32, "y": 22}, {"x": 33, "y": 22}, {
            "x": 20,
            "y": 23
        }, {"x": 21, "y": 23}, {"x": 31, "y": 23}, {"x": 32, "y": 23}, {"x": 20, "y": 24}, {
            "x": 30,
            "y": 24
        }, {"x": 31, "y": 24}, {"x": 18, "y": 25}, {"x": 19, "y": 25}, {"x": 20, "y": 25}, {
            "x": 29,
            "y": 25
        }, {"x": 30, "y": 25}, {"x": 17, "y": 26}, {"x": 18, "y": 26}, {"x": 28, "y": 26}, {
            "x": 29,
            "y": 26
        }, {"x": 16, "y": 27}, {"x": 17, "y": 27}, {"x": 27, "y": 27}, {"x": 28, "y": 27}, {
            "x": 16,
            "y": 28
        }, {"x": 26, "y": 28}, {"x": 27, "y": 28}, {"x": 16, "y": 29}, {"x": 25, "y": 29}, {
            "x": 26,
            "y": 29
        }, {"x": 16, "y": 30}, {"x": 24, "y": 30}, {"x": 25, "y": 30}, {"x": 16, "y": 31}, {
            "x": 17,
            "y": 31
        }, {"x": 23, "y": 31}, {"x": 24, "y": 31}, {"x": 17, "y": 32}, {"x": 18, "y": 32}, {
            "x": 22,
            "y": 32
        }, {"x": 23, "y": 32}, {"x": 18, "y": 33}, {"x": 19, "y": 33}, {"x": 21, "y": 33}, {
            "x": 22,
            "y": 33
        }, {"x": 19, "y": 34}, {"x": 20, "y": 34}, {"x": 21, "y": 34}]
    },
    {
        "type": STRUCTURE_EXTENSION,
        "pos": [{"x": 28, "y": 17}, {"x": 29, "y": 17}, {"x": 30, "y": 17}, {
            "x": 27,
            "y": 18
        }, {"x": 28, "y": 18}, {"x": 30, "y": 18}, {"x": 31, "y": 18}, {"x": 26, "y": 19}, {
            "x": 27,
            "y": 19
        }, {"x": 29, "y": 19}, {"x": 31, "y": 19}, {"x": 32, "y": 19}, {"x": 26, "y": 20}, {
            "x": 28,
            "y": 20
        }, {"x": 29, "y": 20}, {"x": 30, "y": 20}, {"x": 32, "y": 20}, {"x": 33, "y": 20}, {
            "x": 27,
            "y": 21
        }, {"x": 29, "y": 21}, {"x": 31, "y": 21}, {"x": 32, "y": 21}, {"x": 28, "y": 22}, {
            "x": 30,
            "y": 22
        }, {"x": 31, "y": 22}, {"x": 29, "y": 23}, {"x": 30, "y": 23}, {"x": 29, "y": 24}, {
            "x": 28,
            "y": 25
        }, {"x": 19, "y": 26}, {"x": 20, "y": 26}, {"x": 27, "y": 26}, {"x": 18, "y": 27}, {
            "x": 19,
            "y": 27
        }, {"x": 21, "y": 27}, {"x": 26, "y": 27}, {"x": 17, "y": 28}, {"x": 18, "y": 28}, {
            "x": 20,
            "y": 28
        }, {"x": 22, "y": 28}, {"x": 25, "y": 28}, {"x": 17, "y": 29}, {"x": 19, "y": 29}, {
            "x": 20,
            "y": 29
        }, {"x": 21, "y": 29}, {"x": 23, "y": 29}, {"x": 24, "y": 29}, {"x": 17, "y": 30}, {
            "x": 18,
            "y": 30
        }, {"x": 20, "y": 30}, {"x": 22, "y": 30}, {"x": 23, "y": 30}, {"x": 18, "y": 31}, {
            "x": 19,
            "y": 31
        }, {"x": 21, "y": 31}, {"x": 22, "y": 31}, {"x": 19, "y": 32}, {"x": 20, "y": 32}, {
            "x": 21,
            "y": 32
        }, {"x": 20, "y": 33}]
    },
    {
        "type": STRUCTURE_ROAD,
        "pos": [{"x": 29, "y": 18}, {"x": 28, "y": 19}, {"x": 30, "y": 19}, {"x": 27, "y": 20}, {
            "x": 31,
            "y": 20
        }, {"x": 24, "y": 21}, {"x": 25, "y": 21}, {"x": 26, "y": 21}, {"x": 28, "y": 21}, {
            "x": 30,
            "y": 21
        }, {"x": 27, "y": 22}, {"x": 29, "y": 22}, {"x": 26, "y": 23}, {"x": 28, "y": 23}, {
            "x": 21,
            "y": 24
        }, {"x": 28, "y": 24}, {"x": 21, "y": 25}, {"x": 27, "y": 25}, {"x": 21, "y": 26}, {
            "x": 23,
            "y": 26
        }, {"x": 26, "y": 26}, {"x": 20, "y": 27}, {"x": 22, "y": 27}, {"x": 25, "y": 27}, {
            "x": 19,
            "y": 28
        }, {"x": 21, "y": 28}, {"x": 23, "y": 28}, {"x": 24, "y": 28}, {"x": 18, "y": 29}, {
            "x": 22,
            "y": 29
        }, {"x": 19, "y": 30}, {"x": 21, "y": 30}, {"x": 20, "y": 31}]
    },
    {
        "type": STRUCTURE_LAB,
        "pos": [{"x": 23, "y": 22}, {"x": 24, "y": 22}, {"x": 22, "y": 23}, {"x": 24, "y": 23}, {
            "x": 22,
            "y": 24
        }, {"x": 23, "y": 24}, {"x": 25, "y": 25}, {"x": 26, "y": 25}, {"x": 25, "y": 26}]
    },
    {
        "type": STRUCTURE_TOWER,
        "pos": [{"x": 25, "y": 22}, {"x": 25, "y": 23}, {"x": 25, "y": 24}, {"x": 22, "y": 25}, {
            "x": 23,
            "y": 25
        }, {"x": 24, "y": 25}]
    },
    {
        "type": STRUCTURE_LINK, "pos": [{"x": 26, "y": 22}, {"x": 22, "y": 26}]
    },
    {
        "type": STRUCTURE_TERMINAL, "pos": [{"x": 27, "y": 23}]
    },
    {
        "type": STRUCTURE_OBSERVER, "pos": [{"x": 24, "y": 24}]
    },
    {
        "type": STRUCTURE_STORAGE, "pos": [{"x": 26, "y": 24}]
    },
    {
        "type": STRUCTURE_NUKER, "pos": [{"x": 23, "y": 27}]
    },
    {
        "type": STRUCTURE_SPAWN, "pos": [{"x": 27, "y": 24}, {"x": 24, "y": 26}, {"x": 24, "y": 27}]
    }
];

let template3 = [
    {
        "type": STRUCTURE_RAMPART,
        "pos": [{"x": 28, "y": 17}, {"x": 29, "y": 17}, {"x": 30, "y": 17}, {"x": 31, "y": 17}, {
            "x": 32,
            "y": 17
        }, {"x": 26, "y": 18}, {"x": 27, "y": 18}, {"x": 28, "y": 18}, {"x": 32, "y": 18}, {"x": 33, "y": 18}, {
            "x": 25,
            "y": 19
        }, {"x": 26, "y": 19}, {"x": 33, "y": 19}, {"x": 24, "y": 20}, {"x": 25, "y": 20}, {"x": 33, "y": 20}, {
            "x": 23,
            "y": 21
        }, {"x": 24, "y": 21}, {"x": 33, "y": 21}, {"x": 23, "y": 22}, {"x": 32, "y": 22}, {"x": 33, "y": 22}, {
            "x": 21,
            "y": 23
        }, {"x": 22, "y": 23}, {"x": 23, "y": 23}, {"x": 32, "y": 23}, {"x": 20, "y": 24}, {"x": 21, "y": 24}, {
            "x": 31,
            "y": 24
        }, {"x": 32, "y": 24}, {"x": 19, "y": 25}, {"x": 20, "y": 25}, {"x": 30, "y": 25}, {"x": 31, "y": 25}, {
            "x": 18,
            "y": 26
        }, {"x": 19, "y": 26}, {"x": 29, "y": 26}, {"x": 30, "y": 26}, {"x": 18, "y": 27}, {"x": 27, "y": 27}, {
            "x": 28,
            "y": 27
        }, {"x": 29, "y": 27}, {"x": 17, "y": 28}, {"x": 18, "y": 28}, {"x": 27, "y": 28}, {"x": 17, "y": 29}, {
            "x": 26,
            "y": 29
        }, {"x": 27, "y": 29}, {"x": 17, "y": 30}, {"x": 25, "y": 30}, {"x": 26, "y": 30}, {"x": 17, "y": 31}, {
            "x": 24,
            "y": 31
        }, {"x": 25, "y": 31}, {"x": 17, "y": 32}, {"x": 18, "y": 32}, {"x": 22, "y": 32}, {"x": 23, "y": 32}, {
            "x": 24,
            "y": 32
        }, {"x": 18, "y": 33}, {"x": 19, "y": 33}, {"x": 20, "y": 33}, {"x": 21, "y": 33}, {"x": 22, "y": 33}]
    }, {
        "type": STRUCTURE_LAB,
        "pos": [{"x": 29, "y": 18}, {"x": 30, "y": 18}, {"x": 31, "y": 18}, {"x": 32, "y": 19}, {
            "x": 32,
            "y": 20
        }, {"x": 32, "y": 21}]
    }, {
        "type": STRUCTURE_EXTENSION,
        "pos": [{"x": 27, "y": 19}, {"x": 28, "y": 19}, {"x": 29, "y": 19}, {"x": 31, "y": 19}, {
            "x": 26,
            "y": 20
        }, {"x": 27, "y": 20}, {"x": 29, "y": 20}, {"x": 25, "y": 21}, {"x": 26, "y": 21}, {"x": 28, "y": 21}, {
            "x": 30,
            "y": 21
        }, {"x": 31, "y": 21}, {"x": 24, "y": 22}, {"x": 25, "y": 22}, {"x": 27, "y": 22}, {"x": 29, "y": 22}, {
            "x": 31,
            "y": 22
        }, {"x": 24, "y": 23}, {"x": 28, "y": 23}, {"x": 30, "y": 23}, {"x": 31, "y": 23}, {"x": 22, "y": 24}, {
            "x": 23,
            "y": 24
        }, {"x": 29, "y": 24}, {"x": 30, "y": 24}, {"x": 21, "y": 25}, {"x": 22, "y": 25}, {"x": 28, "y": 25}, {
            "x": 29,
            "y": 25
        }, {"x": 20, "y": 26}, {"x": 21, "y": 26}, {"x": 27, "y": 26}, {"x": 28, "y": 26}, {"x": 19, "y": 27}, {
            "x": 20,
            "y": 27
        }, {"x": 22, "y": 27}, {"x": 26, "y": 27}, {"x": 19, "y": 28}, {"x": 21, "y": 28}, {"x": 23, "y": 28}, {
            "x": 25,
            "y": 28
        }, {"x": 26, "y": 28}, {"x": 18, "y": 29}, {"x": 19, "y": 29}, {"x": 21, "y": 29}, {"x": 22, "y": 29}, {
            "x": 24,
            "y": 29
        }, {"x": 25, "y": 29}, {"x": 18, "y": 30}, {"x": 20, "y": 30}, {"x": 23, "y": 30}, {"x": 24, "y": 30}, {
            "x": 18,
            "y": 31
        }, {"x": 19, "y": 31}, {"x": 21, "y": 31}, {"x": 22, "y": 31}, {"x": 23, "y": 31}, {"x": 19, "y": 32}, {
            "x": 20,
            "y": 32
        }, {"x": 21, "y": 32}]
    }, {
        "type": STRUCTURE_ROAD,
        "pos": [{"x": 30, "y": 19}, {"x": 28, "y": 20}, {"x": 30, "y": 20}, {"x": 31, "y": 20}, {
            "x": 27,
            "y": 21
        }, {"x": 29, "y": 21}, {"x": 26, "y": 22}, {"x": 30, "y": 22}, {"x": 25, "y": 23}, {"x": 29, "y": 23}, {
            "x": 24,
            "y": 24
        }, {"x": 28, "y": 24}, {"x": 23, "y": 25}, {"x": 27, "y": 25}, {"x": 22, "y": 26}, {"x": 26, "y": 26}, {
            "x": 21,
            "y": 27
        }, {"x": 25, "y": 27}, {"x": 20, "y": 28}, {"x": 22, "y": 28}, {"x": 24, "y": 28}, {"x": 20, "y": 29}, {
            "x": 23,
            "y": 29
        }, {"x": 19, "y": 30}, {"x": 21, "y": 30}, {"x": 22, "y": 30}, {"x": 20, "y": 31}]
    }, {
        "type": STRUCTURE_SPAWN,
        "pos": [{"x": 28, "y": 22}, {"x": 26, "y": 24}, {"x": 24, "y": 26}]
    }, {"type": STRUCTURE_OBSERVER, "pos": [{"x": 26, "y": 23}]}, {
        "type": STRUCTURE_TERMINAL,
        "pos": [{"x": 27, "y": 23}]
    }, {
        "type": STRUCTURE_TOWER,
        "pos": [{"x": 25, "y": 24}, {"x": 27, "y": 24}, {"x": 24, "y": 25}, {"x": 26, "y": 25}, {
            "x": 23,
            "y": 26
        }, {"x": 25, "y": 26}]
    }, {"type": STRUCTURE_LINK, "pos": [{"x": 25, "y": 25}]}, {
        "type": STRUCTURE_STORAGE,
        "pos": [{"x": 23, "y": 27}]
    }, {"type": STRUCTURE_NUKER, "pos": [{"x": 24, "y": 27}]}
];

let template4 = [
    {
        "type": STRUCTURE_RAMPART,
        "pos": [{"x": 16, "y": 16}, {"x": 17, "y": 16}, {"x": 18, "y": 16}, {"x": 19, "y": 16}, {
            "x": 20,
            "y": 16
        }, {"x": 21, "y": 16}, {"x": 16, "y": 17}, {"x": 21, "y": 17}, {"x": 22, "y": 17}, {"x": 16, "y": 18}, {
            "x": 22,
            "y": 18
        }, {"x": 23, "y": 18}, {"x": 16, "y": 19}, {"x": 23, "y": 19}, {"x": 24, "y": 19}, {"x": 16, "y": 20}, {
            "x": 24,
            "y": 20
        }, {"x": 25, "y": 20}, {"x": 16, "y": 21}, {"x": 17, "y": 21}, {"x": 25, "y": 21}, {"x": 17, "y": 22}, {
            "x": 18,
            "y": 22
        }, {"x": 25, "y": 22}, {"x": 26, "y": 22}, {"x": 27, "y": 22}, {"x": 18, "y": 23}, {"x": 19, "y": 23}, {
            "x": 27,
            "y": 23
        }, {"x": 28, "y": 23}, {"x": 29, "y": 23}, {"x": 19, "y": 24}, {"x": 20, "y": 24}, {"x": 29, "y": 24}, {
            "x": 30,
            "y": 24
        }, {"x": 20, "y": 25}, {"x": 30, "y": 25}, {"x": 20, "y": 26}, {"x": 21, "y": 26}, {"x": 30, "y": 26}, {
            "x": 31,
            "y": 26
        }, {"x": 21, "y": 27}, {"x": 22, "y": 27}, {"x": 23, "y": 27}, {"x": 31, "y": 27}, {"x": 32, "y": 27}, {
            "x": 23,
            "y": 28
        }, {"x": 24, "y": 28}, {"x": 32, "y": 28}, {"x": 33, "y": 28}, {"x": 24, "y": 29}, {"x": 25, "y": 29}, {
            "x": 33,
            "y": 29
        }, {"x": 34, "y": 29}, {"x": 25, "y": 30}, {"x": 26, "y": 30}, {"x": 34, "y": 30}, {"x": 26, "y": 31}, {
            "x": 27,
            "y": 31
        }, {"x": 34, "y": 31}, {"x": 27, "y": 32}, {"x": 28, "y": 32}, {"x": 34, "y": 32}, {"x": 28, "y": 33}, {
            "x": 29,
            "y": 33
        }, {"x": 34, "y": 33}, {"x": 29, "y": 34}, {"x": 30, "y": 34}, {"x": 31, "y": 34}, {"x": 32, "y": 34}, {
            "x": 33,
            "y": 34
        }, {"x": 34, "y": 34}]
    }, {
        "type": STRUCTURE_LAB,
        "pos": [{"x": 22, "y": 22}, {"x": 26, "y": 23}, {"x": 26, "y": 24}, {"x": 27, "y": 24}, {
            "x": 23,
            "y": 26
        }, {"x": 24, "y": 26}, {"x": 24, "y": 27}, {"x": 28, "y": 28}]
    }, {
        "type": STRUCTURE_EXTENSION,
        "pos": [{"x": 18, "y": 17}, {"x": 19, "y": 17}, {"x": 20, "y": 17}, {"x": 17, "y": 18}, {
            "x": 18,
            "y": 18
        }, {"x": 20, "y": 18}, {"x": 21, "y": 18}, {"x": 17, "y": 19}, {"x": 19, "y": 19}, {"x": 21, "y": 19}, {
            "x": 22,
            "y": 19
        }, {"x": 17, "y": 20}, {"x": 18, "y": 20}, {"x": 20, "y": 20}, {"x": 22, "y": 20}, {"x": 23, "y": 20}, {
            "x": 18,
            "y": 21
        }, {"x": 19, "y": 21}, {"x": 21, "y": 21}, {"x": 23, "y": 21}, {"x": 24, "y": 21}, {"x": 19, "y": 22}, {
            "x": 20,
            "y": 22
        }, {"x": 24, "y": 22}, {"x": 20, "y": 23}, {"x": 21, "y": 23}, {"x": 25, "y": 23}, {"x": 21, "y": 24}, {
            "x": 22,
            "y": 24
        }, {"x": 23, "y": 25}, {"x": 27, "y": 25}, {"x": 28, "y": 26}, {"x": 29, "y": 26}, {"x": 25, "y": 27}, {
            "x": 29,
            "y": 27
        }, {"x": 30, "y": 27}, {"x": 25, "y": 28}, {"x": 26, "y": 28}, {"x": 30, "y": 28}, {"x": 31, "y": 28}, {
            "x": 26,
            "y": 29
        }, {"x": 27, "y": 29}, {"x": 31, "y": 29}, {"x": 32, "y": 29}, {"x": 27, "y": 30}, {"x": 28, "y": 30}, {
            "x": 30,
            "y": 30
        }, {"x": 32, "y": 30}, {"x": 33, "y": 30}, {"x": 28, "y": 31}, {"x": 29, "y": 31}, {"x": 31, "y": 31}, {
            "x": 33,
            "y": 31
        }, {"x": 29, "y": 32}, {"x": 30, "y": 32}, {"x": 32, "y": 32}, {"x": 33, "y": 32}, {"x": 30, "y": 33}, {
            "x": 31,
            "y": 33
        }, {"x": 32, "y": 33}]
    }, {
        "type": STRUCTURE_ROAD,
        "pos": [{"x": 19, "y": 18}, {"x": 18, "y": 19}, {"x": 20, "y": 19}, {"x": 19, "y": 20}, {
            "x": 21,
            "y": 20
        }, {"x": 20, "y": 21}, {"x": 22, "y": 21}, {"x": 21, "y": 22}, {"x": 23, "y": 22}, {"x": 22, "y": 23}, {
            "x": 23,
            "y": 24
        }, {"x": 25, "y": 24}, {"x": 22, "y": 25}, {"x": 24, "y": 25}, {"x": 26, "y": 25}, {"x": 28, "y": 25}, {
            "x": 25,
            "y": 26
        }, {"x": 27, "y": 26}, {"x": 28, "y": 27}, {"x": 27, "y": 28}, {"x": 29, "y": 28}, {"x": 28, "y": 29}, {
            "x": 30,
            "y": 29
        }, {"x": 29, "y": 30}, {"x": 31, "y": 30}, {"x": 30, "y": 31}, {"x": 32, "y": 31}, {"x": 31, "y": 32}]
    }, {
        "type": STRUCTURE_SPAWN,
        "pos": [{"x": 24, "y": 24}, {"x": 25, "y": 25}, {"x": 26, "y": 26}]
    }, {"type": STRUCTURE_OBSERVER, "pos": [{"x": 17, "y": 17}]}, {
        "type": STRUCTURE_TERMINAL,
        "pos": [{"x": 23, "y": 23}]
    }, {
        "type": STRUCTURE_TOWER,
        "pos": [{"x": 24, "y": 23}, {"x": 28, "y": 24}, {"x": 21, "y": 25}, {"x": 29, "y": 25}, {
            "x": 22,
            "y": 26
        }, {"x": 26, "y": 27}]
    }, {"type": STRUCTURE_LINK, "pos": [{"x": 25, "y": 25}]}, {
        "type": STRUCTURE_STORAGE,
        "pos": [{"x": 27, "y": 27}]
    }, {"type": STRUCTURE_NUKER, "pos": [{"x": 33, "y": 33}]}
];

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

function buildRoadFromTo(room, start, end) {
    let target;
    if (end instanceof RoomPosition) target = end; else target = end.pos;
    let path = getRoad(room, start.pos, target);
    if (!path) {
        path = start.pos.findPathTo(end, {
            costCallback: function (roomName, costMatrix) {
                for (let site of room.constructionSites) {
                    if (site.structureType === STRUCTURE_ROAD) {
                        costMatrix.set(site.pos.x, site.pos.y, 1);
                    }
                }
            },
            maxOps: 10000,
            serialize: false,
            ignoreCreeps: true,
            maxRooms: 1,
            ignoreRoads: false,
            swampCost: 15,
            plainCost: 15
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
    if (!cache) return null;
    let cachedPath = cache[getPathKey(from, to)];
    if (cachedPath) {
        return cachedPath.path;
    } else {
        return null;
    }
}

function getPathKey(from, to) {
    return getPosKey(from) + '$' + getPosKey(to);
}

function getPosKey(pos) {
    return pos.x + 'x' + pos.y;
}