/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

//modules
//Setup globals and prototypes
require("require");
let tools = require("tools.misc");
let hive = require('main.hive');
let cleanUp = require('module.cleanup');
log.e('Global Reset - Last reset occurred ' + (Game.time - (Memory.lastGlobalReset || Game.time)) + ' ticks ago.');
Memory.lastGlobalReset = Game.time;

module.exports.loop = function () {
    // Misc Tools
    tools.CPULimits();
    tools.memHack();
    tools.tickLength();
    tools.cleanMemory();
    tools.status();

    //Bucket Cool down Check
    if (Memory.cpuTracking && Memory.cpuTracking.cooldown) {
        if (Memory.cpuTracking.cooldown + 25 < Game.time || Game.cpu.bucket > BUCKET_MAX * 0.9) {
            delete Memory.cpuTracking.cooldown;
        } else {
            let countDown = (Memory.cpuTracking.cooldown + 25) - Game.time;
            log.e('On CPU Cooldown For ' + countDown + ' more ticks. Current Bucket ' + Game.cpu.bucket);
            return;
        }
    } else {
        if (!Memory.cpuTracking) Memory.cpuTracking = {};
        if (Game.cpu.bucket < BUCKET_MAX * 0.2) {
            Memory.cpuTracking.cooldown = Game.time;
            log.e('CPU Bucket Too Low - Cooldown Initiated');
            return;
        }
    }

    // Update allies
    populateLOANlist();

    // Cleanup Modules
    cleanUp.cleanup();

    // Store owned rooms in array
    if (!Memory.myRooms || !Memory.myRooms.length || Game.time % 5 === 0) {
        let myRooms = _.filter(Game.rooms, (r) => r.controller && r.controller.owner && r.controller.my);
        if (myRooms.length) {
            Memory.myRooms = _.pluck(myRooms, '.name');
            Memory.maxLevel = _.max(myRooms, 'controller.level').controller.level;
            Memory.minLevel = _.min(myRooms, 'controller.level').controller.level;
        }
    }

    //Hive Mind
    if (Memory.myRooms && Memory.myRooms.length) hive.hiveMind();
};

// Abandon a room
abandon = function (room) {
    if (!Game.rooms[room] || !Game.rooms[room].memory.bunkerHub) return log.e(room + ' does not appear to be owned by you.');
    let overlordFor = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === room);
    if (overlordFor.length) {
        for (let key in overlordFor) {
            overlordFor[key].suicide();
        }
    }
    for (let key in Game.rooms[room].structures) {
        Game.rooms[room].structures[key].destroy();
    }
    for (let key in Game.rooms[room].constructionSites) {
        Game.rooms[room].constructionSites[key].remove();
    }
    let noClaim = Memory.noClaim || [];
    noClaim.push(room);
    delete Game.rooms[room].memory;
    Game.rooms[room].cacheRoomIntel(true);
    Memory.roomCache[room].noClaim = Game.time + 10000;
    Game.rooms[room].controller.unclaim();
};

// Get nukes in range
nukes = function (target) {
    let nukes = _.filter(Game.structures, (s) => s.structureType === STRUCTURE_NUKER && !s.store.getFreeCapacity(RESOURCE_ENERGY) && !s.store.getFreeCapacity(RESOURCE_GHODIUM) && !s.cooldown);
    if (target) nukes = _.filter(Game.structures, (s) => s.structureType === STRUCTURE_NUKER && !s.store.getFreeCapacity(RESOURCE_ENERGY) && !s.store.getFreeCapacity(RESOURCE_GHODIUM) && !s.cooldown && Game.map.getRoomLinearDistance(s.room.name, target) <= 10);
    if (!nukes.length && !target) return log.a('No nukes available');
    if (!nukes.length && target) return log.a('No nukes available in range of ' + target);
    for (let key in nukes) {
        if (target) log.a(nukes[key].room.name + ' has a nuclear missile available that is in range of ' + target);
        if (!target) log.a(nukes[key].room.name + ' has a nuclear missile available.')
    }
};

cpuUsage = function () {
    if (_.size(CREEP_ROLE_CPU)) {
        log.a('--CREEP ROLE INFO--', ' ');
        for (let role of Object.keys(CREEP_ROLE_CPU)) {
            log.e(role + ': ' + CREEP_ROLE_CPU[role] + ' (x' + _.filter(Game.creeps, (c) => c.my && c.memory.role === role).length + ')', ' ')
        }
    }
    if (_.size(ROOM_TASK_CPU_ARRAY)) {
        log.a('--TASK INFO--', ' ');
        for (let task of Object.keys(ROOM_TASK_CPU_ARRAY)) {
            log.e(task + ': ' + average(ROOM_TASK_CPU_ARRAY[task]), ' ')
        }
    }
}
function wrapLoop(fn) {
    let memory;
    let tick;

    return () => {
        if (tick && tick + 1 === Game.time && memory) {
            // this line is required to disable the default Memory deserialization
            delete global.Memory;
            Memory = memory;
        } else {
            memory = Memory;
        }

        tick = Game.time;

        fn();

        // there are two ways of saving Memory with different advantages and disadvantages
        // 1. RawMemory.set(JSON.stringify(Memory));
        // + ability to use custom serialization method
        // - you have to pay for serialization
        // - unable to edit Memory via Memory watcher or console
        // 2. RawMemory._parsed = Memory;
        // - undocumented functionality, could get removed at any time
        // + the server will take care of serialization, it doesn't cost any CPU on your site
        // + maintain full functionality including Memory watcher and console

        // this implementation uses the official way of saving Memory
        //RawMemory.set(JSON.stringify(Memory));

        RawMemory._parsed = Memory;
    };
}