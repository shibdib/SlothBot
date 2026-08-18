/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Global military/auxiliary operation assignment and priority.
 */

const generator = require('module.bodyGenerator');
const {estimateClaimRouteTicks} = require('pathRoute');
const {
    isLiveAuxReady,
    isRoomReadyForTier,
    getOpTier,
    OP_TIER,
    roomMilitaryFlowSpare,
    roomStockpileRatio,
} = require('hcReadiness');
const {spawnEnergyState} = require('spawnFlow');

const CLAIM_ROLES = new Set(['claimer', 'claimAttacker', 'reserver']);
const HELPER_ROLES = new Set(['cleaner', 'claimAttacker', 'remoteHauler']);
const HELPER_LEVEL = 4;
const INVISIBLE_ASSIGNMENT_TIMEOUT = 50;
const ASSIGNMENT_FAILURE_COOLDOWN = 5;
const LOAD_PER_SPAWN_CAP = 6;
const ROLE_ASSIGN_WEIGHT = {
    longbowSquad: 100,
    siegeDuo: 90,
    longbow: 80,
    attacker: 70,
    SKAttacker: 70,
    claimAttacker: 40,
    cleaner: 20,
    scout: 10
};
const assignmentCooldown = {};
let militaryLoadCache = {tick: -1, loads: null};
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
            if (!isRoomReadyForTier(room, OP_TIER.HARASS)) return null;
        }
        return {...entry};
    }
    if (entry.destination === room.name) return null;

    const target = entry.other && entry.other.assignment ? entry.other.assignment : entry.destination;
    const opMemory = Memory.targetRooms[target] || Memory.auxiliaryTargets[target];
    if (!opMemory) return null;

    const intel = INTEL[target];
    const levelTarget = computeOpLevelTarget(target, opMemory, intel);

    if (HELPER_ROLES.has(entry.role)) {
        if (room.level < HELPER_LEVEL) return null;
        const winner = getAssignedRoom(target, HELPER_LEVEL, entry, {helper: true});
        if (winner !== room.name) return null;
        return {...entry};
    }

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

function hasInflightOpCreeps(target, operation) {
    const matches = (c) => {
        if (!c || !c.my || !c.memory) return false;
        const destMatch = c.memory.destination === target
            || !!(c.memory.other && c.memory.other.assignment === target);
        if (!destMatch) return false;
        if (operation && c.memory.operation && c.memory.operation !== operation) return false;
        return true;
    };
    const pool = global.world && global.world.militaryCreeps;
    if (pool) {
        for (let i = 0; i < pool.length; i++) {
            if (matches(pool[i])) return true;
        }
        return false;
    }
    for (const name in Game.creeps) {
        if (matches(Game.creeps[name])) return true;
    }
    return false;
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
            if (hasInflightOpCreeps(target, opMemory.type)) return opMemory.assignedRoom;
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
            if (hasInflightOpCreeps(target, opMemory.type)) return opMemory.assignedRoom;
            if (handleInvisibleAssignmentWait(target, opMemory)) return opMemory.assignedRoom;
        } else {
            if (Memory.targetRooms[target]) {
                const tier = getOpTier(opMemory, entry);
                if (!isRoomReadyForTier(assigned, tier)) {
                    if (hasInflightOpCreeps(target, opMemory.type)) return opMemory.assignedRoom;
                    return handleAssignmentReadinessWait(room, target, opMemory, 'Room is not combat ready.');
                }
            } else if (Memory.auxiliaryTargets[target] && !isLiveAuxReady(assigned)) {
                if (hasInflightOpCreeps(target, opMemory.type)) return opMemory.assignedRoom;
                return handleAssignmentReadinessWait(room, target, opMemory, 'Room is not auxiliary ready.');
            }

            clearAssignmentWaitState(opMemory);

            const stale = opMemory.assignedAt && opMemory.assignedAt + (CREEP_LIFE_TIME * 2) < now;
            if (!stale) return opMemory.assignedRoom;
            if (hasInflightOpCreeps(target, opMemory.type)) return opMemory.assignedRoom;
            unassignRoom(target, 'Refreshing assignment.');
        }
    }

    if (!intel && !assignmentAllowsMissingIntel(opMemory, entry)) return null;

    const resolved = getAssignedRoom(target, levelTarget, heaviestQueuedEntry(target, entry));
    if (!resolved) return null;

    opMemory.assignedRoom = resolved;
    opMemory.assignedAt = now;
    clearAssignmentWaitState(opMemory);
    log.a(`Assigning the operation in ${roomLink(target)} to ${roomLink(resolved)}`, 'OPERATIONS:');
    return resolved;
}

function roleAssignWeight(role) {
    return ROLE_ASSIGN_WEIGHT[role] || 0;
}

function heaviestQueuedEntry(targetRoom, fallback) {
    const globalQueue = CREEP_QUEUES['global'];
    let best = fallback;
    let bestW = roleAssignWeight(fallback && fallback.role);
    if (!globalQueue) return best;
    for (const key in globalQueue) {
        const e = globalQueue[key];
        const dest = e.destination || (e.other && e.other.assignment);
        if (dest !== targetRoom) continue;
        const w = roleAssignWeight(e.role);
        if (w > bestW) {
            bestW = w;
            best = e;
        }
    }
    return best;
}

function getMilitaryLoadByColony() {
    if (militaryLoadCache.tick === Game.time) return militaryLoadCache.loads;
    const loads = {};
    const bump = (room, n) => {
        if (room) loads[room] = (loads[room] || 0) + n;
    };
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c.my || !c.memory) continue;
        if (!c.memory.military && !c.memory.operation) continue;
        bump(c.memory.colony, 1);
    }
    const globalQueue = CREEP_QUEUES['global'] || {};
    for (const key in globalQueue) {
        const e = globalQueue[key];
        const dest = e.destination || (e.other && e.other.assignment);
        if (!dest) continue;
        const op = Memory.targetRooms[dest] || Memory.auxiliaryTargets[dest];
        if (op && op.assignedRoom) bump(op.assignedRoom, 1);
    }
    militaryLoadCache = {tick: Game.time, loads};
    return loads;
}

function getAssignedRoomCacheKey(targetRoom, level, creepInfo) {
    return `${targetRoom}:${level}:${creepInfo.role || ''}`;
}

function isBetterAssignmentCandidate(score, distance, load, key, best) {
    if (!best) return true;
    if (score < best.score) return true;
    if (score > best.score) return false;
    if (distance < best.distance) return true;
    if (distance > best.distance) return false;
    if (load < best.load) return true;
    if (load > best.load) return false;
    return key < best.key;
}

function computeAssignmentScore(myRoom, routeDistance, load, isAuxiliary) {
    let score = routeDistance;

    const energyState = spawnEnergyState(myRoom) || 0;
    const ei = myRoom.memory.energyInfo;
    const trend = (ei && ei.trend) || 0;
    const flowSpare = roomMilitaryFlowSpare(myRoom);
    const flowStressed = flowSpare < 0 || trend < -2;
    const stocked = roomStockpileRatio(myRoom) >= 0.8;
    const flowReady = (energyState >= 2 || stocked) && trend >= 0 && flowSpare >= 4;

    const energyWeight = isAuxiliary ? 3 : 6;
    if (energyState < 3) score += (3 - energyState) * energyWeight;

    if (flowStressed) score += isAuxiliary ? 6 : 14;
    else if (!isAuxiliary && energyState < 2 && !stocked) score += 5;

    if (flowSpare < 0) score += isAuxiliary ? 5 : 10;
    else if (flowSpare < 4) score += isAuxiliary ? 2 : 4;
    else if (flowReady) score -= 4;

    const spawnCap = CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][myRoom.level];
    if (spawnCap > 0) score += (load / spawnCap) * 4;

    return score;
}

function getAssignedRoom(targetRoom, level, creepInfo, options = {}) {
    const cacheKey = getAssignedRoomCacheKey(targetRoom, level, creepInfo) + (options.helper ? ':h' : '');
    if (assignedRoomCache.tick === Game.time &&
        Object.prototype.hasOwnProperty.call(assignedRoomCache.results, cacheKey)) {
        return assignedRoomCache.results[cacheKey];
    }
    if (assignedRoomCache.tick !== Game.time) assignedRoomCache = {tick: Game.time, results: {}};

    if (!options.helper && assignmentCooldown[targetRoom] && assignmentCooldown[targetRoom] > Game.time) {
        assignedRoomCache.results[cacheKey] = null;
        return null;
    }

    const loads = getMilitaryLoadByColony();
    const isAuxiliary = !!Memory.auxiliaryTargets[targetRoom];
    const opType = Memory.targetRooms[targetRoom] && Memory.targetRooms[targetRoom].type;
    const isHelper = !!options.helper || HELPER_ROLES.has(creepInfo.role);
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

        const tier = isHelper || isAuxiliary || isScout
            ? OP_TIER.HARASS
            : getOpTier({type: opType}, creepInfo);
        if (!isRoomReadyForTier(myRoom, tier)) continue;

        const distance = myRoom.routeDistance(targetRoom, isClaimRole ? {shortest: true} : {});
        if (distance > maxDistance) continue;
        if (isClaimRole && estimateClaimRouteTicks(distance) > CREEP_CLAIM_LIFE_TIME - 10) continue;

        const spawnCap = CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][myRoom.level] || 1;
        const load = loads[key] || 0;
        if (load >= spawnCap * LOAD_PER_SPAWN_CAP) continue;

        const generatedInfo = new generator(myRoom.level, creepInfo.role, myRoom, creepInfo).generateBody();
        if (!generatedInfo || !generatedInfo.body || !generatedInfo.body.length) continue;

        const score = computeAssignmentScore(myRoom, distance, load, isAuxiliary);
        if (isBetterAssignmentCandidate(score, distance, load, key, best)) {
            best = {key, score, distance, load};
        }
    }

    const resolved = best ? best.key : null;
    assignedRoomCache.results[cacheKey] = resolved;
    if (!resolved && !options.helper) assignmentCooldown[targetRoom] = Game.time + ASSIGNMENT_FAILURE_COOLDOWN;
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
    delete assignmentCooldown[destination];
    log.a(`Unassigning the operation in ${roomLink(destination)} from ${roomLink(fromRoom)}. ${logEntry}`, 'OPERATIONS:');
}

function getPriority(operationRoom) {
    const range = findClosestOwnedRoom(operationRoom, true);
    const typeMulti = Memory.targetRooms[operationRoom] ? 1 : 2;
    const op = Memory.targetRooms[operationRoom] || Memory.auxiliaryTargets[operationRoom];
    const colonyName = (op && op.assignedRoom) || findClosestOwnedRoom(operationRoom, false, 1);
    const colony = colonyName && Game.rooms[colonyName];
    const energyMulti = colony && spawnEnergyState(colony) < 2 ? 1.5 : 1;
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