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
const {scoreOriginMinLevel, empireDistance, empirePriority} = require('hcUtils');
const {getColonyRole} = require('module.colonyProfile');

const CLAIM_ROLES = new Set(['claimer', 'claimAttacker', 'reserver']);
const HELPER_ROLES = new Set(['cleaner', 'claimAttacker', 'remoteHauler']);
const HELPER_LEVEL = 4;
const INVISIBLE_ASSIGNMENT_TIMEOUT = 50;
const ASSIGNMENT_FAILURE_COOLDOWN = 5;
const ROOM_ASSIGN_EXCLUDE = 100;
const LOAD_PER_SPAWN_CAP = 6;
// BOOST_USE lists T3, T2, T1 so index 0/1/2. Each step equals this many route
// hops — otherwise a T1 body wins over a T3 room a few rooms farther.
const BOOST_TIER_WEIGHT = 4;
const WAVE_SHORTFALL_WEIGHT = 4;
const STEAL_MARGIN = 4;
const STEAL_CHECK_INTERVAL = 15;
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
const COLONY_ASSIGN_PENALTY = {
    launch: 0,
    frontier: 1,
    core: 3,
    outpost: 4,
};
const assignmentCooldown = {};
const assignmentExcludeUntil = {};
const stealCheckAt = {};
let militaryLoadCache = {tick: -1, loads: null};
let assignedRoomCache = {tick: -1, results: {}};
let waveBoostBodiesCache = {tick: -1, results: {}};
let assignmentResolvedTick = -1;

function invalidateAssignmentCaches() {
    assignedRoomCache = {tick: -1, results: {}};
    militaryLoadCache = {tick: -1, loads: null};
    waveBoostBodiesCache = {tick: -1, results: {}};
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

function bodyPartCount(body, part) {
    let n = 0;
    for (let i = 0; i < body.length; i++) {
        if (body[i] === part) n++;
    }
    return n;
}

function waveBodiesNeedingBoost(creepInfo, resource) {
    const waitFor = creepInfo && creepInfo.misc && creepInfo.misc.waitFor;
    if (!(waitFor > 1)) return 1;

    const role = creepInfo.role || '';
    const dest = creepInfo.destination || '';
    const op = creepInfo.operation || '';
    const cacheKey = `${role}|${dest}|${op}|${waitFor}|${resource || ''}`;
    if (waveBoostBodiesCache.tick !== Game.time) {
        waveBoostBodiesCache = {tick: Game.time, results: {}};
    }
    if (Object.prototype.hasOwnProperty.call(waveBoostBodiesCache.results, cacheKey)) {
        return waveBoostBodiesCache.results[cacheKey];
    }

    let live = 0;
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c.my || !c.memory) continue;
        if (creepOpDest(c) !== dest) continue;
        if (op && c.memory.operation && c.memory.operation !== op) continue;
        const r = c.memory.oldRole || c.memory.role || '';
        if (r !== role) continue;
        // Sealed bodies already left home. Counting them made a replacement
        // waitFor-4 look fully covered while the labs were empty.
        if (c.memory.misc && c.memory.misc.sealed) continue;
        if (c.memory.recycling) continue;
        // Live unboosted bodies already spawned. Requiring stock for the full
        // waitFor (4x) to pop the last body failed "Missing required boosts"
        // and unassigned the room with 3/4 sitting on the pad.
        live++;
    }

    const bodies = Math.max(0, waitFor - live);
    waveBoostBodiesCache.results[cacheKey] = bodies;
    return bodies;
}

// neededBoosts only — optional RA/MOVE stay scored, not gated.
// Fail if a required part is absent (truncated bodies used to pass).
// Stock must cover remaining wave bodies, not one.
function generatedBodyMissingBoosts(room, body, creepInfo) {
    if (!room || !body || !body.length) return true;
    const nb = creepInfo && creepInfo.neededBoosts;
    if (!nb) return false;

    const missing = (part, boost, expectedCount) => {
        if (!boost || !part) return false;
        const count = bodyPartCount(body, part);
        if (!count) return true;
        if (expectedCount && count < expectedCount) return true;
        const bodies = waveBodiesNeedingBoost(creepInfo, boost);
        if (bodies <= 0) return false;
        return room.store(boost) < LAB_BOOST_MINERAL * count * bodies;
    };

    if (missing(nb.boostPart, nb.boost, nb.amount)) return true;
    if (missing(TOUGH, nb.toughBoost, nb.toughCount)) return true;
    if (missing(MOVE, nb.moveBoost)) return true;
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
        let stockedTier = -1;
        for (let t = 0; t < tiers.length; t++) {
            if (room.store(tiers[t]) >= needed) {
                stockedTier = t;
                break;
            }
        }
        // T1 (+2) must still beat having no boost at all (+3).
        if (stockedTier < 0) penalty += 3;
        else if (stockedTier > 0) penalty += stockedTier;
    }
    return penalty;
}

function boostResourceTier(part, resource) {
    if (!part || !resource || !BOOST_USE || !BOOST_USE[part]) return -1;
    return BOOST_USE[part].indexOf(resource);
}

function waveBoostShortfall(room, body, part, resource, wave) {
    if (!resource || !part || wave <= 1 || !body || !body.length) return 0;
    const count = bodyPartCount(body, part);
    if (!count) return 0;
    const covered = Math.floor(room.store(resource) / (LAB_BOOST_MINERAL * count));
    return Math.max(0, wave - covered);
}

function boostQualityPenalty(room, creepInfo, body) {
    const nb = creepInfo && creepInfo.neededBoosts;
    if (!nb || !body || !body.length) return 0;

    let penalty = 0;
    const addTier = (part, resource, weight) => {
        const tier = boostResourceTier(part, resource);
        if (tier > 0) penalty += tier * weight;
    };
    addTier(nb.boostPart, nb.boost, BOOST_TIER_WEIGHT);
    addTier(TOUGH, nb.toughBoost, BOOST_TIER_WEIGHT);
    addTier(MOVE, nb.moveBoost, 2);

    const addWave = (part, resource) => {
        if (!resource) return;
        penalty += waveBoostShortfall(room, body, part, resource, waveBodiesNeedingBoost(creepInfo, resource)) * WAVE_SHORTFALL_WEIGHT;
    };
    addWave(nb.boostPart, nb.boost);
    addWave(TOUGH, nb.toughBoost);
    addWave(MOVE, nb.moveBoost);
    return penalty;
}

function tryGenerateAssignableBody(room, creepInfo) {
    const clone = cloneCreepInfo(creepInfo);
    const generatedInfo = new generator(room.level, clone.role, room, clone).generateBody();
    if (!generatedInfo || !generatedInfo.body || !generatedInfo.body.length) return null;
    const cost = global.UNIT_COST
        ? global.UNIT_COST(generatedInfo.body)
        : generatedInfo.body.reduce((sum, p) => sum + BODYPART_COST[p], 0);
    if (cost > room.energyCapacityAvailable) return null;
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
        const intel = INTEL[k];
        const towers = (intel && intel.towers) || 0;
        const defenders = intel && (intel.activeDefenders
            || (intel.armedHostile && Game.time - intel.armedHostile < CREEP_LIFE_TIME)) ? 1 : 0;
        sig += `t:${k}:${o.type || ''}:${o.tick || 0}:${o.level || 0}:${o.complete ? 1 : 0}:${o.builders ? 1 : 0}:${o.waves || 0}:${towers}:${defenders};`;
    }
    for (const k of Object.keys(aux).sort()) {
        const o = aux[k];
        if (!o) continue;
        sig += `a:${k}:${o.type || ''}:${o.tick || 0}:${o.level || 0}:${o.priority || 0}:${o.complete ? 1 : 0}:${o.haulers || 0};`;
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

function destAssignRank(target) {
    if (Memory.targetRooms && Memory.targetRooms[target]) {
        const d = empireDistance(target);
        return Number.isFinite(d) ? d : 99;
    }
    const d = findClosestOwnedRoom(target, true);
    return 1000 + (d == null ? 99 : d);
}

function resolvePendingAssignments(force) {
    if (!force && assignmentResolvedTick === Game.time) return;
    assignmentResolvedTick = Game.time;

    const seen = {};
    const pending = [];
    const consider = (target, fallbackEntry) => {
        if (!target || seen[target]) return;
        const opMemory = Memory.targetRooms[target] || Memory.auxiliaryTargets[target];
        if (!opMemory) return;
        seen[target] = true;
        const intel = INTEL[target];
        const levelTarget = computeOpLevelTarget(target, opMemory, intel);
        const entry = heaviestQueuedEntry(target, fallbackEntry || {role: 'longbow', destination: target});
        pending.push({target, opMemory, levelTarget, entry, intel});
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

    pending.sort((a, b) => destAssignRank(a.target) - destAssignRank(b.target));
    for (let i = 0; i < pending.length; i++) {
        const d = pending[i];
        resolveAssignment(d.target, d.opMemory, d.levelTarget, d.entry, d.intel);
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
    if (room.level < levelTarget) {
        // Intel can raise the floor (1-tower stronghold → 2 towers / RCL 8)
        // after this room already started a waitFor-4. Rejecting the entry
        // stranded 3 bodies on the pad with no 4th ever queued.
        if (!hasUncommittedWaitForWave(target)) return null;
    }

    return {...entry};
}

function computeOpLevelTarget(target, opMemory, intel) {
    switch (opMemory.type) {
        case 'scout':
            return 1;
        case 'claim':
            return 5;
        case 'power':
            // 20 HEAL + 20 MOVE is 6000 energy; RCL 7 caps at 5600.
            return 8;
        case 'roomDenial':
            return scoreOriginMinLevel('roomDenial', intel);
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

function creepOpDest(c) {
    if (!c || !c.memory) return '';
    return (c.memory.other && c.memory.other.assignment) || c.memory.destination || '';
}

function isUncommittedWaitForCreep(c, target) {
    if (!c || !c.my || !c.memory) return false;
    if (c.memory.recycling) return false;
    if (creepOpDest(c) !== target) return false;
    if (c.memory.initialFormUp || (c.memory.misc && c.memory.misc.sealed)) return false;
    return !!(c.memory.misc && c.memory.misc.waitFor > 1);
}

function isQueuedWaitForWave(entry) {
    if (!entry || !entry.misc || !(entry.misc.waitFor > 1)) return false;
    const role = entry.role || '';
    return role === 'longbowSquad' || role === 'longbow';
}

function hasInflightOpCreeps(target, operation) {
    const matches = (c) => {
        if (!c || !c.my || !c.memory) return false;
        if (creepOpDest(c) !== target) return false;
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

function handleAssignmentReadinessWait(target, opMemory, reason, levelTarget, entry) {
    if (!opMemory.assignedRoom || !Game.rooms[opMemory.assignedRoom]) return opMemory.assignedRoom;
    // A waitFor wave already on the pad must finish here. Spawning 3 siege
    // bodies tanks flowSpare, looks "not combat ready", and used to unassign
    // after 100 ticks with 3/4 idle.
    if (hasUncommittedWaitForWave(target)) return opMemory.assignedRoom;

    const now = Game.time;
    if (opMemory.assignmentEnergyLastTick !== now) {
        opMemory.assignmentEnergyCounter = (opMemory.assignmentEnergyCounter || 0) + 1;
        opMemory.assignmentEnergyLastTick = now;
        if (opMemory.assignmentEnergyCounter > 100) {
            const stolen = tryStealAssignment(target, opMemory, levelTarget, entry, reason, {force: true});
            if (stolen) return stolen;
            unassignRoom(target, reason, {excludeRoom: true, cooldown: true});
            return null;
        }
    }
    return opMemory.assignedRoom;
}

function hasUncommittedWaitForWave(target) {
    if (!target) return false;
    for (const name in Game.creeps) {
        if (isUncommittedWaitForCreep(Game.creeps[name], target)) return true;
    }
    const op = Memory.targetRooms[target] || Memory.auxiliaryTargets[target];
    const room = op && op.assignedRoom && Game.rooms[op.assignedRoom];
    if (room && room.spawns) {
        for (let i = 0; i < room.spawns.length; i++) {
            const spawning = room.spawns[i].spawning;
            if (!spawning) continue;
            if (isUncommittedWaitForCreep(Game.creeps[spawning.name], target)) return true;
        }
    }
    return false;
}

// Origin is still producing this waitFor wave (egg in a spawn or a queue
// still wants more). Forming stall must not shrink/recycle the pad while
// the rest of the quad is waiting on energy.
function waitForWaveStillFilling(target, home) {
    if (!target) return false;
    const op = Memory.targetRooms[target] || Memory.auxiliaryTargets[target];
    if (op && op.assignedRoom && home && op.assignedRoom !== home) return false;
    if (!hasUncommittedWaitForWave(target)) return false;

    const spawnRooms = [];
    if (op && op.assignedRoom && Game.rooms[op.assignedRoom]) spawnRooms.push(Game.rooms[op.assignedRoom]);
    else if (home && Game.rooms[home]) spawnRooms.push(Game.rooms[home]);
    for (let r = 0; r < spawnRooms.length; r++) {
        const spawns = spawnRooms[r].spawns || [];
        for (let i = 0; i < spawns.length; i++) {
            const spawning = spawns[i].spawning;
            if (!spawning) continue;
            if (isUncommittedWaitForCreep(Game.creeps[spawning.name], target)) return true;
        }
    }

    const caches = [CREEP_QUEUES['global']];
    if (home && CREEP_QUEUES[home]) caches.push(CREEP_QUEUES[home]);
    if (op && op.assignedRoom && CREEP_QUEUES[op.assignedRoom]) caches.push(CREEP_QUEUES[op.assignedRoom]);
    for (let i = 0; i < caches.length; i++) {
        const cache = caches[i];
        if (!cache) continue;
        for (const key in cache) {
            const e = cache[key];
            if (!isQueuedWaitForWave(e)) continue;
            if (entryTarget(e) !== target) continue;
            return true;
        }
    }
    return false;
}

function resolveAssignment(target, opMemory, levelTarget, entry, intel) {
    if (opMemory.assignedRoom) {
        // A live waitFor wave must finish where it spawned. Steal/unassign
        // mid-form dumps 1–3 bodies on the pad, then formingGiveUp recycles
        // them once assignedRoom no longer matches formColony.
        if (hasUncommittedWaitForWave(target)) return opMemory.assignedRoom;

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
                    if (stealCheckDue(target, opMemory.assignedAt)) {
                        const stolen = tryStealAssignment(target, opMemory, levelTarget, entry, 'Room is not combat ready.');
                        if (stolen) return stolen;
                    }
                    return handleAssignmentReadinessWait(target, opMemory, 'Room is not combat ready.', levelTarget, entry);
                }
            } else if (Memory.auxiliaryTargets[target] && !isLiveAuxReady(assigned)) {
                if (stealCheckDue(target, opMemory.assignedAt)) {
                    const stolen = tryStealAssignment(target, opMemory, levelTarget, entry, 'Room is not auxiliary ready.');
                    if (stolen) return stolen;
                }
                return handleAssignmentReadinessWait(target, opMemory, 'Room is not auxiliary ready.', levelTarget, entry);
            }

            clearAssignmentWaitState(opMemory);

            if (stealCheckDue(target, opMemory.assignedAt)) {
                const stolen = tryStealAssignment(target, opMemory, levelTarget, entry, 'Better source room.');
                if (stolen) return stolen;
            }
            return opMemory.assignedRoom;
        }
    }

    if (!intel && !assignmentAllowsMissingIntel(opMemory, entry)) return null;

    const resolved = getAssignedRoom(target, levelTarget, heaviestQueuedEntry(target, entry));
    if (!resolved) return null;
    return commitAssignment(target, opMemory, entry, resolved);
}

function stealCheckDue(target, assignedAt) {
    const last = stealCheckAt[target] || assignedAt || 0;
    if (last + STEAL_CHECK_INTERVAL > Game.time) return false;
    stealCheckAt[target] = Game.time;
    return true;
}

function commitAssignment(target, opMemory, entry, roomName) {
    opMemory.assignedRoom = roomName;
    opMemory.assignedAt = Game.time;
    stealCheckAt[target] = Game.time;
    clearAssignmentWaitState(opMemory);
    retargetFormingWaitForColony(target, entry && entry.operation, roomName);
    log.a(`Assigning the operation in ${roomLink(target)} to ${roomLink(roomName)}`, 'OPERATIONS:');
    return roomName;
}

function tryStealAssignment(target, opMemory, levelTarget, entry, reason, options = {}) {
    const previous = opMemory.assignedRoom;
    if (!previous) return null;
    if (hasUncommittedWaitForWave(target)) return null;
    const creepInfo = heaviestQueuedEntry(target, entry);
    const force = !!(options && options.force);

    if (force) {
        markAssignmentExclude(target, previous);
        invalidateAssignmentCaches();
    }

    const best = getAssignedRoomResult(target, levelTarget, creepInfo, {probe: true});
    if (!best || best.key === previous) {
        if (force) {
            delete assignmentExcludeUntil[`${target}|${previous}`];
            invalidateAssignmentCaches();
        }
        return null;
    }

    if (!force) {
        const assigned = Game.rooms[previous];
        const loads = getMilitaryLoadByColony();
        const flags = assignmentFlags(target, creepInfo);
        const currentEval = assigned && evaluateAssignmentCandidate(assigned, target, levelTarget, creepInfo, loads, flags);
        if (currentEval && best.score + STEAL_MARGIN > currentEval.score) return null;
    }

    unassignRoom(target, reason || 'Better source room.', {excludeRoom: force});
    return commitAssignment(target, opMemory, entry, best.key);
}

function retargetFormingWaitForColony(target, operation, newColony) {
    if (!target || !newColony) return;
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!isUncommittedWaitForCreep(c, target)) continue;
        if (operation && c.memory.operation && c.memory.operation !== operation) continue;
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
    const liveAt = {};
    const bump = (room, n) => {
        if (room) loads[room] = (loads[room] || 0) + n;
    };
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c.my || !c.memory) continue;
        if (!c.memory.military && !c.memory.operation) continue;
        const colony = c.memory.colony;
        bump(colony, 1);
        const dest = c.memory.destination;
        if (colony && dest) {
            const k = colony + '|' + dest;
            liveAt[k] = (liveAt[k] || 0) + 1;
        }
    }
    const globalQueue = CREEP_QUEUES['global'] || {};
    const pendingByDest = {};
    for (const key in globalQueue) {
        const e = globalQueue[key];
        const dest = entryTarget(e);
        if (!dest) continue;
        const op = Memory.targetRooms[dest] || Memory.auxiliaryTargets[dest];
        if (!op || !op.assignedRoom) continue;
        const needed = (e.misc && e.misc.waitFor > 1) ? e.misc.waitFor : (e.numberNeeded || 1);
        const prev = pendingByDest[dest];
        if (!prev || needed > prev.needed) {
            pendingByDest[dest] = {needed, assigned: op.assignedRoom};
        }
    }
    for (const dest in pendingByDest) {
        const p = pendingByDest[dest];
        const live = liveAt[p.assigned + '|' + dest] || 0;
        const pending = Math.max(0, p.needed - live);
        if (pending) bump(p.assigned, pending);
    }
    militaryLoadCache = {tick: Game.time, loads};
    return loads;
}

function getAssignedRoomCacheKey(targetRoom, level, creepInfo) {
    const misc = (creepInfo && creepInfo.misc) || {};
    const waitFor = misc.waitFor || 0;
    const boosts = (misc.boosts && misc.boosts.length) ? misc.boosts.slice().sort().join('+') : '';
    return `${targetRoom}:${level}:${(creepInfo && creepInfo.role) || ''}:${waitFor}:${boosts}`;
}

function assignmentFlags(targetRoom, creepInfo) {
    const opType = Memory.targetRooms[targetRoom] && Memory.targetRooms[targetRoom].type;
    const isClaimRole = CLAIM_ROLES.has(creepInfo.role);
    return {
        isAuxiliary: !!Memory.auxiliaryTargets[targetRoom],
        opType,
        isHelper: HELPER_ROLES.has(creepInfo.role),
        isScout: opType === 'scout' || creepInfo.role === 'scout',
        isClaimRole,
        maxDistance: isClaimRole ? 12 : 22,
    };
}

function evaluateAssignmentCandidate(myRoom, targetRoom, level, creepInfo, loads, flags) {
    if (!myRoom || !myRoom.controller) return null;
    const key = myRoom.name;
    if (key === targetRoom) return null;
    // Energy-capacity tier below controller RCL means missing/inactive
    // extensions. Inactive extras after an RCL dip (nuker, observer, 60th
    // extension) do not change room.level when the remaining cap still matches
    // — those rooms can still spawn and should still assign.
    if (myRoom.controller.level !== myRoom.level) return null;
    if (myRoom.level < level) return null;

    const tier = flags.isHelper || flags.isAuxiliary || flags.isScout
        ? OP_TIER.HARASS
        : getOpTier({type: flags.opType}, creepInfo);
    if (!isRoomReadyForTier(myRoom, tier)) return null;

    const distance = myRoom.routeDistance(targetRoom, flags.isClaimRole ? {shortest: true} : {});
    if (distance > flags.maxDistance) return null;
    if (flags.isClaimRole && estimateClaimRouteTicks(distance) > CREEP_CLAIM_LIFE_TIME - 10) return null;

    if (isAssignmentExcluded(targetRoom, key)) return null;

    const spawnCap = CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][myRoom.level] || 1;
    const load = loads[key] || 0;
    if (load >= spawnCap * LOAD_PER_SPAWN_CAP) return null;

    const generated = tryGenerateAssignableBody(myRoom, creepInfo);
    if (!generated) return null;

    const score = computeAssignmentScore(myRoom, distance, load, flags.isAuxiliary)
        + optionalBoostPenalty(myRoom, generated.info, generated.body)
        + boostQualityPenalty(myRoom, generated.info, generated.body);
    return {key, score, distance, load};
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
    let score = routeDistance + (COLONY_ASSIGN_PENALTY[getColonyRole(myRoom)] || 0);

    const energyState = spawnEnergyState(myRoom) || 0;
    const ei = myRoom.energyInfo;
    const trend = (ei && ei.trend) || 0;
    const flowSpare = roomMilitaryFlowSpare(myRoom);
    const flowStressed = flowSpare < 0 || trend < -2;
    const stocked = roomStockpileRatio(myRoom) >= 0.8;
    const flowReady = (energyState >= 2 || stocked) && trend >= 0 && flowSpare >= 4;

    // Weights are hop-equivalent. Energy 2 vs 3 used to cost 6 rooms and skip
    // a healthy neighbor for a distant full bunker.
    const energyWeight = isAuxiliary ? 1 : 2;
    if (energyState < 3) score += (3 - energyState) * energyWeight;

    if (flowStressed) score += isAuxiliary ? 3 : 6;
    else if (!isAuxiliary && energyState < 2 && !stocked) score += 2;

    if (flowSpare < 0) score += isAuxiliary ? 2 : 4;
    else if (flowSpare < 4) score += 1;
    else if (flowReady) score -= 2;

    const spawnCap = CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][myRoom.level];
    if (spawnCap > 0) score += (load / spawnCap) * 2;

    return score;
}

function getAssignedRoomResult(targetRoom, level, creepInfo, options = {}) {
    if (!creepInfo) creepInfo = {role: 'longbow', destination: targetRoom};
    const probe = !!(options && options.probe);
    const cacheKey = getAssignedRoomCacheKey(targetRoom, level, creepInfo);
    if (!probe && assignedRoomCache.tick === Game.time &&
        Object.prototype.hasOwnProperty.call(assignedRoomCache.results, cacheKey)) {
        return assignedRoomCache.results[cacheKey];
    }
    if (!probe && assignedRoomCache.tick !== Game.time) assignedRoomCache = {tick: Game.time, results: {}};

    if (!probe && assignmentCooldown[targetRoom] && assignmentCooldown[targetRoom] > Game.time) {
        assignedRoomCache.results[cacheKey] = null;
        return null;
    }

    const loads = getMilitaryLoadByColony();
    const flags = assignmentFlags(targetRoom, creepInfo);
    let best = null;
    for (const key of MY_ROOMS) {
        const myRoom = Game.rooms[key];
        if (!myRoom) continue;
        const evaluated = evaluateAssignmentCandidate(myRoom, targetRoom, level, creepInfo, loads, flags);
        if (!evaluated) continue;
        if (isBetterAssignmentCandidate(evaluated.score, evaluated.distance, evaluated.load, evaluated.key, best)) {
            best = evaluated;
        }
    }

    if (!probe) {
        assignedRoomCache.results[cacheKey] = best;
        if (!best) assignmentCooldown[targetRoom] = Game.time + ASSIGNMENT_FAILURE_COOLDOWN;
    }
    return best;
}

function getAssignedRoom(targetRoom, level, creepInfo) {
    const result = getAssignedRoomResult(targetRoom, level, creepInfo);
    return result ? result.key : null;
}

function releaseAssignmentIfStuck(room, destination, reason, creep) {
    const opMemory = Memory.targetRooms[destination] || Memory.auxiliaryTargets[destination];
    if (!opMemory || !room || opMemory.assignedRoom !== room.name) return;
    if (creep && HELPER_ROLES.has(creep.role)) return;
    if (hasUncommittedWaitForWave(destination)) return;

    const levelTarget = computeOpLevelTarget(destination, opMemory, INTEL[destination]);
    if (tryStealAssignment(destination, opMemory, levelTarget, creep, reason, {force: true})) return;

    unassignRoom(destination, reason, {excludeRoom: true, cooldown: true});
}

function unassignRoom(destination, logEntry, options = {}) {
    const ops = [];
    if (Memory.targetRooms && Memory.targetRooms[destination]) ops.push(Memory.targetRooms[destination]);
    if (Memory.auxiliaryTargets && Memory.auxiliaryTargets[destination]) ops.push(Memory.auxiliaryTargets[destination]);
    let fromRoom = null;
    for (let i = 0; i < ops.length; i++) {
        const opMemory = ops[i];
        if (!opMemory || !opMemory.assignedRoom) continue;
        fromRoom = opMemory.assignedRoom;
        delete opMemory.assignedRoom;
        delete opMemory.assignedAt;
        delete opMemory.assignmentEnergyCounter;
        delete opMemory.assignmentEnergyLastTick;
        delete opMemory.assignmentInvisibleCounter;
        delete opMemory.assignmentInvisibleLastTick;
        if (options.excludeRoom) markAssignmentExclude(destination, fromRoom);
    }
    if (!fromRoom) return;
    if (options.cooldown) {
        assignmentCooldown[destination] = Game.time + ASSIGNMENT_FAILURE_COOLDOWN;
    } else {
        delete assignmentCooldown[destination];
    }
    delete stealCheckAt[destination];
    invalidateAssignmentCaches();
    log.a(`Unassigning the operation in ${roomLink(destination)} from ${roomLink(fromRoom)}. ${logEntry}`, 'OPERATIONS:');
}

function getPriority(operationRoom) {
    const military = !!(Memory.targetRooms && Memory.targetRooms[operationRoom]);
    const range = military ? empireDistance(operationRoom) : findClosestOwnedRoom(operationRoom, true);
    const typeMulti = military ? 1 : 2;
    const op = Memory.targetRooms[operationRoom] || Memory.auxiliaryTargets[operationRoom];
    const colonyName = (op && op.assignedRoom) || findClosestOwnedRoom(operationRoom, false, 1);
    const colony = colonyName && Game.rooms[colonyName];
    const energyMulti = colony && spawnEnergyState(colony) < 2 ? 1.5 : 1;
    return Math.round(empirePriority(range) * typeMulti * energyMulti * 10) / 10;
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
    hasUncommittedWaitForWave,
    waitForWaveStillFilling,
};

