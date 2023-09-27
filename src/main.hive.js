/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

const overlord = require('main.overlord');
const highCommand = require('military.highCommand');
const labs = require('module.labController');
const segments = require('module.segmentManager');
const power = require('module.powerManager');
const spawning = require('module.creepSpawning');
const expansion = require('module.expansion');
const diplomacy = require('module.diplomacy');
const hud = require('module.hud');

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
        {name: 'segments', f: segments.init},
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
    let militaryCreeps = shuffle(_.filter(Game.creeps, (r) => (r.memory.military || !r.memory.overlord) && !r.spawning));
    for (let creep of militaryCreeps) {
        try {
            minionController(creep);
        } catch (e) {
            if (!errorCount[creep.name]) {
                errorCount[creep.name] = 1;
                log.e(creep.name + ' experienced an error in room ' + roomLink(creep.room.name));
                log.e(e);
                log.e(e.stack);
                Game.notify(e);
                Game.notify(e.stack);
            } else errorCount[creep.name] += 1;
            if (errorCount[creep.name] >= 50) {
                log.e(creep.name + ' experienced an error in room ' + roomLink(creep.room.name) + ' and has been killed.');
                creep.suicide();
            }
        }
    }

    // Overlord loop
    count = 0;
    let overlordCurrentCPU = Game.cpu.getUsed();
    let overlordTotalCPU = 0;
    let myRooms = shuffle(MY_ROOMS);
    do {
        let currentRoom = _.first(myRooms);
        if (!currentRoom) break;
        myRooms = _.rest(myRooms);
        count++;
        let activeRoom = Game.rooms[currentRoom];
        // If no longer owned, filter out
        if (!activeRoom) {
            MY_ROOMS = _.filter(MY_ROOMS, (r) => r !== currentRoom);
            continue;
        }
        try {
            activeRoom.invaderCheck();
            activeRoom.cacheRoomIntel();
            overlord.overlordMind(activeRoom, CPU_TASK_LIMITS['roomLimit'] * 0.9 / _.size(MY_ROOMS));
        } catch (e) {
            log.e('Overlord Module experienced an error in room ' + roomLink(currentRoom));
            log.e(e.stack);
            Game.notify(e.stack);
        }
        overlordCurrentCPU = Game.cpu.getUsed() - overlordCurrentCPU;
        overlordTotalCPU += overlordCurrentCPU;
    } while (count < MY_ROOMS.length)
};

let errorCount = {};
function minionController(minion) {
    // Disable notifications
    if (!minion.memory.notifyDisabled) {
        minion.notifyWhenAttacked(false);
        minion.memory.notifyDisabled = true;
    }
    // Handle idle
    if (minion.idle) return;
    // Track Threat
    diplomacy.trackThreat(minion);
    // Combat
    minion.attackInRange();
    minion.healInRange();
    // Handle edge cases
    if (minion.portalCheck() || minion.borderCheck()
        || (minion.memory.fleeNukeTime && minion.fleeNukeRoom())) {
        return;
    }
    // Report intel chance
    if (!MY_ROOMS.includes(minion.room.name)) {
        minion.room.invaderCheck();
        minion.room.cacheRoomIntel(false, minion);
    }
    // Run role
    if (!minion.memory.role) return minion.suicide();
    require('role.' + minion.memory.role).role(minion);
}
