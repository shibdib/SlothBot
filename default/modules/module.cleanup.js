/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

module.exports.cleanup = function () {
    if (Game.time % 100 === 0) {
        cleanDistanceCacheByUsage();
        cleanConstructionSites();
        cleanStructureMemory();
        cleanStructures();
    }
    if (Game.time % EST_TICKS_PER_DAY === 0) {
        // Uncomment to enable: cleanRoomIntel();
    }
    if (Game.time % 5 === 0) {
        // Cleanup old creep memory
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

        // Suicide bugged creeps
        const buggedCreeps = _.filter(Game.creeps, function (c) {
            return !c.memory || !c.memory.role;
        });
        for (let i = 0; i < buggedCreeps.length; i++) {
            buggedCreeps[i].suicide();
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
        if (
            Math.random() > 0.5 &&
            (!site.room || !site.pos.findClosestByRange(FIND_MY_CREEPS)) &&
            site.structureType !== STRUCTURE_SPAWN &&
            site.structureType !== STRUCTURE_EXTENSION &&
            site.structureType !== STRUCTURE_CONTAINER &&
            site.structureType !== STRUCTURE_ROAD
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
            delete INTEL[roomName];
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
        return;
    }

    for (let i = 0; i < MY_ROOMS.length; i++) {
        const room = Game.rooms[MY_ROOMS[i]];
        if (room && room.memory && room.memory.structureMemory) {
            for (let structureId in room.memory.structureMemory) {
                if (!Game.getObjectById(structureId)) {
                    delete room.memory.structureMemory[structureId];
                }
            }
        }
    }
}

function cleanStructures() {
    const structures = _.filter(Game.structures, function (s) {
        return (
            s.room.controller &&
            (!s.room.controller.owner || s.room.controller.owner.username !== MY_USERNAME) &&
            !s.isActive()
        );
    });

    for (let i = 0; i < structures.length; i++) {
        structures[i].destroy();
    }
}
