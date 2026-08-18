/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

module.exports.cleanup = function () {
    let since = global.ticksSinceLastGlobalReset ? global.ticksSinceLastGlobalReset() : 99;
    // Defer heavy cleans until ~50 ticks after reset (cold caches + other systems spiking)
    if (Game.time % 100 === 0 && since > 50) {
        cleanDistanceCacheByUsage();
        cleanConstructionSites();
        cleanStructureMemory();
        cleanStructures();
        cleanPathingCaches();
        if (Memory.errorLogs && Memory.errorLogs.length > 50) Memory.errorLogs = Memory.errorLogs.slice(-50);
    }
    since = global.ticksSinceLastGlobalReset ? global.ticksSinceLastGlobalReset() : 99;
    // Defer Memory.creeps/flags sweeps for ~25 ticks after reset
    if (Game.time % 5 === 0 && since > 25) {
        for (let name in Memory.creeps) {
            if (!Game.creeps[name]) {
                delete Memory.creeps[name];
            }
        }

        for (let name in Memory.flags) {
            if (!Game.flags[name]) {
                delete Memory.flags[name];
            }
        }
    }
};

function cleanDistanceCacheByUsage() {
    if (!Memory._distanceCache) return;

    let cache;
    try {
        cache = JSON.parse(Memory._distanceCache);
    } catch (e) {
        delete Memory._distanceCache;
        return;
    }

    if (_.size(cache) < 5000) return;

    const sorted = _.sortBy(cache, "uses");
    const overage = _.size(cache) - 2000 + 250;
    log.i(`Cleaning Distance cache (Over max size by ${overage})...`);
    Memory._distanceCache = JSON.stringify(_.slice(sorted, overage));
}

function isOwnedSiteRoom(room, roomName) {
    if (room && room.controller && room.controller.my) return true;
    return typeof MY_ROOMS !== 'undefined' && MY_ROOMS && roomName && MY_ROOMS.includes(roomName);
}

function isActiveRemoteRoom(roomName) {
    if (!roomName || typeof INTEL === 'undefined' || !INTEL[roomName]) return false;
    const activeAt = INTEL[roomName].activeRemote;
    if (!activeAt) return false;
    const window = typeof CREEP_LIFE_TIME === 'number' ? CREEP_LIFE_TIME : 1500;
    return activeAt + window > Game.time;
}

// Sites the planner (or remote builders) immediately re-queue on the same tile.
// Randomly deleting these just flickers the same construction site forever.
const STICKY_SITE_TYPES = {
    [STRUCTURE_RAMPART]: true,
    [STRUCTURE_WALL]: true,
    [STRUCTURE_SPAWN]: true,
    [STRUCTURE_TOWER]: true,
    [STRUCTURE_EXTENSION]: true,
    [STRUCTURE_CONTAINER]: true,
    [STRUCTURE_LINK]: true,
    [STRUCTURE_STORAGE]: true,
    [STRUCTURE_TERMINAL]: true,
    [STRUCTURE_EXTRACTOR]: true,
    [STRUCTURE_LAB]: true,
};

function cleanConstructionSites() {
    for (let id in Game.constructionSites) {
        const site = Game.constructionSites[id];
        const room = site.room;
        const roomName = site.pos && site.pos.roomName;
        if (STICKY_SITE_TYPES[site.structureType]) continue;
        // Owned rooms: the planner owns this queue. Do not randomly evict idle roads.
        if (isOwnedSiteRoom(room, roomName)) continue;
        if (site.progress > 0) continue;
        // Still-mined remotes: remoteBuilder / harvesters will put the same road back.
        if (isActiveRemoteRoom(roomName)) continue;
        if (
            Math.random() > 0.5 &&
            (!room || !site.pos.findClosestByRange(FIND_MY_CREEPS))
        ) {
            site.remove();
        }
    }
}

function cleanStructureMemory() {
    if (Memory.structureMemory) {
        delete Memory.structureMemory;
    }

    for (let i = 0; i < MY_ROOMS.length; i++) {
        const room = Game.rooms[MY_ROOMS[i]];
        if (room && room.memory) {
            const memKeys = ['structureMemory', '_structureMemory'];
            for (let key of memKeys) {
                if (room.memory[key]) {
                    for (let structureId in room.memory[key]) {
                        if (!Game.getObjectById(structureId)) {
                            delete room.memory[key][structureId];
                        }
                    }
                    if (_.isEmpty(room.memory[key])) delete room.memory[key];
                }
            }
        }
    }
}

function cleanStructures() {
    const structures = [];
    for (let r of MY_ROOMS) {
        let room = Game.rooms[r];
        if (room && room.controller && (!room.controller.owner || room.controller.owner.username !== MY_USERNAME)) {
            for (let s of room.structures) {
                if (!s.isActive()) structures.push(s);
            }
        }
    }

    for (let i = 0; i < structures.length; i++) {
        structures[i].destroy();
    }
}

const cleanPathingCaches = () => {
    const now = Game.time;
    const {ROUTE_TTL, ROUTE_DISTANCE_TTL} = require('pathRoute');
    const routeCache = CACHE.ROUTE_CACHE;
    const pathCache = CACHE.PATH_CACHE;
    const distanceCache = CACHE.ROUTE_DISTANCE;

    for (let key in routeCache) {
        if (now - routeCache[key].tick > ROUTE_TTL) {
            delete routeCache[key];
        }
    }
    if (distanceCache) {
        for (let key in distanceCache) {
            if (now - distanceCache[key].tick > ROUTE_DISTANCE_TTL) {
                delete distanceCache[key];
            }
        }
    }
    for (let key in pathCache) {
        if (now - pathCache[key].tick > 50) {
            delete pathCache[key];
        }
    }
};