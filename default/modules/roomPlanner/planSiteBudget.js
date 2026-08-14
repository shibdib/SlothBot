/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Single construction-site budget allocator for planner V2 (Chunk 9 sole path).
 *
 * World counts and createConstructionSite still go through planUtils (same-tick
 * pending counters). This module adds:
 *   - priority-aware soft reservations within a tick
 *   - layer request/limit API with FailureCodes
 *   - optional tryPlace that respects shadow mode
 *
 * All orchestrator placement layers request through here. Geometry helpers in
 * planRoads / planRamparts / planExtensions may still call planUtils when used
 * outside the tick path (console / injectors).
 */

const {
    globalConstructionSiteLimit,
    maxConstructionSitesPerRoom,
    countGlobalConstructionSites,
    countRoomConstructionSites,
    countRoomConstructionSitesOfType,
    globalConstructionSiteBudget,
    roomConstructionSiteBudget,
    canPlaceConstructionSite,
    tryCreateConstructionSite,
    invalidateRoomConstructionSiteCache,
} = require('planUtils');

const {FailureCodes} = require('planDoc');
const {isPlannerShadow} = require('planFlag');

/** Higher number = places / reserves before lower layers. */
const SITE_LAYER_PRIORITY = {
    spawn: 100,
    towers: 90,
    extensions: 80,
    specials: 75,
    core: 70,
    sources: 60,
    controller: 60,
    links: 60,
    labs: 50,
    mineral: 50,
    corridors: 45,
    roads: 40,
    ramparts: 30,
};

/** Leave room-cap slots for layout while energy capacity is incomplete. */
const LAYOUT_SITE_RESERVE = 3;
/** Soft floor when layout is not pending. */
const STEADY_SITE_RESERVE = 1;
const MAX_ROAD_SITES_PER_TICK = 5;
/**
 * While layout is pending, stop queueing more road sites once this many already
 * exist (protect extension/spawn capacity).
 */
const MAX_ROAD_SITES_QUEUED = 3;
/** Match planRamparts ensure hot path (maxPlace 3). */
const MAX_RAMPART_SITES_PER_TICK = 3;

// --- same-tick soft state ---
let budgetTick = -1;
/** @type {Object.<string, {byLayer: Object.<string, number>}>} */
const softReserved = Object.create(null);
/** @type {Object.<string, {byLayer: Object.<string, number>, total: number}>} */
const softCommitted = Object.create(null);
/** @type {Object.<string, {layoutPending?: boolean}>} */
const roomPolicies = Object.create(null);
/** @type {Array<{tick:number, room:string, layer:string, code:string, want:number, allowed:number}>} */
const denialLog = [];
const MAX_DENIAL_LOG = 40;

function resetBudgetTickIfNeeded() {
    if (typeof Game === 'undefined') return;
    if (budgetTick === Game.time) return;
    budgetTick = Game.time;
    for (const k in softReserved) delete softReserved[k];
    for (const k in softCommitted) delete softCommitted[k];
    for (const k in roomPolicies) delete roomPolicies[k];
    denialLog.length = 0;
}

function priorityOf(layer) {
    if (layer == null) return 0;
    const p = SITE_LAYER_PRIORITY[layer];
    return typeof p === 'number' ? p : 0;
}

function roomNameOf(roomOrName) {
    if (!roomOrName) return null;
    return typeof roomOrName === 'string' ? roomOrName : roomOrName.name;
}

function resolveRoom(roomOrName) {
    if (!roomOrName) return null;
    if (typeof roomOrName !== 'string') return roomOrName;
    return Game.rooms[roomOrName] || null;
}

/**
 * Raw world budget (includes planUtils same-tick pending placements).
 * @param {Room|string} roomOrName
 */
function getRawBudget(roomOrName) {
    resetBudgetTickIfNeeded();
    const name = roomNameOf(roomOrName);
    // planUtils tick-caches Game.constructionSites — one empire scan per tick for all callers.
    const globalCount = countGlobalConstructionSites();
    const globalLimit = globalConstructionSiteLimit();
    const globalBudget = Math.max(0, globalLimit - globalCount);
    const roomCap = maxConstructionSitesPerRoom();
    if (!name) {
        return {
            roomBudget: 0,
            globalBudget,
            roomCount: 0,
            roomCap,
            globalCount,
            globalLimit,
        };
    }
    const roomCount = countRoomConstructionSites(name);
    const roomBudget = Math.max(0, Math.min(roomCap - roomCount, globalBudget));
    return {
        roomBudget,
        globalBudget,
        roomCount,
        roomCap,
        globalCount,
        globalLimit,
    };
}

function getReservedMap(roomName) {
    resetBudgetTickIfNeeded();
    if (!softReserved[roomName]) softReserved[roomName] = {byLayer: Object.create(null)};
    return softReserved[roomName];
}

function getCommittedMap(roomName) {
    resetBudgetTickIfNeeded();
    if (!softCommitted[roomName]) softCommitted[roomName] = {byLayer: Object.create(null), total: 0};
    return softCommitted[roomName];
}

/**
 * Slots soft-reserved by layers with strictly higher priority than `layer`.
 */
function reservedForHigher(roomName, layer) {
    const map = softReserved[roomName] && softReserved[roomName].byLayer;
    if (!map) return 0;
    const p = priorityOf(layer);
    let n = 0;
    for (const k in map) {
        if (priorityOf(k) > p) n += map[k] || 0;
    }
    return n;
}

/**
 * Policy reserve applied to low-priority layers (roads / ramparts).
 *
 * When higher-priority soft reserves already hold layout slots (spawn/towers/
 * extensions), residual layout reserve is reduced so we do not double-stack
 * LAYOUT_SITE_RESERVE on top of those holds.
 */
function policyReserveForLayer(roomName, layer, options) {
    const policy = (options && options.layoutPending != null)
        ? {layoutPending: !!options.layoutPending}
        : (roomPolicies[roomName] || {});
    const isLow = layer === 'roads' || layer === 'ramparts' || layer === 'corridors';
    if (!isLow) return 0;

    if (policy.layoutPending) {
        const higher = reservedForHigher(roomName, layer);
        // V1: reserve 3 for layout. If soft holds already cover that, residual is 0.
        return Math.max(0, LAYOUT_SITE_RESERVE - higher);
    }
    if (options && options.applySteadyReserve) return STEADY_SITE_RESERVE;
    // Roads + ramparts: keep steady reserve when layout is known not pending.
    if ((layer === 'roads' || layer === 'ramparts') && policy.layoutPending === false) {
        return STEADY_SITE_RESERVE;
    }
    if ((layer === 'roads' || layer === 'ramparts')
        && policy.layoutPending === undefined
        && options && options.layoutPending === undefined) {
        // No policy: no automatic reserve (caller can pass layoutPending)
        return 0;
    }
    return 0;
}

/**
 * Set per-room policy for the rest of this tick (e.g. layoutPending).
 * @param {Room|string} roomOrName
 * @param {{layoutPending?: boolean}} policy
 */
function setRoomPolicy(roomOrName, policy) {
    resetBudgetTickIfNeeded();
    const name = roomNameOf(roomOrName);
    if (!name) return;
    roomPolicies[name] = policy || {};
}

/**
 * Soft-reserve slots for a layer so lower-priority work cannot spend them later this tick.
 * @returns {number} amount actually reserved (may be clamped by raw budget)
 */
function reserve(roomOrName, layer, count) {
    resetBudgetTickIfNeeded();
    const name = roomNameOf(roomOrName);
    const n = Math.max(0, count | 0);
    if (!name || !n) return 0;

    const raw = getRawBudget(roomOrName);
    const map = getReservedMap(name);
    const already = map.byLayer[layer] || 0;
    // Total reserved across all layers should not exceed raw room budget.
    let totalOther = 0;
    for (const k in map.byLayer) {
        if (k !== layer) totalOther += map.byLayer[k] || 0;
    }
    const roomLeft = Math.max(0, raw.roomBudget - totalOther);
    const add = Math.min(n, roomLeft);
    map.byLayer[layer] = already + add;
    return add;
}

/**
 * Release soft reservation for a layer (e.g. after placing fewer than reserved).
 */
function release(roomOrName, layer, count) {
    resetBudgetTickIfNeeded();
    const name = roomNameOf(roomOrName);
    if (!name || !softReserved[name]) return 0;
    const map = softReserved[name].byLayer;
    const have = map[layer] || 0;
    if (!have) return 0;
    if (count == null || count >= have) {
        delete map[layer];
        return have;
    }
    map[layer] = have - count;
    return count;
}

/**
 * How many sites this layer may still place after higher-priority reserves + policy.
 * @param {Room|string} roomOrName
 * @param {string} layer
 * @param {{layoutPending?: boolean, applySteadyReserve?: boolean}} [options]
 */
function available(roomOrName, layer, options) {
    resetBudgetTickIfNeeded();
    const name = roomNameOf(roomOrName);
    if (!name) return 0;
    const raw = getRawBudget(roomOrName);
    const higher = reservedForHigher(name, layer);
    const policy = policyReserveForLayer(name, layer, options || {});
    // Own soft reservation still counts as available to this layer
    return Math.max(0, raw.roomBudget - higher - policy);
}

/**
 * Request up to `want` placements for a layer.
 * @returns {{
 *   ok: boolean,
 *   allowed: number,
 *   want: number,
 *   code: string|null,
 *   layer: string,
 *   rawBudget: number,
 *   reservedHigher: number,
 *   policyReserve: number,
 *   available: number,
 *   snapshot: object
 * }}
 */
function request(roomOrName, layer, want, options) {
    resetBudgetTickIfNeeded();
    const name = roomNameOf(roomOrName);
    const need = Math.max(0, want | 0);
    const raw = getRawBudget(roomOrName);
    const higher = name ? reservedForHigher(name, layer) : 0;
    const policy = name ? policyReserveForLayer(name, layer, options || {}) : 0;
    const avail = Math.max(0, raw.roomBudget - higher - policy);
    const allowed = Math.min(need, avail);

    let code = null;
    if (need > 0 && allowed <= 0) {
        if (raw.globalBudget <= 0) code = FailureCodes.SITE_BUDGET_GLOBAL;
        else if (raw.roomBudget <= 0) code = FailureCodes.SITE_BUDGET_ROOM;
        else if (higher > 0 || policy > 0) code = FailureCodes.BUDGET_RESERVED_FOR_HIGHER;
        else code = FailureCodes.SITE_BUDGET_ROOM;
        logDenial(name, layer, code, need, 0);
    }

    const snap = snapshot(roomOrName, options);
    return {
        ok: allowed > 0 || need === 0,
        allowed,
        want: need,
        code,
        layer,
        rawBudget: raw.roomBudget,
        reservedHigher: higher,
        policyReserve: policy,
        available: avail,
        snapshot: snap,
    };
}

function logDenial(roomName, layer, code, want, allowed) {
    denialLog.push({
        tick: typeof Game !== 'undefined' ? Game.time : 0,
        room: roomName,
        layer,
        code,
        want,
        allowed,
    });
    while (denialLog.length > MAX_DENIAL_LOG) denialLog.shift();
}

/**
 * Note a successful placement for diagnostics (planUtils already tracked pending).
 */
function noteCommit(roomOrName, layer, structureType) {
    resetBudgetTickIfNeeded();
    const name = roomNameOf(roomOrName);
    if (!name) return;
    const map = getCommittedMap(name);
    map.byLayer[layer] = (map.byLayer[layer] || 0) + 1;
    map.total++;
    // Consume one soft reservation for this layer if present
    if (softReserved[name] && softReserved[name].byLayer[layer]) {
        release(name, layer, 1);
    }
    // structureType unused for now; reserved for per-type stats
    void structureType;
}

/**
 * Cap helper for roads.
 *   if layoutPending && roadSites >= MAX_ROAD_SITES_QUEUED → 0
 *   min(MAX_ROAD_SITES_PER_TICK, available after higher holds + policy reserve)
 *
 * @param {Room|string} roomOrName
 * @param {{layoutPending?: boolean, maxPerTick?: number}} [options]
 */
function roadLimit(roomOrName, options) {
    const opts = options || {};
    const layoutPending = !!opts.layoutPending;
    const maxPerTick = opts.maxPerTick != null ? opts.maxPerTick : MAX_ROAD_SITES_PER_TICK;

    // While layout is incomplete, do not pile road sites.
    if (layoutPending) {
        const room = resolveRoom(roomOrName);
        if (room) {
            const roadSites = countRoomConstructionSitesOfType(room.name, STRUCTURE_ROAD);
            if (roadSites >= MAX_ROAD_SITES_QUEUED) return 0;
        }
    }

    const req = request(roomOrName, 'roads', maxPerTick, {layoutPending});
    return req.allowed;
}

/**
 * Cap helper for perimeter barriers (parity with planRamparts ensure maxPlace 3).
 * Soft higher holds + residual layoutPending reserve (same stacking rules as roads).
 *
 * @param {Room|string} roomOrName
 * @param {{layoutPending?: boolean, maxPerTick?: number}} [options]
 */
function rampartLimit(roomOrName, options) {
    const opts = options || {};
    const layoutPending = !!opts.layoutPending;
    const maxPerTick = opts.maxPerTick != null ? opts.maxPerTick : MAX_RAMPART_SITES_PER_TICK;
    const req = request(roomOrName, 'ramparts', maxPerTick, {layoutPending});
    return req.allowed;
}

/**
 * Diagnostic snapshot for rampart/barrier limit (ensure maxPlace path).
 * @param {Room} room
 * @param {{layoutPending?: boolean, maxPerTick?: number}} [options]
 */
function compareRampartLimit(room, options) {
    const opts = options || {};
    const name = roomNameOf(room);
    const policy = name ? (roomPolicies[name] || {}) : {};
    const layoutPending = opts.layoutPending != null
        ? !!opts.layoutPending
        : !!policy.layoutPending;
    const maxPerTick = opts.maxPerTick != null ? opts.maxPerTick : MAX_RAMPART_SITES_PER_TICK;
    const raw = getRawBudget(room);
    const softHigher = name ? reservedForHigher(name, 'ramparts') : 0;
    const policyReserve = name ? policyReserveForLayer(name, 'ramparts', {layoutPending}) : 0;
    const v1Simple = Math.min(
        maxPerTick,
        Math.max(0, raw.roomBudget - (layoutPending ? LAYOUT_SITE_RESERVE : STEADY_SITE_RESERVE))
    );
    const v2 = rampartLimit(room, {layoutPending, maxPerTick});
    return {
        layoutPending,
        maxPerTick,
        rawBudget: raw.roomBudget,
        v1Reserve: layoutPending ? LAYOUT_SITE_RESERVE : STEADY_SITE_RESERVE,
        v1Limit: v1Simple,
        v2Limit: v2,
        softHigher,
        policyReserve,
        parity: v1Simple === v2 || softHigher > 0,
    };
}

/**
 * Place one site through planUtils after a budget check.
 * Shadow mode: reports success path without createConstructionSite.
 *
 * @param {Room} room
 * @param {string} layer
 * @param {RoomPosition} pos
 * @param {string} structureType
 * @param {{layoutPending?: boolean}} [options]
 * @returns {{ok: boolean, result: number, shadow?: boolean, code: string|null, request: object}}
 */
function tryPlace(room, layer, pos, structureType, options) {
    const req = request(room, layer, 1, options);
    if (req.allowed < 1) {
        return {
            ok: false,
            result: ERR_FULL,
            code: req.code || FailureCodes.SITE_BUDGET_ROOM,
            request: req,
        };
    }

    if (isPlannerShadow(room)) {
        // Pause / shadow: report success path without world mutates.
        return {
            ok: true,
            result: OK,
            shadow: true,
            code: null,
            request: req,
        };
    }

    const result = tryCreateConstructionSite(pos, structureType);
    if (result === OK) {
        noteCommit(room, layer, structureType);
        return {ok: true, result, code: null, request: req};
    }

    let code = FailureCodes.TILE_BLOCKED;
    if (result === ERR_FULL) {
        code = globalConstructionSiteBudget() <= 0
            ? FailureCodes.SITE_BUDGET_GLOBAL
            : FailureCodes.SITE_BUDGET_ROOM;
    }
    return {ok: false, result, code, request: req};
}

/**
 * Full snapshot for status / console.
 * @param {Room|string} roomOrName
 * @param {{layoutPending?: boolean}} [options]
 */
function snapshot(roomOrName, options) {
    resetBudgetTickIfNeeded();
    const name = roomNameOf(roomOrName);
    const raw = getRawBudget(roomOrName);
    const reserved = name && softReserved[name] ? Object.assign({}, softReserved[name].byLayer) : {};
    const committed = name && softCommitted[name]
        ? {total: softCommitted[name].total, byLayer: Object.assign({}, softCommitted[name].byLayer)}
        : {total: 0, byLayer: {}};
    const policy = name ? (roomPolicies[name] || {}) : {};
    if (options && options.layoutPending != null) {
        policy.layoutPending = !!options.layoutPending;
    }

    const byLayer = {};
    const layers = Object.keys(SITE_LAYER_PRIORITY);
    for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        byLayer[layer] = {
            priority: priorityOf(layer),
            reserved: reserved[layer] || 0,
            available: available(roomOrName, layer, options || policy),
            reservedHigher: name ? reservedForHigher(name, layer) : 0,
        };
    }

    return {
        room: name,
        tick: typeof Game !== 'undefined' ? Game.time : 0,
        raw,
        canPlace: raw.roomBudget > 0,
        policy,
        reserved,
        committed,
        byLayer,
        denialsThisTick: denialLog.filter(d => d.room === name),
    };
}

/**
 * Recent denials (all rooms, this tick).
 */
function getDenials() {
    resetBudgetTickIfNeeded();
    return denialLog.slice();
}

/** @deprecated alias — raw room budget without soft reserves */
function roomBudget(room) {
    return roomConstructionSiteBudget(room);
}

function canPlace(room, layer, options) {
    if (layer) return available(room, layer, options) > 0;
    return canPlaceConstructionSite(room);
}

module.exports = {
    SITE_LAYER_PRIORITY,
    LAYOUT_SITE_RESERVE,
    STEADY_SITE_RESERVE,
    MAX_ROAD_SITES_PER_TICK,
    MAX_ROAD_SITES_QUEUED,
    MAX_RAMPART_SITES_PER_TICK,
    getRawBudget,
    setRoomPolicy,
    reserve,
    release,
    available,
    request,
    noteCommit,
    roadLimit,
    rampartLimit,
    compareRampartLimit,
    tryPlace,
    snapshot,
    getDenials,
    roomBudget,
    canPlace,
    // Re-export world counters for a single import surface on V2 actors later
    globalConstructionSiteLimit,
    maxConstructionSitesPerRoom,
    countGlobalConstructionSites,
    countRoomConstructionSites,
    countRoomConstructionSitesOfType,
    globalConstructionSiteBudget,
    roomConstructionSiteBudget,
    canPlaceConstructionSite,
    tryCreateConstructionSite,
    invalidateRoomConstructionSiteCache,
};
