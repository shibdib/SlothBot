/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Extensions ACT (world mutate) + compat re-exports of planGeomExtensions (E4).
 *
 * Tick placement: placeExtensions + siteBudget.
 * These helpers remain for console / wipe recovery.
 */

const {ensurePlan, getPlan, pushFailure, FailureCodes, packTiles} = require('planDoc');
const siteBudget = require('planSiteBudget');
const {isPlannerShadow} = require('planFlag');
const {hasSpawnOrSpawnSite} = require('planActors');

const geom = require('planGeomExtensions');
const {
    shouldDeferDynamicSpecials,
    getExtensionDeficit,
    DYNAMIC_SPECIAL_EXTENSION_DEFICIT_GATE,
    DYNAMIC_SPECIAL_STRUCTURES,
    getDynamicSpecialAssignments,
    buildLayoutExcluded,
    getExtensionClearanceViolation,
    classifyExtensionTile,
    classifySourceAccessTile,
    EXTENSION_LAYOUT_VERSION,
    clearDynamicLayoutMemory,
    getExtensionPlacementLimit,
    getExtensionBatchMax,
    getExtensionPositions,
    getCorridorPositions,
    countPlaceableBunkerExtensions,
    findExtensionCandidatesNearHub,
    countOwnedOrSites,
} = geom;

const {bunkerTemplate} = require('planTemplates');
const {invalidateRampartSpots} = require('planGeomRamparts');
const {recalculateRampartsForRoom} = require('planRamparts');
const {
    canPlaceConstructionSite,
    tryCreateConstructionSite,
    roomConstructionSiteBudget,
    invalidateRoomConstructionSiteCache,
    resolveSourceContainer,
    hasSourceContainerSite,
    resolveControllerContainer,
    hasControllerContainerSite,
    shouldSkipControllerContainer,
} = require('planUtils');

const DYNAMIC_SPECIAL_SITE_TYPES = DYNAMIC_SPECIAL_STRUCTURES.map(d => d.structureType);

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
    // Do NOT cancel container/link sites — freeSiteSlots used to remove them for
    // extension headroom, and V2 forceLayout (ext deficit > 5) then permanently
    // starved source/controller containers and links. Roads/barriers can re-queue.
    const preferIdle = [STRUCTURE_ROAD, STRUCTURE_WALL, STRUCTURE_RAMPART];
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
        } else if (result === ERR_FULL || result === ERR_RCL_NOT_ENOUGH) {
            break;
        }
    }
    // One footprint invalidation after the batch — not per site (each wipe left
    // ensureAllIncompletePerimeters with no spots until a lucky aux layout turn).
    if (placed) invalidateRampartSpots(room);
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
        }
    }
    if (placed) invalidateRampartSpots(room);
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
/**
 * Place one source-pad extension (link+container present, outside hub ring).
 * @param {Room} room
 * @param {{
 *   placeSite?: (pos: RoomPosition, structureType: string) => number,
 *   canPlace?: (room: Room) => boolean,
 * }} [options]
 *   placeSite / canPlace let planner V2 inject siteBudget.
 * @returns {boolean} true if a site was placed
 */
/** True when another walkable harvest tile remains besides skipPos and the container. */
function hasOtherSourceHarvestTile(room, source, skipPos) {
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (!dx && !dy) continue;
            const x = source.pos.x + dx;
            const y = source.pos.y + dy;
            if (x < 1 || x > 48 || y < 1 || y > 48) continue;
            if (skipPos && skipPos.x === x && skipPos.y === y) continue;
            const pos = new RoomPosition(x, y, room.name);
            if (pos.checkForWall()) continue;
            if (pos.checkForImpassible(true, true)) continue;
            if (pos.checkForContainer()) continue;
            const site = pos.checkForConstructionSites();
            if (site && site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_RAMPART) continue;
            return true;
        }
    }
    return false;
}

function buildSourceExtensions(room, options) {
    const opts = options || {};
    const placeFn = typeof opts.placeSite === 'function'
        ? opts.placeSite
        : tryCreateConstructionSite;
    const canPlaceFn = typeof opts.canPlace === 'function'
        ? opts.canPlace
        : canPlaceConstructionSite;

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

        // Fill the back of the container first so harvest-adjacent roads stay open.
        extensionCandidates.sort((a, b) => {
            const as = a.inRangeTo(source, 1) ? 1 : 0;
            const bs = b.inRangeTo(source, 1) ? 1 : 0;
            if (as !== bs) return as - bs;
            if (hub) return a.getRangeTo(hub) - b.getRangeTo(hub);
            return 0;
        });

        for (const pos of extensionCandidates) {
            if (source.memory.accessReserved
                && pos.x === source.memory.accessReserved.x
                && pos.y === source.memory.accessReserved.y) continue;
            // Keep one harvest tile so the owned road net can still reach the source.
            if (pos.inRangeTo(source, 1) && !hasOtherSourceHarvestTile(room, source, pos)) continue;
            if (!canPlaceFn(room)) return false;
            const result = placeFn(pos, STRUCTURE_EXTENSION);
            if (result === OK) {
                invalidateRampartSpots(room);
                return true;
            }
            // Soft budget exhausted (V2 signals via ERR_NOT_OWNER)
            if (result === ERR_NOT_OWNER || result === ERR_FULL) return false;
        }
    }
    return false;
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

function economySiteReserve(room) {
    if (!room || !room.controller) return 0;
    const level = room.controller.level;
    if (level < 2) return 0;

    let need = 0;
    if (level >= 2 && level < 8) {
        if (!shouldSkipControllerContainer(room)
            && !resolveControllerContainer(room, false) && !hasControllerContainerSite(room)) {
            need++;
        }
    }
    if (level >= 3) {
        const sources = room.sources || [];
        for (let i = 0; i < sources.length; i++) {
            const s = sources[i];
            if (!resolveSourceContainer(s, room, false) && !hasSourceContainerSite(s)) {
                need++;
                // One shared hold is enough to break monopoly; avoid starving
                // extensions for multiple source containers in one tick.
                break;
            }
        }
    }
    // Cap at 1: placeEconomy only sites one container per tick anyway.
    return need > 0 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

/**
 * Bunker stamp extension tiles (world coords), unfiltered.
 * @param {Room} room
 * @returns {{x:number,y:number}[]}
 */
function getBunkerExtensionTiles(room) {
    // C4: room.hub is plan-first; getHub fallback.
    const hub = room.hub || (() => {
        try {
            return require('planDoc').getHub(room);
        } catch (e) {
            return room.memory.bunkerHub;
        }
    })();
    if (!hub) return [];
    const entry = bunkerTemplate.find(s => s.structureType === STRUCTURE_EXTENSION);
    if (!entry || !entry.pos) return [];
    const tiles = [];
    for (let i = 0; i < entry.pos.length; i++) {
        const off = entry.pos[i];
        tiles.push({x: hub.x + off.x, y: hub.y + off.y});
    }
    return tiles;
}

/**
 * Live placeable plan tiles for the room mode.
 * Dynamic: connectivity-safe plan from planExtensions.
 * Bunker: stamp tiles that currently classify as ok.
 * @param {Room} room
 * @returns {{
 *   mode: 'dynamic'|'bunker',
 *   extensions: {x:number,y:number}[],
 *   corridors: {x:number,y:number}[],
 *   fallback: {x:number,y:number}[],
 *   deficit: number,
 *   access: *|null
 * }}
 */
function computeExtensionPlan(room) {
    const deficit = getExtensionDeficit(room);
    const mode = room.memory.dynamicLayout ? 'dynamic' : 'bunker';

    if (mode === 'dynamic') {
        const extensions = getExtensionPositions(room) || [];
        const corridors = getCorridorPositions(room) || [];
        return {
            mode,
            extensions: extensions.map(p => ({x: p.x, y: p.y})),
            corridors: corridors.map(p => ({x: p.x, y: p.y})),
            fallback: [],
            deficit,
            access: {
                ok: room.memory.dynamicAccessOk,
                failed: room.memory.dynamicAccessFailed,
                skipped: room.memory.dynamicAccessSkipped,
            },
        };
    }

    // Bunker: stamp tiles still free
    const stamps = getBunkerExtensionTiles(room);
    const extensions = [];
    for (let i = 0; i < stamps.length; i++) {
        const t = stamps[i];
        const pos = new RoomPosition(t.x, t.y, room.name);
        if (classifyExtensionTile(room, pos) === 'ok') extensions.push(t);
    }

    // Fallback candidates (near-hub flood) only if stamps exhausted and deficit remains
    let fallback = [];
    if (deficit > 0 && extensions.length === 0) {
        // Lazy require to avoid expanding surface — reuse V1 near-hub flood via try path
        // by reading placeable count and letting placeRoomExtensions' candidates...
        // Instead: use bunker placeable audit + empty fallback filled at act time.
        fallback = [];
    }

    return {
        mode,
        extensions,
        corridors: [],
        fallback,
        deficit,
        access: null,
        bunkerPlaceable: countPlaceableBunkerExtensions(room),
    };
}

/**
 * Write extension plan into room.memory.plan layers (and keep rev in sync).
 * @param {Room} room
 * @param {object} [planResult] from computeExtensionPlan
 */
function syncExtensionPlanToDoc(room, planResult) {
    const plan = ensurePlan(room, {resync: false}) || getPlan(room);
    if (!plan || !plan.layers) return null;
    const result = planResult || computeExtensionPlan(room);

    plan.layers.extensions.packed = result.extensions.length
        ? packTiles(result.extensions)
        : [];
    plan.layers.extensions.rev = EXTENSION_LAYOUT_VERSION;
    plan.layers.extensions.access = result.access;

    if (result.corridors && result.corridors.length) {
        plan.layers.corridors.packed = packTiles(result.corridors);
        plan.layers.corridors.rev = EXTENSION_LAYOUT_VERSION;
    }

    plan.meta.layoutVersions = plan.meta.layoutVersions || {};
    plan.meta.layoutVersions.extensions = EXTENSION_LAYOUT_VERSION;
    plan.meta.lastSyncTick = Game.time;
    return plan;
}

// ---------------------------------------------------------------------------
// Act
// ---------------------------------------------------------------------------

function recordSkip(room, reason, extra) {
    room.memory.plannerExtensionSkip = Object.assign({
        tick: Game.time,
        reason,
        deficit: getExtensionDeficit(room),
        v2: true,
    }, extra || {});

    const plan = getPlan(room);
    if (!plan) return;

    let code = FailureCodes.PLAN_EMPTY;
    if (reason === 'no-site-budget') {
        code = FailureCodes.SITE_BUDGET_ROOM;
    } else if (reason === 'no-spawn-or-site') {
        code = FailureCodes.NO_SPAWN_ANCHOR;
    } else if (reason === 'rcl') {
        code = FailureCodes.RCL_GATE;
    } else if (reason === 'access-failed') {
        code = FailureCodes.ACCESS_FAILED;
    }

    pushFailure(plan, {
        code,
        layer: 'extensions',
        detail: room.memory.plannerExtensionSkip,
        tick: Game.time,
        source: 'planExtensions.placeExtensions',
    });
}

/**
 * Place up to `limit` extensions from candidate tiles via siteBudget.
 * @returns {number} placed count
 */
function placeFromCandidates(room, positions, limit) {
    let placed = 0;
    const shadow = isPlannerShadow(room);

    for (let i = 0; i < positions.length; i++) {
        if (placed >= limit || getExtensionDeficit(room) <= 0) break;

        const {x, y} = positions[i];
        const pos = new RoomPosition(x, y, room.name);
        if (classifyExtensionTile(room, pos) !== 'ok') continue;

        const req = siteBudget.request(room, 'extensions', 1);
        if (req.allowed < 1) {
            if (!placed) {
                recordSkip(room, 'no-site-budget', {
                    code: req.code,
                    reservedHigher: req.reservedHigher,
                    rawBudget: req.rawBudget,
                });
            }
            break;
        }

        if (shadow) {
            placed++;
            continue;
        }

        const res = siteBudget.tryPlace(room, 'extensions', pos, STRUCTURE_EXTENSION);
        if (res.ok) {
            placed++;
        } else if (res.code === FailureCodes.SITE_BUDGET_GLOBAL
            || res.code === FailureCodes.SITE_BUDGET_ROOM
            || res.code === FailureCodes.BUDGET_RESERVED_FOR_HIGHER
            || res.result === ERR_FULL
            || res.result === ERR_RCL_NOT_ENOUGH) {
            if (!placed) {
                recordSkip(room, 'no-site-budget', {code: res.code, result: res.result});
            }
            break;
        }
    }

    if (placed && !shadow) {
        try {
            require('planGeomRamparts').invalidateRampartSpots(room);
        } catch (e) { /* optional */
        }
    }
    return placed;
}

/**
 * Fallback near-hub flood (same idea as planExtensions.findExtensionCandidatesNearHub).
 * Kept local so we do not depend on a non-exported helper.
 */
function findFallbackCandidates(room) {
    // C4: room.hub is plan-first; getHub fallback.
    const hub = room.hub || (() => {
        try {
            return require('planDoc').getHub(room);
        } catch (e) {
            return room.memory.bunkerHub;
        }
    })();
    if (!hub) return [];
    const terrain = Game.map.getRoomTerrain(room.name);
    const extensions = [];
    const visited = new Set([`${hub.x},${hub.y}`]);
    const queue = [{x: hub.x, y: hub.y}];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

    while (queue.length && extensions.length < 100) {
        const cur = queue.shift();
        for (let d = 0; d < dirs.length; d++) {
            const nx = cur.x + dirs[d][0];
            const ny = cur.y + dirs[d][1];
            const key = `${nx},${ny}`;
            if (visited.has(key) || nx < 2 || nx > 47 || ny < 2 || ny > 47) continue;
            visited.add(key);
            if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) continue;
            queue.push({x: nx, y: ny});
            if ((nx + ny) % 2 !== 0) continue;
            const pos = new RoomPosition(nx, ny, room.name);
            if (classifyExtensionTile(room, pos) !== 'ok') continue;
            extensions.push({x: nx, y: ny});
        }
    }
    return extensions;
}

/**
 * Full extension placement pass for a V2 room.
 * @param {Room} room
 * @param {{max?: number}} [options]
 * @returns {{
 *   placed: number,
 *   method?: string,
 *   limit: number,
 *   deficit: number,
 *   planTiles: number,
 *   freed: number,
 *   shadow?: boolean,
 *   reason?: string,
 *   clearance?: *
 * }}
 */
function placeExtensions(room, options) {
    const opts = options || {};

    if (!room.controller || room.controller.level < 2) {
        return {placed: 0, limit: 0, deficit: 0, planTiles: 0, freed: 0, reason: 'rcl'};
    }

    if (!hasSpawnOrSpawnSite(room)) {
        recordSkip(room, 'no-spawn-or-site');
        return {
            placed: 0,
            limit: 0,
            deficit: getExtensionDeficit(room),
            planTiles: 0,
            freed: 0,
            reason: 'no-spawn-or-site'
        };
    }

    const shadow = isPlannerShadow(room);
    // Clearance can destroy wrong-type sites/structures — skip in shadow.
    const clearance = shadow ? {skipped: 'shadow'} : ensureExtensionClearance(room);
    const deficit = getExtensionDeficit(room);
    if (deficit <= 0) {
        delete room.memory.plannerExtensionSkip;
        const plan = computeExtensionPlan(room);
        syncExtensionPlanToDoc(room, plan);
        return {
            placed: 0,
            limit: 0,
            deficit: 0,
            planTiles: plan.extensions.length,
            freed: 0,
            reason: 'none-needed',
            clearance,
            shadow: shadow || undefined,
        };
    }

    // Soft reserve already done by orchestrator; request still enforces it.
    // Hold one slot for containers until storage exists (see economySiteReserve).
    const ecoReserve = economySiteReserve(room);
    const extAvailable = Math.max(0, siteBudget.available(room, 'extensions') - ecoReserve);
    let limit = Math.min(
        deficit,
        getExtensionBatchMax(room),
        extAvailable,
        opts.max != null ? opts.max : Infinity
    );

    let freed = 0;
    if (limit <= 0 && !shadow) {
        const want = Math.min(deficit, getExtensionBatchMax(room));
        freed = freeSiteSlotsForExtensions(room, want);
        const availAfter = Math.max(0, siteBudget.available(room, 'extensions') - ecoReserve);
        limit = Math.min(
            deficit,
            getExtensionBatchMax(room),
            availAfter,
            opts.max != null ? opts.max : Infinity
        );
        if (limit <= 0) {
            recordSkip(room, 'no-site-budget', {freed});
            return {
                placed: 0,
                limit: 0,
                deficit,
                planTiles: 0,
                freed,
                reason: 'no-site-budget',
                clearance,
                shadow: shadow || undefined,
            };
        }
    } else if (limit <= 0 && shadow) {
        // Shadow: do not free sites; still compute plan for diagnostics.
        recordSkip(room, 'no-site-budget', {shadow: true});
        const plan = computeExtensionPlan(room);
        syncExtensionPlanToDoc(room, plan);
        return {
            placed: 0,
            limit: 0,
            deficit,
            planTiles: plan.extensions.length,
            freed: 0,
            reason: 'no-site-budget',
            clearance,
            shadow: true,
        };
    }

    const plan = computeExtensionPlan(room);
    syncExtensionPlanToDoc(room, plan);

    let placed = 0;
    let method;

    if (plan.mode === 'dynamic') {
        placed = placeFromCandidates(room, plan.extensions, limit);
        method = placed ? 'dynamic' : undefined;
        if (!placed && deficit > 0) {
            const fallback = findFallbackCandidates(room);
            placed = placeFromCandidates(room, fallback, limit);
            if (placed) method = 'dynamic-fallback';
        }
    } else {
        placed = placeFromCandidates(room, plan.extensions, limit);
        method = placed ? 'bunker' : undefined;
        if (placed < limit && getExtensionDeficit(room) > 0) {
            const fallback = findFallbackCandidates(room);
            const more = placeFromCandidates(room, fallback, limit - placed);
            if (more) {
                placed += more;
                method = method ? 'bunker+fallback' : 'fallback';
            }
        }
    }

    // Source-pad extensions (link+container) — budgeted; V1 used raw planUtils from layout/core.
    let sourcePlaced = 0;
    if (getExtensionDeficit(room) > 0 && placed < limit) {
        const src = placeSourceExtensions(room, {max: Math.min(1, limit - placed)});
        sourcePlaced = src.placed || 0;
        if (sourcePlaced) {
            placed += sourcePlaced;
            method = method ? method + '+source' : 'source';
        }
    }

    if (placed > 0) {
        delete room.memory.plannerExtensionSkip;
        room.memory.plannerExtensionLast = {
            tick: Game.time,
            placed,
            limit,
            deficit,
            method,
            sourcePlaced: sourcePlaced || undefined,
            v2: true,
            shadow: shadow || undefined,
        };
    } else {
        recordSkip(room, 'place-failed', {
            limit,
            planTiles: plan.extensions.length,
            mode: plan.mode,
            access: plan.access,
            bunkerPlaceable: plan.bunkerPlaceable,
        });
    }

    return {
        placed,
        method,
        limit,
        deficit,
        planTiles: plan.extensions.length,
        freed,
        sourcePlaced,
        shadow: shadow || undefined,
        reason: placed ? undefined : 'place-failed',
        clearance,
    };
}

/**
 * Place source-adjacent extensions via siteBudget (parity with planExtensions.buildSourceExtensions).
 * @param {Room} room
 * @param {{max?: number}} [options]
 * @returns {{placed: number, shadow?: boolean, reason?: string}}
 */
function placeSourceExtensions(room, options) {
    const opts = options || {};
    const max = opts.max != null ? opts.max : 1;
    if (max <= 0) return {placed: 0, reason: 'max-zero'};
    if (!room.controller || room.controller.level < 2) {
        return {placed: 0, reason: 'rcl'};
    }
    if (getExtensionDeficit(room) <= 0) {
        return {placed: 0, reason: 'none-needed'};
    }

    const shadow = isPlannerShadow(room);
    let placed = 0;

    for (let n = 0; n < max; n++) {
        if (getExtensionDeficit(room) <= 0) break;

        const ok = buildSourceExtensions(room, {
            canPlace: (r) => siteBudget.available(r, 'extensions') > 0
                || isPlannerShadow(r),
            placeSite: (pos, structureType) => {
                if (structureType !== STRUCTURE_EXTENSION) {
                    return require('planUtils').tryCreateConstructionSite(pos, structureType);
                }
                if (shadow) return OK;
                const res = siteBudget.tryPlace(room, 'extensions', pos, STRUCTURE_EXTENSION);
                if (res.ok) return OK;
                if (res.code === FailureCodes.SITE_BUDGET_GLOBAL
                    || res.code === FailureCodes.SITE_BUDGET_ROOM
                    || res.code === FailureCodes.BUDGET_RESERVED_FOR_HIGHER) {
                    const plan = getPlan(room);
                    if (plan && res.code) {
                        pushFailure(plan, {
                            code: res.code,
                            layer: 'extensions',
                            detail: {x: pos.x, y: pos.y, kind: 'source-pad'},
                            tick: Game.time,
                            source: 'planExtensions.placeSourceExtensions',
                        });
                    }
                    return ERR_NOT_OWNER;
                }
                return res.result != null ? res.result : ERR_FULL;
            },
        });

        if (ok) {
            placed++;
            if (shadow) break; // one shadow attempt is enough for diagnostics
        } else {
            break;
        }
    }

    return {placed, shadow: shadow || undefined};
}

/**
 * Diagnostics for console.
 * @param {Room} room
 */
function inspectExtensions(room) {
    const plan = computeExtensionPlan(room);
    const doc = getPlan(room);
    return {
        room: room.name,
        mode: plan.mode,
        deficit: plan.deficit,
        planTiles: plan.extensions.length,
        corridorTiles: plan.corridors.length,
        sample: plan.extensions.slice(0, 8).map(p => `${p.x},${p.y}`),
        access: plan.access,
        bunkerPlaceable: plan.bunkerPlaceable,
        batchMax: getExtensionBatchMax(room),
        availableBudget: siteBudget.available(room, 'extensions'),
        hasSpawnOrSite: hasSpawnOrSpawnSite(room),
        lastSkip: room.memory.plannerExtensionSkip || null,
        lastPlace: room.memory.plannerExtensionLast || null,
        docLayer: doc && doc.layers && doc.layers.extensions
            ? {
                tiles: doc.layers.extensions.packed ? doc.layers.extensions.packed.length : 0,
                rev: doc.layers.extensions.rev
            }
            : null,
        layoutVersion: EXTENSION_LAYOUT_VERSION,
    };
}

module.exports = Object.assign({}, geom, {
    computeExtensionPlan,
    syncExtensionPlanToDoc,
    getBunkerExtensionTiles,
    placeExtensions,
    placeSourceExtensions,
    placeFromCandidates,
    inspectExtensions,
    buildSourceExtensions,
    placeExtensionsDynamically,
    placeBunkerExtensions,
    placeExtensionsFallback,
    placeRoomExtensions,
    tryPlaceRoomExtensions,
    removeInvalidExtensions,
    ensureExtensionClearance,
    ensureDynamicSpecialStructures,
    freeSiteSlotsForExtensions,
});
