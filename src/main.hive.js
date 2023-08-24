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
    // Set last managed tick
    minion.memory.lastManaged = Game.time;
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
    // Set role
    try {
        // Squad pair members dont act here
        if (!minion.memory.squadLeader || minion.memory.squadLeader === minion.id || (minion.memory.squadLeader && !Game.getObjectById(minion.memory.squadLeader))) {
            if (!minion.memory.role) return minion.suicide();
            const creepRole = require('role.' + minion.memory.role);
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
