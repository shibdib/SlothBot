/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let overlord = require('main.overlord');
let highCommand = require('military.highCommand');
let labs = require('module.labController');
let segments = require('module.segmentManager');
let power = require('module.powerManager');
let spawning = require('module.creepSpawning');
let expansion = require('module.expansion');
let diplomacy = require('module.diplomacy');
let hud = require('module.hud');
let tools = require('tools.cpuTracker');

module.exports.hiveMind = function () {
    // Timing
    Memory.tickCooldowns = undefined;
    // Hive/global function loop
    diplomacy.diplomacyOverlord();
    let hiveFunctions = shuffle([{name: 'highCommand', f: highCommand.highCommand},
        {name: 'labs', f: labs.labManager},
        {name: 'expansion', f: expansion.claimNewRoom},
        {name: 'globalQueue', f: spawning.globalCreepQueue},
        {name: 'power', f: power.powerControl},
        {name: 'segments', f: segments.manager},
        {name: 'hud', f: hud.hud}]);
    let functionCount = hiveFunctions.length;
    let count = 0;
    let hiveTaskCurrentCPU = Game.cpu.getUsed();
    let hiveTaskTotalCPU = 0;
    do {
        let currentFunction = _.first(hiveFunctions);
        if (!currentFunction) break;
        hiveFunctions = _.rest(hiveFunctions);
        count++;
        try {
            currentFunction.f();
        } catch (e) {
            log.e('Error with a hive function');
            log.e(e.stack);
            Game.notify(e.stack);
        }
        hiveTaskCurrentCPU = Game.cpu.getUsed() - hiveTaskCurrentCPU;
        hiveTaskTotalCPU += hiveTaskCurrentCPU;
    } while ((hiveTaskTotalCPU < CPU_TASK_LIMITS['hiveTasks']) && count < functionCount)
    // Military creep loop
    count = 0;
    let militaryCreeps = shuffle(_.filter(Game.creeps, (r) => (r.memory.military || !r.memory.overlord) && !r.spawning));
    let totalCreeps = militaryCreeps.length
    do {
        let currentCreep = _.first(militaryCreeps);
        if (!currentCreep) break;
        militaryCreeps = _.rest(militaryCreeps);
        count++;
        try {
            minionController(currentCreep);
        } catch (e) {
            log.e('Error with ' + currentCreep.name + ' in ' + roomLink(currentCreep.room.name));
            log.e(e.stack);
            Game.notify(e.stack);
        }
    } while (count < totalCreeps)

    // Overlord loop
    count = 0;
    let overlordCurrentCPU = Game.cpu.getUsed();
    let overlordTotalCPU = 0;
    let myRooms = shuffle(Memory.myRooms);
    do {
        let currentRoom = _.first(myRooms);
        if (!currentRoom) break;
        myRooms = _.rest(myRooms);
        count++;
        let activeRoom = Game.rooms[currentRoom];
        try {
            activeRoom.invaderCheck();
            activeRoom.cacheRoomIntel();
            overlord.overlordMind(activeRoom, CPU_TASK_LIMITS['roomLimit'] * 0.9 / _.size(Memory.myRooms));
        } catch (e) {
            log.e('Overlord Module experienced an error in room ' + roomLink(currentRoom));
            log.e(e.stack);
            Game.notify(e.stack);
        }
        overlordCurrentCPU = Game.cpu.getUsed() - overlordCurrentCPU;
        overlordTotalCPU += overlordCurrentCPU;
    } while (count < _.size(Memory.myRooms))
    // Pixel
    if (PIXEL_GENERATION && Game.cpu.bucket === PIXEL_CPU_COST && ['shard0', 'shard1', 'shard2', 'shard3'].includes(Game.shard.name)) {
        log.e('Pixel generated on ' + Game.shard.name, 'Note:');
        Game.cpu.generatePixel();
    }
};

let errorCount = {};
function minionController(minion) {
    // Disable notifications
    if (!minion.memory.notifyDisabled) {
        minion.notifyWhenAttacked(false);
        minion.memory.notifyDisabled = true;
    }
    // Set last managed tick
    minion.memory.lastManaged = Game.time;
    // Handle idle
    if (minion.idle) return;
    // Track Threat
    diplomacy.trackThreat(minion);
    // Handle edge cases
    if (minion.portalCheck() || minion.borderCheck()
        || (minion.room.hostileCreeps.length && minion.hits < minion.hitsMax && minion.shibKite())
        || (minion.memory.fleeNukeTime && minion.fleeNukeRoom())) {
        return;
    }
    // Report intel chance
    if (minion.room.name !== minion.memory.overlord) {
        minion.room.invaderCheck();
        minion.room.cacheRoomIntel(false, minion);
    }
    // Set role
    try {
        // Squad pair members dont act here
        if (!minion.memory.squadLeader || minion.memory.squadLeader === minion.id || (minion.memory.squadLeader && !Game.getObjectById(minion.memory.squadLeader))) {
            if (!minion.memory.role) return minion.suicide();
            let creepRole = require('role.' + minion.memory.role);
            creepRole.role(minion);
            errorCount[minion.name] = undefined;
        }
    } catch (e) {
        if (!errorCount[minion.name]) errorCount[minion.name] = 1; else errorCount[minion.name] += 1;
        if (errorCount[minion.name] < 10) {
            if (errorCount[minion.name] === 1) {
                log.e(minion.name + ' experienced an error in room ' + roomLink(minion.room.name));
                log.e(e);
                log.e(e.stack);
                Game.notify(e.stack);
            }
        } else if (errorCount[minion.name] >= 50) {
            if (errorCount[minion.name] === 50) log.e(minion.name + ' experienced an error in room ' + roomLink(minion.room.name) + ' and has been killed.');
            minion.suicide();
        }
    }
}
