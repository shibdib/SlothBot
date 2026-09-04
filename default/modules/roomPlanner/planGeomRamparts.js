/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Rampart / perimeter GEOMETRY library.
 *
 * Perimeter is the whole-room min-cut of hub protect tiles (stamp, labs,
 * nearby towers/extensions) to the exits. Terrain walls are free; the seal
 * sits at chokes instead of boxing the hub. Floodfill contour is fallback
 * if min-cut fails. Placement stays in planRamparts.
 *
 * RCL5–7 seal: checkerboard wall/rampart.
 * RCL8 fighting layer (not stored in ROOM_RAMPART_SPOTS):
 *  - seal tiles are all rampart so defenders can walk the line
 *  - inner walkway ramparts on interior tiles 8-adjacent to the contour
 *  - constructed walls live on outer quad-trap teeth; combat faces get full HP
 *
 * Protect targets: hub + primary hub structures + towers, and (dynamic rooms)
 * planned/built extension tiles. Includes built, sites, and planned
 * stamps/anchors so a recompute does not shrink past work already in progress.
 */

const {extensionPositionCache, quadTraps, walkwayCache} = require('planState');

const {bunkerTemplate, coreTemplate, labTemplate} = require('planTemplates');
const mincut = require('util.minCut');

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
const QUAD_TRAP_TRIPWIRE_HITS = 20000;

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
 * Bump when the perimeter algorithm changes so owned rooms replan.
 */
const PERIMETER_PLAN_REV = 12;

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
    if (walkwayCache) walkwayCache[room.name] = undefined;
}

/**
 * 8-connected flood from origin through non-terrain-wall tiles.
 * Drops mountain-wrap: on open ground 8-connected steps == cheby, so extra
 * length means the path went around a wall. Those tiles are not "reachable
 * from the hub" for seal / builder purposes.
 */
function floodWalkableFrom(terrain, origin, maxDist) {
    const cap = maxDist != null ? maxDist : PERIMETER_MAX_PATH + PERIMETER_PAD + 2;
    const set = new Set();
    const dist = Object.create(null);
    if (!origin || origin.x == null || origin.y == null || !terrain) return {set, dist};
    const ox = origin.x;
    const oy = origin.y;
    const q = [ox, oy];
    const originKey = xyKey(ox, oy);
    set.add(originKey);
    dist[originKey] = 0;
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
            const nd = d + 1;
            if (nd > chebyDistance(nx, ny, ox, oy) + PERIMETER_MAX_WRAP) continue;
            set.add(key);
            dist[key] = nd;
            q.push(nx, ny);
        }
    }
    return {set, dist};
}

function getHubWalkableFlood(room, maxDist) {
    const cap = maxDist != null ? maxDist : PERIMETER_MAX_PATH + PERIMETER_PAD + 2;
    const cacheKey = '_hubWalk8nw_' + cap;
    if (room._hubWalkTick === Game.time && room[cacheKey]) return room[cacheKey];
    const hub = room.hub;
    if (!hub) {
        const empty = {set: new Set(), dist: Object.create(null)};
        room[cacheKey] = empty;
        room._hubWalkTick = Game.time;
        return empty;
    }
    const result = floodWalkableFrom(Game.map.getRoomTerrain(room.name), hub, cap);
    room[cacheKey] = result;
    room._hubWalkTick = Game.time;
    return result;
}

/** Cheby radius of non-road stamp tiles. Bunker is 5, compact core is 1. */
function templateStampRadius(template) {
    let r = 0;
    if (!template) return 4;
    for (let i = 0; i < template.length; i++) {
        const structure = template[i];
        if (!structure || structure.structureType === STRUCTURE_ROAD) continue;
        const pos = structure.pos || [];
        for (let j = 0; j < pos.length; j++) {
            const cr = chebyDistance(0, 0, pos[j].x, pos[j].y);
            if (cr > r) r = cr;
        }
    }
    return r || 4;
}

/**
 * How many of the 8 octants can walk from the hub to a room edge without
 * hitting terrain. Dead-end pockets have 1–3; open field has 8.
 */
function countOpenExitSectors(terrain, hx, hy) {
    let open = 0;
    for (let i = 0; i < 8; i++) {
        let x = hx;
        let y = hy;
        let hitEdge = false;
        const dx = OCTALS[i][0];
        const dy = OCTALS[i][1];
        for (let step = 0; step < 48; step++) {
            x += dx;
            y += dy;
            if (x <= 0 || x >= 49 || y <= 0 || y >= 49) {
                hitEdge = true;
                break;
            }
            if (isTerrainWall(terrain, x, y)) break;
        }
        if (hitEdge) open++;
    }
    return open;
}

/**
 * Walkable tiles on the cheby ring just outside a stamp. Cheap dead-end
 * proxy: a pocket backed by terrain has many ring tiles as walls.
 */
function countOpenStampRing(terrain, hx, hy, radius) {
    const r = (radius || 4) + 1;
    let open = 0;
    for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const x = hx + dx;
            const y = hy + dy;
            if (x < PERIMETER_EDGE || x > 49 - PERIMETER_EDGE
                || y < PERIMETER_EDGE || y > 49 - PERIMETER_EDGE) {
                open++;
                continue;
            }
            if (!isTerrainWall(terrain, x, y)) open++;
        }
    }
    return open;
}

function collectTemplateSeeds(hub, template) {
    const seeds = [];
    const seen = new Set();
    if (!hub) return seeds;
    addSeed(seeds, seen, hub.x, hub.y);
    if (!template) return seeds;
    for (let i = 0; i < template.length; i++) {
        const structure = template[i];
        if (!structure || structure.structureType === STRUCTURE_ROAD) continue;
        const pos = structure.pos || [];
        for (let j = 0; j < pos.length; j++) {
            addSeed(seeds, seen, hub.x + pos[j].x, hub.y + pos[j].y);
        }
    }
    return seeds;
}

function filterSeedsWithFlood(hub, seeds, flood) {
    const valid = [];
    if (!hub) return valid;
    for (let i = 0; i < seeds.length; i++) {
        const s = seeds[i];
        const cheby = chebyDistance(s.x, s.y, hub.x, hub.y);
        if (cheby > PERIMETER_MAX_CHEBY) continue;
        const pathD = minPathDistNear(flood.dist, s.x, s.y);
        if (pathD === Infinity || pathD > PERIMETER_MAX_PATH) continue;
        if (pathD > cheby + PERIMETER_MAX_WRAP) continue;
        valid.push(s);
    }
    return valid;
}

function filterHubReachableSpots(spots, flood) {
    if (!spots || !spots.length) return spots || [];
    if (!flood || !flood.set) return [];
    const out = [];
    for (let i = 0; i < spots.length; i++) {
        const p = spots[i];
        if (touchesHubWalkable(flood.set, p.x, p.y)) out.push(p);
    }
    return out;
}

/**
 * How many min-cut tiles a hub+stamp would need. Dead-end / one-exit
 * rooms score a choke; open field scores a larger ring.
 */
function estimateHubSealCost(room, hubXY, template) {
    if (!room || !hubXY) return Infinity;
    const seeds = collectTemplateSeeds(hubXY, template);
    const spots = computeMinCutSpots(room.name, seeds.length ? seeds : [hubXY]);
    if (!spots) return Infinity;
    return spots.length;
}

function getHubWalkableSet(room) {
    return getHubWalkableFlood(room).set;
}

/** True if (x,y) is walkable-from-hub or cardinally adjacent to that set. */
function touchesHubWalkable(hubWalkable, x, y) {
    if (!hubWalkable) return false;
    const key = xyKey(x, y);
    if (hubWalkable.has(key)) return true;
    for (let i = 0; i < 4; i++) {
        if (hubWalkable.has(xyKey(x + CARDINALS[i][0], y + CARDINALS[i][1]))) return true;
    }
    return false;
}

function isHubReachableTile(room, x, y) {
    if (!room || !room.hub) return false;
    return touchesHubWalkable(getHubWalkableSet(room), x, y);
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

function unpackPackedXY(packed) {
    if (!packed || !packed.length) return [];
    const tiles = [];
    for (let i = 0; i < packed.length; i++) {
        const n = packed[i];
        tiles.push({x: n % 50, y: Math.floor(n / 50)});
    }
    return tiles;
}

/**
 * Planned dynamic-extension tiles (packed plan, unfiltered).
 * getExtensionPositions drops occupied tiles, so the packed layer is the
 * authority for "where extensions belong" — including already-built ones.
 */
function getDynamicExtensionProtectTiles(room) {
    if (!room || !room.memory || !room.memory.dynamicLayout) return [];
    if (room._dynExtProtectTick === Game.time && room._dynExtProtectTiles) {
        return room._dynExtProtectTiles;
    }
    let tiles = [];
    try {
        const packed = require('planDoc').getLayerPacked(room, 'extensions');
        if (packed && packed.length) tiles = unpackPackedXY(packed);
    } catch (e) { /* ignore */
    }
    if (!tiles.length) {
        const cached = extensionPositionCache[room.name];
        if (cached && cached.length) tiles = cached;
    }
    if (!tiles.length) {
        try {
            tiles = require('planGeomExtensions').getExtensionPositions(room) || [];
        } catch (e) {
            tiles = [];
        }
    }
    room._dynExtProtectTiles = tiles;
    room._dynExtProtectTick = Game.time;
    return tiles;
}

function getDynamicExtensionKeySet(room) {
    if (!room || !room.memory || !room.memory.dynamicLayout) return null;
    if (room._dynExtKeySetTick === Game.time && room._dynExtKeySet) return room._dynExtKeySet;
    const set = new Set();
    const tiles = getDynamicExtensionProtectTiles(room);
    for (let i = 0; i < tiles.length; i++) set.add(xyKey(tiles[i].x, tiles[i].y));
    const exts = room.extensions || [];
    for (let i = 0; i < exts.length; i++) {
        const e = exts[i];
        if (e && e.pos) set.add(xyKey(e.pos.x, e.pos.y));
    }
    room._dynExtKeySet = set;
    room._dynExtKeySetTick = Game.time;
    return set;
}

function addDynamicExtensionSeeds(room, seeds, seen) {
    if (!room.memory || !room.memory.dynamicLayout) return;
    const planned = getDynamicExtensionProtectTiles(room);
    for (let i = 0; i < planned.length; i++) {
        addSeed(seeds, seen, planned[i].x, planned[i].y);
    }
    const exts = room.extensions || [];
    for (let i = 0; i < exts.length; i++) {
        const e = exts[i];
        if (e && e.pos) addSeed(seeds, seen, e.pos.x, e.pos.y);
    }
    const sites = room.constructionSites || [];
    for (let i = 0; i < sites.length; i++) {
        const s = sites[i];
        if (s && s.pos && s.structureType === STRUCTURE_EXTENSION) {
            addSeed(seeds, seen, s.pos.x, s.pos.y);
        }
    }
}

/**
 * Tiles the seal must enclose. Includes built, sites, and planned positions
 * so recomputing cannot ignore work already placed or queued.
 * Dynamic rooms have no extension stamps on coreTemplate — seed the packed
 * extension plan (and live extensions/sites) the way bunkerTemplate already
 * seeds its stamp.
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

    addDynamicExtensionSeeds(room, seeds, seen);

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
    return filterSeedsWithFlood(room.hub, seeds, flood);
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
 * Never drop a still-buildable contour tile — replacing P with neighbor N
 * punched 1-tile holes once any adjacent wall existed.
 */
function snapSpotsToExisting(room, spots, interior, terrain, exterior, hubWalkable) {
    if (!spots || !spots.length) return spots || [];
    const existing = collectExistingBarrierKeys(room);
    if (!existing.size) return spots;

    const reachable = (x, y) => !hubWalkable || touchesHubWalkable(hubWalkable, x, y);
    const snapped = [];
    const used = new Set();
    const push = (x, y) => {
        const k = xyKey(x, y);
        if (used.has(k)) return;
        used.add(k);
        snapped.push({x, y});
    };

    for (let i = 0; i < spots.length; i++) {
        const p = spots[i];
        // Keep P only when it is still a valid hub-reachable contour tile.
        // Existing off-contour barriers must not pin the plan to an old ring.
        if (isValidContourTile(p.x, p.y, interior, terrain, exterior) && reachable(p.x, p.y)) {
            push(p.x, p.y);
            continue;
        }
        // P is unbuildable — substitute an adjacent existing contour barrier if one exists.
        for (let j = 0; j < 8; j++) {
            const nx = p.x + OCTALS[j][0];
            const ny = p.y + OCTALS[j][1];
            if (!existing.has(xyKey(nx, ny))) continue;
            if (!isValidContourTile(nx, ny, interior, terrain, exterior)) continue;
            if (!reachable(nx, ny)) continue;
            push(nx, ny);
            break;
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

function computeMinCutSpots(roomName, protectTiles) {
    if (!roomName || !protectTiles || !protectTiles.length) return [];
    const tiles = [];
    const seen = new Set();
    for (let i = 0; i < protectTiles.length; i++) {
        const t = protectTiles[i];
        if (!t) continue;
        if (t.x < 2 || t.x > 47 || t.y < 2 || t.y > 47) continue;
        const k = xyKey(t.x, t.y);
        if (seen.has(k)) continue;
        seen.add(k);
        tiles.push({x: t.x, y: t.y});
    }
    if (!tiles.length) return [];
    let positions;
    try {
        positions = mincut.GetCutTilesFromTiles(roomName, tiles);
    } catch (e) {
        return null;
    }
    if (!positions) return null;
    const spots = [];
    const used = new Set();
    const edgeMax = 49 - PERIMETER_EDGE;
    for (let i = 0; i < positions.length; i++) {
        const p = positions[i];
        if (!p) continue;
        if (p.x < PERIMETER_EDGE || p.x > edgeMax || p.y < PERIMETER_EDGE || p.y > edgeMax) continue;
        const k = xyKey(p.x, p.y);
        if (used.has(k)) continue;
        used.add(k);
        spots.push({x: p.x, y: p.y});
    }
    return spots;
}

function floodInteriorFromHub(terrain, hub, cutSet) {
    const interior = new Set();
    if (!hub || !terrain) return interior;
    const hubKey = xyKey(hub.x, hub.y);
    if (cutSet && cutSet.has(hubKey)) {
        interior.add(hubKey);
        return interior;
    }
    interior.add(hubKey);
    const q = [hub.x, hub.y];
    let qi = 0;
    while (qi < q.length) {
        const x = q[qi++];
        const y = q[qi++];
        for (let i = 0; i < 8; i++) {
            const nx = x + OCTALS[i][0];
            const ny = y + OCTALS[i][1];
            if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
            const key = xyKey(nx, ny);
            if (interior.has(key) || (cutSet && cutSet.has(key))) continue;
            if (isTerrainWall(terrain, nx, ny)) continue;
            interior.add(key);
            q.push(nx, ny);
        }
    }
    return interior;
}

function findHubLeakPath(terrain, hub, spotSet) {
    if (!hub || !terrain) return null;
    const hubKey = xyKey(hub.x, hub.y);
    const seen = new Set([hubKey]);
    const q = [hub.x, hub.y];
    const parent = Object.create(null);
    let qi = 0;
    let leakKey = null;
    while (qi < q.length && !leakKey) {
        const x = q[qi++];
        const y = q[qi++];
        if (x === 0 || y === 0 || x === 49 || y === 49) {
            leakKey = xyKey(x, y);
            break;
        }
        for (let i = 0; i < 8; i++) {
            const nx = x + OCTALS[i][0];
            const ny = y + OCTALS[i][1];
            if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
            const key = xyKey(nx, ny);
            if (seen.has(key) || (spotSet && spotSet.has(key))) continue;
            if (isTerrainWall(terrain, nx, ny)) continue;
            seen.add(key);
            parent[key] = xyKey(x, y);
            if (nx === 0 || ny === 0 || nx === 49 || ny === 49) {
                leakKey = key;
                break;
            }
            q.push(nx, ny);
        }
    }
    if (!leakKey) return null;
    const path = [];
    let cur = leakKey;
    let guard = 0;
    while (cur && guard++ < 2500) {
        const comma = cur.indexOf(',');
        path.push({x: Number(cur.slice(0, comma)), y: Number(cur.slice(comma + 1))});
        if (cur === hubKey) break;
        cur = parent[cur];
    }
    return path;
}

function hubLeaksToExit(terrain, hub, spotSet) {
    return !!findHubLeakPath(terrain, hub, spotSet);
}

function plugHubLeaks(terrain, hub, spots, interior) {
    const out = spots ? spots.slice() : [];
    const spotSet = new Set();
    for (let i = 0; i < out.length; i++) spotSet.add(xyKey(out[i].x, out[i].y));
    for (let n = 0; n < 16; n++) {
        const path = findHubLeakPath(terrain, hub, spotSet);
        if (!path) return out;
        let added = false;
        for (let i = 0; i < path.length; i++) {
            const t = path[i];
            if (t.x < PERIMETER_EDGE || t.x > 49 - PERIMETER_EDGE
                || t.y < PERIMETER_EDGE || t.y > 49 - PERIMETER_EDGE) continue;
            const k = xyKey(t.x, t.y);
            if (spotSet.has(k)) continue;
            if (interior && interior.has(k)) continue;
            if (isTerrainWall(terrain, t.x, t.y)) continue;
            spotSet.add(k);
            out.push({x: t.x, y: t.y});
            added = true;
            break;
        }
        if (!added) break;
    }
    return out;
}

function interiorBounds(interior, hub) {
    let x1 = hub ? hub.x : 49;
    let y1 = hub ? hub.y : 49;
    let x2 = hub ? hub.x : 0;
    let y2 = hub ? hub.y : 0;
    for (const key of interior) {
        const comma = key.indexOf(',');
        const x = Number(key.slice(0, comma));
        const y = Number(key.slice(comma + 1));
        if (x < x1) x1 = x;
        if (y < y1) y1 = y;
        if (x > x2) x2 = x;
        if (y > y2) y2 = y;
    }
    return {x1, y1, x2, y2};
}

function contourFallbackPerimeter(room, hub, valid, flood, terrain) {
    const wrap = computeSeedWrapInterior(hub, valid, flood, PERIMETER_PAD);
    const interior = wrap.interior;
    const exterior = floodExteriorFromExits(terrain, interior);
    let spots = computeContourSpots(interior, terrain, exterior);
    spots = filterHubReachableSpots(spots, flood);
    spots = snapSpotsToExisting(room, spots, interior, terrain, exterior, flood.set);
    spots = filterPerimeterBarrierSpots(room, spots);
    spots = filterHubReachableSpots(spots, flood);
    return {spots, interior, bounds: wrap.bounds, radius: wrap.radius, algorithm: 'hub-floodfill-nowrap'};
}

/**
 * Whole-room min-cut of protect seeds → hub-side interior → walkway.
 * Floodfill contour is fallback when min-cut fails or leaks.
 */
function computeFloodfillPerimeter(room, layout) {
    const hub = room.hub;
    const empty = {spots: [], interior: new Set(), radius: 0, seeds: 0, validSeeds: 0, bounds: null};
    if (!hub) return empty;

    const terrain = Game.map.getRoomTerrain(room.name);
    const flood = getHubWalkableFlood(room, PERIMETER_MAX_PATH + PERIMETER_PAD + 2);
    const seeds = collectProtectSeeds(room, layout);
    const valid = filterValidSeeds(room, seeds, flood);
    const protect = valid.length ? valid : [{x: hub.x, y: hub.y}];

    let spots = computeMinCutSpots(room.name, protect);
    let interior = new Set();
    let bounds = null;
    let radius = 0;
    let algorithm = 'mincut-tiles';

    if (spots && spots.length) {
        let cutSet = new Set();
        for (let i = 0; i < spots.length; i++) cutSet.add(xyKey(spots[i].x, spots[i].y));
        interior = floodInteriorFromHub(terrain, hub, cutSet);
        spots = spots.filter(p => touchesInterior(interior, p.x, p.y));
        spots = filterPerimeterBarrierSpots(room, spots);
        spots = plugHubLeaks(terrain, hub, spots, interior);
        cutSet = new Set();
        for (let i = 0; i < spots.length; i++) cutSet.add(xyKey(spots[i].x, spots[i].y));
        interior = floodInteriorFromHub(terrain, hub, cutSet);
        const exterior = floodExteriorFromExits(terrain, interior);
        spots = snapSpotsToExisting(room, spots, interior, terrain, exterior, null);
        spots = filterPerimeterBarrierSpots(room, spots);
        spots = plugHubLeaks(terrain, hub, spots, interior);
        const sealed = new Set();
        for (let i = 0; i < spots.length; i++) sealed.add(xyKey(spots[i].x, spots[i].y));
        if (spots.length && !hubLeaksToExit(terrain, hub, sealed)) {
            bounds = interiorBounds(interior, hub);
            radius = Math.max(bounds.x2 - bounds.x1, bounds.y2 - bounds.y1);
        } else if (spots.length) {
            // Keep the choke even if a diagonal leak remains — do not balloon into a hub box.
            bounds = interiorBounds(interior, hub);
            radius = Math.max(bounds.x2 - bounds.x1, bounds.y2 - bounds.y1);
            algorithm = 'mincut-tiles-plugged';
        } else {
            spots = null;
        }
    }

    if (spots && !spots.length && hubLeaksToExit(terrain, hub, new Set())) {
        spots = null;
    }
    if (!spots) {
        const fb = contourFallbackPerimeter(room, hub, valid, flood, terrain);
        spots = fb.spots;
        interior = fb.interior;
        bounds = fb.bounds;
        radius = fb.radius;
        algorithm = fb.algorithm;
    }

    const walkway = computeWalkwayTiles(interior, spots, terrain);
    return {
        spots,
        walkway,
        interior,
        radius,
        bounds,
        seeds: seeds.length,
        validSeeds: valid.length,
        algorithm,
    };
}

/**
 * First interior ring: walkable interior tiles 8-adjacent to the seal.
 * Stored separately from ROOM_RAMPART_SPOTS so isInBunker / leak BFS still
 * treat the contour as the only ring.
 */
function computeWalkwayTiles(interior, spots, terrain) {
    const walkway = [];
    if (!interior || !interior.size || !spots || !spots.length) return walkway;
    const seal = new Set();
    for (let i = 0; i < spots.length; i++) {
        seal.add(xyKey(spots[i].x, spots[i].y));
    }
    const seen = new Set();
    for (let i = 0; i < spots.length; i++) {
        const p = spots[i];
        for (let j = 0; j < 8; j++) {
            const nx = p.x + OCTALS[j][0];
            const ny = p.y + OCTALS[j][1];
            if (nx < PERIMETER_EDGE || nx > 49 - PERIMETER_EDGE || ny < PERIMETER_EDGE || ny > 49 - PERIMETER_EDGE) {
                continue;
            }
            const k = xyKey(nx, ny);
            if (seen.has(k) || seal.has(k)) continue;
            if (!interior.has(k)) continue;
            if (isTerrainWall(terrain, nx, ny)) continue;
            seen.add(k);
            walkway.push({x: nx, y: ny});
        }
    }
    return walkway;
}

function storeWalkwaySpots(roomName, spotsStr, walkway) {
    walkwayCache[roomName] = {
        spotsStr: spotsStr || '',
        spots: walkway && walkway.length ? walkway : [],
    };
}

function computeWalkwayFromSpots(room, spots) {
    const walkway = [];
    if (!room || !spots || !spots.length) return walkway;
    const hub = room.hub;
    const terrain = Game.map.getRoomTerrain(room.name);
    const seal = new Set();
    for (let i = 0; i < spots.length; i++) seal.add(xyKey(spots[i].x, spots[i].y));
    const seen = new Set();
    for (let i = 0; i < spots.length; i++) {
        const p = spots[i];
        for (let j = 0; j < 8; j++) {
            const nx = p.x + OCTALS[j][0];
            const ny = p.y + OCTALS[j][1];
            if (nx < PERIMETER_EDGE || nx > 49 - PERIMETER_EDGE || ny < PERIMETER_EDGE || ny > 49 - PERIMETER_EDGE) {
                continue;
            }
            const k = xyKey(nx, ny);
            if (seen.has(k) || seal.has(k)) continue;
            if (isTerrainWall(terrain, nx, ny)) continue;
            if (hub) {
                const sealCheby = chebyDistance(p.x, p.y, hub.x, hub.y);
                const tileCheby = chebyDistance(nx, ny, hub.x, hub.y);
                if (tileCheby > sealCheby) continue;
            }
            seen.add(k);
            walkway.push({x: nx, y: ny});
        }
    }
    return walkway;
}

function getWalkwaySpots(room) {
    if (!room || !room.name) return [];
    const spotsStr = (ROOM_RAMPART_SPOTS && ROOM_RAMPART_SPOTS[room.name]) || '';
    const cached = walkwayCache[room.name];
    if (cached && cached.spotsStr === spotsStr && cached.spots) return cached.spots;

    const spots = getPerimeterSpots(room.name);
    const walkway = spots.length ? computeWalkwayFromSpots(room, spots) : [];
    storeWalkwaySpots(room.name, spotsStr, walkway);
    return walkway;
}

function getWalkwayKeySet(room) {
    if (room._walkwayKeySetTick === Game.time && room._walkwayKeySet) return room._walkwayKeySet;
    const set = new Set();
    const spots = getWalkwaySpots(room);
    for (let i = 0; i < spots.length; i++) {
        const p = spots[i];
        if (p) set.add(xyKey(p.x, p.y));
    }
    room._walkwayKeySet = set;
    room._walkwayKeySetTick = Game.time;
    return set;
}

function isWalkwayTile(pos, room) {
    if (!pos || !room) return false;
    return getWalkwayKeySet(room).has(xyKey(pos.x, pos.y));
}

function roomControllerLevel(room) {
    return room && room.controller && room.controller.level != null ? room.controller.level : 0;
}

/** RCL8 extra layer (walkway, seal-wall conversion, outer teeth). Sites are cheap; wallers spend energy. */
function roomAllowsRcl8DefenseLayer(room) {
    return roomControllerLevel(room) >= 8;
}

function roomSafeForSealConversion(room) {
    if (!room) return false;
    if (room.memory && room.memory.dangerousAttack) return false;
    const intel = typeof INTEL !== 'undefined' ? INTEL[room.name] : null;
    if (intel && intel.threatLevel) return false;
    const hostiles = room.hostileCreeps || [];
    for (let i = 0; i < hostiles.length; i++) {
        const c = hostiles[i];
        if (!c) continue;
        if (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(WORK)) {
            return false;
        }
    }
    return true;
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

    const plannedExt = getDynamicExtensionProtectTiles(room);
    for (let i = 0; i < plannedExt.length; i++) add(plannedExt[i].x, plannedExt[i].y);
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
    // Checkerboard walls on these paths seal the bunker from the inside.
    if (room.controller) addFullPath(room.controller.pos);
    if (room.mineral) addFullPath(room.mineral.pos);
    rampartCorridorCache[name] = keys;
    rampartCorridorTick[name] = Game.time;
    return keys;
}

function isLiveBarrier(s) {
    if (!s || !s.pos || !s.id) return false;
    if (s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL) return false;
    if (!(s.hits > 0)) return false;
    // Stale cached lists can keep destroyed objects with a leftover .pos.
    return !!Game.getObjectById(s.id);
}

/** Built barrier keys for a room — one structure scan, reused for incomplete checks. */
function getBuiltBarrierKeySet(room) {
    if (room._barrierKeySetTick === Game.time && room._barrierKeySet) return room._barrierKeySet;
    const set = new Set();
    const addList = (list) => {
        if (!list) return;
        for (let i = 0; i < list.length; i++) {
            const b = list[i];
            if (!isLiveBarrier(b)) continue;
            set.add(xyKey(b.pos.x, b.pos.y));
        }
    };
    addList(room.barriers);
    addList(room.ramparts);
    addList(room.walls);
    addList(room.constructedWalls);
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

function getQuadTrapKeySet(room) {
    if (room._quadTrapKeySetTick === Game.time && room._quadTrapKeySet) return room._quadTrapKeySet;
    const set = new Set();
    const mem = room.memory && room.memory.quadTrapWalls;
    if (mem) {
        for (let i = 0; i < mem.length; i++) {
            const p = mem[i];
            if (p) set.add(xyKey(p.x, p.y));
        }
    }
    const traps = quadTraps[room.name];
    if (traps) {
        for (let i = 0; i < traps.length; i++) {
            const p = traps[i];
            if (p) set.add(xyKey(p.x, p.y));
        }
    }
    room._quadTrapKeySet = set;
    room._quadTrapKeySetTick = Game.time;
    return set;
}

function isQuadTrapTile(pos, room) {
    return getQuadTrapKeySet(room).has(xyKey(pos.x, pos.y));
}

function isRemovableStrayBarrier(pos, room, perimeterSpotSet) {
    if (perimeterSpotSet.has(`${pos.x},${pos.y}`)) return false;
    if (hasBarrierUnderlay(pos)) return false;
    if (isOnSourcePad(pos, room)) return false;
    if (isQuadTrapTile(pos, room)) return false;
    if (isWalkwayTile(pos, room)) return false;
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
    if (isQuadTrapTile(pos, room)) return false;
    if (isWalkwayTile(pos, room)) return false;
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
    if (raw == null || raw === '') return false;
    try {
        const spots = typeof raw === 'string' ? JSON.parse(raw) : raw;
        // Empty array is a computed plan (terrain-sealed pocket). Undefined means not computed.
        return Array.isArray(spots);
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
        algorithm: computed && computed.algorithm ? computed.algorithm : 'mincut-tiles',
        seeds: computed ? computed.seeds : 0,
        validSeeds: computed ? computed.validSeeds : 0,
        radius: computed ? computed.radius : 0,
        bounds: computed ? computed.bounds : null,
        interior: computed ? computed.interior.size : 0,
        computedSpots: computed ? computed.spots.length : 0,
        cachedSpots: cached.length,
        planRev: PERIMETER_PLAN_REV,
    };
}

function initializeRampartSpots(room, layout, count) {
    ROOM_RAMPART_SPOTS[room.name] = undefined;
    storeWalkwaySpots(room.name, '', []);
    room._perimeterComputeOk = false;
    room._perimeterInteriorSize = 0;
    if (!room.hub) {
        log.w(`${room.name} rampart init skipped: no hub`);
        return count ? 0 : undefined;
    }
    const tmpl = layout || (room.memory.dynamicLayout ? coreTemplate : bunkerTemplate);
    try {
        const result = computeFloodfillPerimeter(room, tmpl);
        const spots = result.spots || [];
        room._perimeterComputeOk = true;
        room._perimeterInteriorSize = result.interior ? result.interior.size : 0;
        // Cache even when empty — a terrain-sealed pocket needs 0 ramparts.
        ROOM_RAMPART_SPOTS[room.name] = JSON.stringify(spots);
        storeWalkwaySpots(room.name, ROOM_RAMPART_SPOTS[room.name], result.walkway);
        if (!spots.length && room._perimeterInteriorSize < 3) {
            log.w(`${room.name} rampart flood produced 0 spots (seeds=${result.seeds} valid=${result.validSeeds} r=${result.radius} interior=${room._perimeterInteriorSize}); will retry`);
            ROOM_RAMPART_SPOTS[room.name] = undefined;
            storeWalkwaySpots(room.name, '', []);
            room._perimeterComputeOk = false;
        } else if (Game.time % 100 === 0) {
            const b = result.bounds;
            const box = b ? `${b.x1},${b.y1}-${b.x2},${b.y2}` : '?';
            const walkN = result.walkway ? result.walkway.length : 0;
            log.a(`${room.name} ${result.algorithm || 'mincut'} seal: spots=${spots.length} walkway=${walkN} seeds=${result.validSeeds}/${result.seeds} box=${box}`, 'PLANNER');
        }
    } catch (e) {
        log.e('Floodfill perimeter error in room ' + room.name);
        log.e(e.stack);
        ROOM_RAMPART_SPOTS[room.name] = undefined;
        room._perimeterComputeOk = false;
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
    // Ruins occupy the tile for ~500 ticks after destroy/decay; skip so we do
    // not denylist the wall tile or spend the seal's site slot on a doomed place.
    if (typeof LOOK_RUINS !== 'undefined' && pos.lookFor(LOOK_RUINS).length) return 'hasRuin';
    return true;
}

/** True when a wall here would seal a 1–2-wide pass (friendlies cannot walk a wall). */
function isSingletonChoke(pos) {
    const terrain = Game.map.getRoomTerrain(pos.roomName);
    let walkable = 0;
    for (let i = 0; i < 8; i++) {
        const nx = pos.x + OCTALS[i][0];
        const ny = pos.y + OCTALS[i][1];
        if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
        if (isTerrainWall(terrain, nx, ny)) continue;
        walkable++;
        if (walkable >= 3) return false;
    }
    return true;
}

/**
 * Classic perimeter checkerboard (RCL5–7):
 *  - (x+y) even → constructed wall (when tile allows)
 *  - (x+y) odd  → rampart
 * Wall tiles that sit on roads, walk corridors, structures, chokes, or otherwise
 * can't take a wall get a rampart instead so the seal stays continuous and walkable.
 *
 * RCL8: always rampart. Constructed walls move to outer quad-trap teeth so
 * defenders can walk the fighting line without dropping cover.
 */
function choosePerimeterBarrierType(pos, corridors, room) {
    const rm = room || (pos && Game.rooms[pos.roomName]);
    if (roomControllerLevel(rm) >= 8) return STRUCTURE_RAMPART;
    if (pos.checkForImpassible(true, true)) return STRUCTURE_RAMPART;
    if (pos.checkForConstructionSites()) return STRUCTURE_RAMPART;
    const isWallTile = ((pos.x + pos.y) & 1) === 0;
    if (!isWallTile) return STRUCTURE_RAMPART;
    if (pos.checkForRoad()) return STRUCTURE_RAMPART;
    if (corridors && corridors.has(pos.x + ',' + pos.y)) return STRUCTURE_RAMPART;
    const extKeys = getDynamicExtensionKeySet(rm);
    if (extKeys && extKeys.has(xyKey(pos.x, pos.y))) return STRUCTURE_RAMPART;
    if (isSingletonChoke(pos)) return STRUCTURE_RAMPART;
    if (!canPlaceConstructedWall(pos)) return STRUCTURE_RAMPART;
    return STRUCTURE_WALL;
}

/**
 * Wide exterior approaches (2+ walkable non-seal, non-interior neighbors).
 * Mountain-backed chokes stay tripwire HP.
 */
function isCombatFaceTrapPos(pos, room, sealSet) {
    if (!pos || !room) return false;
    const terrain = Game.map.getRoomTerrain(room.name);
    let open = 0;
    for (let i = 0; i < 8; i++) {
        const nx = pos.x + OCTALS[i][0];
        const ny = pos.y + OCTALS[i][1];
        if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
        if (isTerrainWall(terrain, nx, ny)) continue;
        if (sealSet && sealSet.has(xyKey(nx, ny))) continue;
        const neighbor = new RoomPosition(nx, ny, room.name);
        if (neighbor.isInBunker && neighbor.isInBunker()) continue;
        open++;
        if (open >= 2) return true;
    }
    return false;
}

function collectCombatFaceTraps(room, trapLocations) {
    const faces = [];
    if (!trapLocations || !trapLocations.length) return faces;
    const sealSet = new Set();
    const spots = getPerimeterSpots(room.name);
    for (let i = 0; i < spots.length; i++) {
        sealSet.add(xyKey(spots[i].x, spots[i].y));
    }
    for (let i = 0; i < trapLocations.length; i++) {
        const p = trapLocations[i];
        if (!p) continue;
        const pos = p instanceof RoomPosition ? p : new RoomPosition(p.x, p.y, room.name);
        if (isCombatFaceTrapPos(pos, room, sealSet)) faces.push({x: pos.x, y: pos.y});
    }
    return faces;
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
        unreachable: 0,
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
        walkwayPlanned: 0,
        walkwayBuilt: 0,
        walkwayMissing: 0,
        rcl8Layer: roomControllerLevel(room) >= 8,
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
        if (hub && !isHubReachableTile(room, x, y)) summary.unreachable++;
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

    const walkway = getWalkwaySpots(room);
    summary.walkwayPlanned = walkway.length;
    for (let i = 0; i < walkway.length; i++) {
        const w = walkway[i];
        const pos = new RoomPosition(w.x, w.y, room.name);
        const hasR = pos.checkForRampart();
        if (hasR) summary.walkwayBuilt++;
        else summary.walkwayMissing++;
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
        for (let i = 0; i < walkway.length; i++) {
            const w = walkway[i];
            const hasR = new RoomPosition(w.x, w.y, room.name).checkForRampart();
            room.visual.rect(w.x - 0.45, w.y - 0.45, 0.9, 0.9, {
                fill: hasR ? '#44ddcc' : '#226677',
                opacity: 0.35,
                stroke: '#44ddcc',
                strokeWidth: 0.05,
            });
        }
        if (hub) {
            room.visual.circle(hub.x, hub.y, {radius: 0.5, fill: '#00aaff', opacity: 0.5});
            room.visual.text('HUB', hub.x, hub.y - 0.55, {color: '#8cf', font: 0.35});
        }
        const sealTxt = summary.sealed === true ? 'SEALED'
            : summary.sealed === false ? 'OPEN' : 'n/a';
        room.visual.text(
            `plan ${summary.planned} | built ${summary.built} | site ${summary.sites} | miss ${summary.missing} | blk ${summary.blocked} | unreach ${summary.unreachable} | ${sealTxt}`,
            1, 1, {
                align: 'left',
                color: '#fff',
                font: 0.45,
                backgroundColor: 'rgba(0,0,0,0.55)',
                backgroundPadding: 0.15
            }
        );
        if (summary.walkwayPlanned) {
            room.visual.text(
                `walkway ${summary.walkwayPlanned} | built ${summary.walkwayBuilt} | miss ${summary.walkwayMissing}`,
                1, 1.55, {
                    align: 'left',
                    color: '#8ef',
                    font: 0.4,
                    backgroundColor: 'rgba(0,0,0,0.45)',
                    backgroundPadding: 0.12
                }
            );
        }
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
                const wantType = choosePerimeterBarrierType(pos, corridors, room);
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
        unreachable: d.unreachable,
        built: d.built,
        sites: d.sites,
        missing: d.missing,
        blocked: d.blocked,
        walkwayPlanned: d.walkwayPlanned,
        walkwayBuilt: d.walkwayBuilt,
        walkwayMissing: d.walkwayMissing,
        rcl8Layer: d.rcl8Layer,
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
        legend: 'visual: green=built yellow=site red=missing orange=blocked blue=hub cyan=walkway red line=leak',
    };
}

module.exports = {
    PERIMETER_PLAN_REV,
    QUAD_TRAP_TRIPWIRE_HITS,
    hasPerimeterSpots,
    getPerimeterSpots,
    getWalkwaySpots,
    getWalkwayKeySet,
    isWalkwayTile,
    roomAllowsRcl8DefenseLayer,
    roomSafeForSealConversion,
    collectCombatFaceTraps,
    isCombatFaceTrapPos,
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
    estimateHubSealCost,
    countOpenStampRing,
    countOpenExitSectors,
    templateStampRadius,
    floodWalkableFrom,
    isHubReachableTile,
    roomControllerLevel,
};
