/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const generator = require('module.bodyGenerator');

const CREEP_COUNT_CACHE = {counts: {}, tick: 0, harvesterBySource: {}};

function updateCreepCountCache() {
    const currentTick = Game.time;
    if (CREEP_COUNT_CACHE.tick === currentTick) return;

    const counts = {};
    const harvesterBySource = {};
    const allCreeps = Object.values(Game.creeps);

    for (const creep of allCreeps) {
        if (!creep.my) continue;
        processCreepForCache(counts, creep);
        if (creep.memory.role === 'remoteHarvester') {
            const sourceId = creep.memory.other && creep.memory.other.source;
            if (sourceId) harvesterBySource[sourceId] = creep;
        }
    }

    CREEP_COUNT_CACHE.counts = counts;
    CREEP_COUNT_CACHE.harvesterBySource = harvesterBySource;
    CREEP_COUNT_CACHE.tick = currentTick;
}

function getRemoteHarvesterForSource(sourceId) {
    if (!sourceId) return undefined;
    updateCreepCountCache();
    return CREEP_COUNT_CACHE.harvesterBySource[sourceId];
}

function processCreepForCache(counts, creep) {
    // Sealed remnants (bled-down quads fighting as a duo) must not fill the
    // waitFor-4 spawn cap — a new quad should spawn beside them.
    if (creep.memory.misc && creep.memory.misc.sealed) return;
    const role = creep.memory.oldRole || creep.memory.role || '';
    const destination = creep.memory.destination || creep.room.name;
    const room = creep.room.name || creep.memory.colony;
    const colony = creep.memory.colony || creep.room.name;
    const operation = creep.memory.operation || '';
    const assignment = creep.memory.assignment || '';

    incrementCreepCount(counts, `${role}_${room}_noDest_noOp`, creep);
    if (operation) incrementCreepCount(counts, `${role}_${room}_noDest_${operation}`, creep);
    if (assignment) incrementCreepCount(counts, `${role}_${assignment}`, creep);
    if (destination) incrementCreepCount(counts, `${role}_${destination}_noOp`, creep);
    if (operation) incrementCreepCount(counts, `${role}_noDest_${operation}`, creep);
    if (destination && operation) incrementCreepCount(counts, `${role}_${destination}_${operation}`, creep);
    if (colony) incrementCreepCount(counts, `${role}_noDest_noOp_${colony}`, creep);
    incrementCreepCount(counts, `${role}_noDest_noOp_noColony`, creep);
}

function incrementCreepCount(counts, key, creep) {
    if (!counts[key]) counts[key] = {count: 0, minTTL: Infinity, bodyLen: 0};
    counts[key].count++;
    const ttl = creep.spawning ? Infinity : (creep.ticksToLive || Infinity);
    if (ttl < counts[key].minTTL) {
        counts[key].minTTL = ttl;
        counts[key].bodyLen = creep.body.length;
    }
}

function getCreepCount(room = undefined, role, destination = undefined, operation = undefined, colony = undefined, assignment = undefined) {
    updateCreepCountCache();
    const counts = CREEP_COUNT_CACHE.counts;
    const colonyKey = colony && (typeof colony === 'string' ? colony : colony.name);

    let key;
    if (assignment) key = `${role}_${assignment}`;
    else if (!destination && !operation && !assignment && colonyKey) key = `${role}_noDest_noOp_${colonyKey}`;
    else if (!destination && !operation && !assignment && room) key = `${role}_${room.name}_noDest_noOp`;
    else if (room && operation && !destination && !assignment) key = `${role}_${room.name}_noDest_${operation}`;
    else if (destination && !operation) key = `${role}_${destination}_noOp`;
    else if (!destination && operation) key = `${role}_noDest_${operation}`;
    else if (destination && operation) key = `${role}_${destination}_${operation}`;
    else if (!destination && !operation && !room) key = `${role}_noDest_noOp_noColony`;
    else return 0;

    return counts[key] ? counts[key].count : 0;
}

function creepExpiringSoon(room = undefined, role, destination = undefined, operation = undefined, colony = undefined, assignment = undefined) {
    updateCreepCountCache();
    const counts = CREEP_COUNT_CACHE.counts;
    const colonyKey = colony && (typeof colony === 'string' ? colony : colony.name);

    let key;
    if (assignment) key = `${role}_${assignment}`;
    else if (!destination && !operation && !assignment && colonyKey) key = `${role}_noDest_noOp_${colonyKey}`;
    else if (!destination && !operation && !assignment && room) key = `${role}_${room.name}_noDest_noOp`;
    else if (room && operation && !destination && !assignment) key = `${role}_${room.name}_noDest_${operation}`;
    else if (destination && !operation) key = `${role}_${destination}_noOp`;
    else if (!destination && operation) key = `${role}_noDest_${operation}`;
    else if (destination && operation) key = `${role}_${destination}_${operation}`;
    else if (!destination && !operation && !room) key = `${role}_noDest_noOp_noColony`;
    else return false;

    const data = counts[key];
    if (!data || data.count <= 0 || data.minTTL === Infinity) return false;

    let distance = 0;
    if (destination) {
        const originRoom = findClosestOwnedRoom(destination, false, MAX_LEVEL);
        distance = originRoom ? Game.map.getRoomLinearDistance(originRoom, destination) * 50 : 0;
    }
    const spawnTime = 3 * data.bodyLen;
    return data.minTTL <= (spawnTime + distance);
}

function getBodyAbilityPower(room, role) {
    const generated = new generator(room.level, role, room).generateBody();
    return abilityPower(generated.body);
}


function haulerCarryCapacity(creep) {
    if (creep.spawning) {
        let carry = 0;
        for (let i = 0; i < creep.body.length; i++) {
            if (creep.body[i].type === CARRY) carry++;
        }
        return carry * CARRY_CAPACITY;
    }
    return creep.getActiveBodyparts(CARRY) * CARRY_CAPACITY;
}

module.exports = {
    getCreepCount,
    getRemoteHarvesterForSource,
    creepExpiringSoon,
    getBodyAbilityPower,
    haulerCarryCapacity,
};