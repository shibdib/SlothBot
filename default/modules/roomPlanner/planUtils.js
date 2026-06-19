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

function tryCreateConstructionSite(pos, structureType) {
    const room = Game.rooms[pos.roomName];
    if (!room || !canPlaceConstructionSite(room)) return ERR_FULL;
    return pos.createConstructionSite(structureType);
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

// Helper function to determine if a structure should be skipped
function shouldSkipStructure(room, structure) {
    return room.controller.level !== room.level &&
        ![STRUCTURE_EXTENSION, STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_TERMINAL].includes(structure.structureType);
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

const ROAD_CACHE_TTL = 5000;

function cacheRoad(room, from, to, path, profile = 'owned') {
    const {cachePath} = require('planRoadPaths');
    cachePath(room, from, to, path, profile);
}

function getRoadCacheEntry(room, from, to, profile = 'owned') {
    const {getCachedPath} = require('planRoadPaths');
    const path = getCachedPath(room, from, to, profile);
    if (!path) return;
    return {path: JSON.stringify(path), tick: Game.time};
}

function getRoad(room, from, to, profile = 'owned') {
    const {getCachedPath} = require('planRoadPaths');
    const path = getCachedPath(room, from, to, profile);
    return path ? JSON.stringify(path) : undefined;
}

function isRoadPathComplete(room, from, to, profile = 'remote') {
    const {getCachedPath, pathTilesNeedRoads} = require('planRoadPaths');
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


function isSourceOrMineralPad(pos, room) {
    if (room.mineral && pos.isNearTo(room.mineral)) return true;
    for (const source of room.sources) {
        if (pos.isNearTo(source)) return true;
    }
    return false;
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
    if (room.mineral && structure.pos.isNearTo(room.mineral)) return true;
    for (const source of room.sources) {
        if (structure.pos.isNearTo(source)) return true;
    }
    return false;
}

function isControllerAreaContainer(structure, room) {
    return structure
        && structure.structureType === STRUCTURE_CONTAINER
        && isNearController(structure.pos, room, 2)
        && !isSourceOrMineralContainer(structure, room);
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
    const withStore = structures.filter((s) => s.store);
    if (!withStore.length) return null;
    const canonical = withStore.filter((s) => isControllerContainerPos(s.pos, room));
    const pool = canonical.length ? canonical : withStore;
    pool.sort((a, b) => {
        const aCanon = isControllerContainerPos(a.pos, room) ? 0 : 1;
        const bCanon = isControllerContainerPos(b.pos, room) ? 0 : 1;
        if (aCanon !== bCanon) return aCanon - bCanon;
        if (!hub) return 0;
        return a.pos.findPathTo(hub).length - b.pos.findPathTo(hub).length;
    });
    return pool[0];
}

function resolveControllerContainer(room, syncMemory = false) {
    if (!room || !room.controller) return null;
    const remembered = Game.getObjectById(room.memory.controllerContainer);
    if (remembered && remembered.store && isControllerAreaContainer(remembered, room)) {
        return remembered;
    }
    if (room.memory.controllerContainer && (!remembered || !remembered.store)) {
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

    cacheRoad,

    getRoad,

    getRoadCacheEntry,

    isRoadPathComplete,

    markRoadPathComplete,

    getPathKey,

    getPosKey,

    findBestContainerPos,

    determineTowerDamage,

    isCoreHubTileValid,

    safeStructureOwner,

    safeStructureMy,

    isControllerContainerPos,

    resolveControllerContainer,

    hasControllerContainerSite,

    controllerContainersAdjacent,

    resolveSourceContainer,

    resolveSourceContainerSite,

    hasSourceContainerSite,

    sourceContainersAdjacent,

};