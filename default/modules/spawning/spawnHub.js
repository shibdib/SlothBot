/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Hub-manager spawn geometry. Bunker (0,0) is boxed in at RCL 8
 * (spawns / storage / terminal / link / nuker / power spawn). A 0-MOVE
 * creep can spawn onto that tile; any other creep landing there is stuck.
 */

const DIR_BY_DELTA = {
    '0,-1': TOP,
    '1,-1': TOP_RIGHT,
    '1,0': RIGHT,
    '1,1': BOTTOM_RIGHT,
    '0,1': BOTTOM,
    '-1,1': BOTTOM_LEFT,
    '-1,0': LEFT,
    '-1,-1': TOP_LEFT,
};

const ALL_SPAWN_DIRS = [TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT];

function directionToAdjacent(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (dx < -1 || dx > 1 || dy < -1 || dy > 1 || (!dx && !dy)) return null;
    return DIR_BY_DELTA[dx + ',' + dy] || null;
}

function hubSlotSpawnDirection(spawn, room) {
    const hub = room && room.hub;
    if (!hub || !spawn || !spawn.pos) return null;
    return directionToAdjacent(spawn.pos, hub);
}

function isHubManagerSlotReady(room) {
    if (!room || !room.hub || !room.storage || !room.terminal) return false;
    if (!room.controller || room.controller.level < 8) return false;
    if (!room.memory.hubLink || !Game.getObjectById(room.memory.hubLink)) return false;
    const pos = new RoomPosition(room.hub.x, room.hub.y, room.name);
    const structs = pos.lookFor(LOOK_STRUCTURES) || [];
    for (let i = 0; i < structs.length; i++) {
        const type = structs[i].structureType;
        if (type === STRUCTURE_RAMPART || type === STRUCTURE_ROAD) continue;
        if (OBSTACLE_OBJECT_TYPES.includes(type)) return false;
    }
    return true;
}

function spawnDirectionsForRole(spawn, room, role) {
    if (!room || !room.controller || room.controller.level < 8) return undefined;
    const hubDir = hubSlotSpawnDirection(spawn, room);
    if (!hubDir) return undefined;
    if (role === 'hubManager') return [hubDir];
    return ALL_SPAWN_DIRS.filter(d => d !== hubDir);
}

function hasLiveHubManager(room) {
    const creeps = room && room.myCreeps;
    if (!creeps) return false;
    for (let i = 0; i < creeps.length; i++) {
        const c = creeps[i];
        if (c && c.memory && c.memory.role === 'hubManager' && !c.spawning) return true;
    }
    return false;
}

function recycleHubSlotIntruder(room) {
    if (!room || !room.hub) return false;
    const pos = new RoomPosition(room.hub.x, room.hub.y, room.name);
    const creeps = pos.lookFor(LOOK_CREEPS) || [];
    const creep = creeps[0];
    if (!creep || !creep.my || (creep.memory && creep.memory.role === 'hubManager')) return false;
    const spawns = room.spawns || [];
    for (let i = 0; i < spawns.length; i++) {
        const spawn = spawns[i];
        if (!spawn || spawn.spawning || !spawn.pos.isNearTo(creep)) continue;
        if (spawn.recycleCreep(creep) === OK) return true;
    }
    creep.suicide();
    return true;
}

module.exports = {
    hubSlotSpawnDirection,
    isHubManagerSlotReady,
    spawnDirectionsForRole,
    recycleHubSlotIntruder,
    hasLiveHubManager,
};
