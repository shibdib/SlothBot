/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Shared helpers for layout, roads, ramparts, and towers.

 */


function isAttackRecoveryMode(room) {
    const intel = INTEL[room.name];
    const inSafeMode = (room.controller.safeMode > 0) || !!(intel && intel.safemode);
    const recentAttack = intel && intel.lastMajorAttack && intel.lastMajorAttack + (CREEP_LIFE_TIME * 2) > Game.time;
    return inSafeMode || recentAttack;
}

/**
 * True when this is one of our owned rooms (vision preferred; Memory.rooms fallback).
 * @param {Room|null} room
 * @param {string} [name]
 * @returns {boolean}
 */
function isMyOwnedRoomName(room, name) {
    if (room && room.controller && room.controller.my) return true;
    if (typeof MY_ROOMS !== 'undefined' && MY_ROOMS && name && MY_ROOMS.includes(name)) return true;
    return false;
}

// One owned-room list per tick. MY_ROOMS is the source of truth; Game.rooms is
// only a bootstrap fallback when the list is empty (new claim / first tick).
let ownedRoomsTick = -1;
let ownedRoomsCache = [];

function listVisibleOwnedRooms() {
    if (typeof Game !== 'undefined' && ownedRoomsTick === Game.time) return ownedRoomsCache;
    const rooms = [];
    const seen = new Set();
    if (typeof MY_ROOMS !== 'undefined' && MY_ROOMS && MY_ROOMS.length) {
        for (let i = 0; i < MY_ROOMS.length; i++) {
            const name = MY_ROOMS[i];
            if (seen.has(name)) continue;
            seen.add(name);
            const room = typeof Game !== 'undefined' ? Game.rooms[name] : null;
            if (room) rooms.push(room);
        }
    } else if (typeof Game !== 'undefined') {
        for (const name in Game.rooms) {
            const room = Game.rooms[name];
            if (room && room.controller && room.controller.my) rooms.push(room);
        }
    }
    ownedRoomsTick = typeof Game !== 'undefined' ? Game.time : -1;
    ownedRoomsCache = rooms;
    return rooms;
}

/**
 * @param {string} name
 * @returns {object|null} plan doc or null
 */
function getPlanDocForRoomName(name) {
    if (!name) return null;
    try {
        if (typeof Game !== 'undefined' && Game.rooms[name] && Game.rooms[name].memory) {
            return Game.rooms[name].memory.plan || null;
        }
        if (typeof Memory !== 'undefined' && Memory.rooms && Memory.rooms[name]) {
            return Memory.rooms[name].plan || null;
        }
    } catch (e) { /* ignore */
    }
    return null;
}

/**
 * Road network complete flag (C2).
 *
 * Owned rooms: plan.layers.roads.extra.complete only (no INTEL write).
 * Remotes / non-owned: INTEL.roadsBuilt only (unchanged).
 *
 * @param {Room} room
 * @param {true|undefined} value true = complete; undefined = not complete / clear
 */
function setRoadsBuiltFlag(room, value) {
    if (!room || !room.name) return;
    const name = room.name;
    const owned = isMyOwnedRoomName(room, name);

    if (owned) {
        // Plan is sole authority. ensurePlan when missing so roads.extra can stick.
        try {
            if (!room.memory) return;
            let plan = room.memory.plan;
            if (!plan || !plan.layers || !plan.layers.roads) {
                try {
                    plan = require('planDoc').ensurePlan(room, {resync: false}) || plan;
                } catch (e) { /* ignore */
                }
            }
            if (!plan) return;
            if (!plan.layers) plan.layers = {};
            if (!plan.layers.roads) {
                plan.layers.roads = {packed: null, rev: 0, access: null, extra: {}};
            }
            if (!plan.layers.roads.extra) plan.layers.roads.extra = {};
            if (value === true) {
                plan.layers.roads.extra.complete = true;
            } else {
                delete plan.layers.roads.extra.complete;
            }
        } catch (e) { /* ignore */
        }

        // Drop stale INTEL mirror so owned complete is not double-sourced.
        if (typeof INTEL !== 'undefined' && INTEL[name] && INTEL[name].roadsBuilt != null) {
            delete INTEL[name].roadsBuilt;
        }
        return;
    }

    // Remote / foreign vision: INTEL only.
    if (typeof INTEL === 'undefined') return;
    const intel = INTEL[name];
    if (!intel) return;
    if (value === true) intel.roadsBuilt = true;
    else delete intel.roadsBuilt;
}

/**
 * Whether the road net is marked complete.
 * Owned: plan.layers.roads.extra.complete (Memory.rooms if no vision).
 * Remote / missing plan: INTEL.roadsBuilt.
 * @param {Room|string} roomOrName
 * @returns {boolean}
 */
function getRoadsBuiltFlag(roomOrName) {
    const room = typeof roomOrName === 'string'
        ? (typeof Game !== 'undefined' ? Game.rooms[roomOrName] : null)
        : roomOrName;
    const name = typeof roomOrName === 'string'
        ? roomOrName
        : (room && room.name);

    const owned = isMyOwnedRoomName(room, name);
    if (owned) {
        try {
            const plan = (room && room.memory && room.memory.plan) || getPlanDocForRoomName(name);
            const extra = plan && plan.layers && plan.layers.roads && plan.layers.roads.extra;
            if (extra && typeof extra.complete === 'boolean') {
                return extra.complete;
            }
        } catch (e) { /* ignore */
        }
        // One-release grace: if plan never stamped complete, allow legacy INTEL.
        if (typeof INTEL !== 'undefined' && name && INTEL[name] && INTEL[name].roadsBuilt) {
            return true;
        }
        return false;
    }

    if (typeof INTEL !== 'undefined' && name && INTEL[name] && INTEL[name].roadsBuilt) {
        return true;
    }
    return false;
}

function globalConstructionSiteLimit() {
    return global.GLOBAL_CONSTRUCTION_SITE_LIMIT || 100;
}

function maxConstructionSitesPerRoom() {
    return MAX_CONSTRUCTION_SITES_PER_ROOM || 10;
}

let pendingSiteTick = -1;
let pendingGlobalSites = 0;
const pendingRoomSites = Object.create(null);
const pendingRoomSitesByType = Object.create(null);

// One full Game.constructionSites scan per tick — siteBudget used to re-walk
// the empire map on every getRawBudget / request / tryPlace / snapshot.
let siteCountCacheTick = -1;
let siteCountGlobal = 0;
const siteCountByRoom = Object.create(null);
const siteCountByRoomType = Object.create(null);

function resetPendingSitePlacementsIfNeeded() {
    if (pendingSiteTick === Game.time) return;
    pendingSiteTick = Game.time;
    pendingGlobalSites = 0;
    for (const key in pendingRoomSites) delete pendingRoomSites[key];
    for (const key in pendingRoomSitesByType) delete pendingRoomSitesByType[key];
}

function rebuildSiteCountCacheIfNeeded() {
    if (siteCountCacheTick === Game.time) return;
    siteCountCacheTick = Game.time;
    siteCountGlobal = 0;
    for (const key in siteCountByRoom) delete siteCountByRoom[key];
    for (const key in siteCountByRoomType) delete siteCountByRoomType[key];

    for (const id in Game.constructionSites) {
        const site = Game.constructionSites[id];
        if (!site || !site.pos) continue;
        const roomName = site.pos.roomName;
        const type = site.structureType;
        siteCountGlobal++;
        siteCountByRoom[roomName] = (siteCountByRoom[roomName] || 0) + 1;
        if (!siteCountByRoomType[roomName]) siteCountByRoomType[roomName] = Object.create(null);
        siteCountByRoomType[roomName][type] = (siteCountByRoomType[roomName][type] || 0) + 1;
    }
}

/** Force next count* call to re-scan Game.constructionSites (same tick after bulk ops). */
function invalidateSiteCountCache() {
    siteCountCacheTick = -1;
}

function recordPendingSitePlacement(roomName, structureType) {
    resetPendingSitePlacementsIfNeeded();
    pendingGlobalSites++;
    pendingRoomSites[roomName] = (pendingRoomSites[roomName] || 0) + 1;
    if (!pendingRoomSitesByType[roomName]) pendingRoomSitesByType[roomName] = Object.create(null);
    pendingRoomSitesByType[roomName][structureType] =
        (pendingRoomSitesByType[roomName][structureType] || 0) + 1;
}

function countGlobalConstructionSites() {
    resetPendingSitePlacementsIfNeeded();
    rebuildSiteCountCacheIfNeeded();
    return siteCountGlobal + pendingGlobalSites;
}

function countRoomConstructionSites(roomName) {
    resetPendingSitePlacementsIfNeeded();
    rebuildSiteCountCacheIfNeeded();
    return (siteCountByRoom[roomName] || 0) + (pendingRoomSites[roomName] || 0);
}

function countRoomConstructionSitesOfType(roomName, structureType) {
    resetPendingSitePlacementsIfNeeded();
    rebuildSiteCountCacheIfNeeded();
    const base = (siteCountByRoomType[roomName] && siteCountByRoomType[roomName][structureType]) || 0;
    const pending = (pendingRoomSitesByType[roomName] && pendingRoomSitesByType[roomName][structureType]) || 0;
    return base + pending;
}

function globalConstructionSiteBudget() {
    return Math.max(0, globalConstructionSiteLimit() - countGlobalConstructionSites());
}

function roomConstructionSiteBudget(room) {
    if (!room) return 0;
    const roomCap = maxConstructionSitesPerRoom();
    const roomCount = countRoomConstructionSites(room.name);
    const globalRemaining = globalConstructionSiteBudget();
    return Math.max(0, Math.min(roomCap - roomCount, globalRemaining));
}

function canPlaceConstructionSite(room) {
    return roomConstructionSiteBudget(room) > 0;
}

function invalidateRoomConstructionSiteCache(room) {
    if (!room) return;
    room._constructionSites = undefined;
    room._constructionSites_ts = undefined;
    room._extDeficitTick = undefined;
    room._towerDeficitTick = undefined;
    room._needsSpawnSiteTick = undefined;
    room._needsCriticalCoreTick = undefined;
    invalidateSiteCountCache();
    if (global.forceRefreshRoomConstructionSiteCache) {
        global.forceRefreshRoomConstructionSiteCache(room);
    }
}

const SITE_PLACEMENT_LOG_COOLDOWN = 100;
const sitePlacementLogThrottle = Object.create(null);

function recordSitePlacementFailure(roomName, structureType, pos, result) {
    const room = Game.rooms[roomName];
    if (!room) return;
    room.memory.plannerLastSiteError = {
        tick: Game.time,
        x: pos.x,
        y: pos.y,
        type: structureType,
        result,
        globalSites: countGlobalConstructionSites(),
        roomSites: countRoomConstructionSites(roomName),
        globalBudget: globalConstructionSiteBudget(),
        roomBudget: roomConstructionSiteBudget(room),
    };
    const key = `${roomName}:${structureType}:${result}:${pos.x},${pos.y}`;
    const last = sitePlacementLogThrottle[key] || 0;
    if (Game.time - last < SITE_PLACEMENT_LOG_COOLDOWN) return;
    sitePlacementLogThrottle[key] = Game.time;
    log.a(`${roomName} site ${structureType} at (${pos.x},${pos.y}) failed: ${result}`, 'PLANNER');
}

function tryCreateConstructionSite(pos, structureType) {
    const room = Game.rooms[pos.roomName];
    if (!room) {
        recordSitePlacementFailure(pos.roomName, structureType, pos, ERR_INVALID_TARGET);
        return ERR_INVALID_TARGET;
    }
    if (globalConstructionSiteBudget() <= 0) {
        recordSitePlacementFailure(pos.roomName, structureType, pos, ERR_FULL);
        return ERR_FULL;
    }
    if (countRoomConstructionSites(room.name) >= maxConstructionSitesPerRoom()) {
        recordSitePlacementFailure(pos.roomName, structureType, pos, ERR_FULL);
        return ERR_FULL;
    }
    if (structureType === STRUCTURE_ROAD && !canPlaceRoadInRoom(room)) {
        return ERR_NOT_OWNER;
    }
    if (structureType === STRUCTURE_WALL && !canPlaceConstructedWall(pos)) {
        return ERR_INVALID_TARGET;
    }
    const result = pos.createConstructionSite(structureType);
    if (result !== OK) {
        if (structureType === STRUCTURE_WALL && result === ERR_INVALID_TARGET) {
            const hasRuin = typeof LOOK_RUINS !== 'undefined' && pos.lookFor(LOOK_RUINS).length;
            // Ruins are temporary (~500 ticks). Denylisting for 5000 would skip
            // wall fallback long after the tile is buildable again.
            if (!hasRuin) {
                if (!room.memory.plannerWallDenylist) room.memory.plannerWallDenylist = {};
                room.memory.plannerWallDenylist[pos.x + ',' + pos.y] = Game.time;
            }
            return result;
        }
        recordSitePlacementFailure(room.name, structureType, pos, result);
    } else {
        recordPendingSitePlacement(room.name, structureType);
        invalidateRoomConstructionSiteCache(room);
    }
    return result;
}

function safeStructureOwner(structure) {
    if (!structure || !(structure instanceof OwnedStructure)) return undefined;
    try {
        return structure.owner && structure.owner.username;
    } catch (e) {
        return undefined;
    }
}

function safeStructureMy(structure) {
    if (!structure || !(structure instanceof OwnedStructure)) return false;
    try {
        return !!structure.my;
    } catch (e) {
        return false;
    }
}

// Layout / site caps use controller RCL. room.level is energy tier for
// spawn bodies and economy — not a gate for which template structures to place.
function shouldSkipStructure() {
    return false;
}


function getUndefendedExits(roomName) {
    const neighbouring = Game.map.describeExits(roomName);
    const dirToFind = {'1': FIND_EXIT_TOP, '3': FIND_EXIT_RIGHT, '5': FIND_EXIT_BOTTOM, '7': FIND_EXIT_LEFT};
    const undefended = [];
    for (const dir in dirToFind) {
        const neighbour = neighbouring[dir];
        if (!neighbour) continue;
        const intel = INTEL[neighbour];
        if (intel && intel.owner && !FRIENDLIES.includes(intel.owner)) continue;
        if (Object.keys(Game.map.describeExits(neighbour) || {}).length <= 1) {
            undefended.push(dirToFind[dir]);
        }
    }
    return undefended;
}


// Helper function to check if the position is valid for a rampart
function isValidRampartPosition(position) {
    return !position.checkForWall() &&
        !position.checkForConstructionSites() &&
        !position.checkForRampart();
}

/**
 * Terrain-only: can this tile be part of the perimeter *plan*?
 * Structure-occupied tiles stay in the plan — placement uses a rampart on top
 * (old filter dropped them and left permanent seal gaps through extensions).
 */
function isPerimeterPlanTile(pos) {
    if (!pos || pos.checkIfOutOfBounds()) return false;
    if (pos.isExit()) return false;
    if (pos.checkForWall()) return false; // terrain wall
    return true;
}

/**
 * Clear enough for a constructed wall (no obstacle structure).
 * Ramparts may still go on structure tiles via choosePerimeterBarrierType fallback.
 */
function isPerimeterBarrierTile(pos) {
    if (!isPerimeterPlanTile(pos)) return false;
    // ignoreWall=true, ignoreCreep=true — only real obstacle structures block walls.
    if (pos.checkForImpassible(true, true)) return false;
    return true;
}

function filterPerimeterBarrierSpots(room, spots) {
    if (!spots || !spots.length) return [];
    const terrain = Game.map.getRoomTerrain(room.name);
    const filtered = [];
    const seen = new Set();
    for (const p of spots) {
        let x = p.x;
        let y = p.y;
        if (y >= 50) y -= 50;
        if (x < 0 || x > 49 || y < 0 || y > 49) continue;
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
        const key = x + ',' + y;
        if (seen.has(key)) continue;
        const pos = new RoomPosition(x, y, room.name);
        // Keep structure tiles in plan (rampart-on-structure); only drop terrain/exits.
        if (!isPerimeterPlanTile(pos)) continue;
        seen.add(key);
        filtered.push({x, y});
    }
    return filtered;
}

function canAddPerimeterBridgeTile(room, terrain, spotSet, x, y) {
    if (x < 2 || x > 47 || y < 2 || y > 47) return false;
    const key = x + ',' + y;
    if (spotSet.has(key)) return false;
    if (terrain.get(x, y) === TERRAIN_MASK_WALL) return false;
    const pos = new RoomPosition(x, y, room.name);
    return isPerimeterPlanTile(pos);
}

/**
 * Flood-fill all walkable tiles that can reach a room exit without stepping on spotSet.
 * One BFS from the border instead of a full-room BFS per candidate tile.
 */
function exteriorTilesOutsideSpots(terrain, spotSet) {
    const exterior = new Set();
    const q = [];
    const seed = (x, y) => {
        const key = x + ',' + y;
        if (spotSet.has(key) || exterior.has(key)) return;
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) return;
        exterior.add(key);
        q.push(x, y);
    };
    for (let i = 0; i < 50; i++) {
        seed(i, 0);
        seed(i, 49);
        seed(0, i);
        seed(49, i);
    }
    // Index-based queue (avoid Array.shift O(n)).
    let qi = 0;
    while (qi < q.length) {
        const x = q[qi++];
        const y = q[qi++];
        if (x > 0) {
            const nx = x - 1, ny = y, key = nx + ',' + ny;
            if (!exterior.has(key) && !spotSet.has(key) && terrain.get(nx, ny) !== TERRAIN_MASK_WALL) {
                exterior.add(key);
                q.push(nx, ny);
            }
        }
        if (x < 49) {
            const nx = x + 1, ny = y, key = nx + ',' + ny;
            if (!exterior.has(key) && !spotSet.has(key) && terrain.get(nx, ny) !== TERRAIN_MASK_WALL) {
                exterior.add(key);
                q.push(nx, ny);
            }
        }
        if (y > 0) {
            const nx = x, ny = y - 1, key = nx + ',' + ny;
            if (!exterior.has(key) && !spotSet.has(key) && terrain.get(nx, ny) !== TERRAIN_MASK_WALL) {
                exterior.add(key);
                q.push(nx, ny);
            }
        }
        if (y < 49) {
            const nx = x, ny = y + 1, key = nx + ',' + ny;
            if (!exterior.has(key) && !spotSet.has(key) && terrain.get(nx, ny) !== TERRAIN_MASK_WALL) {
                exterior.add(key);
                q.push(nx, ny);
            }
        }
    }
    return exterior;
}

/**
 * Close small holes on a min-cut perimeter without filling the bunker interior.
 * - Diagonal seams: 4-connect the cut
 * - Exterior notches only: neighbors>=2 and tile can still reach an exit
 * CPU: exterior flood is O(room) once per growth batch, not O(room) per candidate.
 */
function bridgePerimeterGaps(room, spots) {
    if (!spots || !spots.length) return [];
    const terrain = Game.map.getRoomTerrain(room.name);
    const spotSet = new Set(spots.map((p) => p.x + ',' + p.y));
    const cardinals = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    const diagonals = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    let exterior = exteriorTilesOutsideSpots(terrain, spotSet);

    const tryAddExterior = (x, y) => {
        if (!canAddPerimeterBridgeTile(room, terrain, spotSet, x, y)) return false;
        // Must be outside the seal (reachable from exits without crossing the cut).
        if (!exterior.has(x + ',' + y)) return false;
        spotSet.add(x + ',' + y);
        spots.push({x, y});
        exterior.delete(x + ',' + y);
        return true;
    };

    // Pass 1: diagonal seams → orthogonal bridges (exterior only).
    let pass1Grew = false;
    for (const p of spots.slice()) {
        for (const [dx, dy] of diagonals) {
            const bx = p.x + dx;
            const by = p.y + dy;
            if (!spotSet.has(bx + ',' + by)) continue;
            if (tryAddExterior(p.x + dx, p.y)) pass1Grew = true;
            if (tryAddExterior(p.x, p.y + dy)) pass1Grew = true;
        }
    }
    // Spots added may have sealed channels — refresh exterior once after pass 1.
    if (pass1Grew) exterior = exteriorTilesOutsideSpots(terrain, spotSet);

    // Pass 2: single-tile exterior notches (2+ cut neighbors, still outside).
    // Cap iterations — pathological growth must not burn a whole tick.
    let grew = true;
    let rounds = 0;
    while (grew && rounds < 8) {
        grew = false;
        rounds++;
        const snapshot = spots.slice();
        for (const p of snapshot) {
            for (const [dx, dy] of cardinals) {
                const x = p.x + dx;
                const y = p.y + dy;
                if (spotSet.has(x + ',' + y)) continue;
                let neighbors = 0;
                for (const [ddx, ddy] of cardinals) {
                    if (spotSet.has((x + ddx) + ',' + (y + ddy))) neighbors++;
                }
                if (neighbors >= 2 && tryAddExterior(x, y)) grew = true;
            }
        }
        if (grew) exterior = exteriorTilesOutsideSpots(terrain, spotSet);
    }

    return spots;
}

const WALL_DENYLIST_TTL = 5000;

function isWallDenylisted(room, x, y) {
    const tick = room?.memory?.plannerWallDenylist?.[x + ',' + y];
    if (!tick) return false;
    if (Game.time - tick > WALL_DENYLIST_TTL) {
        delete room.memory.plannerWallDenylist[x + ',' + y];
        return false;
    }
    return true;
}

function canPlaceConstructedWall(pos) {
    if (!isPerimeterBarrierTile(pos)) return false;
    const room = Game.rooms[pos.roomName];
    if (isWallDenylisted(room, pos.x, pos.y)) return false;
    if (pos.checkForConstructionSites()) return false;
    if (pos.checkForBarrierStructure && pos.checkForBarrierStructure()) return false;
    return true;
}

const ROAD_CACHE_TTL = 5000;

function cacheRoad(room, from, to, path, profile = 'owned') {
    const {cachePath} = require('planGeomRoads');
    cachePath(room, from, to, path, profile);
}

function getRoadCacheEntry(room, from, to, profile = 'owned') {
    const {getCachedPath} = require('planGeomRoads');
    const path = getCachedPath(room, from, to, profile);
    if (!path) return;
    return {path: JSON.stringify(path), tick: Game.time};
}

function getRoad(room, from, to, profile = 'owned') {
    const {getCachedPath} = require('planGeomRoads');
    const path = getCachedPath(room, from, to, profile);
    return path ? JSON.stringify(path) : undefined;
}

function isRoadPathComplete(room, from, to, profile = 'remote') {
    const {getCachedPath, pathTilesNeedRoads} = require('planGeomRoads');
    const path = getCachedPath(room, from, to, profile);
    if (!path) return false;
    return !pathTilesNeedRoads(room, path, to);
}

function markRoadPathComplete() {
    // No-op: completion is derived from room tiles, not cache flags.
}

function getPathKey(from, to) {
    return getPosKey(from) + '$' + getPosKey(to);
}

function getPosKey(pos) {
    return pos.x + 'x' + pos.y;
}

function isRoadSatisfied(pos) {
    if (pos.checkForRoad()) return true;
    if (pos.checkForContainer()) return true;
    const site = pos.checkForConstructionSites();
    return !!(site && (site.structureType === STRUCTURE_ROAD || site.structureType === STRUCTURE_CONTAINER));
}

function canPlaceRoadInRoom(room) {
    if (!room) return false;
    const controller = room.controller;
    if (!controller) return true;
    if (controller.my) return true;
    if (controller.owner) return controller.owner.username === MY_USERNAME;
    const reservation = controller.reservation;
    if (!reservation) return true;
    return reservation.username === MY_USERNAME;
}

function isRemoteRoadRoomEligible(roomName) {
    const intel = INTEL[roomName];
    if (!intel || intel.owner) return false;
    if (intel.reservation && intel.reservation !== MY_USERNAME) return false;
    const live = Game.rooms[roomName];
    if (live && !canPlaceRoadInRoom(live)) return false;
    return true;
}

function isRoadPlaceable(pos) {
    if (pos.isExit()) return false;
    const room = Game.rooms[pos.roomName];
    if (room && !canPlaceRoadInRoom(room)) return false;
    if (pos.checkForRoad()) return false;
    if (pos.checkForConstructionSites()) return false;
    if (pos.checkForWall() || pos.checkForImpassible(true)) return false;
    for (const s of pos.lookFor(LOOK_STRUCTURES)) {
        if (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_RAMPART) continue;
        // Containers are walkable and count as road-satisfied; still do not stack a road on them.
        return false;
    }
    return true;
}

const CONTROLLER_LINK_MAX_RANGE = 3;
const SOURCE_CONTROLLER_SHARE_RANGE = 2;

function isControllerNeighborSource(source, room, maxRange = SOURCE_CONTROLLER_SHARE_RANGE) {
    return !!(source && room && room.controller && source.pos.getRangeTo(room.controller) <= maxRange);
}

function getControllerNeighborSource(room, maxRange = SOURCE_CONTROLLER_SHARE_RANGE) {
    if (!room || !room.controller || !room.sources) return null;
    let best = null;
    let bestRange = Infinity;
    for (let i = 0; i < room.sources.length; i++) {
        const source = room.sources[i];
        const range = source.pos.getRangeTo(room.controller);
        if (range <= maxRange && range < bestRange) {
            bestRange = range;
            best = source;
        }
    }
    return best;
}

/**
 * Open neighbors of a source pad that can hold the shared controller/source link.
 * @param {RoomPosition} containerPos
 * @param {Source} source
 * @param {Room} room
 * @returns {number}
 */
function countSharedControllerLinkSlots(containerPos, source, room) {
    if (!room || !room.controller || !containerPos) return 0;
    const terrain = Game.map.getRoomTerrain(containerPos.roomName);
    const ctrl = room.controller.pos;
    let n = 0;
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (!xOff && !yOff) continue;
            const x = containerPos.x + xOff;
            const y = containerPos.y + yOff;
            if (x < 1 || x > 48 || y < 1 || y > 48) continue;
            if (x === source.pos.x && y === source.pos.y) continue;
            if (x === ctrl.x && y === ctrl.y) continue;
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
            const range = Math.max(Math.abs(x - ctrl.x), Math.abs(y - ctrl.y));
            if (range > CONTROLLER_LINK_MAX_RANGE) continue;
            n++;
        }
    }
    return n;
}

function findBestContainerPos(source) {
    const room = Game.rooms[source.pos.roomName];
    const lairs = room && room.keeperLairs && room.keeperLairs.length ? room.keeperLairs : null;
    const nearestLair = lairs ? source.pos.findClosestByRange(lairs) : null;
    const nearOwnController = !!(room && room.controller && room.controller.my
        && isControllerNeighborSource(source, room));

    let bestPos, bestScore;
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (!xOff && !yOff) continue;
            const pos = new RoomPosition(source.pos.x + xOff, source.pos.y + yOff, source.pos.roomName);
            if (pos.checkForWall()) continue;
            let score = pos.countOpenTerrainAround(true, true);
            // Keepers walk lair → source and camp the near side. Prefer the far tile.
            if (nearestLair) score += pos.getRangeTo(nearestLair) * 3;
            if (nearOwnController) {
                const slots = countSharedControllerLinkSlots(pos, source, room);
                if (slots > 0) score += 15 + slots * 2;
                else score -= 12;
            }
            if (bestScore === undefined || score > bestScore) {
                bestScore = score;
                bestPos = pos;
            }
        }
    }
    return bestPos;
}

function determineTowerDamage(range) {
    if (range <= TOWER_OPTIMAL_RANGE) return TOWER_POWER_ATTACK;
    if (range < TOWER_FALLOFF_RANGE) return TOWER_POWER_ATTACK - TOWER_FALLOFF * (range - TOWER_OPTIMAL_RANGE) / (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE);
    return TOWER_POWER_ATTACK - TOWER_FALLOFF;
}


function isCoreHubTileValid(pos, room) {
    if (pos.x < 1 || pos.x > 48 || pos.y < 1 || pos.y > 48) return false;
    const src = pos.findClosestByRange(FIND_SOURCES);
    if (pos.checkForImpassible() || pos.isNearTo(room.controller)) return false;
    if (room.mineral && pos.isNearTo(room.mineral)) return false;
    return !(src && pos.isNearTo(src));
}


function isNearAnySource(pos, room, range = 1) {
    for (const source of room.sources) {
        if (pos.getRangeTo(source.pos) <= range) return true;
    }
    return false;
}

function isAssignedSourceContainer(structure, room) {
    if (!structure || !room) return false;
    for (const source of room.sources) {
        const containerId = source.memory.container || source.memory.containerID;
        if (containerId && containerId === structure.id) return true;
    }
    return false;
}

function isSourceOrMineralPad(pos, room) {
    if (room.mineral && pos.isNearTo(room.mineral)) return true;
    return isNearAnySource(pos, room, 1);
}

function isControllerContainerPos(pos, room) {
    if (!room.controller || pos.getRangeTo(room.controller) > 2) return false;
    return !isSourceOrMineralPad(pos, room);
}

function isNearController(pos, room, maxRange = 2) {
    return !!(room.controller && pos.getRangeTo(room.controller) <= maxRange);
}

function isSourceOrMineralContainer(structure, room) {
    if (!structure || !room) return false;
    if (isAssignedSourceContainer(structure, room)) return true;
    if (room.mineral && structure.pos.isNearTo(room.mineral)) return true;
    return isNearAnySource(structure.pos, room, 1);
}

function isControllerAreaContainer(structure, room) {
    return structure
        && structure.structureType === STRUCTURE_CONTAINER
        && isNearController(structure.pos, room, 2)
        && !isSourceOrMineralContainer(structure, room);
}

function isControllerLinkPos(pos, room) {
    if (!room.controller || pos.getRangeTo(room.controller) > CONTROLLER_LINK_MAX_RANGE) return false;
    const sources = room.sources || [];
    for (let i = 0; i < sources.length; i++) {
        const source = sources[i];
        if (pos.getRangeTo(source.pos) > 2) continue;
        // Only the controller-adjacent source may share this tile; keep far
        // source-link pads exclusive.
        if (!isControllerNeighborSource(source, room)) return false;
    }
    return true;
}

function isControllerAreaLink(structure, room) {
    if (!structure || structure.structureType !== STRUCTURE_LINK) return false;
    if (structure.isActive && !structure.isActive()) return false;
    if (room && room.memory && room.memory.hubLink && structure.id === room.memory.hubLink) return false;
    return isControllerLinkPos(structure.pos, room);
}

/**
 * True when the controller-adjacent source already has (or is bound to) the
 * controller link — one structure serves harvest dump + upgrade withdraw.
 * @param {Room} room
 * @returns {boolean}
 */
function hasSharedSourceControllerLink(room) {
    const source = getControllerNeighborSource(room);
    if (!source || !room.controller) return false;
    const link = Game.getObjectById(room.memory.controllerLink);
    if (!link || !isControllerLinkPos(link.pos, room)) return false;
    const container = resolveSourceContainer(source, room, false);
    if (container && link.pos.isNearTo(container)) return true;
    return link.pos.getRangeTo(source) <= 2;
}

/**
 * Tile next to the neighbor source's harvest pad that should stay free for the
 * shared controller/source link.
 * @param {RoomPosition} pos
 * @param {Room} room
 * @returns {boolean}
 */
function isSharedLinkReserveTile(pos, room) {
    const source = getControllerNeighborSource(room);
    if (!source || !room.controller || !pos) return false;
    const existing = resolveSourceContainer(source, room, false);
    const pad = existing ? existing.pos : findBestContainerPos(source);
    if (!pad || !pos.isNearTo(pad)) return false;
    if (pos.getRangeTo(room.controller) > CONTROLLER_LINK_MAX_RANGE) return false;
    if (pos.checkForWall && pos.checkForWall()) return false;
    return isControllerLinkPos(pos, room);
}

function shouldSkipControllerContainer(room) {
    if (!room || !room.controller) return false;
    if (room.controller.level >= 8) return !!Game.getObjectById(room.memory.controllerLink);
    if (room.controller.level < 5) return false;
    return hasSharedSourceControllerLink(room);
}

function controllerContainersNear(room) {
    if (!room.controller) return [];
    if (global.posStructuresInRange) {
        return global.posStructuresInRange(room.controller.pos, 3, {
            filter: (s) => s.structureType === STRUCTURE_CONTAINER,
        });
    }
    return room.controller.pos.findInRange(FIND_STRUCTURES, 3, {
        filter: (s) => s.structureType === STRUCTURE_CONTAINER,
    });
}

function controllerContainerSitesNear(room) {
    if (!room.controller) return [];
    if (global.posConstructionSitesInRange) {
        return global.posConstructionSitesInRange(room.controller.pos, 3, {
            filter: {structureType: STRUCTURE_CONTAINER},
        });
    }
    return room.controller.pos.findInRange(FIND_CONSTRUCTION_SITES, 3, {
        filter: (s) => s.structureType === STRUCTURE_CONTAINER,
    });
}

function controllerContainersAdjacent(room) {
    const seen = new Set();
    const out = [];
    const add = (s) => {
        if (!isControllerAreaContainer(s, room) || seen.has(s.id)) return;
        seen.add(s.id);
        out.push(s);
    };
    for (const s of controllerContainersNear(room)) add(s);
    if (room.containers) {
        for (const s of room.containers) add(s);
    }
    if (!out.length && room.controller && Game.rooms[room.name]) {
        for (const s of room.controller.pos.findInRange(FIND_STRUCTURES, 2, {
            filter: (st) => st.structureType === STRUCTURE_CONTAINER,
        })) add(s);
    }
    return out;
}

function controllerContainerSitesAdjacent(room) {
    const seen = new Set();
    const out = [];
    const add = (s) => {
        if (!s || s.structureType !== STRUCTURE_CONTAINER || !isNearController(s.pos, room, 2)
            || isSourceOrMineralContainer(s, room) || seen.has(s.id)) return;
        seen.add(s.id);
        out.push(s);
    };
    for (const s of controllerContainerSitesNear(room)) add(s);
    if (room.constructionSites) {
        for (const s of room.constructionSites) add(s);
    }
    if (!out.length && room.controller && Game.rooms[room.name]) {
        for (const s of room.controller.pos.findInRange(FIND_CONSTRUCTION_SITES, 2, {
            filter: (st) => st.structureType === STRUCTURE_CONTAINER,
        })) add(s);
    }
    return out;
}

function pickCanonicalControllerContainer(room, structures) {
    if (!structures.length) return null;
    const hub = room.hub;
    const candidates = structures.filter((s) =>
        s.store && isControllerContainerPos(s.pos, room) && !isAssignedSourceContainer(s, room)
    );
    if (!candidates.length) return null;
    candidates.sort((a, b) => {
        if (!hub) return 0;
        return a.pos.findPathTo(hub).length - b.pos.findPathTo(hub).length;
    });
    return candidates[0];
}

function resolveControllerContainer(room, syncMemory = false) {
    if (!room || !room.controller) return null;
    const remembered = Game.getObjectById(room.memory.controllerContainer);
    if (remembered && remembered.store && isControllerAreaContainer(remembered, room)) {
        return remembered;
    }
    if (room.memory.controllerContainer) {
        room.memory.controllerContainer = undefined;
    }

    const adjacent = controllerContainersAdjacent(room).filter((s) => s.store);
    const keeper = pickCanonicalControllerContainer(room, adjacent);
    if (keeper && adjacent.length > 1) {
        for (const s of adjacent) {
            if (s.id !== keeper.id) s.destroy();
        }
    }
    if (keeper) {
        if (syncMemory) room.memory.controllerContainer = keeper.id;
        return keeper;
    }
    return null;
}


function sourceContainersAdjacent(source) {
    if (!source) return [];
    const seen = new Set();
    const out = [];
    const add = (s) => {
        if (!s || s.structureType !== STRUCTURE_CONTAINER || !s.pos.isNearTo(source) || seen.has(s.id)) return;
        seen.add(s.id);
        out.push(s);
    };
    if (global.posStructuresInRange) {
        for (const s of global.posStructuresInRange(source.pos, 1, {filter: {structureType: STRUCTURE_CONTAINER}})) add(s);
    }
    const room = Game.rooms[source.pos.roomName];
    if (room) {
        for (const s of source.pos.findInRange(FIND_STRUCTURES, 1, {filter: {structureType: STRUCTURE_CONTAINER}})) add(s);
        if (room.containers) {
            for (const s of room.containers) {
                if (s.pos.isNearTo(source)) add(s);
            }
        }
    }
    return out;
}

function sourceContainerSitesAdjacent(source) {
    if (!source) return [];
    const seen = new Set();
    const out = [];
    const add = (s) => {
        if (!s || s.structureType !== STRUCTURE_CONTAINER || !s.pos.isNearTo(source) || seen.has(s.id)) return;
        seen.add(s.id);
        out.push(s);
    };
    if (global.posConstructionSitesInRange) {
        for (const s of global.posConstructionSitesInRange(source.pos, 1, {filter: {structureType: STRUCTURE_CONTAINER}})) add(s);
    }
    const room = Game.rooms[source.pos.roomName];
    if (room) {
        for (const s of source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: {structureType: STRUCTURE_CONTAINER}})) add(s);
        if (room.constructionSites) {
            for (const s of room.constructionSites) add(s);
        }
    }
    return out;
}

function pickCanonicalSourceContainer(source, structures) {
    if (!structures.length) return null;
    const withStore = structures.filter((s) => s.store);
    if (!withStore.length) return null;
    const bestPos = findBestContainerPos(source);
    if (bestPos) {
        const atBest = withStore.find((s) => s.pos.isEqualTo(bestPos));
        if (atBest) return atBest;
    }
    return source.pos.findClosestByRange(withStore);
}

function resolveSourceContainer(source, room, syncMemory = false) {
    if (!source) return null;
    room = room || Game.rooms[source.pos.roomName];

    const containerId = source.memory.container || source.memory.containerID;
    const remembered = Game.getObjectById(containerId);
    if (remembered && remembered.structureType === STRUCTURE_CONTAINER && remembered.pos.isNearTo(source) && remembered.store) {
        if (syncMemory) {
            source.memory.container = remembered.id;
            delete source.memory.containerID;
        }
        return remembered;
    }
    if (containerId && (!remembered || remembered.structureType !== STRUCTURE_CONTAINER || !remembered.pos.isNearTo(source))) {
        source.memory.container = undefined;
        delete source.memory.containerID;
    }

    const adjacent = sourceContainersAdjacent(source).filter((s) => s.store);
    const keeper = pickCanonicalSourceContainer(source, adjacent);
    if (keeper && adjacent.length > 1) {
        for (const s of adjacent) {
            if (s.id !== keeper.id) s.destroy();
        }
    }
    if (keeper) {
        if (syncMemory) {
            source.memory.container = keeper.id;
            delete source.memory.containerID;
        }
        return keeper;
    }
    return null;
}

function resolveSourceContainerSite(source) {
    const sites = sourceContainerSitesAdjacent(source);
    if (!sites.length) return null;
    const bestPos = findBestContainerPos(source);
    if (bestPos) {
        const atBest = sites.find((s) => s.pos.isEqualTo(bestPos));
        if (atBest) return atBest;
    }
    return source.pos.findClosestByRange(sites);
}

function hasSourceContainerSite(source) {
    return sourceContainerSitesAdjacent(source).length > 0;
}

function hasControllerContainerSite(room) {
    return controllerContainerSitesAdjacent(room).length > 0;
}

module.exports = {

    isAttackRecoveryMode,

    listVisibleOwnedRooms,

    setRoadsBuiltFlag,
    getRoadsBuiltFlag,

    maxConstructionSitesPerRoom,

    globalConstructionSiteLimit,

    countGlobalConstructionSites,

    countRoomConstructionSites,

    countRoomConstructionSitesOfType,

    globalConstructionSiteBudget,

    roomConstructionSiteBudget,

    canPlaceConstructionSite,

    invalidateRoomConstructionSiteCache,

    invalidateSiteCountCache,

    tryCreateConstructionSite,

    shouldSkipStructure,

    getUndefendedExits,

    isValidRampartPosition,
    isPerimeterBarrierTile,
    filterPerimeterBarrierSpots,
    bridgePerimeterGaps,
    canPlaceConstructedWall,

    cacheRoad,

    getRoad,

    getRoadCacheEntry,

    isRoadPathComplete,

    markRoadPathComplete,

    getPathKey,

    getPosKey,

    isRoadSatisfied,

    canPlaceRoadInRoom,

    isRemoteRoadRoomEligible,

    isRoadPlaceable,

    findBestContainerPos,

    determineTowerDamage,

    isCoreHubTileValid,

    safeStructureOwner,

    safeStructureMy,

    isControllerContainerPos,

    isControllerLinkPos,

    isControllerAreaLink,

    isControllerNeighborSource,

    getControllerNeighborSource,

    hasSharedSourceControllerLink,

    isSharedLinkReserveTile,

    shouldSkipControllerContainer,

    CONTROLLER_LINK_MAX_RANGE,

    SOURCE_CONTROLLER_SHARE_RANGE,

    resolveControllerContainer,

    hasControllerContainerSite,

    controllerContainersAdjacent,

    resolveSourceContainer,

    resolveSourceContainerSite,

    hasSourceContainerSite,

    sourceContainersAdjacent,

};