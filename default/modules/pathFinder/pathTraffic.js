/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Lightweight traffic helpers: movement ordering, occupancy, and yield tile selection.
 * Stuck recovery lives in pathMove.creepBumping — keep this module small and side-effect free.
 */

function creepTrafficPriority(creep) {
    return PRIORITIES[creep.memory?.role] || 10;
}

// WaitFor longbows parked in their spawn colony should step aside for
// economy traffic. Do not yield while renewing or standing at a boost lab.
function isHomeRoomYieldingSquad(creep) {
    if (!creep || !creep.my || !creep.memory) return false;
    const waitFor = creep.memory.misc && creep.memory.misc.waitFor;
    if (!(waitFor > 1)) return false;
    const home = (creep.memory.misc && creep.memory.misc.formColony) || creep.memory.colony;
    if (!home || creep.room.name !== home) return false;
    if (creep.memory.needsRenewal) return false;
    if (creep.memory.boosts && !creep.memory.boostAttempt) return false;
    // Forming waves yield. Committed ones are leaving the bunker — haulers
    // path around them instead of shoving them back onto the pad.
    if (creep.memory.initialFormUp || (creep.memory.misc && creep.memory.misc.sealed)) return false;
    const role = creep.memory.role || '';
    const old = creep.memory.oldRole || '';
    if (role !== 'longbowSquad' && role !== 'longbow'
        && old !== 'longbowSquad' && old !== 'longbow') return false;
    return !!(creep.memory.grouped || creep.memory.leader);
}

function creepWinsTraffic(creep, other) {
    const myPriority = creepTrafficPriority(creep);
    const theirPriority = creepTrafficPriority(other);
    if (myPriority !== theirPriority) return myPriority < theirPriority;
    return creep.name.localeCompare(other.name) < 0;
}

function movementSortPriority(creep) {
    // Tow trucks act before roles so pull + trailer follow stay coherent.
    if (creep.memory.trailer) return -1;
    // Active trailers last — they only request tow / wait for pull.
    if (creep.memory.towDestination && creep.memory.towCreep) return 100;
    return creepTrafficPriority(creep);
}

function sortCreepsForMovement(creeps) {
    return creeps.slice().sort((a, b) => {
        const diff = movementSortPriority(a) - movementSortPriority(b);
        if (diff) return diff;
        return a.name.localeCompare(b.name);
    });
}

/**
 * Creeps we may ask to step aside: friendly, movable this tick, not parked for work/squad.
 */
function isBumperCandidate(creep) {
    return !!(creep &&
        creep.my &&
        (creep.className || !creep.fatigue) &&
        !creep.memory?.other?.stationary &&
        (!creep.memory?.grouped || isHomeRoomYieldingSquad(creep)) &&
        (creep.className || creep.hasActiveBodyparts(MOVE)));
}

function creepOnPos(creep, pos) {
    return creep.pos.x === pos.x && creep.pos.y === pos.y;
}

function findOccupyingCreep(room, pos, excludeId) {
    if (!room || !pos) return null;

    for (const c of room.myCreeps) {
        if (c.id !== excludeId && creepOnPos(c, pos)) return c;
    }
    for (const c of room.powerCreeps) {
        if (c.id !== excludeId && creepOnPos(c, pos)) return c;
    }
    return null;
}

/**
 * Yield tiles must be free of walls, obstacle structures, exits, and any creep.
 */
function isTileWalkable(pos, ignoreCreepId) {
    if (!pos || pos.isExit() || pos.checkForWall()) return false;
    if (pos.checkForObstacleStructure()) return false;
    if (pos.checkIfOutOfBounds && pos.checkIfOutOfBounds()) return false;

    const occupant = pos.checkForCreep();
    if (occupant && occupant.id !== ignoreCreepId) return false;
    return true;
}

function scoreYieldTile(pos, contestedPos, yielder) {
    let score = 0;
    if (yielder && isHomeRoomYieldingSquad(yielder)) {
        if (pos.checkForRoad()) score -= 8;
    } else if (pos.checkForRoad()) {
        score += 5;
    }
    // Prefer leaving the contested corridor rather than sliding along it.
    if (contestedPos) score += pos.getRangeTo(contestedPos);
    return score;
}

/**
 * Pick a free adjacent direction for `creep` to step off `contestedPos` (or away from it).
 * Returns a direction constant or null if no safe tile exists.
 */
function findYieldDirection(creep, contestedPos) {
    const blockedDir = contestedPos && !creep.pos.isEqualTo(contestedPos)
        ? creep.pos.getDirectionTo(contestedPos)
        : 0;
    let bestDir = null;
    let bestScore = -Infinity;

    for (let dir = 1; dir <= 8; dir++) {
        if (dir === blockedDir) continue;
        const pos = creep.pos.getAdjacentPosition(dir);
        if (!pos || !isTileWalkable(pos, creep.id)) continue;
        const score = scoreYieldTile(pos, contestedPos, creep);
        if (score > bestScore) {
            bestScore = score;
            bestDir = dir;
        }
    }
    return bestDir;
}

/** Mark a creep so later role logic cannot overwrite this tick's yield/bump move. */
function markMoveBlocked(creep) {
    if (creep?.memory) creep.memory.moveBlocked = Game.time;
}

module.exports = {
    creepTrafficPriority,
    creepWinsTraffic,
    sortCreepsForMovement,
    findOccupyingCreep,
    findYieldDirection,
    isBumperCandidate,
    isHomeRoomYieldingSquad,
    isTileWalkable,
    markMoveBlocked,
};
