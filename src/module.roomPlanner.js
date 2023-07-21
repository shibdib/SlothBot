/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by rober on 5/16/2017.
 */
let layouts = require('module.roomLayouts');
let minCut = require('util.minCut');
let storedLayouts = {};
let rampartSpots = {};
let tickTracker = {};

module.exports.buildRoom = function (room) {
    let lastRun = tickTracker[room.name] || {};
    if (room.memory.bunkerHub && room.memory.bunkerHub.x) {
        if (room.memory.bunkerHub.layoutVersion === LAYOUT_VERSION && storedLayouts[room.name]) {
            let cooldown = 50;
            if (room.level < room.controller.level) cooldown = 25;
            if (((lastRun.layout || 0) + cooldown < Game.time || (Math.random() > 0.75 && room.level < room.controller.level)) || !lastRun.layout) {
                buildFromLayout(room);
                lastRun.layout = Game.time + _.random(10, 100);
                tickTracker[room.name] = lastRun;
            } else if (room.level === room.controller.level && (((lastRun.auxiliary || 0) + cooldown < Game.time) || !lastRun.auxiliary)) {
                auxiliaryBuilding(room)
                lastRun.auxiliary = Game.time + _.random(10, 100);
                tickTracker[room.name] = lastRun;
            }
        } else {
            storedLayouts[room.name] = undefined;
            updateLayout(room);
            tickTracker[room.name] = lastRun;
        }
    } else {
        storedLayouts[room.name] = undefined;
        findHub(room);
        lastRun.layout = Game.time + _.random(10, 250);
        lastRun.auxiliary = Game.time + _.random(10, 250);
        tickTracker[room.name] = lastRun;
    }
};

function buildFromLayout(room) {
    let hub = new RoomPosition(room.memory.bunkerHub.x, room.memory.bunkerHub.y, room.name);
    let layout = JSON.parse(storedLayouts[room.name]);
    let filter = [];
    // Handle a rebuild
    let builtSpawn = _.find(room.structures, (s) => s.structureType === STRUCTURE_SPAWN);
    let builtTower = _.find(room.structures, (s) => s.structureType === STRUCTURE_TOWER);
    let initialSpawn = _.find(Game.structures, (s) => s.structureType === STRUCTURE_SPAWN && s.my)
    if (!initialSpawn) {
        filter = _.filter(layout, (s) => s.structureType === STRUCTURE_SPAWN);
    } else {
        let countCheck = _.filter(layout, (s) => ![STRUCTURE_CONTAINER, STRUCTURE_RAMPART, STRUCTURE_WALL, STRUCTURE_ROAD, STRUCTURE_LINK].includes(s.structureType) && CONTROLLER_STRUCTURES[s.structureType][room.controller.level] > _.filter(room.structures, (r) => r.structureType === s.structureType).length + _.filter(room.constructionSites, (r) => r.structureType === s.structureType).length);
        if (countCheck.length) {
            // Build tower first
            if (!builtSpawn && !builtTower && initialSpawn && room.controller.level >= 3) return rampartBuilder(room, layout);
            // Build preset layout
            else if (room.controller.level === 8) {
                filter = _.filter(countCheck, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART);
            } else if (room.controller.level === 6 || room.controller.level === 7) {
                filter = _.filter(countCheck, (s) => s.structureType !== STRUCTURE_OBSERVER && s.structureType !== STRUCTURE_POWER_SPAWN && s.structureType !== STRUCTURE_NUKER && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART);
            } else if (room.controller.level < 6 && room.controller.level >= 3) {
                filter = _.filter(countCheck, (s) => s.structureType !== STRUCTURE_OBSERVER && s.structureType !== STRUCTURE_POWER_SPAWN && s.structureType !== STRUCTURE_NUKER && s.structureType !== STRUCTURE_TERMINAL && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_LAB);
            } else if (!initialSpawn) {
                filter = _.filter(countCheck, (s) => s.structureType === STRUCTURE_SPAWN);
            }
        }
    }
    let built;
    if (filter.length) {
        let count = 0;
        for (let structure of filter) {
            // Check if already at count
            if (CONTROLLER_STRUCTURES[structure.structureType][room.controller.level] <= (_.filter(room.structures, (s) => s.structureType === structure.structureType).length + _.filter(room.constructionSites, (s) => s.structureType === structure.structureType).length)) continue;
            // Towers handled elsewhere
            if (structure.structureType === STRUCTURE_TOWER) continue;
            let pos = new RoomPosition(structure.x, structure.y, room.name);
            if (room.controller.level !== room.level && (structure.structureType !== STRUCTURE_EXTENSION && structure.structureType !== STRUCTURE_SPAWN && structure.structureType !== STRUCTURE_TOWER && structure.structureType !== STRUCTURE_TERMINAL)) continue;
            if (room.controller.level === room.level && structure.structureType === STRUCTURE_EXTENSION) continue;
            if (!pos.checkForConstructionSites() && !pos.checkForAllStructure().length) {
                if (pos.createConstructionSite(structure.structureType) === OK) {
                    built = true;
                    count++;
                    if (count >= 3) break;
                }
            }
        }
    }
    // Handle special buildings
    if (!built && room.controller.level >= 7 && room.controller.level === room.level) {
        let factory = room.factory || _.find(room.constructionSites, (s) => s.structureType === STRUCTURE_FACTORY);
        let power = _.find(room.structures, (s) => s.structureType === STRUCTURE_POWER_SPAWN) || _.find(room.constructionSites, (s) => s.structureType === STRUCTURE_POWER_SPAWN);
        let nuker = _.find(room.structures, (s) => s.structureType === STRUCTURE_NUKER) || _.find(room.constructionSites, (s) => s.structureType === STRUCTURE_NUKER);
        if (!factory || !power || !nuker) {
            let filter = _.filter(layout, (s) => s.structureType === STRUCTURE_EXTENSION);
            let buildThis = STRUCTURE_FACTORY;
            if (room.controller.level === 8 && !power) buildThis = STRUCTURE_POWER_SPAWN; else if (room.controller.level === 8 && !nuker) buildThis = STRUCTURE_NUKER;
            for (let structure of shuffle(filter)) {
                let pos = new RoomPosition(structure.x, structure.y, room.name);
                if (!pos.checkForConstructionSites() && !pos.checkForAllStructure().length) {
                    if (pos.createConstructionSite(buildThis) === OK) {
                        built = true;
                        break;
                    }
                }
            }
        }
    }
}

function auxiliaryBuilding(room) {
    let hub = new RoomPosition(room.memory.bunkerHub.x, room.memory.bunkerHub.y, room.name);
    let layout = JSON.parse(storedLayouts[room.name]);
    // Hub
    hubBuilder(room, hub, layout);
    // Bunker Ramparts
    rampartBuilder(room, layout);
    // Controller
    controllerBuilder(room);
    // Mineral
    if (room.level >= 6) mineralBuilder(room);
    // Roads
    if (room.level >= 3 && _.size(room.constructionSites) < 2) {
        if (!roadBuilder(room, layout) && !_.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_ROAD).length) room.memory.roadsBuilt = true; else room.memory.roadsBuilt = undefined
    }
    // Cleanup
    let noRoad = _.filter(room.structures, (s) => OBSTACLE_OBJECT_TYPES.includes(s.structureType) && s.pos.checkForRoad());
    if (noRoad.length) noRoad.forEach((s) => s.pos.checkForRoad().destroy());
    let badStructure = _.filter(room.structures, (s) => (s.owner && s.owner.username !== MY_USERNAME && s.structureType !== STRUCTURE_STORAGE && s.structureType !== STRUCTURE_TERMINAL));
    if (room.controller.level >= 6) {
        badStructure = _.filter(room.structures, (s) => (s.owner && s.owner.username !== MY_USERNAME));
    } else if (room.controller.level >= 4) {
        badStructure = _.filter(room.structures, (s) => (s.owner && s.owner.username !== MY_USERNAME && s.structureType !== STRUCTURE_TERMINAL));
    }
    if (badStructure.length) badStructure.forEach((s) => s.destroy());
}

function hubBuilder(room, hub, layout) {
    if (room.controller.level >= 7) {
        if (!room.memory.hubLink && hub.checkForAllStructure()[0] && hub.checkForAllStructure()[0].structureType === STRUCTURE_LINK) return room.memory.hubLink = hub.checkForAllStructure()[0].id;
        if (room.memory.hubLinkLocation) {
            let pos = new RoomPosition(room.memory.hubLinkLocation.x, room.memory.hubLinkLocation.y, room.name);
            if (pos.checkForAllStructure()[0]) {
                if (pos.checkForAllStructure()[0].structureType === STRUCTURE_LINK) room.memory.hubLink = pos.checkForAllStructure()[0].id;
                if (pos.checkForAllStructure()[0].structureType === STRUCTURE_LINK && !pos.checkForAllStructure()[0].isActive()) room.memory.hubLink = undefined;
            } else if (!pos.checkForConstructionSites()) pos.createConstructionSite(STRUCTURE_LINK);
        } else {
            if (hub.checkForAllStructure()[0]) {
                if (hub.checkForAllStructure()[0].structureType === STRUCTURE_LINK) room.memory.hubLink = hub.checkForAllStructure()[0].id;
                if (hub.checkForAllStructure()[0].structureType === STRUCTURE_LINK && !hub.checkForAllStructure()[0].isActive()) room.memory.hubLink = undefined;
                if (hub.checkForAllStructure()[0].structureType === STRUCTURE_CONTAINER) hub.checkForAllStructure()[0].destroy();
                if (hub.checkForAllStructure()[0].structureType !== STRUCTURE_CONTAINER && hub.checkForAllStructure()[0].structureType !== STRUCTURE_LINK && hub.checkForAllStructure()[0].structureType !== STRUCTURE_ROAD) {
                    let filter = _.filter(layout, (s) => s.structureType === STRUCTURE_EXTENSION);
                    for (let structure of shuffle(filter)) {
                        let pos = new RoomPosition(structure.x, structure.y, room.name);
                        if (!pos.checkForConstructionSites() && !pos.checkForAllStructure().length) {
                            if (room.controller.level >= 7 && pos.createConstructionSite(STRUCTURE_LINK) === OK) {
                                room.memory.hubLinkLocation = {x: pos.x, y: pos.y};
                                break;
                            }
                        }
                    }
                }
            } else if (!hub.checkForConstructionSites()) {
                room.memory.hubLinkLocation = {x: hub.x, y: hub.y};
            }
        }
    } else if (!room.memory.storageContainer && room.controller.level < 4 && room.controller.level > 1) {
        let storagePos = _.filter(layout, (s) => s.structureType === STRUCTURE_STORAGE)[0];
        storagePos = new RoomPosition(storagePos.x, storagePos.y, room.name);
        if (storagePos.checkForAllStructure()[0]) {
            if (storagePos.checkForAllStructure()[0].structureType !== STRUCTURE_CONTAINER) storagePos.checkForAllStructure()[0].destroy();
            else if (storagePos.checkForAllStructure()[0].structureType === STRUCTURE_CONTAINER) room.memory.storageContainer = storagePos.checkForAllStructure()[0].id;
        } else storagePos.createConstructionSite(STRUCTURE_CONTAINER);
    } else if (room.controller.level >= 4 && room.memory.storageContainer) {
        Game.getObjectById(room.memory.storageContainer).destroy();
        room.memory.storageContainer = undefined;
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
    } else if (!room.memory.controllerLink && room.controller.level >= 5) {
        let controllerLink = _.find(room.controller.pos.findInRange(room.structures, 2), (s) => s.structureType === STRUCTURE_LINK);
        if (!controllerLink) {
            let zoneTerrain = room.lookForAtArea(LOOK_TERRAIN, controllerContainer.pos.y - 1, controllerContainer.pos.x - 1, controllerContainer.pos.y + 1, controllerContainer.pos.x + 1, true);
            for (let key in zoneTerrain) {
                if (_.find(controllerContainer.pos.findInRange(FIND_CONSTRUCTION_SITES, 1), (s) => s.structureType === STRUCTURE_LINK)) break;
                let position = new RoomPosition(zoneTerrain[key].x, zoneTerrain[key].y, room.name);
                if (position.checkForAllStructure().length || position.checkForImpassible()) continue;
                position.createConstructionSite(STRUCTURE_LINK);
                break;
            }
        }
    }
}

function mineralBuilder(room) {
    let extractor = _.find(room.structures, (s) => s.structureType === STRUCTURE_EXTRACTOR);
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

function labBuilder(room, labs, hub) {
    let built = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB).length - labs;
    let inBuild = _.find(room.constructionSites, (s) => s.structureType === STRUCTURE_LAB);
    if (!room.memory.labHub) {
        findLabHub(room);
    } else if (built < 3 && !inBuild) {
        let labHub = new RoomPosition(room.memory.labHub.x, room.memory.labHub.y, room.name);
        if (labHub.checkForAllStructure().length) {
            one:
                for (let xOff = -1; xOff <= 1; xOff++) {
                    for (let yOff = -1; yOff <= 1; yOff++) {
                        if (xOff !== 0 || yOff !== 0) {
                            let pos = new RoomPosition(labHub.x + xOff, labHub.y + yOff, room.name);
                            if (!pos.checkForImpassible() && !pos.checkForConstructionSites() && !pos.checkForAllStructure().length) {
                                pos.createConstructionSite(STRUCTURE_LAB);
                                break one;
                            }
                        }
                    }
                }
        } else if (!labHub.checkForConstructionSites()) {
            labHub.createConstructionSite(STRUCTURE_LAB);
        }
    } else {
        let labHub = new RoomPosition(room.memory.labHub.x, room.memory.labHub.y, room.name);
        buildRoadFromTo(room, labHub, hub);
    }
}

function roadBuilder(room, layout) {
    let spawn = _.sample(_.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN));
    // Source Roads
    for (let source of room.sources) {
        let harvester = _.find(room.creeps, (s) => s.my && s.memory.role === 'stationaryHarvester' && s.memory.containerID && s.memory.source === source.id);
        if (harvester) {
            let container = Game.getObjectById(harvester.memory.containerID);
            if (container && buildRoadFromTo(room, spawn, container)) {
                return true;
            }
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
    // Mineral Roads/Harvester
    if (room.controller.level >= 6) {
        let container = Game.getObjectById(room.memory.extractorContainer);
        let spawn = _.sample(_.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN));
        if (container && spawn && buildRoadFromTo(room, spawn, container)) return true;
    }
    if (room.controller.level >= 3) {
        let filter = _.filter(layout, (s) => s.structureType === STRUCTURE_ROAD);
        for (let structure of filter) {
            let pos = new RoomPosition(structure.x, structure.y, room.name);
            if (!pos.checkForRoad() && !pos.checkForConstructionSites() && !pos.checkForImpassible() && !pos.checkForWall()) {
                if (pos.createConstructionSite(STRUCTURE_ROAD) === OK) {
                    return true;
                }
            }
        }
    }
    return false;
}

let towerPos;
function rampartBuilder(room, layout = undefined, count = false) {
    // Protected Structures
    _.filter(room.structures, (s) => protectedStructureTypes.includes(s.structureType) && !s.pos.checkForRampart() && !s.pos.checkForConstructionSites() && ([STRUCTURE_SPAWN, STRUCTURE_TOWER].includes(s.structureType) || !s.pos.isInBunker())).forEach((s) => s.pos.createConstructionSite(STRUCTURE_RAMPART));
    // Handle rampart bunker placement
    if (!rampartSpots[room.name] || Math.random() > 0.98) {
        // Delete old memory
        room.memory.rampartSpots = undefined;
        rampartSpots[room.name] = undefined;
        let rect_array = [];
        // structures
        for (let structure of layout) {
            rect_array.push({
                x1: structure.x - 2,
                y1: structure.y - 2,
                x2: structure.x + 2,
                y2: structure.y + 2
            });
        }
        // Controller
        rect_array.push({
            x1: room.controller.pos.x - 1,
            y1: room.controller.pos.y - 1,
            x2: room.controller.pos.x + 1,
            y2: room.controller.pos.y + 1
        });
        // Sources
        for (let source of room.sources) {
            rect_array.push({
                x1: source.pos.x - 2,
                y1: source.pos.y - 2,
                x2: source.pos.x + 2,
                y2: source.pos.y + 2
            });
        }
        /**
         // Seasonal
         if (room.decoder) {
            rect_array.push({
                x1: room.decoder.pos.x - 1,
                y1: room.decoder.pos.y - 1,
                x2: room.decoder.pos.x + 1,
                y2: room.decoder.pos.y + 1
            });
        }**/
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
            // Towers
            // Check if already at count
            if (CONTROLLER_STRUCTURES[STRUCTURE_TOWER][room.controller.level] > (_.filter(room.structures, (s) => s.structureType === STRUCTURE_TOWER).length + _.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_TOWER).length)) {
                if (towerPos) {
                    towerPos.createConstructionSite(STRUCTURE_TOWER);
                    towerPos = undefined;
                    return;
                } else if ((buildPositions.length < 10 && _.size(Game.map.describeExits(room.name)) < 2) && _.find(room.structures, (s) => s.structureType === STRUCTURE_WALL)) {
                    let hub = new RoomPosition(room.memory.bunkerHub.x, room.memory.bunkerHub.y, room.name);
                    let wallReplacement = hub.findClosestByPath(_.filter(room.structures, (s) => s.structureType === STRUCTURE_WALL));
                    if (wallReplacement) {
                        towerPos = wallReplacement.pos;
                        wallReplacement.destroy();
                    }
                } else {
                    if (JSON.parse(storedLayouts[room.name])) {
                        for (let structure of _.filter(JSON.parse(storedLayouts[room.name]), (s) => s.structureType === STRUCTURE_TOWER)) {
                            let pos = new RoomPosition(structure.x, structure.y, room.name);
                            if (!pos.checkForConstructionSites() && !pos.checkForAllStructure().length) {
                                if (pos.createConstructionSite(structure.structureType) === OK) {
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            let cycles = 0;
            let inBuild = _.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL).length;
            for (let pos of buildPositions) {
                if (cycles + inBuild >= 4) break;
                if ((pos.isNearTo(room.controller) || pos.isNearTo(room.mineral) || pos.isNearTo(pos.findClosestByRange(FIND_SOURCES)))
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
                } else if (pos.checkForAllStructure()[0] && !pos.checkForBuiltWall() && pos.createConstructionSite(STRUCTURE_RAMPART) === OK) {
                    return;
                } else if (((isEven(pos.x) && isOdd(pos.y)) || (isOdd(pos.x) && isEven(pos.y))) && !pos.checkForBuiltWall() && !pos.checkForConstructionSites()) {
                    if (pos.checkForRampart() && !pos.checkForAllStructure()[0]) pos.checkForRampart().destroy();
                    if (pos.checkForRoad()) pos.checkForRoad().destroy();
                    if (pos.createConstructionSite(STRUCTURE_WALL) === OK) return cycles++
                } else if (!pos.checkForRampart() && !pos.checkForBuiltWall() && !pos.checkForConstructionSites() && pos.createConstructionSite(STRUCTURE_RAMPART) === OK) {
                    return cycles++
                } else if (pos.checkForBuiltWall() && pos.checkForRampart()) {
                    pos.checkForRampart().destroy();
                    return;
                } else if (pos.checkForBuiltWall() && pos.checkForRoad()) {
                    pos.checkForRoad().destroy();
                    return;
                }
            }
        }
        // Clean old barriers
        /**
         _.filter(room.structures, (s) => (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) && !buildPositions.some(pos => pos.x === s.pos.x && pos.y === s.pos.y) &&
         (s.structureType === STRUCTURE_WALL || !s.pos.checkForAllStructure().length)).forEach((s) => s.destroy())
         **/
    }
}

module.exports.hubCheck = function (room) {
    return findHub(room, true)
};

let storedX, storedY, storedPossibles;
function findHub(room, hubCheck = undefined) {
    if (room.memory.bunkerHub && room.memory.bunkerHub.x) return buildFromLayout(room);
    if (room.structures.length) _.filter(room.structures, (s) => !s.owner || s.owner.username !== MY_USERNAME).forEach((s) => s.destroy());
    let pos, xOffset, yOffset, layoutVersion, layout;
    let possiblePos = storedPossibles || {};
    let posCount = 0;
    // If we already have a spawn in room, go off of that
    let spawn = _.find(room.structures, (s) => s.my && s.structureType === STRUCTURE_SPAWN);
    if (spawn) {
        layouts:
            for (let buildTemplate of shuffle(layouts.layoutArray)) {
                layout = [];
                layoutVersion = buildTemplate[0]['layout'];
                let spawnPos = _.filter(buildTemplate, (s) => s.type === STRUCTURE_SPAWN);
                if (!spawnPos[0]) continue; else spawnPos = spawnPos[0].pos[0];
                let yVar, xVar;
                if (layoutVersion === 1) {
                    yVar = 16;
                    xVar = 15;
                } else {
                    yVar = 25;
                    xVar = 25;
                }
                xOffset = difference(spawnPos.x, xVar);
                if (spawnPos.x > xVar) xOffset *= -1;
                yOffset = difference(spawnPos.y, yVar);
                if (spawnPos.y > yVar) yOffset *= -1;
                pos = new RoomPosition(spawn.pos.x + xOffset, spawn.pos.y + yOffset, room.name);
                xOffset = difference(pos.x, xVar);
                if (pos.x < xVar) xOffset *= -1;
                yOffset = difference(pos.y, yVar);
                if (pos.y < yVar) yOffset *= -1;
                for (let type of buildTemplate) {
                    for (let s of type.pos) {
                        let structure = {};
                        structure.structureType = type.type;
                        structure.x = s.x + xOffset;
                        structure.y = s.y + yOffset;
                        if (structure.x > 48 || structure.x < 2 || structure.y > 48 || structure.y < 2) continue layouts;
                        let structurePos = new RoomPosition(structure.x, structure.y, room.name);
                        if (type.type !== STRUCTURE_RAMPART && (structurePos.checkIfOutOfBounds() || pos.isNearTo(room.controller) || pos.isNearTo(pos.findClosestByRange(FIND_SOURCES)) || structurePos.checkForWall())) {
                            layout = [];
                            continue layouts;
                        }
                        layout.push(structure);
                    }
                }
                let barrierCount = rampartBuilder(room, layout, true);
                if (barrierCount) {
                    possiblePos[posCount++] = {
                        x: pos.x,
                        y: pos.y,
                        version: layoutVersion,
                        layout: layout,
                        barrierCount: barrierCount
                    };
                }
            }
        if (_.size(possiblePos) && _.min(possiblePos, 'barrierCount').x && _.min(possiblePos, 'barrierCount').y) {
            log.a('Bunker Hub search complete for ' + room.name + '...');
            log.a('Final possible count: ' + _.size(possiblePos));
            let best = _.min(possiblePos, 'barrierCount');
            room.memory.bunkerHub = {};
            room.memory.bunkerHub.x = best.x;
            room.memory.bunkerHub.y = best.y;
            room.memory.hubSearch = undefined;
            storedLayouts[room.name] = JSON.stringify(best.layout);
            room.memory.bunkerHub.layoutVersion = LAYOUT_VERSION;
            room.memory.bunkerHub.bunkerVersion = best.version;
            return true;
        } else {
            return false;
        }
    } else {
        // Start search at 10,10 and work our way out
        let x = storedX || 9;
        let y = storedY || 10;
        let complete;
        // Loop runs until all possible positions have been checked
        primary:
            for (let i = 1; i < 10;) {
                // Mechanic to cycle through all possible positions
                x++;
                if (x > 40 && y >= 40) {
                    complete = true;
                    break;
                } else if (x > 40) {
                    x = 10;
                    y++;
                }
                storedX = x;
                storedY = y;
                pos = new RoomPosition(x, y, room.name);
                if (pos.checkForImpassible()) continue;
                // Cycle through all possible layouts
                for (let buildTemplate of shuffle(layouts.layoutArray)) {
                    let layoutVersion = buildTemplate[0]['layout'];
                    let yVar, xVar;
                    if (layoutVersion === 1) {
                        yVar = 16;
                        xVar = 15;
                    } else {
                        yVar = 25;
                        xVar = 25;
                    }
                    xOffset = difference(pos.x, xVar);
                    if (pos.x < xVar) xOffset *= -1;
                    yOffset = difference(pos.y, yVar);
                    if (pos.y < yVar) yOffset *= -1;
                    let controller = room.controller;
                    let closestSource = pos.findClosestByRange(FIND_SOURCES);
                    layout = [];
                    for (let type of buildTemplate) {
                        for (let s of type.pos) {
                            let structure = {};
                            structure.structureType = type.type;
                            structure.x = s.x + xOffset;
                            structure.y = s.y + yOffset;
                            if (structure.x > 49 || structure.x < 1 || structure.y > 49 || structure.y < 1) continue primary;
                            let structurePos = new RoomPosition(structure.x, structure.y, room.name);
                            if (type.type !== STRUCTURE_RAMPART && (structurePos.checkIfOutOfBounds() || pos.isNearTo(controller) || pos.isNearTo(closestSource) || structurePos.checkForWall())) {
                                continue primary;
                            }
                            layout.push(structure);
                        }
                        let barrierCount = rampartBuilder(room, layout, true);
                        if (barrierCount) {
                            possiblePos[posCount++] = {
                                x: pos.x,
                                y: pos.y,
                                version: layoutVersion,
                                layout: JSON.stringify(layout),
                                barrierCount: barrierCount
                            };
                        }
                    }
                    storedPossibles = possiblePos;
                    i++;
                }
            }
        if (complete && _.size(storedPossibles) && _.min(storedPossibles, 'barrierCount').x && _.min(storedPossibles, 'barrierCount').y) {
            log.a('Bunker Hub search complete for ' + room.name + '...');
            log.a('Final possible count: ' + _.size(storedPossibles));
            let best = _.min(storedPossibles, 'barrierCount');
            room.memory.bunkerHub = {};
            room.memory.bunkerHub.x = best.x;
            room.memory.bunkerHub.y = best.y;
            room.memory.hubSearch = undefined;
            storedLayouts[room.name] = best.layout;
            room.memory.bunkerHub.layoutVersion = LAYOUT_VERSION;
            room.memory.bunkerHub.bunkerVersion = best.version;
            buildFromLayout(room);
            return true;
        } else if (!complete) {
            log.a('Bunker Hub search incomplete for ' + room.name + ', continuing next tick.');
            log.a('Current position: ' + storedX + ',' + storedY);
            log.a('Current possible count: ' + _.size(storedPossibles));
        } else if (complete && !_.size(storedPossibles)) {
            abandonRoom(room.name);
            if (Memory.roomCache && Memory.roomCache[room.name]) Memory.roomCache[room.name].noClaim = true;
            return log.a(room.name + ' has been abandoned due to being unable to find a suitable layout.');
        }
    }
    return false;
}

function findLabHub(room) {
    if (room.memory.labHub) return;
    let pos;
    for (let i = 1; i < 2000; i++) {
        pos = new RoomPosition(getRandomInt(9, 40), getRandomInt(9, 40), room.name);
        if (pos.countOpenTerrainAround() >= 4) {
            room.memory.labHub = {x: pos.x, y: pos.y};
        }
    }
}

function praiseRoom(room) {
    // Abandon praise room at rcl8
    if (room.controller.level === 8 || !BUILD_PRAISE_ROOMS) return abandonRoom(room.name);
    // Build spawn, if the spawn exists make sure it has a rampart
    let spawn = _.find(room.structures, (s) => s.structureType === STRUCTURE_SPAWN) || _.find(room.constructionSites, (s) => s.structureType === STRUCTURE_SPAWN);
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
        let towers = _.filter(room.structures, (s) => s.structureType === STRUCTURE_TOWER);
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

function updateLayout(room) {
    let buildTemplate;
    let layoutVersion = room.memory.bunkerHub.bunkerVersion;
    for (let i = 0; i < layouts.allLayouts.length; i++) {
        if (layouts.allLayouts[i][0]['layout'] === layoutVersion) {
            buildTemplate = layouts.allLayouts[i];
            break;
        }
    }
    let pos = new RoomPosition(room.memory.bunkerHub.x, room.memory.bunkerHub.y, room.name);
    let yVar, xVar, xOffset, yOffset;
    if (layoutVersion === 1) {
        yVar = 16;
        xVar = 15;
    } else {
        yVar = 25;
        xVar = 25;
    }
    xOffset = difference(pos.x, xVar);
    if (pos.x < xVar) xOffset *= -1;
    yOffset = difference(pos.y, yVar);
    if (pos.y < yVar) yOffset *= -1;
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
    room.memory.bunkerHub.layoutVersion = LAYOUT_VERSION;
    storedLayouts[room.name] = JSON.stringify(layout);
}

function abandonRoom(room) {
    let overlordFor = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === room);
    if (overlordFor.length) {
        for (let key in overlordFor) {
            overlordFor[key].suicide();
        }
    }
    for (let key in Game.rooms[room].structures) {
        Game.rooms[room].structures[key].destroy();
    }
    for (let key in Game.rooms[room].constructionSites) {
        Game.rooms[room].constructionSites[key].remove();
    }
    let noClaim = Memory.noClaim || [];
    noClaim.push(room);
    delete Game.rooms[room].memory;
    if (Memory.roomCache[room.name]) Memory.roomCache[room.name].noClaim = Game.time;
    Game.rooms[room].controller.unclaim();
}

function difference(num1, num2) {
    return (num1 > num2) ? num1 - num2 : num2 - num1
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
                    } else if (structures.structureType === STRUCTURE_ROAD) {
                        costMatrix.set(structures.pos.x, structures.pos.y, 1);
                    } else if (structures.structureType === STRUCTURE_CONTAINER) {
                        costMatrix.set(structures.pos.x, structures.pos.y, 200);
                    }
                }
            },
        });
        if (path.length) cacheRoad(room, begin, target, path); else return;
        for (let point of path) {
            let pos = new RoomPosition(point.x, point.y, room.name);
            if (buildRoad(pos, room)) return true;
        }
    } else {
        for (let point of JSON.parse(path)) {
            let pos = new RoomPosition(point.x, point.y, room.name);
            if (buildRoad(pos, room)) return true;
        }
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

function buildRampartAround(room, position) {
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (xOff !== 0 || yOff !== 0) {
                let pos = new RoomPosition(position.x + xOff, position.y + yOff, room.name);
                if (!pos.checkForWall() && !pos.checkForConstructionSites() && !pos.checkForRampart()) {
                    pos.createConstructionSite(STRUCTURE_RAMPART);
                    return true;
                }
            }
        }
    }
    return false;
}

function buildRoad(position, room) {
    if (position.checkForImpassible(true)) {
        return false;
    } else if (position.checkForRoad()) {
        return false;
    } else if (room.controller.level < 5 && position.checkForSwamp()) {
        if (position.createConstructionSite(STRUCTURE_ROAD) === OK) {
            return true;
        }
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
    ROAD_CACHE[room.name] = cache;
}

function getRoad(room, from, to) {
    if (room.memory._roadCache) room.memory._roadCache = undefined;
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

let protectedStructureTypes = [
    STRUCTURE_SPAWN,
    STRUCTURE_STORAGE,
    STRUCTURE_TOWER,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_TERMINAL,
    STRUCTURE_NUKER,
    STRUCTURE_OBSERVER,
    STRUCTURE_EXTENSION
];