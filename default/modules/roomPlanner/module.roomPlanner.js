/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Room planner facade — public API for tick, console (global.planner), and internals.
 *
 * ── Mental model (Wave A done; B1 docs) ─────────────────────────────────────
 *
 *   ACT (world mutates via siteBudget only)
 *     planOrchestrator → planActors / planAnchors / planExtensions / planCore /
 *                        planEconomy / planRoads / planRamparts + planCleanup
 *     Entry: buildRoom()
 *
 *   GEOM
 *     planGeomExtensions, planGeomRoads, planGeomRamparts
 *     planTemplates, planUtils, planState
 *     planLayout          → pending diagnostics only (computeLayoutPending)
 *
 *   PLAN DOC (room.memory.plan — anchors sole authority after C5)
 *     planDoc, planFlag (pause/shadow only)
 *     Anchor writes: plan only. Packs still dual-write legacy dynamic* keys.
 *
 * Console: prefer planner.ensure* / inspect* on global.planner (see globals.js).
 *
 * Memory.planner (Memory.plannerV2 still read as migrate fallback):
 *   unset / true     → live place (default)
 *   false            → empire pause (shadow act — no createConstructionSite)
 *   {shadow:true}    → same pause
 *   room.memory.planner false/true → per-room shadow / force-live override
 */

const {
    getPlannerConfig,
    isPlannerConfigured,
    isPlannerEnabled,
    isPlannerShadow,
    isPlannerEmpire,
    setPlannerFlag,
    enablePlannerRooms,
    enablePlannerEmpire,
    pausePlanner,
    resumePlanner,
    readRoomOverride,
    clearRoomPlannerOverride,
} = require('planFlag');
const {
    PLAN_DOC_SCHEMA_VERSION,
    FailureCodes,
    getPlan,
    ensurePlan,
    migrateFromLegacy,
    ensurePlansForOwnedRooms,
    inspectPlan,
    clearPlan,
    remigratePlan,
    pushFailure,
    getHub,
    getTowerHubs,
    getLabHub,
    getPlanMode,
    getLayerPacked,
    syncToLegacy,
    reconcilePlanLegacy,
} = require('planDoc');
const siteBudget = require('planSiteBudget');
const orchestrator = require('planOrchestrator');
const anchors = require('planAnchors');
const actors = require('planActors');
const extLayer = require('planExtensions');
const coreLayer = require('planCore');
const economyLayer = require('planEconomy');
const roadsLayer = require('planRoads');
const rampartsLayer = require('planRamparts');

function buildRoom() {
    try {
        return orchestrator.buildRoom();
    } catch (e) {
        if (typeof log !== 'undefined' && log.e) {
            log.e(`planner orchestrator failed: ${e && e.stack ? e.stack : e}`, 'PLANNER');
        }
        if (typeof Memory !== 'undefined') {
            Memory._plannerOrchestratorError = {
                tick: typeof Game !== 'undefined' ? Game.time : 0,
                error: (e && e.message) || String(e),
                stack: e && e.stack ? String(e.stack).slice(0, 400) : undefined,
            };
        }
        return {
            tick: typeof Game !== 'undefined' ? Game.time : 0,
            orchestrator: true,
            error: (e && e.message) || String(e),
            skipped: true,
            skipReason: 'orchestrator_error',
        };
    }
}

/**
 * Public hub API — always through anchors (Phase 3A).
 * Expansion hubCheck is read-only when options.hubCheck / hubCheck().
 */
function findHub(room) {
    return anchors.ensureCoreHub(room).ok;
}

function hubCheck(room) {
    return anchors.ensureCoreHub(room, {hubCheck: true}).ok;
}

module.exports.buildRoom = buildRoom;
module.exports.hubCheck = hubCheck;
module.exports.findHub = findHub;

/**
 * Shadow-canary diagnostics for one room (no requirement that shadow is on for inspect).
 * @param {Room} room
 */
function canaryReport(room) {
    if (!room) return {error: 'no room'};
    return {
        room: room.name,
        tick: typeof Game !== 'undefined' ? Game.time : 0,
        v2: isPlannerEnabled(room),
        shadow: isPlannerShadow(room),
        config: getPlannerConfig(),
        plan: inspectPlan(room),
        anchors: anchors.inspectAnchors(room),
        spawn: actors.inspectSpawn(room),
        extensions: extLayer.inspectExtensions(room),
        core: coreLayer.inspectCore(room),
        economy: economyLayer.inspectEconomy(room),
        roads: roadsLayer.inspectRoads(room),
        ramparts: rampartsLayer.inspectRamparts(room),
        budget: siteBudget.snapshot(room),
        lastRun: orchestrator.getLastTickReport(),
        errors: {
            orchestrator: typeof Memory !== 'undefined' ? Memory._plannerOrchestratorError || null : null,
            phase: typeof Memory !== 'undefined' ? Memory._plannerPhaseError || Memory._plannerV2PhaseError || null : null,
            sync: typeof Memory !== 'undefined' ? Memory._plannerSyncError || Memory._plannerV2SyncError || null : null,
        },
    };
}

/**
 * One-shot dry-run of all V2 place layers. Refuses unless the room is in shadow mode.
 * @param {Room} room
 */
function canaryDryRun(room) {
    if (!room) return {error: 'no room'};
    // Placement is always V2 (Chunk 9). Dry-run still requires shadow so we never mutate.
    if (!isPlannerShadow(room)) {
        return {
            error: 'shadow_required',
            hint: "planner.pause() first — refusing live place",
        };
    }
    const out = {
        room: room.name,
        tick: Game.time,
        shadow: true,
        layers: {},
    };
    try {
        out.layers.anchors = anchors.ensureAllAnchors(room);
        out.layers.critical = actors.placeCriticalSites(room);
        out.layers.extensions = extLayer.placeExtensions(room);
        out.layers.core = coreLayer.placeCoreStamps(room);
        out.layers.specials = coreLayer.placeSpecials(room);
        out.layers.economy = economyLayer.placeEconomy(room);
        out.layers.roads = roadsLayer.placeOwnedRoads(room);
        out.layers.ramparts = rampartsLayer.placeRamparts(room);
        out.ok = true;
    } catch (e) {
        out.ok = false;
        out.error = (e && e.message) || String(e);
        out.stack = e && e.stack ? String(e.stack).slice(0, 500) : undefined;
    }
    return out;
}

/**
 * Live-canary readiness (Chunk 4). Does not place sites.
 * @param {Room} room
 */
function canaryLiveStatus(room) {
    if (!room) return {error: 'no room'};
    const v2 = isPlannerEnabled(room);
    const shadow = isPlannerShadow(room);
    const live = v2 && !shadow;
    const hub = !!getHub(room);
    const hasSpawn = !!(room.spawns && room.spawns.length);
    const hasSpawnSite = room.constructionSites
        ? room.constructionSites.some(s => s.structureType === STRUCTURE_SPAWN)
        : false;
    const plan = inspectPlan(room);
    const last = orchestrator.getLastTickReport();
    const blockers = [];
    if (!v2) blockers.push('v2_not_enabled');
    if (shadow) blockers.push('still_shadow');
    if (!hub) blockers.push('no_hub');
    if (!hasSpawn && !hasSpawnSite) blockers.push('no_spawn_or_site');

    return {
        room: room.name,
        tick: typeof Game !== 'undefined' ? Game.time : 0,
        v2,
        shadow,
        live,
        ready: live && hub,
        blockers,
        hub,
        hasSpawn,
        hasSpawnSite,
        forceRoom: orchestrator.getForceRoom(),
        forcedHere: orchestrator.getForceRoom() === room.name,
        plan,
        lastRunForRoom: last && last.room === room.name ? last : null,
        lastRun: last,
        errors: {
            orchestrator: typeof Memory !== 'undefined' ? Memory._plannerOrchestratorError || null : null,
            phase: typeof Memory !== 'undefined' ? Memory._plannerPhaseError || Memory._plannerV2PhaseError || null : null,
            sync: typeof Memory !== 'undefined' ? Memory._plannerSyncError || Memory._plannerV2SyncError || null : null,
        },
        hint: live
            ? (orchestrator.getForceRoom() === room.name
                ? 'Live canary active + forced. Watch planner.lastRun() each tick.'
                : "Live layers on. Optional: planner.force('" + room.name + "') to pin room-turns.")
            : (shadow
                ? "Still shadow. Use planner.resume() or planner.live('" + room.name + "')."
                : "planner.live('" + room.name + "') or planner.force('" + room.name + "')"),
    };
}

/**
 * Resume live placement and optionally pin room-turns to one room.
 * Does not write a canary room list (E2).
 * @param {string} roomName
 * @param {{force?: boolean}} [opts] force defaults true
 */
function enableLiveCanary(roomName, opts) {
    if (!roomName || typeof roomName !== 'string') {
        return {error: 'roomName required', hint: "planner.live('W1N1')"};
    }
    const force = !opts || opts.force !== false;
    const config = resumePlanner();
    const forceRoom = force ? orchestrator.setForceRoom(roomName) : orchestrator.getForceRoom();
    const room = typeof Game !== 'undefined' ? Game.rooms[roomName] : null;
    return {
        ok: true,
        room: roomName,
        config,
        forceRoom,
        status: room ? canaryLiveStatus(room) : {error: 'no vision', roomName},
    };
}

/**
 * Empire-wide soak snapshot (Chunk 7). Does not place sites.
 */
function empireStatus() {
    const cfg = getPlannerConfig();
    const forceRoom = orchestrator.getForceRoom();
    const empire = isPlannerEmpire();
    const liveEmpire = empire && !cfg.shadow;
    const rooms = [];
    let liveCount = 0;
    let shadowCount = 0;
    let noHub = 0;
    let towerDeficitTotal = 0;
    let extensionDeficitTotal = 0;
    const warnings = [];

    if (typeof Game !== 'undefined') {
        for (const name in Game.rooms) {
            const room = Game.rooms[name];
            if (!room.controller || !room.controller.my) continue;
            const v2 = isPlannerEnabled(room); // always true post Chunk 9
            const shadow = isPlannerShadow(room);
            const live = v2 && !shadow;
            if (live) liveCount++;
            else shadowCount++;

            const hub = !!getHub(room);
            if (!hub) noHub++;

            let towerDef = 0;
            let extDef = 0;
            try {
                towerDef = anchors.getTowerDeficit(room);
            } catch (e) { /* ignore */
            }
            try {
                extDef = require('planGeomExtensions').getExtensionDeficit(room);
            } catch (e) { /* ignore */
            }
            towerDeficitTotal += towerDef;
            extensionDeficitTotal += extDef;

            let roomBudget = null;
            try {
                roomBudget = siteBudget.getRawBudget(room);
            } catch (e) { /* ignore */
            }

            rooms.push({
                room: name,
                v2,
                shadow,
                live,
                hub,
                rcl: room.controller.level,
                hasSpawn: !!(room.spawns && room.spawns.length),
                towerDeficit: towerDef,
                extensionDeficit: extDef,
                sites: room.constructionSites ? room.constructionSites.length : 0,
                hasPlan: !!(room.memory && room.memory.plan),
                roomBudget: roomBudget ? roomBudget.roomBudget : null,
                globalBudget: roomBudget ? roomBudget.globalBudget : null,
                override: readRoomOverride(room),
            });
        }
    }

    if (!cfg.enabled) warnings.push('v2_not_enabled');
    if (cfg.shadow) warnings.push('shadow_mode');
    if (forceRoom) warnings.push('force_room_pins_turns');
    if (noHub) warnings.push('rooms_without_hub:' + noHub);

    const errors = {
        orchestrator: typeof Memory !== 'undefined' ? Memory._plannerOrchestratorError || null : null,
        phase: typeof Memory !== 'undefined' ? Memory._plannerPhaseError || Memory._plannerV2PhaseError || null : null,
        sync: typeof Memory !== 'undefined' ? Memory._plannerSyncError || Memory._plannerV2SyncError || null : null,
    };
    if (errors.orchestrator) warnings.push('orchestrator_error');
    if (errors.phase) warnings.push('phase_error');
    if (errors.sync) warnings.push('sync_error');

    const recent = orchestrator.getRecentRoomTurns();
    const recentRooms = {};
    for (let i = 0; i < recent.length; i++) {
        const r = recent[i].room;
        recentRooms[r] = (recentRooms[r] || 0) + 1;
    }

    let globalSites = null;
    try {
        const snap = rooms.length
            ? siteBudget.getRawBudget(rooms[0].room)
            : null;
        globalSites = snap ? {
            globalCount: snap.globalCount,
            globalBudget: snap.globalBudget,
            globalLimit: snap.globalLimit,
        } : null;
    } catch (e) { /* ignore */
    }

    const soak = typeof Memory !== 'undefined' ? Memory.plannerEmpireSoak || null : null;
    const soakAge = soak && typeof Game !== 'undefined' && soak.startedTick != null
        ? Game.time - soak.startedTick
        : null;

    const ready = liveEmpire && !forceRoom && !errors.orchestrator && !errors.phase;

    return {
        tick: typeof Game !== 'undefined' ? Game.time : 0,
        config: cfg,
        empire,
        liveEmpire,
        ready,
        forceRoom,
        counts: {
            owned: rooms.length,
            live: liveCount,
            shadow: shadowCount,
            noHub,
            towerDeficitTotal,
            extensionDeficitTotal,
        },
        globalSites,
        denials: siteBudget.getDenials(),
        recentTurns: recent,
        recentRoomHits: recentRooms,
        rooms,
        errors,
        warnings,
        soak: soak ? Object.assign({}, soak, {age: soakAge}) : null,
        lastRun: orchestrator.getLastTickReport(),
        queues: orchestrator.inspectQueues(),
        hint: ready
            ? 'Empire live V2. Watch planner.empire() / lastRun() / queues() over soak ticks.'
            : (warnings.length
                ? 'Blockers: ' + warnings.join(', ') + '. Use planner.enableEmpire() for live empire.'
                : "planner.enableEmpire() then planner.empire()"),
    };
}

/**
 * Enable full V2 layers empire-wide.
 * Clears pause/shadow (unless opts.shadow) and force pin by default
 * so multi-room RR is not starved.
 * @param {{shadow?: boolean, clearForce?: boolean, stampSoak?: boolean}} [opts]
 */
function enableEmpire(opts) {
    const o = opts || {};
    const config = enablePlannerEmpire({shadow: !!o.shadow});

    let clearedForce = null;
    if (o.clearForce !== false) {
        clearedForce = orchestrator.getForceRoom();
        orchestrator.setForceRoom(null);
    }

    // Drop per-room shadow overrides only if explicitly requested.
    let clearedOverrides = 0;
    if (o.clearRoomOverrides && typeof Game !== 'undefined') {
        for (const name in Game.rooms) {
            const room = Game.rooms[name];
            if (!room.controller || !room.controller.my) continue;
            if (clearRoomPlannerOverride(room)) clearedOverrides++;
        }
    }

    const plans = ensurePlansForOwnedRooms();

    if (typeof Memory !== 'undefined' && o.stampSoak !== false && !o.shadow) {
        Memory.plannerEmpireSoak = {
            startedTick: typeof Game !== 'undefined' ? Game.time : 0,
            mode: 'live',
        };
    }

    return {
        ok: true,
        config,
        clearedForce,
        clearedOverrides,
        plans,
        status: empireStatus(),
    };
}

// ── Export surface (B1) ─────────────────────────────────────────────────────
// Tick: buildRoom, findHub, hubCheck (assigned above).
// Names ending in V2 are stable console aliases; prefer non-V2 names when both exist.

// Flags / soak / canary
module.exports.PLAN_DOC_SCHEMA_VERSION = PLAN_DOC_SCHEMA_VERSION;
module.exports.FailureCodes = FailureCodes;
module.exports.getPlannerConfig = getPlannerConfig;
module.exports.isPlannerConfigured = isPlannerConfigured;
module.exports.isPlannerEnabled = isPlannerEnabled;
module.exports.isPlannerShadow = isPlannerShadow;
module.exports.isPlannerEmpire = isPlannerEmpire;
module.exports.setPlannerFlag = setPlannerFlag;
module.exports.enablePlannerRooms = enablePlannerRooms;
module.exports.enablePlannerEmpire = enablePlannerEmpire;
// E1: explicit pause/resume (same as setPlannerFlag false / true)
module.exports.pausePlanner = pausePlanner;
module.exports.resumePlanner = resumePlanner;
module.exports.getPlannerV2Config = getPlannerConfig;
module.exports.isPlannerV2Configured = isPlannerConfigured;
module.exports.isPlannerV2Enabled = isPlannerEnabled;
module.exports.isPlannerV2Shadow = isPlannerShadow;
module.exports.isPlannerV2Empire = isPlannerEmpire;
module.exports.setPlannerV2Flag = setPlannerFlag;
module.exports.enablePlannerV2Rooms = enablePlannerRooms;
module.exports.enablePlannerV2Empire = enablePlannerEmpire;
module.exports.pausePlannerV2 = pausePlanner;
module.exports.resumePlannerV2 = resumePlanner;
module.exports.canaryReport = canaryReport;
module.exports.canaryDryRun = canaryDryRun;
module.exports.canaryLiveStatus = canaryLiveStatus;
module.exports.enableLiveCanary = enableLiveCanary;
module.exports.empireStatus = empireStatus;
module.exports.enableEmpire = enableEmpire;
module.exports.setPlannerForceRoom = orchestrator.setForceRoom;
module.exports.getPlannerForceRoom = orchestrator.getForceRoom;
module.exports.getRecentPlannerRooms = orchestrator.getRecentRoomTurns;

// Plan document (room.memory.plan)
module.exports.getPlan = getPlan;
module.exports.ensurePlan = ensurePlan;
module.exports.migrateFromLegacy = migrateFromLegacy;
module.exports.ensurePlansForOwnedRooms = ensurePlansForOwnedRooms;
module.exports.inspectPlan = inspectPlan;
module.exports.clearPlan = clearPlan;
module.exports.remigratePlan = remigratePlan;
module.exports.pushFailure = pushFailure;
module.exports.getHub = getHub;
module.exports.getTowerHubs = getTowerHubs;
module.exports.getLabHub = getLabHub;
module.exports.getPlanMode = getPlanMode;
module.exports.getLayerPacked = getLayerPacked;
// Dual-write helpers (Wave C will retire writes; keep for remigrate / diagnostics)
module.exports.syncToLegacy = syncToLegacy;
module.exports.reconcilePlanLegacy = reconcilePlanLegacy;

// Site budget + orchestrator
module.exports.siteBudget = siteBudget;
module.exports.getSiteBudgetSnapshot = siteBudget.snapshot;
module.exports.requestSiteBudget = siteBudget.request;
module.exports.reserveSiteBudget = siteBudget.reserve;
module.exports.orchestrator = orchestrator;
module.exports.getLastPlannerTickReport = orchestrator.getLastTickReport;
module.exports.inspectPlannerQueues = orchestrator.inspectQueues;
module.exports.classifyPlannerRoom = orchestrator.classifyRoom;
module.exports.QUEUE = orchestrator.QUEUE;
module.exports.PHASE = orchestrator.PHASE;

// Act layers — anchors / spawn / towers
module.exports.anchors = anchors;
module.exports.ensureAllAnchors = anchors.ensureAllAnchors;
module.exports.inspectAnchors = anchors.inspectAnchors;
module.exports.placeTowerSites = anchors.placeTowerSites;
module.exports.selectTowerHubs = anchors.selectTowerHubs;
module.exports.getTowerDeficit = anchors.getTowerDeficit;
module.exports.resetTowerLayoutForRoom = anchors.resetTowerLayoutForRoom;
module.exports.queueTowerLayoutReset = anchors.queueTowerLayoutReset;
module.exports.processTowerLayoutResetQueue = anchors.processTowerLayoutResetQueue;
module.exports.auditTowerHubTiles = anchors.auditTowerHubTiles;
module.exports.TOWER_LAYOUT_VERSION = anchors.TOWER_LAYOUT_VERSION;
module.exports.actors = actors;
module.exports.ensureSpawnSite = actors.ensureSpawnSite;
module.exports.inspectSpawn = actors.inspectSpawn;
module.exports.placeCriticalSites = actors.placeCriticalSites;
module.exports.getSpawnAnchor = actors.getSpawnAnchor;

// Act layers — extensions / core / economy / roads / ramparts
module.exports.extensions = extLayer;
module.exports.placeExtensions = extLayer.placeExtensions;
module.exports.placeSourceExtensions = extLayer.placeSourceExtensions;
module.exports.inspectExtensions = extLayer.inspectExtensions;
module.exports.computeExtensionPlan = extLayer.computeExtensionPlan;

module.exports.core = coreLayer;
module.exports.placeCoreStamps = coreLayer.placeCoreStamps;
module.exports.placeSpecials = coreLayer.placeSpecials;
module.exports.inspectCore = coreLayer.inspectCore;

module.exports.economy = economyLayer;
module.exports.placeEconomy = economyLayer.placeEconomy;
module.exports.inspectEconomy = economyLayer.inspectEconomy;

module.exports.roads = roadsLayer;
module.exports.placeOwnedRoads = roadsLayer.placeOwnedRoads;
module.exports.inspectRoads = roadsLayer.inspectRoads;

module.exports.ramparts = rampartsLayer;
module.exports.placePerimeter = rampartsLayer.placePerimeter;
module.exports.placeRamparts = rampartsLayer.placeRamparts;
module.exports.inspectRamparts = rampartsLayer.inspectRamparts;
