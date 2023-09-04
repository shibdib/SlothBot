/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

//Setup globals and prototypes
require("require");
let memWipe, running;
const tools = require("tools.misc");
const hive = require('main.hive');
const segments = require('module.segmentManager');
const cleanUp = require('module.cleanup');
const profiler = require('tools.profiler');
log.d('Global Reset - Last reset occurred ' + (Game.time - (Memory.lastGlobalReset || Game.time)) + ' ticks ago.');
Memory.lastGlobalReset = Game.time;

if (PROFILER_ENABLED) profiler.enable();
module.exports.loop = function () {
    profiler.wrap(function () {
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
                // Clean cache
                _.filter(INTEL, (r) => r.owner && r.owner === MY_USERNAME).forEach(function (r) {
                    if (!MY_ROOMS.includes(r.name)) delete INTEL[r.name];
                });
            }
        }

        // Initialize the INTEL cache
        if (!segments.retrieveIntel()) return;

        // Handle auto placing a spawn
        // Also handles respawns
        if (!running) {
            let ownedRoom = _.find(Game.rooms, (r) => r.controller && r.controller.owner && r.controller.my);
            let spawn = _.find(Game.structures, (s) => s.my && s.structureType === STRUCTURE_SPAWN);
            let creep = _.find(Game.creeps, (s) => s.my);
            if (Game.map.getRoomStatus(ownedRoom.name).status !== 'normal') global.ROOM_STATUS = 1;
            if (ownedRoom && (!spawn || (!creep && spawn.room.controller.level === 1 && !memWipe))) {
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

        // Handle Pixel Farming
        if (PIXEL_FARM && ['shard0', 'shard1', 'shard2', 'shard3'].includes(Game.shard.name)) {
            return require('module.pixelFarm').farm(Game.rooms[Object.keys(Game.rooms)[0]]);
        }

        try {
            // Handle pixel generation
            // Generate every 1500 ticks if enabled, no military operations, and we have a full bucket
            if (GENERATE_PIXELS && Memory.lastPixel + 100 < Game.time && ['shard0', 'shard1', 'shard2', 'shard3'].includes(Game.shard.name) && Game.cpu.bucket >= PIXEL_CPU_COST && !_.find(MY_ROOMS, (r) => INTEL[r] && INTEL[r].threatLevel)) {
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
    });
};

function resetMemory() {
    log.a('Resetting Memory');
    RawMemory.set('{}');
    Memory.creeps = {};
    Memory.rooms = {};
    Memory.flags = {};
    Memory.spawns = {};
}