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

function routeCacheKey(from, to, options = {}) {
    const shortest = typeof options === 'boolean' ? options : !!options.shortest;
    const offRoad = typeof options === 'object' && !!options.offRoad;
    const roomsAvoid = typeof options === 'object' ? avoidList(options) : null;
    const avoidKey = roomsAvoid && roomsAvoid.length
        ? `_av${roomsAvoid.slice().sort().join(',')}` : '';
    return `${from}_${to}${shortest ? '_short' : ''}${offRoad ? '_off' : ''}${avoidKey}`;
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

function roomCost(roomName, origin, destination, options) {
    if (roomName === origin || roomName === destination) return 1;
    if (isRoomBlocked(roomName, origin, destination, options)) return Infinity;

    const intel = INTEL[roomName];

    if (options.shortest) {
        if (intel?.user === MY_USERNAME) return 0.9;
        if (intel?.isHighway) return 0.95;
        return 1;
    }

    if (Memory.avoidRooms?.includes(roomName)) return 220;
    // Unknown used to be 100 vs highway 2 — a 50-room detour to skip one fog room.
    if (!intel || intel.cached + 10000 < Game.time) return options.offRoad ? 4 : 6;
    if (intel.user && intel.user === MY_USERNAME) return 1;
    if (intel.owner && FRIENDLIES.includes(intel.owner)) return !NO_RAMPART_CODE.includes(intel.owner) ? 25 : 1;
    if (intel.user && FRIENDLIES.includes(intel.user)) return 1;
    if (intel.owner && !FRIENDLIES.includes(intel.owner)) return intel.towers ? Infinity : 150;
    if (intel.user && !FRIENDLIES.includes(intel.user)) return 5;
    if (intel.armedHostile && intel.armedHostile + CREEP_LIFE_TIME > Game.time) return 50;
    if (intel.obstacles) return 100;
    // SK rooms: tower-defended OR no cached danger points (we've never scouted the
    // lair/source positions, so the in-room matrix can't carve a safe path).
    if (intel.sk && (intel.towers || !intel.skDangerPoints)) return 250;
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
function exitHopTarget(fromRoom, nextRoom, fromPos, lookAheadRoom) {
    const exitDir = Game.map.findExit(fromRoom, nextRoom);
    if (!(exitDir > 0)) return null;
    const tiles = getWalkableExits(fromRoom, exitDir);
    if (!tiles.length) return null;
    const preferred = preferredExitAlong(exitDir, nextRoom, lookAheadRoom);
    const along = (exitDir === TOP || exitDir === BOTTOM) ? (t) => t.x : (t) => t.y;
    const scored = tiles.slice().sort((a, b) => {
        const sa = Math.abs(along(a) - preferred) * 10 + Math.abs(along(a) - 25);
        const sb = Math.abs(along(b) - preferred) * 10 + Math.abs(along(b) - 25);
        return sa - sb;
    });
    const goals = scored.slice(0, HOP_GOAL_COUNT).map((t) => ({
        pos: new RoomPosition(t.x, t.y, fromRoom),
        range: 0,
    }));
    return {
        pos: goals[0].pos,
        exitDir,
        goals,
        onExit: fromPos ? onExitToward(fromPos, exitDir) : false,
    };
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
        routeCallback: (roomName) => {
            if (roomName === origin || roomName === destination) return 1;
            if (isAvoided(roomName, options)) return Infinity;
            if (useIntelCosts) return roomCost(roomName, origin, destination, options);
            const rStatus = roomStatus(roomName);
            if (rStatus === 'closed') return Infinity;
            if (Memory.avoidRooms?.includes(roomName)) return Infinity;
            const intel = INTEL[roomName];
            if (intel && !intel.isHighway && rStatus !== roomStatus(origin)) return Infinity;
            if (intel?.owner && !FRIENDLIES.includes(intel.owner) && intel.towers) return Infinity;
            if (intel?.sk && (intel.towers || !intel.skDangerPoints)) return 4;
            return intel?.isHighway ? 1 : 1.2;
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

    const route = findRoute(from, to, options);
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

    attachStagingAvoid,

    filterAvoidedRooms,

    avoidList,

    cacheRoute,

    getRoute,

    routeDistance,

    deleteRoute,

    estimateClaimRouteTicks,

    routeWithinClaimTTL,

    exitHopTarget,

    travelRouteHops,

    onExitToward,

    ROUTE_TTL,

    ROUTE_DISTANCE_TTL,

};