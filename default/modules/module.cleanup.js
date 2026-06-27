/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

module.exports.cleanup = function () {
    let since = global.ticksSinceLastGlobalReset ? global.ticksSinceLastGlobalReset() : 99;
    if (Game.time % 100 === 0 && since > 50) {
        // Defer heavy cleans (JSON parse of distance cache, loop large constructionSites, structureMemory, pathCaches after segment parse) on first 2 ticks after reset
        cleanDistanceCacheByUsage();
        cleanConstructionSites();
        cleanStructureMemory();
        cleanStructures();
        cleanPathingCaches();
        if (Memory.errorLogs && Memory.errorLogs.length > 50) Memory.errorLogs = Memory.errorLogs.slice(-50);
    }
    if (Game.time % EST_TICKS_PER_DAY === 0) {
        // Uncomment to enable: cleanRoomIntel();
    }
    since = global.ticksSinceLastGlobalReset ? global.ticksSinceLastGlobalReset() : 99;
    if (Game.time % 5 === 0 && since > 25) {
        // Cleanup old creep memory
        // Defer on first 2 ticks after reset (looping potentially large Memory.creeps/flags can cost CPU)
        for (let name in Memory.creeps) {
            if (!Game.creeps[name]) {
                delete Memory.creeps[name];
            }
        }

        // Cleanup old flag memory
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
        if (room && room.controller && room.controller.my && site.progress > 0) continue;
        if (
            Math.random() > 0.5 &&
            (!room || !site.pos.findClosestByRange(FIND_MY_CREEPS))
        ) {
            site.remove();
        }
    }
}

// Uncomment to use this function when necessary
function cleanRoomIntel() {
    if (!INTEL) return;

    const startLength = _.size(INTEL);
    for (let roomName in INTEL) {
        const intel = INTEL[roomName];
        if (
            intel.cached + 10000 < Game.time ||
            (intel.cached + 20000 < Game.time && intel.important) ||
            (findClosestOwnedRoom(roomName, true) > 10 && intel.cached + 5000 < Game.time)
        ) {
        }
    }

    const newLength = _.size(INTEL);
    if (startLength > newLength) {
        log.d(`CleanUp: Room Cache now has ${newLength} entries.`);
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
    const routeCache = CACHE.ROUTE_CACHE;
    const pathCache = CACHE.PATH_CACHE;

    for (let key in routeCache) {
        if (now - routeCache[key].tick > 500) {
            delete routeCache[key];
        }
    }
    for (let key in pathCache) {
        if (now - pathCache[key].tick > 200) {
            delete pathCache[key];
        }
    }
};