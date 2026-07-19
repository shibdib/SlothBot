/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Rampart perimeter, protection, and quad traps.

 */


const minCut = require('util.minCut');

const {extensionPositionCache, quadTraps} = require('planState');

const {bunkerTemplate, coreTemplate, protectedStructureTypes} = require('planTemplates');

const {
    isValidRampartPosition, canPlaceConstructionSite, tryCreateConstructionSite, canPlaceConstructedWall,
    filterPerimeterBarrierSpots, bridgePerimeterGaps, isPerimeterBarrierTile,
    invalidateRoomConstructionSiteCache, roomConstructionSiteBudget,
} = require('planUtils');

const PERIMETER_ORPHAN_EXIT_CLEARANCE = 5;
const TOWER_BUNKER_RING = 5;
const TOWER_CORRIDOR_MAX_STEPS = 4;

function chebyDistance(ax, ay, bx, by) {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

function getTowerCorridorPathSteps(fromPos, hub) {
    const path = fromPos.findPathTo(hub, {ignoreCreeps: true, maxOps: 4000});
    const steps = [];
    for (let i = 0; i < path.length && i < TOWER_CORRIDOR_MAX_STEPS; i++) {
        const step = path[i];
        if (chebyDistance(step.x, step.y, hub.x, hub.y) <= TOWER_BUNKER_RING) break;
        steps.push(step);
    }
    return steps;
}

function clampRect(rect) {
    const min = 2;
    const max = 47;
    let x1 = Math.min(Math.max(rect.x1, min), max);
    let x2 = Math.min(Math.max(rect.x2, min), max);
    let y1 = Math.min(Math.max(rect.y1, min), max);
    let y2 = Math.min(Math.max(rect.y2, min), max);
    if (x1 > x2) {
        const t = x1;
        x1 = x2;
        x2 = t;
    }
    if (y1 > y2) {
        const t = y1;
        y1 = y2;
        y2 = t;
    }
    // minCut randomly nudges 1-thick rects and can invert them at room edges; keep at least 2 tiles.
    if (x1 === x2) {
        if (x1 > min) x1--;
        else if (x2 < max) x2++;
    }
    if (y1 === y2) {
        if (y1 > min) y1--;
        else if (y2 < max) y2++;
    }
    return {x1, y1, x2, y2};
}

function pointRect(x, y, radius = 1) {
    return clampRect({x1: x - radius, y1: y - radius, x2: x + radius, y2: y + radius});
}

function invalidateRampartSpots(room) {
    if (ROOM_RAMPART_SPOTS) ROOM_RAMPART_SPOTS[room.name] = undefined;
    quadTraps[room.name] = undefined;
}

const SOURCE_PROTECTION_RADIUS = 4;
// Only wrap sources that sit inside the bunker envelope — far/pocket sources pull the cut
// outside natural walls into a second ring.
const SOURCE_PROTECT_MAX_HUB_RANGE = 12;
// minCut treats x/y 1 and 48 as TO_EXIT sinks; keep protected rects inset so the cut stays buildable.
const PERIMETER_BUILD_INSET = 3;
// Soft cap: drop cut tiles far past the farthest protected rect (stops exterior junk rings).
const PERIMETER_SPOT_HUB_MARGIN = 4;

function structureDistToEdge(x, y) {
    return Math.min(x, y, 49 - x, 49 - y);
}

function isBorderMinCutStructure(x, y) {
    return structureDistToEdge(x, y) <= PERIMETER_BUILD_INSET;
}

function pushProtectionRect(rectArray, x, y, radius = 1) {
    if (isBorderMinCutStructure(x, y)) return;
    rectArray.push(borderAwarePointRect(x, y, radius));
}

/**
 * BFS from hub through non-terrain-wall tiles (structures ignored).
 * Returns {set, dist} where dist[key] is path length from hub.
 * Optional maxDist stops expansion (CPU + keeps “around the ridge” far).
 */
function getHubWalkableFlood(room, maxDist) {
    const cap = maxDist != null ? maxDist : 60;
    const cacheKey = '_hubWalk_' + cap;
    if (room._hubWalkTick === Game.time && room[cacheKey]) return room[cacheKey];
    const hub = room.hub;
    const set = new Set();
    const dist = Object.create(null);
    if (!hub) {
        const empty = {set, dist};
        room[cacheKey] = empty;
        room._hubWalkTick = Game.time;
        return empty;
    }
    const terrain = Game.map.getRoomTerrain(room.name);
    const q = [hub.x, hub.y];
    const hubKey = hub.x + ',' + hub.y;
    set.add(hubKey);
    dist[hubKey] = 0;
    let qi = 0;
    while (qi < q.length) {
        const x = q[qi++];
        const y = q[qi++];
        const d = dist[x + ',' + y];
        if (d >= cap) continue;
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
            const key = nx + ',' + ny;
            if (set.has(key)) continue;
            if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) continue;
            set.add(key);
            dist[key] = d + 1;
            q.push(nx, ny);
        }
    }
    const result = {set, dist};
    room[cacheKey] = result;
    room._hubWalkTick = Game.time;
    return result;
}

function getHubWalkableSet(room) {
    return getHubWalkableFlood(room, 60).set;
}

/** True if (x,y) is walkable-from-hub or cardinally adjacent to that set. */
function touchesHubWalkable(hubWalkable, x, y) {
    const key = x + ',' + y;
    if (hubWalkable.has(key)) return true;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        if (hubWalkable.has((x + dx) + ',' + (y + dy))) return true;
    }
    return false;
}

function minPathDistNear(distMap, x, y) {
    let best = Infinity;
    const self = distMap[x + ',' + y];
    if (self != null) best = self;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const d = distMap[(x + dx) + ',' + (y + dy)];
        if (d != null && d < best) best = d;
    }
    return best;
}

/**
 * Drop cut tiles that sit outside the bunker envelope (other side of a natural wall pocket,
 * or leftover rings far from anything we actually protect).
 * Uses path distance from hub so “around the ridge” exterior rings are excluded.
 *
 * Never returns empty when input had spots — a thin minCut (terrain does most of the seal)
 * often has only a few tiles that look “far” by path length; pruning those left rooms with
 * 0 planned ramparts forever.
 */
function prunePerimeterSpotsToBunker(room, spots, maxHubRange) {
    if (!spots || !spots.length || !room.hub) return spots || [];
    const hub = room.hub;
    const baseRange = maxHubRange != null ? maxHubRange : 18;
    const chebyCap = baseRange + PERIMETER_SPOT_HUB_MARGIN;
    // Thin cuts (few tiles) are usually the real seal — only apply soft cheby filter.
    if (spots.length <= 12) {
        const soft = [];
        const seen = new Set();
        const softCheby = Math.max(chebyCap, 20);
        for (let i = 0; i < spots.length; i++) {
            const p = spots[i];
            const key = p.x + ',' + p.y;
            if (seen.has(key)) continue;
            if (chebyDistance(p.x, p.y, hub.x, hub.y) > softCheby + 8) continue;
            seen.add(key);
            soft.push(p);
        }
        return soft.length ? soft : spots.slice();
    }

    // Generous path budget: snake around natural walls without a full room flood every time.
    const pathCap = Math.max(chebyCap + 16, baseRange * 2, 28);
    const flood = getHubWalkableFlood(room, pathCap);
    const out = [];
    const seen = new Set();
    for (let i = 0; i < spots.length; i++) {
        const p = spots[i];
        const key = p.x + ',' + p.y;
        if (seen.has(key)) continue;
        if (chebyDistance(p.x, p.y, hub.x, hub.y) > chebyCap) continue;
        const pathD = minPathDistNear(flood.dist, p.x, p.y);
        if (pathD === Infinity || pathD > pathCap) continue;
        seen.add(key);
        out.push(p);
    }
    // Prefer a slightly dirty cut over no cut at all.
    if (!out.length) return spots.slice();
    return out;
}

function maxProtectionRangeFromHub(room, rectArray) {
    const hub = room.hub;
    if (!hub) return 12;
    let maxR = 8;
    for (let i = 0; i < rectArray.length; i++) {
        const r = rectArray[i];
        maxR = Math.max(
            maxR,
            chebyDistance(r.x1, r.y1, hub.x, hub.y),
            chebyDistance(r.x2, r.y2, hub.x, hub.y),
            chebyDistance(r.x1, r.y2, hub.x, hub.y),
            chebyDistance(r.x2, r.y1, hub.x, hub.y)
        );
    }
    return maxR;
}

function getBorderRampartTiles(room, layout) {
    const tiles = [];
    const seen = new Set();
    const add = (x, y) => {
        if (!isBorderMinCutStructure(x, y)) return;
        const key = x + ',' + y;
        if (seen.has(key)) return;
        seen.add(key);
        tiles.push({x, y});
    };

    if (extensionPositionCache[room.name]) {
        for (const {x, y} of extensionPositionCache[room.name]) add(x, y);
    }
    for (const ext of room.extensions) add(ext.pos.x, ext.pos.y);
    for (const site of room.constructionSites) {
        if (site.structureType === STRUCTURE_EXTENSION) add(site.pos.x, site.pos.y);
    }

    const hub = room.hub;
    if (layout && hub) {
        for (const structure of layout) {
            for (const buildPos of structure.pos) {
                add(hub.x + buildPos.x, hub.y + buildPos.y);
            }
        }
    }

    for (const source of room.sources) {
        const container = Game.getObjectById(source.memory.container);
        if (container) add(container.pos.x, container.pos.y);
        const link = source.memory.link && Game.getObjectById(source.memory.link);
        if (link) add(link.pos.x, link.pos.y);
    }

    for (const tower of room.towers) add(tower.pos.x, tower.pos.y);
    if (room.memory.towerHubs) {
        for (const {x, y} of room.memory.towerHubs) add(x, y);
    }

    return tiles;
}

function borderInsetRadius(x, y, maxRadius) {
    const distToEdge = Math.min(x, y, 49 - x, 49 - y);
    return Math.min(maxRadius, Math.max(distToEdge - PERIMETER_BUILD_INSET, 1));
}

function borderAwarePointRect(x, y, maxRadius = 1) {
    let x1 = x - maxRadius;
    let x2 = x + maxRadius;
    let y1 = y - maxRadius;
    let y2 = y + maxRadius;
    if (x - PERIMETER_BUILD_INSET < 2) x1 = Math.max(x1, x);
    if (x + PERIMETER_BUILD_INSET > 47) x2 = Math.min(x2, x);
    if (y - PERIMETER_BUILD_INSET < 2) y1 = Math.max(y1, y);
    if (y + PERIMETER_BUILD_INSET > 47) y2 = Math.min(y2, y);
    return clampRect({x1, y1, x2, y2});
}

function borderAwareBoxRect(x1, y1, x2, y2, cx, cy) {
    if (cy <= 2 + PERIMETER_BUILD_INSET) y1 = Math.max(y1, cy);
    if (cy >= 47 - PERIMETER_BUILD_INSET) y2 = Math.min(y2, cy);
    if (cx <= 2 + PERIMETER_BUILD_INSET) x1 = Math.max(x1, cx);
    if (cx >= 47 - PERIMETER_BUILD_INSET) x2 = Math.min(x2, cx);
    return clampRect({x1, y1, x2, y2});
}

function shouldProtectSourceNearHub(room, source) {
    const hub = room.hub;
    if (!hub || !source) return false;
    // Pocket sources behind natural walls still path-connect via long routes; require range + touch.
    if (chebyDistance(source.pos.x, source.pos.y, hub.x, hub.y) > SOURCE_PROTECT_MAX_HUB_RANGE) {
        return false;
    }
    const hubWalkable = getHubWalkableSet(room);
    // Source tile itself is terrain wall — check adjacent harvest tiles or container.
    const container = source.memory && source.memory.container
        ? Game.getObjectById(source.memory.container)
        : null;
    if (container && touchesHubWalkable(hubWalkable, container.pos.x, container.pos.y)) return true;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        if (touchesHubWalkable(hubWalkable, source.pos.x + dx, source.pos.y + dy)) return true;
    }
    return false;
}

function getSourceProtectionRects(room) {
    const rects = [];
    const hub = room.hub;
    if (!hub) return rects;
    for (const source of room.sources) {
        if (!shouldProtectSourceNearHub(room, source)) continue;

        const {x, y} = source.pos;
        const distToEdge = Math.min(x, y, 49 - x, 49 - y);
        // Source tiles are impassable; near edges only wrap container/link so the cut avoids TO_EXIT rows.
        if (distToEdge > SOURCE_PROTECTION_RADIUS) {
            pushProtectionRect(rects, x, y, borderInsetRadius(x, y, SOURCE_PROTECTION_RADIUS));
        }

        const container = source.memory && source.memory.container
            ? Game.getObjectById(source.memory.container)
            : null;
        if (container) {
            pushProtectionRect(rects, container.pos.x, container.pos.y, 1);
        }

        const link = source.memory && source.memory.link && Game.getObjectById(source.memory.link);
        if (link) {
            pushProtectionRect(rects, link.pos.x, link.pos.y, 1);
        } else if (container) {
            const linkSite = container.pos.findInRange(FIND_CONSTRUCTION_SITES, 1)
                .find(s => s.structureType === STRUCTURE_LINK);
            if (linkSite) pushProtectionRect(rects, linkSite.pos.x, linkSite.pos.y, 1);
        }
    }
    return rects;
}

function getTowerProtectionRects(room) {
    const rects = [];
    const hub = room.hub;
    if (!hub) return rects;
    const hubWalkable = getHubWalkableSet(room);
    const towerPositions = room.towers.map(t => t.pos);
    if (room.memory.towerHubs) {
        for (const {x, y} of room.memory.towerHubs) {
            const pos = new RoomPosition(x, y, room.name);
            if (!towerPositions.some(p => p.isEqualTo(pos))) towerPositions.push(pos);
        }
    }
    for (const tp of towerPositions) {
        // Towers stranded outside the bunker (wrong side of terrain) must not drag the cut out.
        if (!touchesHubWalkable(hubWalkable, tp.x, tp.y)) continue;
        if (chebyDistance(tp.x, tp.y, hub.x, hub.y) > SOURCE_PROTECT_MAX_HUB_RANGE + 4) continue;
        pushProtectionRect(rects, tp.x, tp.y, borderInsetRadius(tp.x, tp.y, 2));
        for (const step of getTowerCorridorPathSteps(tp, hub)) {
            pushProtectionRect(rects, step.x, step.y, borderInsetRadius(step.x, step.y, 2));
        }
    }
    return rects;
}

// Tick-local corridor cache — findPathTo per source every ensure was a CPU bomb.
const rampartCorridorCache = Object.create(null);
const rampartCorridorTick = Object.create(null);

function getRampartWalkCorridors(room) {
    const name = room.name;
    if (rampartCorridorTick[name] === Game.time && rampartCorridorCache[name]) {
        return rampartCorridorCache[name];
    }
    const keys = new Set();
    const hub = room.hub;
    if (!hub) {
        rampartCorridorCache[name] = keys;
        rampartCorridorTick[name] = Game.time;
        return keys;
    }
    const addFullPath = (from) => {
        // Low maxOps — corridors only bias wall-vs-rampart; missing a step is fine.
        const path = from.findPathTo(hub, {ignoreCreeps: true, maxOps: 500, maxRooms: 1});
        for (const step of path) keys.add(step.x + ',' + step.y);
    };
    const addTowerPath = (from) => {
        for (const step of getTowerCorridorPathSteps(from, hub)) {
            keys.add(step.x + ',' + step.y);
        }
    };
    for (const tower of room.towers) addTowerPath(tower.pos);
    if (room.memory.towerHubs) {
        for (const {x, y} of room.memory.towerHubs) {
            addTowerPath(new RoomPosition(x, y, room.name));
        }
    }
    for (const source of room.sources) {
        const container = source.memory && source.memory.container
            ? Game.getObjectById(source.memory.container)
            : null;
        if (!container) continue;
        addFullPath(container.pos);
        if (source.memory.accessReserved) {
            keys.add(source.memory.accessReserved.x + ',' + source.memory.accessReserved.y);
        }
    }
    rampartCorridorCache[name] = keys;
    rampartCorridorTick[name] = Game.time;
    return keys;
}

/** Built barrier keys for a room — one structure scan, reused for incomplete checks. */
function getBuiltBarrierKeySet(room) {
    if (room._barrierKeySetTick === Game.time && room._barrierKeySet) return room._barrierKeySet;
    const set = new Set();
    const barriers = room.barriers || [];
    for (let i = 0; i < barriers.length; i++) {
        const b = barriers[i];
        if (b && b.pos) set.add(b.pos.x + ',' + b.pos.y);
    }
    // Fallback if room.barriers is empty/unavailable
    if (!set.size) {
        const ramparts = room.ramparts || [];
        for (let i = 0; i < ramparts.length; i++) {
            const r = ramparts[i];
            if (r && r.pos) set.add(r.pos.x + ',' + r.pos.y);
        }
        const walls = room.constructedWalls || [];
        for (let i = 0; i < walls.length; i++) {
            const w = walls[i];
            if (w && w.pos) set.add(w.pos.x + ',' + w.pos.y);
        }
    }
    room._barrierKeySet = set;
    room._barrierKeySetTick = Game.time;
    return set;
}

/**
 * Cheap incomplete check — no RoomPosition / lookFor per tile.
 * Returns true if any planned spot lacks a built barrier (sites still count as incomplete).
 */
function perimeterHasMissingBuilt(room) {
    const spots = getPerimeterSpots(room.name);
    if (!spots.length) return false;
    const built = getBuiltBarrierKeySet(room);
    for (let i = 0; i < spots.length; i++) {
        const p = spots[i];
        if (!built.has(p.x + ',' + p.y)) return true;
    }
    return false;
}

function isOnSourcePad(pos, room) {
    for (const source of room.sources) {
        const container = Game.getObjectById(source.memory.container);
        const anchor = container ? container.pos : source.pos;
        if (pos.getRangeTo(anchor) <= 2) return true;
    }
    return false;
}


function hasBarrierUnderlay(pos) {
    return pos.lookFor(LOOK_STRUCTURES).some(s =>
        s.structureType !== STRUCTURE_RAMPART &&
        s.structureType !== STRUCTURE_WALL &&
        s.structureType !== STRUCTURE_ROAD);
}

function isNearNewPerimeterSpot(pos, newSpotSet) {
    for (const key of newSpotSet) {
        const comma = key.indexOf(',');
        const nx = Number(key.slice(0, comma));
        const ny = Number(key.slice(comma + 1));
        if (Math.max(Math.abs(pos.x - nx), Math.abs(pos.y - ny)) <= 1) return true;
    }
    return false;
}


/**
 * Bare wall/rampart not on the current plan — safe to scrap.
 * Keeps structure covers, source pads, and intentional controller/mineral rings.
 */
function isRemovableStrayBarrier(pos, room, perimeterSpotSet) {
    if (perimeterSpotSet.has(`${pos.x},${pos.y}`)) return false;
    // Protects a building (extension, storage, etc.) — keep.
    if (hasBarrierUnderlay(pos)) return false;
    if (isOnSourcePad(pos, room)) return false;
    if (room.controller && pos.isNearTo(room.controller)) return false;
    if (room.mineral && pos.isNearTo(room.mineral)) return false;
    for (const source of room.sources) {
        if (pos.isNearTo(source)) return false;
    }
    return true;
}

function auditStrayBarriers(room, spots) {
    let perimeterSpots = spots;
    if (!perimeterSpots) {
        perimeterSpots = ROOM_RAMPART_SPOTS && ROOM_RAMPART_SPOTS[room.name]
            ? JSON.parse(ROOM_RAMPART_SPOTS[room.name])
            : null;
    }
    if (!perimeterSpots || !perimeterSpots.length) {
        return {count: 0, strays: [], reason: 'no perimeter spots (run recalculateRamparts first)'};
    }
    const perimeterSpotSet = new Set(perimeterSpots.map(p => `${p.x},${p.y}`));
    const strays = [];
    for (const s of room.structures) {
        if (s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL) continue;
        if (!isRemovableStrayBarrier(s.pos, room, perimeterSpotSet)) continue;
        strays.push({x: s.pos.x, y: s.pos.y, kind: 'built', type: s.structureType});
    }
    for (const site of room.constructionSites) {
        if (site.structureType !== STRUCTURE_RAMPART && site.structureType !== STRUCTURE_WALL) continue;
        if (!isRemovableStrayBarrier(site.pos, room, perimeterSpotSet)) continue;
        strays.push({x: site.pos.x, y: site.pos.y, kind: 'site', type: site.structureType});
    }
    return {count: strays.length, strays, perimeterSpots: perimeterSpots.length};
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

    for (const site of room.constructionSites) {
        if (site.structureType !== STRUCTURE_RAMPART && site.structureType !== STRUCTURE_WALL) continue;
        if (!isRemovableStrayBarrier(site.pos, room, perimeterSpotSet)) continue;
        try {
            site.remove();
            removed++;
        } catch (e) {
        }
    }

    if (removed && room.memory.quadTrapWalls && room.memory.quadTrapWalls.length) {
        const before = room.memory.quadTrapWalls.length;
        room.memory.quadTrapWalls = room.memory.quadTrapWalls.filter(p =>
            !isRemovableStrayBarrier(new RoomPosition(p.x, p.y, room.name), room, perimeterSpotSet));
        if (room.memory.quadTrapWalls.length < before) quadTraps[room.name] = undefined;
    }

    return removed;
}

function previewRampartCleanup(room, layout) {
    const tmpl = layout || (room.memory.dynamicLayout ? coreTemplate : bunkerTemplate);
    const saved = ROOM_RAMPART_SPOTS && ROOM_RAMPART_SPOTS[room.name];
    if (!shouldComputeBunkerRampartSpots(room)) {
        return {spots: 0, strayBarriers: auditStrayBarriers(room), reason: 'cannot compute'};
    }
    initializeRampartSpots(room, tmpl, false);
    const spots = ROOM_RAMPART_SPOTS && ROOM_RAMPART_SPOTS[room.name]
        ? JSON.parse(ROOM_RAMPART_SPOTS[room.name])
        : [];
    const strayBarriers = auditStrayBarriers(room, spots);
    if (!saved) delete ROOM_RAMPART_SPOTS[room.name];
    return {spots: spots.length, strayBarriers};
}

function isOrphanedUncachedBarrier(pos, room, newSpotSet) {
    if (newSpotSet.has(`${pos.x},${pos.y}`)) return false;
    if (isOnSourcePad(pos, room)) return false;
    if (hasBarrierUnderlay(pos)) return false;
    if (room.controller && pos.isNearTo(room.controller)) return false;
    if (room.mineral && pos.isNearTo(room.mineral)) return false;

    // Near exit / room edge — classic orphan strip.
    const exit = pos.findClosestByRange(FIND_EXIT);
    if (exit && pos.getRangeTo(exit) <= PERIMETER_ORPHAN_EXIT_CLEARANCE) return true;
    if (structureDistToEdge(pos.x, pos.y) <= PERIMETER_BUILD_INSET + 2) return true;

    const hub = room.hub;
    if (hub && pos.getRangeTo(hub) > 4 && isNearNewPerimeterSpot(pos, newSpotSet)) return true;

    // Outside bunker envelope / other side of natural wall (not walkably part of hub area).
    if (hub) {
        const hubWalkable = getHubWalkableSet(room);
        if (!touchesHubWalkable(hubWalkable, pos.x, pos.y)) return true;
        // Far past the planned seal.
        let maxPlan = 0;
        for (const key of newSpotSet) {
            const comma = key.indexOf(',');
            const nx = Number(key.slice(0, comma));
            const ny = Number(key.slice(comma + 1));
            maxPlan = Math.max(maxPlan, chebyDistance(nx, ny, hub.x, hub.y));
        }
        if (maxPlan > 0 && chebyDistance(pos.x, pos.y, hub.x, hub.y) > maxPlan + PERIMETER_SPOT_HUB_MARGIN) {
            return true;
        }
    }
    return false;
}

function removeUncachedPerimeterBarriers(room, newSpotSet) {
    if (!newSpotSet || !newSpotSet.size) return 0;
    let removed = 0;

    for (const s of room.structures) {
        if (s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL) continue;
        if (!isOrphanedUncachedBarrier(s.pos, room, newSpotSet)) continue;
        try {
            if (s.destroy() === OK) removed++;
        } catch (e) {
        }
    }

    for (const site of room.constructionSites) {
        if (site.structureType !== STRUCTURE_RAMPART && site.structureType !== STRUCTURE_WALL) continue;
        if (!isOrphanedUncachedBarrier(site.pos, room, newSpotSet)) continue;
        try {
            site.remove();
            removed++;
        } catch (e) {
        }
    }

    if (removed && room.memory.quadTrapWalls && room.memory.quadTrapWalls.length) {
        const before = room.memory.quadTrapWalls.length;
        room.memory.quadTrapWalls = room.memory.quadTrapWalls.filter(p =>
            !isOrphanedUncachedBarrier(new RoomPosition(p.x, p.y, room.name), room, newSpotSet));
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

    for (const site of room.constructionSites) {
        if (site.structureType !== STRUCTURE_RAMPART && site.structureType !== STRUCTURE_WALL) continue;
        if (!isStale(site.pos.x, site.pos.y)) continue;
        try {
            site.remove();
            removed++;
        } catch (e) {
        }
    }

    if (room.memory.quadTrapWalls && room.memory.quadTrapWalls.length) {
        const before = room.memory.quadTrapWalls.length;
        room.memory.quadTrapWalls = room.memory.quadTrapWalls.filter(p => !isStale(p.x, p.y));
        if (room.memory.quadTrapWalls.length < before) quadTraps[room.name] = undefined;
    }

    return removed;
}


function getProtectedAreaBounds(layout, room) {
    let rectArray = [];
    if (!room.hub) return rectArray;
    for (let structure of layout) {
        for (let buildPos of structure.pos) {
            const sx = buildPos.x + room.hub.x;
            const sy = buildPos.y + room.hub.y;
            pushProtectionRect(rectArray, sx, sy, 1);
        }
    }
    if (room.memory.labHub) {
        const labHub = room.memory.labHub;
        if (!isBorderMinCutStructure(labHub.x, labHub.y)) {
            rectArray.push(borderAwareBoxRect(labHub.x - 3, labHub.y - 3, labHub.x + 3, labHub.y + 3, labHub.x, labHub.y));
        }
    }
    if (room.memory.towerHubs) {
        for (const {x, y} of room.memory.towerHubs) {
            pushProtectionRect(rectArray, x, y, 1);
        }
    }
    rectArray = rectArray.concat(getTowerProtectionRects(room));
    rectArray = rectArray.concat(getSourceProtectionRects(room));
    if (extensionPositionCache[room.name]) {
        for (const {x, y} of extensionPositionCache[room.name]) {
            pushProtectionRect(rectArray, x, y, borderInsetRadius(x, y, 1));
        }
    }
    for (const ext of room.extensions) {
        pushProtectionRect(rectArray, ext.pos.x, ext.pos.y, borderInsetRadius(ext.pos.x, ext.pos.y, 1));
    }
    return rectArray.map(clampRect);
}

function shouldComputeBunkerRampartSpots(room) {
    return !!(room.controller && room.controller.level >= BUNKER_LEVEL && room.hub);
}

/** True when cache has a non-empty spot list. "[]" is treated as missing so we recompute. */
function hasPerimeterSpots(roomName) {
    const raw = ROOM_RAMPART_SPOTS && ROOM_RAMPART_SPOTS[roomName];
    if (!raw) return false;
    try {
        const spots = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(spots) && spots.length > 0;
    } catch (e) {
        return false;
    }
}

function getPerimeterSpots(roomName) {
    if (!hasPerimeterSpots(roomName)) return [];
    try {
        const raw = ROOM_RAMPART_SPOTS[roomName];
        return typeof raw === 'string' ? JSON.parse(raw) : (raw || []);
    } catch (e) {
        return [];
    }
}

function auditRampartRecalc(room, layout) {
    const tmpl = layout || (room.memory.dynamicLayout ? coreTemplate : bunkerTemplate);
    const cached = ROOM_RAMPART_SPOTS && ROOM_RAMPART_SPOTS[room.name]
        ? JSON.parse(ROOM_RAMPART_SPOTS[room.name])
        : [];
    const rectArray = room.hub ? getProtectedAreaBounds(tmpl, room) : [];
    return {
        roomName: room.name,
        controllerLevel: room.controller && room.controller.level,
        roomLevel: room.level,
        energyCapacity: room.energyCapacityAvailable,
        bunkerLevelRequired: BUNKER_LEVEL,
        hasHub: !!room.hub,
        bunkerHub: room.memory.bunkerHub,
        canCompute: shouldComputeBunkerRampartSpots(room),
        protectionRects: rectArray.length,
        cachedSpots: cached.length,
    };
}

function initializeRampartSpots(room, layout, count) {
    ROOM_RAMPART_SPOTS[room.name] = undefined;
    if (!room.hub) {
        log.w(`${room.name} rampart init skipped: no hub`);
        return count ? 0 : undefined;
    }
    const tmpl = layout || (room.memory.dynamicLayout ? coreTemplate : bunkerTemplate);
    let rectArray = getProtectedAreaBounds(tmpl, room)
        .filter(r => r.x1 <= r.x2 && r.y1 <= r.y2);
    let bounds = {x1: 0, y1: 0, x2: 49, y2: 49};
    const maxHubRange = maxProtectionRangeFromHub(room, rectArray);

    try {
        const rawSpots = minCut.GetCutTiles(room.name, rectArray, bounds) || [];
        const filtered = filterPerimeterBarrierSpots(room, rawSpots);
        const bridged = bridgePerimeterGaps(room, filtered);
        let spots = prunePerimeterSpotsToBunker(room, bridged, maxHubRange);
        // Fallbacks: never discard a usable cut because prune/filter was too strict.
        if (!spots.length && bridged.length) spots = bridged;
        if (!spots.length && filtered.length) spots = filtered;
        if (!spots.length && rawSpots.length) {
            spots = filterPerimeterBarrierSpots(room, rawSpots);
        }
        // Never stick an empty "[]" in cache — that is truthy and blocks re-init forever.
        if (!spots.length) {
            log.w(`${room.name} rampart init produced 0 spots (raw=${rawSpots.length} filtered=${filtered.length} bridged=${bridged.length} rects=${rectArray.length} maxR=${maxHubRange}); will retry`);
            ROOM_RAMPART_SPOTS[room.name] = undefined;
        } else {
            ROOM_RAMPART_SPOTS[room.name] = JSON.stringify(spots);
            if (spots.length < bridged.length && Game.time % 50 === 0) {
                log.a(`${room.name} pruned ${bridged.length - spots.length} exterior/disconnected perimeter tile(s)`, 'PLANNER');
            }
            if (rawSpots.length <= 8 && Game.time % 100 === 0) {
                log.a(`${room.name} thin minCut seal: raw=${rawSpots.length} final=${spots.length} rects=${rectArray.length}`, 'PLANNER');
            }
        }
    } catch (e) {
        log.e('MinCut Error in room ' + room.name);
        log.e(e.stack);
        ROOM_RAMPART_SPOTS[room.name] = undefined;
    }

    if (count) {
        return getPerimeterSpots(room.name).length;
    }
}

function auditOrphanBarriers(room) {
    const newSpots = ROOM_RAMPART_SPOTS && ROOM_RAMPART_SPOTS[room.name]
        ? JSON.parse(ROOM_RAMPART_SPOTS[room.name])
        : null;
    if (!newSpots || !newSpots.length) {
        return {count: 0, orphans: [], reason: 'no cached perimeter spots'};
    }
    const newSpotSet = new Set(newSpots.map(p => `${p.x},${p.y}`));
    const orphans = [];

    for (const s of room.structures) {
        if (s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL) continue;
        if (!isOrphanedUncachedBarrier(s.pos, room, newSpotSet)) continue;
        orphans.push({x: s.pos.x, y: s.pos.y, kind: 'built', type: s.structureType});
    }
    for (const site of room.constructionSites) {
        if (site.structureType !== STRUCTURE_RAMPART && site.structureType !== STRUCTURE_WALL) continue;
        if (!isOrphanedUncachedBarrier(site.pos, room, newSpotSet)) continue;
        orphans.push({x: site.pos.x, y: site.pos.y, kind: 'site', type: site.structureType});
    }
    return {count: orphans.length, orphans, perimeterSpots: newSpots.length};
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
 *   NOT mass-delete a full constructed wall ring when the minCut shifts.
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
        require('planExtensions').getExtensionPositions(room);
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

    // Reject catastrophic shrink of a large existing perimeter — not small terrain-aided seals.
    // Bug: minKeep = max(10, …) meant a 6-spot plan could never be replaced by any cut with <10
    // tiles, so rooms stuck forever on tiny restoredFromOld plans.
    if (oldSpots.length >= 15 && newSpots.length && !restoredFromOld) {
        const minKeep = Math.max(8, Math.floor(oldSpots.length * 0.4));
        if (newSpots.length < minKeep) {
            const thinCount = newSpots.length;
            ROOM_RAMPART_SPOTS[room.name] = JSON.stringify(oldSpots);
            newSpots = oldSpots;
            restoredFromOld = true;
            restoreReason = `thin_${thinCount}_lt_${minKeep}`;
            log.w(`${room.name} rampart regen too thin (${thinCount}<${minKeep}); kept prior ${oldSpots.length} spots`);
        }
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
        // Old plan tiles not in new plan: gated on energy so we don't open a hole mid-move.
        if (room.energyState) {
            removedStale = removeStalePerimeterBarriers(room, oldSpotSet, newSpotSet);
        }
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

function rampartBuilder(room, layout = undefined, count = false) {
    // Clean old ramparts
    if (Memory.rampartVersion !== RAMPART_VERSION) {
        Memory.rampartVersion = RAMPART_VERSION;
        for (const r of MY_ROOMS) {
            const owned = Game.rooms[r];
            if (!owned) continue;
            owned.structures.filter((s) =>
                s.structureType === STRUCTURE_RAMPART || (s.structureType === STRUCTURE_ROAD && s.pos.checkForRampart())
            ).forEach((q) => q.destroy());
            owned.constructionSites.filter((s) =>
                [STRUCTURE_RAMPART, STRUCTURE_WALL].includes(s.structureType)
            ).forEach((s) => s.remove());
            if (ROOM_RAMPART_SPOTS) ROOM_RAMPART_SPOTS[r] = undefined;
        }
    }

    // Bunker perimeter: always plan/place when RCL allows — do not wait on energyState
    // (energy-poor rooms otherwise keep permanent holes after a redo/recalc).
    // Protective extras (on structures / sources) still require energyState.
    // Use controller.level (not energy-tier room.level) so incomplete extensions never stall seals.
    if (bunkerLevelAllowsPerimeter(room)) {
        if (handleBunkerRamparts(room, layout, count)) return true;
        if (room.energyState && buildProtectiveRamparts(room, layout)) return true;
    }

    // Handle quad traps — RCL8 only, walls capped at 20k
    if (room.level >= 8 && room.energyState && buildQuadTraps(room)) {
        return true;
    }

    function handleBunkerRamparts(room, layout, count) {
        // "[]" is truthy — must treat empty list as missing or we never recompute.
        if (!hasPerimeterSpots(room.name)) {
            return initializeRampartSpots(room, layout, count);
        }
        // Layout path: place a few sites; bridging already done at init/recalc.
        return ensurePerimeterSites(room, {
            maxPlace: 3,
            bridge: false,
            allowInit: false,
            recordStatus: false,
        }) > 0;
    }

    function buildProtectiveRamparts(room, layout) {
        const ramparts = ROOM_RAMPART_SPOTS && ROOM_RAMPART_SPOTS[room.name] ? JSON.parse(ROOM_RAMPART_SPOTS[room.name]) : undefined;
        if (!ramparts || !ramparts.length) return false;
        let counter = 0;
        if (buildBorderStructureRamparts(room, layout)) return true;
        const rampartPositions = ramparts.map(p => new RoomPosition(p.x, p.y, room.name));
        const vulnerableStructures = room.structures.filter((s) =>
            protectedStructureTypes.includes(s.structureType) &&
            !s.pos.checkForRampart() &&
            !s.pos.checkForConstructionSites());
        for (const structure of vulnerableStructures) {
            if (counter >= 3) return true;
            const rangeFromRampart = structure.pos.getRangeTo(structure.pos.findClosestByRange(rampartPositions));
            const inBunker = structure.pos.isInBunker();
            if ((rangeFromRampart <= 3 && inBunker) || !inBunker) {
                if (!canPlaceConstructionSite(room)) return true;
                if (tryCreateConstructionSite(structure.pos, STRUCTURE_RAMPART) === OK) counter++;
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
                            if (tryCreateConstructionSite(structure.pos, STRUCTURE_RAMPART) === OK) counter++;
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
            if (tryCreateConstructionSite(pos, STRUCTURE_RAMPART) === OK) counter++;
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
            if (room.memory.towerHubs && room.memory.towerHubs.some(h => Math.max(Math.abs(pos.x - h.x), Math.abs(pos.y - h.y)) <= 2)) continue;
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
                if (tryCreateConstructionSite(pos, STRUCTURE_WALL) === OK) {
                    counter++;
                    if (!newWallPositions.has(`${pos.x},${pos.y}`)) {
                        newWallPositions.add(`${pos.x},${pos.y}`);
                        if (!room.memory.quadTrapWalls) room.memory.quadTrapWalls = [];
                        room.memory.quadTrapWalls.push({x: pos.x, y: pos.y});
                    }
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
                    tryCreateConstructionSite(targetPos, STRUCTURE_RAMPART);
                    return true; // Stop after placing one rampart
                }
            }
        }
        return false; // Return false if no valid position was found
    }
}

function bunkerLevelAllowsPerimeter(room) {
    // controller.level is the structure unlock gate; room.level is energy-capacity tier and can lag.
    const rcl = room.controller && room.controller.level;
    if (rcl != null) return rcl >= BUNKER_LEVEL;
    return !!(room.level >= BUNKER_LEVEL);
}

function freeSiteSlotsForPerimeter(room, want) {
    if (want <= 0 || canPlaceConstructionSite(room)) return 0;
    // Never cannibalize extensions while the room still needs energy capacity.
    // After a wipe, incomplete perimeters used to delete extension sites every tick.
    let extDeficit = 0;
    try {
        extDeficit = require('planExtensions').getExtensionDeficit(room);
    } catch (e) { /* ignore circular load */
    }
    let freed = 0;
    // Prefer idle low-priority sites. Never remove spawn/tower/terminal sites.
    // Extensions only when the room is already at full extension count (deficit 0).
    const prefer = extDeficit > 0
        ? [STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_LINK]
        : [STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_EXTENSION, STRUCTURE_LINK];
    for (const type of prefer) {
        if (freed >= want) break;
        const sites = room.constructionSites.filter(s => s.structureType === type && !s.progress);
        for (const site of sites) {
            if (freed >= want) break;
            try {
                if (site.remove() === OK) freed++;
            } catch (e) { /* ignore */
            }
        }
    }
    if (freed) {
        invalidateRoomConstructionSiteCache(room);
        log.a(`${room.name} removed ${freed} idle site(s) to free slots for perimeter barriers`, 'PLANNER');
    }
    return freed;
}

function shouldBuildPerimeterTile(pos, room) {
    if (room.memory.towerHubs && room.memory.towerHubs.some(h => h.x === pos.x && h.y === pos.y)) {
        return 'towerHub';
    }
    if (pos.checkForWall()) return 'terrainWall';
    // ignoreWall + ignoreCreep — only obstacle structures block.
    if (pos.checkForImpassible(true, true)) return 'impassible';
    if (pos.checkForRampart()) return 'hasRampart';
    if (pos.checkForBarrierStructure && pos.checkForBarrierStructure()) return 'hasBarrier';
    if (pos.lookFor(LOOK_CONSTRUCTION_SITES).some(s =>
        s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL)) {
        return 'hasBarrierSite';
    }
    return true;
}

/**
 * Classic perimeter checkerboard:
 *  - (x+y) even → constructed wall (when tile allows)
 *  - (x+y) odd  → rampart
 * Wall tiles that sit on roads, walk corridors, or otherwise can't take a wall
 * get a rampart instead so the seal stays continuous.
 */
function choosePerimeterBarrierType(pos, corridors) {
    const isWallTile = ((pos.x + pos.y) & 1) === 0;
    if (!isWallTile) return STRUCTURE_RAMPART;
    if (pos.checkForRoad()) return STRUCTURE_RAMPART;
    if (corridors && corridors.has(pos.x + ',' + pos.y)) return STRUCTURE_RAMPART;
    if (!canPlaceConstructedWall(pos)) return STRUCTURE_RAMPART;
    return STRUCTURE_WALL;
}

function recordPerimeterPlaceStatus(room, status) {
    room.memory._perimeterPlaceFails = {
        tick: Game.time,
        ...status,
    };
}

/**
 * Place barrier construction sites for missing perimeter tiles.
 * Keep this lean: no bridge/minCut, no pathfinding unless wall fallback needs corridors.
 * @returns {number} sites placed this call
 */
function ensurePerimeterSites(room, options = {}) {
    const maxPlace = options.maxPlace != null ? options.maxPlace : 8;
    if (!room) return 0;
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
        return 0;
    }

    let spots = getPerimeterSpots(room.name);
    if (!spots.length) {
        // Only recompute minCut when explicitly requested — never on the every-tick path.
        if (!options.allowInit) {
            if (options.recordStatus) recordPerimeterPlaceStatus(room, {reason: 'no_spots', placed: 0});
            return 0;
        }
        ROOM_RAMPART_SPOTS[room.name] = undefined;
        initializeRampartSpots(room, room.memory.dynamicLayout ? coreTemplate : bunkerTemplate, false);
        spots = getPerimeterSpots(room.name);
        if (!spots.length) {
            if (options.recordStatus) recordPerimeterPlaceStatus(room, {reason: 'no_spots', placed: 0});
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
    if (!buildPositions.length) {
        if (options.recordStatus) {
            recordPerimeterPlaceStatus(room, {reason: 'nothing_to_build', placed: 0, planned: spots.length});
        }
        return 0;
    }

    // Incomplete perimeters always get a real site budget even at energyState 0.
    let siteCap = Math.min(maxPlace, room.energyState >= 2 ? 10 : room.energyState ? 6 : 5);
    if (buildPositions.length > 0) {
        siteCap = Math.max(siteCap, Math.min(maxPlace, 5));
    }

    // Reserve site slots for extensions while energy capacity is incomplete.
    // Without this, barrier spam fills MAX_CONSTRUCTION_SITES_PER_ROOM and extensions never place.
    let extReserve = 0;
    try {
        const deficit = require('planExtensions').getExtensionDeficit(room);
        if (deficit > 0) extReserve = Math.min(deficit, 3);
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

    const want = Math.max(0, siteCap - inBuild);
    if (want > 0 && !canPlaceConstructionSite(room)) {
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
                extDeficitHere = require('planExtensions').getExtensionDeficit(room);
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
        let lastResult = tryCreateConstructionSite(pos, wantType);
        let placed = lastResult === OK;
        if (!placed && wantType === STRUCTURE_WALL) {
            lastResult = tryCreateConstructionSite(pos, STRUCTURE_RAMPART);
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
            if (lastResult === ERR_FULL) {
                budgetBlocked = true;
                break;
            }
        }
    }

    // Status only when forced (console) or something changed / periodic — avoid Memory spam.
    if (options.recordStatus || cycles > 0 || (fails.length && Game.time % 50 === 0)) {
        recordPerimeterPlaceStatus(room, {
            reason: cycles > 0 ? 'placed'
                : budgetBlocked ? 'budget'
                    : fails.length ? 'fails'
                        : 'none',
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

    return cycles;
}

// Round-robin index for incomplete perimeter rooms (heap — fine if reset).
let perimeterEnsureCursor = 0;

/**
 * Throttled pass: at most 1 incomplete room places barriers per call.
 * Full multi-room ensure every tick (bridge + pathfind + lookFor) nuked bucket.
 */
function ensureAllIncompletePerimeters() {
    if (typeof BUNKER_LEVEL === 'undefined') return 0;
    // Skip every other tick when bucket is healthy; harder skip when low.
    const bucket = Game.cpu && Game.cpu.bucket != null ? Game.cpu.bucket : 10000;
    if (bucket < 2000 && Game.time % 5 !== 0) return 0;
    if (bucket < 5000 && Game.time % 3 !== 0) return 0;
    if (bucket >= 5000 && Game.time % 2 !== 0) return 0;

    const seen = new Set();
    const rooms = [];
    if (typeof MY_ROOMS !== 'undefined' && MY_ROOMS && MY_ROOMS.length) {
        for (const name of MY_ROOMS) {
            if (seen.has(name)) continue;
            seen.add(name);
            rooms.push(name);
        }
    }
    for (const name in Game.rooms) {
        if (seen.has(name)) continue;
        const r = Game.rooms[name];
        if (!r.controller || !r.controller.my) continue;
        seen.add(name);
        rooms.push(name);
    }
    if (!rooms.length) return 0;

    // One room per invocation; rotate so all incomplete rooms get turns.
    const start = perimeterEnsureCursor % rooms.length;
    perimeterEnsureCursor = start + 1;
    let placed = 0;

    for (let offset = 0; offset < rooms.length; offset++) {
        const name = rooms[(start + offset) % rooms.length];
        const room = Game.rooms[name];
        if (!room || !bunkerLevelAllowsPerimeter(room) || !room.hub) continue;
        // Skip rooms with no plan cache — init is expensive (minCut); leave to layout/rebuild.
        if (!hasPerimeterSpots(room.name)) continue;
        // Cheap incomplete: structure-list set, no lookFor per tile.
        if (!perimeterHasMissingBuilt(room)) continue;

        try {
            // maxPlace 3, no bridge, no minCut init on this path.
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

/**
 * Classify each planned perimeter tile and optionally test whether hostiles can
 * still reach the hub without crossing the planned seal (BFS).
 * @param {Room} room
 * @param {{draw?: boolean, drawTicks?: number, recompute?: boolean}} [options]
 */
function diagnosePerimeter(room, options = {}) {
    const draw = options.draw !== false;
    const hub = room.hub;
    const rawCache = ROOM_RAMPART_SPOTS && ROOM_RAMPART_SPOTS[room.name];
    let rawSpots = getPerimeterSpots(room.name);

    // Optional: force a fresh minCut for diagnostics when cache is empty.
    if ((!rawSpots.length || options.recompute) && hub && shouldComputeBunkerRampartSpots(room)) {
        const tmpl = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
        initializeRampartSpots(room, tmpl, false);
        rawSpots = getPerimeterSpots(room.name);
    }

    const spots = rawSpots.length
        ? bridgePerimeterGaps(room, filterPerimeterBarrierSpots(room, rawSpots.slice()))
        : [];
    const spotSet = new Set(spots.map(p => `${p.x},${p.y}`));

    const summary = {
        roomName: room.name,
        energyState: room.energyState,
        level: room.level,
        hasHub: !!hub,
        bunkerHub: room.memory.bunkerHub,
        cacheRaw: rawCache === undefined ? 'undefined'
            : rawCache === null ? 'null'
                : (typeof rawCache === 'string' ? `string(len=${rawCache.length})` : typeof rawCache),
        cacheEmptyArray: rawCache === '[]' || rawCache === 'null',
        canCompute: shouldComputeBunkerRampartSpots(room),
        planned: spots.length,
        built: 0,
        sites: 0,
        missing: 0,
        blocked: 0,
        sealed: null,
        leakExit: null,
        leakPathLen: null,
        tiles: [],
        blockers: [],
        missingTiles: [],
    };

    if (!spots.length) {
        summary.error = 'no planned perimeter spots (ROOM_RAMPART_SPOTS empty or [])';
        summary.hint = 'Call recalculateRamparts(room) or debugBarriers(room,{recompute:true}). '
            + 'Empty "[]" used to block re-init (fixed). Check hasHub / canCompute / minCut logs.';
        if (draw && room.visual) {
            room.visual.text(
                'NO PERIMETER SPOTS — cache empty',
                1, 1,
                {align: 'left', color: '#f66', font: 0.5, backgroundColor: 'rgba(0,0,0,0.6)', backgroundPadding: 0.15}
            );
        }
        return summary;
    }

    for (const {x, y} of spots) {
        const pos = new RoomPosition(x, y, room.name);
        const structs = pos.lookFor(LOOK_STRUCTURES);
        const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
        const hasRampart = structs.some(s => s.structureType === STRUCTURE_RAMPART);
        const hasWall = structs.some(s => s.structureType === STRUCTURE_WALL);
        const barrierSite = sites.find(s =>
            s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL);
        const obstacle = structs.find(s =>
            s.structureType !== STRUCTURE_RAMPART &&
            s.structureType !== STRUCTURE_WALL &&
            s.structureType !== STRUCTURE_ROAD &&
            s.structureType !== STRUCTURE_CONTAINER &&
            OBSTACLE_OBJECT_TYPES.includes(s.structureType));

        let status;
        let note;
        if (hasRampart || hasWall) {
            status = 'built';
            summary.built++;
            note = hasWall ? 'wall' : 'rampart';
        } else if (barrierSite) {
            status = 'site';
            summary.sites++;
            note = barrierSite.structureType;
        } else if (pos.checkForWall() || pos.checkForImpassible(true) || obstacle) {
            status = 'blocked';
            summary.blocked++;
            note = obstacle ? obstacle.structureType : 'impassible/terrain';
            summary.blockers.push({x, y, note});
        } else {
            status = 'missing';
            summary.missing++;
            summary.missingTiles.push({x, y});
        }
        summary.tiles.push({x, y, status, note});
    }

    // Seal test: planned spots act as walls. Can we walk hub → any exit?
    if (hub) {
        const terrain = Game.map.getRoomTerrain(room.name);
        const blocked = new Set(spotSet);
        // Existing non-plan barriers also block (don't count as leak through them).
        for (const s of room.structures) {
            if (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) {
                blocked.add(`${s.pos.x},${s.pos.y}`);
            } else if (OBSTACLE_OBJECT_TYPES.includes(s.structureType)) {
                blocked.add(`${s.pos.x},${s.pos.y}`);
            }
        }

        const walkable = (x, y) => {
            if (x < 0 || x > 49 || y < 0 || y > 49) return false;
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) return false;
            if (blocked.has(`${x},${y}`)) return false;
            return true;
        };

        const isExitEdge = (x, y) => x === 0 || y === 0 || x === 49 || y === 49;
        const q = [{x: hub.x, y: hub.y}];
        const seen = new Set([`${hub.x},${hub.y}`]);
        const parent = Object.create(null);
        let leak = null;

        while (q.length && !leak) {
            const cur = q.shift();
            if (isExitEdge(cur.x, cur.y)) {
                leak = cur;
                break;
            }
            for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                const nx = cur.x + dx;
                const ny = cur.y + dy;
                const key = `${nx},${ny}`;
                if (seen.has(key) || !walkable(nx, ny)) continue;
                // Touching exit tile from inside counts as open seal.
                if (isExitEdge(nx, ny)) {
                    leak = {x: nx, y: ny};
                    parent[key] = cur;
                    seen.add(key);
                    break;
                }
                seen.add(key);
                parent[key] = cur;
                q.push({x: nx, y: ny});
            }
        }

        if (leak) {
            summary.sealed = false;
            summary.leakExit = leak;
            // Reconstruct path length
            let len = 0;
            let node = leak;
            const path = [leak];
            while (node && !(node.x === hub.x && node.y === hub.y)) {
                const p = parent[`${node.x},${node.y}`];
                if (!p) break;
                path.push(p);
                node = p;
                len++;
                if (len > 2500) break;
            }
            summary.leakPathLen = len;
            summary.leakPath = path.reverse().slice(0, 40); // cap for console
            if (draw && room.visual) {
                for (let i = 1; i < path.length; i++) {
                    room.visual.line(path[i - 1].x, path[i - 1].y, path[i].x, path[i].y, {
                        color: '#ff0000', width: 0.15, opacity: 0.9,
                    });
                }
                room.visual.circle(leak.x, leak.y, {radius: 0.45, fill: '#f00', opacity: 0.9});
                room.visual.text('LEAK', leak.x, leak.y - 0.6, {color: '#f88', font: 0.4});
            }
        } else {
            summary.sealed = true;
        }
    } else {
        summary.sealed = null;
        summary.error = summary.error || 'no hub — cannot run seal BFS';
    }

    if (draw && room.visual) {
        const colors = {
            built: '#00ff66',
            site: '#ffee00',
            missing: '#ff3333',
            blocked: '#ff8800',
        };
        for (const t of summary.tiles) {
            room.visual.circle(t.x, t.y, {
                radius: 0.35,
                fill: colors[t.status] || '#fff',
                opacity: 0.75,
            });
        }
        if (hub) {
            room.visual.circle(hub.x, hub.y, {radius: 0.5, fill: '#00aaff', opacity: 0.5});
            room.visual.text('HUB', hub.x, hub.y - 0.55, {color: '#8cf', font: 0.35});
        }
        const sealTxt = summary.sealed === true ? 'SEALED'
            : summary.sealed === false ? 'OPEN' : 'n/a';
        room.visual.text(
            `plan ${summary.planned} | built ${summary.built} | site ${summary.sites} | miss ${summary.missing} | blk ${summary.blocked} | ${sealTxt}`,
            1, 1, {
                align: 'left',
                color: '#fff',
                font: 0.45,
                backgroundColor: 'rgba(0,0,0,0.55)',
                backgroundPadding: 0.15
            }
        );
    }

    return summary;
}

/**
 * Compact report for console: gaps + seal status + top missing tiles.
 * options.place=true forces ensurePerimeterSites this call (same tick).
 * options.probe (default true when still missing) live-places on first missing tiles.
 */
function debugBarriers(room, options = {}) {
    let placeResult;
    if (options.place) {
        placeResult = ensurePerimeterSites(room, {
            maxPlace: options.maxPlace != null ? options.maxPlace : 5,
            bridge: false,
            allowInit: false,
            recordStatus: true,
        });
    }

    let d = diagnosePerimeter(room, options);

    // Live probe first few missing tiles so console diagnoses without waiting for planner.
    let probe;
    if (options.probe !== false && d.missing > 0 && d.sites === 0) {
        probe = [];
        const tiles = (d.missingTiles || []).slice(0, 3);
        for (const t of tiles) {
            const pos = new RoomPosition(t.x, t.y, room.name);
            const buildOk = shouldBuildPerimeterTile(pos, room);
            const entry = {
                x: t.x, y: t.y,
                shouldBuild: buildOk,
                canPlace: canPlaceConstructionSite(room),
                siteBudget: roomConstructionSiteBudget(room),
                structures: pos.lookFor(LOOK_STRUCTURES).map(s => s.structureType),
                sites: pos.lookFor(LOOK_CONSTRUCTION_SITES).map(s => s.structureType),
            };
            if (buildOk === true && canPlaceConstructionSite(room)) {
                const corridors = getRampartWalkCorridors(room);
                const wantType = choosePerimeterBarrierType(pos, corridors);
                entry.wantType = wantType;
                entry.createResult = tryCreateConstructionSite(pos, wantType);
                if (entry.createResult !== OK && wantType === STRUCTURE_WALL) {
                    entry.createResult = tryCreateConstructionSite(pos, STRUCTURE_RAMPART);
                    entry.fallback = STRUCTURE_RAMPART;
                }
                entry.placed = entry.createResult === OK;
            }
            probe.push(entry);
            if (entry.placed) break;
        }
        // Refresh counts after probe placement.
        if (probe.some(p => p.placed)) {
            d = diagnosePerimeter(room, {draw: options.draw !== false, recompute: false});
        }
    }

    const allSites = room.constructionSites || [];
    const barrierSites = allSites.filter(s =>
        s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL);
    const otherSites = allSites.filter(s =>
        s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL);

    const placeFails = room.memory._perimeterPlaceFails;
    let hint;
    if (d.missing > 0 && d.sites === 0 && !(probe && probe.some(p => p.placed))) {
        if (placeFails && placeFails.reason === 'budget') {
            hint = 'Site budget blocked placement — free room/global construction sites or raise MAX_CONSTRUCTION_SITES_PER_ROOM';
        } else if (placeFails && placeFails.fails && placeFails.fails.length) {
            hint = 'Placement attempted but createConstructionSite failed — see placeFails';
        } else if (placeFails && placeFails.reason === 'exception') {
            hint = 'ensurePerimeterSites threw — see placeFails.error';
        } else {
            hint = 'Run debugBarriers(room,{place:true}) or rebuildBarriers(room) to force place this tick';
        }
    }

    const out = {
        room: d.roomName,
        energyState: d.energyState,
        level: d.level,
        planned: d.planned,
        built: d.built,
        sites: d.sites,
        missing: d.missing,
        blocked: d.blocked,
        sealed: d.sealed,
        leakExit: d.leakExit,
        leakPathLen: d.leakPathLen,
        siteBudget: roomConstructionSiteBudget(room),
        canPlace: canPlaceConstructionSite(room),
        barrierSites: barrierSites.length,
        otherSites: otherSites.length,
        otherSiteTypes: _.countBy(otherSites, 'structureType'),
        missingTiles: (d.missingTiles || []).slice(0, 25),
        blockers: (d.blockers || []).slice(0, 15),
        leakPathSample: d.leakPath,
        error: d.error,
        placeResult,
        placeFails,
        probe,
        lastSiteError: room.memory.plannerLastSiteError,
        hint,
        legend: 'visual: green=built yellow=site red=missing orange=blocked blue=hub red line=leak',
    };
    return out;
}

module.exports = {

    rampartBuilder,

    invalidateRampartSpots,

    recalculateRampartsForRoom,

    auditRampartRecalc,

    auditStrayBarriers,

    previewRampartCleanup,

    shouldComputeBunkerRampartSpots,

    auditOrphanBarriers,

    purgeOrphanBarriers,

    diagnosePerimeter,

    debugBarriers,

    ensurePerimeterSites,

    ensureAllIncompletePerimeters,

};