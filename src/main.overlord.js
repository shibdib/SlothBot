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

module.exports.overlordMind = function (room, CPULimit) {
    if (!room) return;

    // Cache globals
    cacheRoomItems(room);

    let mindStart = Game.cpu.getUsed();

    // Handle auto spawn placement
    if (Memory.myRooms.length === 1 && !_.filter(Game.structures, (s) => s.structureType === STRUCTURE_SPAWN)[0]) {
        planner.buildRoom(room);
    }

    // Defense controller always runs
    defense.controller(room);

    // Manage creeps
    let count = 0;
    let roomCreepCPU = 0;
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
    let spareCpu = (CPULimit * 0.9) - roomCreepCPU;

    // Room function loop
    let overlordFunctions = shuffle([state.setRoomState, links.linkControl, terminals.terminalControl, planner.buildRoom, observers.observerControl, factory.factoryControl, creepSpawning, lowPowerCheck]);
    let functionCount = overlordFunctions.length;
    count = 0;
    let overlordTaskCurrentCPU = Game.cpu.getUsed();
    let overlordTaskTotalCPU = 0;
    do {
        let currentFunction = _.first(overlordFunctions);
        if (!currentFunction) break;
        overlordFunctions = _.rest(overlordFunctions);
        count++;
        try {
            currentFunction(room);
        } catch (e) {
            log.e('Error with overlord function');
            log.e(e.stack);
            Game.notify(e.stack);
        }
        overlordTaskCurrentCPU = Game.cpu.getUsed() - overlordTaskCurrentCPU;
        overlordTaskTotalCPU += overlordTaskCurrentCPU;
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
    if (cpuUsageArray.length < 50) {
        cpuUsageArray.push(used)
    } else {
        cpuUsageArray.shift();
        cpuUsageArray.push(used);
        if (average(cpuUsageArray) > 20 && Game.time % 150 === 0) {
            log.e(room.name + ' is using a high amount of CPU - ' + average(cpuUsageArray));
            for (let key in TASK_CPU_ARRAY[room.name]) {
                log.e(_.capitalize(key) + ' Avg. CPU - ' + _.round(average(TASK_CPU_ARRAY[room.name][key]), 2));
            }
            Game.notify(room.name + ' is using a high amount of CPU - ' + average(cpuUsageArray));
            for (let key in TASK_CPU_ARRAY[room.name]) {
                log.e(_.capitalize(key) + ' Avg. CPU - ' + _.round(average(TASK_CPU_ARRAY[room.name][key]), 2));
            }
        }
    }
    room.memory.averageCpu = _.round(average(cpuUsageArray), 2);
    ROOM_CPU_ARRAY[room.name] = cpuUsageArray;
};

let errorCount = {};
function minionController(minion) {
    if (minion.room.hostileCreeps.length && minion.shibKite()) return;
    // Set last managed tick
    minion.memory.lastManaged = Game.time;
    // If bucket gets real low kill remotes
    if (Game.cpu.bucket < 1000) {
        if (minion.room.name !== minion.memory.overlord) minion.suicide();
    }
    // If on portal or border move
    if (minion.portalCheck() || minion.borderCheck()) return;
    // Disable notifications
    if (!minion.memory.notifyDisabled) {
        minion.memory.notifyDisabled = true;
        minion.notifyWhenAttacked(false);
    }
    // Handle nuke flee
    if (minion.memory.fleeNukeTime && minion.fleeNukeRoom()) return;
    // If idle sleep
    if (minion.idle) return;
    // If minion has been flagged to recycle do so
    if (minion.memory.recycle) return minion.recycleCreep();
    // Chance based CPU saving
    let cpuUsed = Game.cpu.getUsed();
    /**
     if (Game.cpu.bucket < 8000) {
        if ((cpuUsed >= Game.cpu.limit && Math.random() > 0.5) || Math.random() > 0.9) return minion.say('CPU'); else {
            if (Math.random() > Game.cpu.bucket / 8000) return minion.say('BUCKET');
        }
    }**/
    // Track Threat
    diplomacy.trackThreat(minion);
    // Report intel chance
    if (minion.room.name !== minion.memory.overlord && Math.random() > 0.75) {
        minion.room.invaderCheck();
        minion.room.cacheRoomIntel();
    }
    // Set role
    let memoryRole = minion.memory.role;
    // Run role and log CPU
    try {
        let creepRole = require('role.' + memoryRole);
        creepRole.role(minion);
        let used = Game.cpu.getUsed() - cpuUsed;
        let cpuUsageArray = CREEP_CPU_ARRAY[minion.name] || [];
        if (cpuUsageArray.length < 50) {
            cpuUsageArray.push(used)
        } else {
            cpuUsageArray.shift();
            cpuUsageArray.push(used);
            if (average(cpuUsageArray) > 3 && minion.memory.role !== 'claimer') {
                minion.suicide();
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
        let roomCreepCpu = ROOM_CREEP_CPU_OBJECT[minion.memory.overlord] || {};
        cpuUsageArray = roomCreepCpu[minion.name] || [];
        if (cpuUsageArray.length < 50) {
            cpuUsageArray.push(used)
        } else {
            cpuUsageArray.shift();
            cpuUsageArray.push(used);
        }
        roomCreepCpu[minion.name] = cpuUsageArray;
        ROOM_CREEP_CPU_OBJECT[minion.memory.overlord] = roomCreepCpu;
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
            minion.suicide();
        } else {
            if (errorCount[minion.name] === 10) log.e(minion.name + ' experienced an error in room ' + roomLink(minion.room.name) + ' and has been marked for recycling due to hitting the error cap.');
            minion.memory.recycle = true;
        }
    }
}

function creepSpawning(room) {
    if (room.memory.praiseRoom) {
        spawning.praiseCreepQueue(room);
    } else if (getLevel(room) < 2) {
        spawning.roomStartup(room);
    } else {
        try {
            spawning.essentialCreepQueue(room);
        } catch (e) {
            log.e('Essential Queueing for room ' + room.name + ' experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
        try {
            if (!room.memory.lowPower) spawning.miscCreepQueue(room);
        } catch (e) {
            log.e('Misc Queueing for room ' + room.name + ' experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
        try {
            spawning.remoteCreepQueue(room);
        } catch (e) {
            log.e('Remote Creep Queuing for room ' + room.name + ' experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
    }
    spawning.processBuildQueue(room);
}

function lowPowerCheck(room) {
    return room.memory.lowPower = undefined;
    // Potential low power mode
    if (room.level === 8) {
        let inBuild = _.filter(room.constructionSites, (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD)[0];
        if (room.memory.lowPower) {
            if (room.memory.lowPower + 10000 < Game.time || inBuild || Memory.roomCache[room.name].threatLevel > 2) {
                log.a(room.name + ' is no longer in a low power state.');
                room.memory.lowPower = undefined;
                room.memory.lastLowPower = Game.time;
            }
        } else if (!room.memory.lastLowPower || room.memory.lastLowPower + 12500 < Game.time) {
            let maxLevelRooms = _.filter(Game.rooms, (r) => r.energyAvailable && r.controller.owner && r.controller.owner.username === MY_USERNAME && r.controller.level >= 8 && !r.constructionSites.length);
            let lowPowerRooms = _.filter(Game.rooms, (r) => r.energyAvailable && r.controller.owner && r.controller.owner.username === MY_USERNAME && r.controller.level >= 8 && r.memory.lowPower);
            if (maxLevelRooms.length >= 3 && lowPowerRooms.length < maxLevelRooms.length * 0.5 && Math.random() > 0.8 && !inBuild && (!Memory.saleTerminal.room || room.name !== Memory.saleTerminal.room) && (Game.cpu.bucket < 9000 && (!Memory.lastPixelGenerated || Memory.lastPixelGenerated + 10000 < Game.time))) {
                log.a(room.name + ' has entered a low power state for 10000 ticks.');
                room.memory.lowPower = Game.time;
            }
        }
    } else {
        room.memory.lowPower = undefined;
    }
}

function cacheRoomItems(room) {
    room.cacheRoomIntel();
    // Cache number of spaces around sources for things
    if (!ROOM_SOURCE_SPACE[room.name]) {
        let spaces = 0;
        for (let source of room.sources) spaces += source.pos.countOpenTerrainAround();
        ROOM_SOURCE_SPACE[room.name] = spaces;
    }
    // Cache number of spaces around sources for things
    if (!ROOM_CONTROLLER_SPACE[room.name]) {
        ROOM_CONTROLLER_SPACE[room.name] = room.controller.pos.countOpenTerrainAround();
    }
    let currentMinerals = Memory.ownedMinerals || [];
    currentMinerals.push(room.mineral.mineralType);
    Memory.ownedMinerals = _.uniq(currentMinerals);
    // Stats
    let stats = room.memory.stats || {};
    // Store ticks on rcl upgrade
    if (!stats.levelInfo) stats.levelInfo = {};
    if (!stats.levelInfo[room.controller.level]) stats.levelInfo[room.controller.level] = Game.time;
    // Store ticks with a threat level
    if (Memory.roomCache[room.name].threatLevel >= 3) if (!stats.underAttack) stats.underAttack = 1; else stats.underAttack += 1;
    room.memory.stats = stats;

}