const profiler = require('screeps-profiler');

function cleanup() {
//CLEANUP
    if (Game.time % 100 === 0) {
        cleanPathCacheByUsage(); //clean path and distance caches
        cleanDistanceCacheByUsage();
    }
    if (Game.time % EST_TICKS_PER_DAY === 0) Memory.pathCache = undefined;
    for (let name in Memory.creeps) {
        if (!Game.creeps[name]) {
            delete Memory.creeps[name];
        }
    }
}
module.exports.cleanup = profiler.registerFN(cleanup, 'cleanup');

function cleanPathCacheByUsage() {
    for (let key in Memory.ownedRooms) {
        let activeRoom = Memory.ownedRooms[key];
        if (activeRoom.memory.pathCache && _.size(activeRoom.memory.pathCache) > 375) { 
            let sorted = _.sortBy(activeRoom.memory.pathCache, 'uses');
            let overage = (_.size(activeRoom.memory.pathCache) - 375) + 100;
            console.log('Cleaning Path cache for ' + activeRoom.name + ' (Over max size by ' + overage + ')...');
            activeRoom.memory.pathCache = _.slice(sorted, overage, _.size(activeRoom.memory.pathCache));
        }
    }
}

function cleanDistanceCacheByUsage() {
    if(Memory.distanceCache && _.size(Memory.distanceCache) > 1500) { //1500 entries ~= 100kB
        let sorted = _.sortBy(Memory.distanceCache, 'uses');
        let overage = (_.size(Memory.distanceCache) - 1500) + 100;
        console.log('Cleaning Distance cache (Over max size by '+overage+')...');
        Memory.distanceCache = _.slice(sorted, overage, _.size(Memory.distanceCache));
    }
}