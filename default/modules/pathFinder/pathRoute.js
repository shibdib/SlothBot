/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Multi-room route discovery and route cache.

 */


const {NO_RAMPART_CODE} = require('pathState');

const CLAIM_TICKS_PER_ROOM = 35;
const CLAIM_ACTION_RESERVE = 50;

function routeCacheKey(from, to, shortest = false) {
    return `${from}_${to}${shortest ? '_short' : ''}`;
}

function isRoomBlocked(roomName, origin, destination, options) {
    const intel = INTEL[roomName];
    const rStatus = roomStatus(roomName);
    if (rStatus === 'closed' || (intel && !intel.isHighway && rStatus !== roomStatus(origin))) return true;
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
    if (!intel || intel.cached + 10000 < Game.time) return 100;
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
    if (intel.swampRoom) return 15;
    return intel.isHighway ? 2 : 3;
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

    const cacheKey = routeCacheKey(origin, destination, options.shortest);
    const cached = options.useCache && CACHE.ROUTE_CACHE[cacheKey];
    if (cached && cached.tick + 500 > Game.time) {
        const route = typeof cached.route === 'string' ? JSON.parse(cached.route) : cached.route;
        return cached.failed ? [] : route;
    }

    const [, fx, fy] = origin.match(/^[WE](\d+)[NS](\d+)$/) || [];
    const [, tx, ty] = destination.match(/^[WE](\d+)[NS](\d+)$/) || [];
    if (fx && tx) {
        const roomDistance = Math.max(Math.abs(parseInt(fx, 10) - parseInt(tx, 10)), Math.abs(parseInt(fy, 10) - parseInt(ty, 10)));
        if (roomDistance > 15) return [];
    }

    const route = Game.map.findRoute(origin, destination, {
        routeCallback: (roomName) => roomCost(roomName, origin, destination, options),
    });

    if (typeof route === 'number' || !route.length) {
        cacheRoute(origin, destination, undefined, true, options.shortest);
        return [];
    }

    const path = route.map(r => r.room);
    cacheRoute(origin, destination, path, false, options.shortest);
    return path;
}

function cacheRoute(from, to, route, failed = false, shortest = false) {
    const key = routeCacheKey(from, to, shortest);
    const entry = CACHE.ROUTE_CACHE[key] || {};
    entry.route = route || [];
    entry.failed = failed;
    entry.uses = (entry.uses || 0) + 1;
    entry.tick = Game.time;
    CACHE.ROUTE_CACHE[key] = entry;
}

function getRoute(from, to, options = {}) {
    const key = routeCacheKey(from, to, !!options.shortest);
    const cached = CACHE.ROUTE_CACHE[key];
    if (cached && Game.time < cached.tick + 500) {
        if (cached.failed) return 'failed';
        cached.uses++;
        return cached.route;
    }
    return null;
}

function deleteRoute(from, to) {
    delete CACHE.ROUTE_CACHE[routeCacheKey(from, to, false)];
    delete CACHE.ROUTE_CACHE[routeCacheKey(from, to, true)];
}

module.exports = {

    findRoute,

    cacheRoute,

    getRoute,

    deleteRoute,

    estimateClaimRouteTicks,

    routeWithinClaimTTL,

};