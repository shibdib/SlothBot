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

function getRoadCacheEntry(room, from, to) {
    let cache = ROAD_CACHE[room.name];
    if (!cache) return;
    let entry = cache[getPathKey(from, to)];
    if (!entry) return;
    if (entry.tick && entry.tick + ROAD_CACHE_TTL < Game.time) return;
    return entry;
}

function getRoad(room, from, to) {
    let entry = getRoadCacheEntry(room, from, to);
    return entry && entry.path;
}

function isRoadPathComplete(room, from, to) {
    let entry = getRoadCacheEntry(room, from, to);
    return !!(entry && entry.complete);
}

function markRoadPathComplete(room, from, to) {
    const key = getPathKey(from, to);
    if (ROAD_CACHE[room.name] && ROAD_CACHE[room.name][key]) {
        ROAD_CACHE[room.name][key].complete = true;
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


function isCoreHubTileValid(pos, room) {
    if (pos.x < 1 || pos.x > 48 || pos.y < 1 || pos.y > 48) return false;
    const src = pos.findClosestByRange(FIND_SOURCES);
    return !pos.checkForImpassible() && !pos.isNearTo(room.controller) && !(src && pos.isNearTo(src));
}

module.exports = {

    isAttackRecoveryMode,

    setRoadsBuiltFlag,

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

};