/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Rampart / perimeter GEOMETRY library.
 *
 * Perimeter is a single floodfill from the room hub through walkable tiles
 * (never through terrain walls). The contour of that flooded interior is the
 * seal. Placement stays in planRamparts (checkerboard wall/rampart).
 *
 * Protect targets: hub + primary hub structures + towers, including built,
 * construction sites, and planned stamps/anchors so a recompute does not
 * shrink past work already in progress.
 */

const {extensionPositionCache, quadTraps} = require('planState');

const {bunkerTemplate, coreTemplate, labTemplate} = require('planTemplates');

const {
    canPlaceConstructionSite, tryCreateConstructionSite, canPlaceConstructedWall,
    filterPerimeterBarrierSpots, roomConstructionSiteBudget,
} = require('planUtils');

const PERIMETER_ORPHAN_EXIT_CLEARANCE = 5;
const PERIMETER_BUILD_INSET = 3;
const PERIMETER_EDGE = 2;
const PERIMETER_PAD = 1;
const PERIMETER_MAX_CHEBY = 14;
const PERIMETER_MAX_PATH = 20;
// 8-connected path == cheby on open ground. Extra steps mean the flood wrapped
// around a terrain wall — drop those seeds so the blob cannot balloon.
const PERIMETER_MAX_WRAP = 4;
const PERIMETER_SPOT_HUB_MARGIN = 4;
const TOWER_BUNKER_RING = 5;
const TOWER_CORRIDOR_MAX_STEPS = 4;

const CARDINALS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const OCTALS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

const PRIMARY_HUB_TYPES = [
    STRUCTURE_SPAWN,
    STRUCTURE_STORAGE,
    STRUCTURE_TERMINAL,
    STRUCTURE_FACTORY,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_NUKER,
    STRUCTURE_OBSERVER,
    STRUCTURE_LAB,
    STRUCTURE_LINK,
    STRUCTURE_TOWER,
];

/** C4: plan.anchors.towers first, legacy towerHubs fallback. */
function resolveTowerHubList(room) {
    try {
        return require('planDoc').getTowerHubs(room) || [];
    } catch (e) {
        return (room.memory && room.memory.towerHubs) || [];
    }
}

/** C4: plan.anchors.lab first. */
function resolveLabHubXY(room) {
    try {
        const res = require('planDoc').getLabHub(room);
        return res && res.hub ? res.hub : null;
    } catch (e) {
        return room.memory && room.memory.labHub ? room.memory.labHub : null;
    }
}

/**
 * Bump when the perimeter algorithm changes so owned rooms wipe old
 * min-cut rings and rebuild from the hub floodfill.
 */
const PERIMETER_PLAN_REV = 7;

function chebyDistance(ax, ay, bx, by) {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

function xyKey(x, y) {
    return x + ',' + y;
}

function isTerrainWall(terrain, x, y) {
    return !!(terrain.get(x, y) & TERRAIN_MASK_WALL);
}

function isPrimaryHubType(structureType) {
    for (let i = 0; i < PRIMARY_HUB_TYPES.length; i++) {
        if (PRIMARY_HUB_TYPES[i] === structureType) return true;
    }
    return false;
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

function invalidateRampartSpots(room) {
    if (ROOM_RAMPART_SPOTS) ROOM_RAMPART_SPOTS[room.name] = undefined;
    quadTraps[room.name] = undefined;
}

/**
 * 8-connected flood from hub through non-terrain-wall tiles.
 * Never steps onto a terrain wall, so the protected blob cannot leak
 * through mountains the way min-cut rects did.
 */
function getHubWalkableFlood(room, maxDist) {
    const cap = maxDist != null ? maxDist : PERIMETER_MAX_PATH + PERIMETER_PAD + 2;
    const cacheKey = '_hubWalk8_' + cap;
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
    const hubKey = xyKey(hub.x, hub.y);
    set.add(hubKey);
    dist[hubKey] = 0;
    let qi = 0;
    while (qi < q.length) {
        const x = q[qi++];
        const y = q[qi++];
        const d = dist[xyKey(x, y)];
        if (d >= cap) continue;
        for (let i = 0; i < 8; i++) {
            const nx = x + OCTALS[i][0];
            const ny = y + OCTALS[i][1];
            if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
            const key = xyKey(nx, ny);
            if (set.has(key)) continue;
            if (isTerrainWall(terrain, nx, ny)) continue;
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
    return getHubWalkableFlood(room).set;
}

/** True if (x,y) is walkable-from-hub or cardinally adjacent to that set. */
function touchesHubWalkable(hubWalkable, x, y) {
    const key = xyKey(x, y);
    if (hubWalkable.has(key)) return true;
    for (let i = 0; i < 4; i++) {
        if (hubWalkable.has(xyKey(x + CARDINALS[i][0], y + CARDINALS[i][1]))) return true;
    }
    return false;
}

function minPathDistNear(distMap, x, y) {
    let best = Infinity;
    const self = distMap[xyKey(x, y)];
    if (self != null) best = self;
    for (let i = 0; i < 8; i++) {
        const d = distMap[xyKey(x + OCTALS[i][0], y + OCTALS[i][1])];
        if (d != null && d < best) best = d;
    }
    return best;
}

function addSeed(seeds, seen, x, y) {
    if (x < 0 || x > 49 || y < 0 || y > 49) return;
    const key = xyKey(x, y);
    if (seen.has(key)) return;
    seen.add(key);
    seeds.push({x, y});
}

/**
 * Tiles the seal must enclose. Includes built, sites, and planned positions
 * so recomputing cannot ignore work already placed or queued.
 */
function collectProtectSeeds(room, layout) {
    const seeds = [];
    const seen = new Set();
    const hub = room.hub;
    if (!hub) return seeds;
    addSeed(seeds, seen, hub.x, hub.y);

    const tmpl = layout || (room.memory.dynamicLayout ? coreTemplate : bunkerTemplate);
    if (tmpl) {
        for (let i = 0; i < tmpl.length; i++) {
            const structure = tmpl[i];
            if (!structure || structure.structureType === STRUCTURE_ROAD) continue;
            const pos = structure.pos || [];
            for (let j = 0; j < pos.length; j++) {
                addSeed(seeds, seen, hub.x + pos[j].x, hub.y + pos[j].y);
            }
        }
    }

    const labHub = resolveLabHubXY(room);
    if (labHub && labTemplate) {
        for (let i = 0; i < labTemplate.length; i++) {
            addSeed(seeds, seen, labHub.x + labTemplate[i].x, labHub.y + labTemplate[i].y);
        }
    }

    const towers = resolveTowerHubList(room);
    for (let i = 0; i < towers.length; i++) {
        addSeed(seeds, seen, towers[i].x, towers[i].y);
    }

    const structs = room.structures || [];
    for (let i = 0; i < structs.length; i++) {
        const s = structs[i];
        if (!s || !s.pos || !isPrimaryHubType(s.structureType)) continue;
        if (s.structureType === STRUCTURE_LINK && chebyDistance(s.pos.x, s.pos.y, hub.x, hub.y) > 4) continue;
        addSeed(seeds, seen, s.pos.x, s.pos.y);
    }

    const sites = room.constructionSites || [];
    for (let i = 0; i < sites.length; i++) {
        const s = sites[i];
        if (!s || !s.pos || !isPrimaryHubType(s.structureType)) continue;
        if (s.structureType === STRUCTURE_LINK && chebyDistance(s.pos.x, s.pos.y, hub.x, hub.y) > 4) continue;
        addSeed(seeds, seen, s.pos.x, s.pos.y);
    }

    return seeds;
}

function filterValidSeeds(room, seeds, flood) {
    const hub = room.hub;
    const valid = [];
    if (!hub) return valid;
    for (let i = 0; i < seeds.length; i++) {
        const s = seeds[i];
        const cheby = chebyDistance(s.x, s.y, hub.x, hub.y);
        if (cheby > PERIMETER_MAX_CHEBY) continue;
        const pathD = minPathDistNear(flood.dist, s.x, s.y);
        // Unreachable, too far, or only reachable by wrapping around a wall.
        if (pathD === Infinity || pathD > PERIMETER_MAX_PATH) continue;
        if (pathD > cheby + PERIMETER_MAX_WRAP) continue;
        valid.push(s);
    }
    return valid;
}

/**
 * Walkable tiles that can reach a room edge without stepping on interior.
 * Used so the contour only sits on the exit-facing frontier — not the back
 * wall of a dead-end pocket that only leads back through the hub.
 */
function floodExteriorFromExits(terrain, interior) {
    const exterior = new Set();
    const q = [];
    const seed = (x, y) => {
        const k = xyKey(x, y);
        if (interior.has(k) || exterior.has(k)) return;
        if (isTerrainWall(terrain, x, y)) return;
        exterior.add(k);
        q.push(x, y);
    };
    for (let i = 0; i < 50; i++) {
        seed(i, 0);
        seed(i, 49);
        seed(0, i);
        seed(49, i);
    }
    let qi = 0;
    while (qi < q.length) {
        const x = q[qi++];
        const y = q[qi++];
        for (let i = 0; i < 8; i++) {
            const nx = x + OCTALS[i][0];
            const ny = y + OCTALS[i][1];
            if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
            const k = xyKey(nx, ny);
            if (exterior.has(k) || interior.has(k)) continue;
            if (isTerrainWall(terrain, nx, ny)) continue;
            exterior.add(k);
            q.push(nx, ny);
        }
    }
    return exterior;
}

function touchesInterior(interior, x, y) {
    for (let i = 0; i < 8; i++) {
        if (interior.has(xyKey(x + OCTALS[i][0], y + OCTALS[i][1]))) return true;
    }
    return false;
}

function isValidContourTile(x, y, interior, terrain, exterior) {
    if (x < PERIMETER_EDGE || x > 49 - PERIMETER_EDGE || y < PERIMETER_EDGE || y > 49 - PERIMETER_EDGE) {
        return false;
    }
    const k = xyKey(x, y);
    if (interior.has(k)) return false;
    if (isTerrainWall(terrain, x, y)) return false;
    if (exterior && !exterior.has(k)) return false;
    return touchesInterior(interior, x, y);
}

function computeContourSpots(interior, terrain, exterior) {
    if (!exterior) exterior = floodExteriorFromExits(terrain, interior);
    const spots = [];
    const seen = new Set();
    const edgeMax = 49 - PERIMETER_EDGE;
    for (const key of interior) {
        const comma = key.indexOf(',');
        const x = Number(key.slice(0, comma));
        const y = Number(key.slice(comma + 1));
        for (let i = 0; i < 8; i++) {
            const nx = x + OCTALS[i][0];
            const ny = y + OCTALS[i][1];
            if (nx < PERIMETER_EDGE || nx > edgeMax || ny < PERIMETER_EDGE || ny > edgeMax) continue;
            const nkey = xyKey(nx, ny);
            if (interior.has(nkey) || seen.has(nkey)) continue;
            if (isTerrainWall(terrain, nx, ny)) continue;
            // Enclosed pocket: reachable from hub-side only. Not a real hole.
            if (!exterior.has(nkey)) continue;
            seen.add(nkey);
            spots.push({x: nx, y: ny});
        }
    }
    return spots;
}

/** Built + site barrier tiles. Plan cache is cleared before recompute, so world is the snap source. */
function collectExistingBarrierKeys(room) {
    const set = new Set();
    const barriers = room.barriers || [];
    for (let i = 0; i < barriers.length; i++) {
        const b = barriers[i];
        if (b && b.pos) set.add(xyKey(b.pos.x, b.pos.y));
    }
    if (!set.size) {
        const ramparts = room.ramparts || [];
        for (let i = 0; i < ramparts.length; i++) {
            if (ramparts[i] && ramparts[i].pos) set.add(xyKey(ramparts[i].pos.x, ramparts[i].pos.y));
        }
        const walls = room.constructedWalls || [];
        for (let i = 0; i < walls.length; i++) {
            if (walls[i] && walls[i].pos) set.add(xyKey(walls[i].pos.x, walls[i].pos.y));
        }
    }
    const sites = room.constructionSites || [];
    for (let i = 0; i < sites.length; i++) {
        const s = sites[i];
        if (!s || !s.pos) continue;
        if (s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL) continue;
        set.add(xyKey(s.pos.x, s.pos.y));
    }
    return set;
}

/**
 * If the ideal contour shifted one tile, keep an existing exit-facing barrier
 * instead of abandoning a built/site tile and opening a hole.
 */
function snapSpotsToExisting(room, spots, interior, terrain, exterior) {
    if (!spots || !spots.length) return spots || [];
    const existing = collectExistingBarrierKeys(room);
    if (!existing.size) return spots;

    const snapped = [];
    const used = new Set();
    for (let i = 0; i < spots.length; i++) {
        const p = spots[i];
        const k = xyKey(p.x, p.y);
        if (existing.has(k)) {
            if (!used.has(k)) {
                used.add(k);
                snapped.push(p);
            }
            continue;
        }
        let replacement = null;
        for (let j = 0; j < 8; j++) {
            const nx = p.x + OCTALS[j][0];
            const ny = p.y + OCTALS[j][1];
            const nk = xyKey(nx, ny);
            if (!existing.has(nk) || used.has(nk)) continue;
            if (!isValidContourTile(nx, ny, interior, terrain, exterior)) continue;
            replacement = {x: nx, y: ny};
            break;
        }
        if (replacement) {
            const rk = xyKey(replacement.x, replacement.y);
            used.add(rk);
            snapped.push(replacement);
        } else if (!used.has(k)) {
            used.add(k);
            snapped.push(p);
        }
    }
    return snapped;
}

/**
 * Interior must stay inside [3,46] so the exit-facing contour can sit on
 * buildable tiles at 2/47. Plan filter rejects x/y <= 1 and >= 49; placing
 * on 0/1/48/49 is invalid, so an interior that reaches the strip leaves a gap.
 */
function perimeterInteriorInset() {
    return PERIMETER_EDGE + 1;
}

/**
 * Interior = hub-walkable tiles inside the padded bounding box of protect seeds.
 * Grows only as far as the seeds, not a full radius ball in empty directions.
 */
function computeSeedWrapInterior(hub, valid, flood, pad) {
    const interior = new Set();
    let x1 = hub.x;
    let y1 = hub.y;
    let x2 = hub.x;
    let y2 = hub.y;
    const pts = valid && valid.length ? valid : [{x: hub.x, y: hub.y}];
    for (let i = 0; i < pts.length; i++) {
        const s = pts[i];
        if (s.x < x1) x1 = s.x;
        if (s.y < y1) y1 = s.y;
        if (s.x > x2) x2 = s.x;
        if (s.y > y2) y2 = s.y;
    }
    const inset = perimeterInteriorInset();
    x1 = Math.max(inset, x1 - pad);
    y1 = Math.max(inset, y1 - pad);
    x2 = Math.min(49 - inset, x2 + pad);
    y2 = Math.min(49 - inset, y2 + pad);
    if (x1 > x2) {
        x1 = inset;
        x2 = 49 - inset;
    }
    if (y1 > y2) {
        y1 = inset;
        y2 = 49 - inset;
    }

    for (const key of flood.set) {
        const comma = key.indexOf(',');
        const x = Number(key.slice(0, comma));
        const y = Number(key.slice(comma + 1));
        if (x >= x1 && x <= x2 && y >= y1 && y <= y2) interior.add(key);
    }
    interior.add(xyKey(hub.x, hub.y));
    stripEdgeInterior(interior, inset, xyKey(hub.x, hub.y));
    return {
        interior,
        bounds: {x1, y1, x2, y2},
        radius: Math.max(x2 - x1, y2 - y1),
    };
}

function stripEdgeInterior(interior, inset, keepKey) {
    const drop = [];
    for (const key of interior) {
        if (key === keepKey) continue;
        const comma = key.indexOf(',');
        const x = Number(key.slice(0, comma));
        const y = Number(key.slice(comma + 1));
        if (structureDistToEdge(x, y) < inset) drop.push(key);
    }
    for (let i = 0; i < drop.length; i++) interior.delete(drop[i]);
}

/**
 * Hub floodfill → seed-box interior (terrain-clipped) → exit-facing contour → snap.
 */
function computeFloodfillPerimeter(room, layout) {
    const hub = room.hub;
    const empty = {spots: [], interior: new Set(), radius: 0, seeds: 0, validSeeds: 0, bounds: null};
    if (!hub) return empty;

    const terrain = Game.map.getRoomTerrain(room.name);
    const flood = getHubWalkableFlood(room, PERIMETER_MAX_PATH + PERIMETER_PAD + 2);
    const seeds = collectProtectSeeds(room, layout);
    const valid = filterValidSeeds(room, seeds, flood);
    const wrap = computeSeedWrapInterior(hub, valid, flood, PERIMETER_PAD);
    const interior = wrap.interior;
    const exterior = floodExteriorFromExits(terrain, interior);

    let spots = computeContourSpots(interior, terrain, exterior);
    spots = snapSpotsToExisting(room, spots, interior, terrain, exterior);
    spots = filterPerimeterBarrierSpots(room, spots);

    return {
        spots,
        interior,
        radius: wrap.radius,
        bounds: wrap.bounds,
        seeds: seeds.length,
        validSeeds: valid.length,
    };
}

function structureDistToEdge(x, y) {
    return Math.min(x, y, 49 - x, 49 - y);
}

function isBorderMinCutStructure(x, y) {
    return structureDistToEdge(x, y) <= PERIMETER_BUILD_INSET;
}

function getBorderRampartTiles(room, layout) {
    const tiles = [];
    const seen = new Set();
    const add = (x, y) => {
        if (!isBorderMinCutStructure(x, y)) return;
        const key = xyKey(x, y);
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
    for (const {x, y} of resolveTowerHubList(room)) add(x, y);

    return tiles;
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
        const path = from.findPathTo(hub, {ignoreCreeps: true, maxOps: 500, maxRooms: 1});
        for (const step of path) keys.add(xyKey(step.x, step.y));
    };
    const addTowerPath = (from) => {
        for (const step of getTowerCorridorPathSteps(from, hub)) {
            keys.add(xyKey(step.x, step.y));
        }
    };
    for (const tower of room.towers) addTowerPath(tower.pos);
    for (const {x, y} of resolveTowerHubList(room)) {
        addTowerPath(new RoomPosition(x, y, room.name));
    }
    for (const source of room.sources) {
        const container = source.memory && source.memory.container
            ? Game.getObjectById(source.memory.container)
            : null;
        if (!container) continue;
        addFullPath(container.pos);
        if (source.memory.accessReserved) {
            keys.add(xyKey(source.memory.accessReserved.x, source.memory.accessReserved.y));
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
        if (b && b.pos) set.add(xyKey(b.pos.x, b.pos.y));
    }
    if (!set.size) {
        const ramparts = room.ramparts || [];
        for (let i = 0; i < ramparts.length; i++) {
            const r = ramparts[i];
            if (r && r.pos) set.add(xyKey(r.pos.x, r.pos.y));
        }
        const walls = room.constructedWalls || [];
        for (let i = 0; i < walls.length; i++) {
            const w = walls[i];
            if (w && w.pos) set.add(xyKey(w.pos.x, w.pos.y));
        }
    }
    room._barrierKeySet = set;
    room._barrierKeySetTick = Game.time;
    return set;
}

function perimeterHasMissingBuilt(room) {
    const spots = getPerimeterSpots(room.name);
    if (!spots.length) return false;
    const built = getBuiltBarrierKeySet(room);
    for (let i = 0; i < spots.length; i++) {
        const p = spots[i];
        if (!built.has(xyKey(p.x, p.y))) return true;
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

function isRemovableStrayBarrier(pos, room, perimeterSpotSet) {
    if (perimeterSpotSet.has(`${pos.x},${pos.y}`)) return false;
    if (hasBarrierUnderlay(pos)) return false;
    if (isOnSourcePad(pos, room)) return false;
    if (room.controller && pos.isNearTo(room.controller)) return false;
    if (room.mineral && pos.isNearTo(room.mineral)) return false;
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

function buildOrphanContext(room, newSpotSet) {
    const hub = room.hub || null;
    const planHubDist = Object.create(null);
    const nearPlan = new Set();
    let maxPlan = 0;
    for (const key of newSpotSet) {
        const comma = key.indexOf(',');
        const nx = Number(key.slice(0, comma));
        const ny = Number(key.slice(comma + 1));
        const hd = hub ? chebyDistance(nx, ny, hub.x, hub.y) : 0;
        planHubDist[key] = hd;
        if (hd > maxPlan) maxPlan = hd;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                nearPlan.add(xyKey(nx + dx, ny + dy));
            }
        }
    }
    return {
        newSpotSet,
        nearPlan,
        planHubDist,
        maxPlan,
        hub,
        hubWalkable: hub ? getHubWalkableSet(room) : null,
    };
}

function isOrphanedUncachedBarrier(pos, room, newSpotSet, ctx) {
    const key = xyKey(pos.x, pos.y);
    if (newSpotSet.has(key)) return false;
    if (isOnSourcePad(pos, room)) return false;
    if (hasBarrierUnderlay(pos)) return false;
    if (room.controller && pos.isNearTo(room.controller)) return false;
    if (room.mineral && pos.isNearTo(room.mineral)) return false;

    const edgeClear = Math.max(PERIMETER_ORPHAN_EXIT_CLEARANCE, PERIMETER_BUILD_INSET + 2);
    if (structureDistToEdge(pos.x, pos.y) <= edgeClear) return true;

    const hub = (ctx && ctx.hub) || room.hub;
    const nearPlan = ctx
        ? ctx.nearPlan.has(key)
        : isNearNewPerimeterSpot(pos, newSpotSet);

    if (hub && pos.getRangeTo(hub) > 4 && nearPlan) {
        let nearestPlan = Infinity;
        if (ctx && ctx.planHubDist) {
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const pk = xyKey(pos.x + dx, pos.y + dy);
                    if (!newSpotSet.has(pk)) continue;
                    const d = ctx.planHubDist[pk];
                    if (d < nearestPlan) nearestPlan = d;
                }
            }
        } else {
            for (const pKey of newSpotSet) {
                const comma = pKey.indexOf(',');
                const nx = Number(pKey.slice(0, comma));
                const ny = Number(pKey.slice(comma + 1));
                const d = Math.max(Math.abs(pos.x - nx), Math.abs(pos.y - ny));
                if (d <= 1) {
                    const planHub = chebyDistance(nx, ny, hub.x, hub.y);
                    if (planHub < nearestPlan) nearestPlan = planHub;
                }
            }
        }
        if (nearestPlan < Infinity && chebyDistance(pos.x, pos.y, hub.x, hub.y) > nearestPlan) {
            return true;
        }
        return true;
    }

    if (hub) {
        const hubWalkable = (ctx && ctx.hubWalkable) || getHubWalkableSet(room);
        if (!touchesHubWalkable(hubWalkable, pos.x, pos.y)) return true;
        let maxPlan = ctx ? ctx.maxPlan : 0;
        if (!ctx) {
            for (const pKey of newSpotSet) {
                const comma = pKey.indexOf(',');
                const nx = Number(pKey.slice(0, comma));
                const ny = Number(pKey.slice(comma + 1));
                maxPlan = Math.max(maxPlan, chebyDistance(nx, ny, hub.x, hub.y));
            }
        }
        if (maxPlan > 0 && chebyDistance(pos.x, pos.y, hub.x, hub.y) > maxPlan + PERIMETER_SPOT_HUB_MARGIN) {
            return true;
        }
    }
    return false;
}

/** Bounding box of the flooded interior — audit/compat only, not a min-cut input. */
function getProtectedAreaBounds(layout, room) {
    if (!room.hub) return [];
    const result = computeFloodfillPerimeter(room, layout);
    let x1 = 49;
    let y1 = 49;
    let x2 = 0;
    let y2 = 0;
    let any = false;
    for (const key of result.interior) {
        const comma = key.indexOf(',');
        const x = Number(key.slice(0, comma));
        const y = Number(key.slice(comma + 1));
        if (x < x1) x1 = x;
        if (y < y1) y1 = y;
        if (x > x2) x2 = x;
        if (y > y2) y2 = y;
        any = true;
    }
    return any ? [{x1, y1, x2, y2}] : [];
}

function shouldComputeBunkerRampartSpots(room) {
    return !!(room.controller && room.controller.level >= BUNKER_LEVEL && room.hub);
}

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
    const computed = room.hub ? computeFloodfillPerimeter(room, tmpl) : null;
    return {
        roomName: room.name,
        controllerLevel: room.controller && room.controller.level,
        roomLevel: room.level,
        energyCapacity: room.energyCapacityAvailable,
        bunkerLevelRequired: BUNKER_LEVEL,
        hasHub: !!room.hub,
        bunkerHub: room.memory.bunkerHub,
        canCompute: shouldComputeBunkerRampartSpots(room),
        algorithm: 'hub-floodfill-wrap',
        seeds: computed ? computed.seeds : 0,
        validSeeds: computed ? computed.validSeeds : 0,
        radius: computed ? computed.radius : 0,
        bounds: computed ? computed.bounds : null,
        interior: computed ? computed.interior.size : 0,
        computedSpots: computed ? computed.spots.length : 0,
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
    try {
        const result = computeFloodfillPerimeter(room, tmpl);
        const spots = result.spots;
        if (!spots.length) {
            log.w(`${room.name} rampart flood produced 0 spots (seeds=${result.seeds} valid=${result.validSeeds} r=${result.radius} interior=${result.interior.size}); will retry`);
            ROOM_RAMPART_SPOTS[room.name] = undefined;
        } else {
            ROOM_RAMPART_SPOTS[room.name] = JSON.stringify(spots);
            if (Game.time % 100 === 0) {
                const b = result.bounds;
                const box = b ? `${b.x1},${b.y1}-${b.x2},${b.y2}` : '?';
                log.a(`${room.name} hub-flood seal: spots=${spots.length} seeds=${result.validSeeds}/${result.seeds} box=${box}`, 'PLANNER');
            }
        }
    } catch (e) {
        log.e('Floodfill perimeter error in room ' + room.name);
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
    const ctx = buildOrphanContext(room, newSpotSet);
    const orphans = [];

    for (const s of room.structures) {
        if (s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL) continue;
        if (!isOrphanedUncachedBarrier(s.pos, room, newSpotSet, ctx)) continue;
        orphans.push({x: s.pos.x, y: s.pos.y, kind: 'built', type: s.structureType});
    }
    for (const site of room.constructionSites) {
        if (site.structureType !== STRUCTURE_RAMPART && site.structureType !== STRUCTURE_WALL) continue;
        if (!isOrphanedUncachedBarrier(site.pos, room, newSpotSet, ctx)) continue;
        orphans.push({x: site.pos.x, y: site.pos.y, kind: 'site', type: site.structureType});
    }
    return {count: orphans.length, orphans, perimeterSpots: newSpots.length};
}

function bunkerLevelAllowsPerimeter(room) {
    const rcl = room.controller && room.controller.level;
    if (rcl != null) return rcl >= BUNKER_LEVEL;
    return !!(room.level >= BUNKER_LEVEL);
}

function shouldBuildPerimeterTile(pos, room) {
    if (resolveTowerHubList(room).some(h => h.x === pos.x && h.y === pos.y)) {
        return 'towerHub';
    }
    if (pos.checkForWall()) return 'terrainWall';
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
 * Wall tiles that sit on roads, walk corridors, structures, or otherwise can't take a wall
 * get a rampart instead so the seal stays continuous.
 */
function choosePerimeterBarrierType(pos, corridors) {
    if (pos.checkForImpassible(true, true)) return STRUCTURE_RAMPART;
    if (pos.checkForConstructionSites()) return STRUCTURE_RAMPART;
    const isWallTile = ((pos.x + pos.y) & 1) === 0;
    if (!isWallTile) return STRUCTURE_RAMPART;
    if (pos.checkForRoad()) return STRUCTURE_RAMPART;
    if (corridors && corridors.has(pos.x + ',' + pos.y)) return STRUCTURE_RAMPART;
    if (!canPlaceConstructedWall(pos)) return STRUCTURE_RAMPART;
    return STRUCTURE_WALL;
}

function diagnosePerimeter(room, options = {}) {
    const draw = options.draw !== false;
    const hub = room.hub;
    const rawCache = ROOM_RAMPART_SPOTS && ROOM_RAMPART_SPOTS[room.name];
    let rawSpots = getPerimeterSpots(room.name);

    if ((!rawSpots.length || options.recompute) && hub && shouldComputeBunkerRampartSpots(room)) {
        const tmpl = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
        initializeRampartSpots(room, tmpl, false);
        rawSpots = getPerimeterSpots(room.name);
    }

    const spots = rawSpots.length
        ? filterPerimeterBarrierSpots(room, rawSpots.slice())
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
            + 'Check hasHub / canCompute / floodfill logs.';
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

    if (hub) {
        const terrain = Game.map.getRoomTerrain(room.name);
        const blocked = new Set(spotSet);
        for (const s of room.structures) {
            if (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) {
                blocked.add(`${s.pos.x},${s.pos.y}`);
            } else if (OBSTACLE_OBJECT_TYPES.includes(s.structureType)) {
                blocked.add(`${s.pos.x},${s.pos.y}`);
            }
        }

        const walkable = (x, y) => {
            if (x < 0 || x > 49 || y < 0 || y > 49) return false;
            if (terrain.get(x, y) & TERRAIN_MASK_WALL) return false;
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
            for (const [dx, dy] of CARDINALS) {
                const nx = cur.x + dx;
                const ny = cur.y + dy;
                const key = `${nx},${ny}`;
                if (seen.has(key) || !walkable(nx, ny)) continue;
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
            summary.leakPath = path.reverse().slice(0, 40);
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

function debugBarriers(room, options = {}) {
    let placeResult;
    if (options.place) {
        placeResult = require('planRamparts').ensurePerimeterSites(room, {
            maxPlace: options.maxPlace != null ? options.maxPlace : 5,
            bridge: false,
            allowInit: false,
            recordStatus: true,
        });
    }

    let d = diagnosePerimeter(room, options);

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

    return {
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
}

module.exports = {
    PERIMETER_PLAN_REV,
    hasPerimeterSpots,
    getPerimeterSpots,
    perimeterHasMissingBuilt,
    bunkerLevelAllowsPerimeter,
    shouldComputeBunkerRampartSpots,
    getBuiltBarrierKeySet,
    invalidateRampartSpots,
    initializeRampartSpots,
    computeFloodfillPerimeter,
    auditOrphanBarriers,
    auditStrayBarriers,
    auditRampartRecalc,
    previewRampartCleanup,
    diagnosePerimeter,
    debugBarriers,
    isRemovableStrayBarrier,
    buildOrphanContext,
    isOrphanedUncachedBarrier,
    hasBarrierUnderlay,
    isOnSourcePad,
    getBorderRampartTiles,
    shouldBuildPerimeterTile,
    choosePerimeterBarrierType,
    getRampartWalkCorridors,
    getProtectedAreaBounds,
    resolveTowerHubList,
    resolveLabHubXY,
};
