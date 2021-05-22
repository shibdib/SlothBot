/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let observers = require('module.observerController');
let factory = require('module.factoryController');
let defense = require('military.defense');
let links = require('module.linkController');
let terminals = require('module.terminalController');
let spawning = require('module.creepSpawning');
let state = require('module.roomState');
let planner = require('module.roomPlanner');
let diplomacy = require('module.diplomacy');
let tools = require('tools.cpuTracker');

module.exports.overlordMind = function (room, CPULimit) {
    if (!room) return;
    room.cacheRoomIntel();

    let mindStart = Game.cpu.getUsed();

    // Handle auto spawn placement
    if (Memory.myRooms.length === 1 && !_.find(Game.structures, (s) => s.structureType === STRUCTURE_SPAWN)) {
        planner.buildRoom(room);
    }

    // Defense controller always runs
    defense.controller(room);

    // Manage creeps
    let count = 0;
    let roomCreepCPU = 0;
    let taskCpu = Game.cpu.getUsed();
    let roomCreeps = shuffle(_.filter(Game.creeps, (r) => r.memory.overlord === room.name && !r.memory.military && !r.spawning));
    let totalCreeps = roomCreeps.length
    do {
        let currentCreep = _.first(roomCreeps);
        if (!currentCreep) break;
        roomCreeps = _.rest(roomCreeps);
        count++;
        try {
            minionController(currentCreep);
        } catch (e) {
            log.e('Error with ' + currentCreep.name + ' in ' + roomLink(currentCreep.room.name));
            log.e(e.stack);
            Game.notify(e.stack);
        }
        if (CREEP_CPU_ARRAY[currentCreep.name]) roomCreepCPU += average(CREEP_CPU_ARRAY[currentCreep.name]);
    } while ((roomCreepCPU < CPULimit * 0.9 || Game.cpu.bucket > 7000) && count < totalCreeps)
    tools.taskCPU('roomMinionController', Game.cpu.getUsed() - taskCpu, room.name);
    let spareCpu = (CPULimit * 0.9) - roomCreepCPU;

    // Room function loop
    let overlordFunctions = shuffle([{name: 'roomState', f: state.setRoomState},
        {name: 'links', f: links.linkControl},
        {name: 'terminals', f: terminals.terminalControl},
        {name: 'roomBuilder', f: planner.buildRoom},
        {name: 'observers', f: observers.observerControl},
        {name: 'factories', f: factory.factoryControl},
        {name: 'spawning', f: creepSpawning}]);
    let functionCount = overlordFunctions.length;
    count = 0;
    let overlordTaskCurrentCPU = Game.cpu.getUsed();
    let overlordTaskTotalCPU = 0;
    do {
        taskCpu = Game.cpu.getUsed();
        let currentFunction = _.first(overlordFunctions);
        if (!currentFunction) break;
        overlordFunctions = _.rest(overlordFunctions);
        count++;
        try {
            currentFunction.f(room);
        } catch (e) {
            log.e('Error with ' + currentFunction.name + ' function');
            log.e(e.stack);
            Game.notify(e.stack);
        }
        overlordTaskCurrentCPU = Game.cpu.getUsed() - overlordTaskCurrentCPU;
        overlordTaskTotalCPU += overlordTaskCurrentCPU;
        tools.taskCPU(currentFunction.name, Game.cpu.getUsed() - taskCpu, room.name);
    } while ((overlordTaskTotalCPU < (CPULimit * 0.1) + (spareCpu * 0.9) || Game.cpu.bucket > 9500) && count < functionCount)

    // Get income
    if (!ROOM_ENERGY_PER_TICK[room.name] || Game.time % 5 === 0) {
        let income = 0;
        let harvesters = _.filter(Game.creeps, (c) => c.memory.overlord === room.name && (c.memory.role === 'stationaryHarvester' || c.memory.role === 'remoteHarvester'));
        harvesters.forEach((h) => income += h.getActiveBodyparts(WORK) * HARVEST_POWER);
        ROOM_ENERGY_PER_TICK[room.name] = income;
    }

    // Silence Alerts
    if (Game.time % 2500 === 0) {
        for (let building of room.structures) {
            building.notifyWhenAttacked(false);
        }
    }

    // Store Data
    let used = Game.cpu.getUsed() - mindStart;
    let cpuUsageArray = ROOM_CPU_ARRAY[room.name] || [];
    if (cpuUsageArray.length < 250) {
        cpuUsageArray.push(used)
    } else {
        cpuUsageArray.shift();
        cpuUsageArray.push(used);
        if (Game.time % 150 === 0 && average(cpuUsageArray) > 15) {
            let cpuOverCount = room.memory.cpuOverage || 0;
            room.memory.cpuOverage = cpuOverCount + 1;
            log.e(room.name + ' is using a high amount of CPU - ' + average(cpuUsageArray));
            for (let key in TASK_CPU_ARRAY[room.name]) {
                log.e(_.capitalize(key) + ' Avg. CPU - ' + _.round(average(TASK_CPU_ARRAY[room.name][key]), 2));
            }
            //Game.notify(room.name + ' is using a high amount of CPU - ' + average(cpuUsageArray));
            for (let key in TASK_CPU_ARRAY[room.name]) {
                //Game.notify(_.capitalize(key) + ' Avg. CPU - ' + _.round(average(TASK_CPU_ARRAY[room.name][key]), 2));
            }
            if (cpuOverCount >= 10 && Game.cpu.bucket < 8000) {
                room.memory.cpuOverage = undefined;
                room.memory.noRemote = Game.time + 10000;
                _.filter(Game.creeps, (c) => c.my && c.memory.overlord === room.name && c.room.name !== room.name && !c.memory.military).forEach((k) => k.suicide());
                //Game.notify(room.name + ' remote spawning has been disabled.');
                log.e(room.name + ' remote spawning has been disabled.');
            }
        } else if (Game.time % 150 === 0) {
            if (room.memory.cpuOverage) room.memory.cpuOverage--;
            if (room.memory.noRemote) {
                if (room.memory.noRemote <= Game.time) room.memory.noRemote = undefined;
                else room.memory.noRemote *= 0.9;
            }
        }
    }
    room.memory.averageCpu = _.round(average(cpuUsageArray), 2);
    ROOM_CPU_ARRAY[room.name] = cpuUsageArray;
};

let errorCount = {};
function minionController(minion) {
    let cpuUsed = Game.cpu.getUsed();
    while (true) {
        // Set last managed tick
        minion.memory.lastManaged = Game.time;
        // Track Threat
        diplomacy.trackThreat(minion);
        // Handle edge cases
        if (minion.idle
            || minion.portalCheck() || minion.borderCheck()
            || (minion.room.hostileCreeps.length && minion.shibKite())
            || (minion.memory.fleeNukeTime && minion.fleeNukeRoom())) {
            break;
        }
        // Report intel chance
        if (minion.room.name !== minion.memory.overlord) {
            minion.room.invaderCheck();
            minion.room.cacheRoomIntel(false, minion);
        }
        try {
            // Run role
            require('role.' + minion.memory.role).role(minion);
            break;
        } catch (e) {
            if (!errorCount[minion.name]) errorCount[minion.name] = 1; else errorCount[minion.name] += 1;
            if (errorCount[minion.name] < 10) {
                if (errorCount[minion.name] === 1) {
                    log.e(minion.name + ' experienced an error in room ' + roomLink(minion.room.name));
                    log.e(e);
                    log.e(e.stack);
                    Game.notify(e);
                    Game.notify(e.stack);
                }
            } else if (errorCount[minion.name] >= 50) {
                if (errorCount[minion.name] === 50) log.e(minion.name + ' experienced an error in room ' + roomLink(minion.room.name) + ' and has been killed.');
                minion.suicide();
            }
        }
    }
    // Store CPU usage
    tools.creepCPU(minion, cpuUsed);
}

let tickTracker = {};
function creepSpawning(room) {
    let lastRun = tickTracker[room.name] || 0;
    spawning.processBuildQueue(room);
    if (lastRun + 5 > Game.time) return;
    tickTracker[room.name] = Game.time;
    if (room.level < 2) {
        spawning.roomStartup(room);
        spawning.remoteCreepQueue(room);
    } else {
        let spawnFunctions = shuffle([{name: 'essentialSpawning', f: spawning.essentialCreepQueue},
            {name: 'miscSpawning', f: spawning.miscCreepQueue},
            {name: 'remoteSpawning', f: spawning.remoteCreepQueue}]);
        try {
            spawnFunctions[0].f(room);
        } catch (e) {
            log.e(spawnFunctions[0].name + ' for room ' + room.name + ' experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
    }
}