/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Planner anchors (Phase 3A): core hub, tower hubs, lab hub + tower placement.
 *
 * Geometry absorbed from former planHub (shim deleted — A1). Tower construction
 * sites always go through planSiteBudget.
 *
 * C4–C5: plan.anchors is sole write target for hub/towers/lab.
 * Reads: getHub / getTowerHubs / getLabHub (legacy fallback for old Memory).
 * Dual-write of anchor coords to bunkerHub/towerHubs/labHub removed (C5).
 */

const {coreTemplate, bunkerTemplate, labTemplate, hubLinkOffset, reservedHubTileKeys} = require('planTemplates');

const {
    determineTowerDamage,
    isNearAnyMineral,
    roomMinerals,
    isAttackRecoveryMode,
    safeStructureOwner,
    countRoomConstructionSitesOfType,
    countLiveRoomConstructionSitesOfType,
    countRoomConstructionSites,
    canPlaceConstructionSite,
    roomConstructionSiteBudget,
    globalConstructionSiteBudget,
    invalidateRoomConstructionSiteCache,
    markFreedSiteSlots,
} = require('planUtils');

const {
    assessHubExtensionCapacity,
    clearDynamicLayoutMemory,
    countPlaceableBunkerExtensionsAt,
    getDynamicSpecialAssignments,
} = require('planGeomExtensions');

const {
    ensurePlan,
    getPlan,
    pushFailure,
    FailureCodes,
    getHub,
    getTowerHubs,
    getLabHub,
    isValidHub,
    syncToLegacy,
} = require('planDoc');
const siteBudget = require('planSiteBudget');
const {isPlannerShadow} = require('planFlag');

const LAB_HUB_SEARCH_COOLDOWN = 500;
const LAB_HUB_SEARCH_CPU_RESERVE = 10;
const LAB_HUB_PATH_MAX_OPS = 4000;
const HUB_EXTENSION_VALIDATE_COOLDOWN = 500;
const HUB_COLLAR_SNAP_COOLDOWN = 50;
const HUB_SEARCH_MIN = 7;
const HUB_SEARCH_MAX = 42;
const HUB_SEAL_CANDIDATE_CAP = 8;
const HUB_SEAL_WEIGHT = 4;
const HUB_SECTOR_WEIGHT = 10;
// Fallback ring around the hub when no seal exists yet (RCL < bunker).
const TOWER_HUB_MIN_DIST = 2;
const TOWER_HUB_FALLBACK_MIN_DIST = 4;
const TOWER_HUB_MAX_DIST = 5;
// Sit just inside the seal so each wall tile is in high tower damage.
const TOWER_SEAL_BAND_MIN = 1;
const TOWER_SEAL_BAND_MAX = 5;
const TOWER_SEAL_BAND_WIDEN = 10;
const TOWER_LAYOUT_VERSION = 3;
const TOWER_RESEAT_COOLDOWN = 300;
const TOWER_SEAL_DRIFT_COUNT = 8;
const TOWER_SEAL_DRIFT_CENTROID = 3;
const MAX_TOWER_HUBS = 6;
const TOWER_HUB_SEPARATION = 2;
const TOWER_EXIT_CLEARANCE = 5;
const TOWER_ANCHOR_CLEARANCE = 3;
// Hub manager stands on spawn-adjacent tiles; a tower there blocks spawning and the 0-MOVE.
const TOWER_SPAWN_CLEARANCE = 2;
const LAB_HUB_INPUT_INDICES = [0, 1];

// ---------------------------------------------------------------------------
// Plan doc dual-write
// ---------------------------------------------------------------------------

function isValidXY(p) {
    return isValidHub(p);
}

/**
 * Mirror legacy keys into plan (or plan→legacy when V2). Prefer ensurePlan resync.
 * Safe to call after direct legacy writes.
 */
function syncAnchorsToPlan(room) {
    if (!room || !room.memory) return null;
    return ensurePlan(room, {resync: true});
}

/**
 * Commit hub to plan (C5: no bunkerHub dual-write).
 * Legacy bunkerHub only if plan doc cannot be created (should be rare).
 */
function clearLabHubAnchor(room) {
    const plan = getPlan(room);
    if (plan && plan.anchors) {
        plan.anchors.lab = null;
        plan.anchors.labPartial = false;
    }
    if (room.memory) {
        delete room.memory.labHub;
        delete room.memory.labHubPartial;
        delete room.memory.labHubSearchFailed;
    }
}

function resetSealAndTowersForHubMove(room) {
    if (!room || !room.memory) return;
    delete room.memory.towerSealLocked;
    delete room.memory.towerSealKey;
    delete room.memory.towerSealRev;
    delete room.memory.towerReseatTick;
    delete room.memory._perimeterDirty;
    try {
        require('planGeomRamparts').invalidateRampartSpots(room);
    } catch (e) { /* optional */
    }
    commitTowerHubs(room, []);
    // Lab stamp is chosen from the core hub. Drop the planned hub so the next
    // ensureLabHub recovers from live labs or re-searches at the new origin.
    clearLabHubAnchor(room);
}

function commitCoreHub(room, hub, options) {
    if (!isValidXY(hub)) return false;
    const prev = resolveHub(room);
    const dynamic = !!(options && options.dynamicLayout);
    const plan = ensurePlan(room, {resync: false}) || getPlan(room);
    if (plan) {
        plan.anchors.hub = {x: hub.x, y: hub.y};
        plan.mode = dynamic ? 'dynamic' : 'bunker';
        plan.meta.authority = 'plan';
        // Packs only — anchors stay plan-only (C5).
        syncToLegacy(room, plan);
    } else {
        room.memory.bunkerHub = {x: hub.x, y: hub.y};
    }
    if (dynamic) room.memory.dynamicLayout = true;
    else delete room.memory.dynamicLayout;
    room._hub = undefined;
    if (prev && (prev.x !== hub.x || prev.y !== hub.y)) {
        resetSealAndTowersForHubMove(room);
    }
    return true;
}

function commitTowerHubs(room, hubs) {
    const list = (hubs || []).filter(isValidXY).map(t => ({x: t.x, y: t.y})).slice(0, MAX_TOWER_HUBS);
    const plan = ensurePlan(room, {resync: false}) || getPlan(room);
    if (plan) {
        plan.anchors.towers = list.map(t => ({x: t.x, y: t.y}));
        plan.meta.layoutVersions = plan.meta.layoutVersions || {};
        plan.meta.layoutVersions.towers = TOWER_LAYOUT_VERSION;
        plan.meta.authority = 'plan';
        syncToLegacy(room, plan);
    } else {
        room.memory.towerHubs = list;
    }
    // Version gate still on memory for clearance/reset consumers.
    room.memory.towerLayoutVersion = TOWER_LAYOUT_VERSION;
    room._towerDeficitTick = undefined;
    // Do not clear ROOM_RAMPART_SPOTS: currentSealKey would fall back to the
    // stamp ring and the next tick would destroy the towers just committed.
    return list;
}

function commitLabHub(room, lab, partial) {
    if (!isValidXY(lab)) return false;
    const plan = ensurePlan(room, {resync: false}) || getPlan(room);
    if (plan) {
        plan.anchors.lab = {x: lab.x, y: lab.y};
        plan.anchors.labPartial = !!partial;
        plan.meta.authority = 'plan';
        syncToLegacy(room, plan);
    } else {
        room.memory.labHub = {x: lab.x, y: lab.y};
        if (partial) room.memory.labHubPartial = true;
        else delete room.memory.labHubPartial;
    }
    delete room.memory.labHubSearchFailed;
    return true;
}

/** Effective bunker hub (plan first). */
function resolveHub(room) {
    return getHub(room);
}

/** Effective tower hubs (plan first). */
function resolveTowerHubs(room) {
    return getTowerHubs(room);
}

/** Effective lab hub (plan first). */
function resolveLabHub(room) {
    return getLabHub(room);
}

// ---------------------------------------------------------------------------
// Core hub search
// ---------------------------------------------------------------------------

function validateHubExtensionCapacity(room) {
    if (room.memory.dynamicLayout) return true;
    if (!room.controller || room.controller.level < 2) return true;
    // Cooldown first so thrash cannot re-run full assess every tick even if assess throws.
    if (room.memory.hubExtensionValidateTick && room.memory.hubExtensionValidateTick > Game.time) {
        return true;
    }
    room.memory.hubExtensionValidateTick = Game.time + HUB_EXTENSION_VALIDATE_COOLDOWN;

    let capacity;
    try {
        capacity = assessHubExtensionCapacity(room);
    } catch (e) {
        if (typeof log !== 'undefined' && log.e) {
            log.e(room.name + ' hub extension assess failed: ' + ((e && e.message) || e), 'PLANNER');
        }
        return true; // keep hub; retry after cooldown
    }
    if (!capacity || capacity.sufficient) return true;

    const hub = resolveHub(room);
    if (typeof log !== 'undefined' && log.a) {
        log.a(room.name + ' hub supports ' + capacity.placeable + ' bunker + ' + capacity.fallback
            + ' fallback slots but needs ' + capacity.deficit
            + ' extensions - switching to dynamic layout'
            + (hub ? ' at (' + hub.x + ',' + hub.y + ')' : '') + '.');
    }
    clearDynamicLayoutMemory(room);
    // Keep the live collar. findCoreHub used to treat spawn/storage as impassible
    // and teleport the hub off the built base.
    if (hub && coreHubFitsAt(room, hub)) {
        return commitCoreHub(room, hub, {dynamicLayout: true});
    }
    return findCoreHub(room, {preferHub: hub});
}

function hubLinkTileBuildable(room, hub) {
    if (!room || !hub) return false;
    const x = hub.x + hubLinkOffset.x;
    const y = hub.y + hubLinkOffset.y;
    if (x < 1 || x > 48 || y < 1 || y > 48) return false;
    return Game.map.getRoomTerrain(room.name).get(x, y) !== TERRAIN_MASK_WALL;
}

function isOpenHubTile(room, x, y) {
    if (x < 2 || x > 47 || y < 2 || y > 47) return false;
    return Game.map.getRoomTerrain(room.name).get(x, y) !== TERRAIN_MASK_WALL;
}

function hubTileClearOfObstacles(room, x, y) {
    if (!isOpenHubTile(room, x, y)) return false;
    if (!room || !room.name) return true;
    const pos = new RoomPosition(x, y, room.name);
    const structs = pos.lookFor(LOOK_STRUCTURES) || [];
    for (let i = 0; i < structs.length; i++) {
        const type = structs[i].structureType;
        if (type === STRUCTURE_RAMPART || type === STRUCTURE_ROAD) continue;
        if (OBSTACLE_OBJECT_TYPES.includes(type)) return false;
    }
    return true;
}

function xyCheby(x, y, obj) {
    if (!obj) return Infinity;
    const p = obj.pos || obj;
    return Math.max(Math.abs(x - p.x), Math.abs(y - p.y));
}

function hubSearchAnchors(room, sources) {
    return {
        sources: sources || room.sources || [],
        minerals: roomMinerals(room) || [],
        ctrl: room.controller && room.controller.pos,
        terrain: Game.map.getRoomTerrain(room.name),
    };
}

function coreTileTerrainOk(anchors, x, y) {
    if (x < 1 || x > 48 || y < 1 || y > 48) return false;
    if (anchors.terrain.get(x, y) === TERRAIN_MASK_WALL) return false;
    if (anchors.ctrl && xyCheby(x, y, anchors.ctrl) <= 1) return false;
    const minerals = anchors.minerals;
    for (let i = 0; i < minerals.length; i++) {
        if (xyCheby(x, y, minerals[i]) <= 1) return false;
    }
    const sources = anchors.sources;
    for (let i = 0; i < sources.length; i++) {
        if (xyCheby(x, y, sources[i]) <= 1) return false;
    }
    return true;
}

function coreStampsTerrainValid(room, x, y, options, anchors) {
    const requireLink = !(options && options.requireLink === false);
    const ctx = anchors || hubSearchAnchors(room);
    for (let e = 0; e < coreTemplate.length; e++) {
        const entry = coreTemplate[e];
        if (entry.structureType === STRUCTURE_LINK && !requireLink) continue;
        const pos = entry.pos || [];
        for (let p = 0; p < pos.length; p++) {
            if (!coreTileTerrainOk(ctx, x + pos[p].x, y + pos[p].y)) return false;
        }
    }
    return true;
}

function coreHubFitsAt(room, hub) {
    if (!hub || !isOpenHubTile(room, hub.x, hub.y)) return false;
    return coreStampsTerrainValid(room, hub.x, hub.y, {requireLink: false});
}

function coreCandidateDistanceOk(room, x, y, sources) {
    let nearest = Infinity;
    const list = sources || [];
    for (let i = 0; i < list.length; i++) {
        if (!list[i]) continue;
        const d = xyCheby(x, y, list[i]);
        if (d < nearest) nearest = d;
    }
    const sourceDist = (nearest === Infinity ? 0 : nearest) * 2;
    if (sourceDist < 6) return false;
    const controllerDist = room.controller ? xyCheby(x, y, room.controller.pos) * 1.5 : 0;
    return controllerDist >= 4;
}

function coreLayoutCanFit(room) {
    const sources = room.sources && room.sources.length ? room.sources : room.find(FIND_SOURCES);
    const anchors = hubSearchAnchors(room, sources);
    const terrain = anchors.terrain;
    for (let x = 3; x <= 46; x++) {
        for (let y = 3; y <= 46; y++) {
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
            if (!hubLinkTileBuildable(room, {x, y})) continue;
            if (!coreStampsTerrainValid(room, x, y, {requireLink: true}, anchors)) continue;
            if (!coreCandidateDistanceOk(room, x, y, sources)) continue;
            return true;
        }
    }
    return false;
}

// Core/bunker spawns sit north of the hub. Hub is south, SE, or SW of the spawn.
function pickHubNearSpawn(room, spawn) {
    if (!room || !spawn) return null;
    const sx = spawn.pos.x;
    const sy = spawn.pos.y;
    const preferred = [
        {x: sx + 1, y: sy + 1},
        {x: sx, y: sy + 1},
        {x: sx - 1, y: sy + 1},
    ];
    let fallback = null;
    for (let i = 0; i < preferred.length; i++) {
        const p = preferred[i];
        if (!hubTileClearOfObstacles(room, p.x, p.y)) continue;
        if (hubLinkTileBuildable(room, p)) return {hub: p, dynamic: false};
        if (!fallback) fallback = {hub: p, dynamic: true};
    }
    return fallback;
}

function spawnOnCoreStamp(hub, spawn) {
    const dx = spawn.pos.x - hub.x;
    const dy = spawn.pos.y - hub.y;
    return dy === -1 && dx >= -1 && dx <= 1;
}

function collarMostlyMatches(room, hub) {
    if (!hub || !hubTileClearOfObstacles(room, hub.x, hub.y)) return false;
    if (room.storage && (room.storage.pos.x !== hub.x + 1 || room.storage.pos.y !== hub.y)) return false;
    if (room.terminal && (room.terminal.pos.x !== hub.x - 1 || room.terminal.pos.y !== hub.y)) return false;
    const spawns = room.spawns || [];
    if (!spawns.length) return true;
    for (let i = 0; i < spawns.length; i++) {
        if (spawnOnCoreStamp(hub, spawns[i])) return true;
    }
    return !!(room.storage || room.terminal);
}

function hubMatchesLiveCollar(room, hub) {
    return collarMostlyMatches(room, hub);
}

function inferHubFromLiveCollar(room) {
    if (!room) return null;
    const fromStorage = room.storage
        ? {x: room.storage.pos.x - 1, y: room.storage.pos.y}
        : null;
    const fromTerminal = room.terminal
        ? {x: room.terminal.pos.x + 1, y: room.terminal.pos.y}
        : null;
    const asResult = (hub, from) => ({
        hub,
        dynamic: !hubLinkTileBuildable(room, hub),
        from,
    });

    if (fromStorage && fromTerminal
        && fromStorage.x === fromTerminal.x && fromStorage.y === fromTerminal.y
        && collarMostlyMatches(room, fromStorage)) {
        return asResult(fromStorage, 'storage+terminal');
    }
    if (fromStorage && collarMostlyMatches(room, fromStorage)) {
        return asResult(fromStorage, 'storage');
    }
    if (fromTerminal && collarMostlyMatches(room, fromTerminal)) {
        return asResult(fromTerminal, 'terminal');
    }
    const spawn = room.spawns && (room.spawns.find(s => s.name !== 'auto') || room.spawns[0]);
    const near = pickHubNearSpawn(room, spawn);
    if (near && collarMostlyMatches(room, near.hub)) {
        return {hub: near.hub, dynamic: near.dynamic, from: 'spawn'};
    }
    return null;
}

function maybeSnapHubToLiveCollar(room) {
    const current = resolveHub(room);
    if (hubMatchesLiveCollar(room, current)) {
        if (current && !hubLinkTileBuildable(room, current) && !room.memory.dynamicLayout) {
            clearDynamicLayoutMemory(room);
            commitCoreHub(room, current, {dynamicLayout: true});
            return true;
        }
        return false;
    }
    const inferred = inferHubFromLiveCollar(room);
    if (!inferred || !inferred.hub) return false;
    if (current && current.x === inferred.hub.x && current.y === inferred.hub.y) {
        if (!hubLinkTileBuildable(room, inferred.hub) && !room.memory.dynamicLayout) {
            clearDynamicLayoutMemory(room);
            commitCoreHub(room, inferred.hub, {dynamicLayout: true});
            return true;
        }
        return false;
    }
    if (room.memory.hubCollarSnapTick && room.memory.hubCollarSnapTick > Game.time) return false;
    room.memory.hubCollarSnapTick = Game.time + HUB_COLLAR_SNAP_COOLDOWN;

    const keepDynamic = !!(room.memory.dynamicLayout || inferred.dynamic);
    if (keepDynamic) clearDynamicLayoutMemory(room);
    commitCoreHub(room, inferred.hub, keepDynamic ? {dynamicLayout: true} : undefined);
    if (typeof log !== 'undefined' && log.a) {
        log.a(room.name + ' hub snapped to live collar at (' + inferred.hub.x + ',' + inferred.hub.y
            + ') from ' + inferred.from + (keepDynamic ? ' (dynamic)' : ''), 'PLANNER');
    }
    return true;
}

function isValidHubPosition(pos, room, sources, anchors) {
    if (!isOpenHubTile(room, pos.x, pos.y)) return false;
    if (!hubLinkTileBuildable(room, pos)) return false;
    const ctx = anchors || hubSearchAnchors(room, sources);
    const layoutTemplate = bunkerTemplate;
    for (let t = 0; t < layoutTemplate.length; t++) {
        const type = layoutTemplate[t];
        for (let i = 0; i < type.pos.length; i++) {
            const s = type.pos[i];
            const x = pos.x + s.x;
            const y = pos.y + s.y;
            if (x < 2 || x > 47 || y < 2 || y > 47) return false;
            if (!coreTileTerrainOk(ctx, x, y)) return false;
        }
    }
    return true;
}

function hubEconomyParts(room, p, sources) {
    let nearest = Infinity;
    const list = sources || [];
    for (let i = 0; i < list.length; i++) {
        const src = list[i];
        if (!src) continue;
        const d = xyCheby(p.x, p.y, src);
        if (d < nearest) nearest = d;
    }
    const sourceDist = (nearest === Infinity ? 25 : nearest) * 2;
    const controllerDist = room.controller ? xyCheby(p.x, p.y, room.controller.pos) * 1.5 : 0;
    const edgeBonus = Math.min(p.x, 49 - p.x, p.y, 49 - p.y) * 0.3;
    return {
        sourceDist,
        controllerDist,
        edgeBonus,
        economy: sourceDist + controllerDist - edgeBonus,
    };
}

/**
 * Rank hub candidates by stamp-seal size (dead ends / terrain pockets first),
 * then source + controller distance. Full bunker fit is selected by the caller;
 * this only ranks within a candidate set.
 */
function pickDefensibleHub(room, candidates, template, sources) {
    if (!candidates || !candidates.length) return null;
    const geom = require('planGeomRamparts');
    const terrain = Game.map.getRoomTerrain(room.name);
    const radius = geom.templateStampRadius(template);
    for (let i = 0; i < candidates.length; i++) {
        const p = candidates[i];
        const eco = hubEconomyParts(room, p, sources);
        p._ring = geom.countOpenStampRing(terrain, p.x, p.y, radius);
        p._sectors = geom.countOpenExitSectors(terrain, p.x, p.y);
        p._pre = p._sectors * HUB_SECTOR_WEIGHT + p._ring * HUB_SEAL_WEIGHT + eco.economy;
        p._economy = eco.economy;
    }
    candidates.sort((a, b) => a._pre - b._pre || a.x - b.x || a.y - b.y);
    const cpuHot = typeof Game !== 'undefined' && Game.cpu && Game.cpu.getUsed
        && Game.cpu.getUsed() > (Game.cpu.tickLimit || 500) - 25;
    if (cpuHot) return candidates[0];
    const limit = Math.min(candidates.length, HUB_SEAL_CANDIDATE_CAP);
    let best = candidates[0];
    let bestScore = Infinity;
    for (let i = 0; i < limit; i++) {
        const p = candidates[i];
        const seal = geom.estimateHubSealCost(room, p, template);
        const score = seal * HUB_SEAL_WEIGHT + (p._economy != null ? p._economy : hubEconomyParts(room, p, sources).economy);
        p._seal = seal;
        p._score = score;
        if (score < bestScore || (score === bestScore && p._ring < (best._ring || Infinity))) {
            bestScore = score;
            best = p;
        }
    }
    return best;
}

function findCoreHub(room, options) {
    const prefer = options && options.preferHub;
    const sources = room.sources && room.sources.length ? room.sources : room.find(FIND_SOURCES);
    const anchors = hubSearchAnchors(room, sources);
    const terrain = anchors.terrain;
    const possiblePos = [];
    for (let x = 3; x <= 46; x++) {
        for (let y = 3; y <= 46; y++) {
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
            if (!hubLinkTileBuildable(room, {x, y})) continue;
            if (!coreStampsTerrainValid(room, x, y, {requireLink: true}, anchors)) continue;
            if (!coreCandidateDistanceOk(room, x, y, sources)) continue;
            possiblePos.push({x, y});
        }
    }
    if (prefer && coreHubFitsAt(room, prefer)) {
        commitCoreHub(room, prefer, {dynamicLayout: true});
        if (typeof log !== 'undefined' && log.a) {
            log.a(room.name + ' cannot fit full bunker — keeping hub at (' + prefer.x + ', ' + prefer.y
                + ') for dynamic layout.');
        }
        return true;
    }
    const bestPos = pickDefensibleHub(room, possiblePos, coreTemplate, sources);
    if (!bestPos) return false;
    commitCoreHub(room, bestPos, {dynamicLayout: true});
    if (typeof log !== 'undefined' && log.a) {
        log.a(room.name + ' cannot fit full bunker — using dynamic layout at (' + bestPos.x + ', ' + bestPos.y
            + ') seal=' + (bestPos._seal != null ? bestPos._seal : '?')
            + ' ring=' + (bestPos._ring != null ? bestPos._ring : '?')
            + ' sectors=' + (bestPos._sectors != null ? bestPos._sectors : '?'));
    }
    return true;
}

function findHub(room, isHubCheck) {
    // Plan-first hub (C5: no legacy hydrate).
    const resolved = resolveHub(room);
    if (resolved && room.controller && room.controller.owner
        && room.controller.owner.username === MY_USERNAME) {
        if (!isHubCheck) {
            maybeSnapHubToLiveCollar(room);
            validateHubExtensionCapacity(room);
        }
        return true;
    }

    if (!isHubCheck) {
        // Shadow canary: never mass-destroy foreign structures; hub recovery memory is OK.
        if (!isPlannerShadow(room)) {
            const structures = room.structures || [];
            for (let i = 0; i < structures.length; i++) {
                const s = structures[i];
                if (s instanceof OwnedStructure && safeStructureOwner(s) === MY_USERNAME) continue;
                try {
                    s.destroy();
                } catch (e) { /* ignore */
                }
            }
        }

        const inferred = inferHubFromLiveCollar(room);
        if (inferred && inferred.hub && hubTileClearOfObstacles(room, inferred.hub.x, inferred.hub.y)) {
            const dynamic = !!(room.memory.dynamicLayout || inferred.dynamic);
            if (dynamic) clearDynamicLayoutMemory(room);
            commitCoreHub(room, inferred.hub, dynamic ? {dynamicLayout: true} : undefined);
            if (typeof log !== 'undefined' && log.a) {
                log.a(room.name + ' hub recovered from ' + inferred.from
                    + (dynamic ? ' (dynamic)' : '') + '.');
            }
            validateHubExtensionCapacity(room);
            return true;
        }
    }

    const sources = room.sources && room.sources.length ? room.sources : room.find(FIND_SOURCES);
    const anchors = hubSearchAnchors(room, sources);
    const terrain = anchors.terrain;
    const possiblePos = [];

    for (let y = HUB_SEARCH_MIN; y <= HUB_SEARCH_MAX; y++) {
        for (let x = HUB_SEARCH_MIN; x <= HUB_SEARCH_MAX; x++) {
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
            if (!isValidHubPosition({x, y}, room, sources, anchors)) continue;
            if (isHubCheck) return true;
            possiblePos.push({x, y});
        }
    }

    if (possiblePos.length) {
        for (let i = 0; i < possiblePos.length; i++) {
            const p = possiblePos[i];
            p.placeable = countPlaceableBunkerExtensionsAt(room, p.x, p.y).placeable;
        }
        const maxPlaceable = _.max(possiblePos, 'placeable').placeable;
        const tier = possiblePos.filter(p => p.placeable === maxPlaceable);
        const extEntry = bunkerTemplate.find(s => s.structureType === STRUCTURE_EXTENSION);
        const extensionTotal = extEntry && extEntry.pos ? extEntry.pos.length : 0;
        if (typeof log !== 'undefined' && log.a) {
            log.a(room.name + ' hub search: ' + possiblePos.length + ' candidates, best extension fit '
                + maxPlaceable + '/' + extensionTotal);
        }
        const choice = pickDefensibleHub(room, tier, bunkerTemplate, sources) || tier[0];
        commitCoreHub(room, {x: choice.x, y: choice.y});
        if (typeof log !== 'undefined' && log.a) {
            log.a('Hub at (' + choice.x + ', ' + choice.y + ') in ' + room.name
                + ' — ' + choice.placeable + ' bunker extension slots'
                + ' seal=' + (choice._seal != null ? choice._seal : '?')
                + ' ring=' + (choice._ring != null ? choice._ring : '?')
                + ' sectors=' + (choice._sectors != null ? choice._sectors : '?'));
        }
        return true;
    }

    if (isHubCheck) return coreLayoutCanFit(room);
    if (findCoreHub(room)) return true;
    if (typeof log !== 'undefined' && log.a) {
        log.a(room.name + ' has been abandoned due to being unable to find a suitable layout.');
    }
    return false;
}

function hubCheck(room) {
    return findHub(room, true);
}

function ensureCoreHub(room, options) {
    const opts = options || {};
    if (opts.hubCheck) {
        const ok = hubCheck(room);
        const hub = resolveHub(room);
        return {
            ok: !!ok,
            hub,
            existed: !!hub,
            source: 'hubCheck',
        };
    }

    const before = resolveHub(room);
    const existed = !!before;

    if (existed) {
        // Existing hub: collar snap + capacity validate (cooldowns inside).
        // A wall hub-link is ring-fallback, not a relocate. Only a wall hub tile moves.
        findHub(room);
        let after = resolveHub(room);
        if (after && !isOpenHubTile(room, after.x, after.y)) {
            if (typeof log !== 'undefined' && log.a) {
                log.a(room.name + ' hub (' + after.x + ',' + after.y
                    + ') is unusable (terrain wall); snapping to collar or re-searching.');
            }
            const inferred = inferHubFromLiveCollar(room);
            if (inferred && inferred.hub && isOpenHubTile(room, inferred.hub.x, inferred.hub.y)) {
                const keepDynamic = !!(room.memory.dynamicLayout || inferred.dynamic);
                if (keepDynamic) clearDynamicLayoutMemory(room);
                commitCoreHub(room, inferred.hub, keepDynamic ? {dynamicLayout: true} : undefined);
            } else if (!findCoreHub(room, {preferHub: after})) {
                const spawn = room.spawns && (room.spawns.find(s => s.name !== 'auto') || room.spawns[0]);
                const near = pickHubNearSpawn(room, spawn);
                if (near) commitCoreHub(room, near.hub, {dynamicLayout: true});
            }
            after = resolveHub(room);
        } else if (after && !hubLinkTileBuildable(room, after) && !room.memory.dynamicLayout) {
            clearDynamicLayoutMemory(room);
            commitCoreHub(room, after, {dynamicLayout: true});
        }
        syncAnchorsToPlan(room);
        const switched = after && before
            && (after.x !== before.x || after.y !== before.y);
        return {
            ok: !!after,
            hub: after,
            existed: true,
            source: switched ? 'collar-snap' : 'existing',
            switched: switched || undefined,
            validateCooldownUntil: room.memory.hubExtensionValidateTick || null,
        };
    }

    const ok = findHub(room);
    syncAnchorsToPlan(room);
    const hub = resolveHub(room);
    if (!ok || !hub) {
        const plan = getPlan(room);
        if (plan) {
            pushFailure(plan, {
                code: FailureCodes.NO_HUB,
                layer: 'spawn',
                detail: {reason: 'findHub failed'},
                tick: Game.time,
                source: 'planAnchors.ensureCoreHub',
            });
        }
        return {ok: false, hub: null, existed: false, source: 'search'};
    }
    return {
        ok: true,
        hub,
        existed: false,
        source: 'search',
    };
}

// ---------------------------------------------------------------------------
// Lab hub search
// ---------------------------------------------------------------------------

function labStampLiveCount(room, hub) {
    if (!room || !hub || !labTemplate) return 0;
    const keys = new Set();
    for (let i = 0; i < labTemplate.length; i++) {
        keys.add((hub.x + labTemplate[i].x) + ',' + (hub.y + labTemplate[i].y));
    }
    let n = 0;
    const labs = room.labs || [];
    for (let i = 0; i < labs.length; i++) {
        const p = labs[i] && labs[i].pos;
        if (p && keys.has(p.x + ',' + p.y)) n++;
    }
    const sites = room.constructionSites || [];
    for (let i = 0; i < sites.length; i++) {
        const s = sites[i];
        if (s && s.structureType === STRUCTURE_LAB && keys.has(s.pos.x + ',' + s.pos.y)) n++;
    }
    return n;
}

function isLabStampTileFreeOrReclaimable(room, x, y) {
    if (x < 1 || x > 48 || y < 1 || y > 48) return false;
    const terrain = Game.map.getRoomTerrain(room.name);
    if (terrain.get(x, y) === TERRAIN_MASK_WALL) return false;
    const pos = new RoomPosition(x, y, room.name);
    const site = pos.checkForConstructionSites && pos.checkForConstructionSites();
    if (site) {
        const t = site.structureType;
        return t === STRUCTURE_LAB || t === STRUCTURE_ROAD || t === STRUCTURE_RAMPART
            || t === STRUCTURE_WALL || t === STRUCTURE_EXTENSION;
    }
    const structs = pos.lookFor(LOOK_STRUCTURES);
    for (let i = 0; i < structs.length; i++) {
        const t = structs[i].structureType;
        if (t === STRUCTURE_ROAD || t === STRUCTURE_RAMPART) continue;
        if (t === STRUCTURE_WALL || t === STRUCTURE_EXTENSION) continue;
        return false;
    }
    return true;
}

/** Keep a committed hub only if labs/sites exist on it or enough tiles can still take a lab. */
function labStampStillUsable(room, hub, partial) {
    if (!room || !hub || !labTemplate) return false;
    if (labStampLiveCount(room, hub) > 0) return true;
    let free = 0;
    for (let i = 0; i < labTemplate.length; i++) {
        if (isLabStampTileFreeOrReclaimable(room, hub.x + labTemplate[i].x, hub.y + labTemplate[i].y)) {
            free++;
        }
    }
    if (free >= 3) return true;
    return !!(partial && free >= 2);
}

function recoverLabHubFromLabs(room) {
    const active = (room.labs || []).filter(l => !l.isActive || l.isActive());
    for (let i = 0; i < active.length; i++) {
        const lab = active[i];
        const partner = active.find(l => l.id !== lab.id && l.pos.x === lab.pos.x && l.pos.y === lab.pos.y + 1);
        if (partner) {
            commitLabHub(room, {x: lab.pos.x, y: lab.pos.y}, true);
            if (typeof log !== 'undefined' && log.a) {
                log.a('Lab hub recovered from built pair at (' + lab.pos.x + ',' + lab.pos.y + ') in ' + room.name);
            }
            return true;
        }
    }
    if (active.length === 1) {
        commitLabHub(room, {x: active[0].pos.x, y: active[0].pos.y}, true);
        return true;
    }
    return false;
}

function labSearchCpuExceeded() {
    if (typeof Game === 'undefined' || !Game.cpu || !Game.cpu.getUsed) return false;
    const limit = Game.cpu.tickLimit || 500;
    return Game.cpu.getUsed() > limit - LAB_HUB_SEARCH_CPU_RESERVE;
}

function isLabBlockingStructureType(structureType, allowWalls) {
    if (structureType === STRUCTURE_ROAD || structureType === STRUCTURE_RAMPART) return false;
    if (allowWalls && structureType === STRUCTURE_WALL) return false;
    return true;
}

function addWorldBlockedTiles(room, blocked, allowWalls) {
    // Match placeLabs / checkForAllStructure: anything except road + rampart blocks.
    // Walls are destroyable at place time, so the fallback pass may ignore them.
    const structs = room.structures || [];
    for (let i = 0; i < structs.length; i++) {
        const s = structs[i];
        if (!s || !s.pos) continue;
        if (!isLabBlockingStructureType(s.structureType, allowWalls)) continue;
        blocked.add(s.pos.x + ',' + s.pos.y);
    }
    const sites = room.constructionSites || [];
    for (let i = 0; i < sites.length; i++) {
        const s = sites[i];
        if (!s || !s.pos) continue;
        if (!isLabBlockingStructureType(s.structureType, allowWalls)) continue;
        blocked.add(s.pos.x + ',' + s.pos.y);
    }
}

function buildLabSearchContext(room, allowWalls) {
    const hubXY = resolveHub(room);
    if (!hubXY) return null;
    const bunkerHub = new RoomPosition(hubXY.x, hubXY.y, room.name);
    const terrain = Game.map.getRoomTerrain(room.name);
    const sources = room.sources || [];
    const controller = room.controller;
    const bunkerTmpl = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
    const blocked = new Set();
    for (let e = 0; e < bunkerTmpl.length; e++) {
        const entry = bunkerTmpl[e];
        for (let p = 0; p < entry.pos.length; p++) {
            const dx = entry.pos[p].x;
            const dy = entry.pos[p].y;
            blocked.add((bunkerHub.x + dx) + ',' + (bunkerHub.y + dy));
        }
    }
    addWorldBlockedTiles(room, blocked, !!allowWalls);
    if (room.memory && room.memory.dynamicLayout) {
        try {
            const extTiles = require('planGeomRamparts').getDynamicExtensionProtectTiles(room) || [];
            for (let i = 0; i < extTiles.length; i++) {
                if (extTiles[i]) blocked.add(extTiles[i].x + ',' + extTiles[i].y);
            }
        } catch (e) { /* optional */
        }
    }
    const towerHubs = resolveTowerHubs(room);
    for (let i = 0; i < towerHubs.length; i++) {
        blocked.add(towerHubs[i].x + ',' + towerHubs[i].y);
    }
    if (controller) blocked.add(controller.pos.x + ',' + controller.pos.y);
    if (room.mineral) blocked.add(room.mineral.pos.x + ',' + room.mineral.pos.y);
    for (let i = 0; i < sources.length; i++) {
        const s = sources[i];
        if (s && s.pos) blocked.add(s.pos.x + ',' + s.pos.y);
    }

    let minDx = 0, maxDx = 0, minDy = 0, maxDy = 0;
    const tplSet = new Set();
    for (let i = 0; i < labTemplate.length; i++) {
        const dx = labTemplate[i].x;
        const dy = labTemplate[i].y;
        tplSet.add(dx + ',' + dy);
        if (dx < minDx) minDx = dx;
        if (dx > maxDx) maxDx = dx;
        if (dy < minDy) minDy = dy;
        if (dy > maxDy) maxDy = dy;
    }
    const labPerimeter = labTemplate.map(function (tile) {
        const dx = tile.x;
        const dy = tile.y;
        const out = [];
        for (let ox = -1; ox <= 1; ox++) {
            for (let oy = -1; oy <= 1; oy++) {
                if (!ox && !oy) continue;
                const px = dx + ox;
                const py = dy + oy;
                if (!tplSet.has(px + ',' + py)) out.push({x: px, y: py});
            }
        }
        return out;
    });

    const sourceXY = [];
    for (let i = 0; i < sources.length; i++) {
        const s = sources[i];
        if (s && s.pos) sourceXY.push({x: s.pos.x, y: s.pos.y});
    }
    const mineralXY = room.mineral && room.mineral.pos
        ? {x: room.mineral.pos.x, y: room.mineral.pos.y}
        : null;

    return {
        bunkerHub,
        terrain,
        sourceXY,
        mineralXY,
        controllerXY: controller ? {x: controller.pos.x, y: controller.pos.y} : null,
        blocked,
        labPerimeter,
        allowWalls: !!allowWalls,
        xMin: Math.max(2, 1 - minDx),
        xMax: Math.min(47, 48 - maxDx),
        yMin: Math.max(2, 1 - minDy),
        yMax: Math.min(47, 48 - maxDy),
    };
}

function isLabTileValid(ctx, cx, cy, index) {
    const terrain = ctx.terrain;
    const blocked = ctx.blocked;
    const labPerimeter = ctx.labPerimeter;
    const dx = labTemplate[index].x;
    const dy = labTemplate[index].y;
    const tx = cx + dx;
    const ty = cy + dy;
    if (tx < 1 || tx > 48 || ty < 1 || ty > 48) return false;
    if (terrain.get(tx, ty) === TERRAIN_MASK_WALL) return false;
    if (blocked.has(tx + ',' + ty)) return false;
    const controllerXY = ctx.controllerXY;
    if (controllerXY && Math.abs(tx - controllerXY.x) <= 1 && Math.abs(ty - controllerXY.y) <= 1) {
        return false;
    }
    const sources = ctx.sourceXY;
    for (let i = 0; i < sources.length; i++) {
        const s = sources[i];
        if (Math.abs(tx - s.x) <= 1 && Math.abs(ty - s.y) <= 1) return false;
    }
    const mineralXY = ctx.mineralXY;
    if (mineralXY && Math.abs(tx - mineralXY.x) <= 1 && Math.abs(ty - mineralXY.y) <= 1) {
        return false;
    }
    const perim = labPerimeter[index];
    for (let i = 0; i < perim.length; i++) {
        const ax = cx + perim[i].x;
        const ay = cy + perim[i].y;
        if (ax < 1 || ax > 48 || ay < 1 || ay > 48) continue;
        if (terrain.get(ax, ay) === TERRAIN_MASK_WALL) continue;
        return true;
    }
    return false;
}

function labStampFullValid(ctx, cx, cy) {
    for (let i = 0; i < labTemplate.length; i++) {
        if (!isLabTileValid(ctx, cx, cy, i)) return false;
    }
    return true;
}

function labStampMinValid(ctx, cx, cy) {
    if (!isLabTileValid(ctx, cx, cy, LAB_HUB_INPUT_INDICES[0])) return 0;
    if (!isLabTileValid(ctx, cx, cy, LAB_HUB_INPUT_INDICES[1])) return 0;
    let extraCount = 0;
    for (let i = LAB_HUB_INPUT_INDICES[1] + 1; i < labTemplate.length; i++) {
        if (isLabTileValid(ctx, cx, cy, i)) extraCount++;
    }
    return extraCount;
}

function forEachChebyshevRing(hubX, hubY, range, xMin, xMax, yMin, yMax, fn) {
    if (range <= 0) {
        if (hubX >= xMin && hubX <= xMax && hubY >= yMin && hubY <= yMax) fn(hubX, hubY);
        return;
    }
    const yTop = hubY - range;
    const yBot = hubY + range;
    for (let x = hubX - range; x <= hubX + range; x++) {
        if (x < xMin || x > xMax) continue;
        if (yTop >= yMin && yTop <= yMax) fn(x, yTop);
        if (yBot !== yTop && yBot >= yMin && yBot <= yMax) fn(x, yBot);
    }
    for (let y = hubY - range + 1; y <= hubY + range - 1; y++) {
        if (y < yMin || y > yMax) continue;
        const xLeft = hubX - range;
        const xRight = hubX + range;
        if (xLeft >= xMin && xLeft <= xMax) fn(xLeft, y);
        if (xRight !== xLeft && xRight >= xMin && xRight <= xMax) fn(xRight, y);
    }
}

function pathToLabHubOk(ctx, candidate) {
    const result = PathFinder.search(
        ctx.bunkerHub,
        {pos: new RoomPosition(candidate.x, candidate.y, ctx.bunkerHub.roomName), range: 1},
        {maxRooms: 1, maxOps: LAB_HUB_PATH_MAX_OPS}
    );
    if (result.incomplete) return false;
    return result.path.length <= candidate.score * 2 + 8;
}

function pickLabHubCandidate(ctx, candidates, preferExtraLabs) {
    if (!candidates.length) return {chosen: null, walkable: false};
    if (preferExtraLabs) {
        candidates.sort((a, b) => (b.extraCount - a.extraCount) || (a.score - b.score));
    } else {
        candidates.sort((a, b) => a.score - b.score);
    }
    const probe = Math.min(candidates.length, 8);
    for (let i = 0; i < probe; i++) {
        const c = candidates[i];
        if (pathToLabHubOk(ctx, c)) return {chosen: c, walkable: true};
    }
    return {chosen: candidates[0], walkable: false};
}

/**
 * Walk Chebyshev rings from the bunker hub so a valid stamp far from the core
 * is still found. Prefers a walkable hub over a closer disconnected pocket.
 * Cheap occupancy (no per-tile checkForImpassible) so the full room finishes.
 */
function searchLabHubByRing(ctx, minProduction) {
    const hubX = ctx.bunkerHub.x;
    const hubY = ctx.bunkerHub.y;
    const maxRange = Math.max(
        Math.max(hubX - ctx.xMin, ctx.xMax - hubX),
        Math.max(hubY - ctx.yMin, ctx.yMax - hubY)
    );
    let fallback = null;
    for (let r = 0; r <= maxRange; r++) {
        if (labSearchCpuExceeded()) {
            return {chosen: null, incomplete: true};
        }
        const ring = [];
        forEachChebyshevRing(hubX, hubY, r, ctx.xMin, ctx.xMax, ctx.yMin, ctx.yMax, function (cx, cy) {
            if (minProduction) {
                const extraCount = labStampMinValid(ctx, cx, cy);
                if (!extraCount) return;
                ring.push({x: cx, y: cy, score: r, extraCount});
            } else if (labStampFullValid(ctx, cx, cy)) {
                ring.push({x: cx, y: cy, score: r});
            }
        });
        if (!ring.length) continue;
        const pick = pickLabHubCandidate(ctx, ring, !!minProduction);
        if (pick.walkable && pick.chosen) {
            return {chosen: pick.chosen, incomplete: false};
        }
        if (!fallback && pick.chosen) fallback = pick.chosen;
    }
    return {chosen: fallback, incomplete: false};
}

function commitFoundLabHub(room, chosen, partial) {
    commitLabHub(room, chosen, partial);
    if (typeof log !== 'undefined' && log.a) {
        if (partial) {
            const extra = chosen.extraCount ? ', ' + chosen.extraCount + ' extra slot(s)' : '';
            log.a('Lab hub (partial) placed at (' + chosen.x + ',' + chosen.y + ') for ' + room.name
                + ', range ' + chosen.score + ' from bunker hub' + extra);
        } else {
            log.a('Lab hub (full) placed at (' + chosen.x + ',' + chosen.y + ') for ' + room.name
                + ', range ' + chosen.score + ' from bunker hub');
        }
    }
    return true;
}

function findLabHub(room) {
    if (resolveLabHub(room).hub) return true;
    if (!resolveHub(room)) return false;
    if (room.memory.labHubSearchFailed && room.memory.labHubSearchFailed > Game.time) return false;

    if (recoverLabHubFromLabs(room)) return true;

    const passes = [false, true];
    for (let p = 0; p < passes.length; p++) {
        const ctx = buildLabSearchContext(room, passes[p]);
        if (!ctx) return false;

        let result = searchLabHubByRing(ctx, false);
        if (result.incomplete) {
            if (typeof log !== 'undefined' && log.a) {
                log.a('Lab hub search in ' + room.name + ' hit CPU reserve; retry next visit.');
            }
            return false;
        }
        if (result.chosen) return commitFoundLabHub(room, result.chosen, false);

        result = searchLabHubByRing(ctx, true);
        if (result.incomplete) {
            if (typeof log !== 'undefined' && log.a) {
                log.a('Lab hub search in ' + room.name + ' hit CPU reserve; retry next visit.');
            }
            return false;
        }
        if (result.chosen) return commitFoundLabHub(room, result.chosen, true);
    }

    room.memory.labHubSearchFailed = Game.time + LAB_HUB_SEARCH_COOLDOWN;
    if (typeof log !== 'undefined' && log.a) {
        log.a('Cannot find a lab hub in ' + room.name + ' (retry in ' + LAB_HUB_SEARCH_COOLDOWN + ' ticks).');
    }
    return false;
}

function ensureLabHub(room) {
    if (!resolveHub(room)) {
        return {ok: false, lab: null, reason: 'no_hub'};
    }
    const existing = resolveLabHub(room);
    if (existing.hub) {
        if (labStampStillUsable(room, existing.hub, existing.partial)) {
            return {
                ok: true,
                lab: existing.hub,
                partial: existing.partial,
                reason: 'existing',
            };
        }
        if (typeof log !== 'undefined' && log.a) {
            log.a(room.name + ' dropping stale lab hub at (' + existing.hub.x + ',' + existing.hub.y + ')', 'PLANNER');
        }
        clearLabHubAnchor(room);
    }

    const result = findLabHub(room);
    syncAnchorsToPlan(room);
    const lab = resolveLabHub(room);
    if (!lab.hub) {
        return {ok: false, lab: null, reason: result === false ? 'search_failed' : 'pending'};
    }
    return {
        ok: true,
        lab: lab.hub,
        partial: lab.partial,
        reason: 'search',
    };
}

// ---------------------------------------------------------------------------
// Tower hubs — interior band along the min-cut seal.
// Greedy maximin of tower damage on every seal tile so firepower is even.
// Bump TOWER_LAYOUT_VERSION to migrate; off-plan towers are destroyed once.
// Do not re-pick when the seal later grows around those towers.
// ---------------------------------------------------------------------------

function cheby(ax, ay, bx, by) {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** Distance to the sampled seal / stamp-ring. Not hub range — those must not share sealDist. */
function minDistToWalls(x, y, walls) {
    if (!walls || !walls.length) return 99;
    let min = 99;
    for (let i = 0; i < walls.length; i++) {
        const d = cheby(x, y, walls[i].x, walls[i].y);
        if (d < min) min = d;
    }
    return min;
}

function towerTileKey(x, y) {
    return x + ',' + y;
}

/** Core/lab/special stamps a tower must not occupy. Roads are allowed (share the tile). */
function collectTowerBlockedKeys(room, hubX, hubY) {
    const blocked = reservedHubTileKeys({x: hubX, y: hubY});
    const tmpl = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
    for (let e = 0; e < tmpl.length; e++) {
        const entry = tmpl[e];
        if (!entry || entry.structureType === STRUCTURE_ROAD || entry.structureType === STRUCTURE_EXTENSION) {
            continue;
        }
        const pos = entry.pos || [];
        for (let i = 0; i < pos.length; i++) {
            blocked.add(towerTileKey(hubX + pos[i].x, hubY + pos[i].y));
        }
    }
    const lab = resolveLabHub(room);
    if (lab && lab.hub && labTemplate) {
        for (let i = 0; i < labTemplate.length; i++) {
            blocked.add(towerTileKey(lab.hub.x + labTemplate[i].x, lab.hub.y + labTemplate[i].y));
        }
    }
    if (room.memory.dynamicLayout) {
        const assignments = getDynamicSpecialAssignments(room) || [];
        for (let i = 0; i < assignments.length; i++) {
            blocked.add(towerTileKey(assignments[i].x, assignments[i].y));
        }
    }
    return blocked;
}

function collectExtensionStampKeys(room, hubX, hubY) {
    const keys = new Set();
    if (room.memory.dynamicLayout) {
        try {
            const tiles = require('planGeomRamparts').getDynamicExtensionProtectTiles(room) || [];
            for (let i = 0; i < tiles.length; i++) {
                if (tiles[i]) keys.add(towerTileKey(tiles[i].x, tiles[i].y));
            }
        } catch (e) { /* ignore */
        }
        const exts = room.extensions || [];
        for (let i = 0; i < exts.length; i++) {
            if (exts[i] && exts[i].pos) keys.add(towerTileKey(exts[i].pos.x, exts[i].pos.y));
        }
        return keys;
    }
    for (let e = 0; e < bunkerTemplate.length; e++) {
        const entry = bunkerTemplate[e];
        if (!entry || entry.structureType !== STRUCTURE_EXTENSION) continue;
        const pos = entry.pos || [];
        for (let i = 0; i < pos.length; i++) {
            keys.add(towerTileKey(hubX + pos[i].x, hubY + pos[i].y));
        }
    }
    return keys;
}

function isTowerTileBlockedByWorld(room, x, y) {
    try {
        const pos = new RoomPosition(x, y, room.name);
        if (!pos.lookFor) return false;
        const structs = pos.lookFor(LOOK_STRUCTURES) || [];
        for (let i = 0; i < structs.length; i++) {
            const t = structs[i].structureType;
            if (t === STRUCTURE_ROAD || t === STRUCTURE_RAMPART) continue;
            if (t === STRUCTURE_EXTENSION || t === STRUCTURE_CONTAINER || t === STRUCTURE_WALL) continue;
            if (t === STRUCTURE_TOWER) continue;
            return true;
        }
    } catch (e) {
        return false;
    }
    return false;
}

/**
 * Tiles the towers must cover: planned hub seal if it exists, otherwise the
 * walkable cheby ring just outside the stamp (proxy for hub walls/ramparts).
 */
function sampleHubWallTiles(room, hubX, hubY, terrain) {
    try {
        if (typeof ROOM_RAMPART_SPOTS !== 'undefined' && ROOM_RAMPART_SPOTS[room.name]) {
            const raw = ROOM_RAMPART_SPOTS[room.name];
            const spots = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (Array.isArray(spots) && spots.length) {
                return spots.map(function (p) {
                    return {x: p.x, y: p.y};
                });
            }
        }
    } catch (e) { /* fall through to stamp ring */
    }

    if (room.memory && room.memory.dynamicLayout) {
        let r = 0;
        try {
            const tiles = require('planGeomRamparts').getDynamicExtensionProtectTiles(room) || [];
            for (let i = 0; i < tiles.length; i++) {
                const d = cheby(tiles[i].x, tiles[i].y, hubX, hubY);
                if (d > r) r = d;
            }
        } catch (e) { /* ignore */
        }
        if (r < 2) return [];
        r += 1;
        const samples = [];
        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
                if (cheby(dx, dy, 0, 0) !== r) continue;
                const x = hubX + dx;
                const y = hubY + dy;
                if (x < 1 || x > 48 || y < 1 || y > 48) continue;
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                samples.push({x, y});
            }
        }
        return samples;
    }

    const tmpl = bunkerTemplate;
    let radius = 5;
    try {
        radius = require('planGeomRamparts').templateStampRadius(tmpl) || 5;
    } catch (e) { /* default bunker ring */
    }
    const r = radius + 1;
    const samples = [];
    for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
            if (cheby(dx, dy, 0, 0) !== r) continue;
            const x = hubX + dx;
            const y = hubY + dy;
            if (x < 1 || x > 48 || y < 1 || y > 48) continue;
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
            samples.push({x, y});
        }
    }
    return samples;
}

function collectExitTiles(room) {
    const neighboring = Game.map.describeExits(room.name);
    const dirToFind = {'1': FIND_EXIT_TOP, '3': FIND_EXIT_RIGHT, '5': FIND_EXIT_BOTTOM, '7': FIND_EXIT_LEFT};
    const tiles = [];
    for (const dir in dirToFind) {
        if (!neighboring[dir]) continue;
        const exits = room.find(dirToFind[dir]) || [];
        for (let i = 0; i < exits.length; i++) tiles.push(exits[i]);
    }
    return tiles;
}

function minExitDist(x, y, exitTiles) {
    let min = Infinity;
    for (let i = 0; i < exitTiles.length; i++) {
        const d = cheby(x, y, exitTiles[i].x, exitTiles[i].y);
        if (d < min) min = d;
    }
    return min;
}

function floodInteriorBehindSeal(hubXY, sealSet, terrain) {
    const interior = new Set();
    if (!hubXY || !terrain) return interior;
    const start = towerTileKey(hubXY.x, hubXY.y);
    if (sealSet && sealSet.has(start)) {
        interior.add(start);
        return interior;
    }
    interior.add(start);
    const q = [hubXY.x, hubXY.y];
    let qi = 0;
    const oct = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    while (qi < q.length) {
        const x = q[qi++];
        const y = q[qi++];
        for (let i = 0; i < 8; i++) {
            const nx = x + oct[i][0];
            const ny = y + oct[i][1];
            if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
            const key = towerTileKey(nx, ny);
            if (interior.has(key) || (sealSet && sealSet.has(key))) continue;
            if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) continue;
            interior.add(key);
            q.push(nx, ny);
        }
    }
    return interior;
}

function collectSpawnTiles(room, hubX, hubY) {
    const tiles = [];
    const seen = new Set();
    const add = (x, y) => {
        const key = towerTileKey(x, y);
        if (seen.has(key)) return;
        seen.add(key);
        tiles.push({x, y});
    };
    const tmpl = room.memory && room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
    for (let e = 0; e < tmpl.length; e++) {
        const entry = tmpl[e];
        if (!entry || entry.structureType !== STRUCTURE_SPAWN) continue;
        const pos = entry.pos || [];
        for (let i = 0; i < pos.length; i++) add(hubX + pos[i].x, hubY + pos[i].y);
    }
    const spawns = room.spawns || [];
    for (let i = 0; i < spawns.length; i++) {
        if (spawns[i] && spawns[i].pos) add(spawns[i].pos.x, spawns[i].pos.y);
    }
    return tiles;
}

function tooCloseToSpawn(x, y, spawnTiles) {
    for (let i = 0; i < spawnTiles.length; i++) {
        if (cheby(x, y, spawnTiles[i].x, spawnTiles[i].y) < TOWER_SPAWN_CLEARANCE) return true;
    }
    return false;
}

function spawnTilesForTowers(room, hubXY) {
    if (!hubXY) return [];
    const key = hubXY.x + ',' + hubXY.y;
    if (room._towerSpawnTilesTick === Game.time && room._towerSpawnTilesHub === key) {
        return room._towerSpawnTiles;
    }
    const tiles = collectSpawnTiles(room, hubXY.x, hubXY.y);
    room._towerSpawnTiles = tiles;
    room._towerSpawnTilesTick = Game.time;
    room._towerSpawnTilesHub = key;
    return tiles;
}

function towerHubsTooCloseToSpawn(room, hubs) {
    if (!hubs || !hubs.length) return false;
    const hub = resolveHub(room);
    if (!hub) return false;
    const spawnTiles = spawnTilesForTowers(room, hub);
    for (let i = 0; i < hubs.length; i++) {
        if (tooCloseToSpawn(hubs[i].x, hubs[i].y, spawnTiles)) return true;
    }
    return false;
}

function candidateAllowed(room, x, y, blocked, srcPos, ctrlPos, extensionStamp, hubXY, skipExit) {
    if (x < 2 || x > 47 || y < 2 || y > 47) return null;
    const terrain = Game.map.getRoomTerrain(room.name);
    if (terrain.get(x, y) === TERRAIN_MASK_WALL) return null;
    const key = towerTileKey(x, y);
    if (blocked.has(key)) return null;
    if (isTowerTileBlockedByWorld(room, x, y)) return null;
    if (tooCloseToSpawn(x, y, spawnTilesForTowers(room, hubXY))) return null;
    for (let i = 0; i < srcPos.length; i++) {
        if (cheby(x, y, srcPos[i].x, srcPos[i].y) < TOWER_ANCHOR_CLEARANCE) return null;
    }
    if (ctrlPos && cheby(x, y, ctrlPos.x, ctrlPos.y) < TOWER_ANCHOR_CLEARANCE) return null;
    if (isNearAnyMineral(new RoomPosition(x, y, room.name), room, TOWER_ANCHOR_CLEARANCE - 1)) return null;
    if (!skipExit) {
        const exitTiles = collectExitTiles(room);
        if (exitTiles.length && minExitDist(x, y, exitTiles) < TOWER_EXIT_CLEARANCE) return null;
    }
    const extensionTile = extensionStamp.has(key);
    return {x, y, key, soft: extensionTile ? 1 : 0};
}

function collectSealBandCandidates(room, hubXY, walls, sealSet, interior, blocked, srcPos, ctrlPos, extensionStamp) {
    const candidates = [];
    const seen = new Set();
    const addAt = (x, y, sealDist) => {
        const key = towerTileKey(x, y);
        if (seen.has(key)) return;
        if (sealSet.has(key)) return;
        if (interior && interior.size && !interior.has(key)) return;
        const c = candidateAllowed(room, x, y, blocked, srcPos, ctrlPos, extensionStamp, hubXY, true);
        if (!c) return;
        seen.add(key);
        c.sealDist = sealDist;
        c.hubDist = cheby(x, y, hubXY.x, hubXY.y);
        candidates.push(c);
    };
    const fillBand = (maxDist) => {
        for (let w = 0; w < walls.length; w++) {
            const wx = walls[w].x;
            const wy = walls[w].y;
            for (let r = TOWER_SEAL_BAND_MIN; r <= maxDist; r++) {
                forEachChebyshevRing(wx, wy, r, 2, 47, 2, 47, function (x, y) {
                    addAt(x, y, r);
                });
            }
        }
    };
    fillBand(TOWER_SEAL_BAND_MAX);
    if (candidates.length < MAX_TOWER_HUBS * 3) fillBand(TOWER_SEAL_BAND_WIDEN);
    return candidates;
}

function collectHubRingCandidates(room, hubXY, blocked, srcPos, ctrlPos, extensionStamp, skipExit, maxDist, walls) {
    const candidates = [];
    const minR = TOWER_HUB_FALLBACK_MIN_DIST;
    const maxR = maxDist || TOWER_HUB_MAX_DIST;
    for (let r = minR; r <= maxR; r++) {
        forEachChebyshevRing(hubXY.x, hubXY.y, r, 2, 47, 2, 47, function (x, y) {
            const c = candidateAllowed(room, x, y, blocked, srcPos, ctrlPos, extensionStamp, hubXY, !!skipExit);
            if (!c) return;
            c.hubDist = r;
            c.sealDist = minDistToWalls(x, y, walls);
            candidates.push(c);
        });
    }
    return candidates;
}

/** Greedy maximin coverage of seal tiles, then total damage, then closer to the wall. */
function pickEvenSealTowers(candidates, walls) {
    const selected = [];
    const used = new Set();
    const wallDmg = [];
    for (let w = 0; w < walls.length; w++) wallDmg.push(0);

    while (selected.length < MAX_TOWER_HUBS) {
        let best = null;
        let bestMin = -1;
        let bestSum = -1;
        let bestSeal = 99;
        let bestSoft = 2;
        for (let i = 0; i < candidates.length; i++) {
            const c = candidates[i];
            const key = towerTileKey(c.x, c.y);
            if (used.has(key)) continue;
            let ok = true;
            for (let j = 0; j < selected.length; j++) {
                if (cheby(c.x, c.y, selected[j].x, selected[j].y) < TOWER_HUB_SEPARATION) {
                    ok = false;
                    break;
                }
            }
            if (!ok) continue;

            let min = walls.length ? Infinity : 0;
            let sum = 0;
            for (let w = 0; w < walls.length; w++) {
                const d = wallDmg[w] + determineTowerDamage(cheby(c.x, c.y, walls[w].x, walls[w].y));
                if (d < min) min = d;
                sum += d;
            }
            const sealDist = c.sealDist != null ? c.sealDist : 99;
            const better = !best
                || min > bestMin
                || (min === bestMin && sum > bestSum)
                || (min === bestMin && sum === bestSum && sealDist < bestSeal)
                || (min === bestMin && sum === bestSum && sealDist === bestSeal && c.soft < bestSoft);
            if (better) {
                best = c;
                bestMin = min;
                bestSum = sum;
                bestSeal = sealDist;
                bestSoft = c.soft;
            }
        }
        if (!best) break;
        selected.push(best);
        used.add(towerTileKey(best.x, best.y));
        for (let w = 0; w < walls.length; w++) {
            wallDmg[w] += determineTowerDamage(cheby(best.x, best.y, walls[w].x, walls[w].y));
        }
    }
    return selected;
}

function selectTowerHubs(room) {
    const coreHub = resolveHub(room);
    if (!coreHub) {
        return {hubs: [], reason: 'no_hub'};
    }

    const hubX = coreHub.x;
    const hubY = coreHub.y;
    const hubXY = {x: hubX, y: hubY};
    const terrain = Game.map.getRoomTerrain(room.name);
    const blocked = collectTowerBlockedKeys(room, hubX, hubY);
    const extensionStamp = collectExtensionStampKeys(room, hubX, hubY);
    const srcPos = (room.sources || []).map(s => s.pos);
    const ctrlPos = room.controller ? room.controller.pos : null;
    const walls = sampleHubWallTiles(room, hubX, hubY, terrain);

    let candidates;
    if (walls.length) {
        const sealSet = new Set();
        for (let i = 0; i < walls.length; i++) sealSet.add(towerTileKey(walls[i].x, walls[i].y));
        const interior = floodInteriorBehindSeal(hubXY, sealSet, terrain);
        candidates = collectSealBandCandidates(
            room, hubXY, walls, sealSet, interior, blocked, srcPos, ctrlPos, extensionStamp);
        // Hub-on-seal or a packed interior yields 0 band tiles. Fill from the
        // hub ring so rooms still get towers. skipExit: pre-bunker hubs sit
        // closer to exits than the RCL6 seal, and exit clearance of 5 wipes
        // the whole ring.
        if (candidates.length < MAX_TOWER_HUBS) {
            const ring = collectHubRingCandidates(
                room, hubXY, blocked, srcPos, ctrlPos, extensionStamp, true, undefined, walls);
            const seen = new Set();
            for (let i = 0; i < candidates.length; i++) seen.add(candidates[i].key);
            for (let i = 0; i < ring.length; i++) {
                if (seen.has(ring[i].key)) continue;
                seen.add(ring[i].key);
                candidates.push(ring[i]);
            }
        }
    } else {
        const bunkerLevel = typeof BUNKER_LEVEL === 'number' ? BUNKER_LEVEL : 6;
        if (room.memory && room.memory.dynamicLayout
            && room.controller && room.controller.level >= bunkerLevel) {
            return {
                hubs: [],
                candidateCount: 0,
                alongSeal: false,
                reason: 'no_seal',
            };
        }
        const preBunker = !room.controller || room.controller.level < bunkerLevel;
        candidates = collectHubRingCandidates(
            room, hubXY, blocked, srcPos, ctrlPos, extensionStamp, preBunker, undefined, walls);
    }

    if (candidates.length < MAX_TOWER_HUBS) {
        const wide = collectHubRingCandidates(
            room, hubXY, blocked, srcPos, ctrlPos, extensionStamp, true, TOWER_HUB_MAX_DIST + 3, walls);
        const seen = new Set();
        for (let i = 0; i < candidates.length; i++) seen.add(candidates[i].key);
        for (let i = 0; i < wide.length; i++) {
            if (seen.has(wide[i].key)) continue;
            seen.add(wide[i].key);
            candidates.push(wide[i]);
        }
    }

    let picked = pickEvenSealTowers(candidates, walls);
    let emergency = false;
    if (!picked.length) {
        // Source/mineral/exit clearance can wipe the band. Last resort still
        // rejects spawn/storage/terminal; extensions are soft, not skipped.
        const loose = collectEmergencyTowerCandidates(room, hubXY, blocked, extensionStamp, walls);
        picked = pickEvenSealTowers(loose, walls.length ? walls : loose);
        if (picked.length) {
            candidates = loose;
            emergency = true;
        }
    }
    const selected = picked.map(function (c) {
        return {x: c.x, y: c.y};
    });
    return {
        hubs: selected,
        candidateCount: candidates.length,
        alongSeal: walls.length > 0,
        emergency: emergency || undefined,
        reason: selected.length ? (emergency ? 'emergency' : undefined) : 'no_candidates',
    };
}

/**
 * Last-resort tower tiles: walkable, not a core stamp. Hard world structures
 * (spawn/storage/terminal/…) still block; extensions/containers/walls do not.
 */
function collectEmergencyTowerCandidates(room, hubXY, blocked, extensionStamp, walls) {
    const candidates = [];
    const terrain = Game.map.getRoomTerrain(room.name);
    const spawnTiles = spawnTilesForTowers(room, hubXY);
    const minR = TOWER_HUB_FALLBACK_MIN_DIST;
    for (let r = minR; r <= TOWER_HUB_MAX_DIST + 5; r++) {
        forEachChebyshevRing(hubXY.x, hubXY.y, r, 2, 47, 2, 47, function (x, y) {
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) return;
            const key = towerTileKey(x, y);
            if (blocked.has(key)) return;
            if (tooCloseToSpawn(x, y, spawnTiles)) return;
            if (isTowerTileBlockedByWorld(room, x, y)) return;
            const sealDist = minDistToWalls(x, y, walls);
            if (extensionStamp && extensionStamp.has(key)
                && (!walls || !walls.length || sealDist > TOWER_SEAL_BAND_MAX)) {
                return;
            }
            const extensionTile = !!(extensionStamp && extensionStamp.has(key));
            candidates.push({
                x, y, key,
                soft: extensionTile ? 1 : 0,
                sealDist,
                hubDist: r,
            });
        });
        if (candidates.length >= MAX_TOWER_HUBS * 2) break;
    }
    return candidates;
}

function recoverTowerHubsFromWorld(room) {
    const positions = [];
    const seen = new Set();
    const add = (x, y) => {
        const key = x + ',' + y;
        if (seen.has(key)) return;
        seen.add(key);
        positions.push({x, y});
    };

    const towers = room.towers || [];
    for (let i = 0; i < towers.length; i++) add(towers[i].pos.x, towers[i].pos.y);

    const sites = room.constructionSites || [];
    for (let i = 0; i < sites.length; i++) {
        if (sites[i].structureType === STRUCTURE_TOWER) add(sites[i].pos.x, sites[i].pos.y);
    }
    return positions.slice(0, MAX_TOWER_HUBS);
}

/** Expand the perimeter wrap to new tower hubs without tearing down the current seal. */
function refreshPerimeterAfterTowerHubs(room) {
    if (!room || !room.controller || room.controller.level < (typeof BUNKER_LEVEL === 'number' ? BUNKER_LEVEL : 6)) {
        return;
    }
    try {
        require('planRamparts').recalculateRampartsForRoom(room, undefined, {destroyOffPlan: false});
    } catch (e) { /* optional */
    }
}

function perimeterRevForTowers() {
    try {
        return require('planGeomRamparts').PERIMETER_PLAN_REV;
    } catch (e) {
        return 0;
    }
}

function currentSealKey(room) {
    const hub = resolveHub(room);
    if (!hub) return 'none';
    const terrain = Game.map.getRoomTerrain(room.name);
    const walls = sampleHubWallTiles(room, hub.x, hub.y, terrain);
    if (!walls.length) return 'none';
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < walls.length; i++) {
        sx += walls[i].x;
        sy += walls[i].y;
    }
    return walls.length + ':' + Math.round(sx / walls.length) + ':' + Math.round(sy / walls.length);
}

function hasCachedSealSpots(room) {
    return !!(room && typeof ROOM_RAMPART_SPOTS !== 'undefined' && ROOM_RAMPART_SPOTS[room.name]);
}

function parseSealKey(key) {
    if (!key || key === 'none') return null;
    const parts = String(key).split(':');
    if (parts.length !== 3) return null;
    const n = +parts[0];
    const x = +parts[1];
    const y = +parts[2];
    if (!(n >= 0) || !(x >= 0) || !(y >= 0)) return null;
    return {n, x, y};
}

function dynamicSealDrifted(room) {
    if (!room || !room.memory || !room.memory.dynamicLayout) return false;
    if (!room.memory.towerSealLocked) return false;
    const now = parseSealKey(currentSealKey(room));
    const was = parseSealKey(room.memory.towerSealKey);
    if (!now || !was) return false;
    return Math.abs(now.n - was.n) >= TOWER_SEAL_DRIFT_COUNT
        || Math.abs(now.x - was.x) >= TOWER_SEAL_DRIFT_CENTROID
        || Math.abs(now.y - was.y) >= TOWER_SEAL_DRIFT_CENTROID;
}

function towerLayoutStale(room) {
    if (!room || !room.memory) return true;
    if (room.memory.towerLayoutVersion !== TOWER_LAYOUT_VERSION) return true;
    const rev = perimeterRevForTowers();
    if (rev && room.memory.towerSealRev !== rev) return true;
    if (dynamicSealDrifted(room)) {
        if (room.memory.towerReseatTick && room.memory.towerReseatTick > Game.time) return false;
        return true;
    }
    // Bunker: freeze after the first seal pick. Dynamic rooms reseat when the
    // packed blob / seal centroid drifts (see dynamicSealDrifted).
    if (room.memory.towerSealLocked) return false;
    return hasCachedSealSpots(room);
}

function hubsMatch(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    const set = new Set();
    for (let i = 0; i < a.length; i++) set.add(towerTileKey(a[i].x, a[i].y));
    for (let i = 0; i < b.length; i++) {
        if (!set.has(towerTileKey(b[i].x, b[i].y))) return false;
    }
    return true;
}

function roomUnsafeForTowerMove(room) {
    if (!room) return true;
    try {
        if (isAttackRecoveryMode(room)) return true;
    } catch (e) { /* ignore */
    }
    if (room.memory && room.memory.dangerousAttack) return true;
    const intel = typeof INTEL !== 'undefined' ? INTEL[room.name] : null;
    if (intel && intel.threatLevel) return true;
    const hostiles = room.hostileCreeps || [];
    for (let i = 0; i < hostiles.length; i++) {
        const c = hostiles[i];
        if (!c) continue;
        if (c.hasActiveBodyparts && (c.hasActiveBodyparts(ATTACK)
            || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(WORK))) {
            return true;
        }
    }
    return false;
}

function relocateOffPlanTowers(room, hubs) {
    if (!hubs || !hubs.length) return {destroyed: 0, sitesRemoved: 0};
    const hubSet = new Set();
    for (let i = 0; i < hubs.length; i++) {
        hubSet.add(towerTileKey(hubs[i].x, hubs[i].y));
    }
    let destroyed = 0;
    let sitesRemoved = 0;
    const liveTowers = getLiveTowerStructures(room);
    for (let i = 0; i < liveTowers.length; i++) {
        const t = liveTowers[i];
        if (!t || !t.pos) continue;
        if (hubSet.has(towerTileKey(t.pos.x, t.pos.y))) continue;
        try {
            if (t.destroy() === OK) destroyed++;
        } catch (e) { /* ignore */
        }
    }
    const liveSites = getLiveTowerSites(room);
    for (let i = 0; i < liveSites.length; i++) {
        const s = liveSites[i];
        if (!s || !s.pos) continue;
        if (hubSet.has(towerTileKey(s.pos.x, s.pos.y))) continue;
        try {
            s.remove();
            sitesRemoved++;
        } catch (e) { /* ignore */
        }
    }
    if (destroyed || sitesRemoved) invalidateRoomCaches(room);
    return {destroyed, sitesRemoved};
}

function ensureTowerRamparts(room, hubs) {
    if (!hubs || !hubs.length || isPlannerShadow(room)) return 0;
    let placed = 0;
    for (let i = 0; i < hubs.length; i++) {
        const pos = new RoomPosition(hubs[i].x, hubs[i].y, room.name);
        if (pos.checkForRampart && pos.checkForRampart()) continue;
        const sites = pos.lookFor ? pos.lookFor(LOOK_CONSTRUCTION_SITES) : [];
        if (sites.some(s => s.structureType === STRUCTURE_RAMPART)) continue;
        const structs = pos.lookFor ? pos.lookFor(LOOK_STRUCTURES) : [];
        const hasTower = structs.some(s => s.structureType === STRUCTURE_TOWER)
            || sites.some(s => s.structureType === STRUCTURE_TOWER);
        if (!hasTower) continue;
        try {
            const res = siteBudget.tryPlace(room, 'ramparts', pos, STRUCTURE_RAMPART);
            if (res && res.ok) placed++;
        } catch (e) { /* optional */
        }
    }
    return placed;
}

function stampTowerLayout(room) {
    room.memory.towerLayoutVersion = TOWER_LAYOUT_VERSION;
    room.memory.towerSealRev = perimeterRevForTowers();
    room.memory.towerSealKey = currentSealKey(room);
    if (hasCachedSealSpots(room)) room.memory.towerSealLocked = 1;
    if (room.memory.dynamicLayout) {
        room.memory.towerReseatTick = Game.time + TOWER_RESEAT_COOLDOWN;
    }
}

function ensureTowerHubs(room, options) {
    const opts = options || {};
    if (!resolveHub(room)) {
        return {ok: false, hubs: [], reason: 'no_hub'};
    }

    const existingNow = resolveTowerHubs(room);
    const reseatSpawn = existingNow.length && towerHubsTooCloseToSpawn(room, existingNow);
    const stale = opts.forceSearch || towerLayoutStale(room) || reseatSpawn;
    if (!stale) {
        const existing = existingNow;
        if (existing.length) {
            if (getTowerDeficit(room) > 0) placeTowerSites(room, Math.min(2, getTowerDeficit(room)));
            ensureTowerRamparts(room, existing);
            return {ok: true, hubs: existing.slice(), reason: 'existing'};
        }
        const recovered = recoverTowerHubsFromWorld(room);
        if (recovered.length) {
            commitTowerHubs(room, recovered);
            refreshPerimeterAfterTowerHubs(room);
            stampTowerLayout(room);
            ensureTowerRamparts(room, recovered);
            if (typeof log !== 'undefined' && log.a) {
                log.a(room.name + ': recovered ' + recovered.length + ' tower hub(s) from existing towers', 'PLANNER');
            }
            return {ok: true, hubs: recovered, reason: 'recovered'};
        }
    }

    if (stale && !opts.forceSearch && roomUnsafeForTowerMove(room)) {
        const existing = resolveTowerHubs(room);
        if (existing.length) {
            return {ok: true, hubs: existing.slice(), reason: 'defer_relocate'};
        }
    }

    try {
        const geom = require('planGeomRamparts');
        if (room.memory.perimeterPlanRev !== geom.PERIMETER_PLAN_REV
            && room.controller && room.controller.level >= (typeof BUNKER_LEVEL === 'number' ? BUNKER_LEVEL : 6)) {
            require('planRamparts').recalculateRampartsForRoom(room, undefined, {destroyOffPlan: true});
            room.memory.perimeterPlanRev = geom.PERIMETER_PLAN_REV;
        }
    } catch (e) { /* optional */
    }

    const selected = selectTowerHubs(room);
    const existing = resolveTowerHubs(room);
    if (!selected.hubs.length) {
        if (selected.reason === 'no_seal') {
            if (existing.length) ensureTowerRamparts(room, existing);
            return {
                ok: !!existing.length,
                hubs: existing.slice(),
                reason: 'wait_seal',
                candidateCount: 0,
                alongSeal: false,
            };
        }
        if (existing.length) {
            ensureTowerRamparts(room, existing);
            return {
                ok: true,
                hubs: existing.slice(),
                reason: 'search_empty_keep',
                candidateCount: selected.candidateCount,
                alongSeal: selected.alongSeal,
            };
        }
        return {
            ok: false,
            hubs: [],
            reason: selected.reason || 'no_candidates',
            candidateCount: selected.candidateCount,
            alongSeal: selected.alongSeal,
        };
    }
    const same = hubsMatch(existing, selected.hubs);
    if (!same) commitTowerHubs(room, selected.hubs);

    let relocated = null;
    if (!same && !isPlannerShadow(room) && !roomUnsafeForTowerMove(room)) {
        relocated = relocateOffPlanTowers(room, selected.hubs);
        if (relocated.destroyed && typeof log !== 'undefined' && log.a) {
            log.a(room.name + ': moved towers — destroyed ' + relocated.destroyed
                + ' off-plan tower(s), ' + relocated.sitesRemoved + ' site(s)', 'PLANNER');
        }
        refreshPerimeterAfterTowerHubs(room);
    }
    // Stamp after refresh so the frozen key is the post-tower-wrap seal, not the
    // stamp-ring fallback from a cleared ROOM_RAMPART_SPOTS cache.
    stampTowerLayout(room);
    placeTowerSites(room, 2);
    ensureTowerRamparts(room, selected.hubs);
    if (typeof log !== 'undefined' && log.a && !same) {
        log.a(room.name + ': ' + selected.hubs.length + ' tower hubs along seal (anchors)', 'PLANNER');
    }
    return {
        ok: true,
        hubs: selected.hubs.slice(),
        reason: same ? 'researched_same' : (selected.reason || 'search'),
        candidateCount: selected.candidateCount,
        alongSeal: selected.alongSeal,
        relocated,
    };
}

/** Legacy name — ensure tower hubs exist (writes memory). */
function findTowerHub(room, options) {
    ensureTowerHubs(room, options || {});
}

function ensureAllAnchors(room, options) {
    const opts = options || {};
    const hub = ensureCoreHub(room);
    if (!hub.ok) {
        return {ok: false, hub, towers: null, lab: null};
    }
    const towers = ensureTowerHubs(room, {forceSearch: !!opts.forceTowerSearch});
    const lab = ensureLabHub(room);
    return {ok: true, hub, towers, lab};
}

// ---------------------------------------------------------------------------
// Tower placement (siteBudget only)
// ---------------------------------------------------------------------------

function countMyTowers(room) {
    const list = room.towers || [];
    let n = 0;
    for (let i = 0; i < list.length; i++) {
        const t = list[i];
        if (t && t.my) n++;
    }
    return n;
}

function getTowerDeficit(room) {
    if (!room.controller || !room.controller.my) return 0;
    if (room._towerDeficitTick === Game.time) return room._towerDeficit;
    // Missing towers count even with no hubs — otherwise the room never enters
    // SOFT_LAYOUT. Ignore same-tick pending: createConstructionSite OK on
    // memhack does not mean a site exists, and it was zeroing the deficit.
    const allowed = CONTROLLER_STRUCTURES[STRUCTURE_TOWER][room.controller.level] || 0;
    const current = countMyTowers(room)
        + countLiveRoomConstructionSitesOfType(room.name, STRUCTURE_TOWER);
    const n = Math.max(0, allowed - current);
    room._towerDeficit = n;
    room._towerDeficitTick = Game.time;
    return n;
}

function invalidateRoomCaches(room) {
    if (room._invalidateStructureCaches) room._invalidateStructureCaches();
    invalidateRoomConstructionSiteCache(room);
}

/**
 * Drop idle (then low-progress) roads/barriers in `target` so a tower can take
 * a construction-site slot. Used for both the local room cap and the global 100.
 * @returns {number} sites removed
 */
function removeReclaimableSitesInRoom(target, want) {
    if (want <= 0 || !target) return 0;
    let freed = 0;
    const sites = target.constructionSites || [];
    const removeSites = (list) => {
        for (let i = 0; i < list.length; i++) {
            if (freed >= want) break;
            try {
                if (list[i].remove() === OK) freed++;
            } catch (e) { /* ignore */
            }
        }
    };

    const reclaim = [STRUCTURE_ROAD, STRUCTURE_WALL, STRUCTURE_RAMPART];
    for (let t = 0; t < reclaim.length; t++) {
        if (freed >= want) break;
        const type = reclaim[t];
        removeSites(sites.filter(s => s.structureType === type && !s.progress));
    }
    if (freed < want) {
        const low = sites
            .filter(s =>
                (s.structureType === STRUCTURE_ROAD
                    || s.structureType === STRUCTURE_WALL
                    || s.structureType === STRUCTURE_RAMPART)
                && s.progress > 0
                && s.progress < Math.max(1, (s.progressTotal || 1) * 0.25))
            .sort((a, b) => a.progress - b.progress);
        removeSites(low);
    }
    if (freed) {
        markFreedSiteSlots(target);
        invalidateRoomCaches(target);
    }
    return freed;
}

/**
 * Free a site slot for a tower. Local reclaim first; if this room has nothing
 * to drop and the global cap is full, steal idle roads/barriers from other
 * owned rooms (0 local sites otherwise starve towers forever).
 * @returns {number} sites removed
 */
function freeSiteSlotsForTowers(room, want) {
    if (want <= 0 || isPlannerShadow(room)) return 0;
    if (canPlaceConstructionSite(room)) return 0;

    let freed = removeReclaimableSitesInRoom(room, want);
    if (freed < want && globalConstructionSiteBudget() <= 0) {
        const idle = [];
        const low = [];
        for (const id in Game.constructionSites) {
            const s = Game.constructionSites[id];
            if (!s || !s.pos || s.pos.roomName === room.name) continue;
            const t = s.structureType;
            if (t !== STRUCTURE_ROAD && t !== STRUCTURE_WALL && t !== STRUCTURE_RAMPART) continue;
            if (!s.progress) idle.push(s);
            else if (s.progress < Math.max(1, (s.progressTotal || 1) * 0.25)) low.push(s);
        }
        low.sort((a, b) => a.progress - b.progress);
        const steal = idle.concat(low);
        const stolenFrom = Object.create(null);
        for (let i = 0; i < steal.length && freed < want; i++) {
            try {
                if (steal[i].remove() !== OK) continue;
                freed++;
                stolenFrom[steal[i].pos.roomName] = (stolenFrom[steal[i].pos.roomName] || 0) + 1;
            } catch (e) { /* ignore */
            }
        }
        if (freed) {
            markFreedSiteSlots(room);
            invalidateRoomCaches(room);
            for (const name in stolenFrom) {
                const other = Game.rooms[name];
                if (other) invalidateRoomCaches(other);
                if (typeof log !== 'undefined' && log.a) {
                    log.a(room.name + ' reclaimed ' + stolenFrom[name] + ' site(s) from '
                        + name + ' for towers', 'PLANNER');
                }
            }
        }
    } else if (freed && typeof log !== 'undefined' && log.a) {
        log.a(room.name + ' removed ' + freed + ' site(s) to free slots for towers', 'PLANNER');
    }
    return freed;
}

function towerTileBlockedForPlacement(pos) {
    if (!pos || !pos.lookFor) {
        return !!(pos.checkForAllStructure && pos.checkForAllStructure())
            || !!(pos.checkForConstructionSites && pos.checkForConstructionSites());
    }
    const structs = pos.lookFor(LOOK_STRUCTURES) || [];
    for (let i = 0; i < structs.length; i++) {
        const t = structs[i].structureType;
        if (t === STRUCTURE_ROAD || t === STRUCTURE_RAMPART) continue;
        return true;
    }
    if (typeof LOOK_RUINS !== 'undefined' && pos.lookFor(LOOK_RUINS).length) return true;
    return (pos.lookFor(LOOK_CONSTRUCTION_SITES) || []).length > 0;
}

/**
 * Free a tower hub tile for STRUCTURE_TOWER (parity with spawn clearSpawnTile).
 * Any non-tower site occupies the tile — a progressed rampart/wall site would
 * otherwise block the hub forever. Soft obstacles (extension/container/wall)
 * are destroyed; roads and built ramparts can share the tile.
 * @returns {boolean} true if anything was removed/destroyed
 */
function towerMayClaimExtensionTile(room, pos) {
    const hub = resolveHub(room);
    if (!hub || !pos) return false;
    const terrain = Game.map.getRoomTerrain(room.name);
    const walls = sampleHubWallTiles(room, hub.x, hub.y, terrain);
    if (!walls.length) return false;
    return minDistToWalls(pos.x, pos.y, walls) <= TOWER_SEAL_BAND_MAX;
}

function clearTowerHubBlockers(room, pos) {
    let changed = false;

    const sites = pos.lookFor ? pos.lookFor(LOOK_CONSTRUCTION_SITES) : [];
    for (let i = 0; i < sites.length; i++) {
        const site = sites[i];
        if (site.structureType === STRUCTURE_TOWER) continue;
        try {
            site.remove();
            changed = true;
        } catch (e) { /* ignore */
        }
    }

    const structs = pos.lookFor ? pos.lookFor(LOOK_STRUCTURES) : [];
    for (let i = 0; i < structs.length; i++) {
        const s = structs[i];
        if (s.structureType === STRUCTURE_TOWER) continue;
        if (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_ROAD) continue;
        // Soft obstacles only — do not destroy storage/terminal/spawn on a bad hub tile.
        if (s.structureType !== STRUCTURE_EXTENSION && s.structureType !== STRUCTURE_CONTAINER
            && s.structureType !== STRUCTURE_WALL) {
            continue;
        }
        if (s.structureType === STRUCTURE_EXTENSION && room.memory && room.memory.dynamicLayout
            && !towerMayClaimExtensionTile(room, pos)) {
            continue;
        }
        try {
            if (s.destroy() === OK) {
                changed = true;
                if (typeof log !== 'undefined' && log.a) {
                    log.a(room.name + ': cleared ' + s.structureType + ' on tower hub ('
                        + pos.x + ',' + pos.y + ')', 'PLANNER');
                }
            }
        } catch (e) { /* ignore */
        }
    }

    if (changed) invalidateRoomCaches(room);
    return changed;
}

function placeTowerSites(room, maxPerCall) {
    const limit = maxPerCall === undefined ? 1 : maxPerCall;
    const attempts = [];
    let placed = 0;

    if (!room.controller || !room.controller.my) {
        return {placed: 0, attempts, code: FailureCodes.RCL_GATE};
    }

    let hubs = resolveTowerHubs(room);
    let search = null;
    const coreHub = resolveHub(room);
    if (hubs && hubs.length && towerHubsTooCloseToSpawn(room, hubs)) {
        hubs = [];
    }
    if (!hubs || !hubs.length) {
        search = selectTowerHubs(room);
        if (search.hubs && search.hubs.length) {
            commitTowerHubs(room, search.hubs);
            if (!isPlannerShadow(room)) {
                relocateOffPlanTowers(room, search.hubs);
                refreshPerimeterAfterTowerHubs(room);
            }
            hubs = search.hubs;
        } else {
            return {
                placed: 0,
                attempts,
                code: FailureCodes.PLAN_EMPTY,
                search,
            };
        }
    }
    if (coreHub) {
        const spawnTiles = spawnTilesForTowers(room, coreHub);
        hubs = hubs.filter(h => !tooCloseToSpawn(h.x, h.y, spawnTiles));
        if (!hubs.length) {
            return {placed: 0, attempts, code: FailureCodes.PLAN_EMPTY, reason: 'spawn_clearance'};
        }
    }

    const shadow = isPlannerShadow(room);

    for (let n = 0; n < limit; n++) {
        if (getTowerDeficit(room) <= 0) break;

        let req = siteBudget.request(room, 'towers', 1);
        if (req.allowed < 1 && !shadow) {
            const freed = freeSiteSlotsForTowers(room, 1);
            if (freed > 0) req = siteBudget.request(room, 'towers', 1);
        }
        if (req.allowed < 1) {
            attempts.push({ok: false, code: req.code, budget: true});
            const plan = getPlan(room);
            if (plan && req.code) {
                pushFailure(plan, {
                    code: req.code,
                    layer: 'towers',
                    detail: req,
                    tick: Game.time,
                    source: 'planAnchors.placeTowerSites',
                });
            }
            break;
        }

        let didPlace = false;
        // Try every hub, not just the first `allowed`. At RCL5 only 2 towers
        // are allowed; if those two tiles are extensions the rest were never
        // attempted. Prefer tiles that are already clear — same-tick
        // destroy/remove still occupies the tile on memhack.
        for (let i = 0; i < hubs.length; i++) {
            const x = hubs[i].x;
            const y = hubs[i].y;
            const pos = new RoomPosition(x, y, room.name);
            if (towerTileBlockedForPlacement(pos)) continue;

            if (shadow) {
                attempts.push({ok: true, shadow: true, x, y});
                placed++;
                didPlace = true;
                break;
            }

            const res = siteBudget.tryPlace(room, 'towers', pos, STRUCTURE_TOWER);
            attempts.push({ok: res.ok, result: res.result, code: res.code, x, y, shadow: res.shadow});
            if (res.ok) {
                placed++;
                didPlace = true;
                try {
                    siteBudget.tryPlace(room, 'ramparts', pos, STRUCTURE_RAMPART);
                } catch (e) { /* protective pass retries */
                }
                break;
            }
            if (res.code === FailureCodes.SITE_BUDGET_GLOBAL
                || res.code === FailureCodes.SITE_BUDGET_ROOM
                || res.code === FailureCodes.BUDGET_RESERVED_FOR_HIGHER) {
                break;
            }
        }
        if (didPlace) continue;

        // Clear blocked hubs, then retry once (official destroy is same-tick;
        // memhack may still fail and land the site next tick).
        if (!shadow) {
            const need = Math.max(1, getTowerDeficit(room));
            let cleared = 0;
            for (let i = 0; i < hubs.length && cleared < need; i++) {
                const pos = new RoomPosition(hubs[i].x, hubs[i].y, room.name);
                if (!towerTileBlockedForPlacement(pos)) continue;
                if (clearTowerHubBlockers(room, pos)) cleared++;
            }
            if (cleared) attempts.push({ok: false, code: FailureCodes.TILE_BLOCKED, cleared});
            for (let i = 0; i < hubs.length; i++) {
                const x = hubs[i].x;
                const y = hubs[i].y;
                const pos = new RoomPosition(x, y, room.name);
                if (towerTileBlockedForPlacement(pos)) continue;
                const res = siteBudget.tryPlace(room, 'towers', pos, STRUCTURE_TOWER);
                attempts.push({ok: res.ok, result: res.result, code: res.code, x, y, retry: true});
                if (res.ok) {
                    placed++;
                    didPlace = true;
                    try {
                        siteBudget.tryPlace(room, 'ramparts', pos, STRUCTURE_RAMPART);
                    } catch (e) { /* optional */
                    }
                    break;
                }
            }
        }
        if (!didPlace) break;
    }

    return {placed, shadow: shadow || undefined, attempts, search: search || undefined};
}

/** Legacy API: number of sites placed. */
function placeTowerSitesUpToDeficit(room, maxPerCall) {
    return placeTowerSites(room, maxPerCall).placed || 0;
}

/** Legacy API: place one tower site if possible. */
function buildTowersFromHubs(room) {
    return placeTowerSites(room, 1).placed > 0;
}

function auditTowerHubTiles(room) {
    const hubs = resolveTowerHubs(room);
    const coreHub = resolveHub(room);
    const level = room.controller && room.controller.level;
    const allowed = level ? CONTROLLER_STRUCTURES[STRUCTURE_TOWER][level] : 0;
    const terrain = Game.map.getRoomTerrain(room.name);
    const lastSiteError = room.memory.plannerLastSiteError;
    const search = (!hubs || !hubs.length) ? selectTowerHubs(room) : null;
    return {
        rcl: level,
        allowed,
        coreHub: coreHub ? {x: coreHub.x, y: coreHub.y} : null,
        search: search && {
            reason: search.reason,
            candidateCount: search.candidateCount,
            alongSeal: search.alongSeal,
            emergency: search.emergency,
            found: (search.hubs || []).length,
        },
        current: countMyTowers(room)
            + countLiveRoomConstructionSitesOfType(room.name, STRUCTURE_TOWER),
        pendingSites: countRoomConstructionSitesOfType(room.name, STRUCTURE_TOWER)
            - countLiveRoomConstructionSitesOfType(room.name, STRUCTURE_TOWER),
        siteBudget: roomConstructionSiteBudget(room),
        canPlace: canPlaceConstructionSite(room),
        totalSites: countRoomConstructionSites(room.name),
        hubs: hubs.map(function (h) {
            const x = h.x;
            const y = h.y;
            const pos = new RoomPosition(x, y, room.name);
            const structure = pos.checkForAllStructure && pos.checkForAllStructure();
            const site = pos.checkForConstructionSites && pos.checkForConstructionSites();
            return {
                x,
                y,
                terrain: terrain.get(x, y) === TERRAIN_MASK_WALL ? 'wall' : 'clear',
                structure: structure && structure.structureType,
                site: site && site.structureType,
                siteProgress: site && site.progress,
                blocked: !!(structure || site),
            };
        }),
        lastSiteError: lastSiteError && {
            tick: lastSiteError.tick,
            age: Game.time - lastSiteError.tick,
            structureType: lastSiteError.structureType,
            result: lastSiteError.result,
        },
    };
}

// ---------------------------------------------------------------------------
// Tower layout reset (always budgeted place)
// ---------------------------------------------------------------------------

function getLiveTowerStructures(room) {
    invalidateRoomCaches(room);
    if (room.__nativeFind) {
        try {
            return room.__nativeFind(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_TOWER}}) || [];
        } catch (e) { /* fall through */
        }
    }
    return room.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_TOWER}});
}

function getLiveTowerSites(room) {
    invalidateRoomCaches(room);
    if (room.__nativeFind) {
        try {
            return room.__nativeFind(FIND_CONSTRUCTION_SITES, {filter: {structureType: STRUCTURE_TOWER}}) || [];
        } catch (e) { /* fall through */
        }
    }
    return room.find(FIND_CONSTRUCTION_SITES, {filter: {structureType: STRUCTURE_TOWER}});
}

function wipeTowersInRoom(room) {
    let towers = 0;
    let sites = 0;
    let failed = 0;

    const liveTowers = getLiveTowerStructures(room);
    for (let i = 0; i < liveTowers.length; i++) {
        try {
            if (liveTowers[i].destroy() === OK) towers++;
        } catch (e) {
            failed++;
        }
    }

    const liveSites = getLiveTowerSites(room);
    for (let i = 0; i < liveSites.length; i++) {
        try {
            liveSites[i].remove();
            sites++;
        } catch (e) {
            failed++;
        }
    }

    invalidateRoomCaches(room);
    return {towers, sites, failed};
}

function resetTowerLayoutForRoom(room) {
    if (!room || !room.controller || !room.controller.my) {
        return {roomName: room && room.name, skipped: true, reason: 'not owned'};
    }
    if (!resolveHub(room)) {
        return {roomName: room.name, skipped: true, reason: 'no hub'};
    }
    // Shadow canary: refuse destructive wipe (console must go live first).
    if (isPlannerShadow(room)) {
        return {
            roomName: room.name,
            skipped: true,
            reason: 'shadow',
            hint: "planner.enable(['" + room.name + "']) without shadow, or reset after disable shadow",
        };
    }

    const wiped = wipeTowersInRoom(room);
    const oldTowerHubs = resolveTowerHubs(room).length;
    delete room.memory.towerHubs;
    delete room.memory.towerSealLocked;
    delete room.memory.towerSealKey;
    const planDoc = getPlan(room);
    if (planDoc && planDoc.anchors) {
        planDoc.anchors.towers = [];
    }

    ensureTowerHubs(room, {forceSearch: true});
    const newTowerHubs = resolveTowerHubs(room).length;

    syncAnchorsToPlan(room);
    const res = placeTowerSites(room, getTowerDeficit(room));
    const towerSitesPlaced = (res && res.placed) || 0;

    let ramparts = null;
    try {
        ramparts = require('planRamparts').recalculateRampartsForRoom(room);
    } catch (e) {
        ramparts = {error: (e && e.message) || String(e)};
    }

    stampTowerLayout(room);
    ensureTowerRamparts(room, resolveTowerHubs(room));
    if (typeof log !== 'undefined' && log.a) {
        log.a(room.name + ' tower layout reset: destroyed ' + wiped.towers + ' tower(s), '
            + wiped.sites + ' site(s), hubs ' + oldTowerHubs + '->' + newTowerHubs
            + ', placed ' + towerSitesPlaced + ' site(s) [budget], ramparts '
            + (ramparts && ramparts.spots != null ? ramparts.spots : '?') + ' spot(s)');
    }

    return {
        roomName: room.name,
        wiped,
        oldTowerHubs,
        newTowerHubs,
        towerHubs: room.memory.towerHubs,
        towerSitesPlaced,
        towerPlacePath: 'budget',
        ramparts,
        towerLayoutVersion: TOWER_LAYOUT_VERSION,
    };
}

function queueTowerLayoutReset(roomNames) {
    const pending = (Memory.towerLayoutResetQueue || []).slice();
    const seen = new Set(pending);
    let added = 0;
    const list = Array.isArray(roomNames) ? roomNames : (roomNames ? [roomNames] : []);
    for (let i = 0; i < list.length; i++) {
        const name = list[i];
        if (!name || seen.has(name)) continue;
        seen.add(name);
        pending.push(name);
        added++;
    }
    if (pending.length) Memory.towerLayoutResetQueue = pending;
    else delete Memory.towerLayoutResetQueue;
    return {queued: pending.length, added};
}

/** Drop no-vision queue entries after this many consecutive misses. */
const TOWER_RESET_NO_VISION_MAX = 50;

function processTowerLayoutResetQueue() {
    const queue = Memory.towerLayoutResetQueue;
    if (!queue || !queue.length) return null;

    const roomName = queue.shift();
    const room = Game.rooms[roomName];
    if (!room) {
        // Temporary no-vision: requeue at end; drop after many misses.
        if (!Memory._plannerTowerResetMiss) Memory._plannerTowerResetMiss = {};
        const misses = (Memory._plannerTowerResetMiss[roomName] || 0) + 1;
        Memory._plannerTowerResetMiss[roomName] = misses;
        if (misses < TOWER_RESET_NO_VISION_MAX) {
            queue.push(roomName);
        } else {
            delete Memory._plannerTowerResetMiss[roomName];
        }
        if (queue.length) Memory.towerLayoutResetQueue = queue;
        else delete Memory.towerLayoutResetQueue;
        return {
            roomName,
            error: 'no vision',
            requeued: misses < TOWER_RESET_NO_VISION_MAX,
            misses,
            remaining: queue.length,
        };
    }

    if (Memory._plannerTowerResetMiss) {
        delete Memory._plannerTowerResetMiss[roomName];
    }
    if (!queue.length) delete Memory.towerLayoutResetQueue;
    else Memory.towerLayoutResetQueue = queue;

    const result = resetTowerLayoutForRoom(room);
    result.remaining = queue.length;
    return result;
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

function inspectAnchors(room) {
    const plan = getPlan(room);
    const validateUntil = room.memory.hubExtensionValidateTick || 0;
    const labFailUntil = room.memory.labHubSearchFailed || 0;
    const resolved = {
        hub: resolveHub(room),
        towers: resolveTowerHubs(room),
        lab: resolveLabHub(room),
    };
    return {
        room: room.name,
        legacy: {
            bunkerHub: room.memory.bunkerHub || null,
            dynamicLayout: !!room.memory.dynamicLayout,
            towerHubs: room.memory.towerHubs || null,
            labHub: room.memory.labHub || null,
            labHubPartial: !!room.memory.labHubPartial,
            towerLayoutVersion: room.memory.towerLayoutVersion,
        },
        plan: plan ? {
            mode: plan.mode,
            anchors: plan.anchors,
            authority: plan.meta && plan.meta.authority,
        } : null,
        /** Effective anchors used for placement (plan first). */
        resolved,
        hubValid: !!resolved.hub,
        hubValidate: {
            cooldownUntil: validateUntil || null,
            onCooldown: validateUntil > Game.time,
            remaining: validateUntil > Game.time ? validateUntil - Game.time : 0,
            period: HUB_EXTENSION_VALIDATE_COOLDOWN,
        },
        labSearch: {
            failedUntil: labFailUntil || null,
            onCooldown: labFailUntil > Game.time,
            remaining: labFailUntil > Game.time ? labFailUntil - Game.time : 0,
        },
        towerLayout: {
            version: room.memory.towerLayoutVersion,
            target: TOWER_LAYOUT_VERSION,
            stale: towerLayoutStale(room),
            locked: !!room.memory.towerSealLocked,
            resetQueue: typeof Memory !== 'undefined' ? (Memory.towerLayoutResetQueue || []) : [],
            pendingReset: typeof Memory !== 'undefined'
                && Array.isArray(Memory.towerLayoutResetQueue)
                && Memory.towerLayoutResetQueue.indexOf(room.name) !== -1,
        },
        towerDeficit: getTowerDeficit(room),
        canPlace: canPlaceConstructionSite(room),
        towerSites: countRoomConstructionSitesOfType(room.name, STRUCTURE_TOWER),
        towersBuilt: room.towers ? room.towers.length : 0,
        hubTiles: auditTowerHubTiles(room),
    };
}

module.exports = {
    TOWER_LAYOUT_VERSION,
    TOWER_HUB_MIN_DIST,
    TOWER_HUB_MAX_DIST,
    MAX_TOWER_HUBS,
    HUB_EXTENSION_VALIDATE_COOLDOWN,
    // Dual-write / plan-first
    syncAnchorsToPlan,
    commitCoreHub,
    commitTowerHubs,
    commitLabHub,
    clearLabHubAnchor,
    resolveHub,
    resolveTowerHubs,
    resolveLabHub,
    // Hub
    findHub,
    hubCheck,
    findCoreHub,
    ensureCoreHub,
    validateHubExtensionCapacity,
    // Lab
    findLabHub,
    ensureLabHub,
    // Towers
    selectTowerHubs,
    recoverTowerHubsFromWorld,
    ensureTowerHubs,
    findTowerHub,
    ensureAllAnchors,
    getTowerDeficit,
    placeTowerSites,
    placeTowerSitesUpToDeficit,
    buildTowersFromHubs,
    auditTowerHubTiles,
    clearTowerHubBlockers,
    resetTowerLayoutForRoom,
    queueTowerLayoutReset,
    processTowerLayoutResetQueue,
    inspectAnchors,
};
