/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

//Setup globals and prototypes
require("require");
let memWipe, running;
let tools = require("tools.misc");
let hive = require('main.hive');
let segments = require('module.segmentManager');
let cleanUp = require('module.cleanup');
log.e('Global Reset - Last reset occurred ' + (Game.time - (Memory.lastGlobalReset || Game.time)) + ' ticks ago.');
Memory.lastGlobalReset = Game.time;

module.exports.loop = function () {
    //Bucket Cool down Check
    if (Memory.cpuTracking && Memory.cpuTracking.cooldown) {
        if (Memory.cpuTracking.cooldown + 25 < Game.time || Game.cpu.bucket > BUCKET_MAX * 0.05) {
            delete Memory.cpuTracking.cooldown;
        } else {
            let countDown = (Memory.cpuTracking.cooldown + 25) - Game.time;
            log.e('On CPU Cooldown For ' + countDown + ' more ticks or until the bucket reaches ' + BUCKET_MAX * 0.05 + '. Current Bucket ' + Game.cpu.bucket);
            return;
        }
    } else {
        if (!Memory.cpuTracking) Memory.cpuTracking = {};
        if (Game.cpu.bucket < BUCKET_MAX * 0.05) {
            Memory.cpuTracking.cooldown = Game.time;
            log.e('CPU Bucket Too Low - Cooldown Initiated');
            return;
        }
    }

    // Store owned rooms in array
    if (!MY_ROOMS || !MY_ROOMS.length || Game.time % 5 === 0) {
        let myRooms = _.filter(Game.rooms, (r) => r.controller && r.controller.owner && r.controller.my);
        if (myRooms.length) {
            global.MY_ROOMS = _.pluck(myRooms, '.name');
            global.MAX_LEVEL = _.max(myRooms, 'controller.level').controller.level;
            global.MIN_LEVEL = _.min(myRooms, 'controller.level').controller.level;
            // TODO: REMOVE THESE
            Memory.myRooms = undefined;
            Memory.maxLevel = undefined;
            Memory.minLevel = undefined;
            // Clean cache
            _.filter(INTEL, (r) => r.owner && r.owner === MY_USERNAME).forEach(function (r) {
                if (!MY_ROOMS.includes(r.name)) delete INTEL[r.name];
            });
        }
    }

    // Initialize the INTEL cache
    if (!segments.retrieveIntel()) return;

    // Handle auto placing a spawn
    if (!running) {
        let ownedRoom = _.find(Game.rooms, (r) => r.controller && r.controller.owner && r.controller.my);
        let spawn = _.find(Game.structures, (s) => s.my && s.structureType === STRUCTURE_SPAWN);
        let creep = _.find(Game.creeps, (s) => s.my);
        if (ownedRoom && !spawn && !creep) {
            if (!memWipe) {
                resetMemory();
                memWipe = true;
                return;
            }
            require('module.roomPlanner').buildRoom(ownedRoom);
            return;
        } else if (spawn) running = true;
        return;
    }

    try {
        // Handle pixel generation
        // Generate every 1500 ticks if enabled, no military operations, and we have a full bucket
        if (GENERATE_PIXELS && ['shard0', 'shard1', 'shard2', 'shard3'].includes(Game.shard.name) && !_.find(Memory.targetRooms, (r) => r && r.operation !== 'pending') && Memory.lastPixel + 100 * MY_ROOMS.length < Game.time && Game.cpu.bucket === BUCKET_MAX) {
            log.a('Pixel Generated');
            Game.cpu.generatePixel();
            return Memory.lastPixel = Game.time;
        } else if (!Memory.lastPixel) Memory.lastPixel = Game.time;

        // Misc Tools
        tools.CPULimits();
        tools.tickLength();
        tools.cleanMemory();
        tools.status();
        //tools.memHack();
        // Update allies
        populateLOANlist();
        // Cleanup Modules
        cleanUp.cleanup();
    } catch (e) {
        log.e('Error with a main tool function');
        log.e(e + ' ' + e.stack);
        Game.notify(e + ' ' + e.stack);
    }

    //Hive Mind
    hive.hiveMind();

    // Save Intel Cache
    segments.storeIntel();
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
    delete Game.rooms[room].memory;
    Game.rooms[room].cacheRoomIntel(true);
    INTEL[room].noClaim = Game.time + 10000;
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
};

intel = function (roomName) {
    if (!INTEL[roomName]) return log.e('No intel for ' + roomName);
    log.a('--INTEL FOR ' + roomName + '--', ' ');
    for (let key in INTEL[roomName]) {
        log.e(key + ': ' + INTEL[roomName][key], ' ');
    }
}

function resetMemory() {
    log.a('Resetting Memory');
    RawMemory.set('{}');
    Memory.creeps = {};
    Memory.rooms = {};
    Memory.flags = {};
    Memory.spawns = {};
}