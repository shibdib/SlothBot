/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Lightweight traffic helpers: movement ordering, occupancy, and yield tile selection.
 * Stuck recovery lives in pathMove.creepBumping — keep this module small and side-effect free.
 */

function creepTrafficPriority(creep) {
    return PRIORITIES[creep.memory?.role] || 10;
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
        !creep.memory?.grouped &&
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

function scoreYieldTile(pos, contestedPos) {
    let score = 0;
    // Prefer staying on the road network when stepping aside.
    if (pos.checkForRoad()) score += 5;
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
        const score = scoreYieldTile(pos, contestedPos);
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
    isTileWalkable,
    markMoveBlocked,
};
