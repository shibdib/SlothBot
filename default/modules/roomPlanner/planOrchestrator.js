/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Planner tick orchestrator — sole tick + sole placement path (Chunk 9).
 *
 * Owns empire scheduling: work queues, per-room phases, throttle, bootstrap.
 * Always used by module.roomPlanner.buildRoom (planBuild removed).
 *
 * All owned-room layout placement goes through plan* act + planSiteBudget.
 * Placement is plan* + siteBudget only (A5: no emergency layout placers).
 *
 * Memory.planner: shadow / pause only (see planFlag). Geometry still lives
 * in planExtensions / templates / planRoads / planRamparts helpers.
 */

const {tickTracker} = require('planState');
const {isColonyEarlyRush} = require('bodyHelpers');
const {listVisibleOwnedRooms} = require('planUtils');

const {computeLayoutPending} = require('planLayout');

const {
    getTowerDeficit,
    processTowerLayoutResetQueue,
} = require('planAnchors');

// Wave D: pure signals from geom facades
const {needsOwnedRoadWork} = require('planGeomRoads');
// planRoads / planRamparts loaded lazily in phases to avoid circular requires
const {getExtensionDeficit} = require('planGeomExtensions');

const {
    isPlannerEnabled,
    isPlannerShadow,
    isPlannerEmpire,
    getPlannerConfig,
} = require('planFlag');
const {ensurePlan, ensurePlansForOwnedRooms, getPlan, hasHub} = require('planDoc');
const siteBudget = require('planSiteBudget');
const anchors = require('planAnchors');
const actors = require('planActors');
const extLayer = require('planExtensions');
const coreLayer = require('planCore');
const economyLayer = require('planEconomy');

/** Empire-level room selection queues (highest first). */
const QUEUE = {
    HUB_BOOTSTRAP: 'hub_bootstrap',
    SPAWN_SITE: 'spawn_site',
    SOFT_LAYOUT: 'soft_layout',
    EARLY_RUSH: 'early_rush',
    STEADY: 'steady',
};

/** Ordered phases within a selected room (and globals before selection). */
const PHASE = {
    GLOBAL_PERIMETER: 'global_perimeter',
    GLOBAL_ROADS: 'global_roads',
    TOWER_RESET_QUEUE: 'tower_reset_queue',
    PLAN_SYNC: 'plan_sync',
    HUB: 'hub',
    ANCHORS: 'anchors',
    TOWERS: 'towers',
    SPAWN: 'spawn',
    EXTENSIONS: 'extensions',
    CORE: 'core',
    SPECIALS: 'specials',
    LAYOUT: 'layout',
    ECONOMY: 'economy',
    AUXILIARY: 'auxiliary',
    RAMPARTS: 'ramparts',
    ROADS: 'roads',
};

/** @type {object|null} */
let lastTickReport = null;

function hasBunkerHub(room) {
    if (!room) return false;
    if (room._hasHubTick === Game.time) return !!room._hasHub;
    let ok = false;
    try {
        ok = hasHub(room);
    } catch (e) {
        ok = !!(room.memory.bunkerHub
            && typeof room.memory.bunkerHub.x === 'number'
            && typeof room.memory.bunkerHub.y === 'number');
    }
    room._hasHub = ok;
    room._hasHubTick = Game.time;
    return ok;
}

function needsOwnSpawn(room) {
    return !!(room.controller && room.controller.my && hasBunkerHub(room) && !(room.spawns && room.spawns.length));
}

function needsSpawnSite(room) {
    if (room && room._needsSpawnSiteTick === Game.time) return !!room._needsSpawnSite;
    const result = !!(needsOwnSpawn(room) && !room.constructionSites.some(s => s.structureType === STRUCTURE_SPAWN));
    if (room) {
        room._needsSpawnSite = result;
        room._needsSpawnSiteTick = Game.time;
    }
    return result;
}

/**
 * Round-robin pick. Prefer sequential from tickTracker.lastRoom so every-other-tick
 * throttle cannot permanently skip half the list (Game.time % n with even n only
 * hits even/odd indices on work ticks).
 * @param {Room[]} list
 * @param {{sequential?: boolean}} [opts]
 */
function pickRoundRobin(list, opts) {
    if (!list.length) return null;
    const sequential = !opts || opts.sequential !== false;
    if (sequential && typeof tickTracker !== 'undefined' && tickTracker.lastRoom) {
        const lastIndex = list.findIndex(r => r.name === tickTracker.lastRoom);
        return list[(lastIndex + 1) % list.length] || list[0];
    }
    return list[Game.time % list.length];
}

function getVisibleOwnedRooms() {
    return listVisibleOwnedRooms();
}

/**
 * Missing source/controller containers that economy should place.
 * Still true after storage exists — RCL4+ often builds storage first while the
 * controller container never got a site slot under extension forceLayout.
 * Cheap checks only — no pathfinding.
 * @param {Room} room
 * @returns {boolean}
 */
function needsEarlyEconomy(room) {
    if (!room || !room.controller || !room.controller.my) return false;
    if (!(room.spawns && room.spawns.length)) return false;
    // Tick cache — classify queues call this for every owned room each pick.
    if (room._needsEarlyEcoTick === Game.time) return !!room._needsEarlyEco;
    const level = room.controller.level;
    let result = false;
    try {
        const {
            resolveSourceContainer,
            hasSourceContainerSite,
            resolveControllerContainer,
            hasControllerContainerSite,
            shouldSkipControllerContainer,
        } = require('planUtils');

        if (level >= 2 && level < 8 && !shouldSkipControllerContainer(room)) {
            if (!resolveControllerContainer(room, false) && !hasControllerContainerSite(room)) {
                result = true;
            }
        }
        if (!result && level >= 3) {
            const sources = room.sources || [];
            for (let i = 0; i < sources.length; i++) {
                const s = sources[i];
                if (!resolveSourceContainer(s, room, false) && !hasSourceContainerSite(s)) {
                    result = true;
                    break;
                }
            }
        }
    } catch (e) {
        result = false;
    }
    room._needsEarlyEco = result;
    room._needsEarlyEcoTick = Game.time;
    return result;
}

/**
 * Soft-layout work: towers/extensions OR critical core/economy that used to sit
 * forever in STEADY while other rooms' extension deficits monopolized SOFT_LAYOUT.
 * @param {{
 *   towerDeficit: number,
 *   extensionDeficit: number,
 *   needsOwnSpawn: boolean,
 *   needsRoadWork: boolean,
 *   needsCriticalCore?: boolean,
 *   needsEarlyEconomy?: boolean,
 * }} c
 */
function isSoftLayoutWork(c) {
    // Roads intentionally excluded: ensureOwnedRoadsProgress is the live queue.
    // Room-phase only verifies the persisted desired set.
    return !!(c.towerDeficit > 0
        || c.extensionDeficit > 0
        || c.needsOwnSpawn
        || c.needsCriticalCore
        || c.needsEarlyEconomy);
}

/**
 * Classify work pressure for a room (diagnostics + queue membership).
 * @param {Room} room
 */
function classifyRoom(room) {
    if (!room || !room.controller || !room.controller.my) {
        return {room: room && room.name, owned: false};
    }
    const hub = hasBunkerHub(room);
    const towerDeficit = hub ? getTowerDeficit(room) : 0;
    const extensionDeficit = hub && room.controller.level >= 2 ? getExtensionDeficit(room) : 0;
    const ownSpawn = needsOwnSpawn(room);
    const spawnSite = needsSpawnSite(room);
    const roadWork = hub ? needsOwnedRoadWork(room) : false;
    const criticalCore = hub ? needsCriticalCore(room) : false;
    const earlyEconomy = hub ? needsEarlyEconomy(room) : false;
    const earlyRush = isColonyEarlyRush(room) && hub;

    const soft = {
        towerDeficit,
        extensionDeficit,
        needsOwnSpawn: ownSpawn,
        needsRoadWork: roadWork,
        needsCriticalCore: criticalCore,
        needsEarlyEconomy: earlyEconomy,
    };

    let queue = QUEUE.STEADY;
    if (!hub) queue = QUEUE.HUB_BOOTSTRAP;
    else if (spawnSite) queue = QUEUE.SPAWN_SITE;
    else if (isSoftLayoutWork(soft)) queue = QUEUE.SOFT_LAYOUT;
    else if (earlyRush) queue = QUEUE.EARLY_RUSH;

    return {
        room: room.name,
        owned: true,
        hasHub: hub,
        needsHub: !hub,
        needsSpawnSite: spawnSite,
        needsOwnSpawn: ownSpawn,
        towerDeficit,
        extensionDeficit,
        needsRoadWork: roadWork,
        needsCriticalCore: criticalCore,
        needsEarlyEconomy: earlyEconomy,
        earlyRush,
        queue,
        v2Enabled: true,
        placementPath: 'v2',
        shadow: isPlannerShadow(room),
        flagEnabled: isPlannerEnabled(room),
    };
}

/**
 * Build named queues for all visible owned rooms (same membership as V1 getNextRoom).
 */
function buildQueues(rooms) {
    const list = rooms || getVisibleOwnedRooms();
    const queues = {
        [QUEUE.HUB_BOOTSTRAP]: [],
        [QUEUE.SPAWN_SITE]: [],
        [QUEUE.SOFT_LAYOUT]: [],
        [QUEUE.EARLY_RUSH]: [],
        [QUEUE.STEADY]: [],
    };

    for (let i = 0; i < list.length; i++) {
        const room = list[i];
        const c = classifyRoom(room);
        if (!c.owned) continue;
        if (c.needsHub) {
            queues[QUEUE.HUB_BOOTSTRAP].push(room);
            continue;
        }
        if (c.needsSpawnSite) {
            queues[QUEUE.SPAWN_SITE].push(room);
            continue;
        }
        if (isSoftLayoutWork(c)) {
            queues[QUEUE.SOFT_LAYOUT].push(room);
            continue;
        }
        if (c.earlyRush) {
            queues[QUEUE.EARLY_RUSH].push(room);
            continue;
        }
        queues[QUEUE.STEADY].push(room);
    }
    return queues;
}

/**
 * Pick next room + which queue won (parity with planBuild.getNextRoom).
 * @returns {{room: Room, queue: string}|null}
 */
function pickNextRoom(rooms) {
    const list = rooms || getVisibleOwnedRooms();
    if (!list.length) return null;

    const queues = buildQueues(list);

    // All queues use sequential RR (lastRoom + 1). Game.time % n + throttle
    // (work every other tick) permanently skips half the rooms when n is even.
    if (queues[QUEUE.HUB_BOOTSTRAP].length) {
        return {room: pickRoundRobin(queues[QUEUE.HUB_BOOTSTRAP]), queue: QUEUE.HUB_BOOTSTRAP};
    }
    if (queues[QUEUE.SPAWN_SITE].length) {
        return {room: pickRoundRobin(queues[QUEUE.SPAWN_SITE]), queue: QUEUE.SPAWN_SITE};
    }
    if (queues[QUEUE.SOFT_LAYOUT].length) {
        return {room: pickRoundRobin(queues[QUEUE.SOFT_LAYOUT]), queue: QUEUE.SOFT_LAYOUT};
    }
    if (queues[QUEUE.EARLY_RUSH].length) {
        return {room: pickRoundRobin(queues[QUEUE.EARLY_RUSH]), queue: QUEUE.EARLY_RUSH};
    }

    return {room: pickRoundRobin(list), queue: QUEUE.STEADY};
}

function shouldRunAtAll() {
    const overallLastRun = tickTracker.lastTick || 0;
    return overallLastRun < Game.time;
}

function shouldRunLayout(lastRun) {
    return !lastRun.task || lastRun.task === 'auxiliary';
}

function shouldRunAuxiliary(lastRun) {
    return !lastRun.task || lastRun.task === 'layout';
}

function safeRun(label, fn, report) {
    const t0 = typeof Game !== 'undefined' && Game.cpu && Game.cpu.getUsed
        ? Game.cpu.getUsed()
        : null;
    try {
        fn();
        if (report && report.phases) {
            const entry = {phase: label, ok: true};
            if (t0 != null) {
                entry.cpu = Math.round((Game.cpu.getUsed() - t0) * 1000) / 1000;
            }
            report.phases.push(entry);
        }
        return true;
    } catch (e) {
        if (typeof log !== 'undefined' && log.e) {
            log.e(`${label} failed: ${e && e.stack ? e.stack : e}`, 'PLANNER');
        }
        if (report && report.phases) {
            const entry = {
                phase: label,
                ok: false,
                error: (e && e.message) || String(e),
            };
            if (t0 != null) {
                entry.cpu = Math.round((Game.cpu.getUsed() - t0) * 1000) / 1000;
            }
            report.phases.push(entry);
        }
        if (typeof Memory !== 'undefined') {
            Memory._plannerPhaseError = {
                tick: Game.time,
                phase: label,
                error: (e && e.message) || String(e),
                stack: e && e.stack ? String(e.stack).slice(0, 400) : undefined,
            };
        }
        return false;
    }
}

/**
 * Collapse place* return values to a number for lastRun diagnostics.
 * Objects use `.placed` when present; booleans → 0/1.
 * @param {*} value
 * @returns {number|*}
 */
function placedCount(value) {
    if (value == null) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'object' && typeof value.placed === 'number') return value.placed;
    return value;
}

/** Memory key: force the next non-bootstrap room-turn onto this owned room (live canary). */
const FORCE_ROOM_KEY = 'plannerForceRoom';

/**
 * @param {string|null|undefined} roomName
 * @returns {string|null}
 */
function setForceRoom(roomName) {
    if (typeof Memory === 'undefined') return null;
    if (!roomName || typeof roomName !== 'string') {
        delete Memory[FORCE_ROOM_KEY];
        return null;
    }
    Memory[FORCE_ROOM_KEY] = roomName;
    return roomName;
}

function getForceRoom() {
    if (typeof Memory === 'undefined') return null;
    const name = Memory[FORCE_ROOM_KEY];
    return typeof name === 'string' && name.length ? name : null;
}

/**
 * Drop unspent soft holds for spawn/towers/extensions.
 * Must run after those layers place and BEFORE core/economy/roads — otherwise
 * reserved-but-unused extension slots starve storage/terminal (and then
 * roads/links/mineral which are gated on storage).
 * @param {Room} room
 */
function releaseLayoutSoftReserves(room) {
    siteBudget.release(room, 'spawn');
    siteBudget.release(room, 'towers');
    siteBudget.release(room, 'extensions');
}

/**
 * Missing storage/terminal stamps that unlock economy + roads.
 * When true, core runs before extensions so extension soft-reserves and batch
 * placement cannot monopolize the room site cap for days.
 * @param {Room} room
 * @returns {boolean}
 */
function needsCriticalCore(room) {
    if (!room || !room.controller || !room.controller.my) return false;
    if (room._needsCriticalCoreTick === Game.time) return !!room._needsCriticalCore;
    const level = room.controller.level;
    const sites = room.constructionSites || [];
    let result = false;
    if (level >= 4 && !room.storage) {
        if (!sites.some(s => s.structureType === STRUCTURE_STORAGE)) result = true;
    }
    if (!result && level >= 6 && !room.terminal) {
        if (!sites.some(s => s.structureType === STRUCTURE_TERMINAL)) result = true;
    }
    room._needsCriticalCore = result;
    room._needsCriticalCoreTick = Game.time;
    return result;
}

/**
 * Global work that runs every orchestrator tick (not tied to the selected room).
 * Tower layout reset is intentionally NOT here — V1 only runs it after throttle.
 */
function runGlobalPhases(report) {
    safeRun(PHASE.GLOBAL_PERIMETER, () => {
        // Always siteBudget path (Phase 2 — no V1 ensure hybrid).
        require('planRamparts').ensureAllIncompletePerimeters();
    }, report);

    safeRun(PHASE.GLOBAL_ROADS, () => {
        require('planRoads').ensureOwnedRoadsProgress();
    }, report);
}

/**
 * Per-room phase pipeline — single V2 placement path (Chunk 9).
 * @param {Room} room
 * @param {object} lastRun tickTracker entry (mutated)
 * @param {{earlyRush?: boolean, queue?: string, forceLayout?: boolean}} ctx
 * @param {object} report
 */
function runRoomPhases(room, lastRun, ctx, report) {
    const earlyRush = !!(ctx && ctx.earlyRush);
    const shadow = isPlannerShadow(room);
    report.v2Anchors = true;
    report.placementPath = 'v2';
    report.shadow = shadow;

    safeRun(PHASE.PLAN_SYNC, () => {
        ensurePlan(room, {resync: true});
    }, report);

    if (!hasBunkerHub(room)) {
        safeRun(PHASE.HUB, () => {
            anchors.ensureCoreHub(room);
        }, report);
        if (!hasBunkerHub(room)) {
            report.stopped = 'no_hub';
            if (room.controller.level >= 2 && actors.hasSpawnOrSpawnSite(room)) {
                safeRun(PHASE.EXTENSIONS, () => {
                    const extRes = extLayer.placeExtensions(room);
                    report.extensionsDetail = extRes;
                    report.extensionsPlaced = placedCount(extRes);
                }, report);
            }
            return;
        }
    } else {
        // Plan dual-write; capacity validation on cooldown only.
        safeRun(PHASE.HUB, () => {
            anchors.syncAnchorsToPlan(room);
            const until = room.memory.hubExtensionValidateTick;
            if (!until || until <= Game.time) {
                report.hubEnsure = anchors.ensureCoreHub(room);
            } else {
                report.hubEnsure = {
                    ok: true,
                    source: 'cooldown',
                    validateCooldownUntil: until,
                    remaining: until - Game.time,
                };
            }
        }, report);
    }

    safeRun(PHASE.ANCHORS, () => {
        anchors.ensureTowerHubs(room);
        anchors.ensureLabHub(room);
        // inspectAnchors walks sites + tower hubs — console/debug only.
        if (typeof Memory !== 'undefined' && Memory.plannerDebug) {
            report.anchors = anchors.inspectAnchors(room);
        }
    }, report);

    const extDeficit = room.controller && room.controller.level >= 2
        ? getExtensionDeficit(room)
        : 0;
    const criticalCore = needsCriticalCore(room);
    // Missing storage/terminal must force layout turns — otherwise core only runs
    // on half the room-turns while roads/links stay gated forever.
    // needsEarlyEconomy alone must force a layout/aux tick so containers place
    // even when extension deficit is low and criticalCore is already satisfied.
    const earlyEconomyNeed = needsEarlyEconomy(room);
    const forceLayout = earlyRush || needsOwnSpawn(room) || extDeficit > 5
        || !!criticalCore
        || earlyEconomyNeed
        || !!(ctx && ctx.forceLayout);

    const layoutPending = computeLayoutPending(room);
    siteBudget.setRoomPolicy(room, {layoutPending});
    report.layoutPending = layoutPending;
    report.forceLayout = forceLayout;
    report.extensionDeficit = extDeficit;
    report.criticalCore = criticalCore;
    // Full layer snapshot is expensive (available() per layer). Hot path: raw counts only.
    if (typeof Memory !== 'undefined' && Memory.plannerDebug) {
        report.budget = siteBudget.snapshot(room, {layoutPending});
    } else {
        report.budget = siteBudget.getRawBudget(room);
    }

    const towerDef = getTowerDeficit(room);

    if (needsSpawnSite(room) || actors.needsSpawnSite(room)) {
        siteBudget.reserve(room, 'spawn', 1);
    }
    if (towerDef > 0) siteBudget.reserve(room, 'towers', Math.min(towerDef, 3));
    // When storage/terminal still missing, do not soft-hold the whole room budget
    // for extensions — core needs a real placement chance this tick.
    if (extDeficit > 0 && !criticalCore) {
        siteBudget.reserve(room, 'extensions', Math.min(extDeficit, 5));
    } else if (extDeficit > 0 && criticalCore) {
        // Keep a modest extension hold so towers/spawn still outrank them, but
        // leave most of the room budget free for storage/terminal stamps.
        siteBudget.reserve(room, 'extensions', Math.min(extDeficit, 1));
    }

    // Towers → spawn always first. Core (storage/terminal) before extensions when
    // critical stamps are missing; otherwise extensions → core (wipe recovery).
    if (towerDef > 0) {
        safeRun(PHASE.TOWERS, () => {
            const towerRes = actors.placeTowerSites(room, 1);
            report.towersDetail = towerRes;
            report.towersPlaced = placedCount(towerRes);
        }, report);
    }

    if (needsSpawnSite(room) || actors.needsSpawnSite(room)) {
        safeRun(PHASE.SPAWN, () => {
            const spawnRes = actors.ensureSpawnSite(room);
            report.spawnDetail = spawnRes;
            report.spawnPlaced = spawnRes && spawnRes.ok && spawnRes.reason === 'placed' ? 1 : 0;
        }, report);
    }

    // Containers before core/extensions: storage stamps + extension forceLayout
    // otherwise consume every free room site and controller never places (RCL4).
    report.needsEarlyEconomy = earlyEconomyNeed;
    let earlyEconomyRan = false;
    const hasBuiltSpawn = !!(room.spawns && room.spawns.length);
    if (earlyEconomyNeed && (hasBuiltSpawn || shadow)) {
        // Drop unused soft holds so container layers see real remaining budget.
        releaseLayoutSoftReserves(room);
        safeRun(PHASE.ECONOMY, () => {
            const ecoRes = economyLayer.placeEconomy(room);
            report.economyDetail = ecoRes;
            report.economyPlaced = placedCount(ecoRes);
            report.economyEarly = true;
        }, report);
        earlyEconomyRan = true;
    }

    const runCoreAndSpecials = () => {
        if (!actors.hasSpawnOrSpawnSite(room)) return;
        if (!(forceLayout || shouldRunLayout(lastRun))) return;
        safeRun(PHASE.CORE, () => {
            const coreRes = coreLayer.placeCoreStamps(room);
            report.coreDetail = coreRes;
            report.corePlaced = placedCount(coreRes);
        }, report);
        if (room.memory.dynamicLayout && room.controller.level >= 7) {
            safeRun(PHASE.SPECIALS, () => {
                const specRes = coreLayer.placeSpecials(room);
                report.specialsDetail = specRes;
                report.specialsPlaced = placedCount(specRes);
            }, report);
        }
    };

    const runExtensions = () => {
        if (room.controller.level < 2 || extDeficit <= 0) return;
        if (!actors.hasSpawnOrSpawnSite(room)) return;
        if (!(forceLayout || shouldRunLayout(lastRun))) return;
        safeRun(PHASE.EXTENSIONS, () => {
            const extRes = extLayer.placeExtensions(room);
            report.extensionsDetail = extRes;
            report.extensionsPlaced = placedCount(extRes);
        }, report);
    };

    if (criticalCore) {
        // Drop unused spawn/tower holds before core so storage can use leftover budget.
        releaseLayoutSoftReserves(room);
        runCoreAndSpecials();
        runExtensions();
    } else {
        runExtensions();
        // Unspent extension/tower/spawn soft holds must not block core this tick.
        releaseLayoutSoftReserves(room);
        runCoreAndSpecials();
    }

    // Any residual soft holds after both layout layers (e.g. extension reserve when
    // criticalCore path reserved 1 but placed 0) — free for economy/roads/ramparts.
    releaseLayoutSoftReserves(room);

    if (forceLayout || shouldRunLayout(lastRun)) {
        // LAYOUT phase retired — extensions/core are siteBudget phases above.
        if (!forceLayout) lastRun.task = 'layout';
    }

    // Economy + ramparts need a built spawn (builders). Shadow still computes.
    // If containers already ran early, re-run placeEconomy for links/labs/mineral
    // after storage may have been stamped this tick; containers are no-ops when have.
    if (forceLayout || shouldRunAuxiliary(lastRun) || earlyEconomyRan) {
        if (hasBuiltSpawn || shadow) {
            if (!earlyEconomyRan || room.storage || (room.controller && room.controller.level >= 5)) {
                safeRun(PHASE.ECONOMY, () => {
                    const ecoRes = economyLayer.placeEconomy(room);
                    // Prefer early container detail if that was the only run;
                    // otherwise keep the later pass (links/labs) as economyDetail.
                    if (!earlyEconomyRan) {
                        report.economyDetail = ecoRes;
                        report.economyPlaced = placedCount(ecoRes);
                    } else {
                        report.economyDetailLate = ecoRes;
                        const latePlaced = placedCount(ecoRes);
                        report.economyPlaced = (report.economyPlaced || 0) + latePlaced;
                    }
                }, report);
            }
            // Hygiene only — economy/ramparts place via plan* act (A2–A4).
            if (!shadow && hasBuiltSpawn) {
                safeRun(PHASE.AUXILIARY, () => {
                    report.hygiene = require('planCleanup').roomHygiene(room);
                }, report);
            }
            safeRun(PHASE.RAMPARTS, () => {
                const rampRes = require('planRamparts').placeRamparts(room, {layoutPending});
                report.rampartsDetail = rampRes;
                report.rampartsPlaced = placedCount(rampRes);
            }, report);
        } else {
            report.auxSkipped = 'no_spawn';
        }
        if (!forceLayout) lastRun.task = 'auxiliary';
    }

    if (room.storage) {
        // Live placement is ensureOwnedRoadsProgress (GLOBAL_ROADS). Room-phase
        // only verifies the persisted desired set so we do not double-place.
        const verifyEvery = 200;
        if (Game.time % verifyEvery === (room.name.charCodeAt(0) % verifyEvery)) {
            safeRun(PHASE.ROADS, () => {
                const roadRes = require('planRoads').placeOwnedRoads(room, {
                    layoutPending,
                    verify: true,
                });
                report.roadsDetail = roadRes;
                report.roadsPlaced = placedCount(roadRes);
            }, report);
        } else {
            report.roadsSkipped = 'global_ensure';
        }
    }

    if (typeof Memory !== 'undefined' && Memory.plannerDebug) {
        report.budgetAfter = siteBudget.snapshot(room, {layoutPending});
    } else {
        report.budgetAfter = siteBudget.getRawBudget(room);
    }

    // Slim lastRun — full phase lists + per-layer counts every turn bloat Memory.
    // Heap report (getLastTickReport) still has detail; plan meta is a short breadcrumb.
    const plan = getPlan(room);
    if (plan) {
        plan.meta.lastRun = {
            tick: Game.time,
            queue: ctx && ctx.queue,
            task: lastRun.task,
            forceLayout: !!forceLayout,
            placed: (report.towersPlaced || 0)
                + (report.spawnPlaced || 0)
                + (report.extensionsPlaced || 0)
                + (report.corePlaced || 0)
                + (report.economyPlaced || 0)
                + (report.roadsPlaced || 0)
                + (report.rampartsPlaced || 0),
        };
    }

    report.task = lastRun.task;
}

/**
 * Main entry — behavioral parity with planBuild.buildRoom, structured.
 */
function buildRoom() {
    const cpuStart = typeof Game !== 'undefined' && Game.cpu && Game.cpu.getUsed
        ? Game.cpu.getUsed()
        : 0;
    const report = {
        tick: Game.time,
        orchestrator: true,
        phases: [],
        room: null,
        queue: null,
        bootstrap: null,
        skipped: false,
    };
    lastTickReport = report;

    const rooms = getVisibleOwnedRooms();
    report.ownedCount = rooms.length;

    // Hub bootstrap — bypass every-other-tick throttle (same as V1).
    // Do NOT empire-wide plan-sync first: that dirtied every room.memory.plan every tick.
    const hubBoot = rooms.filter(r => r.controller && r.controller.my && !hasBunkerHub(r));
    if (hubBoot.length) {
        const room = pickRoundRobin(hubBoot);
        report.bootstrap = QUEUE.HUB_BOOTSTRAP;
        report.room = room.name;
        report.queue = QUEUE.HUB_BOOTSTRAP;
        report.v2 = true;
        report.placementPath = 'v2';
        tickTracker.lastTick = Game.time;
        tickTracker.lastRoom = room.name;
        const lastRun = tickTracker[room.name] || {};
        runRoomPhases(room, lastRun, {
            earlyRush: true,
            queue: QUEUE.HUB_BOOTSTRAP,
            forceLayout: true,
        }, report);
        tickTracker[room.name] = lastRun;
        noteRecentRoomTurn(room.name, QUEUE.HUB_BOOTSTRAP, report.v2, false);
        report.cpu = Math.round((Game.cpu.getUsed() - cpuStart) * 1000) / 1000;
        return report;
    }

    // Spawn-site bootstrap
    const spawnBoot = rooms.filter(needsSpawnSite);
    if (spawnBoot.length) {
        const room = pickRoundRobin(spawnBoot);
        report.bootstrap = QUEUE.SPAWN_SITE;
        report.room = room.name;
        report.queue = QUEUE.SPAWN_SITE;
        report.v2 = true;
        report.placementPath = 'v2';
        tickTracker.lastTick = Game.time;
        tickTracker.lastRoom = room.name;
        const lastRun = tickTracker[room.name] || {};
        runRoomPhases(room, lastRun, {
            earlyRush: true,
            queue: QUEUE.SPAWN_SITE,
            forceLayout: true,
        }, report);
        tickTracker[room.name] = lastRun;
        noteRecentRoomTurn(room.name, QUEUE.SPAWN_SITE, report.v2, false);
        report.cpu = Math.round((Game.cpu.getUsed() - cpuStart) * 1000) / 1000;
        return report;
    }

    if (!shouldRunAtAll()) {
        // Throttle skip: still allow cheap global soft-queues (they self-cadence),
        // but never empire plan-sync (Memory write storm on all owned rooms).
        runGlobalPhases(report);
        report.skipped = true;
        report.skipReason = 'throttle';
        report.cpu = Math.round((Game.cpu.getUsed() - cpuStart) * 1000) / 1000;
        return report;
    }

    // Occasional empire plan reconcile only — per-room ensurePlan runs in runRoomPhases.
    // Every-tick forceAll rewrote plan.meta.lastSyncTick for every room → massive
    // Memory serialize cost and bucket drain.
    safeRun(PHASE.PLAN_SYNC, () => {
        if (Game.time % 50 === 0) {
            ensurePlansForOwnedRooms({forceAll: true});
            report.empirePlanSync = true;
        } else {
            report.empirePlanSync = false;
        }
    }, report);

    runGlobalPhases(report);

    // V1: tower reset only after throttle (not during hub/spawn bootstrap ticks).
    if (Memory.towerLayoutResetQueue && Memory.towerLayoutResetQueue.length) {
        safeRun(PHASE.TOWER_RESET_QUEUE, () => {
            processTowerLayoutResetQueue();
        }, report);
    }

    // Live canary: pin non-bootstrap room-turns to Memory.plannerForceRoom when set.
    const forceName = getForceRoom();
    let room = null;
    let queue = null;
    let forced = false;
    if (forceName) {
        const forcedRoom = Game.rooms[forceName];
        if (forcedRoom && forcedRoom.controller && forcedRoom.controller.my) {
            room = forcedRoom;
            queue = 'force';
            forced = true;
            report.forced = true;
            report.forceRoom = forceName;
        } else {
            report.forceRoomMissing = forceName;
        }
    }

    if (!room) {
        const picked = pickNextRoom(rooms);
        if (!picked || !picked.room) {
            report.skipped = true;
            report.skipReason = 'no_room';
            report.cpu = Math.round((Game.cpu.getUsed() - cpuStart) * 1000) / 1000;
            return report;
        }
        room = picked.room;
        queue = picked.queue;
    }

    // Treat storage/container backlog like rush so throttle does not insert a skip
    // tick after a critical room turn (27 rooms × every-other-tick is too slow).
    const criticalWork = hasBunkerHub(room)
        && (needsCriticalCore(room) || needsEarlyEconomy(room));
    const earlyRush = isColonyEarlyRush(room) || forced || criticalWork;
    report.room = room.name;
    report.queue = queue;
    report.earlyRush = earlyRush;
    report.criticalWork = criticalWork;
    report.v2 = true;
    report.placementPath = 'v2';
    report.empire = isPlannerEmpire() && !getPlannerConfig().shadow;
    report.shadow = isPlannerShadow(room);
    if (forced && report.empire) {
        // Force pin starves other empire rooms — surface loudly in lastRun.
        report.forceWarn = 'force_room_pins_turns';
    }

    // V1 throttle: non-rush rooms set lastTick = Game.time + 1 → skip next tick.
    // Forced canary / critical core+economy use rush cadence (work every tick).
    tickTracker.lastTick = earlyRush ? Game.time : Game.time + 1;
    tickTracker.lastRoom = room.name;

    const lastRun = tickTracker[room.name] || {};
    if (hasBunkerHub(room)) {
        runRoomPhases(room, lastRun, {
            earlyRush,
            queue,
            forceLayout: forced || undefined,
        }, report);
    } else {
        // Should be rare (hub queue empty) — still try hub
        runRoomPhases(room, lastRun, {
            earlyRush: true,
            queue,
            forceLayout: true,
        }, report);
    }
    tickTracker[room.name] = lastRun;

    // Soak aid: recent room-turns (RR coverage across empire).
    noteRecentRoomTurn(room.name, queue, report.v2, forced);
    report.cpu = Math.round((Game.cpu.getUsed() - cpuStart) * 1000) / 1000;
    // Top phase costs for console triage (heap only — not written to Memory).
    if (report.phases && report.phases.length) {
        report.topPhases = report.phases
            .filter(p => p.cpu != null)
            .slice()
            .sort((a, b) => b.cpu - a.cpu)
            .slice(0, 5)
            .map(p => ({phase: p.phase, cpu: p.cpu, ok: p.ok}));
    }
    return report;
}

/** Keep a short ring of recent planner room selections for empire soak (heap). */
const RECENT_ROOM_TURNS_MAX = 40;
let recentRoomTurns = [];

function noteRecentRoomTurn(roomName, queue, v2, forced) {
    if (!roomName) return;
    recentRoomTurns.push({
        tick: Game.time,
        room: roomName,
        queue: queue || null,
        v2: !!v2,
        forced: !!forced,
    });
    if (recentRoomTurns.length > RECENT_ROOM_TURNS_MAX) {
        recentRoomTurns = recentRoomTurns.slice(-RECENT_ROOM_TURNS_MAX);
    }
    if (typeof Memory !== 'undefined' && Memory._plannerRecentRooms) {
        delete Memory._plannerRecentRooms;
    }
}

function getRecentRoomTurns() {
    return recentRoomTurns.slice();
}

function getLastTickReport() {
    return lastTickReport;
}

/**
 * Console-friendly queue membership (room names only).
 */
function inspectQueues() {
    const rooms = getVisibleOwnedRooms();
    const queues = buildQueues(rooms);
    const out = {};
    for (const key in queues) {
        out[key] = queues[key].map(r => r.name);
    }
    const classifications = rooms.map(classifyRoom);
    return {
        tick: Game.time,
        queues: out,
        rooms: classifications,
        lastTick: tickTracker.lastTick,
        lastRoom: tickTracker.lastRoom,
        throttleWouldSkip: !shouldRunAtAll(),
    };
}

module.exports = {
    QUEUE,
    PHASE,
    FORCE_ROOM_KEY,
    buildRoom,
    classifyRoom,
    buildQueues,
    pickNextRoom,
    getVisibleOwnedRooms,
    getLastTickReport,
    inspectQueues,
    hasBunkerHub,
    needsOwnSpawn,
    needsSpawnSite,
    setForceRoom,
    getForceRoom,
    releaseLayoutSoftReserves,
    needsCriticalCore,
    needsEarlyEconomy,
    isSoftLayoutWork,
    getRecentRoomTurns,
    noteRecentRoomTurn,
};
