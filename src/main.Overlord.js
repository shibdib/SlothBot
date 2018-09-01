let profiler = require('screeps-profiler');
let observers = require('module.observerController');
let power = require('module.powerManager');
let shib = require("shibBench");
let defense = require('military.defense');
let links = require('module.linkController');
let terminals = require('module.terminalController');
let spawning = require('module.creepSpawning');

function mind(room, roomLimit) {
    let mindStart = Game.cpu.getUsed();
    let cpuBucket = Game.cpu.bucket;

    // Abandon Bad Rooms
    log.d('Abandon Check');
    let hostiles = _.filter(room.creeps, (c) => !_.includes(FRIENDLIES, c.owner.username) && (c.getActiveBodyparts(ATTACK) >= 3 || c.getActiveBodyparts(RANGED_ATTACK) >= 3 || c.getActiveBodyparts(WORK) >= 3));
    let worthyStructures = _.filter(room.structures, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_TOWER && s.my);
    let towers = _.filter(room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.my);
    if (room.controller.level <= 4 && hostiles.length && !worthyStructures.length && hostiles.length >= towers.length * 2) {
        if (Game.time % 25 === 0) room.memory.badCount = room.memory.badCount++ || 1;
        if (room.memory.badCount >= 4) {
            abandonRoom(room);
            Memory.roomCache[room.name].noClaim = true;
            log.a(room.name + ' has been abandoned due to a prolonged enemy presence.');
            Game.notify(room.name + ' has been abandoned due to a prolonged enemy presence.');
            return;
        }
    } else {
        room.memory.badCount = undefined;
    }

    // Set Energy Needs
    log.d('Energy Status');
    let terminalEnergy = 0;
    if (room.terminal) terminalEnergy = room.terminal.store[RESOURCE_ENERGY] || 0;
    let storageEnergy = 0;
    if (room.storage) storageEnergy = room.storage.store[RESOURCE_ENERGY] || 0;
    let energyInRoom = terminalEnergy + storageEnergy;
    room.memory.energySurplus = energyInRoom >= ENERGY_AMOUNT + (ENERGY_AMOUNT * 0.09);
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
    if (Game.time % 10 === 0 && cpuBucket >= 8000) {
        log.d('Room Building Module');
        let roomBuild = Game.cpu.getUsed();
        try {
            room.buildRoom();
        } catch (e) {
            log.e('Room Building for room ' + room.name + ' experienced an error');
            log.e(e.stack);
        }
        // Request builders
        requestBuilders(room);
        shib.shibBench('roomBuild', roomBuild);
    }

    // Manage creep spawning
    if (Game.time % 10 === 0 && cpuBucket >= 3000) {
        log.d('Creep Queueing');
        try {
            if (room.controller.level >= 2 && !TEN_CPU) {
                let remoteSpawn = Game.cpu.getUsed();
                spawning.remoteCreepQueue(room);
                shib.shibBench('remoteSpawn', remoteSpawn);
            }
            let creepSpawn = Game.cpu.getUsed();
            spawning.workerCreepQueue(room);
            shib.shibBench('workerCreepQueue', creepSpawn);
            cleanQueue(room);
        } catch (e) {
            log.e('Creep Spawning for room ' + room.name + ' experienced an error');
            log.e(e.stack);
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
        }
        shib.shibBench('terminalControl', cpu);
    }

    // Power Processing
    if (!TEN_CPU && cpuBucket >= 8000) {
        log.d('Power Module');
        cpu = Game.cpu.getUsed();
        try {
            power.powerControl(room);
        } catch (e) {
            log.e('Power Control for room ' + room.name + ' experienced an error');
            log.e(e.stack);
        }
        shib.shibBench('powerControl', cpu);
    }

    // Store Data
    log.d('Data Store');
    let minerals = Memory.ownedMineral || [];
    if (!_.includes(minerals, room.mineral[0].mineralType)) minerals.push(room.mineral[0].mineralType);
    Memory.ownedMineral = minerals;

    shib.shibBench('overlordMind', mindStart);
}

module.exports.overlordMind = profiler.registerFN(mind, 'overlordMind');

function minionController(minion) {
    if (minion.spawning) return;
    if (minion.idle) return minion.say(ICONS.wait18);
    minion.notifyWhenAttacked(false);
    minion.reportDamage();
    if (minion.room.name !== minion.memory.overlord) {
        minion.room.invaderCheck();
        minion.room.cacheRoomIntel();
    }
    if (Game.time % 25 === 0) minion.room.cacheRoomIntel();
    let memoryRole = minion.memory.role;
    let creepRole = require('role.' + memoryRole);
    let start = Game.cpu.getUsed();
    try {
        creepRole.role(minion);
        minion.room.visual.text(
            _.round(Game.cpu.getUsed() - start, 2),
            minion.pos.x,
            minion.pos.y,
            {opacity: 0.8, font: 0.4, stroke: '#000000', strokeWidth: 0.05}
        );
    } catch (e) {
        log.e(minion.name + ' experienced an error in room ' + minion.room.name);
        log.e(e.stack);
    }
    shib.shibBench(memoryRole, start, Game.cpu.getUsed());
}

module.exports.minionController = profiler.registerFN(minionController, 'minionController');

function cleanQueue(room) {
    for (let key in room.memory.creepBuildQueue) {
        if (room.memory.creepBuildQueue[key].room !== room.name) delete room.memory.creepBuildQueue[key]
    }
}

module.exports.cleanQueue = profiler.registerFN(cleanQueue, 'cleanCreepQueue');

function requestBuilders(room) {
    let spawns = _.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN);
    let roomCreeps = _.filter(Game.creeps, (r) => r.memory.overlord === room.name && !r.memory.military);
    if (!spawns.length || roomCreeps.length < 4 || getLevel(room) < 3) {
        room.memory.buildersNeeded = true;
    } else {
        room.memory.buildersNeeded = undefined;
    }
}

abandonRoom = function (room) {
    if (!Game.rooms[room] || !Game.rooms[room].memory.extensionHub) return log.e(room + ' does not appear to be owned by you.');
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