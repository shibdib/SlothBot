/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Shared remote mining route cache, scoring, and discovery helpers.
 */

const {findRoute, getRoute} = require('pathRoute');

const MINING_ROUTE_TTL = 1500;
const DEFAULT_ROUTE_MAX = 3;
const DEFAULT_PROBE_MAX = 8;
const DEFAULT_PROBE_BUDGET = 3; // empire-wide Game.map.findRoute calls per tick
const DEFAULT_LINEAR_MAX = 4;
const DEFAULT_SCORE_ROUTE_MULT = 20;
const DEFAULT_SCORE_ROUTE_BASE = 12;
const DEFAULT_SWAMP_PENALTY = 8;
const DEFAULT_REFRESH_STAGGER = 150;
const SCORE_BORDERLINE_MARGIN = 15;

// Global live findRoute budget (Game.map.findRoute is very expensive).
let probeBudgetTick = -1;
let probesRemaining = 0;

function resetProbeBudgetIfNeeded() {
    if (probeBudgetTick === Game.time) return;
    probeBudgetTick = Game.time;
    probesRemaining = cfg('REMOTE_ROUTE_PROBE_BUDGET', DEFAULT_PROBE_BUDGET);
}

function consumeProbeBudget() {
    resetProbeBudgetIfNeeded();
    if (probesRemaining <= 0) return false;
    probesRemaining--;
    return true;
}

function cfg(name, fallback) {
    const v = global[name];
    return v !== undefined && v !== null ? v : fallback;
}

function miningRouteTTL() {
    return cfg('REMOTE_MINING_ROUTE_TTL', MINING_ROUTE_TTL);
}

function estimateMiningScore(routeLen, remoteIntel) {
    const mult = cfg('REMOTE_SCORE_ROUTE_MULT', DEFAULT_SCORE_ROUTE_MULT);
    const base = cfg('REMOTE_SCORE_ROUTE_BASE', DEFAULT_SCORE_ROUTE_BASE);
    const swamp = remoteIntel && remoteIntel.swampRoom ? cfg('REMOTE_SCORE_SWAMP_PENALTY', DEFAULT_SWAMP_PENALTY) : 0;
    return routeLen * mult + base + swamp;
}

function remoteDistanceMax() {
    return cfg('REMOTE_DISTANCE_MAX', 110);
}

function remoteScorePathMult() {
    return cfg('REMOTE_SCORE_PATH_MULT', 2);
}

function getRouteEstimateScore(remoteName, colonyName) {
    const rec = getMiningRouteRecord(remoteName, colonyName);
    if (rec && rec.estimateScore) return rec.estimateScore;
    // Stale but still-known mining route: prefer over a transient failed path cache.
    const stale = getStaleMiningRouteRecord(remoteName, colonyName);
    if (stale && stale.estimateScore) return stale.estimateScore;
    const route = getMiningRouteRooms(colonyName, remoteName);
    if (!route.length) return null;
    return estimateMiningScore(route.length, INTEL[remoteName]);
}

/**
 * @param {object} [options]
 * @param {boolean} [options.allowMissingEstimate] - keep existing assignments when route
 *   estimate is temporarily unavailable (failed path cache, TTL gap).
 */
function isRemoteSourceScoreAcceptable(colonyName, remoteName, score, options = {}) {
    if (score === undefined || score === null || score === Infinity || !isFinite(score)) return false;
    if (score > remoteDistanceMax()) return false;
    const estimate = getRouteEstimateScore(remoteName, colonyName);
    if (estimate === null) return !!options.allowMissingEstimate;
    return score <= estimate * remoteScorePathMult();
}

function effectiveHaulScore(colonyName, remoteName, score) {
    if (score === undefined || score === null || score === Infinity || !isFinite(score)) {
        return remoteDistanceMax();
    }
    const max = remoteDistanceMax();
    const estimate = getRouteEstimateScore(remoteName, colonyName);
    let effective = score;
    if (estimate !== null) effective = Math.min(effective, estimate * remoteScorePathMult());
    return Math.min(effective, max);
}

function maxRemoteRoomsForColony(colonyRoom) {
    const level = colonyRoom.level || 0;
    if (level >= 8) return cfg('REMOTE_MAX_ROOMS_RCL8', 5);
    if (level >= 7) return cfg('REMOTE_MAX_ROOMS_RCL7', 4);
    if (level >= 6) return cfg('REMOTE_MAX_ROOMS_RCL6', 2);
    return cfg('REMOTE_MAX_ROOMS_LOW', 1);
}

function maxSkRoomsPerColony() {
    const v = cfg('SK_MINING_MAX_ROOMS', 1);
    return v > 0 ? v : 1;
}

// Per-tick index: one full creep/queue/targets pass instead of O(creeps) per lookup.
// Built lazily on first hasLiveRemoteWork / isRemoteClaimedByOther call each tick.
let claimIndexTick = -1;
/** @type {Object.<string, Object.<string, boolean>>} colony -> remote -> true */
let liveWorkIndex = null;
/** @type {Object.<string, Object.<string, boolean>>} remote -> colony -> true (targets or live) */
let roomOwnersIndex = null;
/** @type {Object.<string, string>} sourceId -> colony */
let sourceOwnersIndex = null;

const LIVE_REMOTE_ROLES = {
    remoteHarvester: true,
    reserver: true,
    remoteBuilder: true,
    roadBuilder: true,
    SKAttacker: true,
    commodityMiner: true,
};

function markLiveWork(colony, remote) {
    if (!colony || !remote) return;
    if (!liveWorkIndex[colony]) liveWorkIndex[colony] = {};
    liveWorkIndex[colony][remote] = true;
    if (!roomOwnersIndex[remote]) roomOwnersIndex[remote] = {};
    roomOwnersIndex[remote][colony] = true;
}

function ensureClaimIndex() {
    if (claimIndexTick === Game.time && liveWorkIndex) return;
    claimIndexTick = Game.time;
    liveWorkIndex = {};
    roomOwnersIndex = {};
    sourceOwnersIndex = {};

    // Live creeps — single pass over Game.creeps
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c.my) continue;
        const mem = c.memory;
        const colony = mem.colony;
        if (!colony) continue;
        const role = mem.role;
        if (role === 'remoteHauler') {
            if (mem.other && mem.other.remoteRoom) markLiveWork(colony, mem.other.remoteRoom);
            continue;
        }
        if (LIVE_REMOTE_ROLES[role] && mem.destination) markLiveWork(colony, mem.destination);
    }

    // Spawn queues
    for (const colony in CREEP_QUEUES) {
        const queue = CREEP_QUEUES[colony];
        if (!queue) continue;
        for (const key in queue) {
            const entry = queue[key];
            if (!entry) continue;
            if (entry.role === 'remoteHauler') {
                if (entry.other && entry.other.remoteRoom) markLiveWork(colony, entry.other.remoteRoom);
                continue;
            }
            if (LIVE_REMOTE_ROLES[entry.role] && entry.destination) markLiveWork(colony, entry.destination);
        }
    }

    // ROOM_REMOTE_TARGETS — paper claims (skip noRemote colonies)
    for (let i = 0; i < MY_ROOMS.length; i++) {
        const colony = MY_ROOMS[i];
        const room = Game.rooms[colony];
        if (room && room.memory.noRemote) continue;
        const targets = ROOM_REMOTE_TARGETS[colony];
        if (!targets || !targets.length) continue;
        for (let j = 0; j < targets.length; j++) {
            const s = targets[j];
            if (!s || !s.room) continue;
            if (!roomOwnersIndex[s.room]) roomOwnersIndex[s.room] = {};
            roomOwnersIndex[s.room][colony] = true;
            if (s.source) sourceOwnersIndex[s.source] = colony;
        }
    }
}

function hasLiveRemoteWork(colonyName, remoteName) {
    ensureClaimIndex();
    return !!(liveWorkIndex[colonyName] && liveWorkIndex[colonyName][remoteName]);
}

/**
 * Another MY_ROOM colony is holding this remote via targets and/or live creeps.
 * Sticky remoteSourceData alone does not block reclaim (idle assignees with no targets).
 * noRemote colonies are not treated as owners (excluded when building the index).
 */
function isRemoteClaimedByOther(colonyName, remoteName, sourceId) {
    ensureClaimIndex();
    if (sourceId) {
        const owner = sourceOwnersIndex[sourceId];
        if (owner && owner !== colonyName) return true;
    }
    const owners = roomOwnersIndex[remoteName];
    if (!owners) return false;
    for (const other in owners) {
        if (other !== colonyName) return true;
    }
    return false;
}

/** Patch claim index after removing a colony's paper claim on a remote. */
function unindexColonyRemote(colony, remoteName, removedSources) {
    if (!roomOwnersIndex || !sourceOwnersIndex) return;
    if (removedSources) {
        for (let i = 0; i < removedSources.length; i++) {
            const sid = removedSources[i];
            if (sourceOwnersIndex[sid] === colony) delete sourceOwnersIndex[sid];
        }
    }
    // Drop room owner only if no remaining targets and no live work
    const targets = ROOM_REMOTE_TARGETS[colony];
    const stillTargeted = targets && targets.some(s => s.room === remoteName);
    const stillLive = liveWorkIndex[colony] && liveWorkIndex[colony][remoteName];
    if (!stillTargeted && !stillLive && roomOwnersIndex[remoteName]) {
        delete roomOwnersIndex[remoteName][colony];
    }
}

function indexColonyRemote(colony, remoteName, sources) {
    ensureClaimIndex();
    if (!roomOwnersIndex[remoteName]) roomOwnersIndex[remoteName] = {};
    roomOwnersIndex[remoteName][colony] = true;
    if (sources) {
        for (let i = 0; i < sources.length; i++) {
            if (sources[i]) sourceOwnersIndex[sources[i]] = colony;
        }
    }
}

/** Drop a remote room from every colony's targets except keepColony. */
function stripRemoteFromOtherColonies(remoteName, keepColony) {
    ensureClaimIndex();
    for (let i = 0; i < MY_ROOMS.length; i++) {
        const other = MY_ROOMS[i];
        if (other === keepColony) continue;
        const targets = ROOM_REMOTE_TARGETS[other];
        if (!targets || !targets.length) continue;
        const removed = [];
        const next = [];
        for (let j = 0; j < targets.length; j++) {
            const s = targets[j];
            if (s.room === remoteName) {
                if (s.source) removed.push(s.source);
            } else {
                next.push(s);
            }
        }
        if (removed.length) {
            ROOM_REMOTE_TARGETS[other] = next;
            unindexColonyRemote(other, remoteName, removed);
        }
    }
}

/** Assign remoteSourceData ownership and strip other colonies' targets for this room. */
function claimRemoteForColony(colonyName, remoteName) {
    const intel = INTEL[remoteName];
    if (intel && intel.remoteSourceData) {
        for (let i = 0; i < intel.remoteSourceData.length; i++) {
            intel.remoteSourceData[i].colony = colonyName;
        }
    }
    stripRemoteFromOtherColonies(remoteName, colonyName);
    const targets = ROOM_REMOTE_TARGETS[colonyName] || [];
    const sources = [];
    for (let i = 0; i < targets.length; i++) {
        if (targets[i].room === remoteName && targets[i].source) sources.push(targets[i].source);
    }
    indexColonyRemote(colonyName, remoteName, sources);
}

function pruneRemoteRoomCount(colonyName, colonyRoom) {
    const targets = ROOM_REMOTE_TARGETS[colonyName];
    if (!targets || !targets.length) return;

    const byRoom = {};
    for (const s of targets) {
        if (!byRoom[s.room]) byRoom[s.room] = [];
        byRoom[s.room].push(s);
    }

    // Sector-center rooms ride along with an adjacent SK remote and do not consume a slot.
    const rooms = Object.keys(byRoom).filter(r => !isSectorCenterRoomName(r));
    const maxRooms = maxRemoteRoomsForColony(colonyRoom);
    if (rooms.length <= maxRooms) return;

    // Prefer live work, then best (lowest) haul scores. Higher scores are worse.
    // SK rooms stay assigned across a guard TTL gap — dropping them stranded
    // the room with no attacker, no harvesters, and no way to re-queue.
    ensureClaimIndex();
    rooms.sort((a, b) => {
        const skA = isSkRoomName(a) ? 0 : 1;
        const skB = isSkRoomName(b) ? 0 : 1;
        if (skA !== skB) return skA - skB;
        const liveA = !!(liveWorkIndex[colonyName] && liveWorkIndex[colonyName][a]);
        const liveB = !!(liveWorkIndex[colonyName] && liveWorkIndex[colonyName][b]);
        if (liveA !== liveB) return liveA ? -1 : 1;
        const bestA = Math.min(...byRoom[a].map(s => s.score));
        const bestB = Math.min(...byRoom[b].map(s => s.score));
        return bestA - bestB;
    });

    const keep = new Set(rooms.slice(0, maxRooms));
    for (const remoteName in byRoom) {
        if (isSectorCenterRoomName(remoteName)) keep.add(remoteName);
    }
    const next = [];
    const removedByRoom = {};
    for (let i = 0; i < targets.length; i++) {
        const s = targets[i];
        if (keep.has(s.room)) {
            next.push(s);
        } else {
            if (!removedByRoom[s.room]) removedByRoom[s.room] = [];
            if (s.source) removedByRoom[s.room].push(s.source);
        }
    }
    ROOM_REMOTE_TARGETS[colonyName] = next;
    for (const remoteName in removedByRoom) {
        unindexColonyRemote(colonyName, remoteName, removedByRoom[remoteName]);
    }
}

function getColonySkRooms(colonyName) {
    const rooms = [];
    const seen = new Set();
    const targets = ROOM_REMOTE_TARGETS[colonyName] || [];
    for (let i = 0; i < targets.length; i++) {
        const remoteName = targets[i] && targets[i].room;
        if (!remoteName || seen.has(remoteName) || !isSkRoomName(remoteName)) continue;
        seen.add(remoteName);
        rooms.push(remoteName);
    }
    return rooms;
}

/** Assigned SK rooms, plus intel-owned SK if prune already dropped the paper claim. */
function getColonySkGuardRooms(colonyName) {
    const assigned = getColonySkRooms(colonyName);
    const cap = maxSkRoomsPerColony();
    if (assigned.length >= cap) return assigned;
    const seen = new Set(assigned);
    const out = assigned.slice();
    const idx = global.getIntelIndexes ? global.getIntelIndexes() : null;
    const pools = [];
    if (idx && idx.activeRemotes) pools.push(idx.activeRemotes);
    if (idx && idx.unownedSources) pools.push(idx.unownedSources);
    for (let p = 0; p < pools.length && out.length < cap; p++) {
        for (const name of pools[p]) {
            if (seen.has(name) || !isSkRoomName(name)) continue;
            const intel = INTEL[name];
            if (!intel || !intel.remoteSourceData) continue;
            let ours = false;
            for (let i = 0; i < intel.remoteSourceData.length; i++) {
                if (intel.remoteSourceData[i].colony === colonyName) {
                    ours = true;
                    break;
                }
            }
            if (!ours) continue;
            seen.add(name);
            out.push(name);
            if (out.length >= cap) break;
        }
    }
    return out;
}

/** True when the two rooms share a cardinal exit (not a Chebyshev diagonal). */
function isExitNeighbor(fromName, toName) {
    if (!fromName || !toName) return false;
    const exits = Game.map.describeExits(fromName);
    if (!exits) return false;
    for (const neighbor of Object.values(exits)) {
        if (neighbor === toName) return true;
    }
    return false;
}

function assignedSkHasNonAdjacent(colonyName, assigned) {
    for (let i = 0; i < assigned.length; i++) {
        if (!isExitNeighbor(colonyName, assigned[i])) return true;
    }
    return false;
}

/**
 * Source-keeper remotes are allowed when under the colony cap, already assigned,
 * or this room shares an exit with the colony while an assigned SK does not.
 * Linear (Chebyshev) distance treats diagonal SK rooms as range 1, so without
 * the exit check a diagonal assignment would block the adjacent SK forever.
 */
function isAllowedSkRoom(colonyName, remoteName) {
    if (!remoteName || !isSkRoomName(remoteName)) return true;
    const assigned = getColonySkRooms(colonyName);
    if (assigned.indexOf(remoteName) !== -1) return true;
    if (assigned.length < maxSkRoomsPerColony()) return true;
    return isExitNeighbor(colonyName, remoteName) && assignedSkHasNonAdjacent(colonyName, assigned);
}

function isSectorCenterRoomName(roomName) {
    return !!(global.isSectorCenterRoomName && global.isSectorCenterRoomName(roomName));
}

/** Sector-center neighbor of an SK room, if the two share an exit. */
function getAdjacentSectorCenter(roomName) {
    if (!roomName || !isSkRoomName(roomName)) return null;
    const exits = Game.map.describeExits(roomName);
    if (!exits) return null;
    for (const neighbor of Object.values(exits)) {
        if (isSectorCenterRoomName(neighbor)) return neighbor;
    }
    return null;
}

function getSectorCenterSkParent(colonyName, centerName) {
    if (!colonyName || !isSectorCenterRoomName(centerName)) return null;
    const assigned = getColonySkRooms(colonyName);
    for (let i = 0; i < assigned.length; i++) {
        if (getAdjacentSectorCenter(assigned[i]) === centerName) return assigned[i];
    }
    return null;
}

function isSectorCenterAddOn(colonyName, remoteName) {
    return !!getSectorCenterSkParent(colonyName, remoteName);
}

/** SK room whose attacker covers this remote (the room itself, or the parent SK of a center). */
function skGuardRoom(colonyName, remoteName) {
    if (!remoteName) return null;
    if (isSkRoomName(remoteName)) return remoteName;
    if (isSectorCenterRoomName(remoteName)) return getSectorCenterSkParent(colonyName, remoteName);
    return null;
}

function isKeeperYieldRoom(roomName) {
    return isSkRoomName(roomName) || isSectorCenterRoomName(roomName);
}

function pruneOrphanSectorCenters(colonyName) {
    const targets = ROOM_REMOTE_TARGETS[colonyName];
    if (!targets || !targets.length) return;

    const allowedCenters = new Set();
    const assignedSk = getColonySkRooms(colonyName);
    for (let i = 0; i < assignedSk.length; i++) {
        const center = getAdjacentSectorCenter(assignedSk[i]);
        if (center) allowedCenters.add(center);
    }

    const next = [];
    const removedByRoom = {};
    for (let i = 0; i < targets.length; i++) {
        const s = targets[i];
        if (!isSectorCenterRoomName(s.room) || allowedCenters.has(s.room)) {
            next.push(s);
        } else if (s.source) {
            if (!removedByRoom[s.room]) removedByRoom[s.room] = [];
            removedByRoom[s.room].push(s.source);
        }
    }
    if (next.length === targets.length) return;
    ROOM_REMOTE_TARGETS[colonyName] = next;
    for (const remoteName in removedByRoom) {
        unindexColonyRemote(colonyName, remoteName, removedByRoom[remoteName]);
    }
}

function pruneExcessSkRooms(colonyName) {
    const targets = ROOM_REMOTE_TARGETS[colonyName];
    if (!targets || !targets.length) return;

    const byRoom = {};
    for (let i = 0; i < targets.length; i++) {
        const s = targets[i];
        if (!s || !s.room) continue;
        if (!byRoom[s.room]) byRoom[s.room] = [];
        byRoom[s.room].push(s);
    }

    const skRooms = Object.keys(byRoom).filter(isSkRoomName);
    const maxSk = maxSkRoomsPerColony();
    if (skRooms.length <= maxSk) return;

    ensureClaimIndex();
    skRooms.sort((a, b) => {
        // Exit-adjacent SK beats a diagonal even if the diagonal already has an attacker.
        const adjA = isExitNeighbor(colonyName, a) ? 0 : 1;
        const adjB = isExitNeighbor(colonyName, b) ? 0 : 1;
        if (adjA !== adjB) return adjA - adjB;
        const liveAtkA = hasLiveSkAttacker(a) ? 0 : 1;
        const liveAtkB = hasLiveSkAttacker(b) ? 0 : 1;
        if (liveAtkA !== liveAtkB) return liveAtkA - liveAtkB;
        const liveA = !!(liveWorkIndex[colonyName] && liveWorkIndex[colonyName][a]) ? 0 : 1;
        const liveB = !!(liveWorkIndex[colonyName] && liveWorkIndex[colonyName][b]) ? 0 : 1;
        if (liveA !== liveB) return liveA - liveB;
        const bestA = Math.min(...byRoom[a].map(s => s.score));
        const bestB = Math.min(...byRoom[b].map(s => s.score));
        if (bestA !== bestB) return bestA - bestB;
        const centerA = getAdjacentSectorCenter(a) ? 0 : 1;
        const centerB = getAdjacentSectorCenter(b) ? 0 : 1;
        if (centerA !== centerB) return centerA - centerB;
        return a < b ? -1 : a > b ? 1 : 0;
    });

    const keep = new Set(skRooms.slice(0, maxSk));
    const next = [];
    const removedByRoom = {};
    for (let i = 0; i < targets.length; i++) {
        const s = targets[i];
        if (!isSkRoomName(s.room) || keep.has(s.room)) {
            next.push(s);
        } else {
            if (!removedByRoom[s.room]) removedByRoom[s.room] = [];
            if (s.source) removedByRoom[s.room].push(s.source);
        }
    }
    ROOM_REMOTE_TARGETS[colonyName] = next;
    for (const remoteName in removedByRoom) {
        unindexColonyRemote(colonyName, remoteName, removedByRoom[remoteName]);
    }
}

function routeAcceptable(route) {
    if (!route || !route.length) return false;
    for (let i = 0; i < route.length; i++) {
        const intel = INTEL[route[i]];
        if (!intel) continue;
        if (intel.threatLevel > 1) return false;
        if (intel.roomHeat > 250) return false;
        if (intel.owner && !FRIENDLIES.includes(intel.owner) && intel.towers) return false;
    }
    return true;
}

function getMiningRouteRecord(remoteName, colonyName) {
    const intel = INTEL[remoteName];
    if (!intel || !intel.miningRoutes) return null;
    const rec = intel.miningRoutes[colonyName];
    if (!rec || rec.tick + miningRouteTTL() < Game.time) return null;
    return rec;
}

/** Mining route past TTL but still present — used for score grace, not probing. */
function getStaleMiningRouteRecord(remoteName, colonyName) {
    const intel = INTEL[remoteName];
    if (!intel || !intel.miningRoutes) return null;
    return intel.miningRoutes[colonyName] || null;
}

function getMiningRouteRooms(colonyName, destName) {
    const rec = getMiningRouteRecord(destName, colonyName);
    if (rec && rec.route && rec.route.length) return rec.route;
    const stale = getStaleMiningRouteRecord(destName, colonyName);
    if (stale && stale.route && stale.route.length) return stale.route;
    const cached = getRoute(colonyName, destName);
    if (cached && cached !== 'failed' && cached.length) return cached;
    // Never live-pathfind here — only probeMiningRoute (budgeted) may call findRoute.
    return [];
}

function storeMiningRoute(remoteName, colonyName, route, safe) {
    if (!INTEL[remoteName]) INTEL[remoteName] = {name: remoteName, shardName: Game.shard.name};
    const intel = INTEL[remoteName];
    if (!intel.miningRoutes) intel.miningRoutes = {};
    intel.miningRoutes[colonyName] = {
        route: route.slice(),
        routeLen: route.length,
        estimateScore: estimateMiningScore(route.length, intel),
        tick: Game.time,
        safe: !!safe,
    };
}

/**
 * Ensure a mining route record exists. Prefer free caches over Game.map.findRoute.
 * @param {object} [options]
 * @param {boolean} [options.allowLive] - if false, never call findRoute (default true when budget allows)
 * @param {boolean} [options.forceLive] - re-path even if a fresh record exists (still budget-gated)
 */
function probeMiningRoute(colonyName, remoteName, options = {}) {
    const allowLive = options.allowLive !== false;
    const routeMax = cfg('REMOTE_ROUTE_MAX', DEFAULT_ROUTE_MAX);

    if (!options.forceLive) {
        const existing = getMiningRouteRecord(remoteName, colonyName);
        if (existing) return existing;
    }

    // Soft-extend a still-safe stale mining route — free, no pathfind.
    const stale = getStaleMiningRouteRecord(remoteName, colonyName);
    if (stale && stale.route && stale.route.length && !options.forceLive) {
        if (stale.route.length <= routeMax && routeAcceptable(stale.route)) {
            stale.tick = Game.time;
            stale.safe = true;
            if (!stale.estimateScore) {
                stale.estimateScore = estimateMiningScore(stale.route.length, INTEL[remoteName]);
            }
            return stale;
        }
    }

    // Reuse pathRoute cache without a new Game.map.findRoute.
    const cached = getRoute(colonyName, remoteName);
    if (cached && cached !== 'failed' && cached.length) {
        if (cached.length <= routeMax && routeAcceptable(cached)) {
            storeMiningRoute(remoteName, colonyName, cached, true);
            return INTEL[remoteName].miningRoutes[colonyName];
        }
        return null;
    }
    if (cached === 'failed') return null;

    // Live pathfind — hard-capped empire-wide per tick.
    if (!allowLive || !consumeProbeBudget()) {
        // Return unsafe stale only as a last resort for callers that need *something*
        return (stale && stale.route && stale.route.length) ? stale : null;
    }

    const route = findRoute(colonyName, remoteName);
    if (!route.length) return null;
    if (route.length > routeMax) return null;
    if (!routeAcceptable(route)) return null;

    storeMiningRoute(remoteName, colonyName, route, true);
    return INTEL[remoteName].miningRoutes[colonyName];
}

function pruneRemoteRoomParents(remoteName) {
    const intel = INTEL[remoteName];
    if (!intel || !intel.remoteRoom || !intel.remoteRoom.length) return;
    intel.remoteRoom = intel.remoteRoom.filter(c => MY_ROOMS.includes(c));
}

function trackRemoteRoom(remoteName, colonyRoom) {
    const colony = colonyRoom.name || colonyRoom;
    if (!INTEL[remoteName]) INTEL[remoteName] = {name: remoteName, shardName: Game.shard.name};
    pruneRemoteRoomParents(remoteName);
    if (!INTEL[remoteName].remoteRoom) INTEL[remoteName].remoteRoom = [];
    if (INTEL[remoteName].remoteRoom.indexOf(colony) === -1) {
        INTEL[remoteName].remoteRoom.push(colony);
    }
}

function remoteIntelEligible(colonyRoom, remoteName) {
    const colony = colonyRoom.name;
    if (remoteName === colony) return false;
    if (roomStatus(remoteName) !== roomStatus(colony)) return false;
    // Sector-center energy is an add-on to an adjacent SK room, not a discovered remote.
    if (isSectorCenterRoomName(remoteName)) return false;
    const intel = INTEL[remoteName];
    if (!intel || !intel.sources || intel.owner || intel.obstacles) return false;
    if (intel.reservation && intel.reservation !== MY_USERNAME && intel.reservation !== 'Invader') return false;
    const isSk = !!(intel.sk || (global.isSourceKeeperRoomName && global.isSourceKeeperRoomName(remoteName)));
    if (isSk && !(SK_MINING && colonyRoom.level >= SK_MINING_LEVEL)) return false;
    if (isSk && !isAllowedSkRoom(colony, remoteName)) return false;
    return true;
}

function shouldProbeNewRemotes(room) {
    const ei = room.memory.energyInfo;
    if (ei && ei.flowStressed) return false;
    if (ei && (ei.trend || 0) < -3) return false;
    return true;
}

function hasRemoteSourceDataForColony(colonyName, remoteName) {
    // Any source data is enough to probe/ingest. Sticky assignment to another colony
    // is handled in ingest via reclaim when that colony is idle.
    const intel = INTEL[remoteName];
    return !!(intel && intel.remoteSourceData && intel.remoteSourceData.length);
}

function refreshStaggerDue(roomName, force) {
    if (force) return true;
    const staggerMod = cfg('REMOTE_REFRESH_STAGGER', DEFAULT_REFRESH_STAGGER);
    const stagger = ((roomName.charCodeAt(1) || 0) + (roomName.charCodeAt(4) || 0)) % staggerMod;
    return Game.time % staggerMod === stagger;
}

function sourcePickScore(sourceEntry) {
    const intel = INTEL[sourceEntry.room];
    const sources = (intel && intel.sources) || 1;
    // Assigned remotes only: do not penalize unreserved rooms. A +8 here plus
    // "reserver requires a harvester" meant new remotes never got a bootstrap
    // once reserved sources filled the cap.
    return sourceEntry.score - Math.min(6, (sources - 1) * 2);
}

function intelObservationTick(intel) {
    return Math.max(intel.lastObservation || 0, intel.cached || 0, intel.microUpdate || 0);
}

/**
 * Live combat/stronghold that should pause SK mining. Stale threatLevel from a
 * previous invader wave must not drop the assignment forever once we have no vision.
 */
function skCombatBlocksMining(remoteName) {
    const intel = INTEL[remoteName];
    if (!intel) return false;
    const vis = Game.rooms[remoteName];
    if (vis) {
        if (vis.structures.some(s => s.structureType === STRUCTURE_TOWER && !s.my)) return true;
        return vis.hostileCreeps.some(c => {
            const owner = c.owner && c.owner.username;
            if (!owner || owner === 'Source Keeper') return false;
            return c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK);
        });
    }
    if (intel.invaderCore && intel.invaderCore > Game.time) return true;
    if (intel.invaderTTL && intel.invaderTTL > Game.time) return true;
    if (intel.threatLevel > 1 && intelObservationTick(intel) + 300 > Game.time) return true;
    return false;
}

function shouldSkipRemotePrune(colonyRoom, remoteName) {
    if (Memory.avoidRemotes && _.includes(Memory.avoidRemotes, remoteName)) return true;
    if (!INTEL[remoteName]) return true;
    if (isSectorCenterRoomName(remoteName)) {
        if (!isSectorCenterAddOn(colonyRoom.name, remoteName)) return true;
        if (INTEL[remoteName].owner || INTEL[remoteName].obstacles) return true;
        if (INTEL[remoteName].roomHeat > 250 && intelObservationTick(INTEL[remoteName]) + CREEP_LIFE_TIME > Game.time) return true;
        return false;
    }
    const isSk = !!(INTEL[remoteName].sk || (global.isSourceKeeperRoomName && global.isSourceKeeperRoomName(remoteName)));
    if (isSk && !(SK_MINING && colonyRoom.level >= SK_MINING_LEVEL)) return true;
    if (isSk) {
        if (skCombatBlocksMining(remoteName)) return true;
        return false;
    }
    if (INTEL[remoteName].threatLevel > 1) return true;
    if (INTEL[remoteName].level || !INTEL[remoteName].sources) return true;
    if (INTEL[remoteName].reservation && ![MY_USERNAME, 'Invader'].includes(INTEL[remoteName].reservation)) return true;
    if (INTEL[remoteName].roomHeat > 250) return true;
    if (INTEL[remoteName].obstacles) return true;
    return false;
}

function pruneRoomRemoteTargets(colonyName, colonyRoom) {
    const targets = ROOM_REMOTE_TARGETS[colonyName];
    if (!targets || !targets.length) return;
    ensureClaimIndex();
    const kept = [];
    const removedByRoom = {};
    for (let i = 0; i < targets.length; i++) {
        const s = targets[i];
        let keep = true;
        if (shouldSkipRemotePrune(colonyRoom, s.room)) keep = false;
        else if (isRemoteClaimedByOther(colonyName, s.room, s.source)) keep = false;
        else if (!isRemoteSourceScoreAcceptable(colonyName, s.room, s.score, {allowMissingEstimate: true})) {
            keep = false;
        }
        if (keep) {
            kept.push(s);
        } else if (s.source) {
            if (!removedByRoom[s.room]) removedByRoom[s.room] = [];
            removedByRoom[s.room].push(s.source);
        }
    }
    ROOM_REMOTE_TARGETS[colonyName] = kept;
    for (const remoteName in removedByRoom) {
        unindexColonyRemote(colonyName, remoteName, removedByRoom[remoteName]);
    }
    pruneExcessSkRooms(colonyName);
    pruneOrphanSectorCenters(colonyName);
    pruneRemoteRoomCount(colonyName, colonyRoom);
}

function getCandidateRemotesForProbe(colonyRoom) {
    const colony = colonyRoom.name;
    const seen = new Set();
    const ordered = [];
    const probeMax = cfg('REMOTE_ROUTE_PROBE_MAX', DEFAULT_PROBE_MAX);
    const linearMax = cfg('REMOTE_LINEAR_MAX', DEFAULT_LINEAR_MAX);

    const add = (rName, priority) => {
        if (seen.has(rName) || !remoteIntelEligible(colonyRoom, rName)) return false;
        // Discovery only: never pick up a second SK room, unless this one shares an
        // exit and an already-listed SK does not — pruneExcessSkRooms then keeps
        // the adjacent room. Assigned SK rooms (priority 0) still come through so
        // prune can rank and drop extras.
        if (priority > 0 && isSkRoomName(rName)) {
            let listedSk = false;
            let listedNonAdjacentSk = false;
            for (let i = 0; i < ordered.length; i++) {
                if (!isSkRoomName(ordered[i].room)) continue;
                listedSk = true;
                if (!isExitNeighbor(colony, ordered[i].room)) listedNonAdjacentSk = true;
            }
            if (listedSk && !(listedNonAdjacentSk && isExitNeighbor(colony, rName))) return false;
        }
        seen.add(rName);
        ordered.push({room: rName, priority});
        return true;
    };

    // Priority 0: already assigned (always include for ingest/prune).
    const targets = ROOM_REMOTE_TARGETS[colony] || [];
    for (let i = 0; i < targets.length; i++) add(targets[i].room, 0);

    // Use intel indexes only (O(index) not O(all INTEL)).
    const idx = global.getIntelIndexes ? global.getIntelIndexes() : null;
    const activeRemotes = idx && idx.activeRemotes ? [...idx.activeRemotes] : [];
    for (let i = 0; i < activeRemotes.length; i++) {
        const rName = activeRemotes[i];
        if (seen.has(rName)) continue;
        const intel = INTEL[rName];
        if (!intel || !intel.remoteSourceData) continue;
        if (Game.map.getRoomLinearDistance(colony, rName) > linearMax) continue;
        let priority = 2;
        for (let j = 0; j < intel.remoteSourceData.length; j++) {
            if (intel.remoteSourceData[j].colony === colony) {
                priority = 1;
                break;
            }
        }
        add(rName, priority);
    }

    // Discovery pool: unowned sources within linear range.
    const unowned = idx && idx.unownedSources ? [...idx.unownedSources] : [];
    const pool = [];
    for (let i = 0; i < unowned.length; i++) {
        const rName = unowned[i];
        if (seen.has(rName)) continue;
        if (!remoteIntelEligible(colonyRoom, rName)) continue;
        const linear = Game.map.getRoomLinearDistance(colony, rName);
        if (linear > linearMax) continue;
        const intel = INTEL[rName];
        pool.push({
            room: rName,
            sources: (intel && intel.sources) || 1,
            linear,
            stale: !intel || !intel.cached || intel.cached + 5000 < Game.time ? 1 : 0,
        });
    }

    pool.sort((a, b) => {
        if (b.sources !== a.sources) return b.sources - a.sources;
        // Chebyshev linear==1 includes diagonals (2 hops). Prefer a shared exit.
        const adjA = isExitNeighbor(colony, a.room) ? 0 : 1;
        const adjB = isExitNeighbor(colony, b.room) ? 0 : 1;
        if (adjA !== adjB) return adjA - adjB;
        if (a.linear !== b.linear) return a.linear - b.linear;
        return b.stale - a.stale;
    });

    const slots = Math.max(0, probeMax - ordered.length);
    let cursor = colonyRoom.memory.remoteProbeCursor || 0;
    if (pool.length && slots > 0) {
        for (let i = 0; i < slots; i++) {
            const entry = pool[(cursor + i) % pool.length];
            add(entry.room, 10 + entry.linear);
        }
        colonyRoom.memory.remoteProbeCursor = (cursor + slots) % pool.length;
    }

    ordered.sort((a, b) => a.priority - b.priority);

    // Never drop current assignments; cap discovery extras.
    let assignedCount = 0;
    for (let i = 0; i < ordered.length; i++) {
        if (ordered[i].priority === 0) assignedCount++;
    }
    const cap = Math.max(assignedCount, probeMax);
    const out = [];
    for (let i = 0; i < ordered.length && out.length < cap; i++) {
        out.push(ordered[i].room);
    }
    return out;
}

function bootstrapRemoteRoomOnVision(room) {
    if (room.controller && room.controller.my) return;
    if (!room.sources.length) return;
    const roomIntel = INTEL[room.name];
    if (!roomIntel || roomIntel.owner) return;

    pruneRemoteRoomParents(room.name);

    if (isSectorCenterRoomName(room.name)) {
        if (typeof MY_ROOMS === 'undefined' || !MY_ROOMS) return;
        for (let i = 0; i < MY_ROOMS.length; i++) {
            const colony = MY_ROOMS[i];
            if (getSectorCenterSkParent(colony, room.name)) trackRemoteRoom(room.name, colony);
        }
        return;
    }

    const colony = findClosestOwnedRoom(room.name, false, 4);
    if (!colony || colony === room.name) return;

    const rec = getMiningRouteRecord(room.name, colony) || probeMiningRoute(colony, room.name);
    if (!rec || !rec.safe) return;

    trackRemoteRoom(room.name, colony);
}

function maybeRefreshRemoteIntel(rName) {
    const visRoom = Game.rooms[rName];
    if (!visRoom) return;
    const intel = INTEL[rName];
    if (intel && intel.microUpdate + 150 >= Game.time) return;
    visRoom.cacheRoomIntel();
}

// Heap cache for visible-path remote scores — pathOnly shibMove never hits creep path cache.
const SCORE_PATH_TTL = 500;
let scorePathCacheTick = -1;
/** @type {Object.<string, {tick: number, cost: number}>} */
const scorePathCache = Object.create(null);

function scorePathCacheKey(sourceId, colonyName) {
    return `${sourceId}|${colonyName}`;
}

function getCachedSourceScore(sourceId, colonyName) {
    const entry = scorePathCache[scorePathCacheKey(sourceId, colonyName)];
    if (!entry) return null;
    if (entry.tick + SCORE_PATH_TTL <= Game.time) return null;
    return entry.cost;
}

function setCachedSourceScore(sourceId, colonyName, cost) {
    // Opportunistic prune once per tick when the map grows large.
    if (scorePathCacheTick !== Game.time) {
        scorePathCacheTick = Game.time;
        if (Object.keys(scorePathCache).length > 200) {
            for (const k in scorePathCache) {
                if (scorePathCache[k].tick + SCORE_PATH_TTL <= Game.time) delete scorePathCache[k];
            }
        }
    }
    scorePathCache[scorePathCacheKey(sourceId, colonyName)] = {tick: Game.time, cost};
}

function calculateRemoteSourceScore(room, source, colonyName) {
    if (!Game.rooms[colonyName] || !Game.rooms[colonyName].memory) return Infinity;

    const max = remoteDistanceMax();
    const estimate = getRouteEstimateScore(room.name, colonyName);
    if (estimate === null) return Infinity;

    const roomVisible = !!Game.rooms[room.name];
    if (!roomVisible) {
        if (estimate < max - SCORE_BORDERLINE_MARGIN
            && isRemoteSourceScoreAcceptable(colonyName, room.name, estimate)) {
            return estimate;
        }
        return Infinity;
    }

    const cached = getCachedSourceScore(source.id, colonyName);
    if (cached !== null) return cached;

    const route = getMiningRouteRooms(colonyName, room.name);
    // No known mining route: estimate only — never cold multi-room PathFinder + findRoute.
    if (!route.length) {
        if (estimate <= max && isRemoteSourceScoreAcceptable(colonyName, room.name, estimate)) {
            setCachedSourceScore(source.id, colonyName, estimate);
            return estimate;
        }
        return Infinity;
    }

    const colony = Game.rooms[colonyName];
    let hubXY = null;
    try {
        hubXY = require('planDoc').getHub(colony);
    } catch (e) {
        hubXY = colony.memory.bunkerHub;
    }
    const target = colony.storage
        || (hubXY
            ? new RoomPosition(hubXY.x, hubXY.y, colonyName)
            : new RoomPosition(25, 25, colonyName));

    const pathResult = source.pos.shibMove(target, {
        route,
        range: 1,
        noLiveRoute: true,
        maxOps: 4000,
    });
    if (!pathResult || pathResult.incomplete || typeof pathResult.cost !== 'number') {
        // Vision without a complete path still allows hop-viable remotes via estimate.
        if (estimate <= max && isRemoteSourceScoreAcceptable(colonyName, room.name, estimate)) {
            setCachedSourceScore(source.id, colonyName, estimate);
            return estimate;
        }
        return Infinity;
    }

    const raw = Math.ceil(pathResult.cost / 2);
    if (raw > max) {
        setCachedSourceScore(source.id, colonyName, Infinity);
        return Infinity;
    }
    // Cap windy paths at estimate * mult instead of rejecting — otherwise scouting a
    // hop-viable remote permanently blocks it when the walk path is longer than expected.
    const pathCap = Math.ceil(estimate * remoteScorePathMult());
    const capped = Math.min(raw, pathCap);
    if (!isRemoteSourceScoreAcceptable(colonyName, room.name, capped)) {
        setCachedSourceScore(source.id, colonyName, Infinity);
        return Infinity;
    }
    setCachedSourceScore(source.id, colonyName, capped);
    return capped;
}

function getActiveRemoteRooms(colonyRoom, shouldSkipRemote, deps = {}) {
    const colony = colonyRoom.name;
    const rooms = new Set();

    for (const s of (ROOM_REMOTE_TARGETS[colony] || [])) {
        if (isRemoteSourceScoreAcceptable(colony, s.room, s.score, {allowMissingEstimate: true})
            && !shouldSkipRemote(colonyRoom, s.room)
            && !isRemoteClaimedByOther(colony, s.room, s.source)) {
            rooms.add(s.room);
        }
    }

    const cached = deps.cachedRemotes || [];
    for (let i = 0; i < cached.length; i++) {
        if (!shouldSkipRemote(colonyRoom, cached[i])
            && !isRemoteClaimedByOther(colony, cached[i])) {
            rooms.add(cached[i]);
        }
    }

    const liveRemotes = deps.liveRemoteRooms;
    if (liveRemotes) {
        for (const r of liveRemotes) {
            if (!shouldSkipRemote(colonyRoom, r) && !isRemoteClaimedByOther(colony, r)) rooms.add(r);
        }
    }

    return [...rooms];
}

function shouldProcessRemote(colonyRoom, remoteName, deps) {
    const colony = colonyRoom.name;
    const max = remoteDistanceMax();
    if (deps.shouldSkipRemote(colonyRoom, remoteName)) return false;
    if (isRemoteClaimedByOther(colony, remoteName)) return false;

    if ((ROOM_REMOTE_TARGETS[colony] || []).some(s =>
        s.room === remoteName && isRemoteSourceScoreAcceptable(colony, s.room, s.score, {allowMissingEstimate: true}))) {
        return true;
    }
    if (deps.getCreepCount(undefined, 'remoteHarvester', remoteName)) return true;
    if (deps.getCreepCount(undefined, 'reserver', remoteName)) return true;
    if (deps.countQueuedRole(colony, 'remoteHarvester', remoteName)) return true;
    if (deps.countQueuedRole(colony, 'reserver', remoteName)) return true;

    const rec = getMiningRouteRecord(remoteName, colony);
    return !!(rec && rec.safe && rec.estimateScore <= max);
}

function isContestedRemoteCandidate(colonyRoom, remoteName) {
    if (!remoteName || !INTEL[remoteName]) return false;
    if (roomStatus(remoteName) !== roomStatus(colonyRoom.name)) return false;
    const intel = INTEL[remoteName];
    if (intel.sk || intel.safemode || intel.towers || intel.obstacles || !intel.sources) return false;
    if (!intel.user || intel.user === 'Invader' || FRIENDLIES.includes(intel.user)) return false;
    if ((intel.lastContest || 0) + (CREEP_LIFE_TIME * 4) >= Game.time) return false;
    return true;
}

function isBlockedRemoteCandidate(colonyRoom, remoteName) {
    if (!remoteName || !INTEL[remoteName]) return false;
    if (MY_ROOMS && MY_ROOMS.includes(remoteName)) return false;
    if (roomStatus(remoteName) !== roomStatus(colonyRoom.name)) return false;
    const intel = INTEL[remoteName];
    if (!intel.obstacles) return false;
    if (intel.sk || intel.owner) return false;
    if (intel.safemode && intel.safemode > Game.time) return false;
    return true;
}

const SK_UNGUARDED_RECYCLE_TICKS = 100;
const SK_GUARD_DEPENDENT_ROLES = new Set([
    'remoteHarvester', 'remoteHauler', 'remoteBuilder', 'roadBuilder', 'commodityMiner',
]);
const skUnguardedSince = Object.create(null);

function isSkRoomName(roomName) {
    return !!(INTEL[roomName] && INTEL[roomName].sk)
        || !!(global.isSourceKeeperRoomName && global.isSourceKeeperRoomName(roomName));
}

let liveSkTick = -1;
const liveSkByDest = Object.create(null);

function refreshLiveSkAttackers() {
    if (liveSkTick === Game.time) return;
    liveSkTick = Game.time;
    for (const key in liveSkByDest) delete liveSkByDest[key];
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (!creep.my || creep.memory.role !== 'SKAttacker') continue;
        const dest = creep.memory.destination || creep.room.name;
        if (dest) liveSkByDest[dest] = true;
    }
    if (typeof CREEP_QUEUES === 'undefined' || !CREEP_QUEUES) return;
    for (const colony in CREEP_QUEUES) {
        const queue = CREEP_QUEUES[colony];
        if (!queue) continue;
        for (const key in queue) {
            const entry = queue[key];
            if (!entry || entry.role !== 'SKAttacker') continue;
            if (entry.destination) liveSkByDest[entry.destination] = true;
        }
    }
}

function hasLiveSkAttacker(remoteName) {
    if (!remoteName) return false;
    refreshLiveSkAttackers();
    return !!liveSkByDest[remoteName];
}

function skAssignmentRoom(creep) {
    const memory = creep && creep.memory;
    if (!memory) return undefined;
    if (memory.other && memory.other.skRoom) return memory.other.skRoom;
    if (memory.role === 'remoteHauler') return memory.other && memory.other.remoteRoom;
    return memory.destination;
}

function shouldRecycleExcessSkCreep(creep) {
    if (!creep || !creep.memory) return false;
    const role = creep.memory.role;
    if (role !== 'SKAttacker' && !SK_GUARD_DEPENDENT_ROLES.has(role)) return false;
    const remote = skAssignmentRoom(creep);
    if (!remote || !isSkRoomName(remote)) return false;
    const colony = creep.memory.colony;
    if (!colony) return false;
    const assigned = getColonySkRooms(colony);
    if (!assigned.length) return false;
    return assigned.indexOf(remote) === -1;
}

function shouldRecycleUnguardedSkCreep(creep) {
    if (!creep || !creep.memory) return false;
    if (creep.memory.skUnguardedSince) delete creep.memory.skUnguardedSince;
    const name = creep.name;
    const role = creep.memory.role;
    const isGuardDependent = SK_GUARD_DEPENDENT_ROLES.has(role);
    const isSkAttacker = role === 'SKAttacker';
    if (!isGuardDependent && !isSkAttacker) {
        delete skUnguardedSince[name];
        return false;
    }
    if (shouldRecycleExcessSkCreep(creep)) {
        delete skUnguardedSince[name];
        return true;
    }
    if (isSkAttacker) {
        delete skUnguardedSince[name];
        return false;
    }
    const remote = skAssignmentRoom(creep);
    if (!remote || !isSkRoomName(remote)) {
        delete skUnguardedSince[name];
        return false;
    }
    if (hasLiveSkAttacker(remote)) {
        delete skUnguardedSince[name];
        return false;
    }
    if (skUnguardedSince[name] === undefined) {
        skUnguardedSince[name] = Game.time;
        return false;
    }
    return Game.time - skUnguardedSince[name] >= SK_UNGUARDED_RECYCLE_TICKS;
}

module.exports = {
    estimateMiningScore,
    routeAcceptable,
    getMiningRouteRecord,
    getStaleMiningRouteRecord,
    getMiningRouteRooms,
    storeMiningRoute,
    probeMiningRoute,
    trackRemoteRoom,
    remoteIntelEligible,
    shouldProbeNewRemotes,
    hasRemoteSourceDataForColony,
    hasLiveRemoteWork,
    isRemoteClaimedByOther,
    claimRemoteForColony,
    stripRemoteFromOtherColonies,
    refreshStaggerDue,
    sourcePickScore,
    pruneRoomRemoteTargets,
    getCandidateRemotesForProbe,
    bootstrapRemoteRoomOnVision,
    maybeRefreshRemoteIntel,
    calculateRemoteSourceScore,
    getRouteEstimateScore,
    isRemoteSourceScoreAcceptable,
    effectiveHaulScore,
    getActiveRemoteRooms,
    shouldProcessRemote,
    isContestedRemoteCandidate,
    isBlockedRemoteCandidate,
    isSkRoomName,
    skCombatBlocksMining,
    isAllowedSkRoom,
    getColonySkRooms,
    getColonySkGuardRooms,
    pruneExcessSkRooms,
    pruneOrphanSectorCenters,
    getAdjacentSectorCenter,
    getSectorCenterSkParent,
    isSectorCenterRoomName,
    isSectorCenterAddOn,
    skGuardRoom,
    isKeeperYieldRoom,
    hasLiveSkAttacker,
    shouldRecycleUnguardedSkCreep,
    SK_GUARD_DEPENDENT_ROLES,
    SK_UNGUARDED_RECYCLE_TICKS,
};
