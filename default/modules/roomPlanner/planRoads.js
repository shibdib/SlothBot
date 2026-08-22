/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Roads ACT (world mutate) + compat re-exports of planGeomRoads (E4).
 *
 * Owned placement: placeOwnedRoads + siteBudget. Desired tiles live on
 * plan.layers.roads.packed; PathFinder only reruns when the fingerprint changes.
 */

const {getPlan, pushFailure, FailureCodes} = require('planDoc');
const siteBudget = require('planSiteBudget');
const {isPlannerShadow} = require('planFlag');
const {computeLayoutPending} = require('planLayout');

const geom = require('planGeomRoads');
const {
    getRoadPlan,
    evaluateRoadPlan,
    persistOwnedRoadPlan,
    ownedRoadFingerprint,
    refreshRoadPlanMissing,
    needsOwnedRoadWork,
    isOwnedRoomRoadEligible,
    countRoadConstructionSites,
    getRemoteRoadPlan,
    refreshRemotePlanMissing,
    canPlaceRemoteRoadSite,
    tileHasRoadBlockingStructure,
    tileHasRoadAvoid,
    clearRemoteRoadWorkHintCache,
    clearRoomMatrixCache,
    clearRoomPathCache,
    clearOwnedRoomRoadCaches,
    markPlannedTile,
    collectRoomRoadStructures,
    isRemoteRoadPlanComplete,
    clearOwnedMatrixHeap,
    pruneOwnedPlannedBlocked,
} = geom;

const {
    setRoadsBuiltFlag,
    getPosKey,
    canPlaceRoadInRoom,
    tryCreateConstructionSite,
    listVisibleOwnedRooms,
} = require('planUtils');

// Round-robin cursor for cross-room road placement (heap — fine if reset).
let ownedRoadEnsureCursor = 0;
const VERIFY_EVERY = 200;

function syncRemoteRoadBuiltFlag(room, colony, context = {}) {
    const intel = INTEL[room.name];
    if (!intel) return;
    if (isRemoteRoadPlanComplete(room, colony, context)) {
        setRoadsBuiltFlag(room, true);
        intel.roadCount = room.roads.length;
    } else if (intel.roadsBuilt) {
        setRoadsBuiltFlag(room, undefined);
        delete intel.roadCount;
    }
}

const OBSTACLE_SWEEP_INTERVAL = 15;

function tryPlaceNextRemoteRoad(room, colony, context = {}) {
    if (!canPlaceRoadInRoom(room)) return false;
    if (Game.time % OBSTACLE_SWEEP_INTERVAL === (room.name.charCodeAt(0) % OBSTACLE_SWEEP_INTERVAL)) {
        removeRoadsUnderObstacles(room);
    }
    const plan = getRemoteRoadPlan(room, colony, context);
    let placed = 0;
    for (const pos of plan.missing) {
        if (pos.isExit() || tileHasRoadAvoid(pos)) continue;
        if (!canPlaceRemoteRoadSite(room)) break;
        const result = tryCreateConstructionSite(pos, STRUCTURE_ROAD);
        if (result === OK) {
            placed++;
            continue;
        }
        if (result === ERR_NOT_OWNER || result === ERR_FULL) break;
    }
    if (placed) {
        refreshRemotePlanMissing(room, plan);
        // Keep the corridor geometry; only drop work-hint caches.
        clearRemoteRoadWorkHintCache(room.name);
    }
    return placed > 0;
}

function clearOwnedRoomRoadNetwork(roomOrName) {
    const roomName = typeof roomOrName === 'string' ? roomOrName : roomOrName && roomOrName.name;
    if (!roomName) return {destroyed: 0, failed: 0, sites: 0, complete: true};

    const room = Game.rooms[roomName];
    let destroyed = 0;
    let failed = 0;
    let sites = 0;

    const roads = collectRoomRoadStructures(roomName);
    for (const road of roads) {
        if (road.destroy() === OK) destroyed++;
        else failed++;
    }

    if (room) {
        const seenSites = new Set();
        const siteLists = [];
        if (room.__nativeFind) {
            try {
                siteLists.push(room.__nativeFind(FIND_MY_CONSTRUCTION_SITES) || []);
            } catch (e) { /* corrupt room */
            }
        }
        try {
            siteLists.push(room.find(FIND_MY_CONSTRUCTION_SITES));
        } catch (e) { /* corrupt room */
        }
        if (room.constructionSites) siteLists.push(room.constructionSites);
        for (const site of _.flatten(siteLists)) {
            if (!site || site.structureType !== STRUCTURE_ROAD || seenSites.has(site.id)) continue;
            seenSites.add(site.id);
            if (site.remove() === OK) sites++;
        }
    }

    clearOwnedMatrixHeap(roomName);
    clearOwnedRoomRoadCaches(roomName);

    return {destroyed, failed, sites, roadsFound: roads.length, roomName};
}

/**
 * Destroy roads (and cancel road sites) under obstacle buildings — e.g. dynamic
 * extensions that landed on an existing road. Network planning already routes
 * around the building; without this the dead road remains underneath.
 */
function removeRoadsUnderObstacles(room) {
    if (!room) return 0;
    let changed = 0;

    const roads = room.roads || [];
    for (const road of roads) {
        if (!tileHasRoadBlockingStructure(road.pos)) continue;
        if (road.destroy() === OK) changed++;
    }

    for (const site of room.constructionSites) {
        if (site.structureType !== STRUCTURE_ROAD) continue;
        if (!tileHasRoadBlockingStructure(site.pos)) continue;
        if (site.remove() === OK) changed++;
    }

    if (changed) {
        clearRoomMatrixCache(room.name, 'owned');
        clearRoomMatrixCache(room.name, 'remote');
        clearRoomPathCache(room.name, 'owned');
        clearRoomPathCache(room.name, 'remote');
        pruneOwnedPlannedBlocked(room.name);
    }
    return changed;
}

function persistedRoadStale(room, fingerprint) {
    try {
        const layer = room.memory && room.memory.plan && room.memory.plan.layers
            && room.memory.plan.layers.roads;
        const extra = layer && layer.extra;
        return !extra || extra.fingerprint !== fingerprint || typeof extra.pathFailures !== 'number';
    } catch (e) {
        return true;
    }
}

function reportFrom(room, report, extra) {
    return Object.assign({
        ok: !!(report.placed || report.cleaned),
        placed: report.placed || 0,
        cleaned: report.cleaned || 0,
        limit: report.limit,
        complete: report.complete,
        missing: report.missing,
        layoutPending: report.layoutPending,
        reason: report.reason,
        pathFailures: report.pathFailures,
    }, extra || {});
}

/**
 * Place owned-room roads via siteBudget from the persisted desired set.
 * @param {Room} room
 * @param {{layoutPending?: boolean, forceRebuild?: boolean, verify?: boolean}} [options]
 * @returns {{ok: boolean, placed: number, cleaned?: number, limit?: number, complete?: boolean, reason?: string, shadow?: boolean}}
 */
function placeOwnedRoads(room, options) {
    const opts = options || {};
    const layoutPending = opts.layoutPending != null
        ? !!opts.layoutPending
        : computeLayoutPending(room);
    const forceRebuild = !!opts.forceRebuild;
    const verify = !!opts.verify;

    siteBudget.setRoomPolicy(room, {layoutPending});

    const fingerprint = ownedRoadFingerprint(room);
    const stale = forceRebuild || persistedRoadStale(room, fingerprint);

    let cleaned = 0;
    if (forceRebuild || verify || stale) {
        cleaned = removeRoadsUnderObstacles(room);
    }

    const finish = (report) => {
        report.cleaned = cleaned;
        report.layoutPending = layoutPending;
        persistOwnedRoadPlan(room, report.plan, {
            layoutPending,
            limit: report.limit,
            reason: report.reason,
            placed: report.placed || 0,
            v2: true,
            shadow: !!report.shadow,
        });
        return reportFrom(room, report, {shadow: report.shadow});
    };

    if (isPlannerShadow(room)) {
        const plan = getRoadPlan(room, {force: forceRebuild});
        return finish({
            plan,
            placed: 0,
            missing: plan.missing.length,
            complete: plan.complete,
            limit: siteBudget.roadLimit(room, {layoutPending}),
            pathFailures: plan.pathFailures || 0,
            shadow: true,
            reason: 'shadow',
        });
    }

    if (!room.storage || !room.spawns.length || room.level < ROAD_LEVEL) {
        setRoadsBuiltFlag(room, undefined);
        return {
            ok: cleaned > 0,
            placed: 0,
            cleaned,
            reason: 'gated',
            layoutPending,
        };
    }
    if (!canPlaceRoadInRoom(room)) {
        return {
            ok: cleaned > 0,
            placed: 0,
            cleaned,
            reason: 'cannot-place-roads',
            layoutPending,
        };
    }
    if (Memory.pauseOwnedRoads && Memory.pauseOwnedRoads > Game.time) {
        return {
            ok: cleaned > 0,
            placed: 0,
            cleaned,
            reason: 'paused',
            layoutPending,
        };
    }

    const plan = getRoadPlan(room, {force: forceRebuild || stale});
    if (plan.complete) {
        return finish({
            plan,
            placed: 0,
            missing: 0,
            complete: true,
            pathFailures: 0,
            reason: 'roads_built',
        });
    }

    const maxThisTick = siteBudget.roadLimit(room, {layoutPending});
    if (maxThisTick === 0) {
        return finish({
            plan,
            placed: 0,
            missing: plan.missing.length,
            complete: plan.complete,
            limit: 0,
            pathFailures: plan.pathFailures || 0,
            reason: 'limit-zero',
        });
    }

    let placed = 0;
    for (let i = 0; i < plan.missing.length; i++) {
        if (placed >= maxThisTick) break;
        const pos = plan.missing[i];
        if (pos.isExit() || tileHasRoadAvoid(pos)) continue;
        const res = siteBudget.tryPlace(room, 'roads', pos, STRUCTURE_ROAD, {layoutPending});
        if (res.ok) {
            placed++;
            markPlannedTile(room.name, 'owned', getPosKey(pos));
            continue;
        }
        if (res.result === ERR_NOT_OWNER) break;
        if (res.code === FailureCodes.SITE_BUDGET_GLOBAL
            || res.code === FailureCodes.SITE_BUDGET_ROOM
            || res.code === FailureCodes.BUDGET_RESERVED_FOR_HIGHER) {
            const doc = getPlan(room);
            if (doc && res.code) {
                pushFailure(doc, {
                    code: res.code,
                    layer: 'roads',
                    detail: {x: pos.x, y: pos.y},
                    tick: Game.time,
                    source: 'planRoads.placeOwnedRoads',
                });
            }
            break;
        }
    }

    if (placed) refreshRoadPlanMissing(room, plan);

    return finish({
        plan,
        placed,
        missing: plan.missing.length,
        complete: plan.complete,
        limit: maxThisTick,
        pathFailures: plan.pathFailures || 0,
    });
}

/**
 * Global progress for owned roads — one eligible room per call.
 * Room-phase placement is verify-only; this is the live queue.
 */
function ensureOwnedRoadsProgress() {
    if (Memory.pauseOwnedRoads && Memory.pauseOwnedRoads > Game.time) return 0;
    const bucket = Game.cpu && Game.cpu.bucket != null ? Game.cpu.bucket : 10000;
    if (bucket < 2000 && Game.time % 5 !== 0) return 0;
    if (bucket < 5000 && Game.time % 3 !== 0) return 0;
    if (bucket >= 5000 && Game.time % 2 !== 0) return 0;

    const owned = listVisibleOwnedRooms();
    const rooms = [];
    for (let i = 0; i < owned.length; i++) {
        if (isOwnedRoomRoadEligible(owned[i])) rooms.push(owned[i]);
    }
    if (!rooms.length) return 0;

    const start = ownedRoadEnsureCursor % rooms.length;
    ownedRoadEnsureCursor = start + 1;

    let workRoom = null;
    let verify = false;
    for (let offset = 0; offset < rooms.length; offset++) {
        const room = rooms[(start + offset) % rooms.length];
        if (needsOwnedRoadWork(room)) {
            workRoom = room;
            break;
        }
    }
    if (!workRoom) {
        if (bucket < 5000 || Game.time % VERIFY_EVERY !== 0) return 0;
        workRoom = rooms[start % rooms.length];
        verify = true;
    }

    const before = countRoadConstructionSites(workRoom);
    placeOwnedRoads(workRoom, {
        layoutPending: computeLayoutPending(workRoom),
        verify,
    });
    const after = countRoadConstructionSites(workRoom);
    return Math.max(0, after - before);
}

/**
 * @param {Room} room
 */
function inspectRoads(room) {
    let evalPlan = null;
    try {
        evalPlan = evaluateRoadPlan(room);
    } catch (e) {
        evalPlan = {error: (e && e.message) || String(e)};
    }

    const layoutPending = computeLayoutPending(room);
    const plan = evalPlan && !evalPlan.error ? getRoadPlan(room) : null;

    return {
        room: room.name,
        eligible: isOwnedRoomRoadEligible(room),
        needsWork: needsOwnedRoadWork(room),
        complete: plan ? plan.complete : false,
        roadSites: countRoadConstructionSites(room),
        layoutPending,
        availableBudget: siteBudget.available(room, 'roads', {layoutPending}),
        roadLimit: siteBudget.roadLimit(room, {layoutPending}),
        desiredTiles: plan && plan.desired ? plan.desired.size : 0,
        pathFailures: plan ? plan.pathFailures || 0 : undefined,
        fingerprint: plan ? plan.fingerprint : ownedRoadFingerprint(room),
        hydrated: plan ? !!plan.hydrated : undefined,
        evaluate: evalPlan,
        planLayer: room.memory.plan && room.memory.plan.layers && room.memory.plan.layers.roads
            ? room.memory.plan.layers.roads.extra
            : null,
        pauseOwnedRoads: Memory.pauseOwnedRoads || null,
    };
}

module.exports = Object.assign({}, geom, {
    placeOwnedRoads,
    inspectRoads,
    planOwnedRoomRoads: placeOwnedRoads,
    roadBuilder: placeOwnedRoads,
    ensureOwnedRoadsProgress,
    tryPlaceNextRemoteRoad,
    removeRoadsUnderObstacles,
    clearOwnedRoomRoadNetwork,
    syncRemoteRoadBuiltFlag,
});
