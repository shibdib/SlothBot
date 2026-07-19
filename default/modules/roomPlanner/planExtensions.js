/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Dynamic and source-adjacent extension placement.
 */

const {extensionPositionCache, dynamicLayoutCache} = require('planState');

const {bunkerTemplate, coreTemplate} = require('planTemplates');

const {invalidateRampartSpots, recalculateRampartsForRoom} = require('planRamparts');
const {
    canPlaceConstructionSite,
    tryCreateConstructionSite,
    roomConstructionSiteBudget,
    invalidateRoomConstructionSiteCache,
} = require('planUtils');

const EXTENSION_BATCH_MAX = 3;
const EXTENSION_BATCH_RUSH = 5;
// Dynamic extension clearances (Chebyshev / getRangeTo).
const EXTENSION_EXIT_CLEARANCE = 5;
const EXTENSION_SOURCE_CLEARANCE = 2;
const EXTENSION_CONTROLLER_CLEARANCE = 3;
const EXTENSION_MINERAL_CLEARANCE = 2;
// Keep ring around spawns open so new creeps can spawn onto a free tile.
const EXTENSION_SPAWN_CLEARANCE = 1;
// Legacy alias used by older call sites / audits.
const EXTENSION_ANCHOR_CLEARANCE = EXTENSION_SOURCE_CLEARANCE;
// v6: per-anchor clearances + spawn apron.
const EXTENSION_LAYOUT_VERSION = 6;

const DYNAMIC_EXTENSION_TARGET = 60;
const DYNAMIC_EXTENSION_CANDIDATE_CAP = 120;
const CARDINALS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const OCTALS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

/**
 * While extension deficit is above this, dynamic rooms:
 *  - do not reserve hub tiles for factory/powerSpawn/nuker/observer
 *  - do not place those specials (or destroy extensions for them)
 *  - may cancel idle special construction sites to free the room site cap
 * Energy capacity recovery beats late-game singles after a wipe.
 */
const DYNAMIC_SPECIAL_EXTENSION_DEFICIT_GATE = 5;

/**
 * Late-game singles for dynamic (non-bunker) rooms.
 * Assigned to the N closest checkerboard tiles to the hub (replacing extension slots).
 * Order is stable so rebuilds keep the same tiles. Factory is first (RCL 7).
 */
const DYNAMIC_SPECIAL_STRUCTURES = [
    {structureType: STRUCTURE_FACTORY, minRcl: 7},
    {structureType: STRUCTURE_POWER_SPAWN, minRcl: 8},
    {structureType: STRUCTURE_NUKER, minRcl: 8},
    {structureType: STRUCTURE_OBSERVER, minRcl: 8},
];

const DYNAMIC_SPECIAL_SITE_TYPES = DYNAMIC_SPECIAL_STRUCTURES.map(d => d.structureType);

/** True when wipe/recovery should prefer extensions over dynamic specials. */
function shouldDeferDynamicSpecials(room) {
    return !!(room && room.memory && room.memory.dynamicLayout &&
        getExtensionDeficit(room) > DYNAMIC_SPECIAL_EXTENSION_DEFICIT_GATE);
}

/**
 * Drop only the extension plan (keep special slot packing stable across deficit swings).
 */
function clearDynamicExtensionPlanOnly(room) {
    delete room.memory.dynamicExtensionsPacked;
    delete room.memory.dynamicCorridorPacked;
    delete room.memory.dynamicExtensionsVersion;
    delete dynamicLayoutCache[room.name];
    delete extensionPositionCache[room.name];
}

/**
 * When specials are deferred, hub tiles they held must re-enter the extension plan.
 * When deficit recovers, plan must exclude those tiles again. One regen per transition.
 */
function syncDynamicPlanWithSpecialDeferral(room) {
    if (!room.memory.dynamicLayout) return;
    const defer = shouldDeferDynamicSpecials(room);
    const flagged = !!room.memory.dynamicExtPlanAllowsSpecialTiles;
    if (defer && !flagged) {
        clearDynamicExtensionPlanOnly(room);
        room.memory.dynamicExtPlanAllowsSpecialTiles = 1;
    } else if (!defer && flagged) {
        clearDynamicExtensionPlanOnly(room);
        delete room.memory.dynamicExtPlanAllowsSpecialTiles;
    }
}

function unpackPackedTiles(packed) {
    return packed.map(n => ({x: n % 50, y: Math.floor(n / 50)}));
}

function packTiles(tiles) {
    return tiles.map(p => p.x + p.y * 50);
}

function addChebyshevRing(excluded, cx, cy, radius) {
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
            const x = cx + dx;
            const y = cy + dy;
            if (x < 0 || x > 49 || y < 0 || y > 49) continue;
            excluded.add(`${x},${y}`);
        }
    }
}

function buildLayoutExcluded(room, hubOverride) {
    const hub = hubOverride || room.memory.bunkerHub;
    if (!hub || hub.x === undefined) return new Set();
    const tmpl = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
    const excluded = new Set([`${hub.x},${hub.y}`]);
    for (const entry of tmpl) {
        if (entry.structureType === STRUCTURE_EXTENSION) continue;
        for (const {x, y} of entry.pos) {
            const sx = hub.x + x;
            const sy = hub.y + y;
            excluded.add(`${sx},${sy}`);
            // Spawn stamps: keep apron clear so creeps can spawn (even before spawn exists).
            if (entry.structureType === STRUCTURE_SPAWN && room.memory.dynamicLayout) {
                addChebyshevRing(excluded, sx, sy, EXTENSION_SPAWN_CLEARANCE);
            }
        }
    }
    // Built spawns (any layout): apron for spawn egress.
    if (room.memory.dynamicLayout) {
        for (const spawn of room.spawns || []) {
            addChebyshevRing(excluded, spawn.pos.x, spawn.pos.y, EXTENSION_SPAWN_CLEARANCE);
        }
        for (const site of room.constructionSites || []) {
            if (site.structureType !== STRUCTURE_SPAWN) continue;
            addChebyshevRing(excluded, site.pos.x, site.pos.y, EXTENSION_SPAWN_CLEARANCE);
        }
    }
    // Dynamic rooms: keep special-structure slots free of extensions.
    if (room.memory.dynamicLayout && !hubOverride) {
        for (const key of getDynamicSpecialReservedKeys(room)) excluded.add(key);
    }
    return excluded;
}

function isWithinExitClearance(pos) {
    const exit = pos.findClosestByRange(FIND_EXIT);
    return exit && pos.getRangeTo(exit) <= EXTENSION_EXIT_CLEARANCE;
}

/**
 * @returns {string|null} violation reason, or null if clear of anchors
 */
function getAnchorClearanceViolation(room, pos) {
    if (room.controller && pos.getRangeTo(room.controller) <= EXTENSION_CONTROLLER_CLEARANCE) {
        return 'nearController';
    }
    if (room.mineral && pos.getRangeTo(room.mineral) <= EXTENSION_MINERAL_CLEARANCE) {
        return 'nearMineral';
    }
    for (const source of room.sources || []) {
        if (pos.getRangeTo(source) <= EXTENSION_SOURCE_CLEARANCE) return 'nearSource';
    }
    for (const spawn of room.spawns || []) {
        if (pos.getRangeTo(spawn) <= EXTENSION_SPAWN_CLEARANCE) return 'nearSpawn';
    }
    for (const site of room.constructionSites || []) {
        if (site.structureType !== STRUCTURE_SPAWN) continue;
        if (pos.getRangeTo(site) <= EXTENSION_SPAWN_CLEARANCE) return 'nearSpawn';
    }
    // Planned spawn stamps (dynamic core) before structure exists.
    const hub = room.memory.bunkerHub;
    if (hub && room.memory.dynamicLayout) {
        const tmpl = coreTemplate;
        const spawnEntry = tmpl.find(s => s.structureType === STRUCTURE_SPAWN);
        if (spawnEntry) {
            for (const p of spawnEntry.pos) {
                const sx = hub.x + p.x;
                const sy = hub.y + p.y;
                if (Math.max(Math.abs(pos.x - sx), Math.abs(pos.y - sy)) <= EXTENSION_SPAWN_CLEARANCE) {
                    return 'nearSpawn';
                }
            }
        }
    }
    return null;
}

/** @deprecated prefer getAnchorClearanceViolation for reason codes */
function isWithinAnchorClearance(room, pos) {
    return !!getAnchorClearanceViolation(room, pos);
}

function getExtensionClearanceViolation(room, pos, excluded) {
    if (!excluded) excluded = buildLayoutExcluded(room);
    if (excluded.has(`${pos.x},${pos.y}`)) return 'bunkerCore';
    if (!room.memory.dynamicLayout) return null;
    if (isWithinExitClearance(pos)) return 'nearExit';
    return getAnchorClearanceViolation(room, pos);
}

function classifyExtensionTile(room, pos, excluded) {
    if (pos.checkForWall()) return 'wall';
    // ignoreWall + ignoreCreep — creeps must not block construction planning.
    if (pos.checkForImpassible(true, true)) return 'impassible';
    if (pos.checkForConstructionSites()) return 'site';
    if (pos.checkForAllStructure()) return 'structure';
    const violation = getExtensionClearanceViolation(room, pos, excluded);
    if (violation) return violation;
    return 'ok';
}


function classifySourceAccessTile(room, pos) {
    if (pos.checkForWall()) return false;
    if (pos.checkForImpassible()) return false;
    if (pos.checkForConstructionSites()) return false;
    if (pos.checkForAllStructure()) return false;
    return true;
}

function getExtensionDeficit(room) {
    if (!room.controller) return 0;
    const needed = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] || 0;
    const existing = room.extensions.length +
        room.constructionSites.filter(s => s.structureType === STRUCTURE_EXTENSION).length;
    return Math.max(0, needed - existing);
}

function getExtensionBatchMax(room) {
    if (!room || room.storage || !room.controller) return EXTENSION_BATCH_MAX;
    if (room.controller.level > 5) return EXTENSION_BATCH_MAX;
    return getExtensionDeficit(room) > 5 ? EXTENSION_BATCH_RUSH : EXTENSION_BATCH_MAX;
}

function getExtensionPlacementLimit(room) {
    return Math.min(getExtensionDeficit(room), roomConstructionSiteBudget(room), getExtensionBatchMax(room));
}

/**
 * Free construction-site slots so extensions can place after a wipe.
 * Prefer idle roads/barriers/links — never touch spawn/tower/terminal/extension sites.
 * If still blocked and deficit is large, also cancel low-progress barrier sites
 * and idle dynamic specials (factory/powerSpawn/nuker/observer).
 * @returns {number} sites removed
 */
function freeSiteSlotsForExtensions(room, want) {
    if (want <= 0 || canPlaceConstructionSite(room)) return 0;
    let freed = 0;
    const removeSites = (sites) => {
        for (const site of sites) {
            if (freed >= want) break;
            try {
                if (site.remove() === OK) freed++;
            } catch (e) { /* ignore */
            }
        }
    };
    // Pass 1: idle non-critical sites.
    const preferIdle = [STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_WALL, STRUCTURE_RAMPART, STRUCTURE_LINK];
    for (const type of preferIdle) {
        if (freed >= want) break;
        removeSites(room.constructionSites.filter(s => s.structureType === type && !s.progress));
    }
    // Pass 1b: large extension deficit — reclaim idle dynamic specials (factory etc.).
    if (freed < want && shouldDeferDynamicSpecials(room)) {
        for (const type of DYNAMIC_SPECIAL_SITE_TYPES) {
            if (freed >= want) break;
            removeSites(room.constructionSites.filter(s => s.structureType === type && !s.progress));
        }
    }
    // Pass 2: large extension deficit — reclaim barrier slots even if slightly progressed.
    if (freed < want && getExtensionDeficit(room) > DYNAMIC_SPECIAL_EXTENSION_DEFICIT_GATE) {
        const barriers = room.constructionSites
            .filter(s =>
                (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) &&
                s.progress < Math.max(1, (s.progressTotal || 1) * 0.25))
            .sort((a, b) => a.progress - b.progress);
        removeSites(barriers);
    }
    if (freed) {
        invalidateRoomConstructionSiteCache(room);
        if (room._invalidateStructureCaches) room._invalidateStructureCaches();
        log.a(`${room.name} removed ${freed} site(s) to free slots for extensions`, 'PLANNER');
    }
    return freed;
}

function recordExtensionSkip(room, reason, extra) {
    room.memory.plannerExtensionSkip = {
        tick: Game.time,
        reason,
        deficit: getExtensionDeficit(room),
        budget: roomConstructionSiteBudget(room),
        ...(extra || {}),
    };
}

function clearDynamicLayoutMemory(room) {
    delete room.memory.dynamicExtensionsPacked;
    delete room.memory.dynamicCorridorPacked;
    delete room.memory.dynamicExtensionsVersion;
    delete room.memory.dynamicSpecialPacked;
    delete room.memory.dynamicSpecialVersion;
    delete dynamicLayoutCache[room.name];
    delete extensionPositionCache[room.name];
}

function countOwnedOrSites(room, structureType) {
    let n = 0;
    for (const s of room.structures) {
        if (s.structureType === structureType) n++;
    }
    for (const s of room.constructionSites) {
        if (s.structureType === structureType) n++;
    }
    return n;
}

function structureExistsElsewhere(room, structureType, x, y) {
    for (const s of room.structures) {
        if (s.structureType === structureType && (s.pos.x !== x || s.pos.y !== y)) return true;
    }
    for (const s of room.constructionSites) {
        if (s.structureType === structureType && (s.pos.x !== x || s.pos.y !== y)) return true;
    }
    return false;
}

/**
 * Pick the N closest extension-pattern tiles to the hub for late-game specials.
 * Uses the same flood as dynamic extensions (walkable, not core-template reserved).
 */
function computeDynamicSpecialSlotTiles(room) {
    const hub = room.hub || room.memory.bunkerHub;
    if (!hub || hub.x === undefined) return [];
    const hubPos = room.hub || new RoomPosition(hub.x, hub.y, room.name);
    // Exclude core template only — do not call buildLayoutExcluded (would recurse into specials).
    const tmpl = coreTemplate;
    const excluded = new Set([`${hub.x},${hub.y}`]);
    for (const entry of tmpl) {
        if (entry.structureType === STRUCTURE_EXTENSION) continue;
        for (const {x, y} of entry.pos) excluded.add(`${hub.x + x},${hub.y + y}`);
    }
    const terrain = Game.map.getRoomTerrain(room.name);
    const candidates = [];
    const visited = new Set([`${hub.x},${hub.y}`]);
    const queue = [{x: hub.x, y: hub.y}];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

    while (queue.length && candidates.length < 40) {
        const {x, y} = queue.shift();
        for (const [dx, dy] of dirs) {
            const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
            if (visited.has(key) || nx < 2 || nx > 47 || ny < 2 || ny > 47) continue;
            visited.add(key);
            if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) continue;
            queue.push({x: nx, y: ny});
            if (excluded.has(key)) continue;
            if ((nx + ny) % 2 !== 0) continue; // same checkerboard as extensions
            const pos = new RoomPosition(nx, ny, room.name);
            // Allow tiles that currently have an extension (we will replace them).
            if (pos.checkForWall()) continue;
            if (isWithinExitClearance(pos)) continue;
            if (isWithinAnchorClearance(room, pos)) continue;
            const blocking = pos.lookFor(LOOK_STRUCTURES).find(s =>
                s.structureType !== STRUCTURE_ROAD &&
                s.structureType !== STRUCTURE_RAMPART &&
                s.structureType !== STRUCTURE_EXTENSION &&
                s.structureType !== STRUCTURE_CONTAINER);
            if (blocking) continue;
            candidates.push({
                x: nx, y: ny,
                range: pos.getRangeTo(hubPos),
            });
        }
    }

    candidates.sort((a, b) => a.range - b.range || a.y - b.y || a.x - b.x);
    return candidates.slice(0, DYNAMIC_SPECIAL_STRUCTURES.length).map(c => ({x: c.x, y: c.y}));
}

function getDynamicSpecialSlotTiles(room) {
    if (!room.memory.dynamicLayout) return [];
    if (room.memory.dynamicSpecialPacked && room.memory.dynamicSpecialVersion === EXTENSION_LAYOUT_VERSION) {
        const tiles = unpackPackedTiles(room.memory.dynamicSpecialPacked);
        if (tiles.length >= DYNAMIC_SPECIAL_STRUCTURES.length) return tiles.slice(0, DYNAMIC_SPECIAL_STRUCTURES.length);
    }
    const tiles = computeDynamicSpecialSlotTiles(room);
    if (tiles.length) {
        room.memory.dynamicSpecialPacked = packTiles(tiles);
        room.memory.dynamicSpecialVersion = EXTENSION_LAYOUT_VERSION;
    }
    return tiles;
}

/**
 * Assign each special type to a reserved tile. If that type already exists elsewhere
 * (e.g. observer on hub from coreTemplate), the tile is not reserved for extensions.
 */
function getDynamicSpecialAssignments(room) {
    if (!room.memory.dynamicLayout) return [];
    const tiles = getDynamicSpecialSlotTiles(room);
    const assignments = [];
    for (let i = 0; i < DYNAMIC_SPECIAL_STRUCTURES.length; i++) {
        const def = DYNAMIC_SPECIAL_STRUCTURES[i];
        const tile = tiles[i];
        if (!tile) break;
        assignments.push({
            structureType: def.structureType,
            minRcl: def.minRcl,
            x: tile.x,
            y: tile.y,
        });
    }
    return assignments;
}

function getDynamicSpecialReservedKeys(room) {
    const keys = new Set();
    if (!room.memory.dynamicLayout) return keys;
    // During extension recovery, do not hold hub tiles for specials that are not needed yet.
    if (shouldDeferDynamicSpecials(room)) return keys;
    for (const a of getDynamicSpecialAssignments(room)) {
        // Already built/sited elsewhere — free this slot for extensions.
        if (structureExistsElsewhere(room, a.structureType, a.x, a.y)) continue;
        keys.add(`${a.x},${a.y}`);
    }
    return keys;
}

/**
 * Free a tile for a late-game special: remove extension / wrong sites; keep roads/ramparts.
 * @returns {boolean} true if the tile is clear enough to place
 */
function freeTileForDynamicSpecial(room, pos, structureType) {
    for (const site of pos.lookFor(LOOK_CONSTRUCTION_SITES)) {
        if (site.structureType === structureType) return true;
        try {
            site.remove();
        } catch (e) { /* ignore */
        }
    }
    for (const s of pos.lookFor(LOOK_STRUCTURES)) {
        if (s.structureType === structureType) return true;
        if (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_RAMPART) continue;
        if (s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_CONTAINER) {
            try {
                if (s.destroy() !== OK) return false;
            } catch (e) {
                return false;
            }
            continue;
        }
        // Unexpected structure — cannot claim this tile.
        return false;
    }
    return true;
}

/**
 * Place power spawn / nuker / observer on reserved near-hub tiles for dynamic rooms.
 * Replaces the closest extensions when those slots are occupied.
 * @returns {{placed: number, destroyedExtensions: number, details: object[]}}
 */
function ensureDynamicSpecialStructures(room) {
    if (!room.memory.dynamicLayout || !room.controller) {
        return {placed: 0, destroyedExtensions: 0, details: [], skipped: 'not-dynamic'};
    }
    // Wipe recovery: never place specials or destroy extensions for them until capacity is close.
    if (shouldDeferDynamicSpecials(room)) {
        return {
            placed: 0,
            destroyedExtensions: 0,
            details: [],
            skipped: 'extension-deficit',
            deficit: getExtensionDeficit(room),
            gate: DYNAMIC_SPECIAL_EXTENSION_DEFICIT_GATE,
        };
    }
    const level = room.controller.level;
    const assignments = getDynamicSpecialAssignments(room);
    if (!assignments.length) {
        return {placed: 0, destroyedExtensions: 0, details: [], skipped: 'no-slots'};
    }

    let placed = 0;
    let destroyedExtensions = 0;
    const details = [];

    for (const a of assignments) {
        const allowed = CONTROLLER_STRUCTURES[a.structureType]
            ? (CONTROLLER_STRUCTURES[a.structureType][level] || 0)
            : 0;
        if (allowed <= 0 || level < a.minRcl) {
            details.push({type: a.structureType, x: a.x, y: a.y, status: 'rcl'});
            continue;
        }
        if (countOwnedOrSites(room, a.structureType) >= allowed) {
            details.push({type: a.structureType, x: a.x, y: a.y, status: 'have'});
            continue;
        }

        const pos = new RoomPosition(a.x, a.y, room.name);
        const beforeExt = pos.lookFor(LOOK_STRUCTURES).filter(s => s.structureType === STRUCTURE_EXTENSION).length;
        if (!freeTileForDynamicSpecial(room, pos, a.structureType)) {
            details.push({type: a.structureType, x: a.x, y: a.y, status: 'blocked'});
            continue;
        }
        if (beforeExt) destroyedExtensions += beforeExt;

        // Already has correct site after free?
        if (pos.lookFor(LOOK_CONSTRUCTION_SITES).some(s => s.structureType === a.structureType) ||
            pos.lookFor(LOOK_STRUCTURES).some(s => s.structureType === a.structureType)) {
            details.push({type: a.structureType, x: a.x, y: a.y, status: 'ready'});
            continue;
        }

        if (!canPlaceConstructionSite(room)) {
            details.push({type: a.structureType, x: a.x, y: a.y, status: 'no-budget'});
            break;
        }

        const result = tryCreateConstructionSite(pos, a.structureType);
        if (result === OK) {
            placed++;
            invalidateRampartSpots(room);
            details.push({type: a.structureType, x: a.x, y: a.y, status: 'placed'});
            log.a(`${room.name} dynamic special: ${a.structureType} at (${a.x},${a.y})`, 'PLANNER');
        } else {
            details.push({type: a.structureType, x: a.x, y: a.y, status: 'fail', result});
        }
    }

    return {placed, destroyedExtensions, details};
}

function removeInvalidExtensions(room, options = {}) {
    const {skipRampartRecalc = false} = options;
    const excluded = buildLayoutExcluded(room);
    const reasons = {};
    let structures = 0;
    let sites = 0;

    for (const ext of room.extensions) {
        const violation = getExtensionClearanceViolation(room, ext.pos, excluded);
        if (!violation) continue;
        try {
            ext.destroy();
            structures++;
            reasons[violation] = (reasons[violation] || 0) + 1;
        } catch (e) {
        }
    }

    for (const site of room.constructionSites) {
        if (site.structureType !== STRUCTURE_EXTENSION) continue;
        const violation = getExtensionClearanceViolation(room, site.pos, excluded);
        if (!violation) continue;
        try {
            site.remove();
            sites++;
            reasons[violation] = (reasons[violation] || 0) + 1;
        } catch (e) {
        }
    }

    const removed = structures + sites;
    let ramparts;
    if (!skipRampartRecalc && removed) {
        // Recompute perimeter plan only — do not mass-delete walls when extensions move.
        ramparts = recalculateRampartsForRoom(room, undefined, {destroyOffPlan: false});
    }
    if (removed) {
        log.a(`${room.name} removed ${removed} invalid extension(s) (${structures} built, ${sites} sites): ${JSON.stringify(reasons)}`);
    }
    return {removed, structures, sites, reasons, ramparts};
}

function ensureExtensionClearance(room, options = {}) {
    const {force = false} = options;
    if (!force && room.memory.extensionClearanceVersion === EXTENSION_LAYOUT_VERSION) {
        return {removed: 0, skipped: true};
    }
    const result = removeInvalidExtensions(room, {skipRampartRecalc: true});
    clearDynamicLayoutMemory(room);
    room.memory.extensionClearanceVersion = EXTENSION_LAYOUT_VERSION;
    // Refresh rampart *plan* for new extension footprint, but never strip constructed
    // walls/ramparts here — that was wiping full perimeters on layout version bumps.
    // Explicit rebuildBarriers / purgeOrphanBarriers still destroy off-plan barriers.
    result.ramparts = recalculateRampartsForRoom(room, undefined, {destroyOffPlan: false});
    return result;
}

function countPlaceableBunkerExtensionsAt(room, hubX, hubY) {
    const entry = bunkerTemplate.find(s => s.structureType === STRUCTURE_EXTENSION);
    if (!entry) return {placeable: 0, total: 0, blocked: []};
    const excluded = buildLayoutExcluded(room, {x: hubX, y: hubY});
    let placeable = 0;
    const blocked = [];
    for (const buildPos of entry.pos) {
        const pos = new RoomPosition(hubX + buildPos.x, hubY + buildPos.y, room.name);
        const reason = classifyExtensionTile(room, pos, excluded);
        if (reason === 'ok') placeable++;
        else if (blocked.length < 8) blocked.push({x: pos.x, y: pos.y, reason});
    }
    return {placeable, total: entry.pos.length, blocked};
}

function countPlaceableBunkerExtensions(room) {
    const hub = room.memory.bunkerHub;
    if (!hub || hub.x === undefined) return {placeable: 0, total: 0, blocked: []};
    return countPlaceableBunkerExtensionsAt(room, hub.x, hub.y);
}

function assessHubExtensionCapacity(room) {
    const deficit = getExtensionDeficit(room);
    if (deficit <= 0 || room.memory.dynamicLayout || !room.memory.bunkerHub) {
        return {sufficient: true, placeable: 0, fallback: 0, deficit};
    }
    const placeable = countPlaceableBunkerExtensions(room).placeable;
    const fallback = findExtensionCandidatesNearHub(room).length;
    return {
        sufficient: placeable >= deficit || (placeable + fallback) >= deficit,
        placeable,
        fallback,
        deficit,
    };
}

function auditExtensionClearance(room) {
    const excluded = buildLayoutExcluded(room);
    const invalid = [];

    for (const ext of room.extensions) {
        const reason = getExtensionClearanceViolation(room, ext.pos, excluded);
        if (reason) invalid.push({x: ext.pos.x, y: ext.pos.y, kind: 'built', reason});
    }
    for (const site of room.constructionSites) {
        if (site.structureType !== STRUCTURE_EXTENSION) continue;
        const reason = getExtensionClearanceViolation(room, site.pos, excluded);
        if (reason) invalid.push({x: site.pos.x, y: site.pos.y, kind: 'site', reason});
    }

    const rampartSpots = ROOM_RAMPART_SPOTS && ROOM_RAMPART_SPOTS[room.name]
        ? JSON.parse(ROOM_RAMPART_SPOTS[room.name])
        : null;

    return {
        roomName: room.name,
        clearancePending: room.memory.extensionClearanceVersion !== EXTENSION_LAYOUT_VERSION,
        extensionClearanceVersion: room.memory.extensionClearanceVersion,
        targetVersion: EXTENSION_LAYOUT_VERSION,
        dynamicExtensionsVersion: room.memory.dynamicExtensionsVersion,
        dynamicLayout: !!room.memory.dynamicLayout,
        hasBunkerHub: !!(room.memory.bunkerHub && room.memory.bunkerHub.x),
        invalidExtensions: invalid,
        invalidCount: invalid.length,
        rampartSpotsCached: !!rampartSpots,
        rampartSpotCount: rampartSpots ? rampartSpots.length : 0,
    };
}

function auditExtensionPlacement(room) {
    const spawn = room.spawns.find(s => s.name !== 'auto') || room.spawns[0];
    const hub = room.memory.bunkerHub;
    const bunkerSlots = countPlaceableBunkerExtensions(room);
    const hubCandidates = room.memory.dynamicLayout ? [] : findExtensionCandidatesNearHub(room);
    return {
        spawn: spawn && {x: spawn.pos.x, y: spawn.pos.y, name: spawn.name},
        controller: room.controller && {x: room.controller.pos.x, y: room.controller.pos.y},
        hubToController: hub && room.controller
            ? new RoomPosition(hub.x, hub.y, room.name).getRangeTo(room.controller)
            : undefined,
        hubAlignedToSpawn: !!(spawn && hub && spawn.pos.x + 1 === hub.x && spawn.pos.y + 1 === hub.y),
        bunkerSlots,
        fallbackCandidates: hubCandidates.length,
        sampleFallback: hubCandidates.slice(0, 5).map(p => `${p.x},${p.y}`),
        hubCapacity: assessHubExtensionCapacity(room),
        batchLimit: getExtensionPlacementLimit(room),
    };
}

function findExtensionCandidatesNearHub(room) {
    const hub = room.hub;
    if (!hub) return [];
    const excluded = buildLayoutExcluded(room);
    const terrain = Game.map.getRoomTerrain(room.name);
    const extensions = [];
    const visited = new Set([`${hub.x},${hub.y}`]);
    const queue = [{x: hub.x, y: hub.y}];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

    while (queue.length && extensions.length < 100) {
        const {x, y} = queue.shift();
        for (const [dx, dy] of dirs) {
            const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
            if (visited.has(key) || nx < 2 || nx > 47 || ny < 2 || ny > 47) continue;
            visited.add(key);
            if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) continue;
            queue.push({x: nx, y: ny});
            if (excluded.has(key)) continue;
            if ((nx + ny) % 2 !== 0) continue;
            const pos = new RoomPosition(nx, ny, room.name);
            if (classifyExtensionTile(room, pos, excluded) !== 'ok') continue;
            extensions.push({x: nx, y: ny});
        }
    }
    return extensions;
}

function filterValidExtensionTiles(room, tiles) {
    const excluded = buildLayoutExcluded(room);
    return tiles.filter(({x, y}) => classifyExtensionTile(room, new RoomPosition(x, y, room.name), excluded) === 'ok');
}

function tileKey(x, y) {
    return x + ',' + y;
}

/**
 * Static blocked tiles for layout *pathing* only.
 * - Terrain walls + real obstacle buildings
 * - NOT constructed walls/ramparts (perimeter seal would make exits/sources look
 *   "already unreachable" and force a 0-extension plan)
 * - NOT the extension excluded set (spawn apron must stay walkable for path checks)
 */
function buildLayoutBlockedSet(room, terrain) {
    const blocked = new Set();
    for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) blocked.add(tileKey(x, y));
        }
    }
    const structs = room.structures || [];
    for (let i = 0; i < structs.length; i++) {
        const s = structs[i];
        if (!s || !s.pos) continue;
        const t = s.structureType;
        if (t === STRUCTURE_ROAD || t === STRUCTURE_RAMPART || t === STRUCTURE_CONTAINER) continue;
        if (t === STRUCTURE_WALL) continue; // perimeter barriers — not layout path blocks
        if (t === STRUCTURE_EXTENSION) continue;
        if (OBSTACLE_OBJECT_TYPES.includes(t)) {
            blocked.add(tileKey(s.pos.x, s.pos.y));
        }
    }
    // Core stamps that already exist as buildings are covered above; planned-only stamps
    // (e.g. empty spawn tile) stay walkable for access BFS.
    return blocked;
}

function addWalkableAdjacents(targets, terrain, blocked, x, y) {
    for (const [dx, dy] of OCTALS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
        const key = tileKey(nx, ny);
        if (blocked.has(key)) continue;
        if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) continue;
        targets.push({x: nx, y: ny, key});
    }
}

/**
 * Access groups that must stay pathable from the base after extensions are placed.
 * Each group needs ≥1 reachable tile (controller/sources/mineral use open adj tiles;
 * each exit edge needs ≥1 exit tile for that neighbour room).
 */
function collectCriticalAccessGroups(room, terrain, blocked) {
    const groups = [];

    if (room.controller) {
        const tiles = [];
        addWalkableAdjacents(tiles, terrain, blocked, room.controller.pos.x, room.controller.pos.y);
        if (tiles.length) groups.push({id: 'controller', tiles});
    }

    const sources = room.sources || [];
    for (let i = 0; i < sources.length; i++) {
        const s = sources[i];
        const tiles = [];
        addWalkableAdjacents(tiles, terrain, blocked, s.pos.x, s.pos.y);
        if (tiles.length) groups.push({id: 'source:' + s.id, tiles});
    }

    if (room.mineral) {
        const tiles = [];
        addWalkableAdjacents(tiles, terrain, blocked, room.mineral.pos.x, room.mineral.pos.y);
        if (tiles.length) groups.push({id: 'mineral', tiles});
    }

    // One group per open exit edge so every neighbouring room stays reachable.
    const exits = Game.map.describeExits(room.name) || {};
    const edgeTiles = {
        [TOP]: [],
        [RIGHT]: [],
        [BOTTOM]: [],
        [LEFT]: [],
    };
    for (let i = 0; i < 50; i++) {
        if (terrain.get(i, 0) !== TERRAIN_MASK_WALL) edgeTiles[TOP].push({x: i, y: 0, key: tileKey(i, 0)});
        if (terrain.get(i, 49) !== TERRAIN_MASK_WALL) edgeTiles[BOTTOM].push({x: i, y: 49, key: tileKey(i, 49)});
        if (terrain.get(0, i) !== TERRAIN_MASK_WALL) edgeTiles[LEFT].push({x: 0, y: i, key: tileKey(0, i)});
        if (terrain.get(49, i) !== TERRAIN_MASK_WALL) edgeTiles[RIGHT].push({x: 49, y: i, key: tileKey(49, i)});
    }
    for (const dir of [TOP, RIGHT, BOTTOM, LEFT]) {
        if (!exits[dir]) continue;
        const tiles = edgeTiles[dir].filter(t => !blocked.has(t.key));
        if (tiles.length) groups.push({id: 'exit:' + dir + ':' + exits[dir], tiles});
    }

    return groups;
}

/** Walk seeds: open tiles at/near hub and core stamps (hub may be an obstacle observer). */
function collectLayoutPathSeeds(room, terrain, blocked) {
    const seeds = [];
    const seen = new Set();
    const trySeed = (x, y) => {
        if (x < 0 || x > 49 || y < 0 || y > 49) return;
        const key = tileKey(x, y);
        if (seen.has(key) || blocked.has(key)) return;
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) return;
        seen.add(key);
        seeds.push({x, y, key});
    };
    const seedAround = (x, y) => {
        trySeed(x, y);
        for (const [dx, dy] of OCTALS) trySeed(x + dx, y + dy);
    };

    const hub = room.hub || room.memory.bunkerHub;
    if (hub) seedAround(hub.x, hub.y);

    const tmpl = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
    if (hub && tmpl) {
        for (const entry of tmpl) {
            for (const p of entry.pos) seedAround(hub.x + p.x, hub.y + p.y);
        }
    }
    for (const spawn of room.spawns || []) {
        seedAround(spawn.pos.x, spawn.pos.y);
    }
    return seeds;
}

/**
 * BFS from seeds; returns true only if every access group has ≥1 reachable tile.
 * Early-exits once all groups are satisfied (cheap when base is well connected).
 */
function accessGroupsReachable(seeds, blocked, extensionSet, groups) {
    if (!groups.length) return true;
    const need = [];
    const tileToGroup = Object.create(null);
    for (let g = 0; g < groups.length; g++) {
        need.push(true);
        const tiles = groups[g].tiles;
        for (let t = 0; t < tiles.length; t++) {
            const key = tiles[t].key;
            if (!tileToGroup[key]) tileToGroup[key] = [];
            tileToGroup[key].push(g);
        }
    }
    let remaining = groups.length;
    const reached = new Set();
    const q = [];
    const hitGroup = (key) => {
        const list = tileToGroup[key];
        if (!list) return;
        for (let i = 0; i < list.length; i++) {
            const gi = list[i];
            if (!need[gi]) continue;
            need[gi] = false;
            remaining--;
        }
    };

    for (let i = 0; i < seeds.length; i++) {
        const s = seeds[i];
        if (blocked.has(s.key) || extensionSet.has(s.key)) continue;
        if (reached.has(s.key)) continue;
        reached.add(s.key);
        q.push(s.x, s.y);
        hitGroup(s.key);
    }
    let qi = 0;
    while (qi < q.length && remaining > 0) {
        const x = q[qi++];
        const y = q[qi++];
        for (const [dx, dy] of CARDINALS) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
            const key = tileKey(nx, ny);
            if (reached.has(key) || blocked.has(key) || extensionSet.has(key)) continue;
            reached.add(key);
            q.push(nx, ny);
            hitGroup(key);
            if (remaining <= 0) break;
        }
    }
    return remaining <= 0;
}

function listFailedAccessGroups(seeds, blocked, extensionSet, groups) {
    const failed = [];
    for (let g = 0; g < groups.length; g++) {
        // Per-group check via full flood is wasteful; reuse one flood.
        break;
    }
    // Single flood then test each group.
    const reached = new Set();
    const q = [];
    for (let i = 0; i < seeds.length; i++) {
        const s = seeds[i];
        if (blocked.has(s.key) || extensionSet.has(s.key) || reached.has(s.key)) continue;
        reached.add(s.key);
        q.push(s.x, s.y);
    }
    let qi = 0;
    while (qi < q.length) {
        const x = q[qi++];
        const y = q[qi++];
        for (const [dx, dy] of CARDINALS) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
            const key = tileKey(nx, ny);
            if (reached.has(key) || blocked.has(key) || extensionSet.has(key)) continue;
            reached.add(key);
            q.push(nx, ny);
        }
    }
    for (let g = 0; g < groups.length; g++) {
        if (!groups[g].tiles.some(t => reached.has(t.key))) failed.push(groups[g].id);
    }
    return failed;
}

/** Extension must keep at least one cardinal walkable neighbour for refill creeps. */
function extensionHasWalkAccess(x, y, blocked, extensionSet) {
    for (const [dx, dy] of CARDINALS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
        const key = tileKey(nx, ny);
        if (!blocked.has(key) && !extensionSet.has(key)) return true;
    }
    return false;
}

/**
 * Only enforce access groups that are already reachable with the static blocked set.
 * Groups sealed by existing walls/terrain (outside the base) must not zero the plan.
 */
function filterCurrentlyReachableGroups(seeds, blocked, groups) {
    if (!groups.length) return [];
    const empty = new Set();
    return groups.filter(g => accessGroupsReachable(seeds, blocked, empty, [g]));
}

/**
 * Single-pass greedy: nearer hub first, light cluster bias, reject tiles that cut
 * currently-reachable access to controller / sources / mineral / exits.
 */
function selectConnectivitySafeExtensions(room, candidates, seeds, groups, blocked) {
    const hub = room.hub;
    const extensionSet = new Set();
    const chosen = [];

    // Only protect access that works today without counting walls as path blocks.
    const activeGroups = filterCurrentlyReachableGroups(seeds, blocked, groups);
    if (!activeGroups.length && groups.length) {
        log.w(`${room.name} dynamic layout: no access groups reachable via terrain/buildings (placing near hub only)`);
    } else if (activeGroups.length < groups.length) {
        const skipped = groups.filter(g => !activeGroups.some(a => a.id === g.id)).map(g => g.id);
        if (Game.time % 100 === 0) {
            log.a(`${room.name} dynamic layout: protecting ${activeGroups.length}/${groups.length} access groups; skip ${JSON.stringify(skipped)}`, 'PLANNER');
        }
    }

    const scored = candidates.map(c => {
        const range = Math.max(Math.abs(c.x - hub.x), Math.abs(c.y - hub.y));
        return {x: c.x, y: c.y, range, key: tileKey(c.x, c.y)};
    });
    scored.sort((a, b) => a.range - b.range || a.y - b.y || a.x - b.x);

    // Pass 1: prefer tiles touching already-chosen (compact growth).
    // Pass 2: any remaining safe tile (fill to target).
    for (let pass = 0; pass < 2 && chosen.length < DYNAMIC_EXTENSION_TARGET; pass++) {
        for (let i = 0; i < scored.length && chosen.length < DYNAMIC_EXTENSION_TARGET; i++) {
            const c = scored[i];
            if (extensionSet.has(c.key) || blocked.has(c.key)) continue;

            if (pass === 0 && chosen.length > 0) {
                let touch = false;
                for (const [dx, dy] of OCTALS) {
                    if (extensionSet.has(tileKey(c.x + dx, c.y + dy))) {
                        touch = true;
                        break;
                    }
                }
                if (!touch) continue;
            }

            extensionSet.add(c.key);
            if (!extensionHasWalkAccess(c.x, c.y, blocked, extensionSet)) {
                extensionSet.delete(c.key);
                continue;
            }
            if (activeGroups.length &&
                !accessGroupsReachable(seeds, blocked, extensionSet, activeGroups)) {
                extensionSet.delete(c.key);
                continue;
            }
            chosen.push({x: c.x, y: c.y});
        }
    }

    return chosen;
}

function computeDynamicLayoutTiles(room) {
    // Same-tick only — never reuse a filtered free-tile list across ticks (tiles free up).
    const heapHit = dynamicLayoutCache[room.name];
    if (heapHit && heapHit.tick === Game.time) return heapHit;

    // When specials are deferred / un-deferred, regen so hub special tiles enter or leave the plan.
    syncDynamicPlanWithSpecialDeferral(room);

    const hub = room.hub;
    if (!hub) {
        // Tick-scoped only so a missing hub does not permanently zero the plan.
        const empty = {extensions: [], corridors: [], access: null, tick: Game.time};
        dynamicLayoutCache[room.name] = empty;
        extensionPositionCache[room.name] = empty.extensions;
        return empty;
    }

    if (room.memory.dynamicExtensionsPacked && room.memory.dynamicCorridorPacked
        && room.memory.dynamicExtensionsVersion === EXTENSION_LAYOUT_VERSION) {
        // Always re-filter packed coords against live room state (structures/sites change).
        const extensions = filterValidExtensionTiles(room, unpackPackedTiles(room.memory.dynamicExtensionsPacked));
        if (!extensions.length && getExtensionDeficit(room) > 0) {
            clearDynamicExtensionPlanOnly(room);
        } else {
            const layout = {
                extensions,
                corridors: unpackPackedTiles(room.memory.dynamicCorridorPacked),
                tick: Game.time,
            };
            dynamicLayoutCache[room.name] = layout;
            extensionPositionCache[room.name] = layout.extensions;
            return layout;
        }
    } else if (room.memory.dynamicExtensionsPacked) {
        clearDynamicExtensionPlanOnly(room);
    }

    const excluded = buildLayoutExcluded(room);
    const terrain = Game.map.getRoomTerrain(room.name);
    const blocked = buildLayoutBlockedSet(room, terrain);
    const groups = collectCriticalAccessGroups(room, terrain, blocked);
    const seeds = collectLayoutPathSeeds(room, terrain, blocked);
    const activeGroups = filterCurrentlyReachableGroups(seeds, blocked, groups);

    // Gather candidates via flood (checkerboard keeps natural corridors on odd tiles).
    const candidates = [];
    const floodVisited = new Set([tileKey(hub.x, hub.y)]);
    const queue = [{x: hub.x, y: hub.y}];
    while (queue.length && candidates.length < DYNAMIC_EXTENSION_CANDIDATE_CAP) {
        const {x, y} = queue.shift();
        for (const [dx, dy] of OCTALS) {
            const nx = x + dx, ny = y + dy, key = tileKey(nx, ny);
            if (floodVisited.has(key) || nx < 2 || nx > 47 || ny < 2 || ny > 47) continue;
            floodVisited.add(key);
            if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) continue;
            queue.push({x: nx, y: ny});
            if (excluded.has(key)) continue;
            // Checkerboard: leave odd tiles as default corridor lattice.
            if ((nx + ny) % 2 !== 0) continue;
            const pos = new RoomPosition(nx, ny, room.name);
            if (classifyExtensionTile(room, pos, excluded) !== 'ok') continue;
            candidates.push({x: nx, y: ny});
        }
    }

    const extensions = selectConnectivitySafeExtensions(room, candidates, seeds, groups, blocked);
    const extensionSet = new Set(extensions.map(p => tileKey(p.x, p.y)));

    // Corridors = flooded walkable tiles not claimed as extensions (path skeleton).
    const corridors = [];
    for (const key of floodVisited) {
        if (extensionSet.has(key) || excluded.has(key)) continue;
        const comma = key.indexOf(',');
        const x = Number(key.slice(0, comma));
        const y = Number(key.slice(comma + 1));
        if (x < 1 || x > 48 || y < 1 || y > 48) continue;
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
        corridors.push({x, y});
    }

    // Audit only groups we tried to protect (reachable at baseline).
    const failed = activeGroups.length
        ? listFailedAccessGroups(seeds, blocked, extensionSet, activeGroups)
        : [];
    const access = {
        groups: groups.length,
        activeGroups: activeGroups.length,
        ok: failed.length === 0,
        failed,
        skippedUnreachable: groups.filter(g => !activeGroups.some(a => a.id === g.id)).map(g => g.id),
        extensions: extensions.length,
        candidates: candidates.length,
    };

    const layout = {extensions, corridors, access, tick: Game.time};
    dynamicLayoutCache[room.name] = layout;
    extensionPositionCache[room.name] = extensions;
    room.memory.dynamicExtensionsPacked = packTiles(extensions);
    room.memory.dynamicCorridorPacked = packTiles(corridors);
    room.memory.dynamicExtensionsVersion = EXTENSION_LAYOUT_VERSION;
    room.memory.dynamicAccessOk = access.ok;
    room.memory.dynamicAccessFailed = access.failed;
    room.memory.dynamicAccessSkipped = access.skippedUnreachable;
    if (room.memory.dynamicExtensions) room.memory.dynamicExtensions = undefined;
    invalidateRampartSpots(room);
    log.a(
        `${room.name} dynamic layout: ${extensions.length} ext, ${corridors.length} corridors, ` +
        `access=${access.ok ? 'OK' : 'FAIL ' + JSON.stringify(access.failed)}` +
        (access.skippedUnreachable.length ? ` skip=${JSON.stringify(access.skippedUnreachable)}` : ''),
        'PLANNER'
    );
    return layout;
}

function placeExtensionsFromCandidates(room, positions, maxPlacements = 1) {
    const excluded = buildLayoutExcluded(room);
    let placed = 0;
    for (const {x, y} of positions) {
        if (placed >= maxPlacements || getExtensionDeficit(room) <= 0) break;
        if (!canPlaceConstructionSite(room)) break;
        const pos = new RoomPosition(x, y, room.name);
        if (classifyExtensionTile(room, pos, excluded) !== 'ok') continue;
        const result = tryCreateConstructionSite(pos, STRUCTURE_EXTENSION);
        if (result === OK) {
            placed++;
            invalidateRampartSpots(room);
        } else if (result === ERR_FULL || result === ERR_RCL_NOT_ENOUGH) {
            break;
        }
    }
    return placed;
}

function placeBunkerExtensions(room, maxPlacements = 1) {
    const hub = room.hub;
    const entry = bunkerTemplate.find(s => s.structureType === STRUCTURE_EXTENSION);
    if (!entry || !hub || getExtensionDeficit(room) <= 0) return 0;
    const excluded = buildLayoutExcluded(room);
    let placed = 0;
    for (const buildPos of entry.pos) {
        if (placed >= maxPlacements) break;
        const pos = new RoomPosition(hub.x + buildPos.x, hub.y + buildPos.y, room.name);
        if (classifyExtensionTile(room, pos, excluded) !== 'ok') continue;
        if (!canPlaceConstructionSite(room)) break;
        if (tryCreateConstructionSite(pos, STRUCTURE_EXTENSION) === OK) {
            placed++;
            invalidateRampartSpots(room);
        }
    }
    return placed;
}

function placeExtensionsFallback(room, maxPlacements = 1) {
    const positions = findExtensionCandidatesNearHub(room);
    if (!positions.length) return 0;
    const placed = placeExtensionsFromCandidates(room, positions, maxPlacements);
    if (placed) log.a(`${room.name} placed ${placed} fallback extension(s) near hub`);
    return placed;
}

function placeRoomExtensions(room) {
    const deficit = getExtensionDeficit(room);
    if (deficit <= 0) {
        delete room.memory.plannerExtensionSkip;
        return 0;
    }

    // If barriers/roads filled the room cap, free slots before giving up.
    let limit = getExtensionPlacementLimit(room);
    if (limit <= 0) {
        const want = Math.min(deficit, getExtensionBatchMax(room));
        const freed = freeSiteSlotsForExtensions(room, want);
        limit = getExtensionPlacementLimit(room);
        if (limit <= 0) {
            recordExtensionSkip(room, 'no-site-budget', {freed});
            if (Game.time % 50 === 0) {
                log.w(`${room.name} extension place skipped: limit=0 deficit=${deficit} budget=${roomConstructionSiteBudget(room)} freed=${freed}`);
            }
            return 0;
        }
    }

    let placed;
    if (room.memory.dynamicLayout) {
        placed = placeExtensionsDynamically(room, limit);
    } else {
        placed = placeBunkerExtensions(room, limit);
        if (placed < limit && getExtensionDeficit(room) > 0) {
            placed += placeExtensionsFallback(room, limit - placed);
        }
    }

    if (placed > 0) {
        delete room.memory.plannerExtensionSkip;
        room.memory.plannerExtensionLast = {tick: Game.time, placed, limit, deficit};
    } else {
        recordExtensionSkip(room, 'place-failed', {
            limit,
            planTiles: room.memory.dynamicLayout ? (getExtensionPositions(room).length) : undefined,
            bunkerPlaceable: room.memory.dynamicLayout ? undefined : countPlaceableBunkerExtensions(room).placeable,
            fallbackCandidates: findExtensionCandidatesNearHub(room).length,
        });
    }
    return placed;
}

function tryPlaceRoomExtensions(room) {
    const clearance = ensureExtensionClearance(room);
    if (getExtensionDeficit(room) <= 0) return {placed: false, reason: 'none needed', clearance};

    let limit = getExtensionPlacementLimit(room);
    let freed = 0;
    if (limit <= 0) {
        freed = freeSiteSlotsForExtensions(room, Math.min(getExtensionDeficit(room), getExtensionBatchMax(room)));
        limit = getExtensionPlacementLimit(room);
    }
    if (limit <= 0) {
        recordExtensionSkip(room, 'no-site-budget', {freed});
        return {
            placed: false,
            reason: 'no site budget',
            siteBudget: roomConstructionSiteBudget(room),
            freed,
            clearance
        };
    }
    if (room.memory.dynamicLayout) {
        const count = placeExtensionsDynamically(room, limit);
        if (count > 0) delete room.memory.plannerExtensionSkip;
        else recordExtensionSkip(room, 'dynamic-failed', {limit, planTiles: getExtensionPositions(room).length});
        return {placed: count > 0, count, method: count ? 'dynamic' : 'dynamic-failed', limit, freed};
    }
    const bunkerSlots = countPlaceableBunkerExtensions(room);
    let count = placeBunkerExtensions(room, limit);
    let method;
    if (count) method = 'bunker';
    if (count < limit && getExtensionDeficit(room) > 0) {
        const fallbackCount = placeExtensionsFallback(room, limit - count);
        if (fallbackCount) {
            count += fallbackCount;
            method = method ? 'bunker+fallback' : 'fallback';
        }
    }
    if (count) {
        delete room.memory.plannerExtensionSkip;
        return {placed: true, count, method, limit, bunkerSlots, freed};
    }
    recordExtensionSkip(room, 'place-failed', {
        limit,
        bunkerPlaceable: bunkerSlots.placeable,
        fallbackCandidates: findExtensionCandidatesNearHub(room).length,
    });
    return {
        placed: false,
        method: 'failed',
        limit,
        bunkerSlots,
        fallbackCandidates: findExtensionCandidatesNearHub(room).length,
        freed,
    };
}

/**
 * Single console call that walks every gate blocking extension placement.
 * Usage: diagnoseExtensionBlockers('E1N1') or diagnoseExtensionBlockers() for all rooms.
 */
function diagnoseExtensionBlockers(room) {
    const {tickTracker} = require('planState');
    const needed = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] || 0;
    const built = room.extensions.length;
    const sites = room.constructionSites.filter(s => s.structureType === STRUCTURE_EXTENSION).length;
    const deficit = getExtensionDeficit(room);
    const budget = roomConstructionSiteBudget(room);
    const batchMax = getExtensionBatchMax(room);
    const siteBreakdown = {};
    for (const s of room.constructionSites) {
        siteBreakdown[s.structureType] = (siteBreakdown[s.structureType] || 0) + 1;
    }

    const gates = [];
    if (!room.controller || !room.controller.my) gates.push({gate: 'not-owned', blocks: true});
    if (room.controller.level < 2) gates.push({gate: 'rcl-too-low', blocks: true, rcl: room.controller.level});
    if (!(room.memory.bunkerHub && room.memory.bunkerHub.x !== undefined)) {
        gates.push({gate: 'no-hub', blocks: true});
    }
    const hasSpawn = !!(room.spawns && room.spawns.length);
    const hasSpawnSite = room.constructionSites.some(s => s.structureType === STRUCTURE_SPAWN);
    if (!hasSpawn && !hasSpawnSite) gates.push({gate: 'no-spawn-or-site', blocks: true});
    if (deficit <= 0) gates.push({gate: 'no-deficit', blocks: true, needed, built, sites});
    if (budget <= 0 && deficit > 0) {
        gates.push({
            gate: 'no-site-budget',
            blocks: true,
            budget,
            roomCap: typeof MAX_CONSTRUCTION_SITES_PER_ROOM !== 'undefined' ? MAX_CONSTRUCTION_SITES_PER_ROOM : 10,
            siteBreakdown,
            hint: 'Idle road/wall/rampart sites fill the room cap; freeSiteSlotsForExtensions should clear them on place.',
        });
    }
    if (deficit > 0 && budget > 0 && Math.min(deficit, budget, batchMax) <= 0) {
        gates.push({gate: 'batch-zero', blocks: true, batchMax});
    }

    let planTiles = 0;
    let placeablePlan = 0;
    let bunker = null;
    let fallback = 0;
    if (room.memory.dynamicLayout) {
        const positions = getExtensionPositions(room);
        planTiles = positions.length;
        const excluded = buildLayoutExcluded(room);
        for (const p of positions) {
            if (classifyExtensionTile(room, new RoomPosition(p.x, p.y, room.name), excluded) === 'ok') placeablePlan++;
        }
        if (planTiles === 0 && deficit > 0) {
            gates.push({gate: 'empty-dynamic-plan', blocks: true, accessFailed: room.memory.dynamicAccessFailed});
        } else if (placeablePlan === 0 && deficit > 0) {
            gates.push({
                gate: 'no-placeable-plan-tiles',
                blocks: true,
                planTiles,
                accessFailed: room.memory.dynamicAccessFailed
            });
        }
    } else if (room.memory.bunkerHub) {
        bunker = countPlaceableBunkerExtensions(room);
        fallback = findExtensionCandidatesNearHub(room).length;
        if (bunker.placeable === 0 && fallback === 0 && deficit > 0) {
            gates.push({
                gate: 'no-placeable-tiles',
                blocks: true,
                bunkerPlaceable: bunker.placeable,
                bunkerBlockedSample: bunker.blocked,
                fallbackCandidates: fallback,
            });
        }
    }

    // Cross-room scheduler visibility (why this room may never get a layout tick).
    const rooms = [];
    if (typeof MY_ROOMS !== 'undefined' && MY_ROOMS) {
        for (const name of MY_ROOMS) if (Game.rooms[name]) rooms.push(Game.rooms[name]);
    }
    let empireTowerDeficitRooms = 0;
    let empireExtDeficitRooms = 0;
    let empireSpawnSiteRooms = 0;
    for (const r of rooms) {
        if (!r.controller || !r.controller.my) continue;
        try {
            const {getTowerDeficit} = require('planHub');
            if (getTowerDeficit(r) > 0) empireTowerDeficitRooms++;
        } catch (e) { /* ignore */
        }
        if (r.controller.level >= 2 && getExtensionDeficit(r) > 0) empireExtDeficitRooms++;
        if (!(r.spawns && r.spawns.length) &&
            !r.constructionSites.some(s => s.structureType === STRUCTURE_SPAWN) &&
            r.memory.bunkerHub) {
            empireSpawnSiteRooms++;
        }
    }

    const blocking = gates.filter(g => g.blocks);
    return {
        roomName: room.name,
        rcl: room.controller.level,
        needed,
        built,
        sites,
        deficit,
        budget,
        batchMax,
        limit: Math.min(deficit, budget, batchMax),
        dynamicLayout: !!room.memory.dynamicLayout,
        planTiles,
        placeablePlan,
        bunker,
        fallbackCandidates: fallback || findExtensionCandidatesNearHub(room).length,
        siteBreakdown,
        gates,
        primaryBlocker: blocking.length ? blocking[0].gate : null,
        blocked: blocking.length > 0,
        lastSkip: room.memory.plannerExtensionSkip,
        lastPlace: room.memory.plannerExtensionLast,
        lastSiteError: room.memory.plannerLastSiteError,
        planner: tickTracker[room.name],
        lastPlannerRoom: tickTracker.lastRoom,
        empire: {
            towerDeficitRooms: empireTowerDeficitRooms,
            extensionDeficitRooms: empireExtDeficitRooms,
            spawnSiteRooms: empireSpawnSiteRooms,
            note: 'Tower/extension rooms now share soft-priority RR (spawn site still hard-priority).',
        },
    };
}

function buildSourceExtensions(room) {
    const hub = room.hub;
    const excluded = buildLayoutExcluded(room);

    for (const source of room.sources) {
        const container = Game.getObjectById(source.memory.container);
        if (!container) continue;

        const link = source.memory.link ? Game.getObjectById(source.memory.link) : null;
        if (!link) {
            const linkSite = container.pos.findInRange(FIND_CONSTRUCTION_SITES, 1)
                .find(s => s.structureType === STRUCTURE_LINK);
            if (linkSite) continue;
            continue;
        }

        const accessCandidates = [];
        const extensionCandidates = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (!dx && !dy) continue;
                const x = container.pos.x + dx, y = container.pos.y + dy;
                if (x < 1 || x > 48 || y < 1 || y > 48) continue;
                const pos = new RoomPosition(x, y, room.name);
                if (pos.isEqualTo(link.pos)) continue;
                if (classifySourceAccessTile(room, pos)) accessCandidates.push(pos);
                if (classifyExtensionTile(room, pos, excluded) !== 'ok') continue;
                if (hub && pos.getRangeTo(hub) <= 5) continue;
                extensionCandidates.push(pos);
            }
        }

        if (hub && accessCandidates.length > 0) {
            const reserved = _.min(accessCandidates, p => p.getRangeTo(hub));
            source.memory.accessReserved = {x: reserved.x, y: reserved.y};
        } else {
            delete source.memory.accessReserved;
        }

        for (const pos of extensionCandidates) {
            if (source.memory.accessReserved
                && pos.x === source.memory.accessReserved.x
                && pos.y === source.memory.accessReserved.y) continue;
            if (!canPlaceConstructionSite(room)) return false;
            if (tryCreateConstructionSite(pos, STRUCTURE_EXTENSION) === OK) {
                invalidateRampartSpots(room);
                return true;
            }
        }
    }
    return false;
}

function getExtensionPositions(room) {
    return computeDynamicLayoutTiles(room).extensions;
}

function getCorridorPositions(room) {
    return computeDynamicLayoutTiles(room).corridors;
}

function placeExtensionsDynamically(room, maxPlacements = 1) {
    if (getExtensionDeficit(room) <= 0) return 0;
    let positions = getExtensionPositions(room);
    if (!positions.length) {
        // Stale/empty plan — wipe cache and regenerate once this call.
        clearDynamicLayoutMemory(room);
        positions = getExtensionPositions(room);
    }
    let placed = positions.length
        ? placeExtensionsFromCandidates(room, positions, maxPlacements)
        : 0;
    // Connectivity plan can yield 0 safe tiles; still place near hub so the room recovers.
    if (!placed && getExtensionDeficit(room) > 0) {
        placed = placeExtensionsFallback(room, maxPlacements);
        if (!placed && Game.time % 20 === 0) {
            log.w(`${room.name} dynamic extensions: 0 placed (plan=${positions.length} deficit=${getExtensionDeficit(room)} budget=${roomConstructionSiteBudget(room)})`);
        }
    }
    return placed;
}

module.exports = {
    buildSourceExtensions,
    placeExtensionsDynamically,
    placeBunkerExtensions,
    placeExtensionsFallback,
    placeRoomExtensions,
    tryPlaceRoomExtensions,
    getExtensionPositions,
    getCorridorPositions,
    getExtensionDeficit,
    clearDynamicLayoutMemory,
    removeInvalidExtensions,
    ensureExtensionClearance,
    ensureDynamicSpecialStructures,
    getDynamicSpecialAssignments,
    countPlaceableBunkerExtensions,
    countPlaceableBunkerExtensionsAt,
    assessHubExtensionCapacity,
    auditExtensionClearance,
    auditExtensionPlacement,
    getExtensionPlacementLimit,
    getExtensionBatchMax,
    freeSiteSlotsForExtensions,
    diagnoseExtensionBlockers,
    shouldDeferDynamicSpecials,
    DYNAMIC_SPECIAL_EXTENSION_DEFICIT_GATE,
    classifyExtensionTile,
    EXTENSION_EXIT_CLEARANCE,
    EXTENSION_SOURCE_CLEARANCE,
    EXTENSION_CONTROLLER_CLEARANCE,
    EXTENSION_MINERAL_CLEARANCE,
    EXTENSION_SPAWN_CLEARANCE,
    EXTENSION_ANCHOR_CLEARANCE,
    EXTENSION_LAYOUT_VERSION,
    DYNAMIC_SPECIAL_STRUCTURES,
    collectCriticalAccessGroups,
};
