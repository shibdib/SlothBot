/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

/**
 * Created by rober on 5/16/2017.
 */
const minCut = require('util.minCut');
let rampartSpots = {};
let tickTracker = {};

module.exports.buildRoom = function (room) {
    // Check if this module has run yet this tick
    if (!shouldRunAtAll()) return;

    let lastRun = tickTracker[room.name] || {};

    // Ensure the room has a bunker hub
    if (room.memory.bunkerHub && room.memory.bunkerHub.x) {
        // Check if bunker layout needs to be built
        if (shouldRunLayout(lastRun)) {
            buildMissingStructures(room);
            lastRun.layout = Game.time + _.random(50, 100);
            tickTracker['last'] = Game.time + 5;
        }
        // Check if auxiliary buildings need to be built
        else if (shouldRunAuxiliary(lastRun)) {
            buildAuxiliaryStructures(room);
            lastRun.auxiliary = Game.time + _.random(50, 100);
            tickTracker['last'] = Game.time + 5;
        }
    } else {
        // Find hub if not already found
        findHub(room);
        tickTracker['last'] = Game.time + 5;
    }

    // Update tick tracker
    tickTracker[room.name] = lastRun;
};

// Helper functions
function shouldRunAtAll() {
    let overallLastRun = tickTracker['last'] || 0;
    return overallLastRun < Game.time;
}

function shouldRunLayout(lastRun) {
    return (lastRun.layout || 0) < Game.time;
}

function shouldRunAuxiliary(lastRun) {
    return (lastRun.auxiliary || 0) < Game.time;
}

function buildMissingStructures(room) {
    let countCheck = _.filter(bunkerTemplate, (s) =>
        ![STRUCTURE_CONTAINER, STRUCTURE_RAMPART, STRUCTURE_WALL, STRUCTURE_ROAD].includes(s.structureType) &&
        CONTROLLER_STRUCTURES[s.structureType][room.controller.level] > countExistingStructures(room, s.structureType)
    );
    if (countCheck.length) {
        buildFromLayout(room, countCheck);
    }
}

function countExistingStructures(room, structureType) {
    return _.filter(room.structures, (s) => s.structureType === structureType).length +
        _.filter(room.constructionSites, (s) => s.structureType === structureType).length;
}

function buildAuxiliaryStructures(room) {
    let builtSpawn = _.find(room.impassibleStructures, (s) => s.structureType === STRUCTURE_SPAWN);
    if (builtSpawn) auxiliaryBuilding(room);
}

function buildFromLayout(room, countCheck) {
    let filter = [];

    // Check if initial spawn is present
    let builtSpawn = _.find(room.impassibleStructures, (s) => s.structureType === STRUCTURE_SPAWN);
    let builtTower = _.find(room.impassibleStructures, (s) => s.structureType === STRUCTURE_TOWER);
    let initialSpawn = _.find(Game.structures, (s) => s.structureType === STRUCTURE_SPAWN && s.my);

    // Determine which structures to build based on conditions
    if (!initialSpawn) {
        // No initial spawn: prioritize spawn structure
        filter = _.filter(bunkerTemplate, (s) => s.structureType === STRUCTURE_SPAWN);
    } else if (TOWER_FIRST && !builtSpawn && !builtTower && initialSpawn) {
        // If towers should be built first: prioritize tower
        filter = _.filter(countCheck, (s) => s.structureType === STRUCTURE_TOWER);
    } else {
        // Build other structures based on controller level
        filter = _.filter(countCheck, (s) => CONTROLLER_STRUCTURES[s.structureType][room.controller.level]);
    }

    if (filter.length) {
        for (let structure of filter) {
            // Only build certain structures based on controller level and priorities
            if (shouldSkipStructure(room, structure)) continue;

            // Build each structure in the designated positions
            for (let buildPos of structure.pos) {
                let pos = new RoomPosition(room.hub.x + buildPos.x, room.hub.y + buildPos.y, room.name);
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
    sourceBuilder(room);
    controllerBuilder(room);
    rampartBuilder(room, layout);
    buildRoads(room, layout);

    // Handle hub and lab constructions
    if (room.storage) {
        if (room.level >= 5) {
            hubLink(room);
            if (room.level >= 6) {
                labBuilder(room);
                mineralBuilder(room);
            }
        }
    } else {
        INTEL[room.name].roadsBuilt = undefined;
    }

    // Perform cleanup tasks
    performCleanup(room);

    // Helper function to build roads and manage their construction
    function buildRoads(room, layout) {
        if (room.level >= 3 && _.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_ROAD).length < 3 && !roadBuilder(room, layout)) {
            INTEL[room.name].roadsBuilt = true;
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
    if (room.memory.hubLink && Game.getObjectById(room.memory.hubLink)) {
        return true;
    }

    // Clear hubLink memory if the link is not found or doesn't exist
    room.memory.hubLink = undefined;

    // Define the position of the potential hub link (one position below the hub)
    let hubLinkPos = new RoomPosition(room.hub.x, room.hub.y + 1, room.name);

    // Check for existing structures at the hubLinkPos
    let structuresAtPos = hubLinkPos.checkForAllStructure();
    if (structuresAtPos.length) {
        // Look for the link structure in the found structures
        let hubLink = _.find(structuresAtPos, (s) => s.structureType === STRUCTURE_LINK);

        // If a link is found, update the room's memory and return true
        if (hubLink) {
            room.memory.hubLink = hubLink.id;
            return true;
        }
    }

    // Return false if no valid hub link was found
    return false;
}

function controllerBuilder(room) {
    let controllerContainer = Game.getObjectById(room.memory.controllerContainer);

    // Step 1: Build a container near the controller if it doesn't exist
    if (!controllerContainer && room.controller.level >= 2) {
        controllerContainer = room.controller.pos.findInRange(room.structures, 3, {
            filter: (s) => s.structureType === STRUCTURE_CONTAINER &&
                !s.pos.isNearTo(s.pos.findClosestByRange(FIND_SOURCES)) &&
                !s.pos.isNearTo(s.pos.findClosestByRange(FIND_MINERALS))
        })[0];

        // If no container found, create a new one
        if (!controllerContainer) {
            let controllerBuild = room.controller.pos.findInRange(FIND_CONSTRUCTION_SITES, 3, {
                filter: (s) => s.structureType === STRUCTURE_CONTAINER
            })[0];

            // If no construction site exists, choose the best position and create a new construction site
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

                // Find the closest position to the hub and create the container construction site
                let closestPos = getClosestPosition(possibles, room.hub);
                if (closestPos) {
                    closestPos.createConstructionSite(STRUCTURE_CONTAINER);
                }
            }
        } else {
            room.memory.controllerContainer = controllerContainer.id;
        }
    }

    // Step 2: Build a link near the container if conditions are met (controller level 7+)
    if (controllerContainer && !room.memory.controllerLink && room.controller.level >= 7) {
        let controllerLink = _.find(controllerContainer.pos.findInRange(room.impassibleStructures, 1), (s) => s.structureType === STRUCTURE_LINK);

        if (!controllerLink) {
            let zoneTerrain = room.lookForAtArea(LOOK_TERRAIN, controllerContainer.pos.y - 1, controllerContainer.pos.x - 1,
                controllerContainer.pos.y + 1, controllerContainer.pos.x + 1, true);

            for (let key in zoneTerrain) {
                if (_.find(controllerContainer.pos.findInRange(FIND_CONSTRUCTION_SITES, 1), (s) => s.structureType === STRUCTURE_LINK)) break;
                let position = new RoomPosition(zoneTerrain[key].x, zoneTerrain[key].y, room.name);
                if (position.checkForAllStructure() || position.checkForImpassible() || position.isNearTo(room.controller)) continue;
                position.createConstructionSite(STRUCTURE_LINK);
                break;
            }
        } else {
            room.memory.controllerLink = controllerLink.id;
        }
    }

    // Helper function to get the closest position to the hub
    function getClosestPosition(positions, hub) {
        let closestPos = null;
        let closestRange = Infinity;
        for (let pos of positions) {
            pos = new RoomPosition(pos.x, pos.y, room.name);
            const range = pos.getRangeTo(hub);
            if (range < closestRange) {
                closestPos = pos;
                closestRange = range;
            }
        }
        return closestPos;
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

function sourceBuilder(room) {
    if (room.controller.level >= 2) {
        for (let source of room.sources) {
            buildSourceContainer(source, room);
            buildSourceLink(source, room);
        }
    }

    // Helper function to handle the creation of source containers
    function buildSourceContainer(source, room) {
        let sourceContainer = Game.getObjectById(source.memory.containerID) || _.find(source.pos.findInRange(room.structures, 1), (s) => s.structureType === STRUCTURE_CONTAINER);

        // If no container exists, create one
        if (!sourceContainer) {
            source.memory.container = undefined;
            let sourceBuild = _.find(source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1), (s) => s.structureType === STRUCTURE_CONTAINER);

            if (!sourceBuild) {
                let containerSite = findBestContainerPos(source);
                if (containerSite && !containerSite.checkForConstructionSites()) {
                    containerSite.createConstructionSite(STRUCTURE_CONTAINER);
                }
            }
        } else {
            // Store distance for shuttles if not already stored
            if (!source.memory.distanceToHub) {
                source.memory.distanceToHub = source.pos.findPathTo(room.hub).length;
            }
            source.memory.container = sourceContainer.id;
        }
    }

    // Helper function to handle the creation of source links
    function buildSourceLink(source, room) {
        let sourceContainer = Game.getObjectById(source.memory.container);

        if (sourceContainer && Game.getObjectById(room.memory.hubLink)) {
            let sourceLink = _.find(sourceContainer.pos.findInRange(room.impassibleStructures, 1), (s) => s.structureType === STRUCTURE_LINK);

            // If no link exists and there is space to build, create one
            if (!sourceLink && sourceContainer.pos.countOpenTerrainAround() > 1) {
                clearOldLink(source);
                createSourceLink(source, sourceContainer);
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
        for (let key in zoneTerrain) {
            let position = new RoomPosition(zoneTerrain[key].x, zoneTerrain[key].y, source.room.name);
            if (position.checkForWall() || position.checkForAllStructure() || position.getRangeTo(source.room.controller) < 3) continue;
            position.createConstructionSite(STRUCTURE_LINK);
            break;
        }
    }
}

function labBuilder(room) {
    // If no lab hub is set, find and assign one
    if (!room.memory.labHub) return findLabHub(room);

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

        // Check if there is a wall in the way and destroy it if needed
        if (pos.checkForBuiltWall()) {
            pos.checkForBuiltWall().destroy();
        } else if (!pos.checkForConstructionSites() && !pos.checkForAllStructure()) {
            // Only create a construction site if the position is free and no construction site exists
            pos.createConstructionSite(STRUCTURE_LAB);
        }
    }
}

function roadBuilder(room, layout) {
    let spawn = _.find(room.impassibleStructures, (s) => s.structureType === STRUCTURE_SPAWN);
    if (!spawn) return false;

    // Try to build road from spawn to source containers
    let sourceContainers = room.sources.map(source => Game.getObjectById(source.memory.container)).filter(container => container);
    for (let container of sourceContainers) {
        if (buildRoadFromTo(room, spawn, container)) {
            return true;
        }
    }

    // Try to build road from spawn to controller container
    let controllerContainer = Game.getObjectById(room.memory.controllerContainer);
    if (controllerContainer && buildRoadFromTo(room, spawn, controllerContainer)) {
        return true;
    }

    // Try to build road to neighboring exits
    if (buildRoadToNeighborExits(spawn, room)) return true;

    // Try to build roads based on bunker layout
    if (buildBunkerRoads(room, layout)) return true;

    // Try to build roads for minerals, harvesters, and labs if room level is 6 or higher
    return room.level >= 6 && buildMineralAndLabRoads(room);

    // Helper function to build roads to neighboring exits
    function buildRoadToNeighborExits(spawn, room) {
        let neighboring = Game.map.describeExits(spawn.pos.roomName);
        if (!neighboring) return false;

        // Predefine direction to exit mapping
        let directionToExit = {
            '1': FIND_EXIT_TOP,
            '3': FIND_EXIT_RIGHT,
            '5': FIND_EXIT_BOTTOM,
            '7': FIND_EXIT_LEFT
        };

        // Iterate over the possible directions
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

    // Helper function to build bunker roads based on layout
    function buildBunkerRoads(room, layout) {
        let roadStructures = _.filter(layout, (s) => s.structureType === STRUCTURE_ROAD);
        // Flatten the positions using `map` followed by `concat`
        let allPositions = [].concat(...roadStructures.map(s => s.pos));

        for (let structure of allPositions) {
            let pos = new RoomPosition(room.hub.x + structure.x, room.hub.y + structure.y, room.name);
            if (shouldBuildRoad(pos)) {
                if (pos.createConstructionSite(STRUCTURE_ROAD) === OK) {
                    return true;
                }
            }
        }
        return false;
    }

    // Helper function to check if a road should be built at a position
    function shouldBuildRoad(pos) {
        return !pos.checkForRoad() && !pos.checkForConstructionSites() && !pos.checkForImpassible() && !pos.checkForWall();
    }

    // Helper function to build roads for minerals, harvesters, and labs if room level is 6 or higher
    function buildMineralAndLabRoads(room) {
        let container = Game.getObjectById(room.memory.extractorContainer);
        let spawn = _.sample(room.impassibleStructures.filter(s => s.structureType === STRUCTURE_SPAWN));
        if (container && spawn && buildRoadFromTo(room, spawn, container)) return true;

        let labs = room.impassibleStructures.filter(s => s.structureType === STRUCTURE_LAB);
        if (labs.length) {
            let hub = new RoomPosition(room.memory.bunkerHub.x, room.memory.bunkerHub.y, room.name);
            for (let lab of labs) {
                if (buildRoadAround(room, lab.pos)) return true;
                if (buildRoadFromTo(room, lab, hub)) return true;
            }
        }

        return false;
    }
}

function rampartBuilder(room, layout = undefined, count = false) {
    // Build ramparts around sources, mineral, controller
    if (room.level >= SPECIAL_RAMPARTS) {
        buildProtectedRamparts(room);
    }

    // Handle bunker wall placement when room level is sufficient
    if (room.level >= BUNKER_LEVEL) {
        handleBunkerRamparts(room, layout, count);
    }

    function buildProtectedRamparts(room) {
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
                if (protectedStructureTypes.includes(structure.structureType)) {
                    if (!structure.pos.checkForRampart() && !structure.pos.checkForConstructionSites()) {
                        structure.pos.createConstructionSite(STRUCTURE_RAMPART);
                    }
                }
            }
        }
    }

    function handleBunkerRamparts(room, layout, count) {
        if (!rampartSpots[room.name]) {
            initializeRampartSpots(room, layout, count);
        } else {
            placeRamparts(room, count);
        }
    }

    function initializeRampartSpots(room, layout, count) {
        rampartSpots[room.name] = undefined;
        let rectArray = getProtectedAreaBounds(layout, room);
        let bounds = {x1: 0, y1: 0, x2: 49, y2: 49};

        // Clean up boundaries
        adjustBoundaries(rectArray);

        try {
            rampartSpots[room.name] = JSON.stringify(minCut.GetCutTiles(room.name, rectArray, bounds));
        } catch (e) {
            log.e('MinCut Error in room ' + room.name);
            log.e(e.stack);
        }

        // Count ramparts if requested
        if (count && rampartSpots[room.name]) {
            return _.size(JSON.parse(rampartSpots[room.name]));
        }
    }

    function getProtectedAreaBounds(layout, room) {
        let rectArray = [];
        for (let structure of layout) {
            for (let buildPos of structure.pos) {
                rectArray.push({
                    x1: (buildPos.x + room.hub.x) - 3,
                    y1: (buildPos.y + room.hub.y) - 3,
                    x2: (buildPos.x + room.hub.x) + 3,
                    y2: (buildPos.y + room.hub.y) + 3
                });
            }
        }
        return rectArray;
    }

    function adjustBoundaries(rectArray) {
        for (let key in rectArray) {
            let rect = rectArray[key];
            rect.x1 = Math.max(rect.x1, 2);
            rect.y1 = Math.max(rect.y1, 2);
            rect.x2 = Math.min(rect.x2, 47);
            rect.y2 = Math.min(rect.y2, 47);
        }
    }

    function placeRamparts(room, count) {
        let spots = JSON.parse(rampartSpots[room.name]);
        if (!spots || !spots.length) {
            addExistingRampartsToSpots(room, spots);
        }

        let buildPositions = spots.map(p => new RoomPosition(p.x, p.y, room.name));
        let inBuild = _.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL).length;

        // Avoid exceeding 5 constructions at a time
        let cycles = 0;
        for (let pos of buildPositions) {
            if (cycles + inBuild >= 5) break;

            if (shouldBuildRampartAtPosition(pos, room)) {
                if (pos.createConstructionSite(STRUCTURE_RAMPART) === OK) {
                    cycles++;
                }
            }
        }
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

        // Ramparts-only mode logic
        if (RAMPARTS_ONLY) {
            return !pos.checkForBarrierStructure() && !pos.checkForConstructionSites();
        }

        // Handle tunnels and checkered pattern
        if (pos.checkForWall() && pos.checkForRoad()) {
            return handleTunnelAroundWall(pos);
        }
        if (!RAMPARTS_ONLY && isCheckeredPattern(pos)) {
            handleCheckeredPattern(pos);
            return false;
        }

        // Default rampart creation
        return !pos.checkForRampart() && !pos.checkForBuiltWall() && !pos.checkForConstructionSites();
    }

    function isNearProtectedStructure(pos, room) {
        return pos.isNearTo(room.controller) || pos.isNearTo(room.mineral) || pos.isNearTo(pos.findClosestByRange(FIND_SOURCES));
    }

    function handleTunnelAroundWall(pos) {
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

    function handleCheckeredPattern(pos) {
        if (pos.checkForRampart()) {
            pos.checkForRampart().destroy();
        }
        if (!pos.checkForBarrierStructure() && !pos.checkForConstructionSites()) {
            pos.createConstructionSite(STRUCTURE_WALL);
        }
    }

    function isCheckeredPattern(pos) {
        return (isEven(pos.x) && isOdd(pos.y)) || (isOdd(pos.x) && isEven(pos.y));
    }
}

let storedPos = {};
let storedPossibles = {};
function findHub(room, hubCheck = undefined) {
    if (room.controller.owner && room.controller.owner.username === MY_USERNAME && room.memory.bunkerHub && room.memory.bunkerHub.x && room.memory.bunkerHub.y) {
        return buildFromLayout(room);
    }

    // Destroy all non-ally structures
    if (room.structures.length) {
        _.forEach(room.structures, (s) => {
            if (!s.owner || s.owner.username !== MY_USERNAME) {
                s.destroy();
            }
        });
    }

    let spawn = _.find(room.impassibleStructures, (s) => s.my && s.structureType === STRUCTURE_SPAWN && s.name !== 'auto');
    if (spawn) {
        log.a('Bunker Hub search complete for ' + room.name + '...');
        log.a('Using existing spawn as hub.');
        room.memory.bunkerHub = {x: spawn.pos.x + 1, y: spawn.pos.y + 1};
        buildFromLayout(room);
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
            buildFromLayout(room);
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
        abandonRoom(room);
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

// Helper function to check if the position is valid for a rampart
function isValidRampartPosition(position) {
    return !position.checkForWall() &&
        !position.checkForConstructionSites() &&
        !position.checkForRampart();
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