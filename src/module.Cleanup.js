const profiler = require('screeps-profiler');

function cleanup() {
//CLEANUP
    if (Game.time % 50 === 0) {
        cleanPathCacheByUsage(); //clean path and distance caches
        cleanDistanceCacheByUsage();
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
    for (let key in Memory.rooms) {
        let activeRoom = Memory.rooms[key];
        if (activeRoom && activeRoom.pathCache && _.size(activeRoom.pathCache) > 300) {
            let sorted = _.sortBy(activeRoom.pathCache, 'uses');
            let overage = (_.size(activeRoom.pathCache) - 300);
            log.i('Cleaning Path cache for ' + key + ' (Over max size by ' + overage + ')...');
            activeRoom.pathCache = _.slice(sorted, overage, _.size(activeRoom.pathCache));
        }
    }
}

function cleanDistanceCacheByUsage() {
    if(Memory.distanceCache && _.size(Memory.distanceCache) > 1500) { //1500 entries ~= 100kB
        let sorted = _.sortBy(Memory.distanceCache, 'uses');
        let overage = (_.size(Memory.distanceCache) - 1500) + 100;
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
        if (Memory.roomCache[key].cached + 5000 < Game.time) delete Memory.roomCache[key];
    }
    for (let key in Memory.rooms) {
        if (!Memory.rooms[key].extensionHub && (!Memory.rooms[key].reservationExpires || Memory.rooms[key].reservationExpires < Game.time)) delete Memory.rooms[key];
    }
}