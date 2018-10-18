let profiler = require('screeps-profiler');
let observers = require('module.observerController');
let power = require('module.powerManager');
let shib = require("shibBench");
let defense = require('military.defense');
let links = require('module.linkController');
let terminals = require('module.terminalController');
let spawning = require('module.creepSpawning');

module.exports.overlordMind = function (room, roomLimit) {
    let mindStart = Game.cpu.getUsed();
    let cpuBucket = Game.cpu.bucket;

    // Set Energy Needs
    log.d('Energy Status');
    let terminalEnergy = 0;
    if (room.terminal) terminalEnergy = room.terminal.store[RESOURCE_ENERGY] || 0;
    let storageEnergy = 0;
    if (room.storage) storageEnergy = room.storage.store[RESOURCE_ENERGY] || 0;
    let energyInRoom = terminalEnergy + storageEnergy;
    room.memory.energySurplus = energyInRoom >= ENERGY_AMOUNT;
    room.memory.extremeEnergySurplus = energyInRoom >= ENERGY_AMOUNT * 2;
    room.memory.energyNeeded = energyInRoom < ENERGY_AMOUNT * 0.8;

    // Set CPU windows
    let cpuWindow = Game.cpu.getUsed() + roomLimit;

    // Handle Defense
    let cpu = Game.cpu.getUsed();
    log.d('Defence Module');
    defense.controller(room);
    shib.shibBench('defenseController', cpu);

    //Build Room
    if (Game.time % 100 === 0 && cpuBucket >= 1000) {
        log.d('Room Building Module');
        let roomBuild = Game.cpu.getUsed();
        try {
            room.buildRoom();
        } catch (e) {
            log.e('Room Building for room ' + room.name + ' experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
        // Request builders
        requestBuilders(room);
        // Silence Alerts
        if (Game.time % 500 === 0) {
            for (let building of room.structures) {
                building.notifyWhenAttacked(false);
            }
        }
        shib.shibBench('roomBuild', roomBuild);
    }

    // Manage creep spawning
    if (Game.time % 10 === 0 && cpuBucket >= 3000) {
        log.d('Creep Queueing');
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
    }

    // Manage remote creep spawning
    if (Game.time % 50 === 0 && cpuBucket >= 7000 && room.controller.level >= 2 && !TEN_CPU) {
        try {
            let remoteSpawn = Game.cpu.getUsed();
            spawning.remoteCreepQueue(room);
            shib.shibBench('remoteSpawn', remoteSpawn);
        } catch (e) {
            log.e('Remote Creep Spawning for room ' + room.name + ' experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
    }

    // Manage creeps
    log.d('Manage Room Creeps');
    let roomCreeps = shuffle(_.filter(Game.creeps, (r) => r.memory.overlord === room.name && !r.memory.military));
    // Worker minions
    for (let key in roomCreeps) {
        if (Game.cpu.getUsed() > cpuWindow) return;
        minionController(roomCreeps[key]);
    }

    // Observer Control
    if (room.level === 8 && cpuBucket >= 8000) {
        log.d('Observer Module');
        let observerCpu = Game.cpu.getUsed();
        try {
            observers.observerControl(room);
        } catch (e) {
            log.e('Observer Control for room ' + room.name + ' experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
        shib.shibBench('observerControl', observerCpu);
    }

    // Handle Links
    if (room.level >= 5) {
        log.d('Links Module');
        cpu = Game.cpu.getUsed();
        try {
            links.linkControl(room);
        } catch (e) {
            log.e('Link Control for room ' + room.name + ' experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
        shib.shibBench('linkControl', cpu);
    }

    // Handle Terminals
    if (Game.time % 15 === 0 && room.level >= 6 && cpuBucket >= 8000) {
        log.d('Terminal Module');
        cpu = Game.cpu.getUsed();
        try {
            terminals.terminalControl(room);
        } catch (e) {
            log.e('Terminal Control for room ' + room.name + ' experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
        shib.shibBench('terminalControl', cpu);
    }

    // Power Processing
    if (!TEN_CPU && room.level >= 8 && cpuBucket >= 8000) {
        log.d('Power Module');
        cpu = Game.cpu.getUsed();
        try {
            power.powerControl(room);
        } catch (e) {
            log.e('Power Control for room ' + room.name + ' experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
        shib.shibBench('powerControl', cpu);
    }

    // Store Data
    log.d('Data Store');
    let minerals = Memory.ownedMineral || [];
    if (!_.includes(minerals, room.mineral[0].mineralType)) minerals.push(room.mineral[0].mineralType);
    Memory.ownedMineral = minerals;

    shib.shibBench('overlordMind', mindStart);
    let used = Game.cpu.getUsed() - mindStart;
    room.memory.cpuUsageArray = room.memory.cpuUsageArray || [];
    if (room.memory.cpuUsageArray.length < 50) {
        room.memory.cpuUsageArray.push(used)
    } else {
        room.memory.cpuUsageArray.shift();
        room.memory.cpuUsageArray.push(used);
        if (average(room.memory.cpuUsageArray) > 20 && Game.time % 150 === 0) {
            log.e(room.name + ' is using a high amount of CPU - ' + average(room.memory.cpuUsageArray));
            Game.notify(room.name + ' is using a high amount of CPU - ' + average(room.memory.cpuUsageArray))
        }
    }
    room.memory.averageCpu = _.round(average(room.memory.cpuUsageArray), 2);
    room.visual.text(
        'CPU Usage: ' + room.memory.averageCpu,
        1,
        8,
        {align: 'left', opacity: 0.8, color: '#ff0000'}
    );
};

function minionController(minion) {
    // If spawning disable notifications
    if (minion.spawning) return minion.notifyWhenAttacked(false);
    // If idle sleep
    if (minion.idle) return;
    // Chance based CPU saving
    let cpuUsed = Game.cpu.getUsed();
    if ((cpuUsed >= Game.cpu.limit && Math.random() > 0.7) || (cpuUsed >= Game.cpu.limit * 0.9 && Math.random() > 0.9)) return minion.say('CPU');
    if (Game.cpu.bucket < 10000 && cpuUsed >= Game.cpu.limit && Math.random() > Game.cpu.bucket / 10000) return minion.say('BUCKET');
    // Report damage if hits are low
    if (minion.hits < minion.hitsMax) minion.reportDamage();
    // Report intel chance
    if (minion.room.name !== minion.memory.overlord && Math.random() > 0.5) {
        minion.room.invaderCheck();
        minion.room.cacheRoomIntel();
    }
    // Handle nuke flee
    if (minion.memory.fleeNukeTime && minion.fleeRoom(minion.memory.fleeNukeRoom)) return;
    // Set role
    let memoryRole = minion.memory.role;
    let creepRole = require('role.' + memoryRole);
    // Run role and log CPU
    try {
        creepRole.role(minion);
        let used = Game.cpu.getUsed() - cpuUsed;
        minion.memory.cpuUsageArray = minion.memory.cpuUsageArray || [];
        if (minion.memory.cpuUsageArray.length < 50) {
            minion.memory.cpuUsageArray.push(used)
        } else {
            minion.memory.cpuUsageArray.shift();
            minion.memory.cpuUsageArray.push(used);
            if (average(minion.memory.cpuUsageArray) > 4) {
                minion.suicide();
                log.e(minion.name + ' was killed for overusing CPU in room ' + minion.room.name);
            }
        }
        minion.room.visual.text(
            _.round(average(minion.memory.cpuUsageArray), 2),
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
    if (!spawns.length || roomCreeps.length < 4 || getLevel(room) !== room.controller.level) {
        room.memory.buildersNeeded = true;
    } else {
        room.memory.buildersNeeded = undefined;
    }
}

abandonRoom = function (room) {
    for (let key in Game.rooms[room].creeps) {
        Game.rooms[room].creeps[key].suicide();
    }
    let overlordFor = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === room);
    for (let key in overlordFor) {
        overlordFor[key].suicide();
    }
    for (let key in Game.rooms[room].structures) {
        Game.rooms[room].structures[key].destroy();
    }
    for (let key in Game.rooms[room].constructionSites) {
        Game.rooms[room].constructionSites[key].remove();
    }
    delete Game.rooms[room].memory;
    Game.rooms[room].controller.unclaim();
};