/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Multi-room route discovery and route cache.

 */


const {NO_RAMPART_CODE} = require('pathState');

function findRoute(origin, destination, options = {}) {
    if (origin === destination) return [origin];
    _.defaults(options, {useCache: true});

    const cacheKey = `${origin}_${destination}`;
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
        routeCallback: (roomName) => {
            if (roomName === origin || roomName === destination) return 1;
            const intel = INTEL[roomName];
            const rStatus = roomStatus(roomName);
            if (rStatus === 'closed' || (intel && !intel.isHighway && rStatus !== roomStatus(origin))) return Infinity;
            if (Memory.avoidRooms?.includes(roomName)) return 250;
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
    });

    const path = route.length ? route.map(r => r.room) : [];
    cacheRoute(origin, destination, path.length ? path : undefined, !path.length);
    return path;
}


function cacheRoute(from, to, route, failed = false) {
    const key = `${from}_${to}`;
    const entry = CACHE.ROUTE_CACHE[key] || {};
    entry.route = route || [];
    entry.failed = failed;
    entry.uses = (entry.uses || 0) + 1;
    entry.tick = Game.time;
    CACHE.ROUTE_CACHE[key] = entry;
}

function getRoute(from, to) {
    const key = `${from}_${to}`;
    const cached = CACHE.ROUTE_CACHE[key];
    if (cached && Game.time < cached.tick + 500) {
        if (cached.failed) return 'failed';
        cached.uses++;
        return cached.route;
    }
    return null;
}

function deleteRoute(from, to) {
    delete CACHE.ROUTE_CACHE[`${from}_${to}`];
}

module.exports = {

    findRoute,

    cacheRoute,

    getRoute,

    deleteRoute,

};