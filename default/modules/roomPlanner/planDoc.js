/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Versioned RoomPlan document (planner V2).
 *
 * Lives at room.memory.plan.
 *
 * Chunk 8–9 / C5: plan is authoritative for anchors (hub / towers / lab).
 *   - Readers: getHub / getTowerHubs / getLabHub (legacy fallback).
 *   - Anchor writes: plan only (no bunkerHub/towerHubs/labHub dual-write).
 *   - Packed layers live only on plan (legacy dynamic* packs are a one-way import).
 *   - ensurePlan resync: fill empty plan anchors/packs from leftover legacy once.
 *   - clearPlan + remigratePlan / migrateFromLegacy still rebuild from legacy.
 */

const PLAN_DOC_SCHEMA_VERSION = 1;
const PLAN_MEMORY_KEY = 'plan';
const MAX_FAILURES = 20;

/** Machine-readable skip / failure codes (closed set; extend carefully). */
const FailureCodes = {
    NO_HUB: 'NO_HUB',
    NO_SPAWN_ANCHOR: 'NO_SPAWN_ANCHOR',
    SITE_BUDGET_GLOBAL: 'SITE_BUDGET_GLOBAL',
    SITE_BUDGET_ROOM: 'SITE_BUDGET_ROOM',
    BUDGET_RESERVED_FOR_HIGHER: 'BUDGET_RESERVED_FOR_HIGHER',
    TILE_BLOCKED: 'TILE_BLOCKED',
    PLAN_EMPTY: 'PLAN_EMPTY',
    ACCESS_FAILED: 'ACCESS_FAILED',
    RCL_GATE: 'RCL_GATE',
    COOLDOWN: 'COOLDOWN',
    MODE_MISMATCH: 'MODE_MISMATCH',
    NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
};

const LAYER_NAMES = [
    'spawn',
    'extensions',
    'corridors',
    'specials',
    'towers',
    'core',
    'sources',
    'controller',
    'links',
    'labs',
    'mineral',
    'roads',
    'ramparts',
];

function emptyLayer() {
    return {
        packed: null,
        rev: 0,
        access: null,
        extra: null,
    };
}

/**
 * @param {{mode?: 'bunker'|'dynamic'}} [options]
 */
function createEmptyPlan(options) {
    const layers = {};
    for (let i = 0; i < LAYER_NAMES.length; i++) {
        layers[LAYER_NAMES[i]] = emptyLayer();
    }
    return {
        schema: PLAN_DOC_SCHEMA_VERSION,
        mode: (options && options.mode) || 'bunker',
        anchors: {
            hub: null,
            towers: [],
            lab: null,
            labPartial: false,
        },
        layers,
        meta: {
            migratedFrom: null,
            migratedTick: null,
            lastSyncTick: null,
            lastRun: null,
            lastFailures: [],
            layoutVersions: {},
            legacyVersions: {},
        },
    };
}

function isValidHub(hub) {
    return !!(hub && typeof hub.x === 'number' && typeof hub.y === 'number'
        && hub.x >= 0 && hub.x <= 49 && hub.y >= 0 && hub.y <= 49);
}

function cloneHub(hub) {
    if (!isValidHub(hub)) return null;
    return {x: hub.x, y: hub.y};
}

function cloneTowers(list) {
    if (!list || !list.length) return [];
    const out = [];
    for (let i = 0; i < list.length; i++) {
        const t = list[i];
        if (isValidHub(t)) out.push({x: t.x, y: t.y});
    }
    return out;
}

function assignIfChanged(obj, key, value) {
    if (obj[key] !== value) {
        obj[key] = value;
        return true;
    }
    return false;
}

function isPlanDocValid(plan) {
    if (!plan || typeof plan !== 'object') return false;
    if (plan.schema !== PLAN_DOC_SCHEMA_VERSION) return false;
    if (plan.mode !== 'bunker' && plan.mode !== 'dynamic') return false;
    if (!plan.anchors || !plan.layers || !plan.meta) return false;
    return true;
}

function getPlan(room) {
    if (!room || !room.memory) return null;
    const plan = room.memory[PLAN_MEMORY_KEY];
    return isPlanDocValid(plan) ? plan : null;
}

/**
 * Pack {x,y}[] as Screeps-common x + y*50 integers (matches planExtensions).
 * @param {{x:number,y:number}[]} tiles
 */
function packTiles(tiles) {
    if (!tiles || !tiles.length) return [];
    return tiles.map(p => p.x + p.y * 50);
}

/**
 * @param {number[]} packed
 * @returns {{x:number,y:number}[]}
 */
function unpackTiles(packed) {
    if (!packed || !packed.length) return [];
    return packed.map(n => ({x: n % 50, y: Math.floor(n / 50)}));
}

function setLayerPacked(layer, packed, rev, access) {
    layer.packed = packed && packed.length ? packed.slice() : (packed && packed.length === 0 ? [] : null);
    layer.rev = typeof rev === 'number' ? rev : 0;
    if (access !== undefined) layer.access = access;
}

// ---------------------------------------------------------------------------
// Authoritative anchor readers (Chunk 8) — plan first, legacy fallback
// ---------------------------------------------------------------------------

/**
 * @param {Room} room
 * @returns {{x:number,y:number}|null}
 */
function getHub(room) {
    if (!room || !room.memory) return null;
    const plan = getPlan(room);
    if (plan && isValidHub(plan.anchors.hub)) return cloneHub(plan.anchors.hub);
    return cloneHub(room.memory.bunkerHub);
}

/** @param {Room} room @returns {boolean} */
function hasHub(room) {
    return !!getHub(room);
}

/**
 * @param {Room} room
 * @returns {{x:number,y:number}[]}
 */
function getTowerHubs(room) {
    if (!room || !room.memory) return [];
    const plan = getPlan(room);
    if (plan && plan.anchors.towers && plan.anchors.towers.length) {
        return cloneTowers(plan.anchors.towers);
    }
    return cloneTowers(room.memory.towerHubs);
}

/**
 * @param {Room} room
 * @returns {{hub:{x:number,y:number}|null, partial:boolean}}
 */
function getLabHub(room) {
    if (!room || !room.memory) return {hub: null, partial: false};
    const plan = getPlan(room);
    if (plan && isValidHub(plan.anchors.lab)) {
        return {hub: cloneHub(plan.anchors.lab), partial: !!plan.anchors.labPartial};
    }
    return {
        hub: cloneHub(room.memory.labHub),
        partial: !!room.memory.labHubPartial,
    };
}

/**
 * Layout mode from plan, else legacy dynamicLayout flag.
 * @param {Room} room
 * @returns {'bunker'|'dynamic'}
 */
function getPlanMode(room) {
    const plan = getPlan(room);
    if (plan && (plan.mode === 'bunker' || plan.mode === 'dynamic')) return plan.mode;
    if (room && room.memory && room.memory.dynamicLayout) return 'dynamic';
    return 'bunker';
}

/**
 * Packed layer tiles from plan first, then legacy dynamic packs where known (C3).
 * @param {Room} room
 * @param {string} layerName
 * @returns {number[]|null}
 */
function getLayerPacked(room, layerName) {
    const plan = getPlan(room);
    if (plan && plan.layers && plan.layers[layerName]
        && plan.layers[layerName].packed && plan.layers[layerName].packed.length) {
        // Prefer plan packs whose rev matches known layout version when present.
        const packed = plan.layers[layerName].packed;
        if (layerName === 'extensions' || layerName === 'corridors') {
            const rev = plan.layers[layerName].rev
                || (plan.meta && plan.meta.layoutVersions && plan.meta.layoutVersions.extensions);
            // If rev is missing, still return plan pack (authoritative after C3 writes).
            if (rev == null || rev > 0) return packed.slice();
        } else {
            return packed.slice();
        }
    }
    if (!room || !room.memory) return null;
    const mem = room.memory;
    if (layerName === 'extensions' && mem.dynamicExtensionsPacked) {
        return mem.dynamicExtensionsPacked.slice();
    }
    if (layerName === 'corridors' && mem.dynamicCorridorPacked) {
        return mem.dynamicCorridorPacked.slice();
    }
    if (layerName === 'specials' && mem.dynamicSpecialPacked) {
        return mem.dynamicSpecialPacked.slice();
    }
    return null;
}

/**
 * Push plan fields into legacy V1 keys where still needed.
 *
 * C5: anchors (hub / towers / lab) are NOT dual-written by default — plan is
 * sole authority; readers use getHub/getTowerHubs/getLabHub (legacy fallback).
 * Pass options.anchors === true only for disaster remigrate tools.
 *
 * Packed extension/corridor/special layers are plan-only. Leftover
 * dynamic* packs are imported once when the plan layer is empty.
 *
 * Does not delete legacy keys when plan field is empty (avoids wipe races).
 * @param {Room} room
 * @param {object} plan
 * @param {{anchors?: boolean}} [options]
 * @returns {object} plan
 */
function syncToLegacy(room, plan, options) {
    if (!room || !room.memory || !plan) return plan;
    const mem = room.memory;
    const opts = options || {};

    // C5: optional anchor mirror only (default off).
    if (opts.anchors) {
        if (isValidHub(plan.anchors.hub)) {
            mem.bunkerHub = cloneHub(plan.anchors.hub);
        }
        if (plan.anchors.towers && plan.anchors.towers.length) {
            mem.towerHubs = cloneTowers(plan.anchors.towers);
        }
        if (isValidHub(plan.anchors.lab)) {
            mem.labHub = cloneHub(plan.anchors.lab);
            if (plan.anchors.labPartial) mem.labHubPartial = true;
            else delete mem.labHubPartial;
        }
    }

    let dirty = false;
    if (plan.mode === 'dynamic' && !mem.dynamicLayout) {
        mem.dynamicLayout = true;
        dirty = true;
    }
    // Do not force-clear dynamicLayout on bunker mode — room may still be mid-switch.

    if (plan.meta && plan.meta.layoutVersions && plan.meta.layoutVersions.towers != null) {
        if (assignIfChanged(mem, 'towerLayoutVersion', plan.meta.layoutVersions.towers)) dirty = true;
    }

    plan.meta = plan.meta || {};
    if (plan.meta.authority !== 'plan') {
        plan.meta.authority = 'plan';
        dirty = true;
    }
    // Stamp lastSyncTick only when something actually changed. Writing Game.time
    // every ensurePlan dirties room.memory.plan for the 2MB serialize.
    if (dirty) {
        const now = typeof Game !== 'undefined' ? Game.time : null;
        if (now != null) plan.meta.lastSyncTick = now;
    }
    return plan;
}

/**
 * V2 reconcile: fill empty plan fields from leftover legacy, then stamp plan authority.
 * Plan wins when both sides have a hub/towers/lab (authoritative).
 * C5: does not push anchors back into bunkerHub/towerHubs/labHub.
 * @param {Room} room
 * @param {object} plan
 * @returns {object} plan
 */
function reconcilePlanLegacy(room, plan) {
    if (!room || !room.memory || !plan) return plan;
    const mem = room.memory;

    // Fill plan gaps only from legacy (one-way upgrade path).
    if (!isValidHub(plan.anchors.hub) && isValidHub(mem.bunkerHub)) {
        plan.anchors.hub = cloneHub(mem.bunkerHub);
    }
    if (!(plan.anchors.towers && plan.anchors.towers.length) && mem.towerHubs && mem.towerHubs.length) {
        plan.anchors.towers = cloneTowers(mem.towerHubs);
    }
    if (!isValidHub(plan.anchors.lab) && isValidHub(mem.labHub)) {
        plan.anchors.lab = cloneHub(mem.labHub);
        plan.anchors.labPartial = !!mem.labHubPartial;
    }

    // Mode: prefer plan; if plan has no hub yet, adopt legacy dynamic flag.
    if (!isValidHub(plan.anchors.hub) && mem.dynamicLayout) {
        plan.mode = 'dynamic';
    } else if (plan.mode !== 'bunker' && plan.mode !== 'dynamic') {
        plan.mode = mem.dynamicLayout ? 'dynamic' : 'bunker';
    }

    // Import packed layers only when plan layer empty.
    if (mem.dynamicExtensionsPacked
        && !(plan.layers.extensions.packed && plan.layers.extensions.packed.length)) {
        setLayerPacked(
            plan.layers.extensions,
            mem.dynamicExtensionsPacked,
            mem.dynamicExtensionsVersion || 0,
            {
                ok: mem.dynamicAccessOk,
                failed: mem.dynamicAccessFailed,
                skippedUnreachable: mem.dynamicAccessSkipped,
            }
        );
    }
    if (mem.dynamicCorridorPacked
        && !(plan.layers.corridors.packed && plan.layers.corridors.packed.length)) {
        setLayerPacked(
            plan.layers.corridors,
            mem.dynamicCorridorPacked,
            mem.dynamicExtensionsVersion || 0,
            null
        );
    }
    if (mem.dynamicSpecialPacked
        && !(plan.layers.specials.packed && plan.layers.specials.packed.length)) {
        setLayerPacked(
            plan.layers.specials,
            mem.dynamicSpecialPacked,
            mem.dynamicSpecialVersion || 0,
            null
        );
    }

    const nextLegacy = {
        extensionClearance: mem.extensionClearanceVersion,
        dynamicExtensions: mem.dynamicExtensionsVersion,
        dynamicSpecial: mem.dynamicSpecialVersion,
        towerLayout: mem.towerLayoutVersion,
    };
    const prevLegacy = plan.meta.legacyVersions;
    if (!prevLegacy
        || prevLegacy.extensionClearance !== nextLegacy.extensionClearance
        || prevLegacy.dynamicExtensions !== nextLegacy.dynamicExtensions
        || prevLegacy.dynamicSpecial !== nextLegacy.dynamicSpecial
        || prevLegacy.towerLayout !== nextLegacy.towerLayout) {
        plan.meta.legacyVersions = nextLegacy;
    }
    plan.meta.layoutVersions = plan.meta.layoutVersions || {};
    if (plan.meta.layoutVersions.extensions == null) {
        plan.meta.layoutVersions.extensions = mem.extensionClearanceVersion
            || mem.dynamicExtensionsVersion || 0;
    }
    if (plan.meta.layoutVersions.towers == null) {
        plan.meta.layoutVersions.towers = mem.towerLayoutVersion || 0;
    }

    absorbLegacySkip(plan, mem);
    return syncToLegacy(room, plan);
}

/**
 * Pull anchors + known packed layers from V1 memory keys into `plan`.
 * Overwrites plan fields from legacy (migrate / authority:'legacy' path).
 * Does not delete legacy keys.
 * @param {Room} room
 * @param {object} plan
 * @returns {object} plan
 */
function syncFromLegacy(room, plan) {
    const mem = room.memory;
    plan.mode = mem.dynamicLayout ? 'dynamic' : 'bunker';
    plan.anchors.hub = cloneHub(mem.bunkerHub);
    plan.anchors.towers = cloneTowers(mem.towerHubs);
    plan.anchors.lab = cloneHub(mem.labHub);
    plan.anchors.labPartial = !!mem.labHubPartial;

    // Extensions / corridors / specials (dynamic layout packs)
    if (mem.dynamicExtensionsPacked) {
        setLayerPacked(
            plan.layers.extensions,
            mem.dynamicExtensionsPacked,
            mem.dynamicExtensionsVersion || 0,
            {
                ok: mem.dynamicAccessOk,
                failed: mem.dynamicAccessFailed,
                skippedUnreachable: mem.dynamicAccessSkipped,
            }
        );
    }
    if (mem.dynamicCorridorPacked) {
        setLayerPacked(
            plan.layers.corridors,
            mem.dynamicCorridorPacked,
            mem.dynamicExtensionsVersion || 0,
            null
        );
    }
    if (mem.dynamicSpecialPacked) {
        setLayerPacked(
            plan.layers.specials,
            mem.dynamicSpecialPacked,
            mem.dynamicSpecialVersion || 0,
            null
        );
    }

    plan.meta.legacyVersions = {
        extensionClearance: mem.extensionClearanceVersion,
        dynamicExtensions: mem.dynamicExtensionsVersion,
        dynamicSpecial: mem.dynamicSpecialVersion,
        towerLayout: mem.towerLayoutVersion,
    };
    plan.meta.layoutVersions = {
        extensions: mem.extensionClearanceVersion || mem.dynamicExtensionsVersion || 0,
        towers: mem.towerLayoutVersion || 0,
    };
    plan.meta.authority = 'legacy';
    plan.meta.lastSyncTick = typeof Game !== 'undefined' ? Game.time : plan.meta.lastSyncTick;

    // Surface recent V1 skip breadcrumbs into the failure ring (best-effort).
    absorbLegacySkip(plan, mem);

    return plan;
}

function absorbLegacySkip(plan, mem) {
    const tick = typeof Game !== 'undefined' ? Game.time : 0;
    if (mem.plannerSpawnBlocked && mem.plannerSpawnBlocked.tick) {
        pushFailure(plan, {
            code: mem.plannerSpawnBlocked.reason === 'no-hub' ? FailureCodes.NO_HUB : FailureCodes.NO_SPAWN_ANCHOR,
            layer: 'spawn',
            detail: mem.plannerSpawnBlocked,
            tick: mem.plannerSpawnBlocked.tick,
            source: 'legacy.plannerSpawnBlocked',
        }, tick);
    }
    if (mem.plannerExtensionSkip && mem.plannerExtensionSkip.tick) {
        pushFailure(plan, {
            code: FailureCodes.PLAN_EMPTY,
            layer: 'extensions',
            detail: mem.plannerExtensionSkip,
            tick: mem.plannerExtensionSkip.tick,
            source: 'legacy.plannerExtensionSkip',
        }, tick);
    }
    if (mem.plannerLastSiteError && mem.plannerLastSiteError.tick) {
        pushFailure(plan, {
            code: FailureCodes.TILE_BLOCKED,
            layer: mem.plannerLastSiteError.structureType || 'unknown',
            detail: mem.plannerLastSiteError,
            tick: mem.plannerLastSiteError.tick,
            source: 'legacy.plannerLastSiteError',
        }, tick);
    }
}

/**
 * @param {object} plan
 * @param {{code:string, layer?:string, detail?:*, tick?:number, source?:string}} entry
 * @param {number} [now]
 */
function pushFailure(plan, entry, now) {
    if (!plan.meta.lastFailures) plan.meta.lastFailures = [];
    const tick = entry.tick != null ? entry.tick : (now || 0);
    // Dedupe identical code+layer+source within same tick
    const list = plan.meta.lastFailures;
    for (let i = list.length - 1; i >= 0 && i >= list.length - 5; i--) {
        const prev = list[i];
        if (prev.tick === tick && prev.code === entry.code && prev.layer === entry.layer
            && prev.source === entry.source) {
            return;
        }
    }
    list.push({
        code: entry.code,
        layer: entry.layer || null,
        detail: entry.detail,
        tick,
        source: entry.source || null,
    });
    while (list.length > MAX_FAILURES) list.shift();
}

/**
 * Build a plan from legacy memory (or empty if none). Writes room.memory.plan.
 * Non-destructive to V1 keys.
 * @param {Room} room
 * @returns {object} plan
 */
function migrateFromLegacy(room) {
    const mode = room.memory && room.memory.dynamicLayout ? 'dynamic' : 'bunker';
    const plan = createEmptyPlan({mode});
    syncFromLegacy(room, plan);
    plan.meta.migratedFrom = 'legacy-v1';
    plan.meta.migratedTick = typeof Game !== 'undefined' ? Game.time : 0;
    room.memory[PLAN_MEMORY_KEY] = plan;
    return plan;
}

/**
 * Get existing valid plan or migrate from legacy. Optionally re-sync with legacy.
 * Chunk 9 default: plan authoritative (reconcile). Pass authority:'legacy' for remigrate.
 * @param {Room} room
 * @param {{resync?: boolean, forceMigrate?: boolean, authority?: 'plan'|'legacy'}} [options]
 * @returns {object|null}
 */
function ensurePlan(room, options) {
    if (!room || !room.memory) return null;
    const opts = options || {};
    let plan = getPlan(room);

    if (!plan || opts.forceMigrate) {
        plan = migrateFromLegacy(room);
        // Fresh migrate is legacy-sourced; dual-write reverse so legacy matches plan meta.
        plan.meta.authority = opts.authority === 'legacy' ? 'legacy' : 'plan';
        if (plan.meta.authority === 'plan') {
            syncToLegacy(room, plan);
        }
        return plan;
    }

    if (opts.resync !== false) {
        if (opts.authority === 'legacy') {
            syncFromLegacy(room, plan);
        } else {
            // Default + authority:'plan' — plan owns keys (Chunk 9).
            reconcilePlanLegacy(room, plan);
        }
    }
    return plan;
}

/**
 * Ensure plan docs for every visible owned room (Chunk 9: always).
 * @param {{forceAll?: boolean}} [options] forceAll kept for API compat (ignored; always all)
 * @returns {{synced: string[], skipped: number}}
 */
function ensurePlansForOwnedRooms(options) {
    void options;
    const synced = [];
    const skipped = 0;

    const names = (typeof MY_ROOMS !== 'undefined' && MY_ROOMS && MY_ROOMS.length)
        ? MY_ROOMS
        : null;
    if (names) {
        for (let i = 0; i < names.length; i++) {
            const room = Game.rooms[names[i]];
            if (!room || !room.controller || !room.controller.my) continue;
            ensurePlan(room, {resync: true});
            synced.push(names[i]);
        }
    } else {
        for (const name in Game.rooms) {
            const room = Game.rooms[name];
            if (!room.controller || !room.controller.my) continue;
            ensurePlan(room, {resync: true});
            synced.push(name);
        }
    }
    return {synced, skipped};
}

/**
 * Compact snapshot for console / status (no huge packed arrays).
 * @param {Room} room
 */
function inspectPlan(room) {
    const plan = getPlan(room) || (room && room.memory && room.memory[PLAN_MEMORY_KEY]) || null;
    if (!plan) {
        return {
            roomName: room && room.name,
            hasPlan: false,
            legacy: room && room.memory ? summarizeLegacy(room.memory) : null,
        };
    }
    const layerSummary = {};
    for (let i = 0; i < LAYER_NAMES.length; i++) {
        const name = LAYER_NAMES[i];
        const layer = plan.layers[name];
        if (!layer) continue;
        const n = layer.packed && layer.packed.length ? layer.packed.length : 0;
        if (n || layer.rev) {
            layerSummary[name] = {tiles: n, rev: layer.rev, access: layer.access};
        }
    }
    const resolvedHub = getHub(room);
    const resolvedTowers = getTowerHubs(room);
    const resolvedLab = getLabHub(room);
    return {
        roomName: room.name,
        hasPlan: true,
        schema: plan.schema,
        schemaCurrent: PLAN_DOC_SCHEMA_VERSION,
        schemaOk: plan.schema === PLAN_DOC_SCHEMA_VERSION,
        mode: plan.mode,
        authority: plan.meta.authority || null,
        anchors: {
            hub: plan.anchors.hub,
            towerCount: plan.anchors.towers ? plan.anchors.towers.length : 0,
            towers: plan.anchors.towers,
            lab: plan.anchors.lab,
            labPartial: plan.anchors.labPartial,
        },
        /** Effective values used by V2 placement (plan first). */
        resolved: {
            hub: resolvedHub,
            towers: resolvedTowers,
            lab: resolvedLab.hub,
            labPartial: resolvedLab.partial,
            mode: getPlanMode(room),
        },
        layers: layerSummary,
        meta: {
            migratedFrom: plan.meta.migratedFrom,
            migratedTick: plan.meta.migratedTick,
            lastSyncTick: plan.meta.lastSyncTick,
            authority: plan.meta.authority,
            layoutVersions: plan.meta.layoutVersions,
            legacyVersions: plan.meta.legacyVersions,
            lastFailures: (plan.meta.lastFailures || []).slice(-5),
        },
        legacy: summarizeLegacy(room.memory),
    };
}

function summarizeLegacy(mem) {
    return {
        bunkerHub: mem.bunkerHub || null,
        dynamicLayout: !!mem.dynamicLayout,
        towerHubs: mem.towerHubs ? mem.towerHubs.length : 0,
        labHub: mem.labHub || null,
        hasDynamicExtensions: !!mem.dynamicExtensionsPacked,
        dynamicExtensionsVersion: mem.dynamicExtensionsVersion,
        extensionClearanceVersion: mem.extensionClearanceVersion,
        towerLayoutVersion: mem.towerLayoutVersion,
        plannerSpawnBlocked: mem.plannerSpawnBlocked || null,
        plannerExtensionSkip: mem.plannerExtensionSkip || null,
    };
}

/**
 * Remove plan doc only (does not touch V1 keys).
 * Remigrate via ensurePlan / migrateFromLegacy rebuilds from legacy.
 * @param {Room} room
 */
function clearPlan(room) {
    if (!room || !room.memory) return false;
    delete room.memory[PLAN_MEMORY_KEY];
    return true;
}

/**
 * clearPlan + migrateFromLegacy — console helper for disaster recovery.
 * C5: anchors live only on plan; preserve plan anchors across remigrate when
 * legacy bunkerHub/towerHubs/labHub are empty or stale so remigrate still works
 * without dual-write.
 * @param {Room} room
 */
function remigratePlan(room) {
    const prior = getPlan(room);
    const saved = prior && prior.anchors ? {
        hub: cloneHub(prior.anchors.hub),
        towers: cloneTowers(prior.anchors.towers),
        lab: cloneHub(prior.anchors.lab),
        labPartial: !!prior.anchors.labPartial,
        mode: prior.mode,
    } : null;

    clearPlan(room);
    const plan = migrateFromLegacy(room);

    if (plan && saved) {
        if (!isValidHub(plan.anchors.hub) && isValidHub(saved.hub)) {
            plan.anchors.hub = saved.hub;
        }
        if (!(plan.anchors.towers && plan.anchors.towers.length) && saved.towers && saved.towers.length) {
            plan.anchors.towers = saved.towers;
        }
        if (!isValidHub(plan.anchors.lab) && isValidHub(saved.lab)) {
            plan.anchors.lab = saved.lab;
            plan.anchors.labPartial = saved.labPartial;
        }
        if (saved.mode === 'dynamic' || saved.mode === 'bunker') {
            plan.mode = saved.mode;
        }
        plan.meta.authority = 'plan';
    }
    return plan;
}

module.exports = {
    PLAN_DOC_SCHEMA_VERSION,
    PLAN_MEMORY_KEY,
    FailureCodes,
    LAYER_NAMES,
    createEmptyPlan,
    isPlanDocValid,
    isValidHub,
    getPlan,
    ensurePlan,
    migrateFromLegacy,
    syncFromLegacy,
    syncToLegacy,
    reconcilePlanLegacy,
    ensurePlansForOwnedRooms,
    inspectPlan,
    clearPlan,
    remigratePlan,
    pushFailure,
    packTiles,
    unpackTiles,
    getHub,
    hasHub,
    getTowerHubs,
    getLabHub,
    getPlanMode,
    getLayerPacked,
    cloneHub,
    cloneTowers,
};
