const profiler = require('screeps-profiler');

function cleanup() {
//CLEANUP
    if (Game.time % 25 === 0) {
        cleanPathCacheByUsage(); //clean path and distance caches
        //cleanPathCacheByAge();
        cleanDistanceCacheByUsage();
        cleanRouteCacheByAge();
        cleanRouteCacheByUsage();
        cleanConstructionSites();
        cleanRoomIntel();
    }
    if (Game.time % EST_TICKS_PER_DAY === 0) {
        delete Memory._pathCache;
        delete Memory._distanceCache;
    }
    for (let name in Memory.creeps) {
        if (!Game.creeps[name]) {
            delete Memory.creeps[name];
            delete creepCpuArray[name];
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
    if (Memory._pathCache) { //1500 entries ~= 100kB
        if (_.size(Memory._pathCache) > 1000) {
            let sorted = _.sortBy(Memory._pathCache, 'uses');
            let overage = (_.size(Memory._pathCache) - 1000) + 100;
            log.i('Cleaning Path cache (Over max size by ' + overage + ')...');
            Memory._pathCache = _.slice(sorted, overage, _.size(Memory._pathCache));
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
        if (prunedCount) log.i('Cleaning Path cache (Removed ' + prunedCount + ' old paths.)');
        Memory.pathCache = cache;
    }
}

function cleanRouteCacheByUsage() {
    if (Memory._routeCache && _.size(Memory._routeCache) > 500) { //1500 entries ~= 100kB
        let sorted = _.sortBy(Memory._routeCache, 'uses');
        let overage = (_.size(Memory._routeCache) - 500) + 75;
        log.i('Cleaning Route cache (Over max size by ' + overage + ')...');
        Memory._routeCache = _.slice(sorted, overage, _.size(Memory._routeCache));
    }
}

function cleanRouteCacheByAge() {
    if (Memory._routeCache) { //1500 entries ~= 100kB
        let originalCount = Memory._routeCache.length;
        let cache = Memory._routeCache;
        for (let key in cache) {
            if (cache[key].tick + 10000 < Game.time) {
                delete cache[key];
            }
        }
        let prunedCount = originalCount - cache.length;
        if (prunedCount) log.i('Cleaning Route cache (Removed ' + prunedCount + ' old routes.)');
        Memory._routeCache = cache;
    }
}

function cleanDistanceCacheByAge() {
    if (Memory._distanceCache) { //1500 entries ~= 100kB
        let originalCount = Memory._distanceCache.length;
        let cache = Memory._distanceCache;
        for (let key in cache) {
            if (cache[key].tick + 100 < Game.time) {
                delete cache[key];
            }
        }
        let prunedCount = originalCount - cache.length;
        if (prunedCount) log.i('Cleaning Distance cache (Removed ' + prunedCount + ' old routes.)');
        Memory._distanceCache = cache;
    }
}

function cleanDistanceCacheByUsage() {
    if (Memory._distanceCache) { //1500 entries ~= 100kB
        let cache;
        try {
            cache = JSON.parse(Memory._distanceCache);
        } catch (e) {
            return delete Memory._distanceCache;
        }
        if (_.size(cache) < 5000) return;
        let sorted = _.sortBy(Memory._distanceCache, 'uses');
        let overage = (_.size(Memory._distanceCache) - 2000) + 250;
        log.i('Cleaning Distance cache (Over max size by ' + overage + ')...');
        Memory._distanceCache = _.slice(sorted, overage, _.size(Memory._distanceCache));
    }
}

function cleanConstructionSites() {
    for (let key in Game.constructionSites) {
        if ((!Game.constructionSites[key].room || !Game.constructionSites[key].pos.findClosestByRange(FIND_MY_CREEPS)) &&
            Game.constructionSites[key].structureType !== STRUCTURE_SPAWN && Game.constructionSites[key].structureType !== STRUCTURE_EXTENSION &&
            Game.constructionSites[key].structureType !== STRUCTURE_CONTAINER && Game.constructionSites[key].progress < Game.constructionSites[key].progressTotal * 0.5) {
            Game.constructionSites[key].remove();
        }
    }
}

function cleanRoomIntel() {
    for (let key in Memory.roomCache) {
        if (Memory.roomCache[key].cached + 10000 < Game.time) delete Memory.roomCache[key];
    }
}