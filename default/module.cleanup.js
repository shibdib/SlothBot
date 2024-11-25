/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

module.exports.cleanup = function () {
//CLEANUP
    if (Game.time % 100 === 0) {
        cleanDistanceCacheByUsage();
        cleanConstructionSites();
        cleanStructureMemory();
        cleanStructures();
    }
    if (Game.time % EST_TICKS_PER_DAY === 0) {
        //cleanRoomIntel();
    }
    if (Game.time % 5 === 0) {
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
        let buggedCreep = _.filter(Game.creeps, (c) => !c.memory.role);
        for (let key in buggedCreep) {
            buggedCreep[key].suicide();
        }
    }
};

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
    if (INTEL) {
        let startLength = _.size(INTEL);
        Object.keys(INTEL).forEach((r) => {
            let cachedTime = INTEL[r].cached;
            if (cachedTime + 10000 < Game.time || (cachedTime + 20000 < Game.time && r.important) || (findClosestOwnedRoom(r.name, true) > 10 && cachedTime + 5000 < Game.time)) delete INTEL[r];
        });
        if (startLength > _.size(INTEL)) log.d('CleanUp: Room Cache now has ' + _.size(INTEL) + ' entries.')
    }
}

function cleanStructureMemory() {
    if (Memory.structureMemory) {
        Memory.structureMemory = undefined;
    } else {
        for (let room of MY_ROOMS) {
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