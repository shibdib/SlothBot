/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Ramparts ACT (world mutate) + compat re-exports of planGeomRamparts (E4).
 *
 * Tick placement: placeRamparts / placePerimeter + siteBudget.
 */

const {ensurePlan, getPlan, packTiles, pushFailure, FailureCodes} = require('planDoc');
const siteBudget = require('planSiteBudget');
const {isPlannerShadow} = require('planFlag');
const {computeLayoutPending} = require('planLayout');

const geom = require('planGeomRamparts');
const {
    PERIMETER_PLAN_REV,
    hasPerimeterSpots,
    getPerimeterSpots,
    perimeterHasMissingBuilt,
    getBuiltBarrierKeySet,
    bunkerLevelAllowsPerimeter,
    shouldComputeBunkerRampartSpots,
    invalidateRampartSpots,
    initializeRampartSpots,
    auditRampartRecalc,
    isRemovableStrayBarrier,
    buildOrphanContext,
    isOrphanedUncachedBarrier,
    hasBarrierUnderlay,
    isOnSourcePad,
    getBorderRampartTiles,
    shouldBuildPerimeterTile,
    choosePerimeterBarrierType,
    getRampartWalkCorridors,
    resolveTowerHubList,
} = geom;

const {quadTraps} = require('planState');
const {bunkerTemplate, coreTemplate, protectedStructureTypes} = require('planTemplates');
const {
    canPlaceConstructionSite, tryCreateConstructionSite, canPlaceConstructedWall,
    isValidRampartPosition, bridgePerimeterGaps, isPerimeterBarrierTile,
    invalidateRoomConstructionSiteCache, roomConstructionSiteBudget,
    listVisibleOwnedRooms,
} = require('planUtils');

/** Wall/rampart sites for a room — room cache can miss entries; Game.constructionSites is source of truth. */
function listRoomBarrierSites(room) {
    const out = [];
    const seen = new Set();
    const add = (s) => {
        if (!s || !s.id || seen.has(s.id)) return;
        if (s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL) return;
        if (s.pos && s.pos.roomName !== room.name) return;
        seen.add(s.id);
        out.push(s);
    };
    const cached = room.constructionSites || [];
    for (let i = 0; i < cached.length; i++) add(cached[i]);
    if (typeof roomConstructionSitesFromGame === 'function') {
        const extra = roomConstructionSitesFromGame(room) || [];
        for (let i = 0; i < extra.length; i++) add(extra[i]);
    }
    if (Game.constructionSites) {
        for (const id in Game.constructionSites) add(Game.constructionSites[id]);
    }
    return out;
}

function removeBarrierSite(site) {
    try {
        return site.remove() === OK;
    } catch (e) {
        return false;
    }
}

function removeStrayPerimeterBarriers(room, perimeterSpotSet) {
    if (!perimeterSpotSet || !perimeterSpotSet.size) return 0;
    let removed = 0;

    for (const s of room.structures) {
        if (s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL) continue;
        if (!isRemovableStrayBarrier(s.pos, room, perimeterSpotSet)) continue;
        try {
            if (s.destroy() === OK) removed++;
        } catch (e) {
        }
    }

    const sites = listRoomBarrierSites(room);
    for (let i = 0; i < sites.length; i++) {
        const site = sites[i];
        if (!isRemovableStrayBarrier(site.pos, room, perimeterSpotSet)) continue;
        if (removeBarrierSite(site)) removed++;
    }
    if (removed) invalidateRoomConstructionSiteCache(room);

    if (removed && room.memory.quadTrapWalls && room.memory.quadTrapWalls.length) {
        const before = room.memory.quadTrapWalls.length;
        room.memory.quadTrapWalls = room.memory.quadTrapWalls.filter(p =>
            !isRemovableStrayBarrier(new RoomPosition(p.x, p.y, room.name), room, perimeterSpotSet));
        if (room.memory.quadTrapWalls.length < before) quadTraps[room.name] = undefined;
    }

    return removed;
}

/**
 * Opportunistic cleanup of bare off-plan walls/ramparts (no floodfill recompute).
 * Cap destroys per call so we don't open the base or thrash CPU in one tick.
 * @param {Room} room
 * @param {{maxDestroy?: number}} [options]
 * @returns {{removed: number, orphans: number, strays: number, stale: number, reason?: string}}
 */
function cleanupOffPlanBarriers(room, options) {
    const opts = options || {};
    const maxDestroy = opts.maxDestroy != null ? opts.maxDestroy : 8;

    // Hard stop when bucket is already bleeding — this scan is optional hygiene.
    const bucket = Game.cpu && Game.cpu.bucket != null ? Game.cpu.bucket : 10000;
    if (bucket < 2000 && !opts.force) {
        return {removed: 0, orphans: 0, strays: 0, stale: 0, reason: 'low_bucket'};
    }

    const spots = getPerimeterSpots(room.name);
    if (!spots.length) {
        return {removed: 0, orphans: 0, strays: 0, stale: 0, reason: 'no_plan'};
    }
    const planSet = new Set(spots.map(p => `${p.x},${p.y}`));
    const ctx = buildOrphanContext(room, planSet);
    let orphans = 0;
    let strays = 0;
    let stale = 0;
    let removed = 0;

    const tryDestroy = (obj, kind) => {
        if (removed >= maxDestroy) return false;
        try {
            const result = obj.destroy ? obj.destroy() : obj.remove();
            if (result === OK) {
                removed++;
                if (kind === 'orphan') orphans++;
                else if (kind === 'stray') strays++;
                else stale++;
                return true;
            }
        } catch (e) { /* ignore */
        }
        return false;
    };

    for (const s of room.structures || []) {
        if (removed >= maxDestroy) break;
        if (s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL) continue;
        if (isOrphanedUncachedBarrier(s.pos, room, planSet, ctx)) {
            tryDestroy(s, 'orphan');
            continue;
        }
        if (isRemovableStrayBarrier(s.pos, room, planSet)) {
            tryDestroy(s, 'stray');
        }
    }
    const sites = listRoomBarrierSites(room);
    for (let i = 0; i < sites.length; i++) {
        if (removed >= maxDestroy) break;
        const site = sites[i];
        if (isOrphanedUncachedBarrier(site.pos, room, planSet, ctx)
            || isRemovableStrayBarrier(site.pos, room, planSet)) {
            if (removeBarrierSite(site)) {
                removed++;
                strays++;
            }
        }
    }

    if (removed) {
        quadTraps[room.name] = undefined;
        room._barrierKeySet = undefined;
        room._barrierKeySetTick = undefined;
        invalidateRoomConstructionSiteCache(room);
    }
    return {removed, orphans, strays, stale};
}

function removeUncachedPerimeterBarriers(room, newSpotSet) {
    if (!newSpotSet || !newSpotSet.size) return 0;
    let removed = 0;
    const ctx = buildOrphanContext(room, newSpotSet);

    for (const s of room.structures) {
        if (s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL) continue;
        if (!isOrphanedUncachedBarrier(s.pos, room, newSpotSet, ctx)) continue;
        try {
            if (s.destroy() === OK) removed++;
        } catch (e) {
        }
    }

    const sites = listRoomBarrierSites(room);
    for (let i = 0; i < sites.length; i++) {
        const site = sites[i];
        if (!isOrphanedUncachedBarrier(site.pos, room, newSpotSet, ctx)) continue;
        if (removeBarrierSite(site)) removed++;
    }
    if (removed) invalidateRoomConstructionSiteCache(room);

    if (removed && room.memory.quadTrapWalls && room.memory.quadTrapWalls.length) {
        const before = room.memory.quadTrapWalls.length;
        room.memory.quadTrapWalls = room.memory.quadTrapWalls.filter(p =>
            !isOrphanedUncachedBarrier(new RoomPosition(p.x, p.y, room.name), room, newSpotSet, ctx));
        if (room.memory.quadTrapWalls.length < before) quadTraps[room.name] = undefined;
    }

    return removed;
}

function removeStalePerimeterBarriers(room, oldSpotSet, newSpotSet) {
    if (!oldSpotSet || !oldSpotSet.size) return 0;
    const isStale = (x, y) => oldSpotSet.has(`${x},${y}`) && !newSpotSet.has(`${x},${y}`);
    let removed = 0;

    for (const s of room.structures) {
        if (s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL) continue;
        if (!isStale(s.pos.x, s.pos.y)) continue;
        // Don't strip structure covers when the plan ring moves off a building tile.
        if (hasBarrierUnderlay(s.pos)) continue;
        try {
            if (s.destroy() === OK) removed++;
        } catch (e) {
        }
    }

    const sites = listRoomBarrierSites(room);
    for (let i = 0; i < sites.length; i++) {
        const site = sites[i];
        if (!isStale(site.pos.x, site.pos.y)) continue;
        if (removeBarrierSite(site)) removed++;
    }
    if (removed) invalidateRoomConstructionSiteCache(room);

    if (room.memory.quadTrapWalls && room.memory.quadTrapWalls.length) {
        const before = room.memory.quadTrapWalls.length;
        room.memory.quadTrapWalls = room.memory.quadTrapWalls.filter(p => !isStale(p.x, p.y));
        if (room.memory.quadTrapWalls.length < before) quadTraps[room.name] = undefined;
    }

    return removed;
}


function purgeOrphanBarriers(room) {
    if (!ROOM_RAMPART_SPOTS || !ROOM_RAMPART_SPOTS[room.name]) {
        return recalculateRampartsForRoom(room);
    }
    let spots;
    try {
        spots = JSON.parse(ROOM_RAMPART_SPOTS[room.name]);
    } catch (e) {
        return recalculateRampartsForRoom(room);
    }
    if (!spots || !spots.length) return recalculateRampartsForRoom(room);

    const perimeterSpotSet = new Set(spots.map(p => `${p.x},${p.y}`));
    // Always run both — old code bailed when stray audit was empty and never cleared orphans.
    const removedOrphans = removeUncachedPerimeterBarriers(room, perimeterSpotSet);
    const removedStrays = removeStrayPerimeterBarriers(room, perimeterSpotSet);
    const removed = removedOrphans + removedStrays;
    if (removed) quadTraps[room.name] = undefined;
    return {
        removed,
        removedOrphans,
        removedStrays,
        ...auditStrayBarriers(room, spots),
        orphansLeft: auditOrphanBarriers(room).count,
    };
}

/**
 * Recompute perimeter plan for a room.
 * @param {Room} room
 * @param {*} [layout]
 * @param {{destroyOffPlan?: boolean}} [options]
 *   destroyOffPlan (default true): remove walls/ramparts not on the new plan.
 *   Pass false from extension clearance — that only changes extension packing and must
 *   NOT mass-delete a full constructed wall ring when the flood contour shifts.
 */
function recalculateRampartsForRoom(room, layout, options = {}) {
    const destroyOffPlan = options.destroyOffPlan !== false;
    const tmpl = layout || (room.memory.dynamicLayout ? coreTemplate : bunkerTemplate);
    const oldSpots = ROOM_RAMPART_SPOTS && ROOM_RAMPART_SPOTS[room.name]
        ? JSON.parse(ROOM_RAMPART_SPOTS[room.name])
        : [];
    const oldSpotSet = new Set(oldSpots.map(p => `${p.x},${p.y}`));

    invalidateRampartSpots(room);

    if (room.memory.dynamicLayout) {
        require('planGeomExtensions').getExtensionPositions(room);
    }

    if (shouldComputeBunkerRampartSpots(room)) {
        initializeRampartSpots(room, tmpl, false);
    }

    let newSpots = ROOM_RAMPART_SPOTS && ROOM_RAMPART_SPOTS[room.name]
        ? JSON.parse(ROOM_RAMPART_SPOTS[room.name])
        : [];
    let restoredFromOld = false;
    let restoreReason;
    if (!newSpots.length && oldSpots.length) {
        ROOM_RAMPART_SPOTS[room.name] = JSON.stringify(oldSpots);
        newSpots = oldSpots;
        restoredFromOld = true;
        restoreReason = 'empty_regen';
        log.w(`${room.name} rampart regen produced 0 spots; restored ${oldSpots.length} cached spots`);
    }

    const newSpotSet = new Set(newSpots.map(p => `${p.x},${p.y}`));
    let removedBarriers = 0;
    let removedOrphans = 0;
    let removedStrays = 0;
    let removedStale = 0;

    // Strip barriers that are not on the new plan whenever we have a valid plan.
    // Still skip mass destroy when we had to restore the old plan (would open the base).
    // Callers like extension clearance must pass destroyOffPlan:false.
    const canDestroyOffPlan = destroyOffPlan
        && !restoredFromOld
        && newSpotSet.size > 0
        && shouldComputeBunkerRampartSpots(room);

    if (canDestroyOffPlan) {
        // Off-plan bare walls/ramparts always go (old rings, exterior junk).
        removedOrphans = removeUncachedPerimeterBarriers(room, newSpotSet);
        removedStrays = removeStrayPerimeterBarriers(room, newSpotSet);
        // Stale plan tiles: removeStale already skips structure covers (hasBarrierUnderlay).
        // Always clean bare walls when the plan moves — waiting on energyState left multi-ring
        // waste for entire energy-poor periods.
        removedStale = removeStalePerimeterBarriers(room, oldSpotSet, newSpotSet);
        removedBarriers = removedOrphans + removedStrays + removedStale;
    }

    if (removedBarriers) {
        const detail = [];
        if (removedOrphans) detail.push(`${removedOrphans} orphan(s)`);
        if (removedStrays) detail.push(`${removedStrays} stray(s)`);
        if (removedStale) detail.push(`${removedStale} stale plan(s)`);
        const detailText = detail.length ? ` (${detail.join(', ')})` : '';
        log.a(`${room.name} removed ${removedBarriers} off-plan perimeter barrier(s)${detailText}`);
        quadTraps[room.name] = undefined;
    } else if (!destroyOffPlan && newSpotSet.size > 0 && oldSpotSet.size > 0) {
        // Plan updated without destroy — wallers keep existing walls until rebuildBarriers/purge.
        if (Game.time % 50 === 0) {
            log.a(`${room.name} rampart plan refreshed (${newSpots.length} spots) without destroying barriers`, 'PLANNER');
        }
    }

    return {
        spots: newSpots.length,
        removedBarriers,
        removedOrphans,
        removedStrays,
        removedStale,
        restoredFromOld,
        restoreReason,
        destroyOffPlan: !!canDestroyOffPlan,
        audit: auditRampartRecalc(room, tmpl),
    };
}

/**
 * Destroy every constructed wall / rampart / barrier site in a room and
 * drop the cached perimeter plan. Used for algorithm version bumps.
 */
function wipeRoomBarriers(room) {
    if (!room) return 0;
    let destroyed = 0;
    // room.structures / roomStructuresFromGame can omit walls on safe-find
    // rooms; collectRoomBarriers is the thorough scan used by clearOwnedBarriers.
    const barriers = (typeof collectRoomBarriers === 'function'
        ? collectRoomBarriers(room)
        : (room.barriers || []));
    for (let i = 0; i < barriers.length; i++) {
        const s = barriers[i];
        if (!s || (s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL)) continue;
        try {
            if (s.destroy() === OK) destroyed++;
        } catch (e) { /* ignore */
        }
    }
    const sites = listRoomBarrierSites(room);
    for (let i = 0; i < sites.length; i++) {
        if (removeBarrierSite(sites[i])) destroyed++;
    }
    if (ROOM_RAMPART_SPOTS) ROOM_RAMPART_SPOTS[room.name] = undefined;
    quadTraps[room.name] = undefined;
    if (room.memory) {
        room.memory.quadTrapWalls = undefined;
        room.memory._barrierKeySet = undefined;
        room.memory._perimeterPlaceFails = undefined;
    }
    room._barrierKeySet = undefined;
    room._barrierKeySetTick = undefined;
    if (room._invalidateStructureCaches) room._invalidateStructureCaches();
    invalidateRoomConstructionSiteCache(room);
    return destroyed;
}

/**
 * One-shot empire wipe when RAMPART_VERSION changes.
 * Tears down old min-cut rings (walls + ramparts + sites) and seeds the
 * hub-floodfill plan for every visible owned room.
 */
function migrateRampartVersion() {
    if (typeof RAMPART_VERSION === 'undefined') return false;
    if (Memory.rampartVersion === RAMPART_VERSION) return false;
    Memory.rampartVersion = RAMPART_VERSION;
    const rooms = listVisibleOwnedRooms();
    let wiped = 0;
    for (let i = 0; i < rooms.length; i++) {
        const room = rooms[i];
        wiped += wipeRoomBarriers(room);
        if (room.memory) room.memory.perimeterPlanRev = PERIMETER_PLAN_REV;
        if (shouldComputeBunkerRampartSpots(room)) {
            try {
                initializeRampartSpots(room, room.memory.dynamicLayout ? coreTemplate : bunkerTemplate, false);
            } catch (e) {
                if (typeof log !== 'undefined' && log.e) {
                    log.e(`${room.name} perimeter migrate init failed: ${e && e.stack ? e.stack : e}`, 'PLANNER');
                }
            }
        }
    }
    if (typeof invalidateStructureRoomCaches === 'function') invalidateStructureRoomCaches();
    if (typeof log !== 'undefined' && log.a) {
        log.a(`Rampart v${RAMPART_VERSION}: wiped ${wiped} barrier(s) in ${rooms.length} room(s)`, 'PLANNER');
    }
    return true;
}

/**
 * @param {Room} room
 * @param {*} [layout]
 * @param {boolean} [count]
 * @param {{
 *   skipPerimeter?: boolean,
 *   skipProtective?: boolean,
 *   skipQuad?: boolean,
 *   placeSite?: (pos: RoomPosition, structureType: string) => number,
 *   maxPerimeterPlace?: number,
 *   layoutPending?: boolean,
 *   placementLimit?: (room: Room, layoutPending: boolean) => number,
 *   report?: object,
 * }} [options]
 *   placeSite injects siteBudget for perimeter + protective + quad.
 *   skipPerimeter: V2 already placed the seal via placePerimeter.
 */
function rampartBuilder(room, layout = undefined, count = false, options = {}) {
    const opts = options || {};
    const placeFn = typeof opts.placeSite === 'function'
        ? opts.placeSite
        : tryCreateConstructionSite;

    migrateRampartVersion();

    // Bunker perimeter: always plan/place when RCL allows — do not wait on energyState
    // (energy-poor rooms otherwise keep permanent holes after a redo/recalc).
    // Protective extras (on structures / sources) still require energyState.
    // Use controller.level (not energy-tier room.level) so incomplete extensions never stall seals.
    if (bunkerLevelAllowsPerimeter(room)) {
        if (!opts.skipPerimeter && handleBunkerRamparts(room, layout, count)) return true;
        if (!opts.skipProtective && room.energyState && buildProtectiveRamparts(room, layout)) return true;
    }

    // Handle quad traps — RCL8 only, walls capped at 20k
    if (!opts.skipQuad && room.level >= 8 && room.energyState && buildQuadTraps(room)) {
        return true;
    }

    function handleBunkerRamparts(room, layout, count) {
        // "[]" is truthy — must treat empty list as missing or we never recompute.
        if (!hasPerimeterSpots(room.name)) {
            return initializeRampartSpots(room, layout, count);
        }
        // Layout path: place a few sites; bridging already done at init/recalc.
        const placeOpts = {
            maxPlace: opts.maxPerimeterPlace != null ? opts.maxPerimeterPlace : 3,
            bridge: false,
            allowInit: false,
            recordStatus: false,
            layoutPending: opts.layoutPending,
            report: opts.report,
            placeSite: placeFn,
        };
        if (typeof opts.placementLimit === 'function') placeOpts.placementLimit = opts.placementLimit;
        return ensurePerimeterSites(room, placeOpts) > 0;
    }

    function buildProtectiveRamparts(room, layout) {
        const ramparts = ROOM_RAMPART_SPOTS && ROOM_RAMPART_SPOTS[room.name] ? JSON.parse(ROOM_RAMPART_SPOTS[room.name]) : undefined;
        if (!ramparts || !ramparts.length) return false;
        let counter = 0;
        if (buildBorderStructureRamparts(room, layout)) return true;
        // Cheby nearest-plan lookup (O(plan)) instead of findClosestByRange per structure
        // (engine path × vulnerable count — melted CPU on RCL8 rooms).
        const planKeys = ramparts;
        const nearestPlanRange = (x, y) => {
            let best = Infinity;
            for (let i = 0; i < planKeys.length; i++) {
                const p = planKeys[i];
                const d = Math.max(Math.abs(x - p.x), Math.abs(y - p.y));
                if (d < best) best = d;
                if (best === 0) break;
            }
            return best;
        };
        const vulnerableStructures = room.structures.filter((s) =>
            protectedStructureTypes.includes(s.structureType) &&
            !s.pos.checkForRampart() &&
            !s.pos.checkForConstructionSites());
        for (const structure of vulnerableStructures) {
            if (counter >= 3) return true;
            const rangeFromRampart = nearestPlanRange(structure.pos.x, structure.pos.y);
            const inBunker = structure.pos.isInBunker();
            if ((rangeFromRampart <= 3 && inBunker) || !inBunker) {
                if (!canPlaceConstructionSite(room)) return true;
                const result = placeFn(structure.pos, STRUCTURE_RAMPART);
                if (result === OK) counter++;
                else if (result === ERR_NOT_OWNER || result === ERR_FULL) return true;
            }
        }
        if (room.level >= SPECIAL_RAMPARTS) {
            if (PROTECT_SOURCES) {
                for (let source of room.sources) {
                    if (source.pos.isInBunker()) continue;
                    if (counter >= 3) return true;
                    if (buildRampartAround(source.pos)) counter++;
                }
            }
            if (PROTECT_MINERAL && !room.mineral.pos.isInBunker()) {
                if (counter >= 3) return true;
                if (buildRampartAround(room.mineral.pos)) counter++;
            }
            if (PROTECT_CONTROLLER && !room.controller.pos.isInBunker()) {
                if (counter >= 3) return true;
                if (buildRampartAround(room.controller.pos)) counter++;
            }
            // Handle ramparts on protected structures
            if (PROTECT_STRUCTURES && room.level >= 8) {
                for (let structure of room.structures) {
                    if (counter >= 3) return true;
                    if (protectedStructureTypes.includes(structure.structureType)) {
                        if (!structure.pos.checkForRampart() && !structure.pos.checkForConstructionSites()) {
                            if (!canPlaceConstructionSite(room)) return true;
                            const result = placeFn(structure.pos, STRUCTURE_RAMPART);
                            if (result === OK) counter++;
                            else if (result === ERR_NOT_OWNER || result === ERR_FULL) return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    function buildBorderStructureRamparts(room, layout) {
        const tiles = getBorderRampartTiles(room, layout);
        let counter = 0;
        for (const {x, y} of tiles) {
            if (counter >= 3) return true;
            const pos = new RoomPosition(x, y, room.name);
            if (pos.checkForRampart()) continue;
            if (pos.lookFor(LOOK_CONSTRUCTION_SITES).some((s) => s.structureType === STRUCTURE_RAMPART)) continue;
            const hasStructure = pos.lookFor(LOOK_STRUCTURES).some((s) =>
                s.structureType !== STRUCTURE_ROAD &&
                s.structureType !== STRUCTURE_RAMPART &&
                s.structureType !== STRUCTURE_WALL);
            const hasSite = pos.lookFor(LOOK_CONSTRUCTION_SITES).some((s) =>
                s.structureType !== STRUCTURE_RAMPART &&
                s.structureType !== STRUCTURE_WALL);
            if (!hasStructure && !hasSite) continue;
            if (!canPlaceConstructionSite(room)) return true;
            const result = placeFn(pos, STRUCTURE_RAMPART);
            if (result === OK) counter++;
            else if (result === ERR_NOT_OWNER || result === ERR_FULL) return true;
        }
        return counter > 0;
    }

    function buildQuadTraps(room) {
        if (!quadTraps[room.name]) setQuadTraps(room);
        if (!quadTraps[room.name] || !quadTraps[room.name].length) return false;

        const QUAD_WALL_CAP = 20000;
        let counter = 0;
        const newWallPositions = room.memory.quadTrapWalls ? new Set(room.memory.quadTrapWalls.map(p => `${p.x},${p.y}`)) : new Set();

        for (const trap of quadTraps[room.name]) {
            if (counter >= 3) return true;
            const pos = new RoomPosition(trap.x, trap.y, room.name);
            if (pos.checkForWall()) continue;
            if (pos.isNearTo(room.controller) || pos.isNearTo(room.mineral) ||
                room.sources.some(s => pos.isNearTo(s))) continue;
            if (room.towers.some(t => pos.getRangeTo(t) <= 2)) continue;
            if (resolveTowerHubList(room).some(h => Math.max(Math.abs(pos.x - h.x), Math.abs(pos.y - h.y)) <= 2)) continue;
            if (room.extensions.some(e => pos.getRangeTo(e) <= 1 && room.sources.some(s => e.pos.getRangeTo(s) <= 2))) continue;
            if (isOnSourcePad(pos, room)) continue;

            const isWallTile = (pos.x + pos.y) % 2 === 0;
            if (isWallTile) {
                // Skip if wall already exists at or above the cap
                const existing = pos.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_WALL);
                if (existing && existing.hits >= QUAD_WALL_CAP) continue;
                if (existing || pos.checkForConstructionSites()) continue;
                if (!canPlaceConstructionSite(room)) return true;
                if (!canPlaceConstructedWall(pos)) continue;
                const result = placeFn(pos, STRUCTURE_WALL);
                if (result === OK) {
                    counter++;
                    if (!newWallPositions.has(`${pos.x},${pos.y}`)) {
                        newWallPositions.add(`${pos.x},${pos.y}`);
                        if (!room.memory.quadTrapWalls) room.memory.quadTrapWalls = [];
                        room.memory.quadTrapWalls.push({x: pos.x, y: pos.y});
                    }
                } else if (result === ERR_NOT_OWNER || result === ERR_FULL) {
                    return true;
                }
            }
        }
        return counter > 0;
    }

    function setQuadTraps(room) {
        if (!ROOM_RAMPART_SPOTS[room.name]) return false;
        const ramparts = JSON.parse(ROOM_RAMPART_SPOTS[room.name]);
        if (!ramparts || !ramparts.length) return;
        const hub = room.hub;
        const terrain = Game.map.getRoomTerrain(room.name);
        const trapLocations = [];

        for (const {x, y} of ramparts) {
            // Push one tile outward from the hub (away from centre)
            const dx = x === hub.x ? 0 : (x < hub.x ? -1 : 1);
            const dy = y === hub.y ? 0 : (y < hub.y ? -1 : 1);
            const nx = x + dx, ny = y + dy;
            if (nx < 1 || nx > 48 || ny < 1 || ny > 48) continue;
            if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) continue;
            const pos = new RoomPosition(nx, ny, room.name);
            if (pos.lookFor(LOOK_STRUCTURES).some(s => OBSTACLE_OBJECT_TYPES.includes(s.structureType))) continue;
            trapLocations.push({x: nx, y: ny});
        }
        quadTraps[room.name] = trapLocations;
    }


    function addExistingRampartsToSpots(room, spots) {
        // Only add existing ramparts or walls once
        let existingRamparts = room.ramparts.concat(room.constructedWalls).filter(Boolean);
        existingRamparts.forEach((b) => spots.push({x: b.pos.x, y: b.pos.y}));
    }

    function isNearProtectedStructure(pos, room) {
        return pos.isNearTo(room.controller) || pos.isNearTo(room.mineral) || pos.isNearTo(pos.findClosestByRange(FIND_SOURCES));
    }

    function buildRampartAround(position) {
        // Loop through a 3x3 area around the position
        for (let xOff = -1; xOff <= 1; xOff++) {
            for (let yOff = -1; yOff <= 1; yOff++) {
                // Skip the center position
                if (xOff === 0 && yOff === 0) continue;

                let targetPos = new RoomPosition(position.x + xOff, position.y + yOff, position.roomName);

                // Check if the position is valid for placing a rampart
                if (isValidRampartPosition(targetPos)) {
                    if (!canPlaceConstructionSite(Game.rooms[targetPos.roomName])) return false;
                    const result = placeFn(targetPos, STRUCTURE_RAMPART);
                    if (result === OK) return true;
                    if (result === ERR_NOT_OWNER || result === ERR_FULL) return false;
                    return false;
                }
            }
        }
        return false; // Return false if no valid position was found
    }
}

function freeSiteSlotsForPerimeter(room, want) {
    if (want <= 0 || canPlaceConstructionSite(room)) return 0;
    // Never cannibalize extensions while the room still needs energy capacity.
    // After a wipe, incomplete perimeters used to delete extension sites every tick.
    let extDeficit = 0;
    try {
        extDeficit = require('planGeomExtensions').getExtensionDeficit(room);
    } catch (e) { /* ignore circular load */
    }
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
    // Prefer idle low-priority sites. Never remove spawn/tower/terminal sites.
    // Extensions only when the room is already at full extension count (deficit 0).
    // Roads always first — ensureOwnedRoadsProgress can fill the room cap and leave seals empty.
    const prefer = extDeficit > 0
        ? [STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_LINK]
        : [STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_EXTENSION, STRUCTURE_LINK];
    for (const type of prefer) {
        if (freed >= want) break;
        removeSites(room.constructionSites.filter(s => s.structureType === type && !s.progress));
    }
    // In-progress road sites are kept — they re-queue slowly and drones already spent energy.
    if (freed) {
        invalidateRoomConstructionSiteCache(room);
        log.a(`${room.name} removed ${freed} site(s) to free slots for perimeter barriers`, 'PLANNER');
    }
    return freed;
}

function recordPerimeterPlaceStatus(room, status) {
    room.memory._perimeterPlaceFails = {
        tick: Game.time,
        ...status,
    };
}

const LEAK_OCTALS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

/**
 * Place tiles on a live hub→exit leak first, then isolated gaps.
 * Blocked set is built+sites only — missing plan tiles are the holes we want.
 */
function sortPerimeterBuildPositions(room, buildPositions, built, barrierSiteKeys) {
    const hub = room.hub;
    if (!hub || !buildPositions.length) return;
    const terrain = Game.map.getRoomTerrain(room.name);
    const blocked = new Set();
    if (built) {
        for (const k of built) blocked.add(k);
    }
    if (barrierSiteKeys) {
        for (const k of barrierSiteKeys) blocked.add(k);
    }

    const walkable = (x, y) => {
        if (x < 0 || x > 49 || y < 0 || y > 49) return false;
        if (terrain.get(x, y) & TERRAIN_MASK_WALL) return false;
        if (blocked.has(x + ',' + y)) return false;
        return true;
    };

    const q = [hub.x, hub.y];
    const seen = new Set([hub.x + ',' + hub.y]);
    const parent = Object.create(null);
    let leakKey = null;
    let qi = 0;
    while (qi < q.length && !leakKey) {
        const x = q[qi++];
        const y = q[qi++];
        if (x === 0 || y === 0 || x === 49 || y === 49) {
            leakKey = x + ',' + y;
            break;
        }
        for (let i = 0; i < 8; i++) {
            const nx = x + LEAK_OCTALS[i][0];
            const ny = y + LEAK_OCTALS[i][1];
            const k = nx + ',' + ny;
            if (seen.has(k) || !walkable(nx, ny)) continue;
            seen.add(k);
            parent[k] = x + ',' + y;
            if (nx === 0 || ny === 0 || nx === 49 || ny === 49) {
                leakKey = k;
                break;
            }
            q.push(nx, ny);
        }
    }

    const leakSet = new Set();
    const leakNear = new Set();
    if (leakKey) {
        let cur = leakKey;
        let guard = 0;
        while (cur && guard++ < 2500) {
            leakSet.add(cur);
            const comma = cur.indexOf(',');
            const cx = Number(cur.slice(0, comma));
            const cy = Number(cur.slice(comma + 1));
            for (let i = 0; i < 8; i++) {
                leakNear.add((cx + LEAK_OCTALS[i][0]) + ',' + (cy + LEAK_OCTALS[i][1]));
            }
            if (cur === hub.x + ',' + hub.y) break;
            cur = parent[cur];
        }
    }

    const score = (pos) => {
        const k = pos.x + ',' + pos.y;
        if (leakSet.has(k)) return 0;
        if (leakNear.has(k)) return 1;
        let sealedNeighbors = 0;
        for (let i = 0; i < 8; i++) {
            const nk = (pos.x + LEAK_OCTALS[i][0]) + ',' + (pos.y + LEAK_OCTALS[i][1]);
            if (blocked.has(nk)) sealedNeighbors++;
        }
        return 2 + sealedNeighbors;
    };

    buildPositions.sort((a, b) => score(a) - score(b));
}

/**
 * Place barrier construction sites for missing perimeter tiles.
 * Keep this lean: no floodfill recompute, no pathfinding unless wall fallback needs corridors.
 *
 * @param {Room} room
 * @param {{
 *   maxPlace?: number,
 *   bridge?: boolean,
 *   allowInit?: boolean,
 *   recordStatus?: boolean,
 *   layoutPending?: boolean,
 *   placementLimit?: (room: Room, layoutPending: boolean) => number,
 *   placeSite?: (pos: RoomPosition, structureType: string) => number,
 *   report?: object,
 * }} [options]
 *   placementLimit / placeSite hooks let planner V2 inject siteBudget without
 *   forking floodfill / checkerboard logic.
 * @returns {number} sites placed this call
 */
/**
 * Place barrier construction sites for missing perimeter tiles.
 * Keep this lean: no floodfill recompute, no pathfinding unless wall fallback needs corridors.
 *
 * @param {Room} room
 * @param {{
 *   maxPlace?: number,
 *   bridge?: boolean,
 *   allowInit?: boolean,
 *   recordStatus?: boolean,
 *   layoutPending?: boolean,
 *   placementLimit?: (room: Room, layoutPending: boolean) => number,
 *   placeSite?: (pos: RoomPosition, structureType: string) => number,
 *   report?: object,
 * }} [options]
 *   placementLimit / placeSite hooks let planner V2 inject siteBudget without
 *   forking floodfill / checkerboard logic.
 * @returns {number} sites placed this call
 */
function ensurePerimeterSites(room, options = {}) {
    const maxPlace = options.maxPlace != null ? options.maxPlace : 8;
    const placeFn = typeof options.placeSite === 'function'
        ? options.placeSite
        : tryCreateConstructionSite;
    const layoutPending = !!options.layoutPending;

    if (!room) {
        if (options.report) {
            options.report.placed = 0;
            options.report.reason = 'no_room';
        }
        return 0;
    }
    if (!bunkerLevelAllowsPerimeter(room)) {
        if (options.recordStatus) {
            recordPerimeterPlaceStatus(room, {
                reason: 'rcl_too_low',
                rcl: room.controller && room.controller.level,
                roomLevel: room.level,
                bunkerLevel: BUNKER_LEVEL,
                placed: 0,
            });
        }
        if (options.report) {
            options.report.placed = 0;
            options.report.reason = 'rcl_too_low';
        }
        return 0;
    }

    migrateRampartVersion();
    // Geometry tweaks replan and strip off-plan tiles. Full wipe is RAMPART_VERSION only.
    if (room.memory.perimeterPlanRev !== PERIMETER_PLAN_REV) {
        try {
            recalculateRampartsForRoom(room, undefined, {destroyOffPlan: true});
        } catch (e) {
            if (typeof log !== 'undefined' && log.e) {
                log.e(`${room.name} perimeter rev replan failed: ${e && e.stack ? e.stack : e}`, 'PLANNER');
            }
        }
        room.memory.perimeterPlanRev = PERIMETER_PLAN_REV;
    }

    let spots = getPerimeterSpots(room.name);
    if (!spots.length) {
        // Only recompute floodfill when explicitly requested — never on the every-tick path.
        if (!options.allowInit) {
            if (options.recordStatus) recordPerimeterPlaceStatus(room, {reason: 'no_spots', placed: 0});
            if (options.report) {
                options.report.placed = 0;
                options.report.reason = 'no_spots';
            }
            return 0;
        }
        ROOM_RAMPART_SPOTS[room.name] = undefined;
        initializeRampartSpots(room, room.memory.dynamicLayout ? coreTemplate : bunkerTemplate, false);
        spots = getPerimeterSpots(room.name);
        if (!spots.length) {
            if (options.recordStatus) recordPerimeterPlaceStatus(room, {reason: 'no_spots', placed: 0});
            if (options.report) {
                options.report.placed = 0;
                options.report.reason = 'no_spots';
            }
            return 0;
        }
    }

    // Bridging is O(room) flood-fill — only during init/recalc, never every placement tick.
    if (options.bridge) {
        const bridged = bridgePerimeterGaps(room, spots.slice());
        if (bridged.length !== spots.length) {
            ROOM_RAMPART_SPOTS[room.name] = JSON.stringify(bridged);
            spots = bridged;
        }
    }

    const built = getBuiltBarrierKeySet(room);
    const barrierSiteKeys = new Set();
    const sites = room.constructionSites || [];
    let inBuild = 0;
    for (let i = 0; i < sites.length; i++) {
        const s = sites[i];
        if (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) {
            inBuild++;
            barrierSiteKeys.add(s.pos.x + ',' + s.pos.y);
        }
    }

    const buildPositions = [];
    for (let i = 0; i < spots.length; i++) {
        const p = spots[i];
        const key = p.x + ',' + p.y;
        if (built.has(key) || barrierSiteKeys.has(key)) continue;
        buildPositions.push(new RoomPosition(p.x, p.y, room.name));
    }
    if (buildPositions.length > 1) {
        sortPerimeterBuildPositions(room, buildPositions, built, barrierSiteKeys);
    }
    if (!buildPositions.length) {
        if (options.recordStatus) {
            recordPerimeterPlaceStatus(room, {reason: 'nothing_to_build', placed: 0, planned: spots.length});
        }
        if (options.report) {
            options.report.placed = 0;
            options.report.missing = 0;
            options.report.planned = spots.length;
            options.report.complete = true;
            options.report.reason = 'nothing_to_build';
        }
        return 0;
    }

    // V2: placementLimit replaces energy/extReserve siteCap (siteBudget owns reserves).
    let siteCap;
    if (typeof options.placementLimit === 'function') {
        const allowedNew = options.placementLimit(room, layoutPending);
        siteCap = inBuild + Math.max(0, allowedNew | 0);
    } else {
        // Incomplete perimeters always get a real site budget even at energyState 0.
        siteCap = Math.min(maxPlace, room.energyState >= 2 ? 10 : room.energyState ? 6 : 5);
        if (buildPositions.length > 0) {
            siteCap = Math.max(siteCap, Math.min(maxPlace, 5));
        }

        // Reserve site slots for extensions only while capacity is still badly incomplete.
        // deficit>0 used to zero barrier placement at roomCap 5 whenever any extension was missing.
        let extReserve = 0;
        try {
            const deficit = require('planGeomExtensions').getExtensionDeficit(room);
            if (deficit > 5) extReserve = Math.min(deficit, 3);
        } catch (e) { /* ignore circular load */
        }
        if (extReserve > 0) {
            const roomCap = (typeof MAX_CONSTRUCTION_SITES_PER_ROOM !== 'undefined'
                ? MAX_CONSTRUCTION_SITES_PER_ROOM : 10);
            const nonBarrierSites = (room.constructionSites || []).filter(s =>
                s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL).length;
            // Leave room for reserved extension slots among non-barrier + new barriers.
            const barrierBudget = Math.max(0, roomCap - nonBarrierSites - extReserve);
            siteCap = Math.min(siteCap, barrierBudget + inBuild);
        }
    }

    const want = Math.max(0, siteCap - inBuild);
    if (want <= 0) {
        if (options.report) {
            options.report.placed = 0;
            options.report.missing = buildPositions.length;
            options.report.siteCap = siteCap;
            options.report.inBuild = inBuild;
            options.report.limit = 0;
            options.report.layoutPending = layoutPending;
            options.report.reason = 'limit-zero';
        }
        return 0;
    }

    if (!canPlaceConstructionSite(room)) {
        freeSiteSlotsForPerimeter(room, Math.min(want, 5));
    }

    let cycles = 0;
    const fails = [];
    let budgetBlocked = false;
    let corridors = null; // lazy — only if wall fallback is needed

    for (let i = 0; i < buildPositions.length; i++) {
        const pos = buildPositions[i];
        if (cycles + inBuild >= siteCap) break;

        const buildOk = shouldBuildPerimeterTile(pos, room);
        if (buildOk !== true) {
            if (fails.length < 8) fails.push({x: pos.x, y: pos.y, result: 'shouldBuild=' + buildOk});
            continue;
        }

        // Non-barrier sites on the perimeter tile block forever unless we clear idle ones.
        // Never remove extension sites while the room still needs extensions.
        const otherSite = pos.lookFor(LOOK_CONSTRUCTION_SITES).find(s =>
            s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL);
        if (otherSite) {
            let extDeficitHere = 0;
            try {
                extDeficitHere = require('planGeomExtensions').getExtensionDeficit(room);
            } catch (e) { /* ignore */
            }
            const canClearExt = otherSite.structureType !== STRUCTURE_EXTENSION || extDeficitHere <= 0;
            if (!otherSite.progress && canClearExt &&
                (otherSite.structureType === STRUCTURE_ROAD ||
                    otherSite.structureType === STRUCTURE_CONTAINER ||
                    otherSite.structureType === STRUCTURE_EXTENSION)) {
                try {
                    otherSite.remove();
                    invalidateRoomConstructionSiteCache(room);
                } catch (e) {
                    if (fails.length < 8) fails.push({
                        x: pos.x,
                        y: pos.y,
                        result: 'otherSite:' + otherSite.structureType
                    });
                    continue;
                }
            } else {
                if (fails.length < 8) fails.push({x: pos.x, y: pos.y, result: 'otherSite:' + otherSite.structureType});
                continue;
            }
        }

        if (!canPlaceConstructionSite(room)) {
            budgetBlocked = true;
            if (fails.length < 8) {
                fails.push({
                    x: pos.x, y: pos.y,
                    result: 'no_budget',
                    siteBudget: roomConstructionSiteBudget(room),
                });
            }
            break;
        }

        // Checkerboard: (x+y) even → wall when open/non-corridor; odd → rampart.
        // Wall tiles that can't take a wall (road, corridor, blocked) fall back to rampart
        // so the seal never leaves a hole.
        if (!corridors) corridors = getRampartWalkCorridors(room);
        const wantType = choosePerimeterBarrierType(pos, corridors);
        let lastResult = placeFn(pos, wantType);
        let placed = lastResult === OK;
        if (!placed && wantType === STRUCTURE_WALL) {
            lastResult = placeFn(pos, STRUCTURE_RAMPART);
            placed = lastResult === OK;
        }
        if (placed) {
            cycles++;
        } else {
            if (fails.length < 8) {
                fails.push({
                    x: pos.x, y: pos.y,
                    result: lastResult === undefined ? 'no_attempt' : lastResult,
                    want: wantType,
                });
            }
            // ERR_FULL = room/global site cap; ERR_NOT_OWNER = V2 soft-budget exhausted.
            if (lastResult === ERR_FULL || lastResult === ERR_NOT_OWNER) {
                budgetBlocked = true;
                break;
            }
        }
    }

    const reason = cycles > 0 ? 'placed'
        : budgetBlocked ? 'budget'
            : fails.length ? 'fails'
                : 'none';

    // Status only when forced (console) or something changed / periodic — avoid Memory spam.
    if (options.recordStatus || cycles > 0 || (fails.length && Game.time % 50 === 0)) {
        recordPerimeterPlaceStatus(room, {
            reason,
            missing: buildPositions.length,
            placed: cycles,
            siteCap,
            inBuild,
            siteBudget: roomConstructionSiteBudget(room),
            canPlace: canPlaceConstructionSite(room),
            fails: fails.slice(0, 10),
        });
    }
    if (cycles && Game.time % 50 === 0) {
        log.a(`${room.name} perimeter place: missing=${buildPositions.length} placed=${cycles}`, 'PLANNER');
    }

    if (options.report) {
        options.report.placed = cycles;
        options.report.missing = buildPositions.length;
        options.report.planned = spots.length;
        options.report.siteCap = siteCap;
        options.report.inBuild = inBuild;
        options.report.limit = Math.max(0, siteCap - inBuild);
        options.report.layoutPending = layoutPending;
        options.report.complete = false;
        options.report.reason = reason;
        options.report.fails = fails.slice(0, 10);
    }

    return cycles;
}

// Round-robin index for incomplete perimeter rooms (heap — fine if reset).
/**
 * Throttled pass: at most 1 incomplete room places barriers per call.
 * Full multi-room ensure every tick (bridge + pathfind + lookFor) nuked bucket.
 *
 * Important: rooms with no ROOM_RAMPART_SPOTS cache used to be skipped forever.
 * Extension placement calls invalidateRampartSpots, so wipe/rebuild could leave
 * incomplete seals with zero sites until a lucky auxiliary layout turn re-inited.
 */
function ensureAllIncompletePerimetersDirect() {
    if (typeof BUNKER_LEVEL === 'undefined') return 0;
    // Skip every other tick when bucket is healthy; harder skip when low.
    const bucket = Game.cpu && Game.cpu.bucket != null ? Game.cpu.bucket : 10000;
    if (bucket < 2000 && Game.time % 5 !== 0) return 0;
    if (bucket < 5000 && Game.time % 3 !== 0) return 0;
    if (bucket >= 5000 && Game.time % 2 !== 0) return 0;

    const owned = listVisibleOwnedRooms();
    const rooms = [];
    for (let i = 0; i < owned.length; i++) rooms.push(owned[i].name);
    if (!rooms.length) return 0;

    // One room per invocation; rotate so all incomplete rooms get turns.
    const start = perimeterEnsureCursor % rooms.length;
    perimeterEnsureCursor = start + 1;
    let placed = 0;
    let initedThisCall = false;

    for (let offset = 0; offset < rooms.length; offset++) {
        const name = rooms[(start + offset) % rooms.length];
        const room = Game.rooms[name];
        if (!room || !bunkerLevelAllowsPerimeter(room) || !room.hub) continue;

        // Re-init missing cache (at most one floodfill per ensure call).
        if (!hasPerimeterSpots(room.name)) {
            if (initedThisCall) continue;
            try {
                const tmpl = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
                initializeRampartSpots(room, tmpl, false);
                initedThisCall = true;
            } catch (e) {
                if (Game.time % 100 === 0 && typeof log !== 'undefined' && log.e) {
                    log.e(`${room.name} perimeter init threw: ${e && e.stack ? e.stack : e}`, 'PLANNER');
                }
                continue;
            }
            if (!hasPerimeterSpots(room.name)) {
                if (Game.time % 50 === 0) {
                    recordPerimeterPlaceStatus(room, {reason: 'init_zero_spots', placed: 0});
                }
                continue;
            }
        }

        // Cheap incomplete: structure-list set, no lookFor per tile.
        if (!perimeterHasMissingBuilt(room)) continue;

        try {
            // maxPlace 3, no bridge on the hot path (bridge runs at init/recalc).
            placed = ensurePerimeterSites(room, {
                maxPlace: 3,
                bridge: false,
                allowInit: false,
                recordStatus: false,
            });
        } catch (e) {
            if (Game.time % 100 === 0) {
                room.memory._perimeterPlaceFails = {
                    tick: Game.time,
                    reason: 'exception',
                    error: (e && e.message) || String(e),
                    stack: e && e.stack ? String(e.stack).slice(0, 300) : undefined,
                };
                if (typeof log !== 'undefined' && log.e) {
                    log.e(`${room.name} ensurePerimeterSites threw: ${e && e.stack ? e.stack : e}`, 'PLANNER');
                }
            }
        }
        // Only work one incomplete room per tick.
        break;
    }
    return placed;
}

function countBarrierConstructionSites(room) {
    const sites = room.constructionSites || [];
    let n = 0;
    for (let i = 0; i < sites.length; i++) {
        const t = sites[i].structureType;
        if (t === STRUCTURE_RAMPART || t === STRUCTURE_WALL) n++;
    }
    return n;
}

/**
 * Sync perimeter plan summary into room.memory.plan.layers.ramparts.
 * @param {Room} room
 * @param {{placed?: number, missing?: number, complete?: boolean, layoutPending?: boolean}} [meta]
 */
function syncRampartPlanToDoc(room, meta) {
    const plan = ensurePlan(room, {resync: false}) || getPlan(room);
    if (!plan || !plan.layers || !plan.layers.ramparts) return null;

    let samplePacked = null;
    let planned = 0;
    let missing = 0;
    try {
        const spots = getPerimeterSpots(room.name);
        planned = spots.length;
        const built = getBuiltBarrierKeySet(room);
        const missingTiles = [];
        for (let i = 0; i < spots.length; i++) {
            const p = spots[i];
            if (!built.has(p.x + ',' + p.y)) {
                missing++;
                if (missingTiles.length < 40) missingTiles.push({x: p.x, y: p.y});
            }
        }
        samplePacked = missingTiles.length ? packTiles(missingTiles) : [];
        plan.layers.ramparts.extra = {
            planned,
            missing,
            complete: planned > 0 && missing === 0,
            barrierSites: countBarrierConstructionSites(room),
        };
    } catch (e) {
        plan.layers.ramparts.extra = {error: (e && e.message) || String(e)};
    }

    plan.layers.ramparts.packed = samplePacked;
    plan.layers.ramparts.rev = (plan.layers.ramparts.rev || 0) + 1;
    if (meta) {
        plan.layers.ramparts.extra = Object.assign({}, plan.layers.ramparts.extra || {}, meta);
    }
    plan.meta.lastSyncTick = Game.time;
    return plan;
}

/**
 * placeSite adapter: walls + ramparts both use the `ramparts` budget layer.
 * Returns ERR_NOT_OWNER when soft budget is exhausted so the placer stops the batch.
 */
function makePlaceSite(room, layoutPending) {
    return (pos, structureType) => {
        if (structureType !== STRUCTURE_RAMPART && structureType !== STRUCTURE_WALL) {
            return require('planUtils').tryCreateConstructionSite(pos, structureType);
        }
        const res = siteBudget.tryPlace(room, 'ramparts', pos, structureType, {layoutPending});
        if (res.ok) return OK;
        if (res.result === ERR_NOT_OWNER) return ERR_NOT_OWNER;
        if (res.code === FailureCodes.SITE_BUDGET_GLOBAL
            || res.code === FailureCodes.SITE_BUDGET_ROOM
            || res.code === FailureCodes.BUDGET_RESERVED_FOR_HIGHER) {
            const plan = getPlan(room);
            if (plan && res.code) {
                pushFailure(plan, {
                    code: res.code,
                    layer: 'ramparts',
                    detail: {x: pos.x, y: pos.y, structureType},
                    tick: Game.time,
                    source: 'planRamparts.placePerimeter',
                });
            }
            return ERR_NOT_OWNER;
        }
        return res.result != null ? res.result : ERR_FULL;
    };
}

/**
 * Place bunker perimeter barriers via siteBudget.
 * @param {Room} room
 * @param {{
 *   layoutPending?: boolean,
 *   maxPlace?: number,
 *   allowInit?: boolean,
 *   bridge?: boolean,
 *   recordStatus?: boolean,
 * }} [options]
 * @returns {{ok: boolean, placed: number, missing?: number, complete?: boolean, reason?: string, shadow?: boolean, limit?: number}}
 */
function placePerimeter(room, options) {
    const opts = options || {};
    const layoutPending = opts.layoutPending != null
        ? !!opts.layoutPending
        : computeLayoutPending(room);

    siteBudget.setRoomPolicy(room, {layoutPending});

    const shadow = isPlannerShadow(room);
    if (shadow) {
        let missing = 0;
        let planned = 0;
        try {
            const spots = getPerimeterSpots(room.name);
            planned = spots.length;
            if (perimeterHasMissingBuilt(room)) {
                const built = getBuiltBarrierKeySet(room);
                for (let i = 0; i < spots.length; i++) {
                    if (!built.has(spots[i].x + ',' + spots[i].y)) missing++;
                }
            }
        } catch (e) { /* ignore */
        }
        const limit = siteBudget.rampartLimit(room, {
            layoutPending,
            maxPerTick: opts.maxPlace != null ? opts.maxPlace : 3,
        });
        syncRampartPlanToDoc(room, {
            placed: 0,
            missing,
            planned,
            complete: planned > 0 && missing === 0,
            layoutPending,
            limit,
            v2: true,
            shadow: true,
        });
        return {
            ok: true,
            placed: 0,
            missing,
            planned,
            limit,
            layoutPending,
            complete: planned > 0 && missing === 0,
            shadow: true,
            reason: 'shadow',
        };
    }

    const maxPlace = opts.maxPlace != null ? opts.maxPlace : 3;
    const report = {};
    const placed = ensurePerimeterSites(room, {
        maxPlace,
        bridge: !!opts.bridge,
        allowInit: !!opts.allowInit,
        recordStatus: !!opts.recordStatus,
        layoutPending,
        report,
        placementLimit: (r, lp) => siteBudget.rampartLimit(r, {
            layoutPending: lp,
            maxPerTick: maxPlace,
        }),
        placeSite: makePlaceSite(room, layoutPending),
    });

    syncRampartPlanToDoc(room, {
        placed: report.placed != null ? report.placed : placed,
        missing: report.missing,
        planned: report.planned,
        complete: report.complete,
        layoutPending,
        limit: report.limit,
        reason: report.reason,
        v2: true,
    });

    return {
        ok: true,
        placed: report.placed != null ? report.placed : placed,
        missing: report.missing,
        planned: report.planned,
        complete: report.complete,
        limit: report.limit,
        layoutPending,
        reason: report.reason,
        inBuild: report.inBuild,
    };
}

/**
 * Full rampart pass for a V2 room: perimeter + protective + quad via siteBudget.
 * @param {Room} room
 * @param {{layoutPending?: boolean, maxPlace?: number}} [options]
 */
function placeRamparts(room, options) {
    const opts = options || {};
    const layoutPending = opts.layoutPending != null
        ? !!opts.layoutPending
        : computeLayoutPending(room);

    siteBudget.setRoomPolicy(room, {layoutPending});

    // Full shadow short-circuit: placePerimeter already no-ops placement, but
    // rampartBuilder can still free barrier sites / run side effects — skip entirely.
    if (isPlannerShadow(room)) {
        const perimeter = placePerimeter(room, {
            layoutPending,
            maxPlace: opts.maxPlace != null ? opts.maxPlace : 3,
            allowInit: false,
            bridge: false,
        });
        return {
            ok: true,
            placed: 0,
            perimeter,
            protective: false,
            layoutPending,
            shadow: true,
            reason: 'shadow',
        };
    }

    const perimeter = placePerimeter(room, {
        layoutPending,
        maxPlace: opts.maxPlace != null ? opts.maxPlace : 3,
        allowInit: false,
        bridge: false,
    });

    // Off-plan multi-ring cleanup: V2 almost never called recalculate with
    // destroyOffPlan, so old seals stacked forever. Cap per tick; prefer when
    // the current seal is complete so we do not open holes mid-build.
    //
    // CRITICAL: complete seals used to run full-room barrier scans every room-turn
    // (findClosestByRange per wall). Rate-limit hard and skip on low bucket.
    let cleanup = null;
    const sealComplete = perimeter.complete || (perimeter.missing === 0 && perimeter.planned > 0);
    const bucket = Game.cpu && Game.cpu.bucket != null ? Game.cpu.bucket : 10000;
    const lastClean = room.memory._offPlanCleanupTick || 0;
    // Healthy: every ~50 ticks. Soft: ~100. Below 3k: never (cleanupOffPlan also guards).
    const cleanInterval = bucket < 5000 ? 100 : 50;
    const staggered = Game.time % 17 === (room.name.charCodeAt(0) % 17);
    const cleanupDue = bucket >= 3000
        && (Game.time - lastClean) >= cleanInterval
        && (sealComplete || staggered);
    if (cleanupDue) {
        try {
            cleanup = cleanupOffPlanBarriers(room, {maxDestroy: sealComplete ? 8 : 3});
            room.memory._offPlanCleanupTick = Game.time;
        } catch (e) {
            cleanup = {error: (e && e.message) || String(e)};
            room.memory._offPlanCleanupTick = Game.time;
        }
    }

    // Protective covers + quad traps — same placeSite adapter as perimeter.
    // Rate-limit when seal is complete: buildProtectiveRamparts scans all
    // structures and used findClosestByRange per tile (expensive on mature rooms).
    const layout = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
    let protective = false;
    let protectiveSkipped = false;
    const lastProtective = room.memory._protectiveRampartTick || 0;
    const protectiveInterval = sealComplete
        ? (bucket < 5000 ? 40 : 20)
        : 1;
    const protectiveDue = !sealComplete
        || (Game.time - lastProtective) >= protectiveInterval
        || (perimeter.placed || 0) > 0;
    if (protectiveDue && bucket >= 2000) {
        const placeSite = makePlaceSite(room, layoutPending);
        try {
            protective = !!rampartBuilder(room, layout, false, {
                skipPerimeter: true,
                layoutPending,
                placeSite,
            });
            room.memory._protectiveRampartTick = Game.time;
        } catch (e) {
            if (typeof log !== 'undefined' && log.e) {
                log.e(`${room.name} V2 protective ramparts failed: ${e && e.stack ? e.stack : e}`, 'PLANNER');
            }
        }
    } else {
        protectiveSkipped = true;
    }

    return {
        ok: true,
        placed: perimeter.placed || 0,
        perimeter,
        protective,
        protectiveSkipped,
        cleanup,
        layoutPending,
        shadow: false,
    };
}

// Round-robin cursor (heap)
let perimeterEnsureCursor = 0;

/**
 * Global progress for incomplete perimeters — always siteBudget (Phase 2).
 * Mirrors planRamparts.ensureAllIncompletePerimeters cadence.
 * @returns {number} sites placed (approx)
 */
function ensureAllIncompletePerimeters() {
    if (typeof BUNKER_LEVEL === 'undefined') return 0;
    const bucket = Game.cpu && Game.cpu.bucket != null ? Game.cpu.bucket : 10000;
    if (bucket < 2000 && Game.time % 5 !== 0) return 0;
    if (bucket < 5000 && Game.time % 3 !== 0) return 0;
    if (bucket >= 5000 && Game.time % 2 !== 0) return 0;

    const owned = listVisibleOwnedRooms();
    const rooms = [];
    for (let i = 0; i < owned.length; i++) rooms.push(owned[i].name);
    if (!rooms.length) return 0;

    const start = perimeterEnsureCursor % rooms.length;
    perimeterEnsureCursor = start + 1;
    let initedThisCall = false;

    for (let offset = 0; offset < rooms.length; offset++) {
        const name = rooms[(start + offset) % rooms.length];
        const room = Game.rooms[name];
        if (!room || !bunkerLevelAllowsPerimeter(room) || !room.hub) continue;

        // Re-init missing cache (at most one floodfill per ensure call).
        if (!hasPerimeterSpots(room.name)) {
            if (initedThisCall) continue;
            try {
                // allowInit runs initializeRampartSpots; maxPlace 0 avoids placing during init.
                ensurePerimeterSites(room, {
                    maxPlace: 0,
                    allowInit: true,
                    bridge: false,
                    recordStatus: false,
                });
                initedThisCall = true;
            } catch (e) {
                if (Game.time % 100 === 0 && typeof log !== 'undefined' && log.e) {
                    log.e(`${room.name} perimeter init threw: ${e && e.stack ? e.stack : e}`, 'PLANNER');
                }
                continue;
            }
            if (!hasPerimeterSpots(room.name)) {
                if (Game.time % 50 === 0) {
                    room.memory._perimeterPlaceFails = {
                        tick: Game.time,
                        reason: 'init_zero_spots',
                        placed: 0,
                    };
                }
                continue;
            }
        }

        if (!perimeterHasMissingBuilt(room)) continue;

        let placed = 0;
        try {
            const res = placePerimeter(room, {
                layoutPending: computeLayoutPending(room),
                maxPlace: 3,
                allowInit: false,
                bridge: false,
            });
            placed = res.placed || 0;
        } catch (e) {
            if (Game.time % 100 === 0 && typeof log !== 'undefined' && log.e) {
                log.e(`${room.name} ensurePerimeterSites threw: ${e && e.stack ? e.stack : e}`, 'PLANNER');
            }
        }
        return placed;
    }
    return 0;
}

/**
 * @param {Room} room
 */
function inspectRamparts(room) {
    const spots = getPerimeterSpots(room.name);
    let missing = 0;
    try {
        if (spots.length) {
            const built = getBuiltBarrierKeySet(room);
            for (let i = 0; i < spots.length; i++) {
                if (!built.has(spots[i].x + ',' + spots[i].y)) missing++;
            }
        }
    } catch (e) { /* ignore */
    }

    const layoutPending = computeLayoutPending(room);
    return {
        room: room.name,
        rclOk: bunkerLevelAllowsPerimeter(room),
        hasSpots: hasPerimeterSpots(room.name),
        planned: spots.length,
        missing,
        complete: spots.length > 0 && missing === 0,
        needsWork: perimeterHasMissingBuilt(room),
        barrierSites: countBarrierConstructionSites(room),
        layoutPending,
        availableBudget: siteBudget.available(room, 'ramparts', {layoutPending}),
        rampartLimit: siteBudget.rampartLimit(room, {layoutPending}),
        /** V1-style budget-reserve limit vs V2 rampartLimit (+ soft holds). */
        limitParity: siteBudget.compareRampartLimit(room, {layoutPending}),
        planLayer: room.memory.plan && room.memory.plan.layers && room.memory.plan.layers.ramparts
            ? room.memory.plan.layers.ramparts.extra
            : null,
        placeFails: room.memory._perimeterPlaceFails || null,
    };
}

module.exports = Object.assign({}, geom, {
    placePerimeter,
    placeRamparts,
    syncRampartPlanToDoc,
    inspectRamparts,
    countBarrierConstructionSites,
    rampartBuilder,
    recalculateRampartsForRoom,
    purgeOrphanBarriers,
    cleanupOffPlanBarriers,
    ensurePerimeterSites,
    ensureAllIncompletePerimeters,
    wipeRoomBarriers,
    migrateRampartVersion,
});
