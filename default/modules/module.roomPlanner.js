/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

/**
 * Created by rober on 5/16/2017.
 */
const minCut = require('util.minCut')
let tickTracker = {};

module.exports.buildRoom = function () {
    if (!shouldRunAtAll()) return;

    let room = getNextRoom();

    tickTracker['lastTick'] = Game.time + 15;
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

    if (!room.memory.towerHubs && BETA_TOWERS) findTowerHub(room);

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
    const countCheck = bunkerTemplate.filter(s =>
        ![STRUCTURE_CONTAINER, STRUCTURE_RAMPART, STRUCTURE_WALL, STRUCTURE_ROAD].includes(s.structureType) &&
        CONTROLLER_STRUCTURES[s.structureType][level] > (existingCounts[s.structureType] || 0)
    );
    if (countCheck && countCheck.length) buildFromLayout(room, countCheck);
}

function buildAuxiliaryStructures(room) {
    let builtSpawn = room.impassibleStructures.find((s) => s.structureType === STRUCTURE_SPAWN);
    if (builtSpawn) auxiliaryBuilding(room);
}

function buildFromLayout(room, countCheck) {
    const initialSpawn = _.find(Game.structures, s => s.structureType === STRUCTURE_SPAWN && s.my);
    const roomTower = room.structures.find(s => s.structureType === STRUCTURE_TOWER && s.my);
    let filter = [];

    if (!initialSpawn) {
        filter = bunkerTemplate.filter(s => s.structureType === STRUCTURE_SPAWN);
    } else if (TOWER_FIRST && !roomTower && MY_ROOMS.length > 1) {
        filter = bunkerTemplate.filter(s => s.structureType === STRUCTURE_TOWER);
    } else {
        filter = countCheck.filter(s => CONTROLLER_STRUCTURES[s.structureType][room.controller.level]);
    }

    if (filter.length) {
        const hub = room.hub;
        for (const structure of filter) {
            if (shouldSkipStructure(room, structure)) continue;
            for (const buildPos of structure.pos) {
                const pos = new RoomPosition(hub.x + buildPos.x, hub.y + buildPos.y, room.name);
                if (!pos.checkForConstructionSites() && !pos.checkForAllStructure()) {
                    pos.createConstructionSite(structure.structureType);
                }
            }
        }
    }
}

// Helper function to determine if a structure should be skipped
function shouldSkipStructure(room, structure) {
    return room.controller.level !== room.level &&
        ![STRUCTURE_EXTENSION, STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_TERMINAL].includes(structure.structureType);
}

function auxiliaryBuilding(room) {
    // Initialize layout from the bunker template
    let layout = bunkerTemplate;

    // Build necessary structures for sources, controller, ramparts, roads, etc.
    if (sourceBuilder(room)) return;
    if (controllerBuilder(room)) return;
    if (rampartBuilder(room, layout)) return;

    // Handle hub and lab constructions
    if (room.storage) {
        if (buildRoads(room, layout)) return;
        if (room.level >= 5) {
            if (hubLink(room)) return true;
            if (room.level >= 6) {
                mineralBuilder(room);
                labBuilder(room);
            }
        }
    } else {
        INTEL[room.name].roadsBuilt = undefined;
    }

    // Perform cleanup tasks
    performCleanup(room);

    // Helper function to build roads and manage their construction
    function buildRoads(room, layout) {
        if (room.level >= ROAD_LEVEL && room.constructionSites.filter((s) => s.structureType === STRUCTURE_ROAD).length < 3 && !roadBuilder(room, layout)) {
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

function hubLink(room) {
    // If the hub link already exists in memory, return early
    if ((room.memory.hubLink && Game.getObjectById(room.memory.hubLink)) || room.level < 7) {
        return false;
    }

    // Clear hubLink memory if the link is not found or doesn't exist
    room.memory.hubLink = undefined;

    // Define the position of the potential hub link (one position below the hub)
    let hubLinkPos = new RoomPosition(room.hub.x, room.hub.y + 1, room.name);

    // Check for existing structures at the hubLinkPos
    const hubLink = hubLinkPos.checkForAllStructure();
    // If a link is found, update the room's memory and return true
    if (hubLink) {
        room.memory.hubLink = hubLink.id;
        return true;
    } else {
        if (hubLinkPos.createConstructionSite(STRUCTURE_LINK) === OK) return true;
    }

    // Return false if no valid hub link was found
    return false;
}

function sourceBuilder(room) {
    if (room.controller.level >= 3) {
        for (let source of room.sources) {
            if (buildSourceContainer(source, room)) return true;
            if (buildSourceLink(source, room)) return true;
        }
    }

    // Helper function to handle the creation of source containers
    function buildSourceContainer(source, room) {
        let sourceContainer = Game.getObjectById(source.memory.containerID) || _.find(source.pos.findInRange(room.structures, 1), (s) => s.structureType === STRUCTURE_CONTAINER);
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

    // Helper function to handle the creation of source links
    function buildSourceLink(source, room) {
        const sourceContainer = Game.getObjectById(source.memory.container);
        if (sourceContainer && (Game.getObjectById(room.memory.controllerLink) || Game.getObjectById(room.memory.hubLink))) {
            let sourceLink = _.find(sourceContainer.pos.findInRange(room.impassibleStructures, 1), (s) => s.structureType === STRUCTURE_LINK);
            let sourceBuild = _.find(sourceContainer.pos.findInRange(FIND_CONSTRUCTION_SITES, 1), (s) => s.structureType === STRUCTURE_LINK);
            // If no link exists and there is space to build, create one
            if (!sourceLink && !sourceBuild && sourceContainer.pos.countOpenTerrainAround()) {
                clearOldLink(source);
                if (createSourceLink(source, sourceContainer)) return true;
            } else if (sourceLink) {
                source.memory.link = sourceLink.id;
            }
        }
    }

    // Helper function to clear old source links
    function clearOldLink(source) {
        if (source.memory.link && Game.getObjectById(source.memory.link)) {
            const oldLink = Game.getObjectById(source.memory.link);
            const oldRampart = oldLink.pos.checkForRampart();
            if (oldRampart) oldRampart.destroy();
            oldLink.destroy();
            log.e('Cleared incorrect source link in ' + roomLink(source.room.name), "ROOM PLANNER:");
        }
        source.memory.link = undefined;
    }

    // Helper function to create a new source link
    function createSourceLink(source, sourceContainer) {
        let zoneTerrain = source.room.lookForAtArea(LOOK_TERRAIN, sourceContainer.pos.y - 1, sourceContainer.pos.x - 1, sourceContainer.pos.y + 1, sourceContainer.pos.x + 1, true);
        const controllerContainer = Game.getObjectById(room.memory.controllerContainer);
        for (let key in zoneTerrain) {
            let position = new RoomPosition(zoneTerrain[key].x, zoneTerrain[key].y, source.room.name);
            if (position.checkForWall() || position.checkForAllStructure() || position.isNearTo(controllerContainer) || position.checkIfOutOfBounds()) continue;
            if (position.createConstructionSite(STRUCTURE_LINK) === OK) return true;
            break;
        }
    }
}

function controllerBuilder(room) {
    let controllerContainer = Game.getObjectById(room.memory.controllerContainer);
    if (!controllerContainer && room.controller.level >= 2) {
        controllerContainer = room.controller.pos.findInRange(room.structures, 3, {
            filter: (s) => s.structureType === STRUCTURE_CONTAINER &&
                !s.pos.isNearTo(s.pos.findClosestByRange(FIND_SOURCES)) &&
                !s.pos.isNearTo(s.pos.findClosestByRange(FIND_MINERALS))
        })[0];
        if (!controllerContainer) {
            let controllerBuild = room.controller.pos.findInRange(FIND_CONSTRUCTION_SITES, 3, {
                filter: (s) => s.structureType === STRUCTURE_CONTAINER
            })[0];
            if (!controllerBuild) {
                let possibles = [];
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
                let closestPos = getClosestPosition(possibles, room.hub);
                if (closestPos) {
                    if (closestPos.createConstructionSite(STRUCTURE_CONTAINER) === OK) return true;
                }
            }
        } else {
            room.memory.controllerContainer = controllerContainer.id;
        }
    }

    if (controllerContainer && !room.memory.controllerLink && room.controller.level >= 5) {
        let controllerLink = _.find(controllerContainer.pos.findInRange(room.impassibleStructures, 1), (s) => s.structureType === STRUCTURE_LINK);

        if (!controllerLink) {
            let zoneTerrain = room.lookForAtArea(LOOK_TERRAIN, controllerContainer.pos.y - 1, controllerContainer.pos.x - 1,
                controllerContainer.pos.y + 1, controllerContainer.pos.x + 1, true);

            for (let key in zoneTerrain) {
                if (_.find(controllerContainer.pos.findInRange(FIND_CONSTRUCTION_SITES, 1), (s) => s.structureType === STRUCTURE_LINK)) break;
                let position = new RoomPosition(zoneTerrain[key].x, zoneTerrain[key].y, room.name);
                if (position.checkForAllStructure() || position.checkForImpassible() || position.isNearTo(room.controller)) continue;
                if (position.createConstructionSite(STRUCTURE_LINK) === OK) return true;
                break;
            }
        } else {
            room.memory.controllerLink = controllerLink.id;
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

function rampartBuilder(room, layout = undefined, count = false) {
    // Clean old ramparts
    if (Memory.rampartVersion !== RAMPART_VERSION) {
        Memory.rampartVersion = RAMPART_VERSION;
        MY_ROOMS.forEach((r) => Game.rooms[r].structures.filter((s) => s.structureType === STRUCTURE_RAMPART || (s.structureType === STRUCTURE_ROAD && s.pos.checkForRampart())).forEach((q) => q.destroy()));
        for (const i in Game.constructionSites) Game.constructionSites[i].remove();
    }

    // Bunker
    if (room.level >= BUNKER_LEVEL && handleBunkerRamparts(room, layout, count)) {
        return true;
    }

    // Handle protective ramparts
    if (room.level >= SPECIAL_RAMPARTS && buildProtectiveRamparts(room)) {
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
        const ramparts = JSON.parse(ROOM_RAMPART_SPOTS[room.name]);
        if (!ramparts || !ramparts.length) return false;
        let counter = 0;
        const rampartPositions = ramparts.map(p => new RoomPosition(p.x, p.y, room.name));
        const vulnerableStructures = room.structures.filter((s) => !s.pos.checkForRampart());
        for (const structure of vulnerableStructures) {
            if (counter >= 3) return true;
            const rangeFromRampart = structure.pos.getRangeTo(structure.pos.findClosestByRange(rampartPositions));
            if (rangeFromRampart <= 2 && structure.pos.isInBunker()) {
                if (structure.pos.createConstructionSite(STRUCTURE_RAMPART) === OK) counter++;
            }
        }
        if (PROTECT_SOURCES) {
            for (let source of room.sources) {
                buildRampartAround(source.pos);
            }
        }
        if (PROTECT_MINERAL) buildRampartAround(room.mineral.pos);
        if (PROTECT_CONTROLLER) buildRampartAround(room.controller.pos);
        // Handle ramparts on protected structures
        if (PROTECT_STRUCTURES) {
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
        let existingRamparts = _.filter(room.structures, (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART);
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
    let spawn = _.find(room.impassibleStructures, (s) => s.structureType === STRUCTURE_SPAWN);
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
    if (room.level >= 6 && buildMineralAndLabRoads(room)) return true;

    // RCL 7+ we build rampart roads
    if (room.level >= BUNKER_LEVEL && buildRoadsForRamparts(room)) return true;

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
        // Flatten the positions using `map` followed by `concat`
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
        const towers = room.structures.filter((s) => s.structureType === STRUCTURE_TOWER);
        const spawn = _.find(room.impassibleStructures.filter(s => s.structureType === STRUCTURE_SPAWN));
        for (const tower of towers) {
            if (buildRoadFromTo(room, spawn, tower)) return true;
        }
        return false;
    }

    function buildMineralAndLabRoads(room) {
        let container = Game.getObjectById(room.memory.extractorContainer);
        let spawn = _.find(room.impassibleStructures.filter(s => s.structureType === STRUCTURE_SPAWN));
        if (container && spawn && buildRoadFromTo(room, spawn, container)) return true;
        let labs = room.impassibleStructures.filter(s => s.structureType === STRUCTURE_LAB);
        if (labs.length) {
            let hub = new RoomPosition(room.memory.bunkerHub.x, room.memory.bunkerHub.y, room.name);
            for (let lab of labs) {
                if (buildRoadFromTo(room, lab, hub)) return true;
            }
        }
        return false;
    }

    function buildRoadsForRamparts(room) {
        let ramparts = room.structures.filter((s) => s.structureType === STRUCTURE_RAMPART && !s.pos.checkForObstacleStructure() && !s.pos.checkForRoad());
        let buildCounter = 0;
        // Build roads on ramparts
        for (const rampart of ramparts) {
            if (buildCounter >= 4) return true;
            if (buildRoad(rampart.pos)) buildCounter++
        }
        // Build roads from ramparts to hub
        const spawn = _.find(room.impassibleStructures.filter(s => s.structureType === STRUCTURE_SPAWN));
        ramparts = room.structures.filter((s) => s.structureType === STRUCTURE_RAMPART && s.pos.checkForRoad());
        for (const rampart of ramparts) {
            if (buildCounter >= 4) return true;
            if (buildRoadFromTo(room, rampart, spawn)) buildCounter++
        }
        return false;
    }

    function buildRoadFromTo(room, start, end) {
        let target, begin;
        if (start instanceof RoomPosition) begin = start; else begin = start.pos;
        if (end instanceof RoomPosition) target = end; else target = end.pos;
        let path = getRoad(room, begin, target);
        if (!path) {
            path = PathFinder.search(begin, {pos: target, range: 1}, {
                heuristicWeight: 0.8,
                roomCallback: function (roomName) {
                    return buildCostMatrix(roomName);
                }
            }).path;
            if (path.length) {
                cacheRoad(room, begin, target, path);
                for (let point of path) {
                    let pos = new RoomPosition(point.x, point.y, room.name);
                    if (buildRoad(pos)) return true;
                }
            } else {
                return false;
            }
        } else {
            for (let point of JSON.parse(path)) {
                let pos = new RoomPosition(point.x, point.y, room.name);
                if (buildRoad(pos)) return true;
            }
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
                    costMatrix.set(x, y, 45);
                } else {
                    costMatrix.set(x, y, 10);
                }
            }
        }
        let room = Game.rooms[roomName];
        if (room) {
            room.find(FIND_STRUCTURES).forEach(structure => {
                if (structure.structureType === STRUCTURE_ROAD) {
                    costMatrix.set(structure.pos.x, structure.pos.y, 1);
                } else if (structure.structureType === STRUCTURE_CONTAINER) {
                    costMatrix.set(structure.pos.x, structure.pos.y, 15);
                } else if (_.includes(OBSTACLE_OBJECT_TYPES, structure.structureType)) {
                    costMatrix.set(structure.pos.x, structure.pos.y, Infinity);
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
}

function labBuilder(room) {
    // Check the current number of built labs
    let builtLabs = _.filter(room.impassibleStructures, (s) => s.structureType === STRUCTURE_LAB).length;

    // Check if there's already a construction site for labs
    let labInBuild = _.find(room.constructionSites, (s) => s.structureType === STRUCTURE_LAB);

    // If the required number of labs are built, or there's already a construction site, skip further building
    if (CONTROLLER_STRUCTURES[STRUCTURE_LAB][room.controller.level] <= builtLabs || labInBuild) return;

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
    let extractor = _.find(room.structures, (s) => s.structureType === STRUCTURE_EXTRACTOR);

    if (extractor) {
        let extractorContainer = _.find(extractor.pos.findInRange(room.structures, 1), (s) => s.structureType === STRUCTURE_CONTAINER);
        if (!extractorContainer) {
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

let storedPos = {};
let storedPossibles = {};
function findHub(room, hubCheck = undefined) {
    if (room.controller.owner && room.controller.owner.username === MY_USERNAME && room.memory.bunkerHub && room.memory.bunkerHub.x && room.memory.bunkerHub.y) {
        return true;
    }

    // Destroy all non-ally structures
    if (room.structures.length) {
        _.forEach(room.structures, (s) => {
            if (!s.owner || s.owner.username !== MY_USERNAME) {
                s.destroy();
            }
        });
    }

    let spawns = _.filter(room.impassibleStructures, (s) => s.my && s.structureType === STRUCTURE_SPAWN && s.name !== 'auto');
    let foundOldHub = false;
    // Try to find the old spot
    if (room.terminal) {
        room.memory.bunkerHub = {x: room.terminal.pos.x + 1, y: room.terminal.pos.y};
        foundOldHub = true;
    } else if (room.storage) {
        room.memory.bunkerHub = {x: room.storage.pos.x - 1, y: room.storage.pos.y};
        foundOldHub = true;
    } else if (spawns.length) {
        room.memory.bunkerHub = {x: spawns[0].pos.x + 1, y: spawns[0].pos.y + 1};
        foundOldHub = true;
    }
    if (foundOldHub) {
        log.a('Bunker Hub search complete for ' + room.name + '...');
        log.a('Using existing spawn as hub.');
        return true;
    }

    // Initialize stored data for positions if not set
    if (!storedPos[room.name]) storedPos[room.name] = {x: 9, y: 10};
    if (!storedPossibles[room.name]) storedPossibles[room.name] = {};

    let x = storedPos[room.name].x;
    let y = storedPos[room.name].y;
    let complete = false;
    let possiblePos = storedPossibles[room.name];
    let posCount = 0;

    // Loop to search for a suitable hub position
    primary:
        for (let i = 1; i < 1000; i++) {
            x++;
            if (x > 40 && y >= 40) {
                complete = true;
                break;
            } else if (x > 40) {
                x = 10;
                y++;
            }

            storedPos[room.name] = {x, y};
            let pos = new RoomPosition(x, y, room.name);

            if (pos.checkForImpassible()) continue;

            // Validate the position against all possible bunker layout positions
            if (!isValidHubPosition(pos, room)) continue primary;

            if (hubCheck) return true;  // Early exit for specific checks

            possiblePos[posCount++] = {x: pos.x, y: pos.y};
            storedPossibles[room.name] = possiblePos;
        }

    if (complete) {
        if (_.size(possiblePos)) {
            log.a('Bunker Hub search complete for ' + room.name + '...');
            log.a('Final possible count: ' + _.size(possiblePos));
            let choice = _.sample(possiblePos);
            room.memory.bunkerHub = {x: choice.x, y: choice.y};
            storedPos[room.name] = undefined;
            storedPossibles[room.name] = undefined;
            return true;
        } else {
            handleNoValidPosition(room, hubCheck);
        }
    } else {
        if (hubCheck) return false;
        log.a('Bunker Hub search incomplete for ' + room.name + ', continuing next tick.');
        log.a('Current position: ' + storedPos[room.name].x + ',' + storedPos[room.name].y);
        log.a('Current possible count: ' + _.size(possiblePos));
    }

    return false;

    function isValidHubPosition(pos, room) {
        for (let type of bunkerTemplate) {
            for (let s of type.pos) {
                let structurePos = new RoomPosition(pos.x + s.x, pos.y + s.y, room.name);
                if (isOutOfBounds(structurePos) || !isPositionValidForHub(structurePos, room)) {
                    return false;
                }
            }
        }
        return true;
    }

    function isOutOfBounds(pos) {
        return pos.x > 49 || pos.x < 1 || pos.y > 49 || pos.y < 1;
    }

    function isPositionValidForHub(pos, room) {
        let closestSource = pos.findClosestByRange(FIND_SOURCES);
        return !(pos.checkIfOutOfBounds() || pos.isNearTo(room.controller) || pos.isNearTo(closestSource) || pos.checkForImpassible());
    }

    function handleNoValidPosition(room, hubCheck) {
        if (hubCheck) return undefined;
        //abandonRoom(room);
        storedPos[room.name] = undefined;
        storedPossibles[room.name] = undefined;
        return log.a(room.name + ' has been abandoned due to being unable to find a suitable layout.');
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
    const labs = _.filter(room.impassibleStructures, (s) => s.my && s.structureType === STRUCTURE_LAB);
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

function findTowerHub(room) {
    room.memory.towerHubs = [];
    const towers = room.structures.filter((s) => s.structureType === STRUCTURE_TOWER);
    towers.forEach((t) => t.destroy())
    const towerSites = room.constructionSites.filter((s) => s.structureType === STRUCTURE_TOWER);
    towerSites.forEach((t) => t.remove())
    // Get and store all the exit tiles
    const exitTiles = [];
    const neighboring = Game.map.describeExits(room.name);
    let directionToExit = {'1': FIND_EXIT_TOP, '3': FIND_EXIT_RIGHT, '5': FIND_EXIT_BOTTOM, '7': FIND_EXIT_LEFT};
    for (let direction in directionToExit) {
        if (neighboring[direction]) {
            let exits = room.find(directionToExit[direction]);
            let middle = Math.floor(exits.length / 2);
            exitTiles.push(exits[middle])
        }
    }
    // Find the spot that deal the most damage with space around it
    const hub = new RoomPosition(room.memory.bunkerHub.x, room.memory.bunkerHub.y, room.name);
    const labHub = new RoomPosition(room.memory.labHub.x, room.memory.labHub.y, room.name);
    let topDamage = {};
    let topPos = {};
    for (const exit of exitTiles) {
        topDamage[exit.x + '.' + exit.y] = 0;
        topPos[exit.x + '.' + exit.y] = undefined;
        let damage = 0;
        const exitPos = new RoomPosition(exit.x, exit.y, room.name);
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                // Set and check
                const pos = new RoomPosition(x, y, room.name);
                if (pos.checkForWall() || pos.getRangeTo(pos.findClosestByRange(FIND_SOURCES)) < 4 || pos.getRangeTo(room.mineral) < 4
                    || pos.getRangeTo(room.controller) < 4 || pos.getRangeTo(pos.findClosestByRange(FIND_EXIT)) < 7 || pos.countOpenTerrainAround() < (8 / exitTiles.length)) continue;
                damage = determineTowerDamage(exitPos.getRangeTo(pos));
                if (damage > topDamage[exit.x + '.' + exit.y]) {
                    topDamage[exit.x + '.' + exit.y] = damage;
                    topPos[exit.x + '.' + exit.y] = pos;
                }
            }
        }
        if (topPos[exit.x + '.' + exit.y].getRangeTo(hub) < 9 || topPos[exit.x + '.' + exit.y].getRangeTo(labHub) < 6) {
            return room.memory.towerHubs = [];
        } else {
            room.memory.towerHubs.push({x: topPos[exit.x + '.' + exit.y].x, y: topPos[exit.x + '.' + exit.y].y});
        }
    }
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
    if (range <= 5) {
        return 600;
    } else if (range < 20) {
        return 600 - 450 * (range - 5) / 15;
    } else {
        return 150;
    }
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