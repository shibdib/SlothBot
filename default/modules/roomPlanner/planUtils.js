/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Shared helpers for layout, roads, ramparts, and towers.

 */


function isAttackRecoveryMode(room) {
    const intel = INTEL[room.name];
    const inSafeMode = (room.controller.safeMode > 0) || !!(intel && intel.safemode);
    const recentAttack = intel && intel.lastMajorAttack && intel.lastMajorAttack + (CREEP_LIFE_TIME * 2) > Game.time;
    return inSafeMode || recentAttack;
}

function setRoadsBuiltFlag(room, value) {
    const intel = INTEL[room.name];
    if (!intel) return;
    if (value === undefined) delete intel.roadsBuilt;
    else intel.roadsBuilt = value;
}

function maxConstructionSitesPerRoom() {
    return MAX_CONSTRUCTION_SITES_PER_ROOM || 10;
}

function roomConstructionSiteBudget(room) {
    if (!room) return 0;
    return Math.max(0, maxConstructionSitesPerRoom() - room.constructionSites.length);
}

function canPlaceConstructionSite(room) {
    return roomConstructionSiteBudget(room) > 0;
}

const SITE_PLACEMENT_LOG_COOLDOWN = 100;
const sitePlacementLogThrottle = Object.create(null);

function recordSitePlacementFailure(roomName, structureType, pos, result) {
    const room = Game.rooms[roomName];
    if (!room) return;
    room.memory.plannerLastSiteError = {
        tick: Game.time,
        x: pos.x,
        y: pos.y,
        type: structureType,
        result,
    };
    const key = `${roomName}:${structureType}:${result}:${pos.x},${pos.y}`;
    const last = sitePlacementLogThrottle[key] || 0;
    if (Game.time - last < SITE_PLACEMENT_LOG_COOLDOWN) return;
    sitePlacementLogThrottle[key] = Game.time;
    log.a(`${roomName} site ${structureType} at (${pos.x},${pos.y}) failed: ${result}`, 'PLANNER');
}

function tryCreateConstructionSite(pos, structureType) {
    const room = Game.rooms[pos.roomName];
    if (!room || !canPlaceConstructionSite(room)) {
        recordSitePlacementFailure(pos.roomName, structureType, pos, ERR_FULL);
        return ERR_FULL;
    }
    const result = pos.createConstructionSite(structureType);
    if (result !== OK) recordSitePlacementFailure(room.name, structureType, pos, result);
    return result;
}

function safeStructureOwner(structure) {
    if (!structure || !(structure instanceof OwnedStructure)) return undefined;
    try {
        return structure.owner && structure.owner.username;
    } catch (e) {
        return undefined;
    }
}

function safeStructureMy(structure) {
    if (!structure || !(structure instanceof OwnedStructure)) return false;
    try {
        return !!structure.my;
    } catch (e) {
        return false;
    }
}

// Layout uses controller RCL (buildMissingStructures). room.level is energy tier for
// spawn bodies and economy — not a gate for which template structures to place.
function shouldSkipStructure() {
    return false;
}


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


// Helper function to check if the position is valid for a rampart
function isValidRampartPosition(position) {
    return !position.checkForWall() &&
        !position.checkForConstructionSites() &&
        !position.checkForRampart();
}

function canPlaceConstructedWall(pos) {
    if (!pos || pos.checkIfOutOfBounds()) return false;
    if (pos.checkForWall()) return false;
    if (pos.checkForConstructionSites()) return false;
    if (pos.checkForBarrierStructure && pos.checkForBarrierStructure()) return false;
    return true;
}

const ROAD_CACHE_TTL = 5000;

function cacheRoad(room, from, to, path, profile = 'owned') {
    const {cachePath} = require('planRoads');
    cachePath(room, from, to, path, profile);
}

function getRoadCacheEntry(room, from, to, profile = 'owned') {
    const {getCachedPath} = require('planRoads');
    const path = getCachedPath(room, from, to, profile);
    if (!path) return;
    return {path: JSON.stringify(path), tick: Game.time};
}

function getRoad(room, from, to, profile = 'owned') {
    const {getCachedPath} = require('planRoads');
    const path = getCachedPath(room, from, to, profile);
    return path ? JSON.stringify(path) : undefined;
}

function isRoadPathComplete(room, from, to, profile = 'remote') {
    const {getCachedPath, pathTilesNeedRoads} = require('planRoads');
    const path = getCachedPath(room, from, to, profile);
    if (!path) return false;
    return !pathTilesNeedRoads(room, path, to);
}

function markRoadPathComplete() {
    // No-op: completion is derived from room tiles, not cache flags.
}

function getPathKey(from, to) {
    return getPosKey(from) + '$' + getPosKey(to);
}

function getPosKey(pos) {
    return pos.x + 'x' + pos.y;
}

function isRoadSatisfied(pos) {
    if (pos.checkForRoad()) return true;
    if (pos.checkForContainer()) return true;
    const site = pos.checkForConstructionSites();
    return !!(site && (site.structureType === STRUCTURE_ROAD || site.structureType === STRUCTURE_CONTAINER));
}

function isRoadPlaceable(pos) {
    if (pos.isExit()) return false;
    if (pos.checkForRoad()) return false;
    if (pos.checkForConstructionSites()) return false;
    if (pos.checkForWall() || pos.checkForImpassible(true)) return false;
    for (const s of pos.lookFor(LOOK_STRUCTURES)) {
        if (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_RAMPART) continue;
        return false;
    }
    return true;
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


function isCoreHubTileValid(pos, room) {
    if (pos.x < 1 || pos.x > 48 || pos.y < 1 || pos.y > 48) return false;
    const src = pos.findClosestByRange(FIND_SOURCES);
    return !pos.checkForImpassible() && !pos.isNearTo(room.controller) && !(src && pos.isNearTo(src));
}


function isNearAnySource(pos, room, range = 1) {
    for (const source of room.sources) {
        if (pos.getRangeTo(source.pos) <= range) return true;
    }
    return false;
}

function isAssignedSourceContainer(structure, room) {
    if (!structure || !room) return false;
    for (const source of room.sources) {
        const containerId = source.memory.container || source.memory.containerID;
        if (containerId && containerId === structure.id) return true;
    }
    return false;
}

function isSourceOrMineralPad(pos, room) {
    if (room.mineral && pos.isNearTo(room.mineral)) return true;
    return isNearAnySource(pos, room, 1);
}

function isControllerContainerPos(pos, room) {
    if (!room.controller || pos.getRangeTo(room.controller) > 2) return false;
    return !isSourceOrMineralPad(pos, room);
}

function isNearController(pos, room, maxRange = 2) {
    return !!(room.controller && pos.getRangeTo(room.controller) <= maxRange);
}

function isSourceOrMineralContainer(structure, room) {
    if (!structure || !room) return false;
    if (isAssignedSourceContainer(structure, room)) return true;
    if (room.mineral && structure.pos.isNearTo(room.mineral)) return true;
    return isNearAnySource(structure.pos, room, 1);
}

function isControllerAreaContainer(structure, room) {
    return structure
        && structure.structureType === STRUCTURE_CONTAINER
        && isNearController(structure.pos, room, 2)
        && !isSourceOrMineralContainer(structure, room);
}

const CONTROLLER_LINK_MAX_RANGE = 3;

function isAssignedSourceLink(structure, room) {
    if (!structure || !room || structure.structureType !== STRUCTURE_LINK) return false;
    for (const source of room.sources) {
        if (source.memory.link && source.memory.link === structure.id) return true;
    }
    return false;
}

function isControllerLinkPos(pos, room) {
    if (!room.controller || pos.getRangeTo(room.controller) > CONTROLLER_LINK_MAX_RANGE) return false;
    return !isNearAnySource(pos, room, 2);
}

function isControllerAreaLink(structure, room) {
    return structure
        && structure.structureType === STRUCTURE_LINK
        && (!structure.isActive || structure.isActive())
        && isControllerLinkPos(structure.pos, room)
        && !isAssignedSourceLink(structure, room);
}

function controllerContainersNear(room) {
    if (!room.controller) return [];
    if (global.posStructuresInRange) {
        return global.posStructuresInRange(room.controller.pos, 3, {
            filter: (s) => s.structureType === STRUCTURE_CONTAINER,
        });
    }
    return room.controller.pos.findInRange(FIND_STRUCTURES, 3, {
        filter: (s) => s.structureType === STRUCTURE_CONTAINER,
    });
}

function controllerContainerSitesNear(room) {
    if (!room.controller) return [];
    if (global.posConstructionSitesInRange) {
        return global.posConstructionSitesInRange(room.controller.pos, 3, {
            filter: {structureType: STRUCTURE_CONTAINER},
        });
    }
    return room.controller.pos.findInRange(FIND_CONSTRUCTION_SITES, 3, {
        filter: (s) => s.structureType === STRUCTURE_CONTAINER,
    });
}

function controllerContainersAdjacent(room) {
    const seen = new Set();
    const out = [];
    const add = (s) => {
        if (!isControllerAreaContainer(s, room) || seen.has(s.id)) return;
        seen.add(s.id);
        out.push(s);
    };
    for (const s of controllerContainersNear(room)) add(s);
    if (room.containers) {
        for (const s of room.containers) add(s);
    }
    if (!out.length && room.controller && Game.rooms[room.name]) {
        for (const s of room.controller.pos.findInRange(FIND_STRUCTURES, 2, {
            filter: (st) => st.structureType === STRUCTURE_CONTAINER,
        })) add(s);
    }
    return out;
}

function controllerContainerSitesAdjacent(room) {
    const seen = new Set();
    const out = [];
    const add = (s) => {
        if (!s || s.structureType !== STRUCTURE_CONTAINER || !isNearController(s.pos, room, 2)
            || isSourceOrMineralContainer(s, room) || seen.has(s.id)) return;
        seen.add(s.id);
        out.push(s);
    };
    for (const s of controllerContainerSitesNear(room)) add(s);
    if (room.constructionSites) {
        for (const s of room.constructionSites) add(s);
    }
    if (!out.length && room.controller && Game.rooms[room.name]) {
        for (const s of room.controller.pos.findInRange(FIND_CONSTRUCTION_SITES, 2, {
            filter: (st) => st.structureType === STRUCTURE_CONTAINER,
        })) add(s);
    }
    return out;
}

function pickCanonicalControllerContainer(room, structures) {
    if (!structures.length) return null;
    const hub = room.hub;
    const candidates = structures.filter((s) =>
        s.store && isControllerContainerPos(s.pos, room) && !isAssignedSourceContainer(s, room)
    );
    if (!candidates.length) return null;
    candidates.sort((a, b) => {
        if (!hub) return 0;
        return a.pos.findPathTo(hub).length - b.pos.findPathTo(hub).length;
    });
    return candidates[0];
}

function resolveControllerContainer(room, syncMemory = false) {
    if (!room || !room.controller) return null;
    const remembered = Game.getObjectById(room.memory.controllerContainer);
    if (remembered && remembered.store && isControllerAreaContainer(remembered, room)) {
        return remembered;
    }
    if (room.memory.controllerContainer) {
        room.memory.controllerContainer = undefined;
    }

    const adjacent = controllerContainersAdjacent(room).filter((s) => s.store);
    const keeper = pickCanonicalControllerContainer(room, adjacent);
    if (keeper && adjacent.length > 1) {
        for (const s of adjacent) {
            if (s.id !== keeper.id) s.destroy();
        }
    }
    if (keeper) {
        if (syncMemory) room.memory.controllerContainer = keeper.id;
        return keeper;
    }
    return null;
}


function sourceContainersAdjacent(source) {
    if (!source) return [];
    const seen = new Set();
    const out = [];
    const add = (s) => {
        if (!s || s.structureType !== STRUCTURE_CONTAINER || !s.pos.isNearTo(source) || seen.has(s.id)) return;
        seen.add(s.id);
        out.push(s);
    };
    if (global.posStructuresInRange) {
        for (const s of global.posStructuresInRange(source.pos, 1, {filter: {structureType: STRUCTURE_CONTAINER}})) add(s);
    }
    const room = Game.rooms[source.pos.roomName];
    if (room) {
        for (const s of source.pos.findInRange(FIND_STRUCTURES, 1, {filter: {structureType: STRUCTURE_CONTAINER}})) add(s);
        if (room.containers) {
            for (const s of room.containers) {
                if (s.pos.isNearTo(source)) add(s);
            }
        }
    }
    return out;
}

function sourceContainerSitesAdjacent(source) {
    if (!source) return [];
    const seen = new Set();
    const out = [];
    const add = (s) => {
        if (!s || s.structureType !== STRUCTURE_CONTAINER || !s.pos.isNearTo(source) || seen.has(s.id)) return;
        seen.add(s.id);
        out.push(s);
    };
    if (global.posConstructionSitesInRange) {
        for (const s of global.posConstructionSitesInRange(source.pos, 1, {filter: {structureType: STRUCTURE_CONTAINER}})) add(s);
    }
    const room = Game.rooms[source.pos.roomName];
    if (room) {
        for (const s of source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: {structureType: STRUCTURE_CONTAINER}})) add(s);
        if (room.constructionSites) {
            for (const s of room.constructionSites) add(s);
        }
    }
    return out;
}

function pickCanonicalSourceContainer(source, structures) {
    if (!structures.length) return null;
    const withStore = structures.filter((s) => s.store);
    if (!withStore.length) return null;
    const bestPos = findBestContainerPos(source);
    if (bestPos) {
        const atBest = withStore.find((s) => s.pos.isEqualTo(bestPos));
        if (atBest) return atBest;
    }
    return source.pos.findClosestByRange(withStore);
}

function resolveSourceContainer(source, room, syncMemory = false) {
    if (!source) return null;
    room = room || Game.rooms[source.pos.roomName];

    const containerId = source.memory.container || source.memory.containerID;
    const remembered = Game.getObjectById(containerId);
    if (remembered && remembered.structureType === STRUCTURE_CONTAINER && remembered.pos.isNearTo(source) && remembered.store) {
        if (syncMemory) {
            source.memory.container = remembered.id;
            delete source.memory.containerID;
        }
        return remembered;
    }
    if (containerId && (!remembered || remembered.structureType !== STRUCTURE_CONTAINER || !remembered.pos.isNearTo(source))) {
        source.memory.container = undefined;
        delete source.memory.containerID;
    }

    const adjacent = sourceContainersAdjacent(source).filter((s) => s.store);
    const keeper = pickCanonicalSourceContainer(source, adjacent);
    if (keeper && adjacent.length > 1) {
        for (const s of adjacent) {
            if (s.id !== keeper.id) s.destroy();
        }
    }
    if (keeper) {
        if (syncMemory) {
            source.memory.container = keeper.id;
            delete source.memory.containerID;
        }
        return keeper;
    }
    return null;
}

function resolveSourceContainerSite(source) {
    const sites = sourceContainerSitesAdjacent(source);
    if (!sites.length) return null;
    const bestPos = findBestContainerPos(source);
    if (bestPos) {
        const atBest = sites.find((s) => s.pos.isEqualTo(bestPos));
        if (atBest) return atBest;
    }
    return source.pos.findClosestByRange(sites);
}

function hasSourceContainerSite(source) {
    return sourceContainerSitesAdjacent(source).length > 0;
}

function hasControllerContainerSite(room) {
    return controllerContainerSitesAdjacent(room).length > 0;
}

module.exports = {

    isAttackRecoveryMode,

    setRoadsBuiltFlag,

    maxConstructionSitesPerRoom,

    roomConstructionSiteBudget,

    canPlaceConstructionSite,

    tryCreateConstructionSite,

    shouldSkipStructure,

    getUndefendedExits,

    isValidRampartPosition,
    canPlaceConstructedWall,

    cacheRoad,

    getRoad,

    getRoadCacheEntry,

    isRoadPathComplete,

    markRoadPathComplete,

    getPathKey,

    getPosKey,

    isRoadSatisfied,

    isRoadPlaceable,

    findBestContainerPos,

    determineTowerDamage,

    isCoreHubTileValid,

    safeStructureOwner,

    safeStructureMy,

    isControllerContainerPos,

    isControllerLinkPos,

    isControllerAreaLink,

    resolveControllerContainer,

    hasControllerContainerSite,

    controllerContainersAdjacent,

    resolveSourceContainer,

    resolveSourceContainerSite,

    hasSourceContainerSite,

    sourceContainersAdjacent,

};