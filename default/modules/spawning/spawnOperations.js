/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Global military/auxiliary operation assignment and priority.
 */

const generator = require('module.bodyGenerator');

const CRITICAL_OP_TYPES = new Set(['rebuild', 'claim']);
const CLAIM_ROLES = new Set(['claimer', 'claimAttacker', 'reserver']);
const assignmentCooldown = {};

function buildOperationsSignature() {
    let sig = '';
    const tr = Memory.targetRooms || {};
    const aux = Memory.auxiliaryTargets || {};
    for (const k of Object.keys(tr).sort()) {
        const o = tr[k];
        if (!o) continue;
        sig += `t:${k}:${o.type || ''}:${o.tick || 0}:${o.level || 0}:${o.complete ? 1 : 0}:${o.builders ? 1 : 0};`;
    }
    for (const k of Object.keys(aux).sort()) {
        const o = aux[k];
        if (!o) continue;
        sig += `a:${k}:${o.type || ''}:${o.tick || 0}:${o.level || 0}:${o.priority || 0};`;
    }
    return sig;
}

function pruneEmptyOperations() {
    for (const key in Memory.targetRooms || {}) {
        if (!Memory.targetRooms[key]) delete Memory.targetRooms[key];
    }
    for (const key in Memory.auxiliaryTargets || {}) {
        if (!Memory.auxiliaryTargets[key]) delete Memory.auxiliaryTargets[key];
    }
}

function collectGlobalOperations(room) {
    const globalQueue = CREEP_QUEUES['global'];
    if (!globalQueue) return {};
    const out = {};
    for (const key in globalQueue) {
        const accepted = considerGlobalEntry(room, globalQueue[key]);
        if (accepted) out[key] = accepted;
    }
    return out;
}

function considerGlobalEntry(room, entry) {
    if (!entry.destination) return {...entry};
    if (entry.destination === room.name) return null;

    const target = entry.other && entry.other.assignment ? entry.other.assignment : entry.destination;
    const opMemory = Memory.targetRooms[target] || Memory.auxiliaryTargets[target];
    if (!opMemory) return null;

    const intel = INTEL[target];
    const levelTarget = computeOpLevelTarget(target, opMemory, intel);

    if (entry.closestRoom) {
        const assigned = resolveAssignment(room, target, opMemory, levelTarget, entry, intel);
        if (assigned !== room.name) return null;
    } else if (opMemory.assignedRoom && opMemory.assignedRoom !== room.name) {
        return null;
    }

    //if (!room.memory.combatReady && !CRITICAL_OP_TYPES.has(opMemory.type)) return null;

    if (room.level < levelTarget) return null;

    return {...entry};
}

function computeOpLevelTarget(target, opMemory, intel) {
    if (Memory.auxiliaryTargets[target]) return MAX_LEVEL - 1;
    switch (opMemory.type) {
        case 'scout':
            return 1;
        case 'claim':
            return 5;
        case 'roomDenial': {
            const towers = (intel && intel.towers) || 0;
            if (towers >= 2) return 7;
            if (towers === 1) return 6;
            return 4;
        }
        case 'guard':
            return 5;
    }
    if (intel && intel.user) return Math.max(1, (intel.level || 4) - 1);
    if (intel) return 4;
    return MAX_LEVEL;
}

function resolveAssignment(room, target, opMemory, levelTarget, entry, intel) {
    const now = Game.time;
    if (opMemory.assignedRoom) {
        const assigned = Game.rooms[opMemory.assignedRoom];
        if (!assigned) return opMemory.assignedRoom;

        if (Memory.targetRooms[target] && !assigned.memory.combatReady) {
            if (!opMemory.assignmentEnergyCounter) opMemory.assignmentEnergyCounter = 0;
            if (opMemory.assignmentEnergyCounter > 100) {
                unassignRoom(target, 'Room is not combat ready.');
            }
            opMemory.assignmentEnergyCounter++;
            return opMemory.assignedRoom;
        } else if (Memory.auxiliaryTargets[target] && !assigned.memory.auxilaryReady) {
            if (!opMemory.assignmentEnergyCounter) opMemory.assignmentEnergyCounter = 0;
            if (opMemory.assignmentEnergyCounter > 100) {
                unassignRoom(target, 'Room is not auxiliary ready.');
            }
            opMemory.assignmentEnergyCounter++;
            return opMemory.assignedRoom;
        }

        const stale = opMemory.assignedAt && opMemory.assignedAt + (CREEP_LIFE_TIME * 2) < now;

        if (!stale) return opMemory.assignedRoom;

        if (stale) {
            const assignedRoom = Game.rooms[opMemory.assignedRoom];
            const inflight = assignedRoom && assignedRoom.myCreeps.some(c =>
                c.memory.waitingToAssemble &&
                (c.memory.destination === target ||
                    (c.memory.other && c.memory.other.assignment === target)));
            if (inflight) return opMemory.assignedRoom;
            unassignRoom(target, 'Refreshing assignment.');
        }
    }

    if (!intel) return null;

    const resolved = getAssignedRoom(target, levelTarget, entry);
    if (!resolved) return null;

    opMemory.assignedRoom = resolved;
    opMemory.assignedAt = now;
    log.a(`Assigning the operation in ${roomLink(target)} to ${roomLink(resolved)}`, 'OPERATIONS:');
    return resolved;
}

function getAssignedRoom(targetRoom, level, creepInfo) {
    if (assignmentCooldown[targetRoom] && assignmentCooldown[targetRoom] > Game.time) return null;

    let assignmentCounts = {};
    for (const op of Object.values(Memory.targetRooms)) {
        if (op && op.assignedRoom) assignmentCounts[op.assignedRoom] = (assignmentCounts[op.assignedRoom] || 0) + 1;
    }
    for (const op of Object.values(Memory.auxiliaryTargets)) {
        if (op && op.assignedRoom) assignmentCounts[op.assignedRoom] = (assignmentCounts[op.assignedRoom] || 0) + 1;
    }

    const candidates = MY_ROOMS
        .filter((key) => key !== targetRoom)
        .map((key) => ({key, linear: Game.map.getRoomLinearDistance(targetRoom, key)}))
        .sort((a, b) => a.linear - b.linear);

    const maxDistance = CLAIM_ROLES.has(creepInfo.role) ? 12 : 22;

    let closest = null;
    let closestDistance = Infinity;

    for (const {key, linear} of candidates) {
        if (linear >= closestDistance) break;
        const myRoom = Game.rooms[key];
        if (!myRoom) continue;
        if (myRoom.controller.level !== myRoom.level || myRoom.downgraded || !myRoom.memory.combatReady) continue;
        if (myRoom.level < level) continue;

        if (Memory.targetRooms[key] && !myRoom.memory.combatReady) continue;
        if (Memory.auxiliaryTargets[key] && !myRoom.memory.auxilaryReady) continue;

        const route = myRoom.shibRoute(targetRoom);
        const distance = Array.isArray(route) && route.length ? route.length : Infinity;
        if (distance >= closestDistance || distance > maxDistance) continue;

        if ((assignmentCounts[key] || 0) >= CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][myRoom.level]) continue;

        const generatedInfo = new generator(myRoom.level, creepInfo.role, myRoom, creepInfo).generateBody();
        if (!generatedInfo || !generatedInfo.body || !generatedInfo.body.length) continue;

        closestDistance = distance;
        closest = key;
        if (distance === 1) break;
    }

    assignmentCooldown[targetRoom] = Game.time + 50;
    return closest;
}

function unassignRoom(destination, logEntry) {
    const opMemory = Memory.targetRooms[destination] || Memory.auxiliaryTargets[destination];
    if (!opMemory || !opMemory.assignedRoom) return;
    const fromRoom = opMemory.assignedRoom;
    delete opMemory.assignedRoom;
    delete opMemory.assignedAt;
    log.a(`Unassigning the operation in ${roomLink(destination)} from ${roomLink(fromRoom)}. ${logEntry}`, 'OPERATIONS:');
}

function getPriority(operationRoom) {
    const range = findClosestOwnedRoom(operationRoom, true);
    const typeMulti = Memory.targetRooms[operationRoom] ? 1 : 2;
    const op = Memory.targetRooms[operationRoom] || Memory.auxiliaryTargets[operationRoom];
    const colonyName = (op && op.assignedRoom) || findClosestOwnedRoom(operationRoom, false, 1);
    const colony = colonyName && Game.rooms[colonyName];
    const energyMulti = colony && colony.energyState < 2 ? 1.5 : 1;
    if (range <= 3) return (PRIORITIES.priority * typeMulti) * energyMulti;
    else if (range <= 5) return (PRIORITIES.urgent * typeMulti) * energyMulti;
    else if (range <= 7) return (PRIORITIES.high * typeMulti) * energyMulti;
    else if (range <= 10) return (PRIORITIES.medium * typeMulti) * energyMulti;
    else return (PRIORITIES.secondary * typeMulti) * energyMulti;
}

module.exports = {
    buildOperationsSignature,
    pruneEmptyOperations,
    collectGlobalOperations,
    unassignRoom,
    getPriority,
};