let observers = require('module.observerController');
let power = require('module.powerManager');
let shib = require("shibBench");
let defense = require('military.defense');
let links = require('module.linkController');
let terminals = require('module.terminalController');
let spawning = require('module.creepSpawning');
let state = require('module.roomState');
let planner = require('module.roomPlanner');
let storedLevel = {};

module.exports.overlordMind = function (room) {
    let roomTaskObject = taskCpuArray[room.name] || {};
    let currentTask;
    let mindStart = Game.cpu.getUsed();
    let cpuBucket = Game.cpu.bucket;

    // Set room state
    let cpu = Game.cpu.getUsed();
    state.setRoomState(room);
    currentTask = roomTaskObject['roomEnergyStatus'] || [];
    if (currentTask.length > 50) currentTask.shift();
    currentTask.push(Game.cpu.getUsed() - cpu);
    roomTaskObject['roomEnergyStatus'] = currentTask;

    // Handle Defense
    cpu = Game.cpu.getUsed();
    defense.controller(room);
    currentTask = roomTaskObject['defenseController'] || [];
    if (currentTask.length > 50) currentTask.shift();
    currentTask.push(Game.cpu.getUsed() - cpu);
    roomTaskObject['defenseController'] = currentTask;
    shib.shibBench('defenseController', cpu);

    //Build Room
    if (((storedLevel[room.name] && storedLevel[room.name] !== room.controller.level) || Game.time % 250 === 0) && cpuBucket >= 1000) {
        cpu = Game.cpu.getUsed();
        // Request builders
        requestBuilders(room);
        // Fix broken
        if (room.memory.bunkerHub && room.memory.extensionHub) room.memory.extensionHub = undefined;
        // Backwards compatible
        if (room.memory.extensionHub) {
            try {
                bunkerConversion(room);
                room.buildRoom();
            } catch (e) {
                log.e('Room Building for room ' + room.name + ' experienced an error');
                log.e(e.stack);
                Game.notify(e.stack);
            }
        } else {
            try {
                planner.buildRoom(room);
            } catch (e) {
                log.e('Room Building for room ' + room.name + ' experienced an error');
                log.e(e.stack);
                Game.notify(e.stack);
            }
        }
        // Silence Alerts
        if (Game.time % 500 === 0) {
            for (let building of room.structures) {
                building.notifyWhenAttacked(false);
            }
        }
        currentTask = roomTaskObject['roomBuild'] || [];
        if (currentTask.length > 50) currentTask.shift();
        currentTask.push(Game.cpu.getUsed() - cpu);
        roomTaskObject['roomBuild'] = currentTask;
        shib.shibBench('roomBuild', cpu);
    }

    // Manage creep spawning
    if (Game.time % 10 === 0 && cpuBucket >= 3000) {
        cpu = Game.cpu.getUsed();
        try {
            let creepSpawn = Game.cpu.getUsed();
            spawning.workerCreepQueue(room);
            shib.shibBench('workerCreepQueue', creepSpawn);
            cleanQueue(room);
        } catch (e) {
            log.e('Creep Spawning for room ' + room.name + ' experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
        currentTask = roomTaskObject['creepSpawning'] || [];
        if (currentTask.length > 50) currentTask.shift();
        currentTask.push(Game.cpu.getUsed() - cpu);
        roomTaskObject['creepSpawning'] = currentTask;
        shib.shibBench('creepSpawning', cpu);
    }

    // Manage remote creep spawning
    if (Game.time % 13 === 0 && cpuBucket >= 7000 && !TEN_CPU) {
        cpu = Game.cpu.getUsed();
        try {
            let remoteSpawn = Game.cpu.getUsed();
            spawning.remoteCreepQueue(room);
            shib.shibBench('remoteSpawn', remoteSpawn);
        } catch (e) {
            log.e('Remote Creep Spawning for room ' + room.name + ' experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
        currentTask = roomTaskObject['remoteSpawn'] || [];
        if (currentTask.length > 50) currentTask.shift();
        currentTask.push(Game.cpu.getUsed() - cpu);
        roomTaskObject['remoteSpawn'] = currentTask;
        shib.shibBench('remoteSpawn', cpu);
    }

    // Manage creeps
    cpu = Game.cpu.getUsed();
    let roomCreeps = shuffle(_.filter(Game.creeps, (r) => r.memory.overlord === room.name && !r.memory.military));
    // Worker minions
    for (let key in roomCreeps) {
        minionController(roomCreeps[key]);
    }
    currentTask = roomTaskObject['minionController'] || [];
    if (currentTask.length > 50) currentTask.shift();
    currentTask.push(Game.cpu.getUsed() - cpu);
    roomTaskObject['minionController'] = currentTask;
    shib.shibBench('minionController', cpu);

    // Observer Control
    if (room.level === 8 && cpuBucket >= 8000) {
        let observerCpu = Game.cpu.getUsed();
        try {
            observers.observerControl(room);
        } catch (e) {
            log.e('Observer Control for room ' + room.name + ' experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
        currentTask = roomTaskObject['observerControl'] || [];
        if (currentTask.length > 50) currentTask.shift();
        currentTask.push(Game.cpu.getUsed() - cpu);
        roomTaskObject['observerControl'] = currentTask;
        shib.shibBench('observerControl', observerCpu);
    }

    // Handle Links
    if (room.level >= 5) {
        cpu = Game.cpu.getUsed();
        try {
            links.linkControl(room);
        } catch (e) {
            log.e('Link Control for room ' + room.name + ' experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
        currentTask = roomTaskObject['linkControl'] || [];
        if (currentTask.length > 50) currentTask.shift();
        currentTask.push(Game.cpu.getUsed() - cpu);
        roomTaskObject['linkControl'] = currentTask;
        shib.shibBench('linkControl', cpu);
    }

    // Handle Terminals
    if (Game.time % 11 === 0 && Math.random() > 0.65 && room.level >= 6 && cpuBucket >= 4000 && room.terminal && !room.terminal.cooldown) {
        cpu = Game.cpu.getUsed();
        try {
            terminals.terminalControl(room);
        } catch (e) {
            log.e('Terminal Control for room ' + room.name + ' experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
        currentTask = roomTaskObject['terminalControl'] || [];
        if (currentTask.length > 50) currentTask.shift();
        currentTask.push(Game.cpu.getUsed() - cpu);
        roomTaskObject['terminalControl'] = currentTask;
        shib.shibBench('terminalControl', cpu);
    }

    // Power Processing
    if (!TEN_CPU && room.level >= 8 && cpuBucket >= 8000) {
        cpu = Game.cpu.getUsed();
        try {
            power.powerControl(room);
        } catch (e) {
            log.e('Power Control for room ' + room.name + ' experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
        currentTask = roomTaskObject['powerControl'] || [];
        if (currentTask.length > 50) currentTask.shift();
        currentTask.push(Game.cpu.getUsed() - cpu);
        roomTaskObject['powerControl'] = currentTask;
        shib.shibBench('powerControl', cpu);
    }
    taskCpuArray[room.name] = roomTaskObject;

    // Store Data
    storedLevel[room.name] = room.controller.level;
    let minerals = Memory.ownedMineral;
    if (!_.includes(minerals, room.mineral[0].mineralType)) minerals.push(room.mineral[0].mineralType);
    Memory.ownedMineral = minerals;

    shib.shibBench('overlordMind', mindStart);
    let used = Game.cpu.getUsed() - mindStart;
    let cpuUsageArray = roomCpuArray[room.name] || [];
    if (cpuUsageArray.length < 50) {
        cpuUsageArray.push(used)
    } else {
        cpuUsageArray.shift();
        cpuUsageArray.push(used);
        if (average(cpuUsageArray) > 20 && Game.time % 150 === 0) {
            log.e(room.name + ' is using a high amount of CPU - ' + average(cpuUsageArray));
            for (let key in taskCpuArray[room.name]) {
                log.e(_.capitalize(key) + ' Avg. CPU - ' + _.round(average(taskCpuArray[room.name][key]), 2));
            }
            Game.notify(room.name + ' is using a high amount of CPU - ' + average(cpuUsageArray));
            for (let key in taskCpuArray[room.name]) {
                log.e(_.capitalize(key) + ' Avg. CPU - ' + _.round(average(taskCpuArray[room.name][key]), 2));
            }
        }
    }
    room.memory.averageCpu = _.round(average(cpuUsageArray), 2);
    roomCpuArray[room.name] = cpuUsageArray;
    room.visual.text(
        'CPU Usage: ' + room.memory.averageCpu,
        1,
        8,
        {align: 'left', opacity: 0.8, color: '#ff0000'}
    );
};

function minionController(minion) {
    // Disable notifications
    if (minion.ticksToLive > 1490) minion.notifyWhenAttacked(false);
    // If idle sleep
    if (minion.idle) return;
    // If minion has been flagged to recycle do so
    if (minion.memory.recycle) return minion.recycleCreep();
    // Chance based CPU saving
    let cpuUsed = Game.cpu.getUsed();
    if (Game.cpu.bucket < 10000) {
        if ((cpuUsed >= Game.cpu.limit && Math.random() > 0.5) || Math.random() > 0.9) return minion.say('CPU'); else {
            if (Math.random() > Game.cpu.bucket / 10000) return minion.say('BUCKET');
        }
    }
    // Report damage if hits are low
    if (minion.hits < minion.hitsMax) minion.reportDamage();
    // Report intel chance
    if (minion.room.name !== minion.memory.overlord && Math.random() > 0.75) {
        minion.room.invaderCheck();
        minion.room.cacheRoomIntel();
    }
    // Handle border
    if (minion.borderCheck()) return;
    // Handle nuke flee
    if (minion.memory.fleeNukeTime && minion.fleeRoom(minion.memory.fleeNukeRoom)) return;
    // Set role
    let memoryRole = minion.memory.role;
    let creepRole = require('role.' + memoryRole);
    // Run role and log CPU
    try {
        creepRole.role(minion);
        let used = Game.cpu.getUsed() - cpuUsed;
        let cpuUsageArray = creepCpuArray[minion.name] || [];
        if (cpuUsageArray.length < 50) {
            cpuUsageArray.push(used)
        } else {
            cpuUsageArray.shift();
            cpuUsageArray.push(used);
            if (average(cpuUsageArray) > 4) {
                minion.suicide();
                log.e(minion.name + ' was killed for overusing CPU in room ' + minion.room.name);
            }
        }
        creepCpuArray[minion.name] = cpuUsageArray;
        let roomCreepCpu = roomCreepCpuObject[minion.memory.overlord] || {};
        cpuUsageArray = roomCreepCpu[minion.name] || [];
        if (cpuUsageArray.length < 50) {
            cpuUsageArray.push(used)
        } else {
            cpuUsageArray.shift();
            cpuUsageArray.push(used);
        }
        roomCreepCpu[minion.name] = cpuUsageArray;
        roomCreepCpuObject[minion.memory.overlord] = roomCreepCpu;
        minion.room.visual.text(
            _.round(average(cpuUsageArray), 2),
            minion.pos.x,
            minion.pos.y,
            {opacity: 0.8, font: 0.4, stroke: '#000000', strokeWidth: 0.05}
        );
    } catch (e) {
        log.e(minion.name + ' experienced an error in room ' + minion.room.name);
        log.e(e.stack);
        Game.notify(e.stack);
    }
    shib.shibBench(memoryRole, cpuUsed, Game.cpu.getUsed());
}

function cleanQueue(room) {
    for (let key in room.memory.creepBuildQueue) {
        if (room.memory.creepBuildQueue[key].room !== room.name) delete room.memory.creepBuildQueue[key]
    }
}

function requestBuilders(room) {
    let spawns = _.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN);
    let roomCreeps = _.filter(Game.creeps, (r) => r.memory.overlord === room.name && !r.memory.military);
    if (!spawns.length || roomCreeps.length < 4 || getLevel(room) !== room.controller.level || _.size(_.filter(room.constructionSites, (s) => s.structureType !== STRUCTURE_RAMPART)) > 2) {
        room.memory.buildersNeeded = true;
    } else {
        room.memory.buildersNeeded = undefined;
    }
}

function bunkerConversion(room) {
    //if (room.memory.noBunkerPos) return;
    if (!room.memory.readyToConvert && !room.memory.bunkerHub && planner.hubCheck(room)) room.memory.readyToConvert = true; else if (room.memory.newHubSearch >= 5000) room.memory.notConvertable = true;
    if (room.memory.converted || !room.memory.readyToConvert || !_.filter(Memory.ownedRooms, (r) => r.memory.buildersNeeded).length || !_.filter(Memory.ownedRooms, (r) => r.memory.buildersNeeded).length || _.size(Game.constructionSites) > 70 || !room.memory.bunkerHub) return;
    room.memory.buildersNeeded = true;
    delete room.memory.extensionHub;
    delete room.memory.bunkerComplete;
    delete room.memory.bunkerPos;
    room.memory.converted = true;
    for (let key in room.structures) {
        if (room.structures[key].structureType !== STRUCTURE_CONTAINER || room.structures[key].structureType !== STRUCTURE_STORAGE) room.structures[key].destroy();
    }
    for (let key in room.constructionSites) {
        room.constructionSites[key].remove();
    }
    planner.buildRoom(room);
}