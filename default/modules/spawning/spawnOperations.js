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
const {isOptionalSiegeBoost} = require('bodySiegeBoosts');

const CLAIM_ROLES = new Set(['claimer', 'claimAttacker', 'reserver']);
const HELPER_ROLES = new Set(['cleaner', 'claimAttacker', 'remoteHauler']);
const HELPER_LEVEL = 4;
const INVISIBLE_ASSIGNMENT_TIMEOUT = 50;
const ASSIGNMENT_FAILURE_COOLDOWN = 5;
const ROOM_ASSIGN_EXCLUDE = 100;
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
const assignmentExcludeUntil = {};
let militaryLoadCache = {tick: -1, loads: null};
let assignedRoomCache = {tick: -1, results: {}};
let assignmentResolvedTick = -1;

function invalidateAssignmentCaches() {
    assignedRoomCache = {tick: -1, results: {}};
    militaryLoadCache = {tick: -1, loads: null};
}

function markAssignmentExclude(destination, roomName) {
    if (!destination || !roomName) return;
    assignmentExcludeUntil[`${destination}|${roomName}`] = Game.time + ROOM_ASSIGN_EXCLUDE;
}

function isAssignmentExcluded(destination, roomName) {
    const key = `${destination}|${roomName}`;
    const until = assignmentExcludeUntil[key];
    if (!until) return false;
    if (until <= Game.time) {
        delete assignmentExcludeUntil[key];
        return false;
    }
    return true;
}

function cloneCreepInfo(creepInfo) {
    if (!creepInfo) return {};
    const clone = Object.assign({}, creepInfo);
    clone.other = Object.assign({}, creepInfo.other || {});
    clone.misc = Object.assign({}, creepInfo.misc || {});
    if (clone.misc.boosts) clone.misc.boosts = clone.misc.boosts.slice();
    clone.body = undefined;
    clone.neededBoosts = undefined;
    return clone;
}

// Body-gen already refused rooms that cannot field required HEAL/TOUGH.
// Listed RA/MOVE are optional lab boosts — requiring full-part mineral
// stock here unassigned rooms that could still spawn, then reassigned them.
function generatedBodyMissingBoosts(room, body, creepInfo) {
    if (!room || !body || !body.length) return true;
    const nb = creepInfo && creepInfo.neededBoosts;
    if (!nb) return false;
    const short = (part, boost) => {
        if (!boost || !body.includes(part)) return false;
        return room.store(boost) < LAB_BOOST_MINERAL * body.filter(p => p === part).length;
    };
    if (nb.boost && nb.boostPart && short(nb.boostPart, nb.boost)) return true;
    if (short(TOUGH, nb.toughBoost)) return true;
    if (short(MOVE, nb.moveBoost)) return true;
    return false;
}

function optionalBoostPenalty(room, creepInfo, body) {
    const wanted = [];
    const add = (list) => {
        if (!list) return;
        for (let i = 0; i < list.length; i++) {
            const part = list[i];
            if (!isOptionalSiegeBoost(part)) continue;
            if (!wanted.includes(part)) wanted.push(part);
        }
    };
    const dest = creepInfo && creepInfo.destination;
    const op = dest && (Memory.targetRooms[dest] || Memory.auxiliaryTargets[dest]);
    add(op && op.optionalBoosts);
    add(creepInfo && creepInfo.misc && creepInfo.misc.boosts);
    let penalty = 0;
    for (let i = 0; i < wanted.length; i++) {
        const part = wanted[i];
        if (!body.includes(part) || !BOOST_USE || !BOOST_USE[part]) continue;
        const needed = LAB_BOOST_MINERAL * body.filter(p => p === part).length;
        const tiers = BOOST_USE[part];
        let stocked = false;
        for (let t = 0; t < tiers.length; t++) {
            if (room.store(tiers[t]) >= needed) {
                stocked = true;
                break;
            }
        }
        if (!stocked) penalty += 3;
    }
    return penalty;
}

function tryGenerateAssignableBody(room, creepInfo, destination) {
    const op = destination && (Memory.targetRooms[destination] || Memory.auxiliaryTargets[destination]);
    const prevTier = op ? op.boostTier : undefined;
    const clone = cloneCreepInfo(creepInfo);
    let generatedInfo;
    try {
        generatedInfo = new generator(room.level, clone.role, room, clone).generateBody();
    } finally {
        if (op) {
            if (prevTier === undefined) delete op.boostTier;
            else op.boostTier = prevTier;
        }
    }
    if (!generatedInfo || !generatedInfo.body || !generatedInfo.body.length) return null;
    if (generatedBodyMissingBoosts(room, generatedInfo.body, clone)) return null;
    return {body: generatedInfo.body, info: clone};
}

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

function entryTarget(entry) {
    if (!entry) return undefined;
    return (entry.other && entry.other.assignment) || entry.destination;
}

function resolvePendingAssignments(force) {
    if (!force && assignmentResolvedTick === Game.time) return;
    assignmentResolvedTick = Game.time;

    const seen = {};
    const consider = (target, fallbackEntry) => {
        if (!target || seen[target]) return;
        const opMemory = Memory.targetRooms[target] || Memory.auxiliaryTargets[target];
        if (!opMemory) return;
        seen[target] = true;
        const intel = INTEL[target];
        const levelTarget = computeOpLevelTarget(target, opMemory, intel);
        const entry = heaviestQueuedEntry(target, fallbackEntry || {role: 'longbow', destination: target});
        resolveAssignment(target, opMemory, levelTarget, entry, intel);
    };

    const globalQueue = CREEP_QUEUES['global'] || {};
    for (const key in globalQueue) {
        const entry = globalQueue[key];
        if (!entry || !entry.destination) continue;
        consider(entryTarget(entry), entry);
    }

    for (const target in Memory.targetRooms || {}) {
        if (Memory.targetRooms[target] && Memory.targetRooms[target].assignedRoom) consider(target);
    }
    for (const target in Memory.auxiliaryTargets || {}) {
        if (Memory.auxiliaryTargets[target] && Memory.auxiliaryTargets[target].assignedRoom) consider(target);
    }
}

function collectGlobalOperations(room) {
    resolvePendingAssignments();
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

    const target = entryTarget(entry);
    const opMemory = Memory.targetRooms[target] || Memory.auxiliaryTargets[target];
    if (!opMemory || opMemory.assignedRoom !== room.name) return null;

    if (HELPER_ROLES.has(entry.role)) {
        if (room.level < HELPER_LEVEL) return null;
        return {...entry};
    }

    const levelTarget = computeOpLevelTarget(target, opMemory, INTEL[target]);
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
        case 'stronghold': {
            const towers = (intel && intel.towers) || 0;
            return towers >= 2 ? 8 : 7;
        }
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
    return opMemory.type === 'scout' || !!(entry && entry.role === 'scout');
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

function handleAssignmentReadinessWait(target, opMemory, reason) {
    if (!opMemory.assignedRoom || !Game.rooms[opMemory.assignedRoom]) return opMemory.assignedRoom;

    const now = Game.time;
    if (opMemory.assignmentEnergyLastTick !== now) {
        opMemory.assignmentEnergyCounter = (opMemory.assignmentEnergyCounter || 0) + 1;
        opMemory.assignmentEnergyLastTick = now;
        if (opMemory.assignmentEnergyCounter > 100) {
            if (hasInflightOpCreeps(target, opMemory.type)) return opMemory.assignedRoom;
            unassignRoom(target, reason, {excludeRoom: true, cooldown: true});
            return null;
        }
    }
    return opMemory.assignedRoom;
}

function resolveAssignment(target, opMemory, levelTarget, entry, intel) {
    const now = Game.time;
    if (opMemory.assignedRoom) {
        const assigned = Game.rooms[opMemory.assignedRoom];
        // Intel can raise levelTarget (1 tower → 2) while a low-RCL room is
        // sticky. considerGlobalEntry then rejects that room AND every other
        // room (not assigned) — nothing spawns. Inflight creeps do not keep
        // an under-level assignee; retargetFormingWaitForColony sends remnants.
        if (assigned && assigned.level < levelTarget) {
            unassignRoom(target, 'Assigned room is below operation level.');
        } else if (!assigned) {
            if (hasInflightOpCreeps(target, opMemory.type)) return opMemory.assignedRoom;
            if (handleInvisibleAssignmentWait(target, opMemory)) return opMemory.assignedRoom;
        } else {
            if (Memory.targetRooms[target]) {
                const tier = getOpTier(opMemory, entry);
                if (!isRoomReadyForTier(assigned, tier)) {
                    if (hasInflightOpCreeps(target, opMemory.type)) return opMemory.assignedRoom;
                    return handleAssignmentReadinessWait(target, opMemory, 'Room is not combat ready.');
                }
            } else if (Memory.auxiliaryTargets[target] && !isLiveAuxReady(assigned)) {
                if (hasInflightOpCreeps(target, opMemory.type)) return opMemory.assignedRoom;
                return handleAssignmentReadinessWait(target, opMemory, 'Room is not auxiliary ready.');
            }

            clearAssignmentWaitState(opMemory);

            const stale = opMemory.assignedAt && opMemory.assignedAt + (CREEP_LIFE_TIME * 2) < now;
            if (!stale) return opMemory.assignedRoom;
            if (hasInflightOpCreeps(target, opMemory.type)) return opMemory.assignedRoom;
            return refreshStaleAssignment(target, opMemory, levelTarget, entry);
        }
    }

    if (!intel && !assignmentAllowsMissingIntel(opMemory, entry)) return null;

    const resolved = getAssignedRoom(target, levelTarget, heaviestQueuedEntry(target, entry));
    if (!resolved) return null;

    opMemory.assignedRoom = resolved;
    opMemory.assignedAt = now;
    clearAssignmentWaitState(opMemory);
    retargetFormingWaitForColony(target, entry && entry.operation, resolved);
    log.a(`Assigning the operation in ${roomLink(target)} to ${roomLink(resolved)}`, 'OPERATIONS:');
    return resolved;
}

function refreshStaleAssignment(target, opMemory, levelTarget, entry) {
    const previous = opMemory.assignedRoom;
    markAssignmentExclude(target, previous);
    invalidateAssignmentCaches();
    const resolved = getAssignedRoom(target, levelTarget, heaviestQueuedEntry(target, entry));
    if (!resolved) {
        delete assignmentExcludeUntil[`${target}|${previous}`];
        opMemory.assignedAt = Game.time;
        return previous;
    }
    unassignRoom(target, 'Refreshing assignment.');
    opMemory.assignedRoom = resolved;
    opMemory.assignedAt = Game.time;
    clearAssignmentWaitState(opMemory);
    retargetFormingWaitForColony(target, entry && entry.operation, resolved);
    log.a(`Assigning the operation in ${roomLink(target)} to ${roomLink(resolved)}`, 'OPERATIONS:');
    return resolved;
}

function retargetFormingWaitForColony(target, operation, newColony) {
    if (!target || !newColony) return;
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c.my || !c.memory) continue;
        if (c.memory.destination !== target) continue;
        if (operation && c.memory.operation && c.memory.operation !== operation) continue;
        if (c.memory.initialFormUp || (c.memory.misc && c.memory.misc.sealed)) continue;
        const waitFor = c.memory.misc && c.memory.misc.waitFor;
        if (!(waitFor > 1)) continue;
        const home = (c.memory.misc && c.memory.misc.formColony) || c.memory.colony;
        if (home === newColony) continue;
        if (!c.memory.misc) c.memory.misc = {};
        c.memory.misc.formColony = newColony;
    }
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
        const dest = entryTarget(e);
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
        const dest = entryTarget(e);
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

function getAssignedRoom(targetRoom, level, creepInfo) {
    if (!creepInfo) creepInfo = {role: 'longbow', destination: targetRoom};
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

    const loads = getMilitaryLoadByColony();
    const isAuxiliary = !!Memory.auxiliaryTargets[targetRoom];
    const opType = Memory.targetRooms[targetRoom] && Memory.targetRooms[targetRoom].type;
    const isHelper = HELPER_ROLES.has(creepInfo.role);
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

        if (isAssignmentExcluded(targetRoom, key)) continue;

        const spawnCap = CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][myRoom.level] || 1;
        const load = loads[key] || 0;
        if (load >= spawnCap * LOAD_PER_SPAWN_CAP) continue;

        const generated = tryGenerateAssignableBody(myRoom, creepInfo, targetRoom);
        if (!generated) continue;

        const score = computeAssignmentScore(myRoom, distance, load, isAuxiliary)
            + optionalBoostPenalty(myRoom, creepInfo, generated.body);
        if (isBetterAssignmentCandidate(score, distance, load, key, best)) {
            best = {key, score, distance, load};
        }
    }

    const resolved = best ? best.key : null;
    assignedRoomCache.results[cacheKey] = resolved;
    if (!resolved) assignmentCooldown[targetRoom] = Game.time + ASSIGNMENT_FAILURE_COOLDOWN;
    return resolved;
}

function releaseAssignmentIfStuck(room, destination, reason, creep) {
    const opMemory = Memory.targetRooms[destination] || Memory.auxiliaryTargets[destination];
    if (!opMemory || !room || opMemory.assignedRoom !== room.name) return;
    if (creep && HELPER_ROLES.has(creep.role)) return;
    if (hasInflightOpCreeps(destination, opMemory.type)) return;
    unassignRoom(destination, reason, {excludeRoom: true, cooldown: true});
}

function unassignRoom(destination, logEntry, options = {}) {
    const opMemory = Memory.targetRooms[destination] || Memory.auxiliaryTargets[destination];
    if (!opMemory || !opMemory.assignedRoom) return;
    const fromRoom = opMemory.assignedRoom;
    delete opMemory.assignedRoom;
    delete opMemory.assignedAt;
    delete opMemory.assignmentEnergyCounter;
    delete opMemory.assignmentEnergyLastTick;
    delete opMemory.assignmentInvisibleCounter;
    delete opMemory.assignmentInvisibleLastTick;
    if (options.excludeRoom) markAssignmentExclude(destination, fromRoom);
    if (options.cooldown) {
        assignmentCooldown[destination] = Game.time + ASSIGNMENT_FAILURE_COOLDOWN;
    } else {
        delete assignmentCooldown[destination];
    }
    invalidateAssignmentCaches();
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
    resolvePendingAssignments,
    collectGlobalOperations,
    unassignRoom,
    releaseAssignmentIfStuck,
    generatedBodyMissingBoosts,
    getPriority,
};

