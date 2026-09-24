/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Multi-room route discovery and route cache.

 */


const {NO_RAMPART_CODE} = require('pathState');

const CLAIM_TICKS_PER_ROOM = 35;
const CLAIM_ACTION_RESERVE = 50;
const ROUTE_TTL = 500;
const ROUTE_DISTANCE_TTL = CREEP_LIFE_TIME * 3;

const EXIT_TILE_CACHE = Object.create(null);
const HOP_GOAL_COUNT = 3;

function avoidList(options) {
    if (!options || typeof options !== 'object' || !options.avoid) return null;
    return Array.isArray(options.avoid) ? options.avoid : [options.avoid];
}

function isAvoided(roomName, options) {
    const rooms = avoidList(options);
    return !!(rooms && rooms.includes(roomName));
}

function filterAvoidedRooms(rooms, options, keep) {
    const roomsAvoid = avoidList(options);
    if (!roomsAvoid || !rooms || !rooms.length) return rooms;
    const keepSet = keep && keep.length ? keep : [];
    const out = [];
    for (let i = 0; i < rooms.length; i++) {
        const r = rooms[i];
        if (keepSet.includes(r) || !roomsAvoid.includes(r)) out.push(r);
    }
    return out;
}

// Going to the dest-adjacent staging room: never route through dest itself.
function attachStagingAvoid(creep, target, options) {
    if (!creep || !creep.memory || !target || !options) return options;
    const dest = creep.memory.destination;
    const misc = creep.memory.misc;
    const staging = misc && misc.stagingRoom;
    if (!dest || !staging || staging === dest) return options;
    if (target.roomName !== staging) return options;
    if (creep.pos.roomName === dest || creep.pos.roomName === staging) return options;
    const extra = avoidList(options) ? avoidList(options).slice() : [];
    if (!extra.includes(dest)) extra.push(dest);
    options.avoid = extra;
    return options;
}

// Remote raiders must not walk the owned hostile dest even when it is the
// shortest hop between two remotes. Origin/target keep still lets a creep
// already inside dest walk out.
function attachRemoteDenialAvoid(creep, target, options) {
    if (!creep || !creep.memory || !target || !options) return options;
    if (creep.memory.operation !== 'remoteDenial') return options;
    const dest = creep.memory.destination;
    if (!dest || target.roomName === dest) return options;
    const extra = avoidList(options) ? avoidList(options).slice() : [];
    if (!extra.includes(dest)) extra.push(dest);
    options.avoid = extra;
    return options;
}

function routeCacheKey(from, to, options = {}) {
    const shortest = typeof options === 'boolean' ? options : !!options.shortest;
    const offRoad = typeof options === 'object' && !!options.offRoad;
    const roomsAvoid = typeof options === 'object' ? avoidList(options) : null;
    const avoidKey = roomsAvoid && roomsAvoid.length
        ? `_av${roomsAvoid.slice().sort().join(',')}` : '';
    const nx = typeof options === 'object' && options.noSkCrossing ? '_nx' : '';
    return `${from}_${to}${shortest ? '_short' : ''}${offRoad ? '_off' : ''}${avoidKey}_c6${nx}`;
}

function roomIsSk(roomName, intel) {
    if (intel && intel.sk) return true;
    return !!(global.isSourceKeeperRoomName && global.isSourceKeeperRoomName(roomName));
}

function hostileTowersInRoom(intel) {
    if (!intel || !intel.towers || !intel.owner) return false;
    if (typeof FRIENDLIES !== 'undefined' && FRIENDLIES.includes(intel.owner)) return false;
    return true;
}

// In-room matrix already hugs the rim / live keepers. Route cost should skip
// an SK room when an equal-length plains path exists, not when a highway lap
// of 8–12 rooms exists. Unscouted SK used to be 25 vs highway 2.
// Invader towers mean a stronghold — blocked, same as player towers.
function skTransitCost(roomName, intel, shortest) {
    if (!roomIsSk(roomName, intel)) return null;
    if (hostileTowersInRoom(intel)) return Infinity;
    return shortest ? 1.2 : 4;
}

const SK_CROSSING_CACHE = Object.create(null);
const SK_GRID_CACHE = Object.create(null);
const SK_DANGER_RANGE = 5;
const SK_BFS_DX = [0, 1, 1, 1, 0, -1, -1, -1];
const SK_BFS_DY = [-1, -1, 0, 1, 1, 1, 0, -1];
const SK_EXIT_DIRS = [TOP, RIGHT, BOTTOM, LEFT];

function dangerPointHash(points) {
    let s = '';
    for (let i = 0; i < points.length; i++) s += points[i].x + ',' + points[i].y + ';';
    return s;
}

function inSkDanger(x, y, points) {
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) <= SK_DANGER_RANGE) return true;
    }
    return false;
}

function exitDirToNeighbor(from, to) {
    const exits = Game.map.describeExits(from);
    if (!exits) return 0;
    for (let i = 0; i < SK_EXIT_DIRS.length; i++) {
        const dir = SK_EXIT_DIRS[i];
        if (exits[dir] === to) return dir;
    }
    return 0;
}

function greedyExitDir(from, to) {
    const adj = exitDirToNeighbor(from, to);
    if (adj) return adj;
    const exits = Game.map.describeExits(from);
    if (!exits) return 0;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < SK_EXIT_DIRS.length; i++) {
        const dir = SK_EXIT_DIRS[i];
        const n = exits[dir];
        if (!n) continue;
        const d = Game.map.getRoomLinearDistance(n, to);
        if (d < bestD) {
            bestD = d;
            best = dir;
        }
    }
    return best;
}

function skBlockedGrid(roomName, points) {
    const key = roomName + '|' + dangerPointHash(points);
    const hit = SK_GRID_CACHE[key];
    if (hit) return hit;
    const grid = new Uint8Array(2500);
    const terrain = Game.map.getRoomTerrain(roomName);
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            if (terrain.get(x, y) === TERRAIN_MASK_WALL || inSkDanger(x, y, points)) {
                grid[y * 50 + x] = 1;
            }
        }
    }
    SK_GRID_CACHE[key] = grid;
    return grid;
}

function skExitConnected(roomName, enterDir, leaveDir, points) {
    const grid = skBlockedGrid(roomName, points);
    const starts = scanTerrainExits(roomName, enterDir);
    const goals = scanTerrainExits(roomName, leaveDir);
    if (!starts.length || !goals.length) return false;
    const goalSet = new Uint8Array(2500);
    let goalCount = 0;
    for (let i = 0; i < goals.length; i++) {
        const t = goals[i];
        const idx = t.y * 50 + t.x;
        if (grid[idx]) continue;
        goalSet[idx] = 1;
        goalCount++;
    }
    if (!goalCount) return false;
    const visited = new Uint8Array(2500);
    const qx = [];
    const qy = [];
    for (let i = 0; i < starts.length; i++) {
        const t = starts[i];
        const idx = t.y * 50 + t.x;
        if (grid[idx] || visited[idx]) continue;
        visited[idx] = 1;
        if (goalSet[idx]) return true;
        qx.push(t.x);
        qy.push(t.y);
    }
    let qh = 0;
    while (qh < qx.length) {
        const x = qx[qh];
        const y = qy[qh++];
        for (let d = 0; d < 8; d++) {
            const nx = x + SK_BFS_DX[d];
            const ny = y + SK_BFS_DY[d];
            if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
            const idx = ny * 50 + nx;
            if (visited[idx] || grid[idx]) continue;
            visited[idx] = 1;
            if (goalSet[idx]) return true;
            qx.push(nx);
            qy.push(ny);
        }
    }
    return false;
}

// Lair/source blankets can seal one crossing (N-S) while another (E-W) is open.
// Never call Game.map.findExit here — it uses findRoute and re-enters this callback.
function skCrossingBlocked(roomName, fromRoom, towardRoom) {
    if (!fromRoom || !towardRoom || fromRoom === towardRoom) return false;
    const intel = typeof INTEL !== 'undefined' ? INTEL[roomName] : undefined;
    const points = intel && intel.skDangerPoints;
    if (!points || !points.length) return false;
    const enterDir = exitDirToNeighbor(roomName, fromRoom);
    const leaveDir = greedyExitDir(roomName, towardRoom);
    if (!enterDir || !leaveDir || enterDir === leaveDir) return false;
    const cacheKey = roomName + '|' + enterDir + '|' + leaveDir + '|' + dangerPointHash(points);
    if (Object.prototype.hasOwnProperty.call(SK_CROSSING_CACHE, cacheKey)) {
        return SK_CROSSING_CACHE[cacheKey];
    }
    const blocked = !skExitConnected(roomName, enterDir, leaveDir, points);
    SK_CROSSING_CACHE[cacheKey] = blocked;
    return blocked;
}

function skRouteCost(roomName, intel, shortest, fromRoom, destination, noCrossing) {
    const base = skTransitCost(roomName, intel, shortest);
    if (base == null || base === Infinity) return base;
    if (noCrossing) return base;
    if (fromRoom && destination && skCrossingBlocked(roomName, fromRoom, destination)) return Infinity;
    return base;
}

function isRoomBlocked(roomName, origin, destination, options) {
    const intel = INTEL[roomName];
    const rStatus = roomStatus(roomName);
    if (rStatus === 'closed' || (intel && !intel.isHighway && rStatus !== roomStatus(origin))) return true;
    if (isAvoided(roomName, options)) return true;
    if (Memory.avoidRooms?.includes(roomName)) return true;
    if (intel?.owner && !FRIENDLIES.includes(intel.owner) && intel.towers) return true;
    if (options.blockHostileOwned && intel?.owner && !FRIENDLIES.includes(intel.owner)) return true;
    return false;
}

const SAME_ROOM_DETOUR_OPS = 4000;
const SAME_ROOM_LONG_PATH = 40;

function allowSameRoomDetour(options, origin, target) {
    if (!options || !origin || !target) return false;
    if (origin.roomName !== target.roomName) return false;
    if (options.flee || options.portal) return false;
    if (options.hopGoals && options.hopGoals.length) return false;
    if (options.hopExitDir) return false;
    // Caller pinned a 1-room search (exit hops, hide, road planner).
    if (options.maxRooms === 1) return false;
    return true;
}

function sameRoomDetourRooms(originRoom, options = {}) {
    const exits = Game.map.describeExits(originRoom);
    const rooms = [originRoom];
    if (!exits) return rooms;
    const dirs = Object.keys(exits);
    for (let i = 0; i < dirs.length; i++) {
        const neighbor = exits[dirs[i]];
        if (!neighbor) continue;
        if (isRoomBlocked(neighbor, originRoom, originRoom, options)) continue;
        rooms.push(neighbor);
    }
    return filterAvoidedRooms(rooms, options, [originRoom]);
}

function sameRoomSearchNeedsDetour(origin, target, result) {
    if (!result || result.incomplete) return true;
    if (!result.path || !result.path.length) return true;
    const range = origin.getRangeTo(target);
    return result.path.length > Math.max(SAME_ROOM_LONG_PATH, range * 3);
}

function betterPathResult(current, candidate) {
    if (!candidate || candidate.incomplete || !candidate.path || !candidate.path.length) return current;
    if (!current || current.incomplete || !current.path || !current.path.length) return candidate;
    if (candidate.cost != null && current.cost != null && candidate.cost !== current.cost) {
        return candidate.cost < current.cost ? candidate : current;
    }
    return candidate.path.length < current.path.length ? candidate : current;
}

/**
 * Same-room dest that is cheaper (or only reachable) via a neighboring room.
 * Cheap 1-room search stays the default; this retries through exits only when
 * that search is incomplete or far longer than Chebyshev.
 * searchFn(rooms, maxOps) must run PathFinder with that allow-list.
 */
function applySameRoomDetour(origin, target, result, options, searchFn) {
    if (!allowSameRoomDetour(options, origin, target)) return result;
    if (!sameRoomSearchNeedsDetour(origin, target, result)) return result;
    const rooms = sameRoomDetourRooms(origin.roomName, options);
    if (rooms.length < 2) return result;
    const detour = searchFn(rooms, Math.max((options && options.maxOps) || 0, SAME_ROOM_DETOUR_OPS));
    const best = betterPathResult(result, detour);
    if (best && best !== result && options) {
        options.sameRoomDetour = true;
        options.sameRoomDetourRooms = rooms;
    }
    return best;
}

function roomCost(roomName, origin, destination, options, fromRoomName) {
    if (roomName === origin || roomName === destination) return 1;
    if (isRoomBlocked(roomName, origin, destination, options)) return Infinity;

    const intel = INTEL[roomName];
    const skCost = skRouteCost(roomName, intel, !!options.shortest, fromRoomName, destination,
        !!(options && options.noSkCrossing));

    if (options.shortest) {
        if (intel?.user === MY_USERNAME) return 0.9;
        if (intel?.isHighway) return 0.95;
        if (skCost != null) return skCost;
        return 1;
    }

    if (Memory.avoidRooms?.includes(roomName)) return 220;
    // Unknown used to be 100 vs highway 2 — a 50-room detour to skip one fog room.
    if (!intel || intel.cached + 10000 < Game.time) {
        if (skCost != null) return skCost;
        return options.offRoad ? 4 : 6;
    }
    if (intel.user && intel.user === MY_USERNAME) return 1;
    if (intel.owner && FRIENDLIES.includes(intel.owner)) return !NO_RAMPART_CODE.includes(intel.owner) ? 25 : 1;
    if (intel.user && FRIENDLIES.includes(intel.user)) return 1;
    if (intel.owner && !FRIENDLIES.includes(intel.owner)) return intel.towers ? Infinity : 150;
    if (intel.user && !FRIENDLIES.includes(intel.user)) return 5;
    if (intel.armedHostile && intel.armedHostile + CREEP_LIFE_TIME > Game.time) {
        return Math.max(50, skCost || 0);
    }
    if (intel.obstacles) return 100;
    if (skCost != null) return skCost;
    if (intel.threatLevel) return 10 * intel.threatLevel;
    if (intel.swampRoom && !options.offRoad) return 15;
    return intel.isHighway ? 2 : 3;
}

function scanTerrainExits(roomName, exitDir) {
    const key = `${roomName}_${exitDir}`;
    if (EXIT_TILE_CACHE[key]) return EXIT_TILE_CACHE[key];
    const terrain = Game.map.getRoomTerrain(roomName);
    const tiles = [];
    if (exitDir === TOP) {
        for (let x = 1; x < 49; x++) {
            if (terrain.get(x, 0) !== TERRAIN_MASK_WALL) tiles.push({x, y: 0});
        }
    } else if (exitDir === BOTTOM) {
        for (let x = 1; x < 49; x++) {
            if (terrain.get(x, 49) !== TERRAIN_MASK_WALL) tiles.push({x, y: 49});
        }
    } else if (exitDir === LEFT) {
        for (let y = 1; y < 49; y++) {
            if (terrain.get(0, y) !== TERRAIN_MASK_WALL) tiles.push({x: 0, y});
        }
    } else if (exitDir === RIGHT) {
        for (let y = 1; y < 49; y++) {
            if (terrain.get(49, y) !== TERRAIN_MASK_WALL) tiles.push({x: 49, y});
        }
    }
    EXIT_TILE_CACHE[key] = tiles;
    return tiles;
}

function getWalkableExits(roomName, exitDir) {
    const tiles = scanTerrainExits(roomName, exitDir);
    const room = Game.rooms[roomName];
    if (!room || !tiles.length) return tiles;
    const open = [];
    for (let i = 0; i < tiles.length; i++) {
        const t = tiles[i];
        if (!new RoomPosition(t.x, t.y, roomName).checkForObstacleStructure()) open.push(t);
    }
    return open.length ? open : tiles;
}

function preferredExitAlong(exitDir, nextRoom, lookAheadRoom) {
    if (!lookAheadRoom || !nextRoom) return 25;
    const nextDir = Game.map.findExit(nextRoom, lookAheadRoom);
    if (!(nextDir > 0) || nextDir === exitDir) return 25;
    if (exitDir === RIGHT || exitDir === LEFT) {
        if (nextDir === TOP) return 8;
        if (nextDir === BOTTOM) return 41;
        return 25;
    }
    if (nextDir === LEFT) return 8;
    if (nextDir === RIGHT) return 41;
    return 25;
}

function onExitToward(pos, exitDir) {
    if (!pos || !exitDir) return false;
    if (exitDir === RIGHT) return pos.x === 49;
    if (exitDir === LEFT) return pos.x === 0;
    if (exitDir === TOP) return pos.y === 0;
    if (exitDir === BOTTOM) return pos.y === 49;
    return false;
}

/**
 * Aligned exit tiles from fromRoom into nextRoom.
 * Look-ahead picks the side we'll leave nextRoom from so we don't
 * enter south and immediately have to cross north.
 */
function clusterExitTiles(tiles, along) {
    const sorted = tiles.slice().sort((a, b) => along(a) - along(b));
    const clusters = [];
    let cluster = [];
    for (let i = 0; i < sorted.length; i++) {
        const t = sorted[i];
        if (!cluster.length || along(t) - along(cluster[cluster.length - 1]) <= 1) {
            cluster.push(t);
        } else {
            clusters.push(cluster);
            cluster = [t];
        }
    }
    if (cluster.length) clusters.push(cluster);
    return clusters;
}

function hopLanding(exitDir, x, y) {
    if (exitDir === RIGHT) return {x: 0, y};
    if (exitDir === LEFT) return {x: 49, y};
    if (exitDir === TOP) return {x, y: 49};
    return {x, y: 0};
}

function hopLandingOpen(nextRoom, x, y) {
    const terrain = Game.map.getRoomTerrain(nextRoom);
    if (terrain.get(x, y) === TERRAIN_MASK_WALL) return false;
    const room = Game.rooms[nextRoom];
    if (room && new RoomPosition(x, y, nextRoom).checkForObstacleStructure()) return false;
    return true;
}

function squadExitPairOpen(t, exitDir, delta, tileSet, nextRoom) {
    const alongX = exitDir === TOP || exitDir === BOTTOM;
    const x2 = alongX ? t.x + delta : t.x;
    const y2 = alongX ? t.y : t.y + delta;
    if (!tileSet.has(x2 + ',' + y2)) return false;
    const a = hopLanding(exitDir, t.x, t.y);
    const b = hopLanding(exitDir, x2, y2);
    return hopLandingOpen(nextRoom, a.x, a.y) && hopLandingOpen(nextRoom, b.x, b.y);
}

// Packed 2×2 needs two consecutive exit tiles (and matching landings). Solo
// pickHopGoals aims at a single tile the squad matrix then marks unwalkable.
function pickSquadHopGoals(tiles, exitDir, preferred, nextRoom) {
    const along = (exitDir === TOP || exitDir === BOTTOM) ? (t) => t.x : (t) => t.y;
    const tileSet = new Set();
    for (let i = 0; i < tiles.length; i++) tileSet.add(tiles[i].x + ',' + tiles[i].y);
    const wide = [];
    const narrow = [];
    for (let i = 0; i < tiles.length; i++) {
        const t = tiles[i];
        if (squadExitPairOpen(t, exitDir, 1, tileSet, nextRoom)
            || squadExitPairOpen(t, exitDir, -1, tileSet, nextRoom)) {
            wide.push(t);
        } else {
            narrow.push(t);
        }
    }
    const score = (t) => Math.abs(along(t) - preferred) * 10 + Math.abs(along(t) - 25);
    wide.sort((a, b) => score(a) - score(b));
    narrow.sort((a, b) => score(a) - score(b));
    const picked = [];
    const seen = new Set();
    const add = (t) => {
        const k = t.x + ',' + t.y;
        if (seen.has(k)) return;
        seen.add(k);
        picked.push(t);
    };
    for (let i = 0; i < wide.length && picked.length < 8; i++) add(wide[i]);
    // 1-wide exits cannot host a 2×2. Aiming at them made PathFinder emit a
    // step the blob then had to snake or leak through.
    return picked;
}

function pickHopGoals(tiles, exitDir, preferred) {
    const along = (exitDir === TOP || exitDir === BOTTOM) ? (t) => t.x : (t) => t.y;
    const clusters = clusterExitTiles(tiles, along);
    const bestInCluster = (c) => {
        let best = c[0];
        let bestD = Math.abs(along(best) - preferred);
        for (let i = 1; i < c.length; i++) {
            const d = Math.abs(along(c[i]) - preferred);
            if (d < bestD) {
                best = c[i];
                bestD = d;
            }
        }
        return best;
    };
    const picked = [];
    const seen = new Set();
    const add = (t) => {
        const k = t.x + ',' + t.y;
        if (seen.has(k)) return;
        seen.add(k);
        picked.push(t);
    };
    // Isolated clusters first (a 1-wide tunnel far from x=25 used to be dropped).
    const byAlign = clusters.slice().sort((a, b) =>
        Math.abs(along(bestInCluster(a)) - preferred) - Math.abs(along(bestInCluster(b)) - preferred));
    for (let i = 0; i < byAlign.length; i++) add(bestInCluster(byAlign[i]));
    // One wide open edge: also keep the ends so a side tunnel is a goal.
    if (clusters.length === 1 && tiles.length > HOP_GOAL_COUNT) {
        const c = clusters[0];
        add(c[0]);
        add(c[c.length - 1]);
    }
    const scored = tiles.slice().sort((a, b) => {
        const sa = Math.abs(along(a) - preferred) * 10 + Math.abs(along(a) - 25);
        const sb = Math.abs(along(b) - preferred) * 10 + Math.abs(along(b) - 25);
        return sa - sb;
    });
    const cap = Math.max(HOP_GOAL_COUNT, picked.length);
    for (let i = 0; i < scored.length && picked.length < cap; i++) add(scored[i]);
    return picked;
}

function exitHopTarget(fromRoom, nextRoom, fromPos, lookAheadRoom, options) {
    const exitDir = Game.map.findExit(fromRoom, nextRoom);
    if (!(exitDir > 0)) return null;
    const tiles = getWalkableExits(fromRoom, exitDir);
    if (!tiles.length) return null;
    const preferred = preferredExitAlong(exitDir, nextRoom, lookAheadRoom);
    const squadSize = options && options.squadSize;
    const chosen = squadSize >= 3
        ? pickSquadHopGoals(tiles, exitDir, preferred, nextRoom)
        : pickHopGoals(tiles, exitDir, preferred);
    if (!chosen.length) return null;
    const goals = chosen.map((t) => ({
        pos: new RoomPosition(t.x, t.y, fromRoom),
        range: 0,
    }));
    const result = {
        pos: goals[0].pos,
        exitDir,
        goals,
        onExit: fromPos ? onExitToward(fromPos, exitDir) : false,
    };
    if (squadSize >= 3) {
        result.landingGoals = chosen.map((t) => {
            const land = hopLanding(exitDir, t.x, t.y);
            return {pos: new RoomPosition(land.x, land.y, nextRoom), range: 0};
        });
        result.pos = result.landingGoals[0].pos;
    }
    return result;
}

/**
 * Hop one room at a time along a known multi-room route instead of a full
 * PathFinder to the destination. Returns true if a move was issued.
 * @param {Creep} creep
 * @param {string} dest
 * @param {string[]} [route]
 * @param {{target?: RoomPosition, range?: number, maxOps?: number, hopOps?: number, claimRoute?: boolean, moveOptions?: object}} [options]
 */
function travelRouteHops(creep, dest, route, options = {}) {
    if (!creep || creep.fatigue > 0) return true;
    if (!dest || creep.room.name === dest) return false;

    const range = options.range != null ? options.range : 23;
    const destPos = options.target || new RoomPosition(25, 25, dest);
    const maxOps = options.maxOps || 2500;
    const hopOps = options.hopOps || 2000;
    const extra = options.moveOptions || {};

    let rooms = route && route.length ? route.slice() : [];
    // Mining routes are stored colony→remote. Reverse when going home.
    if (rooms.length && rooms[rooms.length - 1] !== dest) rooms.reverse();
    if (rooms.length && rooms.indexOf(creep.room.name) === -1) {
        rooms = [creep.room.name].concat(rooms);
    }
    if (rooms.length && rooms[rooms.length - 1] !== dest) rooms = rooms.concat([dest]);

    if (rooms && rooms.length) {
        const idx = rooms.indexOf(creep.room.name);
        if (idx >= 0 && idx < rooms.length - 1) {
            const nextRoom = rooms[idx + 1];
            const claimExtra = options.claimRoute ? {claimRoute: rooms.slice(idx)} : {};
            if (nextRoom === dest) {
                creep.shibMove(destPos, Object.assign({
                    range,
                    route: rooms.slice(idx, idx + 2),
                    maxRooms: 2,
                    maxOps,
                }, extra, claimExtra));
                return true;
            }
            const lookAhead = idx + 2 < rooms.length ? rooms[idx + 2] : dest;
            const hop = exitHopTarget(creep.room.name, nextRoom, creep.pos, lookAhead);
            if (hop) {
                creep.shibMove(hop.pos, Object.assign({
                    range: 0,
                    hopGoals: hop.goals,
                    hopExitDir: hop.exitDir,
                    fullRoute: rooms,
                    maxRooms: 1,
                    maxOps: hopOps,
                }, extra, claimExtra));
                return true;
            }
            creep.shibMove(new RoomPosition(25, 25, nextRoom), Object.assign({
                range: 23,
                route: rooms.slice(idx, idx + 2),
                maxRooms: 2,
                maxOps,
            }, extra, claimExtra));
            return true;
        }
    }

    const fallback = Object.assign({range}, extra);
    if (rooms && rooms.length) fallback.route = rooms;
    creep.shibMove(destPos, fallback);
    return true;
}

function estimateClaimRouteTicks(roomCount) {
    return roomCount * CLAIM_TICKS_PER_ROOM + CLAIM_ACTION_RESERVE;
}

function routeWithinClaimTTL(origin, destination, ticksRemaining, options = {}) {
    const route = findRoute(origin, destination, {...options, shortest: true});
    if (!route.length) return null;
    if (estimateClaimRouteTicks(route.length) > ticksRemaining) return null;
    return route;
}

function greedyExitRooms(from, dest) {
    const rooms = [from];
    if (!from || !dest || from === dest) return rooms;
    const exits = Game.map.describeExits(from);
    if (!exits) return rooms;
    let best = null;
    let bestD = Game.map.getRoomLinearDistance(from, dest);
    const dirs = Object.keys(exits);
    for (let i = 0; i < dirs.length; i++) {
        const n = exits[dirs[i]];
        if (!n) continue;
        const d = Game.map.getRoomLinearDistance(n, dest);
        if (d < bestD) {
            bestD = d;
            best = n;
        }
    }
    if (best) rooms.push(best);
    return rooms;
}

function findSectorCenterRoute(from, center, options = {}) {
    if (!from || !center) return [];
    const opts = Object.assign({}, options, {shortest: true});
    if (from === center) return [center];
    if (!(global.isSectorCenterRoomName && isSectorCenterRoomName(center))) {
        return findRoute(from, center, opts);
    }
    const exits = Game.map.describeExits(center);
    if (!exits) return findRoute(from, center, opts);
    let best = null;
    let bestScore = Infinity;
    const dirs = Object.keys(exits);
    for (let i = 0; i < dirs.length; i++) {
        const approach = exits[dirs[i]];
        if (!approach) continue;
        if (typeof roomStatus === 'function' && roomStatus(approach) === 'closed') continue;
        const intel = (typeof INTEL !== 'undefined' && INTEL[approach]) || {};
        if (hostileTowersInRoom(intel)) continue;
        const dist = Game.map.getRoomLinearDistance(from, approach);
        const score = dist;
        if (score < bestScore) {
            bestScore = score;
            best = approach;
        }
    }
    if (!best) return findRoute(from, center, opts);
    if (from === best) return [from, center];
    const head = findRoute(from, best, opts);
    if (!head || !head.length) return [from, best, center];
    const out = head[0] === from ? head.slice() : [from].concat(head);
    if (out[out.length - 1] !== best) out.push(best);
    if (out[out.length - 1] !== center) out.push(center);
    return out;
}

function findRoute(origin, destination, options = {}) {
    if (origin === destination) return [origin];
    _.defaults(options, {useCache: true, shortest: false});

    const cacheKey = routeCacheKey(origin, destination, options);
    const cached = options.useCache && CACHE.ROUTE_CACHE[cacheKey];
    if (cached && cached.tick + ROUTE_TTL > Game.time) {
        const route = typeof cached.route === 'string' ? JSON.parse(cached.route) : cached.route;
        return cached.failed ? [] : route;
    }

    // Intel-weighted callback is worth it nearby. Past ~20 rooms prefer a
    // cheap highway-biased walk — the old 15-room hard fail (and W/E digit
    // compare that ignored hemisphere) left scouts with no route at all.
    const linear = Game.map.getRoomLinearDistance(origin, destination);
    const useIntelCosts = linear <= 20 || options.shortest;
    const route = Game.map.findRoute(origin, destination, {
        routeCallback: (roomName, fromRoomName) => {
            if (roomName === origin || roomName === destination) return 1;
            if (isAvoided(roomName, options)) return Infinity;
            // Nested engine findRoute (findExit used to do this) must not BFS.
            const nested = findRoute._cbDepth > 0;
            findRoute._cbDepth = (findRoute._cbDepth || 0) + 1;
            try {
                if (useIntelCosts) {
                    return roomCost(roomName, origin, destination,
                        nested ? Object.assign({}, options, {noSkCrossing: true}) : options,
                        fromRoomName);
                }
                const rStatus = roomStatus(roomName);
                if (rStatus === 'closed') return Infinity;
                if (Memory.avoidRooms?.includes(roomName)) return Infinity;
                const intel = INTEL[roomName];
                if (intel && !intel.isHighway && rStatus !== roomStatus(origin)) return Infinity;
                if (intel?.owner && !FRIENDLIES.includes(intel.owner) && intel.towers) return Infinity;
                const skCost = skRouteCost(roomName, intel, true, fromRoomName, destination, true);
                if (skCost != null) return skCost;
                return intel?.isHighway ? 1 : 1.2;
            } finally {
                findRoute._cbDepth--;
            }
        },
    });

    if (typeof route === 'number' || !route.length) {
        cacheRoute(origin, destination, undefined, true, options);
        return [];
    }

    const path = route.map(r => r.room);
    cacheRoute(origin, destination, path, false, options);
    return path;
}

function cacheRoute(from, to, route, failed = false, options = {}) {
    if (typeof options === 'boolean') options = {shortest: options};
    const key = routeCacheKey(from, to, options);
    const entry = CACHE.ROUTE_CACHE[key] || {};
    entry.route = route || [];
    entry.failed = failed;
    entry.uses = (entry.uses || 0) + 1;
    entry.tick = Game.time;
    CACHE.ROUTE_CACHE[key] = entry;
}

function getRoute(from, to, options = {}) {
    const key = routeCacheKey(from, to, options);
    const cached = CACHE.ROUTE_CACHE[key];
    if (cached && Game.time < cached.tick + ROUTE_TTL) {
        if (cached.failed) return 'failed';
        cached.uses++;
        return cached.route;
    }
    return null;
}

function getDistanceCache() {
    if (!CACHE.ROUTE_DISTANCE) CACHE.ROUTE_DISTANCE = Object.create(null);
    return CACHE.ROUTE_DISTANCE;
}

function routeDistance(from, to, options = {}) {
    if (!from || !to) return Infinity;
    if (from === to) return 1;
    const key = routeCacheKey(from, to, options);
    const table = getDistanceCache();
    const hit = table[key];
    if (hit && hit.tick + ROUTE_DISTANCE_TTL > Game.time) return hit.distance;

    const route = findRoute(from, to, Object.assign({}, options, {noSkCrossing: true}));
    const distance = Array.isArray(route) && route.length ? route.length : Infinity;
    table[key] = {distance, tick: Game.time};
    return distance;
}

function deleteDistanceKeys(from, to) {
    const table = CACHE.ROUTE_DISTANCE;
    if (!table) return;
    delete table[routeCacheKey(from, to, {})];
    delete table[routeCacheKey(from, to, {shortest: true})];
    delete table[routeCacheKey(from, to, {offRoad: true})];
    delete table[routeCacheKey(from, to, {shortest: true, offRoad: true})];
}

function deleteRoute(from, to) {
    delete CACHE.ROUTE_CACHE[routeCacheKey(from, to, {})];
    delete CACHE.ROUTE_CACHE[routeCacheKey(from, to, {shortest: true})];
    delete CACHE.ROUTE_CACHE[routeCacheKey(from, to, {offRoad: true})];
    delete CACHE.ROUTE_CACHE[routeCacheKey(from, to, {shortest: true, offRoad: true})];
    deleteDistanceKeys(from, to);
}

module.exports = {

    findRoute,

    findSectorCenterRoute,

    greedyExitRooms,

    attachStagingAvoid,

    attachRemoteDenialAvoid,

    filterAvoidedRooms,

    avoidList,

    cacheRoute,

    getRoute,

    routeDistance,

    deleteRoute,

    estimateClaimRouteTicks,

    routeWithinClaimTTL,

    exitHopTarget,

    exitDirToNeighbor,

    greedyExitDir,

    travelRouteHops,

    onExitToward,

    preferredExitAlong,

    applySameRoomDetour,

    SAME_ROOM_DETOUR_OPS,

    ROUTE_TTL,

    ROUTE_DISTANCE_TTL,

};