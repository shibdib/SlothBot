/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Planner pause / shadow flag.
 *
 * Placement is always planOrchestrator + plan* act + siteBudget.
 * This flag never restores deleted V1 placers.
 *
 * Memory.planner (reads Memory.plannerV2 as one-tick migrate fallback):
 *   unset / true / { enabled: true }
 *     Live place (default).
 *   false
 *     Empire pause → shadow (no createConstructionSite / destroy from act).
 *   { shadow: true } or { paused: true } or { enabled: false }
 *     Empire shadow / pause.
 *   { rooms: [...] }  (legacy leftover)
 *     Ignored. Does not change empire / placement. Writers no longer store rooms.
 *
 * Room override:
 *   room.memory.planner = false  → that room shadow
 *   room.memory.planner = true   → that room live even if empire paused
 *   room.memory.plannerV2 still honored if planner is unset (migrate on write).
 */

const MEMORY_KEY = 'planner';
const MEMORY_KEY_LEGACY = 'plannerV2';

function readEmpireRaw() {
    if (typeof Memory === 'undefined') return undefined;
    if (Memory[MEMORY_KEY] !== undefined) return Memory[MEMORY_KEY];
    return Memory[MEMORY_KEY_LEGACY];
}

function writeEmpireRaw(value) {
    if (typeof Memory === 'undefined') return;
    Memory[MEMORY_KEY] = value;
    delete Memory[MEMORY_KEY_LEGACY];
}

function readRoomOverride(room) {
    if (!room || !room.memory) return undefined;
    if (room.memory.planner !== undefined) return room.memory.planner;
    return room.memory.plannerV2;
}

/**
 * Normalize Memory.planner into a stable config object.
 * @returns {{
 *   enabled: boolean,
 *   rooms: null,
 *   shadow: boolean,
 *   paused: boolean,
 *   raw: *,
 *   defaultOn: boolean,
 * }}
 */
function getPlannerConfig() {
    const raw = readEmpireRaw();

    if (raw === undefined || raw === null) {
        return {
            enabled: true,
            rooms: null,
            shadow: false,
            paused: false,
            raw,
            defaultOn: true,
        };
    }

    // Explicit empire pause.
    if (raw === false) {
        return {
            enabled: true,
            rooms: null,
            shadow: true,
            paused: true,
            raw,
            defaultOn: false,
        };
    }

    if (raw === true) {
        return {
            enabled: true,
            rooms: null,
            shadow: false,
            paused: false,
            raw,
            defaultOn: false,
        };
    }

    if (typeof raw !== 'object') {
        return {
            enabled: true,
            rooms: null,
            shadow: false,
            paused: false,
            raw,
            defaultOn: false,
        };
    }

    const paused = raw.paused === true || raw.enabled === false;
    const shadow = raw.shadow === true || paused;

    return {
        enabled: raw.enabled !== false,
        rooms: null,
        shadow: !!shadow,
        paused: !!paused,
        raw,
        defaultOn: false,
    };
}

/** Whether the planner subsystem is available (always true). */
function isPlannerConfigured() {
    return getPlannerConfig().enabled;
}

/**
 * Whether this room uses planner placement. Always true (no V1 branch).
 * @param {Room|string} roomOrName
 */
function isPlannerEnabled(roomOrName) {
    void roomOrName;
    return true;
}

/**
 * Shadow / pause: plan and compute only — no construction side effects.
 * @param {Room|string} roomOrName
 */
function isPlannerShadow(roomOrName) {
    const roomName = typeof roomOrName === 'string'
        ? roomOrName
        : (roomOrName && roomOrName.name);
    const room = typeof roomOrName === 'object'
        ? roomOrName
        : (typeof Game !== 'undefined' && Game.rooms && Game.rooms[roomName]);

    const override = readRoomOverride(room);
    if (override === true) return false;
    if (override === false) return true;

    return getPlannerConfig().shadow === true;
}

/**
 * Set empire flag.
 *   false → pause (shadow empire)
 *   true / null / undefined → live (clears pause)
 *   object → pause if shadow/paused/enabled:false, else live (rooms keys dropped)
 * @param {boolean|object|null|undefined} value
 */
function setPlannerFlag(value) {
    if (typeof Memory === 'undefined') return getPlannerConfig();

    if (value === false) {
        writeEmpireRaw(false);
        return getPlannerConfig();
    }
    if (value === null || value === undefined || value === true) {
        writeEmpireRaw(true);
        return getPlannerConfig();
    }
    if (typeof value === 'object' && (value.shadow || value.paused || value.enabled === false)) {
        return pausePlanner();
    }
    return resumePlanner();
}

/**
 * @deprecated room list unused. Prefer resumePlanner / planner.live + force.
 * @param {string|string[]} roomNames
 * @param {{shadow?: boolean}} [opts]
 */
function enablePlannerRooms(roomNames, opts) {
    void roomNames;
    if (opts && opts.shadow) return pausePlanner();
    return resumePlanner();
}

/**
 * Empire live (or shadow).
 * @param {{shadow?: boolean}} [opts]
 */
function enablePlannerEmpire(opts) {
    const o = opts || {};
    if (o.shadow) return pausePlanner();
    return resumePlanner();
}

function isPlannerEmpire() {
    return getPlannerConfig().enabled;
}

function pausePlanner() {
    if (typeof Memory === 'undefined') return getPlannerConfig();
    writeEmpireRaw(false);
    return getPlannerConfig();
}

function resumePlanner() {
    if (typeof Memory === 'undefined') return getPlannerConfig();
    writeEmpireRaw(true);
    return getPlannerConfig();
}

function clearRoomPlannerOverride(room) {
    if (!room || !room.memory) return false;
    const had = room.memory.planner === false || room.memory.plannerV2 === false;
    delete room.memory.planner;
    delete room.memory.plannerV2;
    return had;
}

module.exports = {
    MEMORY_KEY,
    MEMORY_KEY_LEGACY,
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
    // Deprecated V2 aliases (old console macros).
    getPlannerV2Config: getPlannerConfig,
    isPlannerV2Configured: isPlannerConfigured,
    isPlannerV2Enabled: isPlannerEnabled,
    isPlannerV2Shadow: isPlannerShadow,
    isPlannerV2Empire: isPlannerEmpire,
    setPlannerV2Flag: setPlannerFlag,
    enablePlannerV2Rooms: enablePlannerRooms,
    enablePlannerV2Empire: enablePlannerEmpire,
    pausePlannerV2: pausePlanner,
    resumePlannerV2: resumePlanner,
};
