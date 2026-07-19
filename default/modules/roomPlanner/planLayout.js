/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Bunker layout and missing-structure placement.
 */

const {bunkerTemplate, coreTemplate} = require('planTemplates');

const {
    isAttackRecoveryMode,
    shouldSkipStructure,
    safeStructureMy,
    canPlaceConstructionSite,
    tryCreateConstructionSite
} = require('planUtils');

const {buildTowersFromHubs} = require('planHub');

const {
    buildSourceExtensions,
    placeRoomExtensions,
    getExtensionDeficit,
    ensureExtensionClearance,
    ensureDynamicSpecialStructures,
} = require('planExtensions');

const {rampartBuilder} = require('planRamparts');

const {auxiliaryBuilding} = require('planAuxiliary');

function getStructureCounts(room) {
    const counts = {};
    room.structures.forEach(s => counts[s.structureType] = (counts[s.structureType] || 0) + 1);
    room.constructionSites.forEach(s => counts[s.structureType] = (counts[s.structureType] || 0) + 1);
    return counts;
}

const LAYOUT_SKIP_TYPES = [STRUCTURE_CONTAINER, STRUCTURE_RAMPART, STRUCTURE_WALL, STRUCTURE_ROAD];

function hasPendingLayoutStructures(room) {
    const existingCounts = getStructureCounts(room);
    const tmpl = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
    const skipTypes = room.memory.dynamicLayout ? [...LAYOUT_SKIP_TYPES, STRUCTURE_EXTENSION] : LAYOUT_SKIP_TYPES;
    const level = room.controller.level;
    if (tmpl.some(s =>
        !skipTypes.includes(s.structureType) &&
        CONTROLLER_STRUCTURES[s.structureType][level] > (existingCounts[s.structureType] || 0)
    )) return true;
    // Dynamic rooms also need factory / power spawn / nuker / observer (not in core stamps).
    if (room.memory.dynamicLayout && level >= 7) {
        for (const type of [STRUCTURE_FACTORY, STRUCTURE_POWER_SPAWN, STRUCTURE_NUKER, STRUCTURE_OBSERVER]) {
            const allowed = CONTROLLER_STRUCTURES[type][level] || 0;
            if (allowed > (existingCounts[type] || 0)) return true;
        }
    }
    return false;
}

function hasSpawnOrSpawnSite(room) {
    if (room.spawns && room.spawns.length) return true;
    return room.constructionSites.some(s => s.structureType === STRUCTURE_SPAWN);
}

function getSpawnAnchor(room) {
    const hub = room.memory.bunkerHub;
    if (!hub || hub.x === undefined || hub.y === undefined) return null;
    const tmpl = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
    const spawnEntry = tmpl.find(s => s.structureType === STRUCTURE_SPAWN);
    if (!spawnEntry || !spawnEntry.pos || !spawnEntry.pos.length) return null;
    const off = spawnEntry.pos[0];
    const x = hub.x + off.x;
    const y = hub.y + off.y;
    if (x < 1 || x > 48 || y < 1 || y > 48) return null;
    return new RoomPosition(x, y, room.name);
}

function invalidateRoomSiteCache(room) {
    room._constructionSites = undefined;
    room._constructionSites_ts = undefined;
    if (room._invalidateStructureCaches) room._invalidateStructureCaches();
}

/**
 * Free construction-site budget so a spawn can be placed.
 * Prefer removing extension sites (including in-progress) — a room without a spawn
 * cannot use those extensions for local production anyway.
 */
function freeSitesForSpawn(room) {
    if (canPlaceConstructionSite(room)) return 0;
    let removed = 0;
    const prefer = [STRUCTURE_EXTENSION, STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_RAMPART, STRUCTURE_WALL];
    for (const type of prefer) {
        // Snapshot — remove() mutates the live constructionSites collection.
        const sites = room.constructionSites.filter(s => s.structureType === type);
        for (const site of sites) {
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
 * Ensure a spawn construction site exists for rooms with a hub but no spawn.
 * Places the spawn directly (no rampart gate) — ramparts can go on top later.
 * Clears wrong sites/structures on the spawn tile that would silently block placement.
 */
function ensureSpawnSite(room) {
    if (room.spawns && room.spawns.length) return {ok: true, reason: 'spawn-exists'};
    if (room.constructionSites.some(s => s.structureType === STRUCTURE_SPAWN)) {
        return {ok: true, reason: 'spawn-site-exists'};
    }

    const pos = getSpawnAnchor(room);
    if (!pos) {
        const reason = !(room.memory.bunkerHub && room.memory.bunkerHub.x) ? 'no-hub' : 'no-spawn-anchor';
        room.memory.plannerSpawnBlocked = {tick: Game.time, reason};
        log.a(`${room.name}: spawn blocked (${reason})`, 'PLANNER');
        return {ok: false, reason};
    }

    // Clear construction sites on the spawn tile (wrong type blocks forever).
    for (const site of pos.lookFor(LOOK_CONSTRUCTION_SITES)) {
        if (site.structureType === STRUCTURE_SPAWN) return {ok: true, reason: 'spawn-site-exists'};
        try {
            site.remove();
        } catch (e) { /* ignore */
        }
    }

    // Destroy obstacle structures that are not rampart/road (e.g. misplaced extension).
    for (const s of pos.lookFor(LOOK_STRUCTURES)) {
        if (s.structureType === STRUCTURE_SPAWN) return {ok: true, reason: 'spawn-exists'};
        if (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_ROAD) continue;
        try {
            s.destroy();
            log.a(`${room.name}: destroyed ${s.structureType} on spawn tile (${pos.x},${pos.y})`, 'PLANNER');
        } catch (e) { /* ignore */
        }
    }
    invalidateRoomSiteCache(room);

    freeSitesForSpawn(room);
    if (!canPlaceConstructionSite(room)) {
        room.memory.plannerSpawnBlocked = {tick: Game.time, reason: 'no-site-budget', x: pos.x, y: pos.y};
        log.a(`${room.name}: spawn blocked (no site budget) at (${pos.x},${pos.y})`, 'PLANNER');
        return {ok: false, reason: 'no-site-budget'};
    }

    if (pos.checkForWall && pos.checkForWall()) {
        room.memory.plannerSpawnBlocked = {tick: Game.time, reason: 'wall', x: pos.x, y: pos.y};
        log.a(`${room.name}: spawn blocked (terrain wall) at (${pos.x},${pos.y})`, 'PLANNER');
        return {ok: false, reason: 'wall'};
    }

    const result = tryCreateConstructionSite(pos, STRUCTURE_SPAWN);
    if (result === OK) {
        delete room.memory.plannerSpawnBlocked;
        log.a(`${room.name}: placed spawn site at (${pos.x},${pos.y})`, 'PLANNER');
        return {ok: true, reason: 'placed', x: pos.x, y: pos.y};
    }

    room.memory.plannerSpawnBlocked = {
        tick: Game.time,
        reason: 'create-failed',
        result,
        x: pos.x,
        y: pos.y,
    };
    log.a(`${room.name}: spawn site create failed (${result}) at (${pos.x},${pos.y})`, 'PLANNER');
    return {ok: false, reason: 'create-failed', result};
}

function buildMissingStructures(room, level) {
    // Placement priority: tower → spawn → extensions / rest of layout.
    buildTowersFromHubs(room);

    // Always try to land a spawn before anything that consumes site budget or builder time.
    if (!(room.spawns && room.spawns.length)) {
        ensureSpawnSite(room);
    }

    // No extensions until a spawn (or spawn site) exists.
    if (!hasSpawnOrSpawnSite(room)) {
        room.memory.plannerExtensionSkip = {tick: Game.time, reason: 'no-spawn-or-site'};
        return;
    }

    // Extensions before the rest of bunker/core stamps so labs/links/etc. cannot
    // fill the room site cap and leave energy capacity stuck after a wipe.
    ensureExtensionClearance(room);
    if (level >= 2 && getExtensionDeficit(room) > 0) {
        placeRoomExtensions(room);
    }

    const existingCounts = getStructureCounts(room);
    const tmpl = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
    const skipTypes = room.memory.dynamicLayout
        ? [...LAYOUT_SKIP_TYPES, STRUCTURE_EXTENSION]
        : level < 6 ? [...LAYOUT_SKIP_TYPES, STRUCTURE_LINK] : LAYOUT_SKIP_TYPES;
    const countCheck = tmpl.filter(s =>
        !skipTypes.includes(s.structureType) &&
        CONTROLLER_STRUCTURES[s.structureType][level] > (existingCounts[s.structureType] || 0)
    );
    if (countCheck && countCheck.length) buildFromLayout(room, countCheck);

    // Dynamic rooms have no bunker stamps for factory / power spawn / nuker / observer —
    // claim the closest extension tiles to the hub (destroying extensions if needed).
    if (room.memory.dynamicLayout && level >= 7) {
        ensureDynamicSpecialStructures(room);
    }
}

function buildAuxiliaryStructures(room) {
    let builtSpawn = room.spawns[0];
    if (builtSpawn) auxiliaryBuilding(room);
}

function buildFromLayout(room, countCheck) {
    const hub = room.hub;
    if (!hub) return;
    const initialSpawn = _.find(Game.structures, s => s.structureType === STRUCTURE_SPAWN && safeStructureMy(s));
    const roomSpawn = room.spawns[0];
    let filter = [];

    const tmpl = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
    if (room.controller.level === 1 && !initialSpawn) {
        filter = tmpl.filter(s => s.structureType === STRUCTURE_SPAWN);
    } else if (room.controller.level >= 5 && isAttackRecoveryMode(room)) {
        room.constructionSites.filter(s => ![STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_TERMINAL, STRUCTURE_RAMPART, STRUCTURE_WALL].includes(s.structureType) && !s.progress).forEach(s => s.remove());
        filter = tmpl.filter(s => [STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_TERMINAL].includes(s.structureType));
        rampartBuilder(room, tmpl);
    } else if (!roomSpawn) {
        // Spawn placement is handled by ensureSpawnSite before buildFromLayout.
        ensureSpawnSite(room);
        return;
    } else {
        filter = countCheck.filter(s => CONTROLLER_STRUCTURES[s.structureType][room.controller.level]);
    }

    if (filter.length) {
        buildSourceExtensions(room);
        for (const structure of filter) {
            if (structure.structureType === STRUCTURE_EXTENSION) continue;
            if (shouldSkipStructure(room, structure)) continue;
            for (const buildPos of structure.pos) {
                const pos = new RoomPosition(hub.x + buildPos.x, hub.y + buildPos.y, room.name);
                if (!pos.checkForConstructionSites() && !pos.checkForAllStructure()) {
                    if (!canPlaceConstructionSite(room)) return;
                    tryCreateConstructionSite(pos, structure.structureType);
                }
            }
        }

        if (room.memory.protoStorage && room.controller.level >= 4) {
            const protoStorage = Game.getObjectById(room.memory.protoStorage);
            if (protoStorage) protoStorage.destroy();
            room.memory.protoStorage = undefined;
        }
    }
}

module.exports = {
    buildMissingStructures,
    buildAuxiliaryStructures,
    hasPendingLayoutStructures,
    ensureSpawnSite,
    getSpawnAnchor,
};