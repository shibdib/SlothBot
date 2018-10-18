const profiler = require('screeps-profiler');

function cleanup() {
//CLEANUP
    if (Game.time % 50 === 0) {
        cleanPathCacheByUsage(); //clean path and distance caches
        cleanPathCacheByAge();
        cleanDistanceCacheByAge();
        cleanRouteCacheByAge();
        cleanRouteCacheByUsage();
        cleanConstructionSites();
        cleanRoomIntel();
    }
    if (Game.time % EST_TICKS_PER_DAY === 0) delete Memory.pathCache;
    for (let name in Memory.creeps) {
        if (!Game.creeps[name]) {
            delete Memory.creeps[name];
        }
    }
    for(let name in Memory.flags) {
        if(!Game.flags[name]) {
            delete Memory.flags[name];
        }
    }
    let buggedCreep = _.filter(Game.creeps, (c) => !c.memory.role);
    for (let key in buggedCreep) {
        buggedCreep[key].suicide();
    }
}
module.exports.cleanup = profiler.registerFN(cleanup, 'cleanup');

function cleanPathCacheByUsage() {
    if (Memory.pathCache) { //1500 entries ~= 100kB
        if (_.size(Memory.pathCache) > 750) {
            let sorted = _.sortBy(Memory.pathCache, 'uses');
            let overage = (_.size(Memory.pathCache) - 750) + 50;
            log.i('Cleaning Path cache for ' + key + ' (Over max size by ' + overage + ')...');
            Memory.pathCache = _.slice(sorted, overage, _.size(Memory.pathCache));
        }
    }
}

function cleanPathCacheByAge() {
    if (Memory.pathCache) { //1500 entries ~= 100kB
        let originalCount = Memory.pathCache.length;
        let cache = Memory.pathCache;
        for (let key in cache) {
            if (cache[key].tick + 7500 < Game.time) {
                delete cache[key];
            }
        }
        let prunedCount = originalCount - cache.length;
        if (prunedCount) log.i('Cleaning PAth cache (Removed ' + prunedCount + ' old paths.)');
        Memory.pathCache = cache;
    }
}

function cleanRouteCacheByUsage() {
    if (Memory.routeCache && _.size(Memory.routeCache) > 100) { //1500 entries ~= 100kB
        let sorted = _.sortBy(Memory.routeCache, 'uses');
        let overage = (_.size(Memory.routeCache) - 100) + 10;
        log.i('Cleaning Route cache (Over max size by ' + overage + ')...');
        Memory.routeCache = _.slice(sorted, overage, _.size(Memory.routeCache));
    }
}

function cleanRouteCacheByAge() {
    if (Memory.routeCache) { //1500 entries ~= 100kB
        let originalCount = Memory.routeCache.length;
        let cache = Memory.routeCache;
        for (let key in cache) {
            if (cache[key].tick + 4500 < Game.time) {
                delete cache[key];
            }
        }
        let prunedCount = originalCount - cache.length;
        if (prunedCount) log.i('Cleaning Route cache (Removed ' + prunedCount + ' old routes.)');
        Memory.routeCache = cache;
    }
}

function cleanDistanceCacheByAge() {
    if (Memory.distanceCache) { //1500 entries ~= 100kB
        let originalCount = Memory.distanceCache.length;
        let cache = Memory.distanceCache;
        for (let key in cache) {
            if (cache[key].tick + 100 < Game.time) {
                delete cache[key];
            }
        }
        let prunedCount = originalCount - cache.length;
        if (prunedCount) log.i('Cleaning Distance cache (Removed ' + prunedCount + ' old routes.)');
        Memory.distanceCache = cache;
    }
}

function cleanDistanceCacheByUsage() {
    if (Memory.distanceCache && _.size(Memory.distanceCache) > 400) { //1500 entries ~= 100kB
        let sorted = _.sortBy(Memory.distanceCache, 'uses');
        let overage = (_.size(Memory.distanceCache) - 400) + 100;
        log.i('Cleaning Distance cache (Over max size by '+overage+')...');
        Memory.distanceCache = _.slice(sorted, overage, _.size(Memory.distanceCache));
    }
}

function cleanConstructionSites() {
    for (let key in Game.constructionSites) {
        if ((!Game.constructionSites[key].room || !Game.constructionSites[key].pos.findClosestByRange(FIND_MY_CREEPS)) && Game.constructionSites[key].structureType !== STRUCTURE_SPAWN && Game.constructionSites[key].structureType !== STRUCTURE_EXTENSION) {
            Game.constructionSites[key].remove();
        }
    }
}

function cleanRoomIntel() {
    for (let key in Memory.roomCache) {
        if (Memory.roomCache[key].cached + 10000 < Game.time) delete Memory.roomCache[key];
    }
    for (let key in Memory.rooms) {
        if (!Memory.rooms[key].extensionHub && (!Memory.rooms[key].reservationExpires || Memory.rooms[key].reservationExpires < Game.time)) delete Memory.rooms[key];
    }
}