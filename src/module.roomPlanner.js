/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by rober on 5/16/2017.
 */
const minCut = require('util.minCut');
let rampartSpots = {};
let tickTracker = {};
let globalRun;

module.exports.buildRoom = function (room) {
    // Only run once per tick
    if (globalRun === Game.time) return;
    let lastRun = tickTracker[room.name] || {};
    if (room.memory.bunkerHub && room.memory.bunkerHub.x) {
        let cooldown = 50;
        if (room.level < room.controller.level) cooldown = 10;
        if (!room.memory.labHub) return findLabHub(room);
        if (((lastRun.layout || 0) + cooldown < Game.time || (Math.random() > 0.75 && room.level < room.controller.level)) || !lastRun.layout) {
            buildFromLayout(room);
            lastRun.layout = Game.time + _.random(10, 100);
            tickTracker[room.name] = lastRun;
            globalRun = Game.time;
        } else if (room.level === room.controller.level && (((lastRun.auxiliary || 0) + cooldown < Game.time) || !lastRun.auxiliary)) {
            auxiliaryBuilding(room)
            lastRun.auxiliary = Game.time + _.random(10, 100);
            tickTracker[room.name] = lastRun;
            globalRun = Game.time;
        }
    } else {
        findHub(room);
        lastRun.layout = Game.time + _.random(10, 250);
        lastRun.auxiliary = Game.time + _.random(10, 250);
        tickTracker[room.name] = lastRun;
        globalRun = Game.time;
    }
};

function buildFromLayout(room) {
    let layout = bunkerTemplate;
    let filter = [];
    // Check if we're missing any structures
    let countCheck = _.filter(layout, (s) => ![STRUCTURE_CONTAINER, STRUCTURE_RAMPART, STRUCTURE_WALL, STRUCTURE_ROAD].includes(s.structureType) && CONTROLLER_STRUCTURES[s.structureType][room.controller.level] > _.filter(room.structures, (r) => r.structureType === s.structureType).length + _.filter(room.constructionSites, (r) => r.structureType === s.structureType).length);
    if (countCheck.length) {
        // Build tower first
        let builtSpawn = _.find(room.impassibleStructures, (s) => s.structureType === STRUCTURE_SPAWN);
        let builtTower = _.find(room.impassibleStructures, (s) => s.structureType === STRUCTURE_TOWER);
        let initialSpawn = _.find(Game.structures, (s) => s.structureType === STRUCTURE_SPAWN && s.my)
        // Handle auto spawn placement, then tower first new claims, then everything else
        if (!initialSpawn) filter = _.filter(layout, (s) => s.structureType === STRUCTURE_SPAWN);
        else if (TOWER_FIRST && !builtSpawn && !builtTower && initialSpawn) filter = _.filter(countCheck, (s) => s.structureType === STRUCTURE_TOWER);
        else filter = _.filter(countCheck, (s) => CONTROLLER_STRUCTURES[s.structureType][room.controller.level]);
        if (filter.length) {
            for (let structure of filter) {
                // Build important stuff first
                if (room.controller.level !== room.level && (structure.structureType !== STRUCTURE_EXTENSION && structure.structureType !== STRUCTURE_SPAWN && structure.structureType !== STRUCTURE_TOWER && structure.structureType !== STRUCTURE_TERMINAL)) continue;
                for (let buildPos of structure.pos) {
                    let pos = new RoomPosition(room.hub.x + buildPos.x, room.hub.y + buildPos.y, room.name);
                    if (!pos.checkForConstructionSites() && !pos.checkForAllStructure().length) {
                        pos.createConstructionSite(structure.structureType);
                    }
                }
            }
        }
    }
}

function auxiliaryBuilding(room) {
    let layout = bunkerTemplate;
    // Sources
    sourceBuilder(room);
    // Controller
    controllerBuilder(room);
    if (room.storage) {
        // Roads
        if (!_.find(room.constructionSites, (s) => s.structureType === STRUCTURE_ROAD) && !roadBuilder(room, layout)) room.memory.roadsBuilt = true; else room.memory.roadsBuilt = undefined
        // Ramparts
        rampartBuilder(room, layout);
        // Hub
        if (room.level >= 5) hubLink(room);
        if (room.level >= 6) {
            // Labs
            labBuilder(room);
            // Mineral
            mineralBuilder(room);
        }
    }
    // Cleanup
    if (Math.random() > 0.9) {
        let noRoad = _.filter(room.impassibleStructures, (s) => s.pos.checkForRoad());
        if (noRoad.length) noRoad.forEach((s) => s.pos.checkForRoad().destroy());
        let badStructure = _.filter(room.structures, (s) => (s.owner && s.owner.username !== MY_USERNAME && s.structureType !== STRUCTURE_STORAGE && s.structureType !== STRUCTURE_TERMINAL));
        if (room.controller.level >= 6) {
            badStructure = _.filter(room.structures, (s) => (s.owner && s.owner.username !== MY_USERNAME));
        } else if (room.controller.level >= 4) {
            badStructure = _.filter(room.structures, (s) => (s.owner && s.owner.username !== MY_USERNAME && s.structureType !== STRUCTURE_TERMINAL));
        }
        if (badStructure.length) badStructure.forEach((s) => s.destroy());
    }
}

function hubLink(room) {
    if (!Game.getObjectById(room.memory.hubLink)) {
        room.memory.hubLink = undefined;
        let hubLinkPos = new RoomPosition(room.hub.x, room.hub.y + 1, room.name);
        if (hubLinkPos.checkForAllStructure()[0]) {
            let hubLink = hubLinkPos.checkForAllStructure()[0];
            if (hubLink.structureType === STRUCTURE_LINK) {
                room.memory.hubLink = hubLink.id;
                return true;
            }
        }
    }
}

function controllerBuilder(room) {
    let controllerContainer = Game.getObjectById(room.memory.controllerContainer);
    if (!controllerContainer && room.controller.level >= 2) {
        controllerContainer = room.controller.pos.findInRange(room.structures, 1, {filter: (s) => s.structureType === STRUCTURE_CONTAINER})[0];
        if (!controllerContainer) {
            let controllerBuild = room.controller.pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (s) => s.structureType === STRUCTURE_CONTAINER})[0];
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
    } else if (!room.memory.controllerLink && room.controller.level >= 7) {
        let controllerLink = _.find(room.controller.pos.findInRange(room.impassibleStructures, 2), (s) => s.structureType === STRUCTURE_LINK);
        if (!controllerLink) {
            let zoneTerrain = room.lookForAtArea(LOOK_TERRAIN, controllerContainer.pos.y - 1, controllerContainer.pos.x - 1, controllerContainer.pos.y + 1, controllerContainer.pos.x + 1, true);
            for (let key in zoneTerrain) {
                if (_.find(controllerContainer.pos.findInRange(FIND_CONSTRUCTION_SITES, 1), (s) => s.structureType === STRUCTURE_LINK)) break;
                let position = new RoomPosition(zoneTerrain[key].x, zoneTerrain[key].y, room.name);
                if (position.checkForAllStructure().length || position.checkForImpassible()) continue;
                position.createConstructionSite(STRUCTURE_LINK);
                break;
            }
        } else {
            room.memory.controllerLink = controllerLink.id;
        }
    }
}

function mineralBuilder(room) {
    let extractor = _.find(room.impassibleStructures, (s) => s.structureType === STRUCTURE_EXTRACTOR);
    if (extractor) {
        // Destroy thorium extractor when empty
        if (!extractor.pos.checkForMineral()) {
            return extractor.destroy();
        }
        let extractorContainer = _.find(extractor.pos.findInRange(room.structures, 1), (s) => s.structureType === STRUCTURE_CONTAINER);
        if (!extractorContainer) {
            let extractorBuild = _.find(extractor.pos.findInRange(FIND_CONSTRUCTION_SITES, 1), (s) => s.structureType === STRUCTURE_CONTAINER);
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
            if (Game.shard.name === 'shardSeason' && extractor.resourceType === RESOURCE_THORIUM) {
                room.memory.thoriumContainer = extractorContainer.id;
            } else {
                room.memory.extractorContainer = extractorContainer.id;
            }
        }
    } else {
        if (Game.shard.name === 'shardSeason' && RESOURCE_THORIUM && _.find(room.find(FIND_MINERALS), (m) => m.resourceType === RESOURCE_THORIUM && m.amount)) {
            let thorium = room.find(this.find(FIND_MINERALS), (m) => m.resourceType === RESOURCE_THORIUM);
            if (!thorium.pos.checkForAllStructure().length && !thorium.pos.checkForConstructionSites()) thorium.pos.createConstructionSite(STRUCTURE_EXTRACTOR);
        } else {
            if (!room.mineral.pos.checkForAllStructure().length && !room.mineral.pos.checkForConstructionSites()) room.mineral.pos.createConstructionSite(STRUCTURE_EXTRACTOR);
        }
    }
}

function sourceBuilder(room) {
    if (room.controller.level >= 2) {
        for (let source of room.sources) {
            // Container
            let sourceContainer = _.find(source.pos.findInRange(room.structures, 1), (s) => s.structureType === STRUCTURE_CONTAINER);
            if (!sourceContainer) {
                source.memory.container = undefined;
                let sourceBuild = _.find(source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1), (s) => s.structureType === STRUCTURE_CONTAINER);
                if (!sourceBuild) {
                    let containerSite = findBestContainerPos(source);
                    if (containerSite && !containerSite.checkForConstructionSites()) containerSite.createConstructionSite(STRUCTURE_CONTAINER);
                }
            } else {
                // Store distance for shuttles
                if (!source.memory.distanceToHub) {
                    source.memory.distanceToHub = source.pos.findPathTo(room.hub).length;
                }
                source.memory.container = sourceContainer.id;
            }
            // Link
            if (sourceContainer && Game.getObjectById(room.memory.hubLink)) {
                let sourceLink = _.find(source.pos.findInRange(room.impassibleStructures, 2), (s) => s.structureType === STRUCTURE_LINK);
                if (!sourceLink && source.pos.countOpenTerrainAround() > 1) {
                    source.memory.link = undefined;
                    let sourceBuild = _.find(source.pos.findInRange(FIND_CONSTRUCTION_SITES, 2), (s) => s.structureType === STRUCTURE_LINK);
                    if (!sourceBuild) {
                        let zoneTerrain = room.lookForAtArea(LOOK_TERRAIN, sourceContainer.pos.y - 1, sourceContainer.pos.x - 1, sourceContainer.pos.y + 1, sourceContainer.pos.x + 1, true);
                        for (let key in zoneTerrain) {
                            let position = new RoomPosition(zoneTerrain[key].x, zoneTerrain[key].y, room.name);
                            if (position.checkForAllStructure().length || position.getRangeTo(room.controller) < 3) continue;
                            position.createConstructionSite(STRUCTURE_LINK);
                        }
                    }
                } else if (sourceLink) {
                    source.memory.link = sourceLink.id;
                }
            }
        }
    }
}

function labBuilder(room) {
    if (!room.memory.labHub) return findLabHub(room);
    let built = _.filter(room.impassibleStructures, (s) => s.structureType === STRUCTURE_LAB).length;
    let inBuild = _.find(room.constructionSites, (s) => s.structureType === STRUCTURE_LAB);
    if (CONTROLLER_STRUCTURES[STRUCTURE_LAB][room.controller.level] <= built || inBuild) return;
    let labHub = new RoomPosition(room.memory.labHub.x, room.memory.labHub.y, room.name);
    for (let structure of labTemplate) {
        let pos = new RoomPosition(labHub.x + structure.x, labHub.y + structure.y, room.name);
        if (!pos.checkForConstructionSites() && !pos.checkForAllStructure().length) {
            pos.createConstructionSite(STRUCTURE_LAB);
        }
    }
}

function roadBuilder(room, layout) {
    let spawn = _.find(room.impassibleStructures, (s) => s.structureType === STRUCTURE_SPAWN);
    // Source Roads
    for (let source of room.sources) {
        let container = Game.getObjectById(source.memory.container);
        if (container && buildRoadFromTo(room, spawn, container)) {
            return true;
        }
    }
    // Controller Road
    let container = Game.getObjectById(room.memory.controllerContainer);
    if (container && buildRoadFromTo(room, spawn, container)) {
        return true;
    }
    // Neighboring Roads
    let neighboring = Game.map.describeExits(spawn.pos.roomName);
    if (neighboring) {
        if (neighboring['1']) {
            let exits = spawn.room.find(FIND_EXIT_TOP);
            let middle = _.round(exits.length / 2);
            if (buildRoadFromTo(spawn.room, spawn, exits[middle])) {
                return true;
            }
        }
        if (neighboring['3']) {
            let exits = spawn.room.find(FIND_EXIT_RIGHT);
            let middle = _.round(exits.length / 2);
            if (buildRoadFromTo(spawn.room, spawn, exits[middle])) {
                return true;
            }
        }
        if (neighboring['5']) {
            let exits = spawn.room.find(FIND_EXIT_BOTTOM);
            let middle = _.round(exits.length / 2);
            if (buildRoadFromTo(spawn.room, spawn, exits[middle])) {
                return true;
            }
        }
        if (neighboring['7']) {
            let exits = spawn.room.find(FIND_EXIT_LEFT);
            let middle = _.round(exits.length / 2);
            if (buildRoadFromTo(spawn.room, spawn, exits[middle])) {
                return true;
            }
        }
    }
    // Bunker roads
    let filter = _.filter(layout, (s) => s.structureType === STRUCTURE_ROAD);
    for (let structure of filter) {
        for (let buildPos of structure.pos) {
            let pos = new RoomPosition(room.hub.x + buildPos.x, room.hub.y + buildPos.y, room.name);
            if (!pos.checkForRoad() && !pos.checkForConstructionSites() && !pos.checkForImpassible() && !pos.checkForWall()) {
                if (pos.createConstructionSite(STRUCTURE_ROAD) === OK) {
                    return true;
                }
            }
        }
    }
    // Mineral Roads/Harvester and labs
    if (room.level >= 6) {
        let container = Game.getObjectById(room.memory.extractorContainer);
        let spawn = _.sample(_.filter(room.impassibleStructures, (s) => s.structureType === STRUCTURE_SPAWN));
        if (container && spawn && buildRoadFromTo(room, spawn, container)) return true;
        let labs = _.filter(room.impassibleStructures, (s) => s.structureType === STRUCTURE_LAB);
        if (labs.length) {
            labs.forEach((l) => {
                let hub = new RoomPosition(room.memory.bunkerHub.x, room.memory.bunkerHub.y, room.name);
                if (buildRoadAround(room, l.pos)) return true;
                if (buildRoadFromTo(room, l, hub)) return true;
            });
        }
    }
    return false;
}

function rampartBuilder(room, layout = undefined, count = false) {
    // Protected Structures
    _.filter(room.structures, (s) => protectedStructureTypes.includes(s.structureType) && !s.pos.checkForRampart() && !s.pos.checkForConstructionSites()).forEach((s) => s.pos.createConstructionSite(STRUCTURE_RAMPART));
    // Handle rampart bunker placement
    if (!rampartSpots[room.name] || Math.random() > 0.98) {
        rampartSpots[room.name] = undefined;
        let rect_array = [];
        // structures
        for (let structure of layout) {
            for (let buildPos of structure.pos) {
                rect_array.push({
                    x1: (buildPos.x + room.hub.x) - 3,
                    y1: (buildPos.y + room.hub.y) - 3,
                    x2: (buildPos.x + room.hub.x) + 3,
                    y2: (buildPos.y + room.hub.y) + 3
                });
            }
        }
        // Controller
        if (PROTECT_CONTROLLER) {
            rect_array.push({
                x1: room.controller.pos.x - 1,
                y1: room.controller.pos.y - 1,
                x2: room.controller.pos.x + 1,
                y2: room.controller.pos.y + 1
            });
        }
        if (PROTECT_SOURCES) {
            // Sources
            for (let source of room.sources) {
                rect_array.push({
                    x1: source.pos.x - 1,
                    y1: source.pos.y - 1,
                    x2: source.pos.x + 1,
                    y2: source.pos.y + 1
                });
            }
        }
        if (PROTECT_MINERAL) {
            rect_array.push({
                x1: room.mineral.pos.x - 1,
                y1: room.mineral.pos.y - 1,
                x2: room.mineral.pos.x + 1,
                y2: room.mineral.pos.y + 1
            });
        }
        let bounds = {x1: 0, y1: 0, x2: 49, y2: 49};
        // Clean up boundaries
        for (let key in rect_array) {
            if (rect_array[key].x1 < 2) rect_array[key].x1 = 2;
            if (rect_array[key].y1 < 2) rect_array[key].y1 = 2;
            if (rect_array[key].x2 > 47) rect_array[key].x2 = 47;
            if (rect_array[key].y2 > 47) rect_array[key].y2 = 47;
        }
        try {
            rampartSpots[room.name] = JSON.stringify(minCut.GetCutTiles(room.name, rect_array, bounds));
        } catch (e) {
            log.e('MinCut Error in room ' + room.name);
            log.e(e.stack);
        }
        if (count && rampartSpots[room.name]) {
            return _.size(JSON.parse(rampartSpots[room.name]));
        }
    } else if (rampartSpots[room.name]) {
        if (room.level >= 3) {
            let spots = JSON.parse(rampartSpots[room.name]);
            if (!spots.length) _.filter(room.structures, (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART).forEach((b) => spots.push({
                x: b.pos.x,
                y: b.pos.y
            }));
            let buildPositions = [];
            spots.forEach((p) => buildPositions.push(new RoomPosition(p.x, p.y, room.name)));
            let cycles = 0;
            let inBuild = _.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL).length;
            for (let pos of buildPositions) {
                if (cycles + inBuild >= 4) break;
                if ((RAMPARTS_ONLY || pos.checkForAllStructure()[0] || pos.isNearTo(room.controller) || pos.isNearTo(room.mineral) || pos.getRangeTo(pos.findClosestByRange(FIND_SOURCES)) <= 3)
                    && !pos.checkForBarrierStructure() && !pos.checkForConstructionSites() && pos.createConstructionSite(STRUCTURE_RAMPART) === OK) return cycles++;
                // Handle tunnels
                else if (pos.checkForWall()) {
                    for (let xOff = -1; xOff <= 1; xOff++) {
                        for (let yOff = -1; yOff <= 1; yOff++) {
                            if (xOff !== 0 || yOff !== 0) {
                                let newPos = new RoomPosition(pos.x + xOff, pos.y + yOff, pos.roomName);
                                if (!newPos.checkForWall() && !newPos.checkForBarrierStructure() && !newPos.checkForConstructionSites() && newPos.createConstructionSite(STRUCTURE_RAMPART) === OK) return cycles++
                            }
                        }
                    }
                } else if (!RAMPARTS_ONLY && ((isEven(pos.x) && isOdd(pos.y)) || (isOdd(pos.x) && isEven(pos.y))) && !pos.checkForBuiltWall() && !pos.checkForConstructionSites()) {
                    if (pos.checkForRampart() && !pos.checkForAllStructure()[0]) pos.checkForRampart().destroy();
                    else if (pos.createConstructionSite(STRUCTURE_WALL) === OK) return cycles++
                } else if (!pos.checkForRampart() && !pos.checkForBuiltWall() && !pos.checkForConstructionSites() && pos.createConstructionSite(STRUCTURE_RAMPART) === OK) {
                    return cycles++
                } else if (pos.checkForBuiltWall() && RAMPARTS_ONLY) {
                    pos.checkForBuiltWall().destroy();
                    return;
                } else if (pos.checkForBuiltWall() && pos.checkForRampart()) {
                    pos.checkForRampart().destroy();
                    return;
                } else if (pos.checkForBuiltWall() && pos.checkForRoad()) {
                    pos.checkForRoad().destroy();
                    return;
                } else if (pos.checkForRampart() && !pos.checkForImpassible() && !pos.checkForRoad()) {
                    pos.createConstructionSite(STRUCTURE_ROAD);
                    return;
                }
            }
        }
    }
    // Build ramparts around sources, mineral, controller
    if (room.level >= 3) {
        for (let source of room.sources) {
            buildRampartAround(source.pos);
        }
        buildRampartAround(room.mineral.pos);
        buildRampartAround(room.controller.pos);
    }
}

module.exports.hubCheck = function (room) {
    return findHub(room, true)
};

let storedPos, storedPossibles;
function findHub(room, hubCheck = undefined) {
    if (room.controller.owner && room.controller.owner.username === MY_USERNAME && room.memory.bunkerHub && room.memory.bunkerHub.x && room.memory.bunkerHub.y) return buildFromLayout(room);
    if (room.structures.length) _.filter(room.structures, (s) => !s.owner || s.owner.username !== MY_USERNAME).forEach((s) => s.destroy());
    let pos, xOffset, yOffset, layoutVersion, layout;
    let possiblePos = storedPossibles || {};
    let posCount = 0;
    // If we already have a spawn in room, go off of that
    let spawn = _.find(room.impassibleStructures, (s) => s.my && s.structureType === STRUCTURE_SPAWN);
    if (spawn) {
        room.memory.bunkerHub = {};
        room.memory.bunkerHub.x = spawn.pos.x;
        room.memory.bunkerHub.y = spawn.pos.y + 1;
        buildFromLayout(room);
    } else {
        if (!storedPos) storedPos = {};
        if (!storedPos[room.name]) storedPos[room.name] = {};
        if (!storedPossibles) storedPossibles = {};
        if (!storedPossibles[room.name]) storedPossibles[room.name] = {};
        // Start search at 10,10 and work our way out
        let x = storedPos[room.name].x || 9;
        let y = storedPos[room.name].y || 10;
        let complete;
        // Loop runs until all possible positions have been checked
        primary:
            for (let i = 1; i < 250;) {
                // Mechanic to cycle through all possible positions
                x++;
                if (x > 40 && y >= 40) {
                    complete = true;
                    break;
                } else if (x > 40) {
                    x = 10;
                    y++;
                }
                storedPos[room.name].x = x;
                storedPos[room.name].y = y;
                pos = new RoomPosition(x, y, room.name);
                if (pos.checkForImpassible()) continue;
                // Cycle through buildings to make sure the hub fits
                for (let type of bunkerTemplate) {
                    for (let s of type.pos) {
                        let structure = {};
                        structure.x = x + s.x;
                        structure.y = y + s.y;
                        if (structure.x > 49 || structure.x < 1 || structure.y > 49 || structure.y < 1) continue primary;
                        let structurePos = new RoomPosition(structure.x, structure.y, room.name);
                        let closestSource = structurePos.findClosestByRange(FIND_SOURCES);
                        if (type.structureType !== STRUCTURE_RAMPART && (structurePos.checkIfOutOfBounds() || structurePos.isNearTo(room.controller) || structurePos.isNearTo(closestSource) || structurePos.checkForImpassible())) {
                            continue primary;
                        }
                    }
                }
                if (hubCheck) return true;
                possiblePos[posCount++] = {
                    x: pos.x,
                    y: pos.y,
                };
                storedPossibles[room.name] = possiblePos;
                i++;
            }
        if (complete && _.size(storedPossibles[room.name])) {
            log.a('Bunker Hub search complete for ' + room.name + '...');
            log.a('Final possible count: ' + _.size(storedPossibles[room.name]));
            let choice = _.sample(storedPossibles[room.name]);
            room.memory.bunkerHub = {};
            room.memory.bunkerHub.x = choice.x;
            room.memory.bunkerHub.y = choice.y;
            buildFromLayout(room);
            storedPos[room.name] = undefined;
            storedPossibles[room.name] = undefined;
            return true;
        } else if (!complete) {
            log.a('Bunker Hub search incomplete for ' + room.name + ', continuing next tick.');
            log.a('Current position: ' + storedPos[room.name].x + ',' + storedPos[room.name].y);
            log.a('Current possible count: ' + _.size(storedPossibles[room.name]));
        } else if (complete && !_.size(storedPossibles[room.name])) {
            if (hubCheck) return undefined;
            abandonRoom(room);
            storedPos[room.name] = undefined;
            storedPossibles[room.name] = undefined;
            return log.a(room.name + ' has been abandoned due to being unable to find a suitable layout.');
        }
    }
    return false;
}

let storedLabPos, storedLabPossibles;
function findLabHub(room) {
    if (room.memory.labHub && room.memory.labHub.x && room.memory.labHub.y) return;
    let pos;
    if (!storedLabPossibles) storedLabPossibles = {};
    if (!storedLabPossibles[room.name]) storedLabPossibles[room.name] = {};
    let posCount = 0;
    if (!storedLabPos) storedLabPos = {};
    if (!storedLabPos[room.name]) storedLabPos[room.name] = {};
    let possiblePos = storedLabPossibles[room.name] || {};
    // Start search at 10,10 and work our way out
    let x = storedLabPos[room.name].x || 9;
    let y = storedLabPos[room.name].y || 10;
    let complete;
    let roomHub = new RoomPosition(room.memory.bunkerHub.x, room.memory.bunkerHub.y, room.name);
    // Loop runs until all possible positions have been checked
    primary:
        for (let i = 1; i < 500;) {
            // Mechanic to cycle through all possible positions
            x++;
            if (x > 40 && y >= 40) {
                complete = true;
                break;
            } else if (x > 40) {
                x = 10;
                y++;
            }
            storedLabPos[room.name].x = x;
            storedLabPos[room.name].y = y;
            pos = new RoomPosition(x, y, room.name);
            if (pos.checkForImpassible()) continue;
            // Cycle through buildings to make sure the hub fits
            for (let pos of labTemplate) {
                let structure = {};
                structure.x = x + pos.x;
                structure.y = y + pos.y;
                if (structure.x > 49 || structure.x < 1 || structure.y > 49 || structure.y < 1) continue primary;
                let structurePos = new RoomPosition(structure.x, structure.y, room.name);
                if (structurePos.checkIfOutOfBounds() || structurePos.checkForImpassible() || structurePos.getRangeTo(roomHub) <= 6
                    || structurePos.isNearTo(room.controller) || structurePos.isNearTo(structurePos.findClosestByRange(FIND_SOURCES)) || structurePos.countOpenTerrainAround() < 7) {
                    continue primary;
                }
            }
            possiblePos[posCount++] = {
                x: pos.x,
                y: pos.y,
            };
            storedLabPossibles[room.name] = possiblePos;
            i++;
        }
    if (complete && _.size(storedLabPossibles[room.name])) {
        log.a('Lab Hub search complete for ' + room.name + '...');
        log.a('Final possible count: ' + _.size(storedLabPossibles[room.name]));
        let choice = _.min(storedLabPossibles[room.name], function (p) {
            return new RoomPosition(p.x, p.y, room.name).getRangeTo(new RoomPosition(room.memory.bunkerHub.x, room.memory.bunkerHub.y, room.name));
        });
        room.memory.labHub = {};
        room.memory.labHub.x = choice.x;
        room.memory.labHub.y = choice.y;
        storedLabPos[room.name] = undefined;
        storedLabPossibles[room.name] = undefined;
        return true;
    } else if (!complete) {
        log.a('Lab Hub search incomplete for ' + room.name + ', continuing next tick.');
        log.a('Current position: ' + storedLabPos[room.name].x + ',' + storedLabPos[room.name].y);
        log.a('Current possible count: ' + _.size(storedLabPossibles[room.name]));
    } else if (complete && !_.size(storedLabPossibles[room.name])) {
        storedLabPos[room.name] = undefined;
        storedLabPossibles[room.name] = undefined;
        return log.a('Cannot find a lab hub in ' + room.name + '.');
    }
}

function praiseRoom(room) {
    // Abandon praise room at rcl8
    if (room.controller.level === 8 || !BUILD_PRAISE_ROOMS) return abandonRoom(room.name);
    // Build spawn, if the spawn exists make sure it has a rampart
    let spawn = _.find(room.impassibleStructures, (s) => s.structureType === STRUCTURE_SPAWN) || _.find(room.constructionSites, (s) => s.structureType === STRUCTURE_SPAWN);
    if (!spawn) {
        for (let xOff = -1; xOff <= 1; xOff++) {
            for (let yOff = -1; yOff <= 1; yOff++) {
                if (xOff !== 0 || yOff !== 0) {
                    let pos = new RoomPosition(room.controller.pos.x + xOff, room.controller.pos.y + yOff, room.name);
                    if (!pos.checkForImpassible() && pos.countOpenTerrainAround() >= 4 && pos.createConstructionSite(STRUCTURE_SPAWN)) return;
                }
            }
        }
    } else if (!spawn.pos.checkForRampart() && !spawn.pos.checkForConstructionSites()) spawn.pos.createConstructionSite(STRUCTURE_RAMPART);
    // Bunker Ramparts
    if (room.controller.level >= 2 && !_.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL).length) {
        if (!rampartSpots[room.name] || Math.random() > 0.98) {
            // Delete old memory
            room.memory.rampartSpots = undefined;
            rampartSpots[room.name] = undefined;
            let rect_array = [];
            rect_array.push({
                x1: spawn.pos.x - 4,
                y1: spawn.pos.y - 4,
                x2: spawn.pos.x + 4,
                y2: spawn.pos.y + 4
            });
            let bounds = {x1: 0, y1: 0, x2: 49, y2: 49};
            rampartSpots[room.name] = JSON.stringify(minCut.GetCutTiles(room.name, rect_array, bounds));
        } else if (rampartSpots[room.name]) {
            let buildPositions = JSON.parse(rampartSpots[room.name]);
            for (let rampartPos of buildPositions) {
                let pos = new RoomPosition(rampartPos.x, rampartPos.y, room.name);
                if (!pos.isNearTo(room.controller) && !pos.isNearTo(room.mineral) && !pos.isNearTo(pos.findClosestByRange(FIND_SOURCES)) && ((isEven(pos.x) && isOdd(pos.y)) || (isOdd(pos.x) && isEven(pos.y))) && !pos.checkForBuiltWall() && !pos.checkForConstructionSites() && pos.isNearTo(pos.findClosestByRange(_.filter(room.structures, (s) => s.structureType === STRUCTURE_RAMPART)))) {
                    if (pos.checkForRampart()) pos.checkForRampart().destroy();
                    if (pos.checkForRoad()) pos.checkForRoad().destroy();
                    pos.createConstructionSite(STRUCTURE_WALL);
                    break;
                } else if (!pos.checkForRampart() && !pos.checkForBuiltWall() && !pos.checkForConstructionSites()) {
                    pos.createConstructionSite(STRUCTURE_RAMPART);
                    break;
                } else if (pos.checkForBuiltWall() && pos.checkForRampart()) {
                    pos.checkForRampart().destroy();
                } else if (pos.checkForBuiltWall() && pos.checkForRoad()) {
                    pos.checkForRoad().destroy();
                }
            }
        }
    }
    // Tower
    if (room.controller.level >= 3) {
        let towers = _.filter(room.impassibleStructures, (s) => s.structureType === STRUCTURE_TOWER);
        let towerHub = room.mineral;
        if (towers.length) towerHub = _.sample(towers);
        //Build Towers
        if (CONTROLLER_STRUCTURES[STRUCTURE_TOWER][room.controller.level] > towers.length && towerHub.pos.countOpenTerrainAround() > 1) {
            for (let xOff = -1; xOff <= 1; xOff++) {
                for (let yOff = -1; yOff <= 1; yOff++) {
                    if (xOff !== 0 || yOff !== 0) {
                        let pos = new RoomPosition(room.mineral.pos.x + xOff, room.mineral.pos.y + yOff, room.name);
                        if (!pos.checkForImpassible() && pos.countOpenTerrainAround()) pos.createConstructionSite(STRUCTURE_TOWER);
                    }
                }
            }
        } else {
            // Ramparts on Towers
            towers.forEach(function (t) {
                if (!t.pos.checkForRampart() && !t.pos.checkForConstructionSites()) t.pos.createConstructionSite(STRUCTURE_RAMPART)
            })
        }
    }
    // Terminal and Mineral
    if (room.controller.level >= 6) {
        // Build extractor
        if (!room.mineral.pos.checkForAllStructure().length && !room.mineral.pos.checkForConstructionSites()) room.mineral.pos.createConstructionSite(STRUCTURE_EXTRACTOR);
        // Build terminal
        if (!room.terminal) {
            for (let xOff = -1; xOff <= 1; xOff++) {
                for (let yOff = -1; yOff <= 1; yOff++) {
                    if (xOff !== 0 || yOff !== 0) {
                        let pos = new RoomPosition(room.mineral.pos.x + xOff, room.mineral.pos.y + yOff, room.name);
                        if (!pos.checkForImpassible() && pos.countOpenTerrainAround()) pos.createConstructionSite(STRUCTURE_TERMINAL);
                    }
                }
            }
        }
    }
}

function buildRoadFromTo(room, start, end) {
    let target, begin;
    if (start instanceof RoomPosition) begin = start; else begin = start.pos;
    if (end instanceof RoomPosition) target = end; else target = end.pos;
    let path = getRoad(room, begin, target);
    if (!path) {
        path = begin.findPathTo(end, {
            maxOps: 10000,
            serialize: false,
            ignoreCreeps: true,
            maxRooms: 1,
            costCallback: function (roomName, costMatrix) {
                let terrain = Game.map.getRoomTerrain(room.name);
                for (let y = 0; y < 50; y++) {
                    for (let x = 0; x < 50; x++) {
                        let tile = terrain.get(x, y);
                        if (tile === 0) costMatrix.set(x, y, 15);
                        if (tile === 1) {
                            let tilePos = new RoomPosition(x, y, room.name);
                            if (tilePos.findInRange(FIND_SOURCES, 1).length || tilePos.findInRange(FIND_MINERALS, 1).length) costMatrix.set(x, y, 256); else costMatrix.set(x, y, 235);
                        }
                        if (tile === 2) costMatrix.set(x, y, 15);
                    }
                }
                for (let site of room.constructionSites) {
                    if (site.structureType === STRUCTURE_ROAD) {
                        costMatrix.set(site.pos.x, site.pos.y, 1);
                    }
                }
                for (let structures of room.structures) {
                    if (_.includes(OBSTACLE_OBJECT_TYPES, structures.structureType)) {
                        costMatrix.set(structures.pos.x, structures.pos.y, 256);
                    } else if (structures.structureType === STRUCTURE_CONTAINER) {
                        costMatrix.set(structures.pos.x, structures.pos.y, 250);
                    } else if (structures.structureType === STRUCTURE_ROAD) {
                        costMatrix.set(structures.pos.x, structures.pos.y, 1);
                    }
                }
            },
        });
        if (path.length) cacheRoad(room, begin, target, path); else return;
        for (let point of path) {
            let pos = new RoomPosition(point.x, point.y, room.name);
            if (buildRoad(pos)) return true;
        }
    } else {
        for (let point of JSON.parse(path)) {
            let pos = new RoomPosition(point.x, point.y, room.name);
            if (buildRoad(pos)) return true;
        }
    }
}

function buildRoadAround(room, position) {
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (xOff !== 0 || yOff !== 0) {
                let pos = new RoomPosition(position.x + xOff, position.y + yOff, room.name);
                if (buildRoad(pos)) return true;
            }
        }
    }
}

function buildRampartAround(position) {
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (xOff !== 0 || yOff !== 0) {
                let pos = new RoomPosition(position.x + xOff, position.y + yOff, position.roomName);
                if (!pos.checkForWall() && !pos.checkForConstructionSites() && !pos.checkForRampart()) {
                    pos.createConstructionSite(STRUCTURE_RAMPART);
                    return true;
                }
            }
        }
    }
    return false;
}

function buildRoad(position) {
    if (position.checkForImpassible(true)) {
        return false;
    } else if (position.checkForRoad()) {
        return false;
    } else {
        if (position.createConstructionSite(STRUCTURE_ROAD) === OK) {
            return true;
        }
    }
}

function cacheRoad(room, from, to, path) {
    let key = getPathKey(from, to);
    let cache = ROAD_CACHE[room.name] || {};
    let tick = Game.time;
    cache[key] = {
        path: JSON.stringify(path),
        tick: tick
    };
    room.memory._roadCache = undefined;
    ROAD_CACHE[room.name] = cache;
}

function getRoad(room, from, to) {
    let cache = ROAD_CACHE[room.name] || undefined;
    if (!cache) return;
    let cachedPath = cache[getPathKey(from, to)];
    if (cachedPath) {
        return cachedPath.path;
    } else {

    }
}

function getPathKey(from, to) {
    return getPosKey(from) + '$' + getPosKey(to);
}

function getPosKey(pos) {
    return pos.x + 'x' + pos.y;
}

function containsObject(obj, list) {
    let i;
    for (i = 0; i < list.length; i++) {
        if (list[i] === obj) {
            return true;
        }
    }
    return false;
}

function findBestContainerPos(source) {
    let bestPos, bestCount;
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (xOff !== 0 || yOff !== 0) {
                let pos = new RoomPosition(source.pos.x + xOff, source.pos.y + yOff, source.pos.roomName);
                if (pos.checkForWall()) continue;
                if (!bestCount || pos.countOpenTerrainAround(true, true) > bestCount) {
                    bestCount = pos.countOpenTerrainAround(true, true);
                    bestPos = pos;
                }
            }
        }
    }
    return bestPos;
}

let protectedStructureTypes = [
    STRUCTURE_SPAWN,
    STRUCTURE_STORAGE,
    STRUCTURE_TOWER,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_TERMINAL,
    STRUCTURE_NUKER,
    STRUCTURE_OBSERVER,
    STRUCTURE_LINK,
    STRUCTURE_EXTRACTOR,
    STRUCTURE_LAB
];

let bunkerTemplate = [
    {
        "structureType": STRUCTURE_SPAWN,
        "pos": [{"x": -1, "y": -1}, {"x": 0, "y": -1}, {"x": 1, "y": -1}]
    },
    {
        "structureType": STRUCTURE_OBSERVER,
        "pos": [{"x": 0, "y": 0}]
    },
    {
        "structureType": STRUCTURE_FACTORY,
        "pos": [{"x": 0, "y": 2}]
    },
    {
        "structureType": STRUCTURE_LINK,
        "pos": [{"x": 0, "y": 1}]
    },
    {
        "structureType": STRUCTURE_TERMINAL,
        "pos": [{"x": -1, "y": 0}]
    },
    {
        "structureType": STRUCTURE_STORAGE,
        "pos": [{"x": 1, "y": 0}]
    },
    {
        "structureType": STRUCTURE_POWER_SPAWN,
        "pos": [{"x": -1, "y": 1}]
    },
    {
        "structureType": STRUCTURE_NUKER,
        "pos": [{"x": 1, "y": 1}]
    },
    {
        "structureType": STRUCTURE_TOWER,
        "pos": [{"x": 0, "y": 5}, {"x": 0, "y": -5},
            {"x": 5, "y": 3}, {"x": -5, "y": 3},
            {"x": 5, "y": -3}, {"x": -5, "y": -3}]
    },
    {
        "structureType": STRUCTURE_EXTENSION,
        "pos": [{"x": 5, "y": 0}, {"x": -5, "y": 0}, {"x": 2, "y": 0}, {"x": -2, "y": 0},
            {"x": 3, "y": 1}, {"x": 4, "y": 1}, {"x": -3, "y": 1}, {"x": -4, "y": 1},
            {"x": 2, "y": 2}, {"x": 3, "y": 2}, {"x": 5, "y": 2}, {"x": -2, "y": 2}, {"x": -3, "y": 2}, {
                "x": -5,
                "y": 2
            },
            {"x": 1, "y": 3}, {"x": -1, "y": 3}, {"x": 4, "y": 3}, {"x": -4, "y": 3},
            {"x": 1, "y": 4}, {"x": 2, "y": 4}, {"x": 3, "y": 4}, {"x": 5, "y": 4}, {"x": -1, "y": 4}, {
                "x": -2,
                "y": 4
            }, {"x": -3, "y": 4}, {"x": -5, "y": 4},
            {"x": 1, "y": 5}, {"x": 2, "y": 5}, {"x": 4, "y": 5}, {"x": -1, "y": 5}, {"x": -2, "y": 5}, {
                "x": -4,
                "y": 5
            },
            {"x": 3, "y": -1}, {"x": 4, "y": -1}, {"x": -3, "y": -1}, {"x": -4, "y": -1},
            {"x": 2, "y": -2}, {"x": 3, "y": -2}, {"x": 5, "y": -2}, {"x": -2, "y": -2}, {"x": -3, "y": -2}, {
                "x": -5,
                "y": -2
            },
            {"x": 1, "y": -3}, {"x": -1, "y": -3}, {"x": 4, "y": -3}, {"x": -4, "y": -3},
            {"x": 1, "y": -4}, {"x": 2, "y": -4}, {"x": 3, "y": -4}, {"x": 5, "y": -4}, {"x": -1, "y": -4}, {
                "x": -2,
                "y": -4
            }, {"x": -3, "y": -4}, {"x": -5, "y": -4},
            {"x": 1, "y": -5}, {"x": 2, "y": -5}, {"x": 4, "y": -5}, {"x": -1, "y": -5}, {"x": -2, "y": -5}, {
                "x": -4,
                "y": -5
            }]
    },
    {
        "structureType": STRUCTURE_ROAD,
        "pos": [{"x": 2, "y": 0}, {"x": 3, "y": 0}, {"x": 4, "y": 0}, {"x": -2, "y": 0}, {"x": -3, "y": 0}, {
            "x": -4,
            "y": 0
        },
            {"x": 2, "y": 1}, {"x": 5, "y": 1}, {"x": -2, "y": 1}, {"x": -5, "y": 1},
            {"x": 0, "y": 2}, {"x": 1, "y": 2}, {"x": 4, "y": 2}, {"x": -1, "y": 2}, {"x": -4, "y": 2},
            {"x": 0, "y": 3}, {"x": 2, "y": 3}, {"x": 3, "y": 3}, {"x": 5, "y": 3}, {"x": -2, "y": 3}, {
                "x": -3,
                "y": 3
            }, {"x": -5, "y": 3},
            {"x": 0, "y": 4}, {"x": 4, "y": 4}, {"x": -4, "y": 4},
            {"x": 0, "y": 5}, {"x": 3, "y": 5}, {"x": 5, "y": 5}, {"x": -3, "y": 5}, {"x": -5, "y": 5},
            {"x": 2, "y": -1}, {"x": 5, "y": -1}, {"x": -2, "y": -1}, {"x": -5, "y": -1},
            {"x": 0, "y": -2}, {"x": 1, "y": -2}, {"x": 4, "y": -2}, {"x": -1, "y": -2}, {"x": -4, "y": -2},
            {"x": 0, "y": -3}, {"x": 2, "y": -3}, {"x": 3, "y": -3}, {"x": 5, "y": -3}, {"x": -2, "y": -3}, {
                "x": -3,
                "y": -3
            }, {"x": -5, "y": -3},
            {"x": 0, "y": -4}, {"x": 4, "y": -4}, {"x": -4, "y": -4},
            {"x": 0, "y": -5}, {"x": 3, "y": -5}, {"x": 5, "y": -5}, {"x": -3, "y": -5}, {"x": -5, "y": -5},]
    },
]

let labTemplate = [{"x": 0, "y": 0}, {"x": 0, "y": 1}, {"x": 1, "y": 0}, {"x": -1, "y": 0}, {"x": 0, "y": -1}, {
    "x": 1,
    "y": -1
}, {"x": 1, "y": 1}, {"x": 0, "y": 2}, {"x": -1, "y": 1}, {"x": -1, "y": 2}];