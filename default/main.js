/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

//Setup globals and prototypes
require("require");
let memWipe, running;
const tools = require("tools.misc");
const world = require('main.world');
const segments = require('module.segmentManager');
const cleanUp = require('module.cleanup');
const profiler = require('tools.profiler');
let counter = 0;

if (PROFILER_ENABLED) profiler.enable();
module.exports.loop = function () {
    try {
        profiler.wrap(function () {
            // Memhack Initialization
            tryInitSameMemory();

            // Purge broken owner refs before any room.find() rebuilds driver FIND caches.
            if (global.purgeCorruptOwnedStructures) global.purgeCorruptOwnedStructures();

            // CPU Bucket Cooldown Check
            if (!Memory.cpuTracking) Memory.cpuTracking = {};
            const cpuTracking = Memory.cpuTracking;
            const currentBucket = Game.cpu.bucket;

            if (cpuTracking.cooldown) {
                if (cpuTracking.cooldown + 50 < Game.time || currentBucket > BUCKET_MAX * 0.5) {
                    delete Memory.cpuTracking.cooldown;
                } else {
                    const countdown = (cpuTracking.cooldown + 50) - Game.time;
                    log.a(`On CPU Cooldown for ${countdown} more ticks or until the bucket reaches ${BUCKET_MAX * 0.5}. Current Bucket: ${currentBucket}`);
                    return;
                }
            } else if (currentBucket < BUCKET_MAX * 0.01) {
                const cooldown = Game.time;
                let {roomPenalty = 0, bucketIssueCount = 0} = Memory.cpuTracking || {};
                if (bucketIssueCount >= 50) {
                    log.e('Bucket Issue Count Exceeded');
                    roomPenalty = Game.time;
                    bucketIssueCount = 0;
                }
                Memory.cpuTracking = {
                    cooldown,
                    bucketIssueCount: bucketIssueCount + 1,
                    roomPenalty: roomPenalty
                };
                log.a('CPU Bucket Too Low - Cooldown Initiated');
                return;
            } else if (currentBucket === BUCKET_MAX && Memory.cpuTracking.bucketIssueCount > 0) Memory.cpuTracking.bucketIssueCount--;

            // Store Owned Rooms (Update Every 250 Ticks)
            if (!global.MY_ROOMS || !global.MAX_LEVEL || Game.time % 250 === 0) {
                const ownedRooms = Object.values(Game.rooms).filter(
                    (r) => r.controller && r.controller.my
                );
                if (ownedRooms.length) {
                    global.MY_ROOMS = ownedRooms.map((r) => r.name);
                    global.MAX_LEVEL = Math.max(...ownedRooms.map((r) => r.controller.level));
                    global.MIN_LEVEL = Math.min(...ownedRooms.map((r) => r.controller.level));

                    // Clean INTEL Cache
                    Object.keys(INTEL).forEach((key) => {
                        if (INTEL[key] && INTEL[key].owner === MY_USERNAME && !global.MY_ROOMS.includes(key)) {
                            purgeIntel(key);
                        }
                    });
                }
            }

            // Initialize Intel Cache
            if (!segments.retrieveIntel()) return;

            // Initialize Pathing Cache
            if (!segments.retrievePathing()) return;

            // Auto Respawn Logic
            if (!running) {
                const ownedRoom = Object.values(Game.rooms).find(
                    (r) => r.controller && r.controller.my
                );
                const spawn = _.filter(Game.structures, (s) => {
                    try {
                        return s.my && s.structureType === STRUCTURE_SPAWN;
                    } catch (e) {
                        return false;
                    }
                });
                const creeps = _.filter(Game.creeps, (s) => s.my);

                if (ownedRoom && ownedRoom.controller.level === 1 && ((!_.size(spawn) && !_.size(creeps)) || (_.size(spawn) === 1 && !_.size(creeps)))) {
                    if (!memWipe) {
                        resetMemory();
                        memWipe = true;
                    }
                    if (!_.size(spawn)) {
                        require('module.roomPlanner').buildRoom(ownedRoom);
                        return;
                    }
                } else if (_.size(spawn)) {
                    running = true;
                }
            }

            // Pixel Farming
            if (PIXEL_FARM && ['shard0', 'shard1', 'shard2', 'shard3', 'shardX'].includes(Game.shard.name)) {
                const pixelRoom = Game.rooms[MY_ROOMS[0]];
                return require('module.pixelFarm').farm(pixelRoom);
            }

            // Pixel Generation (Every 100 Ticks)
            if (
                GENERATE_PIXELS &&
                (!Memory.lastPixel || Memory.lastPixel + 100 < Game.time) &&
                currentBucket >= PIXEL_CPU_COST &&
                !MY_ROOMS.some((r) => INTEL[r] && INTEL[r].threatLevel)
            ) {
                log.a('Pixel Generated');
                Game.cpu.generatePixel();
                Memory.lastPixel = Game.time;
                return;
            }

            // Miscellaneous Tools
            try {
                tools.CPULimits();
                tools.tickLength();
                tools.cleanMemory();
                tools.status();
                populateLOANlist();
                cleanUp.cleanup();
            } catch (e) {
                log.e('Error with a main tool function');
                log.e(`${e} ${e.stack}`);
                Game.notify(`${e} ${e.stack}`);
            }

            // World
            try {
                new world();
            } catch (e) {
                log.e('World Error: ');
                log.e(`${e} ${e.stack}`);
                Game.notify(`${e} ${e.stack}`);
            }

            // Save Caches
            try {
                segments.storeIntel();
                segments.storePathing();
                segments.storeAllyRequests();
            } catch (e) {
                log.e('Error saving caches');
                log.e(`${e} ${e.stack}`);
                Game.notify(`${e} ${e.stack}`);
            }
        });
    } catch (e) {
        log.e(`Error Caught - ${e.stack}`)
        Game.notify(`Error Caught - ${e.stack}`)
    }
};

global.resetMemory = function () {
    log.a('Memory Wipe Initiated');
    RawMemory.set('{}');
    Memory.creeps = {};
    Memory.rooms = {};
    Memory.flags = {};
    Memory.spawns = {};
}

global.lastMemoryTick = undefined;

function tryInitSameMemory() {
    if (lastMemoryTick && global.LastMemory && Game.time === (lastMemoryTick + 1)) {
        delete global.Memory
        global.Memory = global.LastMemory
        RawMemory._parsed = global.LastMemory
    } else {
        Memory;
        global.LastMemory = RawMemory._parsed
    }
    lastMemoryTick = Game.time
}

