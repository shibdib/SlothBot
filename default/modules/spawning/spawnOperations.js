/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Global military/auxiliary operation assignment and priority.
 */

const generator = require('module.bodyGenerator');
const {estimateClaimRouteTicks} = require('pathRoute');
const {isLiveCombatReady, isRoomStruggling} = require('hcReadiness');

const CLAIM_ROLES = new Set(['claimer', 'claimAttacker', 'reserver']);
const INVISIBLE_ASSIGNMENT_TIMEOUT = 50;
const ASSIGNMENT_SUCCESS_COOLDOWN = 50;
const ASSIGNMENT_FAILURE_COOLDOWN = 5;
const assignmentCooldown = {};
let assignmentCountsCache = {tick: -1, counts: null};
let assignedRoomCache = {tick: -1, results: {}};

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
    if (!entry.destination) {
        if (entry.operation === 'harass') {
            const minLevel = Math.max(4, MAX_LEVEL - 2);
            if (room.level < minLevel || !isLiveCombatReady(room) || isRoomStruggling(room)) return null;
        }
        return {...entry};
    }
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

    if (room.level < levelTarget) return null;

    return {...entry};
}

function computeOpLevelTarget(target, opMemory, intel) {
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
    if (Memory.auxiliaryTargets[target]) return MAX_LEVEL - 1;
    if (intel && intel.user) return Math.max(1, (intel.level || 4) - 1);
    if (intel) return 4;
    return MAX_LEVEL;
}

function clearAssignmentWaitState(opMemory) {
    delete opMemory.assignmentEnergyCounter;
    delete opMemory.assignmentEnergyLastTick;
    delete opMemory.assignmentInvisibleCounter;
    delete opMemory.assignmentInvisibleLastTick;
}

function assignmentAllowsMissingIntel(opMemory, entry) {
    return opMemory.type === 'scout' || entry.role === 'scout';
}

function handleInvisibleAssignmentWait(target, opMemory) {
    const now = Game.time;
    if (opMemory.assignmentInvisibleLastTick !== now) {
        opMemory.assignmentInvisibleCounter = (opMemory.assignmentInvisibleCounter || 0) + 1;
        opMemory.assignmentInvisibleLastTick = now;
        if (opMemory.assignmentInvisibleCounter > INVISIBLE_ASSIGNMENT_TIMEOUT) {
            unassignRoom(target, 'Assigned room is not visible.');
            return false;
        }
    }
    return true;
}

function handleAssignmentReadinessWait(room, target, opMemory, reason) {
    if (room.name !== opMemory.assignedRoom) return opMemory.assignedRoom;

    const now = Game.time;
    if (opMemory.assignmentEnergyLastTick !== now) {
        opMemory.assignmentEnergyCounter = (opMemory.assignmentEnergyCounter || 0) + 1;
        opMemory.assignmentEnergyLastTick = now;
        if (opMemory.assignmentEnergyCounter > 100) {
            unassignRoom(target, reason);
            return null;
        }
    }
    return opMemory.assignedRoom;
}

function resolveAssignment(room, target, opMemory, levelTarget, entry, intel) {
    const now = Game.time;
    if (opMemory.assignedRoom) {
        const assigned = Game.rooms[opMemory.assignedRoom];
        if (!assigned) {
            if (handleInvisibleAssignmentWait(target, opMemory)) return opMemory.assignedRoom;
        } else if (Memory.targetRooms[target] && !assigned.memory.combatReady) {
            const held = handleAssignmentReadinessWait(room, target, opMemory, 'Room is not combat ready.');
            if (held) return held;
        } else if (Memory.auxiliaryTargets[target] && !assigned.memory.auxilaryReady) {
            const held = handleAssignmentReadinessWait(room, target, opMemory, 'Room is not auxiliary ready.');
            if (held) return held;
        } else {
            clearAssignmentWaitState(opMemory);

            const stale = opMemory.assignedAt && opMemory.assignedAt + (CREEP_LIFE_TIME * 2) < now;
            if (!stale) return opMemory.assignedRoom;

            const inflight = assigned.myCreeps.some(c =>
                c.memory.waitingToAssemble &&
                (c.memory.destination === target ||
                    (c.memory.other && c.memory.other.assignment === target)));
            if (inflight) return opMemory.assignedRoom;
            unassignRoom(target, 'Refreshing assignment.');
        }
    }

    if (!intel && !assignmentAllowsMissingIntel(opMemory, entry)) return null;

    const resolved = getAssignedRoom(target, levelTarget, entry);
    if (!resolved) return null;

    opMemory.assignedRoom = resolved;
    opMemory.assignedAt = now;
    clearAssignmentWaitState(opMemory);
    log.a(`Assigning the operation in ${roomLink(target)} to ${roomLink(resolved)}`, 'OPERATIONS:');
    return resolved;
}

function getAssignmentCounts() {
    if (assignmentCountsCache.tick === Game.time) return assignmentCountsCache.counts;

    const counts = {};
    for (const op of Object.values(Memory.targetRooms)) {
        if (op && op.assignedRoom) counts[op.assignedRoom] = (counts[op.assignedRoom] || 0) + 1;
    }
    for (const op of Object.values(Memory.auxiliaryTargets)) {
        if (op && op.assignedRoom) counts[op.assignedRoom] = (counts[op.assignedRoom] || 0) + 1;
    }

    assignmentCountsCache = {tick: Game.time, counts};
    return counts;
}

function getAssignedRoomCacheKey(targetRoom, level, creepInfo) {
    return `${targetRoom}:${level}:${creepInfo.role || ''}`;
}

function isBetterAssignmentCandidate(score, distance, assignedOps, key, best) {
    if (!best) return true;
    if (score < best.score) return true;
    if (score > best.score) return false;
    if (distance < best.distance) return true;
    if (distance > best.distance) return false;
    if (assignedOps < best.assignedOps) return true;
    if (assignedOps > best.assignedOps) return false;
    return key < best.key;
}

function computeAssignmentScore(myRoom, routeDistance, assignmentCount, isAuxiliary) {
    let score = routeDistance;

    const energyState = myRoom.energyState || 0;
    const ei = myRoom.memory.energyInfo;
    const spare = (ei && ei.spareIncome) || 0;
    const trend = (ei && ei.trend) || 0;
    const flowStressed = spare < 0 || trend < -3;
    const flowReady = energyState >= 2 && trend >= 0 && spare >= 8;

    const energyWeight = isAuxiliary ? 3 : 6;
    if (energyState < 3) score += (3 - energyState) * energyWeight;

    if (flowStressed) score += isAuxiliary ? 6 : 14;
    else if (!isAuxiliary && energyState < 2) score += 8;

    if (spare < 0) score += isAuxiliary ? 5 : 12;
    else if (spare < 4) score += isAuxiliary ? 2 : 5;
    else if (flowReady) score -= 4;

    const spawnCap = CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][myRoom.level];
    if (spawnCap > 0) score += (assignmentCount / spawnCap) * 5;

    return score;
}

function getAssignedRoom(targetRoom, level, creepInfo) {
    const cacheKey = getAssignedRoomCacheKey(targetRoom, level, creepInfo);
    if (assignedRoomCache.tick === Game.time &&
        Object.prototype.hasOwnProperty.call(assignedRoomCache.results, cacheKey)) {
        return assignedRoomCache.results[cacheKey];
    }
    if (assignedRoomCache.tick !== Game.time) assignedRoomCache = {tick: Game.time, results: {}};

    if (assignmentCooldown[targetRoom] && assignmentCooldown[targetRoom] > Game.time) {
        assignedRoomCache.results[cacheKey] = null;
        return null;
    }

    const assignmentCounts = getAssignmentCounts();
    const isAuxiliary = !!Memory.auxiliaryTargets[targetRoom];
    const opType = Memory.targetRooms[targetRoom] && Memory.targetRooms[targetRoom].type;
    const isScout = opType === 'scout' || creepInfo.role === 'scout';
    const isClaimRole = CLAIM_ROLES.has(creepInfo.role);
    const maxDistance = isClaimRole ? 12 : 22;

    let best = null;
    for (const key of MY_ROOMS) {
        if (key === targetRoom) continue;

        const myRoom = Game.rooms[key];
        if (!myRoom) continue;
        if (myRoom.controller.level !== myRoom.level || myRoom.downgraded) continue;
        if (myRoom.level < level) continue;

        if (isAuxiliary) {
            if (!myRoom.memory.auxilaryReady) continue;
        } else if (!isScout && !myRoom.memory.combatReady) {
            continue;
        }

        const route = myRoom.shibRoute(targetRoom, isClaimRole ? {shortest: true} : {});
        const distance = Array.isArray(route) && route.length ? route.length : Infinity;
        if (distance > maxDistance) continue;
        if (isClaimRole && estimateClaimRouteTicks(distance) > CREEP_CLAIM_LIFE_TIME - 10) continue;

        const assignedOps = assignmentCounts[key] || 0;
        if (assignedOps >= CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][myRoom.level]) continue;

        const generatedInfo = new generator(myRoom.level, creepInfo.role, myRoom, creepInfo).generateBody();
        if (!generatedInfo || !generatedInfo.body || !generatedInfo.body.length) continue;

        const score = computeAssignmentScore(myRoom, distance, assignedOps, isAuxiliary);
        if (isBetterAssignmentCandidate(score, distance, assignedOps, key, best)) {
            best = {key, score, distance, assignedOps};
        }
    }

    const resolved = best ? best.key : null;
    assignedRoomCache.results[cacheKey] = resolved;
    assignmentCooldown[targetRoom] = Game.time + (resolved ? ASSIGNMENT_SUCCESS_COOLDOWN : ASSIGNMENT_FAILURE_COOLDOWN);
    return resolved;
}

function unassignRoom(destination, logEntry) {
    const opMemory = Memory.targetRooms[destination] || Memory.auxiliaryTargets[destination];
    if (!opMemory || !opMemory.assignedRoom) return;
    const fromRoom = opMemory.assignedRoom;
    delete opMemory.assignedRoom;
    delete opMemory.assignedAt;
    delete opMemory.assignmentEnergyCounter;
    delete opMemory.assignmentEnergyLastTick;
    delete opMemory.assignmentInvisibleCounter;
    delete opMemory.assignmentInvisibleLastTick;
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