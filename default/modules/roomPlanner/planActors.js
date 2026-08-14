/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Planner V2 placement actors (PR5): spawn + tower (and shared critical path).
 *
 * Plan (where) is pure; act (createConstructionSite) goes through planSiteBudget.
 * Shadow mode never mutates the world.
 */

const {bunkerTemplate, coreTemplate} = require('planTemplates');
const {canPlaceConstructionSite} = require('planUtils');
const {
    ensurePlan,
    getPlan,
    pushFailure,
    FailureCodes,
    packTiles,
    getHub,
    getPlanMode,
} = require('planDoc');
const siteBudget = require('planSiteBudget');
const {isPlannerShadow} = require('planFlag');
const {placeTowerSites, getTowerDeficit} = require('planAnchors');

// ---------------------------------------------------------------------------
// Spawn plan (pure) — hub from plan first (Chunk 8)
// ---------------------------------------------------------------------------

function resolveSpawnHub(room) {
    return getHub(room);
}

/**
 * World-space spawn tile for the primary (first) stamp spawn.
 * @param {Room} room
 * @returns {RoomPosition|null}
 */
function getSpawnAnchor(room) {
    const hub = resolveSpawnHub(room);
    if (!hub) return null;
    const dynamic = getPlanMode(room) === 'dynamic'
        || !!(room.memory && room.memory.dynamicLayout);
    const tmpl = dynamic ? coreTemplate : bunkerTemplate;
    const spawnEntry = tmpl.find(s => s.structureType === STRUCTURE_SPAWN);
    if (!spawnEntry || !spawnEntry.pos || !spawnEntry.pos.length) return null;
    const off = spawnEntry.pos[0];
    const x = hub.x + off.x;
    const y = hub.y + off.y;
    if (x < 1 || x > 48 || y < 1 || y > 48) return null;
    return new RoomPosition(x, y, room.name);
}

/**
 * All spawn stamp tiles for the current mode (for plan layer / multi-spawn later).
 * @param {Room} room
 * @returns {{x:number,y:number}[]}
 */
function getSpawnPlanTiles(room) {
    const hub = resolveSpawnHub(room);
    if (!hub) return [];
    const dynamic = getPlanMode(room) === 'dynamic'
        || !!(room.memory && room.memory.dynamicLayout);
    const tmpl = dynamic ? coreTemplate : bunkerTemplate;
    const spawnEntry = tmpl.find(s => s.structureType === STRUCTURE_SPAWN);
    if (!spawnEntry || !spawnEntry.pos) return [];
    const tiles = [];
    for (let i = 0; i < spawnEntry.pos.length; i++) {
        const off = spawnEntry.pos[i];
        const x = hub.x + off.x;
        const y = hub.y + off.y;
        if (x < 1 || x > 48 || y < 1 || y > 48) continue;
        tiles.push({x, y});
    }
    return tiles;
}

function hasSpawnOrSpawnSite(room) {
    if (room.spawns && room.spawns.length) return true;
    return room.constructionSites.some(s => s.structureType === STRUCTURE_SPAWN);
}

function needsSpawnSite(room) {
    if (!room.controller || !room.controller.my) return false;
    if (!resolveSpawnHub(room)) return false;
    if (room.spawns && room.spawns.length) return false;
    return !room.constructionSites.some(s => s.structureType === STRUCTURE_SPAWN);
}

function writeSpawnLayer(room, tiles) {
    const plan = ensurePlan(room, {resync: false}) || getPlan(room);
    if (!plan || !plan.layers || !plan.layers.spawn) return;
    plan.layers.spawn.packed = tiles && tiles.length ? packTiles(tiles) : null;
    plan.layers.spawn.rev = (plan.layers.spawn.rev || 0) + 1;
}

function recordSpawnBlocked(room, reason, extra) {
    const entry = Object.assign({tick: Game.time, reason}, extra || {});
    room.memory.plannerSpawnBlocked = entry;
    const plan = getPlan(room);
    if (plan) {
        let code = FailureCodes.NO_SPAWN_ANCHOR;
        if (reason === 'no-hub') code = FailureCodes.NO_HUB;
        else if (reason === 'no-site-budget') code = FailureCodes.SITE_BUDGET_ROOM;
        else if (reason === 'tile-blocked' || reason === 'create-failed') code = FailureCodes.TILE_BLOCKED;
        else if (reason === 'wall') code = FailureCodes.TILE_BLOCKED;
        pushFailure(plan, {
            code,
            layer: 'spawn',
            detail: entry,
            tick: Game.time,
            source: 'planActors.ensureSpawnSite',
        });
    }
}

function invalidateRoomSiteCache(room) {
    room._constructionSites = undefined;
    room._constructionSites_ts = undefined;
    room._extDeficitTick = undefined;
    room._towerDeficitTick = undefined;
    room._needsSpawnSiteTick = undefined;
    room._needsCriticalCoreTick = undefined;
    if (room._invalidateStructureCaches) room._invalidateStructureCaches();
}

/**
 * Free construction-site budget so a spawn can be placed.
 * Prefer removing extension sites (including in-progress).
 * @returns {number} sites removed
 */
function freeSitesForSpawn(room) {
    if (canPlaceConstructionSite(room)) return 0;
    let removed = 0;
    const prefer = [STRUCTURE_EXTENSION, STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_RAMPART, STRUCTURE_WALL];
    for (let t = 0; t < prefer.length; t++) {
        const type = prefer[t];
        const sites = room.constructionSites.filter(s => s.structureType === type);
        for (let i = 0; i < sites.length; i++) {
            const site = sites[i];
            if (type !== STRUCTURE_EXTENSION && site.progress) continue;
            try {
                site.remove();
                removed++;
            } catch (e) { /* ignore */
            }
            if (canPlaceConstructionSite(room)) {
                invalidateRoomSiteCache(room);
                return removed;
            }
        }
    }
    if (removed) invalidateRoomSiteCache(room);
    return removed;
}

/**
 * Clear wrong sites/structures on the spawn tile (V1 planLayout parity + multi-site look).
 * @returns {{ok: boolean, reason?: string, pos?: RoomPosition, clearedSites?: number, destroyed?: number}}
 */
function clearSpawnTile(room, pos) {
    let clearedSites = 0;
    let destroyed = 0;

    const lookSites = pos.lookFor ? pos.lookFor(LOOK_CONSTRUCTION_SITES) : [];
    for (let i = 0; i < lookSites.length; i++) {
        const site = lookSites[i];
        if (site.structureType === STRUCTURE_SPAWN) {
            return {ok: true, reason: 'spawn-site-exists', pos, clearedSites, destroyed};
        }
        try {
            site.remove();
            clearedSites++;
        } catch (e) { /* ignore */
        }
    }

    const lookStructs = pos.lookFor ? pos.lookFor(LOOK_STRUCTURES) : [];
    for (let i = 0; i < lookStructs.length; i++) {
        const s = lookStructs[i];
        if (s.structureType === STRUCTURE_SPAWN) {
            return {ok: true, reason: 'spawn-exists', pos, clearedSites, destroyed};
        }
        if (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_ROAD) continue;
        try {
            if (s.destroy() === OK) {
                destroyed++;
                if (typeof log !== 'undefined' && log.a) {
                    log.a(`${room.name}: destroyed ${s.structureType} on spawn tile (${pos.x},${pos.y})`, 'PLANNER');
                }
            }
        } catch (e) { /* ignore */
        }
    }
    if (clearedSites || destroyed) invalidateRoomSiteCache(room);
    return {ok: true, pos, clearedSites, destroyed};
}

/**
 * Ensure a spawn construction site exists (V2 actor).
 * @param {Room} room
 * @returns {{ok: boolean, reason: string, x?: number, y?: number, shadow?: boolean, result?: number, freed?: number}}
 */
function ensureSpawnSite(room) {
    if (room.spawns && room.spawns.length) {
        writeSpawnLayer(room, getSpawnPlanTiles(room));
        return {ok: true, reason: 'spawn-exists'};
    }
    if (room.constructionSites.some(s => s.structureType === STRUCTURE_SPAWN)) {
        writeSpawnLayer(room, getSpawnPlanTiles(room));
        return {ok: true, reason: 'spawn-site-exists'};
    }

    const pos = getSpawnAnchor(room);
    const planTiles = getSpawnPlanTiles(room);
    writeSpawnLayer(room, planTiles);

    if (!pos) {
        const reason = !resolveSpawnHub(room) ? 'no-hub' : 'no-spawn-anchor';
        recordSpawnBlocked(room, reason);
        if (typeof log !== 'undefined' && log.a) {
            log.a(`${room.name}: spawn blocked (${reason})`, 'PLANNER');
        }
        return {ok: false, reason};
    }

    if (pos.checkForWall && pos.checkForWall()) {
        recordSpawnBlocked(room, 'wall', {x: pos.x, y: pos.y});
        if (typeof log !== 'undefined' && log.a) {
            log.a(`${room.name}: spawn blocked (terrain wall) at (${pos.x},${pos.y})`, 'PLANNER');
        }
        return {ok: false, reason: 'wall', x: pos.x, y: pos.y};
    }

    // Shadow: compute-only — no site.remove / structure.destroy / createConstructionSite.
    if (isPlannerShadow(room)) {
        delete room.memory.plannerSpawnBlocked;
        const req = siteBudget.request(room, 'spawn', 1);
        return {
            ok: true,
            reason: 'shadow',
            x: pos.x,
            y: pos.y,
            shadow: true,
            budgetOk: req.allowed >= 1,
            budgetCode: req.code || null,
        };
    }

    const cleared = clearSpawnTile(room, pos);
    if (cleared.reason === 'spawn-site-exists' || cleared.reason === 'spawn-exists') {
        delete room.memory.plannerSpawnBlocked;
        return {ok: true, reason: cleared.reason, x: pos.x, y: pos.y};
    }

    const freed = freeSitesForSpawn(room);

    // Budget check via siteBudget (spawn is highest priority — reservedHigher should be 0)
    const req = siteBudget.request(room, 'spawn', 1);
    if (req.allowed < 1) {
        recordSpawnBlocked(room, 'no-site-budget', {x: pos.x, y: pos.y, code: req.code, freed});
        if (typeof log !== 'undefined' && log.a) {
            log.a(`${room.name}: spawn blocked (no site budget) at (${pos.x},${pos.y})`, 'PLANNER');
        }
        return {ok: false, reason: 'no-site-budget', x: pos.x, y: pos.y, freed, code: req.code};
    }

    const res = siteBudget.tryPlace(room, 'spawn', pos, STRUCTURE_SPAWN);
    if (res.ok) {
        delete room.memory.plannerSpawnBlocked;
        if (typeof log !== 'undefined' && log.a) {
            log.a(`${room.name}: placed spawn site at (${pos.x},${pos.y}) [v2]`, 'PLANNER');
        }
        return {ok: true, reason: 'placed', x: pos.x, y: pos.y, freed};
    }

    recordSpawnBlocked(room, 'create-failed', {
        x: pos.x,
        y: pos.y,
        result: res.result,
        code: res.code,
    });
    if (typeof log !== 'undefined' && log.a) {
        log.a(`${room.name}: spawn site create failed (${res.result}) at (${pos.x},${pos.y})`, 'PLANNER');
    }
    return {
        ok: false,
        reason: 'create-failed',
        result: res.result,
        code: res.code,
        x: pos.x,
        y: pos.y,
        freed,
    };
}

/**
 * Critical path: towers then spawn (V1 priority parity).
 * @param {Room} room
 * @param {{towerMax?: number}} [options]
 */
function placeCriticalSites(room, options) {
    const opts = options || {};
    const towerMax = opts.towerMax === undefined ? 1 : opts.towerMax;
    const towers = getTowerDeficit(room) > 0
        ? placeTowerSites(room, towerMax)
        : {placed: 0, attempts: [], skipped: true};
    const spawn = needsSpawnSite(room)
        ? ensureSpawnSite(room)
        : (hasSpawnOrSpawnSite(room)
            ? {ok: true, reason: room.spawns && room.spawns.length ? 'spawn-exists' : 'spawn-site-exists'}
            : {ok: true, reason: 'not-needed'});
    return {towers, spawn};
}

/**
 * Spawn diagnostics for console.
 * @param {Room} room
 */
function inspectSpawn(room) {
    const pos = getSpawnAnchor(room);
    const tiles = getSpawnPlanTiles(room);
    const hub = resolveSpawnHub(room);
    let tileBlockers = null;
    if (pos) {
        const sites = pos.lookFor ? pos.lookFor(LOOK_CONSTRUCTION_SITES) : [];
        const structs = pos.lookFor ? pos.lookFor(LOOK_STRUCTURES) : [];
        tileBlockers = {
            sites: sites.map(s => ({type: s.structureType, progress: s.progress})),
            structures: structs.map(s => s.structureType),
            wall: !!(pos.checkForWall && pos.checkForWall()),
        };
    }
    return {
        room: room.name,
        hub,
        legacyHub: room.memory.bunkerHub || null,
        mode: getPlanMode(room),
        dynamicLayout: !!room.memory.dynamicLayout,
        anchor: pos ? {x: pos.x, y: pos.y} : null,
        planTiles: tiles,
        hasSpawn: !!(room.spawns && room.spawns.length),
        spawnCount: room.spawns ? room.spawns.length : 0,
        hasSpawnSite: room.constructionSites.some(s => s.structureType === STRUCTURE_SPAWN),
        needsSpawnSite: needsSpawnSite(room),
        blocked: room.memory.plannerSpawnBlocked || null,
        tileBlockers,
        siteBudget: siteBudget.snapshot(room),
        canPlaceRaw: canPlaceConstructionSite(room),
        shadow: isPlannerShadow(room),
    };
}

module.exports = {
    getSpawnAnchor,
    getSpawnPlanTiles,
    hasSpawnOrSpawnSite,
    needsSpawnSite,
    freeSitesForSpawn,
    clearSpawnTile,
    ensureSpawnSite,
    placeCriticalSites,
    placeTowerSites,
    getTowerDeficit,
    inspectSpawn,
};
