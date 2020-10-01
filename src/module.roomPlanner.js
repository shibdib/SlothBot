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

let lastRun = 0;
module.exports.buildRoom = function (room) {
    let cooldown = 150;
    if (room.level !== room.controller.level) cooldown = 5;
    if (lastRun + cooldown > Game.time) return;
    if (room.memory.bunkerHub) {
        // Clear hub search memory entries
        room.memory.typeSearch = undefined;
        room.memory.newHubSearch = undefined;
        room.memory.layout = undefined;
        if (!room.memory.bunkerHub.layoutVersion) {
            room.memory.bunkerHub.layoutVersion = room.memory.layoutVersion;
            room.memory.layoutVersion = undefined;
        }
        if (room.memory.bunkerHub.layoutVersion === LAYOUT_VERSION && storedLayouts[room.name]) {
            if (Memory.myRooms.length === 1 || room.controller.level >= 4) {
                buildFromLayout(room);
            } else {
                newClaimBuild(room);
            }
        } else {
            if (!room.memory.bunkerHub.bunkerVersion) {
                room.memory.bunkerHub.bunkerVersion = 1;
                room.memory.bunkerVersion = undefined;
            }
            updateLayout(room);
        }
    } else if (!room.memory.praiseRoom) {
        findHub(room);
    } else if (room.memory.praiseRoom) {
        praiseRoom(room);
    }
    lastRun = Game.time;
};

module.exports.hubCheck = function (room) {
    return findHub(room, true)
};

function buildFromLayout(room) {
    if (!room.memory.bunkerHub.bunkerVersion) {
        room.memory.bunkerHub.bunkerVersion = 1;
        room.memory.bunkerVersion = undefined;
    }
    let hub = new RoomPosition(room.memory.bunkerHub.x, room.memory.bunkerHub.y, room.name);
    if (Memory.myRooms.length === 1 && !_.filter(Game.structures, (s) => s.structureType === STRUCTURE_SPAWN)[0]) {
        return hub.createConstructionSite(STRUCTURE_SPAWN);
    }
    let level = room.controller.level;
    let layout = JSON.parse(storedLayouts[room.name]);
    let extensionLevel = getLevel(room);
    let filter = _.filter(layout, (s) => s.structureType !== STRUCTURE_OBSERVER && s.structureType !== STRUCTURE_POWER_SPAWN && s.structureType !== STRUCTURE_NUKER && s.structureType !== STRUCTURE_TERMINAL && s.structureType !== STRUCTURE_TOWER && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_LINK && s.structureType !== STRUCTURE_LAB);
    // Handle a rebuild
    let builtSpawn = _.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN)[0];
    if (!builtSpawn && room.controller.safeMode >= 5000) {
        filter = _.filter(layout, (s) => s.structureType === STRUCTURE_SPAWN);
    } else {
        // Build preset layout
        if (level === 8) {
            filter = _.filter(layout, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART);
        } else if (level === 7) {
            filter = _.filter(layout, (s) => s.structureType !== STRUCTURE_OBSERVER && s.structureType !== STRUCTURE_POWER_SPAWN && s.structureType !== STRUCTURE_NUKER && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART);
        } else if (level === 6) {
            filter = _.filter(layout, (s) => s.structureType !== STRUCTURE_OBSERVER && s.structureType !== STRUCTURE_POWER_SPAWN && s.structureType !== STRUCTURE_NUKER && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART);
        } else if (level < 6 && level >= 3) {
            filter = _.filter(layout, (s) => s.structureType !== STRUCTURE_OBSERVER && s.structureType !== STRUCTURE_POWER_SPAWN && s.structureType !== STRUCTURE_NUKER && s.structureType !== STRUCTURE_TERMINAL && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_LAB);
        }
    }
    let built;
    for (let structure of filter) {
        let pos = new RoomPosition(structure.x, structure.y, room.name);
        if (level !== extensionLevel && (structure.structureType !== STRUCTURE_EXTENSION && structure.structureType !== STRUCTURE_SPAWN && structure.structureType !== STRUCTURE_TOWER && structure.structureType !== STRUCTURE_TERMINAL)) continue;
        if (level === extensionLevel && structure.structureType === STRUCTURE_EXTENSION) continue;
        if (_.filter(room.constructionSites, (s) => s.structureType === structure.structureType && s.progress < s.progressTotal * 0.99).length) continue;
        if (!pos.checkForConstructionSites() && !pos.checkForAllStructure().length) {
            if (pos.createConstructionSite(structure.structureType) === OK) {
                built = true;
                break;
            }
        }
    }
    // Handle special buildings
    if (!built && level >= 7 && level === extensionLevel) {
        let factory = _.filter(room.structures, (s) => s.structureType === STRUCTURE_FACTORY)[0] || _.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_FACTORY)[0];
        let power = _.filter(room.structures, (s) => s.structureType === STRUCTURE_POWER_SPAWN)[0] || _.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_POWER_SPAWN)[0];
        let nuker = _.filter(room.structures, (s) => s.structureType === STRUCTURE_NUKER)[0] || _.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_NUKER)[0];
        if (!factory || !power || !nuker) {
            let filter = _.filter(layout, (s) => s.structureType === STRUCTURE_EXTENSION);
            let buildThis = STRUCTURE_FACTORY;
            if (level === 8 && !power) buildThis = STRUCTURE_POWER_SPAWN; else if (level === 8 && !nuker) buildThis = STRUCTURE_NUKER;
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
    // Labs if not in plan
    let labs = _.filter(layout, (s) => s.structureType === STRUCTURE_LAB).length;
    if (labs < 3 && level >= 6) {
        let built = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB).length - labs;
        let inBuild = _.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_LAB)[0];
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
    // Hub
    if (level >= 5 || room.memory.hubLink) {
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
                            if (level >= 7 && pos.createConstructionSite(STRUCTURE_LINK) === OK) {
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
    }
    if (!room.memory.hubLink && hub.checkForAllStructure()[0] && hub.checkForAllStructure()[0].structureType === STRUCTURE_LINK) room.memory.hubLink = hub.checkForAllStructure()[0].id;
    // Bunker Ramparts
    if (level >= 3 && !_.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL).length) {
        if (!rampartSpots[room.name] || Math.random() > 0.98) {
            // Clean old ramparts from new claims
            if (!rampartSpots[room.name]) {
                let cleaner = _.filter(room.structures, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_EXTENSION && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_LINK && s.pos.getRangeTo(s.pos.findClosestByRange(FIND_SOURCES)) > 3 && s.pos.checkForRampart());
                cleaner.forEach((s) => s.pos.checkForRampart().destroy())
            }
            // Delete old memory
            room.memory.rampartSpots = undefined;
            rampartSpots[room.name] = undefined;
            let rect_array = [];
            // structures
            for (let structure of layout) {
                rect_array.push({
                    x1: structure.x - 1,
                    y1: structure.y - 1,
                    x2: structure.x + 1,
                    y2: structure.y + 1
                });
            }
            // Sources
            for (let source of room.sources) {
                rect_array.push({
                    x1: source.pos.x - 1,
                    y1: source.pos.y - 1,
                    x2: source.pos.x + 1,
                    y2: source.pos.y + 1
                });
            }
            // Controller
            rect_array.push({
                x1: room.controller.pos.x - 1,
                y1: room.controller.pos.y - 1,
                x2: room.controller.pos.x + 1,
                y2: room.controller.pos.y + 1
            });
            let bounds = {x1: 0, y1: 0, x2: 49, y2: 49};
            try {
                rampartSpots[room.name] = JSON.stringify(minCut.GetCutTiles(room.name, rect_array, bounds));
            } catch (e) {
                log.e('MinCut Error in room ' + room.name);
                log.e(e);
            }
        } else if (rampartSpots[room.name]) {
            let buildPositions = JSON.parse(rampartSpots[room.name]);
            for (let rampartPos of buildPositions) {
                let pos = new RoomPosition(rampartPos.x, rampartPos.y, room.name);
                if (level >= 2) {
                    // Handle tunnels
                    if (pos.checkForWall()) {
                        for (let xOff = -1; xOff <= 1; xOff++) {
                            for (let yOff = -1; yOff <= 1; yOff++) {
                                if (xOff !== 0 || yOff !== 0) {
                                    let newPos = new RoomPosition(pos.x + xOff, pos.y + yOff, pos.roomName);
                                    if (!newPos.checkForWall() && !newPos.checkForBarrierStructure() && !newPos.checkForConstructionSites() && newPos.createConstructionSite(STRUCTURE_RAMPART) === OK) break;
                                }
                            }
                        }
                    } else if (!pos.isNearTo(room.controller) && !pos.isNearTo(room.mineral) && !pos.isNearTo(pos.findClosestByRange(FIND_SOURCES)) && ((isEven(pos.x) && isOdd(pos.y)) || (isOdd(pos.x) && isEven(pos.y))) && !pos.checkForBuiltWall() && !pos.checkForConstructionSites() && pos.isNearTo(pos.findClosestByRange(_.filter(room.structures, (s) => s.structureType === STRUCTURE_RAMPART)))) {
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
                } else if (pos.isNearTo(room.controller)) {
                    if (!pos.checkForBarrierStructure() && !pos.checkForConstructionSites() && pos.createConstructionSite(STRUCTURE_RAMPART) === OK) break;
                }
                /**else if (!pos.checkForObstacleStructure() && !pos.checkForRoad() &&
                 !_.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_ROAD && s.progress < s.progressTotal * 0.95).length) pos.createConstructionSite(STRUCTURE_ROAD);**/
            }
        }
    }
    // Controller
    let controllerContainer = Game.getObjectById(room.memory.controllerContainer);
    if (!controllerContainer && level >= 3) {
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
    } else if (level >= 7) {
        let controllerLink = _.filter(room.controller.pos.findInRange(room.structures, 2), (s) => s.structureType === STRUCTURE_LINK)[0];
        if (!controllerLink) {
            let zoneTerrain = room.lookForAtArea(LOOK_TERRAIN, controllerContainer.pos.y - 1, controllerContainer.pos.x - 1, controllerContainer.pos.y + 1, controllerContainer.pos.x + 1, true);
            for (let key in zoneTerrain) {
                if (_.filter(controllerContainer.pos.findInRange(FIND_CONSTRUCTION_SITES, 1), (s) => s.structureType === STRUCTURE_LINK)[0]) break;
                let position = new RoomPosition(zoneTerrain[key].x, zoneTerrain[key].y, room.name);
                if (position.checkForAllStructure().length || position.checkForImpassible()) continue;
                position.createConstructionSite(STRUCTURE_LINK);
                break;
            }
        } else {
            if (!controllerLink.pos.checkForRampart()) controllerLink.pos.createConstructionSite(STRUCTURE_RAMPART);
            room.memory.controllerLink = controllerLink.id;
        }
    }
    // Mineral
    if (level >= 6) {
        let extractor = _.filter(room.structures, (s) => s.structureType === STRUCTURE_EXTRACTOR)[0];
        if (extractor) {
            let extractorContainer = _.filter(extractor.pos.findInRange(room.structures, 1), (s) => s.structureType === STRUCTURE_CONTAINER)[0];
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
        } else {
            let mineral = room.mineral;
            if (!mineral.pos.checkForAllStructure().length && !mineral.pos.checkForConstructionSites()) mineral.pos.createConstructionSite(STRUCTURE_EXTRACTOR);
        }
    }
    // Roads
    let inBuild = false;
    if (_.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_ROAD && s.progress < s.progressTotal * 0.95).length) {
        inBuild = true;
    }
    if (!inBuild && level >= 3 && _.size(room.constructionSites) < 5 && level === extensionLevel) {
        if (level >= 4) {
            let filter = _.filter(layout, (s) => s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_RAMPART);
            for (let structure of filter) {
                let pos = new RoomPosition(structure.x, structure.y, room.name);
                if (!pos.checkForRoad() && !pos.checkForConstructionSites() && !pos.checkForImpassible() && !pos.checkForWall()) {
                    if (pos.createConstructionSite(STRUCTURE_ROAD) === OK) {
                        inBuild = true;
                        break;
                    }
                }
            }
        }
        if (!inBuild && !room.constructionSites.length) {
            let spawn = shuffle(_.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN))[0];
            // Source Roads
            for (let source of room.sources) {
                let harvester = _.filter(room.creeps, (s) => s.my && s.memory.role === 'stationaryHarvester' && s.memory.containerID && s.memory.source === source.id)[0];
                if (harvester) {
                    let container = Game.getObjectById(harvester.memory.containerID);
                    if (container && buildRoadFromTo(room, spawn, container)) {
                        inBuild = true;
                        break;
                    }
                }
            }
            // Controller Road
            let container = Game.getObjectById(room.memory.controllerContainer);
            if (!inBuild && container) {
                buildRoadFromTo(room, spawn, container);
            }
            // Neighboring Roads
            let neighboring = Game.map.describeExits(spawn.pos.roomName);
            if (!inBuild && neighboring) {
                if (neighboring['1']) {
                    let exits = spawn.room.find(FIND_EXIT_TOP);
                    let middle = _.round(exits.length / 2);
                    if (buildRoadFromTo(spawn.room, spawn, exits[middle])) {
                        inBuild = true;
                    }
                }
                if (!inBuild && neighboring['3']) {
                    let exits = spawn.room.find(FIND_EXIT_RIGHT);
                    let middle = _.round(exits.length / 2);
                    if (buildRoadFromTo(spawn.room, spawn, exits[middle])) {
                        inBuild = true;
                    }
                }
                if (!inBuild && neighboring['5']) {
                    let exits = spawn.room.find(FIND_EXIT_BOTTOM);
                    let middle = _.round(exits.length / 2);
                    if (buildRoadFromTo(spawn.room, spawn, exits[middle])) {
                        inBuild = true;
                    }
                }
                if (!inBuild && neighboring['7']) {
                    let exits = spawn.room.find(FIND_EXIT_LEFT);
                    let middle = _.round(exits.length / 2);
                    if (buildRoadFromTo(spawn.room, spawn, exits[middle])) {
                        inBuild = true;
                    }
                }
            }
            // Mineral Roads/Harvester
            if (!inBuild && level >= 6) {
                let container = Game.getObjectById(room.memory.extractorContainer);
                let spawn = shuffle(_.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN))[0];
                buildRoadFromTo(room, spawn, container);
            }
        }
    }
    // Cleanup
    let noRoad = _.filter(room.structures, (s) => OBSTACLE_OBJECT_TYPES.includes(s.structureType) && s.pos.checkForRoad());
    if (noRoad.length) noRoad.forEach((s) => s.pos.checkForRoad().destroy());
    let badStructure = _.filter(room.structures, (s) => (s.owner && s.owner.username !== MY_USERNAME && s.structureType !== STRUCTURE_STORAGE && s.structureType !== STRUCTURE_TERMINAL));
    if (level >= 6) {
        badStructure = _.filter(room.structures, (s) => (s.owner && s.owner.username !== MY_USERNAME));
    } else if (level >= 4) {
        badStructure = _.filter(room.structures, (s) => (s.owner && s.owner.username !== MY_USERNAME && s.structureType !== STRUCTURE_TERMINAL));
    }
    if (badStructure.length) badStructure.forEach((s) => s.destroy());
}

function newClaimBuild(room) {
    let level = room.controller.level;
    let badStructure = _.filter(room.structures, (s) => (s.owner && s.owner.username !== MY_USERNAME));
    if (badStructure.length) badStructure.forEach((s) => s.destroy());
    if (level < 2) return;
    // Cleanup
    let noRoad = _.filter(room.structures, (s) => OBSTACLE_OBJECT_TYPES.includes(s.structureType) && s.pos.checkForRoad());
    if (noRoad.length) noRoad.forEach((s) => s.pos.checkForRoad().destroy());
    // Rampart the controller to counter unclaimers
    buildRampartAround(room, room.controller.pos);
    let layout = JSON.parse(storedLayouts[room.name]);
    let towers = _.filter(room.structures, (s) => s.structureType === STRUCTURE_TOWER);
    let spawns = _.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN);
    if (level >= 3 && !towers.length) {
        let tower = _.filter(layout, (s) => s.structureType === STRUCTURE_TOWER)[0];
        let pos = new RoomPosition(tower.x, tower.y, room.name);
        // Tower Rampart
        if (!pos.checkForConstructionSites() && !pos.checkForRampart()) return pos.createConstructionSite(STRUCTURE_RAMPART);
        // Tower
        if (!pos.checkForConstructionSites() && !pos.checkForObstacleStructure() && pos.checkForRampart()) return pos.createConstructionSite(STRUCTURE_TOWER);
    } else if (!spawns.length) {
        let spawn = _.filter(layout, (s) => s.structureType === STRUCTURE_SPAWN)[0];
        let pos = new RoomPosition(spawn.x, spawn.y, room.name);
        // Spawn Rampart
        if (!pos.checkForConstructionSites() && !pos.checkForRampart()) return pos.createConstructionSite(STRUCTURE_RAMPART);
        // Spawn
        if (!pos.checkForConstructionSites() && !pos.checkForObstacleStructure() && pos.checkForRampart()) return pos.createConstructionSite(STRUCTURE_SPAWN);
    } else {
        // Clear any guard ops
        Memory.targetRooms[room.name] = undefined;
        return buildFromLayout(room);
    }
}

function findHub(room, hubCheck = undefined) {
    if (room.memory.bunkerHub) return;
    let pos;
    if (!room.memory.typeSearch) room.memory.typeSearch = 1;
    let spawn = _.filter(room.structures, (s) => s.my && s.structureType === STRUCTURE_SPAWN)[0];
    if (room.structures.length) _.filter(room.structures, (s) => s.structureType !== STRUCTURE_SPAWN).forEach((s) => s.destroy());
    primary:
        for (let i = 1; i < 2000; i++) {
            let searched = [];
            let hubSearch = room.memory.newHubSearch || 0;
            if (hubSearch >= layouts.layoutArray.length * 2500 && !room.memory.bunkerHub) {
                if (hubCheck) return false;
                abandonRoom(room.name);
                if (Memory.roomCache && Memory.roomCache[room.name]) Memory.roomCache[room.name].noClaim = true;
                log.a(room.name + ' has been abandoned due to being unable to find a suitable hub location.');
                return false;
            }
            for (let buildTemplate of layouts.layoutArray) {
                let layoutVersion = buildTemplate[0]['layout'];
                let xOffset, yOffset;
                if (spawn) {
                    let spawnPos;
                    for (let type of buildTemplate) {
                        if (type.type !== STRUCTURE_SPAWN) continue;
                        spawnPos = type.pos[0];
                    }
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
                } else {
                    pos = new RoomPosition(getRandomInt(9, 40), getRandomInt(9, 40), room.name);
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
                }
                let clean = pos.x + '.' + pos.y;
                if (!_.includes(searched, clean)) {
                    searched.push(clean);
                    room.memory.newHubSearch = hubSearch + 1;
                    let controller = room.controller;
                    let closestSource = pos.findClosestByRange(FIND_SOURCES);
                    let layout = [];
                    for (let type of buildTemplate) {
                        for (let s of type.pos) {
                            let structure = {};
                            structure.structureType = type.type;
                            structure.x = s.x + xOffset;
                            structure.y = s.y + yOffset;
                            if (structure.x > 49 || structure.x < 1 || structure.y > 49 || structure.y < 1) continue primary;
                            let structurePos = new RoomPosition(structure.x, structure.y, room.name);
                            if (type.type !== STRUCTURE_RAMPART && (structurePos.checkIfOutOfBounds() || pos.getRangeTo(controller) < 2 || pos.getRangeTo(closestSource) < 2 || structurePos.checkForWall())) {
                                continue primary;
                            }
                            layout.push(structure);
                        }
                    }
                    if (hubCheck) return true;
                    room.memory.bunkerHub = {};
                    room.memory.bunkerHub.x = pos.x;
                    room.memory.bunkerHub.y = pos.y;
                    room.memory.hubSearch = undefined;
                    storedLayouts[room.name] = JSON.stringify(layout);
                    room.memory.bunkerHub.layoutVersion = LAYOUT_VERSION;
                    room.memory.bunkerHub.bunkerVersion = layoutVersion;
                    return true;
                }
            }
        }
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
    let spawn = _.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN)[0] || _.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_SPAWN)[0];
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
            overlordFor[key].memory.recycle = true;
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
};

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
                        if (tile === 0) costMatrix.set(x, y, 25);
                        if (tile === 1) costMatrix.set(x, y, 225);
                        if (tile === 2) costMatrix.set(x, y, 35);
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
                        costMatrix.set(structures.pos.x, structures.pos.y, 71);
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
    if (room.constructionSites.length >= 10 || position.checkForImpassible(true) || _.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_ROAD).length > 2) {
        return false;
    } else if (position.checkForRoad()) {
        room.memory.roadsBuilt = true;
        return false;
    } else if (room.controller.level < 5 && position.checkForSwamp()) {
        if (position.createConstructionSite(STRUCTURE_ROAD) === OK) {
            room.memory.roadsBuilt = undefined;
            return true;
        }
    } else {
        if (position.createConstructionSite(STRUCTURE_ROAD) === OK) {
            room.memory.roadsBuilt = undefined;
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
        return;
    }
}

function getPathKey(from, to) {
    return getPosKey(from) + '$' + getPosKey(to);
}

function getPosKey(pos) {
    return pos.x + 'x' + pos.y;
}

let protectedStructures = [
    STRUCTURE_SPAWN,
    STRUCTURE_STORAGE,
    STRUCTURE_TOWER,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_TERMINAL,
    STRUCTURE_NUKER,
    STRUCTURE_OBSERVER,
    STRUCTURE_LINK,
    STRUCTURE_LAB
];