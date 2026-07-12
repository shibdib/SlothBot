/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Per-tick traffic management: global movement intents, yield helpers, creep ordering.
 */

const YIELD_REPATH_THRESHOLD = 2;

function ensureIntentRegistry() {
    if (global._movementIntentTick !== Game.time) {
        global._movementIntents = {};
        global._movementIntentTick = Game.time;
    }
    return global._movementIntents;
}

function posKey(pos) {
    if (!pos) return null;
    return `${pos.x}.${pos.y}`;
}

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
    if (creep.memory.trailer) return -1;
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

function isBumperCandidate(creep) {
    return creep &&
        creep.my &&
        (creep.className || !creep.fatigue) &&
        (!creep.memory?.other?.stationary) &&
        !creep.memory?.grouped &&
        (creep.className || creep.hasActiveBodyparts(MOVE));
}

function creepOnPos(creep, pos) {
    return creep.pos.x === pos.x && creep.pos.y === pos.y;
}

function findBlockerCreep(room, pos, excludeId) {
    if (!room || !pos) return null;

    for (const c of room.myCreeps) {
        if (c.id !== excludeId && creepOnPos(c, pos) && isBumperCandidate(c)) return c;
    }
    for (const c of room.powerCreeps) {
        if (c.id !== excludeId && creepOnPos(c, pos) && isBumperCandidate(c)) return c;
    }
    return null;
}

function findOccupyingCreep(room, pos, excludeId) {
    if (!room || !pos) return null;

    const blocker = findBlockerCreep(room, pos, excludeId);
    if (blocker) return blocker;

    for (const c of room.myCreeps) {
        if (c.id !== excludeId && creepOnPos(c, pos)) return c;
    }
    for (const c of room.powerCreeps) {
        if (c.id !== excludeId && creepOnPos(c, pos)) return c;
    }
    return null;
}

function getRoomIntents(registry, roomName) {
    if (!registry || !roomName) return {};
    if (!registry[roomName]) registry[roomName] = {};
    return registry[roomName];
}

function getIntent(registry, roomName, key) {
    if (!registry || !key || !roomName) return undefined;
    return getRoomIntents(registry, roomName)[key];
}

function canReserveTile(registry, roomName, key, creepId, priority) {
    if (!registry || !key || !roomName) return true;
    const existing = getIntent(registry, roomName, key);
    if (!existing) return true;
    if (existing.creepId === creepId) return true;
    return priority < existing.priority;
}

function registerIntent(registry, roomName, key, creepId, priority) {
    if (!registry || !key || !roomName) return;
    const intents = getRoomIntents(registry, roomName);
    const existing = intents[key];
    if (!existing || priority < existing.priority) {
        intents[key] = {creepId, priority};
    }
}

function isTileWalkable(pos, ignoreCreepId) {
    if (!pos || pos.isExit() || pos.checkForWall()) return false;
    if (pos.checkForObstacleStructure()) return false;

    const room = Game.rooms[pos.roomName];
    if (!room) return false;

    const blocker = findBlockerCreep(room, pos, ignoreCreepId);
    if (blocker) return false;
    return true;
}

function scoreYieldTile(creep, pos, nextPos) {
    let score = 0;
    if (!pos.checkForRoad()) score += 10;
    if (nextPos) score += pos.getRangeTo(nextPos) * 2;
    return score;
}

function findYieldDirection(creep, nextPos) {
    const blockedDir = nextPos ? creep.pos.getDirectionTo(nextPos) : 0;
    const candidates = [];

    for (let dir = 1; dir <= 8; dir++) {
        if (dir === blockedDir) continue;
        const pos = creep.pos.getAdjacentPosition(dir);
        if (!pos || !isTileWalkable(pos, creep.id)) continue;
        candidates.push({dir, score: scoreYieldTile(creep, pos, nextPos)});
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].dir;
}

function bumpYieldAttempts(creep) {
    creep.memory._yieldAttempts = (creep.memory._yieldAttempts || 0) + 1;
    return creep.memory._yieldAttempts;
}

function clearYieldAttempts(creep) {
    delete creep.memory._yieldAttempts;
}

function shouldRepathAfterYield(creep) {
    return (creep.memory._yieldAttempts || 0) >= YIELD_REPATH_THRESHOLD;
}

module.exports = {
    YIELD_REPATH_THRESHOLD,
    creepTrafficPriority,
    creepWinsTraffic,
    sortCreepsForMovement,
    findBlockerCreep,
    findOccupyingCreep,
    ensureIntentRegistry,
    posKey,
    canReserveTile,
    registerIntent,
    getIntent,
    findYieldDirection,
    bumpYieldAttempts,
    clearYieldAttempts,
    shouldRepathAfterYield,
    isBumperCandidate,
};