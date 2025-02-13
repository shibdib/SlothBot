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

if (PROFILER_ENABLED) profiler.enable();
module.exports.loop = function () {
    try {
        profiler.wrap(function () {
            // Memhack Initialization
            tryInitSameMemory();

            // CPU Bucket Cooldown Check
            if (!Memory.cpuTracking) Memory.cpuTracking = {};
            const cpuTracking = Memory.cpuTracking;
            const currentBucket = Game.cpu.bucket;

            if (cpuTracking.cooldown) {
                if (cpuTracking.cooldown + 50 < Game.time || currentBucket > BUCKET_MAX * 0.5) {
                    delete Memory.cpuTracking.cooldown;
                } else {
                    const countdown = (cpuTracking.cooldown + 50) - Game.time;
                    log.e(`On CPU Cooldown for ${countdown} more ticks or until the bucket reaches ${BUCKET_MAX * 0.5}. Current Bucket: ${currentBucket}`);
                    return;
                }
            } else if (currentBucket < BUCKET_MAX * 0.01) {
                const cooldown = Game.time;
                let {roomPenalty = 0, remotePenalty = 0, bucketIssueCount = 0} = Memory.cpuTracking || {};
                if (bucketIssueCount === 10) {
                    const maxLevelRemoteMiner = MY_ROOMS.filter((r) => Game.rooms[r].level === 8 && !Game.rooms[r].memory.noRemote);
                    if (maxLevelRemoteMiner.length) {
                        const maxEnergy = _.max(maxLevelRemoteMiner, 'energy');
                        Game.rooms[maxEnergy].memory.noRemote = Game.time + (CREEP_LIFE_TIME * 3);
                        log.e(`Disabling remote mining in ${roomLink(maxEnergy)} due to global CPU issues.`, `WORLD MANAGER:`);
                    } else {
                        log.e('Bucket Issue Count Exceeded - Disabling Remote Mining');
                        _.filter(Game.creeps, (c) => c.my && ['remoteHarvester', 'remoteHauler', 'SKAttacker'].includes(c.memory.role)).forEach((c) => c.suicide());
                        remotePenalty = Game.time;
                    }
                } else if (bucketIssueCount >= 50) {
                    log.e('Bucket Issue Count Exceeded - Abandoning Worst Room');
                    //abandonWorstRoom();
                    roomPenalty = Game.time;
                    bucketIssueCount = 0;
                }
                Memory.cpuTracking = {
                    cooldown,
                    bucketIssueCount: bucketIssueCount++,
                    roomPenalty: roomPenalty,
                    remotePenalty: remotePenalty
                };
                log.e('CPU Bucket Too Low - Cooldown Initiated');
                return;
            } else if (currentBucket === BUCKET_MAX && Memory.cpuTracking.bucketIssueCount > 0) Memory.cpuTracking.bucketIssueCount--;

            // Store Owned Rooms (Update Every 25 Ticks)
            if (!global.MY_ROOMS || !global.MAX_LEVEL || Game.time % 25 === 0) {
                const ownedRooms = Object.values(Game.rooms).filter(
                    (r) => r.controller && r.controller.my
                );
                if (ownedRooms.length) {
                    global.MY_ROOMS = ownedRooms.map((r) => r.name);
                    global.MAX_LEVEL = Math.max(...ownedRooms.map((r) => r.controller.level));
                    global.MIN_LEVEL = Math.min(...ownedRooms.map((r) => r.controller.level));

                    // Clean INTEL Cache
                    Object.keys(INTEL).forEach((key) => {
                        if (INTEL[key].owner === MY_USERNAME && !global.MY_ROOMS.includes(key)) {
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
                const spawn = Object.values(Game.spawns).find(
                    (s) => s.my && s.structureType === STRUCTURE_SPAWN && s.name !== 'auto'
                );
                const creep = Object.values(Game.creeps).find((c) => c.my);

                if (ownedRoom && (!spawn || !creep)) {
                    if (!memWipe) {
                        //resetMemory();
                        memWipe = true;
                    }
                    if (!spawn) {
                        require('module.roomPlanner').buildRoom(ownedRoom);
                        return;
                    }
                } else if (spawn) {
                    running = true;
                }
            }

            // Pixel Farming
            if (PIXEL_FARM && ['shard0', 'shard1', 'shard2', 'shard3'].includes(Game.shard.name)) {
                return require('module.pixelFarm').farm(Game.rooms[Object.keys(Game.rooms)[0]]);
            }

            // Pixel Generation (Every 1500 Ticks)
            if (
                GENERATE_PIXELS &&
                (!Memory.lastPixel || Memory.lastPixel + 100 < Game.time) &&
                currentBucket >= PIXEL_CPU_COST &&
                !MY_ROOMS.some((r) => INTEL[r].threatLevel)
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
            new world();

            // Save Caches
            try {
                segments.storeIntel();
                segments.storePathing();
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
    log.e('Memory Wipe Initiated');
    RawMemory.set('{}');
    Memory.creeps = {};
    Memory.rooms = {};
    Memory.flags = {};
    Memory.spawns = {};
}

global.lastMemoryTick = undefined;

function tryInitSameMemory() {
    if (lastMemoryTick && global.LastMemory && Game.time == (lastMemoryTick + 1)) {
        delete global.Memory
        global.Memory = global.LastMemory
        RawMemory._parsed = global.LastMemory
    } else {
        Memory;
        global.LastMemory = RawMemory._parsed
    }
    lastMemoryTick = Game.time
}

function abandonWorstRoom() {
    let worstRoom = _.min(MY_ROOMS, room => Game.rooms[room].controller.level);
    if (worstRoom) {
        log.a(`Abandoning ${worstRoom}`);
        //abandonRoom(Game.rooms[worstRoom]);
    }
}