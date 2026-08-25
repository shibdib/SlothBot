/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

// Core globals + prototypes only. World/planner/roles are lazy-loaded after the
// parse tick so a global reset cannot blow tickLimit (see boot skip below).
require("require");
let memWipe, running;
let tools, world, cleanUp;
const segments = require('module.segmentManager');
const profiler = require('tools.profiler');

function tickLimitHeadroom() {
    const limit = (Game.cpu && Game.cpu.tickLimit) || 500;
    return limit - Game.cpu.getUsed();
}

function loadLoopModules() {
    if (world) return;
    require("operation.scout");
    require("operation.guard");
    require("operation.roomDenial");
    require("operation.borderPatrol");
    require("operation.harass");
    require("operation.remoteDenial");
    require("operation.stronghold");
    tools = require("tools.misc");
    world = require('main.world');
    cleanUp = require('module.cleanup');
}

function requestBootSegments() {
    try {
        segments.init();
    } catch (e) { /* boot tick */
    }
}

// Towers still fire on parse/boot ticks so a global reset does not leave rooms undefended.
function bootTickTowers() {
    if (tickLimitHeadroom() < 30) return;
    try {
        if (global.purgeCorruptOwnedStructures) global.purgeCorruptOwnedStructures();
        const towerCtrl = require('module.towerController');
        for (const name in Game.rooms) {
            if (tickLimitHeadroom() < 15) break;
            const room = Game.rooms[name];
            if (!room || !room.controller || !room.controller.my) continue;
            const towers = room.towers;
            if (!towers || !towers.length) continue;
            towerCtrl.towerController(room);
        }
    } catch (e) {
        console.log(`Boot tick towers: ${e}`);
    }
}

function logBootSkip(reason) {
    const used = Game.cpu.getUsed();
    const limit = (Game.cpu && Game.cpu.tickLimit) || 500;
    const msg = `Global reset ${reason} (CPU ${used.toFixed(1)}/${limit})`;
    if (typeof log !== 'undefined' && log.a) log.a(msg);
    else console.log(msg);
}

module.exports.loop = function () {
    try {
        tryInitSameMemory();

        // First loop after this global: require("require") already paid parse + globals().
        // Running World/intel/roles on the same tick is what trips
        // "Script execution timed out: CPU time limit reached". Skip the heavy loop;
        // POST_RESET_DANGER_TICKS / intel / hub bootstrap still run starting next tick.
        if (!global._postResetBootSkip) {
            global._postResetBootSkip = true;
            requestBootSegments();
            bootTickTowers();
            logBootSkip('boot tick — skipped main loop');
            return;
        }

        if (!world) {
            loadLoopModules();
            // World/planner parse can still eat most of tickLimit. Defer the loop
            // one more tick if we would not have a safe margin to actually run it.
            if (tickLimitHeadroom() < 100) {
                requestBootSegments();
                bootTickTowers();
                logBootSkip('load tick — world parsed, deferred loop');
                return;
            }
        }

        if (PROFILER_ENABLED && !global._profilerEnabled) {
            profiler.enable();
            global._profilerEnabled = true;
        }

        profiler.wrap(function () {
            // Purge broken owner refs before any room.find() rebuilds driver FIND caches.
            if (global.purgeCorruptOwnedStructures) global.purgeCorruptOwnedStructures();

            // CPU Bucket Cooldown Check
            if (!Memory.cpuTracking) Memory.cpuTracking = {};
            if (!Memory.targetRooms) Memory.targetRooms = {};
            if (!Memory.auxiliaryTargets) Memory.auxiliaryTargets = {};
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

            // Owned-room list: full scan when visibility changes, every 50 ticks, or if
            // an existing entry was lost. Avoid Object.values(Game.rooms) every tick.
            {
                let visibleCount = 0;
                for (const _n in Game.rooms) visibleCount++;
                const visibilityChanged = global._lastVisibleRoomCount !== visibleCount;
                global._lastVisibleRoomCount = visibleCount;
                let listStale = !global.MY_ROOMS || !global.MY_ROOMS.length || !global.MAX_LEVEL
                    || Game.time % 50 === 0
                    || visibilityChanged;
                if (!listStale && global.MY_ROOMS) {
                    for (let i = 0; i < global.MY_ROOMS.length; i++) {
                        const r = Game.rooms[global.MY_ROOMS[i]];
                        if (!r || !r.controller || !r.controller.my) {
                            listStale = true;
                            break;
                        }
                    }
                }
                if (listStale) {
                    const ownedRooms = [];
                    for (const name in Game.rooms) {
                        const r = Game.rooms[name];
                        if (r.controller && r.controller.my) ownedRooms.push(r);
                    }
                    if (ownedRooms.length) {
                        global.MY_ROOMS = ownedRooms.map((r) => r.name);
                        global.MAX_LEVEL = Math.max(...ownedRooms.map((r) => r.controller.level));
                        global.MIN_LEVEL = Math.min(...ownedRooms.map((r) => r.controller.level));

                        for (const key in INTEL) {
                            if (INTEL[key] && INTEL[key].owner === MY_USERNAME && !global.MY_ROOMS.includes(key)) {
                                purgeIntel(key);
                            }
                        }
                    }
                }
            }

            // Initialize Intel Cache
            if (!segments.retrieveIntel()) return;

            // Initialize Pathing Cache
            if (!segments.retrievePathing()) return;

            // Auto Respawn Logic — Game.spawns / Game.creeps, not a full Game.structures walk.
            if (!running) {
                const ownedRoom = (global.MY_ROOMS && global.MY_ROOMS.length)
                    ? Game.rooms[global.MY_ROOMS[0]]
                    : null;
                let spawnCount = 0;
                for (const _id in Game.spawns) spawnCount++;
                let creepCount = 0;
                for (const _n in Game.creeps) creepCount++;

                if (ownedRoom && ownedRoom.controller && ownedRoom.controller.level === 1
                    && ((!spawnCount && !creepCount) || (spawnCount === 1 && !creepCount))) {
                    if (!memWipe) {
                        resetMemory();
                        memWipe = true;
                    }
                    if (!spawnCount) {
                        require('module.roomPlanner').buildRoom(ownedRoom);
                        return;
                    }
                } else if (spawnCount) {
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
    Memory.targetRooms = {};
    Memory.auxiliaryTargets = {};
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

