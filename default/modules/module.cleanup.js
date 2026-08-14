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

function cleanConstructionSites() {
    for (let id in Game.constructionSites) {
        const site = Game.constructionSites[id];
        const room = site.room;
        // Never purge barrier / spawn / tower sites — perimeter gaps and bootstrap must stick.
        if (site.structureType === STRUCTURE_RAMPART ||
            site.structureType === STRUCTURE_WALL ||
            site.structureType === STRUCTURE_SPAWN ||
            site.structureType === STRUCTURE_TOWER) {
            continue;
        }
        if (room && room.controller && room.controller.my && site.progress > 0) continue;
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