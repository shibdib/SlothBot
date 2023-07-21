/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.cleanup = function () {
//CLEANUP
    if (RawMemory.segments[0] && _.size(RawMemory.segments[0]) > 75000) cleanPathCacheByUsage(); //clean path and distance caches
    if (Game.time % 100 === 0) {
        cleanDistanceCacheByUsage();
        //cleanRouteCacheByAge();
        cleanRouteCacheByUsage();
        cleanConstructionSites();
        cleanStructureMemory();
        cleanStructures();
    }
    if (Game.time % EST_TICKS_PER_DAY === 0) {
        cleanRoomIntel();
    }
    if (Game.time % 5 === 0) {
        for (let name in Memory.creeps) {
            if (!Game.creeps[name]) {
                delete Memory.creeps[name];
                delete CREEP_CPU_ARRAY[name];
            }
        }
        for (let name in Memory.flags) {
            if (!Game.flags[name]) {
                delete Memory.flags[name];
            }
        }
        let buggedCreep = _.filter(Game.creeps, (c) => !c.memory.role);
        for (let key in buggedCreep) {
            buggedCreep[key].suicide();
        }
    }
};

// Clean path cache by removing paths that haven't been used in 1000 ticks or fall below the average use count
function cleanPathCacheByUsage() {
    let paths;
    try {
        paths = _.sortBy(JSON.parse(RawMemory.segments[0]), 'uses');
    } catch (e) {
        return RawMemory.segments[0] = undefined;
    }
    let initial = _.size(paths);
    for (let key in paths) {
        if (_.size(paths) < 500) break;
        delete paths[key]
    }
    if (initial !== _.size(paths)) log.i('Cleaning Path cache (Deleted Appx. ' + ((initial - _.size(paths)) * 100) + ' KB)...');
    RawMemory.segments[0] = JSON.stringify(paths);
}

// Clean route cache by removing routes that haven't been used in 2500 ticks or fall below the average use count
function cleanRouteCacheByUsage() {
    if (Memory._routeCache && _.size(Memory._routeCache) > ROUTE_CACHE_SIZE) {
        let initial = _.size(Memory._routeCache);
        let averageUses = average(_.pluck(Memory._routeCache, 'uses'));
        for (let key in Memory._routeCache) {
            if (_.size(Memory._routeCache) < ROUTE_CACHE_SIZE - (ROUTE_CACHE_SIZE * 0.10)) break;
            if (Memory._routeCache[key].uses < averageUses || Memory._routeCache[key].tick + 2500 < Game.time) delete Memory._routeCache[key];
        }
        if (initial !== _.size(Memory._routeCache)) log.i('Cleaning Route cache (Deleted ' + (initial - _.size(Memory._routeCache)) + ')...');
    }
}

function cleanRouteCacheByAge() {
    if (Memory._routeCache) { //1500 entries ~= 100kB
        let initial = _.size(Memory._routeCache);
        for (let key in Memory._routeCache) {
            if (Memory._routeCache[key].created + 5000 < Game.time) delete Memory._routeCache[key];
        }
        if (initial !== _.size(Memory._routeCache)) log.i('Cleaning Route cache of old routes (Deleted ' + (initial - _.size(Memory._routeCache)) + ')...');
    }
}

function cleanDistanceCacheByUsage() {
    if (Memory._distanceCache) {  //1500 entries ~= 100kB
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
        if (Math.random() > 0.5 && (!Game.constructionSites[key].room || !Game.constructionSites[key].pos.findClosestByRange(FIND_MY_CREEPS)) &&
            Game.constructionSites[key].structureType !== STRUCTURE_SPAWN && Game.constructionSites[key].structureType !== STRUCTURE_EXTENSION && Game.constructionSites[key].structureType !== STRUCTURE_CONTAINER && Game.constructionSites[key].structureType !== STRUCTURE_ROAD) {
            Game.constructionSites[key].remove();
        }
    }
}

function cleanRoomIntel() {
    if (Memory.roomCache) {
        let startLength = _.size(Memory.roomCache);
        Object.keys(Memory.roomCache).forEach((r) => {
            let cachedTime = Memory.roomCache[r].cached;
            if (cachedTime + 10000 < Game.time || (cachedTime + 20000 < Game.time && r.important) || (r.closestRange > 10 && cachedTime + 5000 < Game.time)) delete Memory.roomCache[r];
        });
        if (startLength > _.size(Memory.roomCache)) log.d('CleanUp: Room Cache now has ' + _.size(Memory.roomCache) + ' entries.')
    }
}

function cleanStructureMemory() {
    if (Memory.structureMemory) {
        Memory.structureMemory = undefined;
    } else if (Memory.myRooms && Memory.myRooms.length) {
        for (let room of Memory.myRooms) {
            if (Game.rooms[room].memory.structureMemory) {
                for (let structure of Object.keys(Game.rooms[room].memory.structureMemory)) {
                    if (!Game.getObjectById(structure)) Game.rooms[room].memory.structureMemory[structure] = undefined;
                }
            }
        }
    }
}

function cleanStructures() {
    for (let structure of _.filter(Game.structures)) {
        if (structure.room.controller && (!structure.room.controller.owner || structure.room.controller.owner.username !== MY_USERNAME) && !structure.isActive()) structure.destroy();
    }
}