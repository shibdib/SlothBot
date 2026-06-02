/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

/**
 * Created by rober on 5/16/2017.
 */
const minCut = require('util.minCut')
const tickTracker = {};
const linkTracker = {};
const extensionPositionCache = {}; // module-level — never hits Memory serialization

module.exports.buildRoom = function () {
    if (!shouldRunAtAll()) return;

    let room = getNextRoom();
    if (!room) return;

    tickTracker['lastTick'] = Game.time + 1;
    tickTracker['lastRoom'] = room.name;

    let lastRun = tickTracker[room.name] || {};

    // Ensure the room has a bunker hub
    if (room.memory.bunkerHub && room.memory.bunkerHub.x) {
        // Check if bunker layout needs to be built
        if (shouldRunLayout(lastRun)) {
            buildMissingStructures(room, room.controller.level);
            lastRun.task = 'layout';
        }
        // Check if auxiliary buildings need to be built
        else if (shouldRunAuxiliary(lastRun)) {
            buildAuxiliaryStructures(room);
            lastRun.task = 'auxiliary';
        }
    } else {
        // Find hub if not already found
        findHub(room);
    }

    // If no lab hub is set, find and assign one
    if (!room.memory.labHub) findLabHub(room);

    if (!room.memory.towerHubs) findTowerHub(room);

    // Update tick tracker
    tickTracker[room.name] = lastRun;
};

function getNextRoom() {
    const rooms = MY_ROOMS.map(name => Game.rooms[name]).filter(r => r);
    if (!rooms.length) return null;

    const lastIndex = tickTracker.lastRoom ? MY_ROOMS.indexOf(tickTracker.lastRoom) : -1;
    return rooms[(lastIndex + 1) % rooms.length] || rooms[0];
}

function shouldRunAtAll() {
    let overallLastRun = tickTracker['lastTick'] || 0;
    return overallLastRun < Game.time;
}

function shouldRunLayout(lastRun) {
    return !lastRun.task || lastRun.task === 'auxiliary';
}

function shouldRunAuxiliary(lastRun) {
    return !lastRun.task || lastRun.task === 'layout';
}

function getStructureCounts(room) {
    const counts = {};
    room.structures.forEach(s => counts[s.structureType] = (counts[s.structureType] || 0) + 1);
    room.constructionSites.forEach(s => counts[s.structureType] = (counts[s.structureType] || 0) + 1);
    return counts;
}

function buildMissingStructures(room, level) {
    const existingCounts = getStructureCounts(room);
    const tmpl = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
    const skipTypes = [STRUCTURE_CONTAINER, STRUCTURE_RAMPART, STRUCTURE_WALL, STRUCTURE_ROAD];
    if (room.memory.dynamicLayout) skipTypes.push(STRUCTURE_EXTENSION); // extensions placed separately
    const countCheck = tmpl.filter(s =>
        !skipTypes.includes(s.structureType) &&
        CONTROLLER_STRUCTURES[s.structureType][level] > (existingCounts[s.structureType] || 0)
    );
    if (countCheck && countCheck.length) buildFromLayout(room, countCheck);
    if (room.memory.dynamicLayout) placeExtensionsDynamically(room);
    // Towers are not in the template — always check independently so established rooms build them too
    buildTowersFromHubs(room);
}

function buildAuxiliaryStructures(room) {
    let builtSpawn = room.spawns[0];
    if (builtSpawn) auxiliaryBuilding(room);
}

function buildFromLayout(room, countCheck) {
    const hub = room.hub;
    const initialSpawn = _.find(Game.structures, s => s.structureType === STRUCTURE_SPAWN && s.my);
    const roomTower = room.towers[0];
    const roomSpawn = room.spawns[0];
    let filter = [];

    const tmpl = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
    if (room.controller.level === 1 && !initialSpawn) {
        filter = tmpl.filter(s => s.structureType === STRUCTURE_SPAWN);
    } else if (room.controller.level >= 5 && (room.safemode || (INTEL[room.name].lastMajorAttack + (CREEP_LIFE_TIME * 2) > Game.time))) {
        room.constructionSites.filter(s => ![STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_TERMINAL, STRUCTURE_RAMPART, STRUCTURE_WALL].includes(s.structureType) && !s.progress).forEach(s => s.remove());
        filter = tmpl.filter(s => [STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_TERMINAL].includes(s.structureType));
        rampartBuilder(room, tmpl);
    } else if ((TOWER_FIRST && !roomTower && MY_ROOMS.length > 1) || (room.controller.level >= 3 && !roomTower)) {
        if (buildTowersFromHubs(room)) return;
    } else if (!roomSpawn) {
        const spawnPos = tmpl.filter(s => s.structureType === STRUCTURE_SPAWN)[0].pos[0];
        const pos = new RoomPosition(hub.x + spawnPos.x, hub.y + spawnPos.y, room.name);
        if (!pos.checkForRampart()) pos.createConstructionSite(STRUCTURE_RAMPART); else if (pos.checkForRampart().hits >= 10000) pos.createConstructionSite(STRUCTURE_SPAWN);
        return;
    } else {
        filter = countCheck.filter(s => CONTROLLER_STRUCTURES[s.structureType][room.controller.level]);
    }

    if (filter.length) {
        if (buildSourceExtensions(room)) return;
        for (const structure of filter) {
            if (shouldSkipStructure(room, structure)) continue;
            for (const buildPos of structure.pos) {
                const pos = new RoomPosition(hub.x + buildPos.x, hub.y + buildPos.y, room.name);
                if (!pos.checkForConstructionSites() && !pos.checkForAllStructure()) {
                    pos.createConstructionSite(structure.structureType);
                }
            }
        }

        // Handle proto storage pre rcl4
        if (!room.storage && !room.memory.protoStorage && room.controller.level < 4 && room.controller.level > 1) {
            const tmpl = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
            const storagePos = tmpl.filter(s => s.structureType === STRUCTURE_STORAGE)[0].pos[0];
            const pos = new RoomPosition(hub.x + storagePos.x, hub.y + storagePos.y, room.name);
            if (!pos.checkForConstructionSites() && !pos.checkForAllStructure()) {
                pos.createConstructionSite(STRUCTURE_CONTAINER);
            } else if (pos.checkForAllStructure() && pos.checkForAllStructure().structureType === STRUCTURE_CONTAINER) {
                room.memory.protoStorage = pos.checkForAllStructure().id;
            }
        } else if (room.memory.protoStorage && room.controller.level >= 4) {
            const protoStorage = Game.getObjectById(room.memory.protoStorage);
            protoStorage.destroy();
            room.memory.protoStorage = undefined;
        }
    }
}

// Helper function to determine if a structure should be skipped
function shouldSkipStructure(room, structure) {
    return room.controller.level !== room.level &&
        ![STRUCTURE_EXTENSION, STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_TERMINAL].includes(structure.structureType);
}

function auxiliaryBuilding(room) {
    // Sanity check if hub and controller links exist and clear them from memory if not
    if (room.memory.controllerLink && !Game.getObjectById(room.memory.controllerLink)) room.memory.controllerLink = undefined;
    if (room.memory.hubLink && !Game.getObjectById(room.memory.hubLink)) room.memory.hubLink = undefined;

    // Build necessary structures for sources, controller, ramparts, roads, etc.
    if (sourceBuilder(room)) return;
    if (controllerBuilder(room)) return;
    const layoutForAux = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;

    // Handle hub and lab constructions
    if (room.storage) {
        if (room.level >= 6) {
            mineralBuilder(room);
            labBuilder(room);
        }
        if (buildRoads(room, room.memory.dynamicLayout ? null : bunkerTemplate)) return; else {
            INTEL[room.name].roadsBuilt = undefined;
        }
        if (linkBuilder(room)) return true;
    }

    if (rampartBuilder(room, layoutForAux)) return;

    // Perform cleanup tasks
    performCleanup(room);

    // Helper function to build roads and manage their construction
    function buildRoads(room, bunkerTemplate) {
        if (room.level >= ROAD_LEVEL && room.constructionSites.filter((s) => s.structureType === STRUCTURE_ROAD).length < 3 && !roadBuilder(room, bunkerTemplate)) {
            INTEL[room.name].roadsBuilt = true;
            return false;
        } else {
            INTEL[room.name].roadsBuilt = undefined;
        }
    }

    // Helper function for cleaning up unwanted structures and roads
    function performCleanup(room) {
        // Random chance to perform cleanup
        if (Math.random() > 0.9) {
            removeExcessRoads(room);
            removeBadStructures(room);
        }
    }

    // Helper function to remove roads that shouldn't exist
    function removeExcessRoads(room) {
        let noRoad = _.filter(room.impassibleStructures, (s) => s.pos.checkForRoad());
        if (noRoad.length) {
            ROAD_CACHE[room.name] = undefined;
            noRoad.forEach((s) => s.pos.checkForRoad().destroy());
        }
    }

    // Helper function to remove bad structures
    function removeBadStructures(room) {
        let badStructure = _.filter(room.structures, (s) => isBadStructure(s, room));
        if (badStructure.length) {
            badStructure.forEach((s) => s.destroy());
        }
    }

    // Helper function to check if a structure is considered "bad" and should be removed
    function isBadStructure(structure, room) {
        if (room.controller.level >= 6) {
            return structure.owner && structure.owner.username !== MY_USERNAME;
        } else if (room.controller.level >= 4) {
            return structure.owner && structure.owner.username !== MY_USERNAME && structure.structureType !== STRUCTURE_TERMINAL;
        }
        return false;
    }
}

// Places extensions adjacent to source containers for the harvester to fill directly,
// reducing hauler load. Only runs after the source link is confirmed built so we
// never accidentally occupy the link's future slot.
function buildSourceExtensions(room) {
    const hub = room.hub;

    for (const source of room.sources) {
        const container = Game.getObjectById(source.memory.container);
        if (!container) continue;

        // Must have a confirmed link before placing — link builder picks its own tile first
        const link = source.memory.link ? Game.getObjectById(source.memory.link) : null;
        if (!link) {
            // Skip if link is mid-build (don't block the in-progress site)
            const linkSite = container.pos.findInRange(FIND_CONSTRUCTION_SITES, 1)
                .find(s => s.structureType === STRUCTURE_LINK);
            if (linkSite) continue;
            // No link and no site — link hasn't been built for this source yet, skip
            continue;
        }

        // Collect open neighbors of the container (potential extension sites + access tiles)
        const candidates = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (!dx && !dy) continue;
                const x = container.pos.x + dx, y = container.pos.y + dy;
                if (x < 1 || x > 48 || y < 1 || y > 48) continue;
                const pos = new RoomPosition(x, y, room.name);
                if (pos.checkForWall()) continue;
                if (pos.isEqualTo(source.pos)) continue;         // source tile
                if (pos.isEqualTo(link.pos)) continue;           // link tile
                if (pos.checkForAllStructure() || pos.checkForConstructionSites()) continue;
                candidates.push(pos);
            }
        }

        // Reserve one open neighbor pathable to the hub so haulers can still reach the container
        let reserved = null;
        if (hub && candidates.length > 0) {
            reserved = _.min(candidates, p => p.getRangeTo(hub));
        }

        for (const pos of candidates) {
            if (reserved && pos.isEqualTo(reserved)) continue;
            if (hub && pos.getRangeTo(hub) <= 5) continue;   // hub cluster handles its own
            if (pos.createConstructionSite(STRUCTURE_EXTENSION) === OK) return true;
        }
    }
    return false;
}

function linkBuilder(room) {
    if (room.level < 5) return false;
    const linkLimit = CONTROLLER_STRUCTURES[STRUCTURE_LINK][room.level];
    const currentLinks = room.links.length +
        room.constructionSites.filter(s => s.structureType === STRUCTURE_LINK).length;

    // 1. Controller Link (RCL 5+)
    if (!room.memory.controllerLink || !Game.getObjectById(room.memory.controllerLink)) {
        const existingLink = room.controller.pos.findInRange(room.links, 3)[0];
        if (existingLink) {
            room.memory.controllerLink = existingLink.id;
        } else {
            room.memory.controllerLink = undefined;
            const site = _.find(room.controller.pos.findInRange(FIND_CONSTRUCTION_SITES, 2), s => s.structureType === STRUCTURE_LINK);
            if (site) return true;
            const zoneTerrain = room.lookForAtArea(LOOK_TERRAIN, room.controller.pos.y - 2, room.controller.pos.x - 2,
                room.controller.pos.y + 2, room.controller.pos.x + 2, true);
            for (let key in zoneTerrain) {
                let position = new RoomPosition(zoneTerrain[key].x, zoneTerrain[key].y, room.name);
                if (position.checkForAllStructure() || position.checkForImpassible() || position.isNearTo(room.controller)) continue;
                if (position.createConstructionSite(STRUCTURE_LINK) === OK) return true;
            }
        }
    }

    // 2. Farthest Source Link (RCL 5+)
    const sortedSources = _.sortBy(room.sources, s => -s.pos.getRangeTo(room.hub));
    if (currentLinks < linkLimit && sortedSources.length > 0) {
        if (buildSourceLink(room, sortedSources[0])) return true;
    }

    if (!room.memory.controllerLink) return false;

    // 3. Hub Link (RCL 6+)
    if (!room.memory.hubLink || !Game.getObjectById(room.memory.hubLink)) {
        let hubLinkPos = new RoomPosition(room.hub.x, room.hub.y + 1, room.name);
        const existingLink = hubLinkPos.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_LINK);
        if (existingLink) {
            room.memory.hubLink = existingLink.id;
        } else {
            const site = hubLinkPos.lookFor(LOOK_CONSTRUCTION_SITES).find(s => s.structureType === STRUCTURE_LINK);
            if (site) return true;
            if (hubLinkPos.createConstructionSite(STRUCTURE_LINK) === OK) return true;
        }
    }

    // 4. Next Source Link (RCL 7+)
    if (currentLinks < linkLimit && sortedSources.length > 1) {
        if (buildSourceLink(room, sortedSources[1])) return true;
    }

    // 5. Remote Links (RCL 8)
    if (currentLinks < linkLimit) {
        const neighboring = Object.values(Game.map.describeExits(room.name));
        for (const neighbor of neighboring) {
            const remoteHarvester = Game.rooms[neighbor].myCreeps.find(c => c.memory.role === 'remoteHarvester');
            if (!remoteHarvester) continue;
            const exit = Game.map.findExit(room.name, neighbor);
            const exitTiles = room.find(exit);
            if (!exitTiles.length) continue;
            const middle = _.round(exitTiles.length / 2);
            const startPos = exitTiles[middle];
            const existingLink = startPos.findClosestByRange(room.structures, {filter: (s => s.structureType === STRUCTURE_LINK)});
            if (existingLink && existingLink.pos.getRangeTo(startPos) <= 4) continue;
            const inBuildLink = startPos.findClosestByRange(room.constructionSites, {filter: (s => s.structureType === STRUCTURE_LINK)});
            if (inBuildLink && inBuildLink.pos.getRangeTo(startPos) <= 4) continue;
            for (let xOff = -3; xOff <= 3; xOff++) {
                for (let yOff = -3; yOff <= 3; yOff++) {
                    if (xOff === 0 && yOff === 0) continue;
                    if (startPos.x + xOff < 1 || startPos.x + xOff > 48 || startPos.y + yOff < 1 || startPos.y + yOff > 48) continue;
                    let pos = new RoomPosition(startPos.x + xOff, startPos.y + yOff, room.name);
                    if (pos.checkForAllStructure() || pos.checkForImpassible()) continue;
                    if (pos.createConstructionSite(STRUCTURE_LINK) === OK) return true;
                }
            }
        }
    }

    return false;

    function buildSourceLink(room, source) {
        const sourceContainer = Game.getObjectById(source.memory.container);
        if (!sourceContainer) return false;

        const existingLink = sourceContainer.pos.findInRange(room.links, 1)[0];
        if (existingLink) {
            source.memory.link = existingLink.id;
            return false;
        }

        const site = _.find(sourceContainer.pos.findInRange(FIND_CONSTRUCTION_SITES, 1), s => s.structureType === STRUCTURE_LINK);
        if (site) return true;

        const zoneTerrain = room.lookForAtArea(LOOK_TERRAIN, sourceContainer.pos.y - 1, sourceContainer.pos.x - 1,
            sourceContainer.pos.y + 1, sourceContainer.pos.x + 1, true);
        for (let key in zoneTerrain) {
            let position = new RoomPosition(zoneTerrain[key].x, zoneTerrain[key].y, room.name);
            if (position.checkForWall() || position.checkForAllStructure() || position.isNearTo(room.controller)) continue;
            if (position.createConstructionSite(STRUCTURE_LINK) === OK) return true;
        }
        return false;
    }
}

function sourceBuilder(room) {
    if (room.controller.level >= 3) {
        for (let source of room.sources) {
            if (buildSourceContainer(source, room)) return true;
        }
    }

    // Helper function to handle the creation of source containers
    function buildSourceContainer(source, room) {
        let sourceContainer = Game.getObjectById(source.memory.containerID) || source.pos.findInRange(room.containers, 1)[0];
        if (!sourceContainer) {
            source.memory.container = undefined;
            let sourceBuild = _.find(source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1), (s) => s.structureType === STRUCTURE_CONTAINER);
            if (!sourceBuild) {
                let containerSite = findBestContainerPos(source);
                if (containerSite && !containerSite.checkForConstructionSites()) {
                    if (containerSite.createConstructionSite(STRUCTURE_CONTAINER) === OK) return true;
                }
            }
        } else {
            if (!source.memory.distanceToHub) {
                source.memory.distanceToHub = source.pos.findPathTo(room.hub).length;
            }
            source.memory.container = sourceContainer.id;
        }
    }
}

function controllerBuilder(room) {
    let controllerContainer = Game.getObjectById(room.memory.controllerContainer);
    let controllerLink = Game.getObjectById(room.memory.controllerLink);
    if (!controllerContainer && room.level >= 2 && room.level < 8) {
        controllerContainer = room.controller.pos.findInRange(room.containers, 3, {
            filter: (s) => !s.pos.isNearTo(s.pos.findClosestByRange(FIND_SOURCES)) &&
                !s.pos.isNearTo(s.pos.findClosestByRange(FIND_MINERALS))
        })[0];
        if (!controllerContainer) {
            let controllerBuild = room.controller.pos.findInRange(FIND_CONSTRUCTION_SITES, 3, {
                filter: (s) => s.structureType === STRUCTURE_CONTAINER
            })[0];
            if (!controllerBuild) {
                // If we have a link, build next to that but in range of the controller
                let possibles = [];
                if (room.memory.controllerLink) {
                    let link = Game.getObjectById(room.memory.controllerLink);
                    if (!link) return room.memory.controllerLink = undefined;
                    for (let xOff = -1; xOff <= 1; xOff++) {
                        for (let yOff = -1; yOff <= 1; yOff++) {
                            if (xOff !== 0 || yOff !== 0) {
                                let pos = new RoomPosition(link.pos.x + xOff, link.pos.y + yOff, room.name);
                                if (pos.getRangeTo(room.controller) <= 2 && !pos.checkForImpassible() && !pos.checkIfOutOfBounds() &&
                                    !pos.isNearTo(pos.findClosestByRange(FIND_SOURCES)) &&
                                    !pos.isNearTo(pos.findClosestByRange(FIND_MINERALS))) {
                                    possibles.push({x: pos.x, y: pos.y});
                                }
                            }
                        }
                    }
                } else {
                    for (let xOff = -2; xOff <= 2; xOff++) {
                        for (let yOff = -2; yOff <= 2; yOff++) {
                            if (xOff !== 0 || yOff !== 0) {
                                let pos = new RoomPosition(room.controller.pos.x + xOff, room.controller.pos.y + yOff, room.name);
                                if (!pos.checkForImpassible() && !pos.checkIfOutOfBounds() &&
                                    !pos.isNearTo(pos.findClosestByRange(FIND_SOURCES)) &&
                                    !pos.isNearTo(pos.findClosestByRange(FIND_MINERALS))) {
                                    possibles.push({x: pos.x, y: pos.y});
                                }
                            }
                        }
                    }
                }
                let closestPos = getClosestPosition(possibles, room.hub);
                if (closestPos) {
                    if (closestPos.createConstructionSite(STRUCTURE_CONTAINER) === OK) return true;
                }
            }
        } else {
            room.memory.controllerContainer = controllerContainer.id;
        }
    } else if (controllerContainer && controllerLink && room.level === 8) {
        // If the controller container is empty destroy it
        if (controllerContainer.store.getUsedCapacity() === 0) {
            controllerContainer.destroy();
            room.memory.controllerContainer = undefined;
        }
    }

    function getClosestPosition(positions, hub) {
        let closestPos = null;
        let closestRange = Infinity;
        for (let pos of positions) {
            pos = new RoomPosition(pos.x, pos.y, room.name);
            const range = pos.findPathTo(hub).length;
            if (range < closestRange) {
                closestPos = pos;
                closestRange = range;
            }
        }
        return closestPos;
    }
}

const quadTraps = {};
function rampartBuilder(room, layout = undefined, count = false) {
    // Clean old ramparts
    if (Memory.rampartVersion !== RAMPART_VERSION) {
        Memory.rampartVersion = RAMPART_VERSION;
        MY_ROOMS.forEach((r) => Game.rooms[r].structures.filter((s) => s.structureType === STRUCTURE_RAMPART || (s.structureType === STRUCTURE_ROAD && s.pos.checkForRampart())).forEach((q) => q.destroy()));
        for (const i in Game.constructionSites) Game.constructionSites[i].remove();
    }

    // Bunker
    if (room.level >= BUNKER_LEVEL && room.energyState) {
        if (handleBunkerRamparts(room, layout, count)) return true;
        if (buildProtectiveRamparts(room)) return true;
    }

    // Handle quad traps — RCL8 only, walls capped at 20k
    if (room.level >= 8 && buildQuadTraps(room)) {
        return true;
    }

    function handleBunkerRamparts(room, layout, count) {
        if (!ROOM_RAMPART_SPOTS[room.name]) {
            return initializeRampartSpots(room, layout, count);
        } else {
            return placeRamparts(room, count);
        }
    }

    function buildProtectiveRamparts(room) {
        const ramparts = ROOM_RAMPART_SPOTS && ROOM_RAMPART_SPOTS[room.name] ? JSON.parse(ROOM_RAMPART_SPOTS[room.name]) : undefined;
        if (!ramparts || !ramparts.length) return false;
        let counter = 0;
        const rampartPositions = ramparts.map(p => new RoomPosition(p.x, p.y, room.name));
        const vulnerableStructures = room.structures.filter((s) =>
            s.structureType !== STRUCTURE_ROAD &&
            s.structureType !== STRUCTURE_WALL &&
            !s.pos.checkForRampart() &&
            !s.pos.checkForConstructionSites());
        for (const structure of vulnerableStructures) {
            if (counter >= 3) return true;
            const rangeFromRampart = structure.pos.getRangeTo(structure.pos.findClosestByRange(rampartPositions));
            const inBunker = structure.pos.isInBunker();
            if ((rangeFromRampart <= 3 && inBunker) || !inBunker) {
                if (structure.pos.createConstructionSite(STRUCTURE_RAMPART) === OK) counter++;
            }
        }
        if (room.level >= SPECIAL_RAMPARTS) {
            if (PROTECT_SOURCES) {
                for (let source of room.sources) {
                    if (source.pos.isInBunker()) continue;
                    if (counter >= 3) return true;
                    if (buildRampartAround(source.pos)) counter++;
                }
            }
            if (PROTECT_MINERAL && !room.mineral.pos.isInBunker()) {
                if (counter >= 3) return true;
                if (buildRampartAround(room.mineral.pos)) counter++;
            }
            if (PROTECT_CONTROLLER && !room.controller.pos.isInBunker()) {
                if (counter >= 3) return true;
                if (buildRampartAround(room.controller.pos)) counter++;
            }
            // Handle ramparts on protected structures
            if (PROTECT_STRUCTURES && room.level >= 8) {
                for (let structure of room.structures) {
                    if (counter >= 3) return true;
                    if (protectedStructureTypes.includes(structure.structureType)) {
                        if (!structure.pos.checkForRampart() && !structure.pos.checkForConstructionSites()) {
                            if (structure.pos.createConstructionSite(STRUCTURE_RAMPART) === OK) counter++;
                        }
                    }
                }
            }
        }
        return false;
    }

    function buildQuadTraps(room) {
        if (!quadTraps[room.name]) setQuadTraps(room);
        if (!quadTraps[room.name] || !quadTraps[room.name].length) return false;

        const QUAD_WALL_CAP = 20000;
        let counter = 0;
        const newWallPositions = room.memory.quadTrapWalls ? new Set(room.memory.quadTrapWalls.map(p => `${p.x},${p.y}`)) : new Set();

        for (const trap of quadTraps[room.name]) {
            if (counter >= 3) return true;
            const pos = new RoomPosition(trap.x, trap.y, room.name);
            if (pos.isNearTo(room.controller) || pos.isNearTo(room.mineral) ||
                room.sources.some(s => pos.isNearTo(s))) continue;

            const isWallTile = (pos.x + pos.y) % 2 === 0;
            if (isWallTile) {
                // Skip if wall already exists at or above the cap
                const existing = pos.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_WALL);
                if (existing && existing.hits >= QUAD_WALL_CAP) continue;
                if (existing || pos.checkForConstructionSites()) continue;
                if (pos.createConstructionSite(STRUCTURE_WALL) === OK) {
                    counter++;
                    if (!newWallPositions.has(`${pos.x},${pos.y}`)) {
                        newWallPositions.add(`${pos.x},${pos.y}`);
                        if (!room.memory.quadTrapWalls) room.memory.quadTrapWalls = [];
                        room.memory.quadTrapWalls.push({x: pos.x, y: pos.y});
                    }
                }
            } else {
                if (pos.checkForRampart() || pos.checkForConstructionSites()) continue;
                if (pos.createConstructionSite(STRUCTURE_RAMPART) === OK) counter++;
            }
        }
        return counter > 0;
    }

    function setQuadTraps(room) {
        if (!ROOM_RAMPART_SPOTS[room.name]) return false;
        const ramparts = JSON.parse(ROOM_RAMPART_SPOTS[room.name]);
        if (!ramparts || !ramparts.length) return;
        const hub = room.hub;
        const terrain = Game.map.getRoomTerrain(room.name);
        const trapLocations = [];

        for (const {x, y} of ramparts) {
            // Push one tile outward from the hub (away from centre)
            const dx = x === hub.x ? 0 : (x < hub.x ? -1 : 1);
            const dy = y === hub.y ? 0 : (y < hub.y ? -1 : 1);
            const nx = x + dx, ny = y + dy;
            if (nx < 1 || nx > 48 || ny < 1 || ny > 48) continue;
            if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) continue;
            const pos = new RoomPosition(nx, ny, room.name);
            if (pos.lookFor(LOOK_STRUCTURES).some(s => OBSTACLE_OBJECT_TYPES.includes(s.structureType))) continue;
            trapLocations.push({x: nx, y: ny});
        }
        quadTraps[room.name] = trapLocations;
    }

    function initializeRampartSpots(room, layout, count) {
        ROOM_RAMPART_SPOTS[room.name] = undefined;
        let rectArray = getProtectedAreaBounds(layout, room);
        let bounds = {x1: 0, y1: 0, x2: 49, y2: 49};

        try {
            ROOM_RAMPART_SPOTS[room.name] = JSON.stringify(minCut.GetCutTiles(room.name, rectArray, bounds));
        } catch (e) {
            log.e('MinCut Error in room ' + room.name);
            log.e(e.stack);
        }

        // Count ramparts if requested
        if (count && ROOM_RAMPART_SPOTS[room.name]) {
            return _.size(JSON.parse(ROOM_RAMPART_SPOTS[room.name]));
        }
    }

    function getProtectedAreaBounds(layout, room) {
        let rectArray = [];
        for (let structure of layout) {
            for (let buildPos of structure.pos) {
                rectArray.push({
                    x1: (buildPos.x + room.hub.x) - 1,
                    y1: (buildPos.y + room.hub.y) - 1,
                    x2: (buildPos.x + room.hub.x) + 1,
                    y2: (buildPos.y + room.hub.y) + 1
                });
            }
        }
        // Lab hub
        if (room.memory.labHub) {
            const labHub = room.memory.labHub;
            rectArray.push({x1: labHub.x - 3, y1: labHub.y - 3, x2: labHub.x + 3, y2: labHub.y + 3});
        }
        // Tower hubs — must be inside the rampart perimeter so towers can be resupplied during combat
        if (room.memory.towerHubs) {
            for (const {x, y} of room.memory.towerHubs) {
                rectArray.push({x1: x - 1, y1: y - 1, x2: x + 1, y2: y + 1});
            }
        }
        // Dynamic Extensions
        if (extensionPositionCache[room.name]) {
            for (const {x, y} of extensionPositionCache[room.name]) {
                rectArray.push({x1: x - 1, y1: y - 1, x2: x + 1, y2: y + 1});
            }
        }
        // Set bounds
        for (let key in rectArray) {
            let rect = rectArray[key];
            rect.x1 = Math.max(rect.x1, 2);
            rect.y1 = Math.max(rect.y1, 2);
            rect.x2 = Math.min(rect.x2, 47);
            rect.y2 = Math.min(rect.y2, 47);
        }
        return rectArray;
    }

    function placeRamparts(room) {
        let spots = JSON.parse(ROOM_RAMPART_SPOTS[room.name]);
        if (!spots || !spots.length) {
            addExistingRampartsToSpots(room, spots);
        }

        let buildPositions = spots.map(p => new RoomPosition(p.x, p.y, room.name));
        let inBuild = _.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL).length;

        // Avoid exceeding 5 constructions at a time
        let cycles = 0;
        for (let pos of buildPositions) {
            if (cycles + inBuild >= 5) return true;
            if (shouldBuildRampartAtPosition(pos, room)) {
                if (pos.createConstructionSite(STRUCTURE_RAMPART) === OK) {
                    cycles++;
                }
            }
        }
        if (cycles || inBuild.length) return true;
    }

    function addExistingRampartsToSpots(room, spots) {
        // Only add existing ramparts or walls once
        let existingRamparts = room.ramparts.concat(room.constructedWalls);
        existingRamparts.forEach((b) => spots.push({x: b.pos.x, y: b.pos.y}));
    }

    function shouldBuildRampartAtPosition(pos, room) {
        // General rampart check based on proximity to important structures
        if (isNearProtectedStructure(pos, room)) {
            return !pos.checkForRampart() && !pos.checkForConstructionSites();
        }

        // Handle tunnels
        if (pos.checkForWall() && pos.checkForRoad()) {
            return handleTunnelRampart(pos);
        }

        return !pos.checkForBarrierStructure() && !pos.checkForConstructionSites();
    }

    function isNearProtectedStructure(pos, room) {
        return pos.isNearTo(room.controller) || pos.isNearTo(room.mineral) || pos.isNearTo(pos.findClosestByRange(FIND_SOURCES));
    }

    function handleTunnelRampart(pos) {
        for (let xOff = -1; xOff <= 1; xOff++) {
            for (let yOff = -1; yOff <= 1; yOff++) {
                if (xOff !== 0 || yOff !== 0) {
                    let newPos = new RoomPosition(pos.x + xOff, pos.y + yOff, pos.roomName);
                    if (!newPos.checkForWall() && !newPos.checkForBarrierStructure() && !newPos.checkForConstructionSites() &&
                        newPos.createConstructionSite(STRUCTURE_RAMPART) === OK) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    function buildRampartAround(position) {
        // Loop through a 3x3 area around the position
        for (let xOff = -1; xOff <= 1; xOff++) {
            for (let yOff = -1; yOff <= 1; yOff++) {
                // Skip the center position
                if (xOff === 0 && yOff === 0) continue;

                let targetPos = new RoomPosition(position.x + xOff, position.y + yOff, position.roomName);

                // Check if the position is valid for placing a rampart
                if (isValidRampartPosition(targetPos)) {
                    targetPos.createConstructionSite(STRUCTURE_RAMPART);
                    return true; // Stop after placing one rampart
                }
            }
        }
        return false; // Return false if no valid position was found
    }
}

function roadBuilder(room, layout) {
    let spawn = room.spawns[0];
    if (!spawn) return false;

    // Source roads
    let sourceContainers = room.sources.map(source => Game.getObjectById(source.memory.container)).filter(container => container);
    for (let container of sourceContainers) {
        if (buildRoadFromTo(room, spawn, container)) {
            return true;
        }
    }

    // Controller roads
    let controllerContainer = Game.getObjectById(room.memory.controllerContainer);
    if (controllerContainer && buildRoadFromTo(room, spawn, controllerContainer)) {
        return true;
    }

    // Exit Roads
    if (buildRoadToNeighborExits(spawn, room)) return true;

    // Layout roads
    if (buildLayoutRoads(room, layout)) return true;

    // Tower roads
    if (room.memory.towerHubs && room.memory.towerHubs.length && buildTowerRoads(room)) return true;

    // RCL 6+ lab and mineral roads
    if (room.level >= 6 && buildMineralLinkAndLabRoads(room)) return true;

    // RCL 7+ we build rampart roads
    if (room.level >= 7 && buildRoadsForRamparts(room)) return true;

    // Handle redundant roads
    //removeRedundantRoads(room, layout);

    function buildRoadToNeighborExits(spawn, room) {
        let neighboring = Game.map.describeExits(spawn.pos.roomName);
        if (!neighboring) return false;

        let directionToExit = {
            '1': FIND_EXIT_TOP,
            '3': FIND_EXIT_RIGHT,
            '5': FIND_EXIT_BOTTOM,
            '7': FIND_EXIT_LEFT
        };

        for (let direction in directionToExit) {
            if (neighboring[direction]) {
                let exits = spawn.room.find(directionToExit[direction]);
                let middle = _.round(exits.length / 2);
                if (buildRoadFromTo(spawn.room, spawn, exits[middle])) {
                    return true;
                }
            }
        }

        return false;
    }

    function buildLayoutRoads(room, layout) {
        let roadStructures = _.filter(layout, (s) => s.structureType === STRUCTURE_ROAD);
        let allPositions = [].concat(...roadStructures.map(s => s.pos));
        for (let structure of allPositions) {
            let pos = new RoomPosition(room.hub.x + structure.x, room.hub.y + structure.y, room.name);
            if (buildRoad(pos)) {
                return true;
            }
        }
        return false;
    }

    function buildTowerRoads(room) {
        const towers = room.towers;
        const spawn = room.spawns[0];
        for (const tower of towers) {
            if (buildRoadFromTo(room, spawn, tower)) return true;
        }
        return false;
    }

    function buildMineralLinkAndLabRoads(room) {
        let container = Game.getObjectById(room.memory.extractorContainer);
        let spawn = room.spawns[0];
        if (container && spawn && buildRoadFromTo(room, spawn, container)) return true;
        let labsLinks = room.labs.concat(room.links);
        if (labsLinks.length) {
            let hub = new RoomPosition(room.memory.bunkerHub.x, room.memory.bunkerHub.y, room.name);
            for (let lab of labsLinks) {
                if (buildRoadFromTo(room, lab, hub)) return true;
            }
        }
        return false;
    }

    function buildRoadsForRamparts(room) {
        if (!ROOM_RAMPART_SPOTS || !ROOM_RAMPART_SPOTS[room.name]) return false;
        const ramparts = JSON.parse(ROOM_RAMPART_SPOTS[room.name]);
        if (!ramparts || !ramparts.length) return false;
        const rampartPositions = ramparts.map(p => new RoomPosition(p.x, p.y, room.name));
        const spawn = room.spawns[0];
        let buildCounter = 0;
        for (let pos of rampartPositions) {
            if (buildCounter >= 5) return true;
            if (!pos.checkForRoad() && pos.checkForRampart()) {
                if (buildRoad(pos)) buildCounter++
            }
        }
        for (const rampart of rampartPositions) {
            if (buildCounter >= 5) return true;
            if (buildRoadFromTo(room, rampart, spawn)) buildCounter++
        }
        return false;
    }

    function buildRoadFromTo(room, start, end) {
        let target, begin;
        if (start instanceof RoomPosition) begin = start; else begin = start.pos;
        if (end instanceof RoomPosition) target = end; else target = end.pos;

        const key = getPathKey(begin, target);
        const roomCache = ROAD_CACHE[room.name];
        const cached = roomCache && roomCache[key];

        if (cached && cached.complete) return false;

        let points;
        if (cached) {
            points = JSON.parse(cached.path);
        } else {
            const result = PathFinder.search(begin, {pos: target, range: 1}, {
                heuristicWeight: 0.8,
                roomCallback: roomName => buildCostMatrix(roomName)
            });
            if (!result.path.length) return false;
            cacheRoad(room, begin, target, result.path);
            points = result.path;
        }

        for (const point of points) {
            const pos = new RoomPosition(point.x, point.y, room.name);
            if (buildRoad(pos)) return true;
        }

        // Every tile already has a road — skip future iterations for this path
        if (ROAD_CACHE[room.name] && ROAD_CACHE[room.name][key]) {
            ROAD_CACHE[room.name][key].complete = true;
        }
    }

    function buildCostMatrix(roomName) {
        let costMatrix = new PathFinder.CostMatrix();
        let terrain = Game.map.getRoomTerrain(roomName);
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                let tile = terrain.get(x, y);
                if (tile === TERRAIN_MASK_WALL) {
                    costMatrix.set(x, y, Infinity);
                } else if (tile === TERRAIN_MASK_SWAMP) {
                    costMatrix.set(x, y, 60);
                } else {
                    costMatrix.set(x, y, 20);
                }
            }
        }
        let room = Game.rooms[roomName];
        if (room) {
            room.structures.forEach(structure => {
                if (structure.structureType === STRUCTURE_ROAD) {
                    costMatrix.set(structure.pos.x, structure.pos.y, 1);
                } else if (structure.structureType === STRUCTURE_CONTAINER) {
                    costMatrix.set(structure.pos.x, structure.pos.y, 100);
                } else if (_.includes(OBSTACLE_OBJECT_TYPES, structure.structureType)) {
                    costMatrix.set(structure.pos.x, structure.pos.y, Infinity);
                }
            });
            room.constructionSites.forEach(site => {
                if (site.structureType === STRUCTURE_ROAD) {
                    costMatrix.set(site.pos.x, site.pos.y, 1);
                }
            });
        }
        return costMatrix;
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

    function buildRoad(pos) {
        if (pos.checkForRoad() || pos.checkForConstructionSites() || pos.checkForImpassible() || pos.checkForWall()) {
            return false;
        } else if (pos.createConstructionSite(STRUCTURE_ROAD) === OK) {
            return true;
        }
    }

    function removeRedundantRoads(room, layout) {
        const needed = new Set();

        // Layout roads
        const roadStructures = _.filter(layout, s => s.structureType === STRUCTURE_ROAD);
        for (const s of [].concat(...roadStructures.map(r => r.pos))) {
            needed.add(`${room.hub.x + s.x}x${room.hub.y + s.y}`);
        }

        // All positions from cached paths (sources, controller, exits, towers, labs, ramparts)
        const cache = ROAD_CACHE[room.name];
        if (cache) {
            for (const key in cache) {
                for (const point of JSON.parse(cache[key].path)) {
                    needed.add(`${point.x}x${point.y}`);
                }
            }
        }

        const roads = room.roads;
        let removed = false;
        for (const road of roads) {
            if (road.pos.checkForRampart()) continue;
            if (!needed.has(`${road.pos.x}x${road.pos.y}`)) {
                road.destroy();
                removed = true;
            }
        }
        if (removed) ROAD_CACHE[room.name] = undefined;
    }
}

function labBuilder(room) {
    // Check the current number of built labs
    let builtLabs = room.labs.length;

    // Check if there's already a construction site for labs
    let labInBuild = _.find(room.constructionSites, (s) => s.structureType === STRUCTURE_LAB);

    // If the required number of labs are built, or there's already a construction site, skip further building
    if (CONTROLLER_STRUCTURES[STRUCTURE_LAB][room.level] <= builtLabs || labInBuild) return;

    // Define the lab hub position from memory
    let labHub = new RoomPosition(room.memory.labHub.x, room.memory.labHub.y, room.name);

    // Iterate through the lab template to place lab construction sites
    for (let structure of labTemplate) {
        let pos = new RoomPosition(labHub.x + structure.x, labHub.y + structure.y, room.name);
        if (pos.checkForBuiltWall()) {
            pos.checkForBuiltWall().destroy();
        } else if (!pos.checkForConstructionSites() && !pos.checkForAllStructure()) {
            pos.createConstructionSite(STRUCTURE_LAB);
        }
    }
}

function mineralBuilder(room) {
    let extractor = room.extractor;

    if (extractor) {
        let extractorContainer = extractor.pos.findInRange(room.containers, 1);
        if (!extractorContainer || !extractorContainer.id) {
            room.memory.extractorContainer = undefined;
            if (!_.find(extractor.pos.findInRange(FIND_CONSTRUCTION_SITES, 1), (s) => s.structureType === STRUCTURE_CONTAINER)) {
                createExtractorContainerSite(extractor, room);
            }
        } else {
            room.memory.extractorContainer = extractorContainer.id;
        }
    } else {
        handleMineralExtractorCreation(room);
    }

    // Helper function to create a construction site for a container near the extractor
    function createExtractorContainerSite(extractor, room) {
        let containerSpots = room.lookForAtArea(LOOK_TERRAIN, extractor.pos.y - 1, extractor.pos.x - 1, extractor.pos.y + 1, extractor.pos.x + 1, true);
        for (let key in containerSpots) {
            let position = new RoomPosition(containerSpots[key].x, containerSpots[key].y, room.name);
            if (position && position.getRangeTo(extractor) === 1 && !position.checkForImpassible()) {
                position.createConstructionSite(STRUCTURE_CONTAINER);
                break;
            }
        }
    }

    // Helper function to create an extractor for minerals
    function handleMineralExtractorCreation(room) {
        if (!room.mineral.pos.checkForAllStructure() && !room.mineral.pos.checkForConstructionSites()) {
            room.mineral.pos.createConstructionSite(STRUCTURE_EXTRACTOR);
        }
    }
}

function findHub(room, hubCheck = undefined) {
    if (room.controller.owner && room.controller.owner.username === MY_USERNAME && room.memory.bunkerHub && room.memory.bunkerHub.x && room.memory.bunkerHub.y) {
        return true;
    }

    // hubCheck is a read-only probe for expansion scoring — never modify the room
    if (!hubCheck) {
        // Destroy non-owned structures so the room is clear for the new layout
        room.structures.forEach(s => {
            if (!s.owner || s.owner.username !== MY_USERNAME) s.destroy();
        });

        // Recover hub from already-placed key structures (respects dynamic layout too)
        const spawn = room.spawns.find(s => s.name !== 'auto');
        if (room.terminal) {
            room.memory.bunkerHub = {x: room.terminal.pos.x + 1, y: room.terminal.pos.y};
            log.a(`${room.name} hub recovered from terminal.`);
            return true;
        } else if (room.storage) {
            room.memory.bunkerHub = {x: room.storage.pos.x - 1, y: room.storage.pos.y};
            log.a(`${room.name} hub recovered from storage.`);
            return true;
        } else if (spawn) {
            room.memory.bunkerHub = {x: spawn.pos.x + 1, y: spawn.pos.y + 1};
            log.a(`${room.name} hub recovered from spawn.`);
            return true;
        }
    }

    // Pre-cache source positions to avoid per-tile API calls inside the validation loop
    const sources = room.find(FIND_SOURCES);

    const possiblePos = [];

    primary:
        for (let y = 10; y <= 40; y++) {
            for (let x = 10; x <= 40; x++) {
                const pos = new RoomPosition(x, y, room.name);
                if (pos.checkForImpassible()) continue;
                if (!isValidHubPosition(pos, room, sources)) continue primary;
                if (hubCheck) return true;
                possiblePos.push({x, y});
            }
        }

    if (possiblePos.length) {
        log.a(`${room.name} hub search complete — ${possiblePos.length} candidates`);
        const choice = _.min(possiblePos, p => {
            const pos = new RoomPosition(p.x, p.y, room.name);
            const sourceDist = pos.getRangeTo(_.min(sources, s => pos.getRangeTo(s))) * 2;
            const controllerDist = pos.getRangeTo(room.controller) * 1.5;
            const edgeBonus = Math.min(p.x, 49 - p.x, p.y, 49 - p.y) * 0.3;
            return sourceDist + controllerDist - edgeBonus;
        });
        room.memory.bunkerHub = {x: choice.x, y: choice.y};
        log.a(`Hub at (${choice.x}, ${choice.y}) in ${room.name}`);
        return true;
    } else {
        return handleNoValidPosition(room, hubCheck);
    }

    function isValidHubPosition(pos, room, sources) {
        for (const type of bunkerTemplate) {
            for (const s of type.pos) {
                const sp = new RoomPosition(pos.x + s.x, pos.y + s.y, room.name);
                if (sp.x < 1 || sp.x > 48 || sp.y < 1 || sp.y > 48) return false;
                if (sp.checkForImpassible()) return false;
                if (sp.isNearTo(room.controller)) return false;
                if (sources.some(src => sp.isNearTo(src))) return false;
            }
        }
        return true;
    }

    function handleNoValidPosition(room, hubCheck) {
        if (hubCheck) return false;
        if (findCoreHub(room)) return true;
        log.a(room.name + ' has been abandoned due to being unable to find a suitable layout.');
        return false;
    }
}

module.exports.hubCheck = function (room) {
    return findHub(room, true)
};

module.exports.findHub = function (room) {
    return findHub(room)
};

let storedLabPos, storedLabPossibles;
function findLabHub(room) {
    if (room.memory.labHub && room.memory.labHub.x && room.memory.labHub.y) return;

    // Try to find the old spot
    const labs = room.labs;
    if (labs.length) {
        room.memory.labHub = {x: labs[0].pos.x, y: labs[0].pos.y};
        return true;
    }

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

// Places towers from the stored hub list up to the RCL-gated maximum.
// Called each build tick; only creates one site at a time.
function buildTowersFromHubs(room) {
    const hubs = room.memory.towerHubs;
    if (!hubs || !hubs.length) return false;
    const allowed = CONTROLLER_STRUCTURES[STRUCTURE_TOWER][room.controller.level];
    const current = room.towers.length +
        room.constructionSites.filter(s => s.structureType === STRUCTURE_TOWER).length;
    if (current >= allowed) return false;
    for (const {x, y} of hubs.slice(0, allowed)) {
        const pos = new RoomPosition(x, y, room.name);
        if (!pos.checkForAllStructure() && !pos.checkForConstructionSites()) {
            pos.createConstructionSite(STRUCTURE_TOWER);
            return true;
        }
    }
    return false;
}

// Scores every non-wall tile by total tower damage coverage across all exit threat points,
// selects up to 6 well-spread positions for maximum defensibility.
// Uses terrain.get() and inline Chebyshev math to avoid per-tile API calls.
// Returns an array of FIND_EXIT_* constants for sides whose neighbour is a dead-end
// (no onward exits) and not enemy-owned, so attackers can't approach from there.
function getUndefendedExits(roomName) {
    const neighbouring = Game.map.describeExits(roomName);
    const dirToFind = {'1': FIND_EXIT_TOP, '3': FIND_EXIT_RIGHT, '5': FIND_EXIT_BOTTOM, '7': FIND_EXIT_LEFT};
    const undefended = [];
    for (const dir in dirToFind) {
        const neighbour = neighbouring[dir];
        if (!neighbour) continue;
        const intel = INTEL[neighbour];
        if (intel && intel.owner && !FRIENDLIES.includes(intel.owner)) continue;
        if (Object.keys(Game.map.describeExits(neighbour) || {}).length <= 1) {
            undefended.push(dirToFind[dir]);
        }
    }
    return undefended;
}

function findTowerHub(room) {
    // Clear existing towers so we reposition from scratch
    room.towers.forEach(t => t.destroy());
    room.constructionSites.filter(s => s.structureType === STRUCTURE_TOWER).forEach(t => t.remove());

    const hubX = room.memory.bunkerHub.x, hubY = room.memory.bunkerHub.y;
    const neighboring = Game.map.describeExits(room.name);
    const dirToFind = {'1': FIND_EXIT_TOP, '3': FIND_EXIT_RIGHT, '5': FIND_EXIT_BOTTOM, '7': FIND_EXIT_LEFT};
    const undefendedExits = getUndefendedExits(room.name);

    // Sample three points per exit edge for multi-angle coverage scoring
    const threatPoints = [], allExitTiles = [];
    for (const dir in dirToFind) {
        if (!neighboring[dir]) continue;
        if (undefendedExits.includes(dirToFind[dir])) continue;
        const exits = room.find(dirToFind[dir]);
        if (!exits.length) continue;
        allExitTiles.push(...exits);
        threatPoints.push(
            exits[Math.floor(exits.length * 0.25)],
            exits[Math.floor(exits.length * 0.5)],
            exits[Math.floor(exits.length * 0.75)]
        );
    }

    if (!threatPoints.length) {
        room.memory.towerHubs = [];
        return;
    }

    // Pre-compute obstacle data for fast per-tile checks (no API calls in the inner loop)
    const terrain = Game.map.getRoomTerrain(room.name);
    const srcPos = room.sources.map(s => s.pos);
    const ctrlPos = room.controller.pos;
    const minPos = room.mineral ? room.mineral.pos : null;
    const cheby = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

    const candidates = [];
    for (let x = 4; x <= 45; x++) {
        for (let y = 4; y <= 45; y++) {
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
            const hubDist = cheby(x, y, hubX, hubY);
            if (hubDist < 6 || hubDist > 23) continue;                     // not inside core, not too far out
            if (srcPos.some(p => cheby(x, y, p.x, p.y) < 3)) continue;    // away from sources
            if (cheby(x, y, ctrlPos.x, ctrlPos.y) < 3) continue;           // away from controller
            if (minPos && cheby(x, y, minPos.x, minPos.y) < 3) continue;   // away from mineral
            const minEdge = allExitTiles.reduce((m, e) => Math.min(m, cheby(x, y, e.x, e.y)), Infinity);
            if (minEdge < 5) continue;                                      // not exposed at edge

            // Total damage across all threat entry points — rewards positions that cover every exit
            const score = threatPoints.reduce((sum, tp) => sum + determineTowerDamage(cheby(x, y, tp.x, tp.y)), 0);
            candidates.push({x, y, score});
        }
    }

    // Sort best coverage first, then greedily select up to 6 with minimum 4-tile separation
    candidates.sort((a, b) => b.score - a.score);
    const selected = [];
    for (const c of candidates) {
        if (selected.length >= 6) break;
        if (selected.every(s => cheby(c.x, c.y, s.x, s.y) >= 4)) selected.push({x: c.x, y: c.y});
    }

    room.memory.towerHubs = selected;
    // Force rampart recomputation — perimeter must now wrap the new tower positions
    ROOM_RAMPART_SPOTS[room.name] = undefined;
    log.a(`${room.name}: ${selected.length} tower hubs placed`);
}

// Helper function to check if the position is valid for a rampart
function isValidRampartPosition(position) {
    return !position.checkForWall() &&
        !position.checkForConstructionSites() &&
        !position.checkForRampart();
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

function determineTowerDamage(range) {
    if (range <= TOWER_OPTIMAL_RANGE) return TOWER_POWER_ATTACK;
    if (range < TOWER_FALLOFF_RANGE) return TOWER_POWER_ATTACK - TOWER_FALLOFF * (range - TOWER_OPTIMAL_RANGE) / (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE);
    return TOWER_POWER_ATTACK - TOWER_FALLOFF;
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
    STRUCTURE_LAB,
    STRUCTURE_CONTAINER
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

// Compact core used when the full bunker template cannot fit.
// Only the structures needed from RCL1 onward — extensions, towers, and late-game
// structures (factory, nuker, power spawn) are placed dynamically or wherever they fit.
const coreTemplate = [
    {structureType: STRUCTURE_SPAWN, pos: [{x: -1, y: -1}, {x: 0, y: -1}, {x: 1, y: -1}]},
    {structureType: STRUCTURE_OBSERVER, pos: [{x: 0, y: 0}]},
    {structureType: STRUCTURE_TERMINAL, pos: [{x: -1, y: 0}]},
    {structureType: STRUCTURE_STORAGE, pos: [{x: 1, y: 0}]},
];


function isCoreHubTileValid(pos, room) {
    if (pos.x < 1 || pos.x > 48 || pos.y < 1 || pos.y > 48) return false;
    const src = pos.findClosestByRange(FIND_SOURCES);
    return !pos.checkForImpassible() && !pos.isNearTo(room.controller) && !(src && pos.isNearTo(src));
}

// Scans every position in the room for a valid core hub, scores by source/controller proximity
function findCoreHub(room) {
    let bestPos = null, bestScore = Infinity;
    for (let x = 3; x <= 46; x++) {
        for (let y = 3; y <= 46; y++) {
            const hub = new RoomPosition(x, y, room.name);
            if (hub.checkForImpassible()) continue;
            let valid = true;
            outer: for (const entry of coreTemplate) {
                for (const {x: dx, y: dy} of entry.pos) {
                    if (!isCoreHubTileValid(new RoomPosition(x + dx, y + dy, room.name), room)) {
                        valid = false;
                        break outer;
                    }
                }
            }
            if (!valid) continue;
            const src = hub.findClosestByRange(FIND_SOURCES);
            const sourceDist = src ? hub.getRangeTo(src) * 2 : 0;
            const controllerDist = hub.getRangeTo(room.controller) * 1.5;
            const edgeBonus = Math.min(x, 49 - x, y, 49 - y) * 0.3;
            const score = sourceDist + controllerDist - edgeBonus;
            if (score < bestScore) {
                bestScore = score;
                bestPos = {x, y};
            }
        }
    }
    if (!bestPos) return false;
    room.memory.bunkerHub = bestPos;
    room.memory.dynamicLayout = true;
    log.a(`${room.name} cannot fit full bunker — using dynamic layout at (${bestPos.x}, ${bestPos.y})`);
    return true;
}

// Returns the cached extension position list, loading from Memory or generating if needed.
// Positions stored in Memory as packed integers (x + y*50) — 3× smaller than {x,y} objects.
// Module cache avoids per-tick Memory deserialization.
function getExtensionPositions(room) {
    if (extensionPositionCache[room.name]) return extensionPositionCache[room.name];
    // Warm the module cache from Memory after a global reset
    if (room.memory.dynamicExtensionsPacked) {
        extensionPositionCache[room.name] = room.memory.dynamicExtensionsPacked.map(n => ({
            x: n % 50,
            y: Math.floor(n / 50)
        }));
        return extensionPositionCache[room.name];
    }
    return generateExtensionPositions(room);
}

function generateExtensionPositions(room) {
    const hub = room.hub;
    const excluded = new Set([`${hub.x},${hub.y}`]);
    for (const entry of coreTemplate) {
        for (const {x, y} of entry.pos) excluded.add(`${hub.x + x},${hub.y + y}`);
    }
    const positions = [], visited = new Set([`${hub.x},${hub.y}`]);
    const queue = [{x: hub.x, y: hub.y}];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    while (queue.length && positions.length < 100) {
        const {x, y} = queue.shift();
        for (const [dx, dy] of dirs) {
            const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
            if (visited.has(key) || nx < 2 || nx > 47 || ny < 2 || ny > 47) continue;
            visited.add(key);
            queue.push({x: nx, y: ny});
            if (excluded.has(key)) continue;
            // Checkerboard: only use even-parity tiles so every extension is surrounded by
            // non-extension tiles on all 4 cardinal directions — guarantees no pathing blockage
            if ((nx + ny) % 2 !== 0) continue;
            const pos = new RoomPosition(nx, ny, room.name);
            if (pos.checkForWall() || pos.checkForImpassible()) continue;
            if (pos.isNearTo(room.controller)) continue;
            const src = pos.findClosestByRange(FIND_SOURCES);
            if (src && pos.isNearTo(src)) continue;
            positions.push({x: nx, y: ny});
        }
    }
    extensionPositionCache[room.name] = positions;
    room.memory.dynamicExtensionsPacked = positions.map(p => p.x + p.y * 50);
    if (room.memory.dynamicExtensions) room.memory.dynamicExtensions = undefined; // clean up old format
    log.a(`${room.name} generated ${positions.length} dynamic extension positions`);
    return positions;
}

function placeExtensionsDynamically(room) {
    const positions = getExtensionPositions(room);
    const needed = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level];
    const existing = room.extensions.length +
        room.constructionSites.filter(s => s.structureType === STRUCTURE_EXTENSION).length;
    if (existing >= needed) return false;
    for (const {x, y} of positions) {
        const result = new RoomPosition(x, y, room.name).createConstructionSite(STRUCTURE_EXTENSION);
        if (result === OK) return true;
        if (result === ERR_FULL) return false;
        if (result === ERR_RCL_NOT_ENOUGH) return false;
    }
    return false;
}