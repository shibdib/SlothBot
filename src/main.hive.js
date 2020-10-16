/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let overlord = require('main.overlord');
let highCommand = require('military.highCommand');
let labs = require('module.labController');
let power = require('module.powerManager');
let spawning = require('module.creepSpawning');
let expansion = require('module.expansion');
let diplomacy = require('module.diplomacy');
let hud = require('module.hud');

module.exports.hiveMind = function () {
    // Diplomacy must run
    diplomacy.diplomacyOverlord();

    // Military creep loop
    let count = 0;
    let militaryCreepCPU = 0;
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
        if (CREEP_CPU_ARRAY[currentCreep.name]) militaryCreepCPU += average(CREEP_CPU_ARRAY[currentCreep.name]);
    } while ((militaryCreepCPU < CPU_TASK_LIMITS['military'] || Game.cpu.bucket > 2000) && count < totalCreeps)

    // Hive/global function loop
    let hiveFunctions = shuffle([highCommand.highCommand, labs.labManager, expansion.claimNewRoom, spawning.globalCreepQueue, power.powerControl]);
    let functionCount = hiveFunctions.length;
    count = 0;
    let hiveTaskCurrentCPU = Game.cpu.getUsed();
    let hiveTaskTotalCPU = 0;
    do {
        let currentFunction = _.first(hiveFunctions);
        if (!currentFunction) break;
        hiveFunctions = _.rest(hiveFunctions);
        count++;
        try {
            currentFunction();
        } catch (e) {
            log.e('Error with a hive function');
            log.e(e.stack);
            Game.notify(e.stack);
        }
        hiveTaskCurrentCPU = Game.cpu.getUsed() - hiveTaskCurrentCPU;
        hiveTaskTotalCPU += hiveTaskCurrentCPU;
    } while ((hiveTaskTotalCPU < CPU_TASK_LIMITS['hiveTasks'] || Game.cpu.bucket > 9500) && count < functionCount)

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
            overlord.overlordMind(activeRoom, CPU_TASK_LIMITS['roomLimit'] / _.size(Memory.myRooms));
        } catch (e) {
            log.e('Overlord Module experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
        overlordCurrentCPU = Game.cpu.getUsed() - overlordCurrentCPU;
        overlordTotalCPU += overlordCurrentCPU;
    } while ((overlordTotalCPU < CPU_TASK_LIMITS['roomLimit'] || Game.cpu.bucket > 7000) && count < _.size(Memory.myRooms))

    //Room HUD (If CPU Allows)
    if (Game.cpu.bucket > 1000) {
        try {
            hud.hud();
        } catch (e) {
            log.e('Room HUD experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
    }
};

let errorCount = {};
function minionController(minion) {
    // If on portal move
    if (minion.portalCheck() || minion.borderCheck()) return;
    // Disable notifications
    if (!minion.memory.notifyDisabled) {
        minion.memory.notifyDisabled = true;
        minion.notifyWhenAttacked(false);
    }
    // If minion has been flagged to recycle do so
    if (!minion.memory.role || minion.memory.recycle) return minion.recycleCreep();
    // If idle sleep
    if (minion.idle) return;
    // Track threat
    diplomacy.trackThreat(minion);
    // Handle nuke flee
    if (minion.memory.fleeNukeTime && minion.fleeNukeRoom(minion.memory.fleeNukeRoom)) return;
    // Set role
    let memoryRole = minion.memory.role;
    let start = Game.cpu.getUsed();
    try {
        // Report intel chance
        if (minion.room.name !== minion.memory.overlord && Math.random() > 0.5) {
            minion.room.invaderCheck();
            minion.room.cacheRoomIntel();
        }
        // Squad pair members dont act here
        if (!minion.memory.squadLeader || minion.memory.squadLeader === minion.id || minion.memory.operation !== 'borderPatrol' || (minion.memory.squadLeader && !Game.getObjectById(minion.memory.squadLeader))) {
            let creepRole = require('role.' + memoryRole);
            creepRole.role(minion);
        }
        let used = Game.cpu.getUsed() - start;
        let cpuUsageArray = CREEP_CPU_ARRAY[minion.name] || [];
        if (cpuUsageArray.length < 50) {
            cpuUsageArray.push(used)
        } else {
            cpuUsageArray.shift();
            cpuUsageArray.push(used);
            if (average(cpuUsageArray) > 7.5 && minion.memory.role !== 'claimer') {
                minion.suicide();
                if (minion.memory.military && minion.memory.destination && (Memory.targetRooms[minion.memory.destination] || Memory.auxiliaryTargets[minion.memory.destination])) {
                    delete Memory.targetRooms[minion.memory.destination];
                    delete Memory.auxiliaryTargets[minion.memory.destination];
                }
                log.e(minion.name + ' was killed for overusing CPU in room ' + roomLink(minion.room.name));
            }
        }
        CREEP_CPU_ARRAY[minion.name] = cpuUsageArray;
        cpuUsageArray = CREEP_ROLE_CPU_ARRAY[minion.role] || [];
        if (cpuUsageArray.length < 50) {
            cpuUsageArray.push(used)
        } else {
            cpuUsageArray.shift();
            cpuUsageArray.push(used);
        }
        CREEP_ROLE_CPU_ARRAY[minion.role] = cpuUsageArray;
        let roomCreepCpu = ROOM_CREEP_CPU_OBJECT['military'] || {};
        cpuUsageArray = roomCreepCpu[minion.name] || [];
        if (cpuUsageArray.length < 50) {
            cpuUsageArray.push(used)
        } else {
            cpuUsageArray.shift();
            cpuUsageArray.push(used);
        }
        roomCreepCpu[minion.name] = cpuUsageArray;
        ROOM_CREEP_CPU_OBJECT['military'] = roomCreepCpu;
        minion.room.visual.text(
            _.round(average(cpuUsageArray), 2),
            minion.pos.x,
            minion.pos.y,
            {opacity: 0.8, font: 0.4, stroke: '#000000', strokeWidth: 0.05}
        );
    } catch (e) {
        if (!errorCount[minion.name]) errorCount[minion.name] = 1; else errorCount[minion.name] += 1;
        if (errorCount[minion.name] < 10) {
            if (errorCount[minion.name] === 1) {
                log.e(minion.name + ' experienced an error in room ' + roomLink(minion.room.name));
                log.e(e.stack);
                Game.notify(e.stack);
            }
        } else if (errorCount[minion.name] >= 50) {
            if (errorCount[minion.name] === 50) log.e(minion.name + ' experienced an error in room ' + roomLink(minion.room.name) + ' and has been killed.');
            //minion.suicide();
        } else {
            if (errorCount[minion.name] === 10) log.e(minion.name + ' experienced an error in room ' + roomLink(minion.room.name) + ' and has been marked for recycling due to hitting the error cap.');
            //minion.memory.recycle = true;
        }
    }
}
