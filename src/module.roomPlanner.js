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
    let hub = new RoomPosition(room.memory.bunkerHub.x, room.memory.bunkerHub.y, room.name);
    let xOffset = difference(hub.x, 15);
    if (hub.x < 15) xOffset *= -1;
    let yOffset = difference(hub.y, 16);
    if (hub.y < 16) yOffset *= -1;
    let layout = [];
    for (let type of template) {
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
    // Ramparts on buildings
    if (level >= 7 && level === extensionLevel) {
        for (let store of _.filter(room.structures, (s) => protectedStructures.includes(s.structureType))) {
            room.createConstructionSite(store.pos, STRUCTURE_RAMPART);
        }
    }
    // Roads
    if (room.controller.level >= 3 && !_.size(room.constructionSites) && level === extensionLevel) {
        let filter = _.filter(layout, (s) => s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_RAMPART);
        for (let structure of filter) {
            let pos = new RoomPosition(structure.x, structure.y, room.name);
            if (!pos.checkForConstructionSites() && !pos.checkForAllStructure().length && !pos.checkForWall() && !pos.checkForRoad()) pos.createConstructionSite(STRUCTURE_ROAD);
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
}

function findHub(room) {
    if (_.size(room.memory.bunkerHub)) return;
    let spawn = _.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN && s.my)[0];
    if (spawn && room.controller.level === 1) {
        room.memory.bunkerHub = {};
        room.memory.bunkerHub.x = spawn.pos.x;
        room.memory.bunkerHub.y = spawn.pos.y - 1;
        return true;
    }
    for (let i = 1; i < 1000; i++) {
        let searched = [];
        let hubSearch = room.memory.newHubSearch || 0;
        if (hubSearch >= 3000) {
            //abandonRoom(room.name);
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
            let controller = this.room.controller;
            let closestSource = pos.findClosestByRange(FIND_SOURCES);
            let terrain = Game.rooms[pos.roomName].lookForAtArea(LOOK_TERRAIN, pos.y - 6, pos.x - 5, pos.y + 4, pos.x + 5, true);
            let wall = false;
            for (let key in terrain) {
                let position = new RoomPosition(terrain[key].x, terrain[key].y, room.name);
                if (!position.checkForWall()) {
                    continue;
                }
                wall = true;
                break;
            }
            if (pos.getRangeTo(controller) >= 2 && !wall && pos.getRangeTo(closestSource) >= 2) {
                room.memory.bunkerHub = {};
                room.memory.bunkerHub.x = pos.x;
                room.memory.bunkerHub.y = pos.y;
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
    {"type": STRUCTURE_TOWER,
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