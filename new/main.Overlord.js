let profiler = require('screeps-profiler');
let observers = require('module.observerController');
let shib = require("shibBench");
let defense = require('military.defense');
let links = require('module.linkController');
let terminals = require('module.terminalController');
let spawning = require('module.creepSpawning');

function mind(room, roomLimit) {
    let mindStart = Game.cpu.getUsed();
    // Set CPU windows
    let cpuWindow = Game.cpu.getUsed() + roomLimit;

    // Handle Defense
    let cpu = Game.cpu.getUsed();
    defense.controller(room);
    shib.shibBench('defenseController', cpu);

    //Build Room
    if (Game.time % 50 === 0) {
        for (let structures of room.structures) {
            if ((structures.owner && structures.owner['username'] !== 'Shibdib') || structures.structureType === STRUCTURE_WALL) {
                structures.destroy();
            }
        }
        let roomBuild = Game.cpu.getUsed();
        room.buildRoom();
        // Request builders
        requestBuilders(room);
        shib.shibBench('roomBuild', roomBuild);
    }

    // Manage creep spawning
    let creepSpawn = Game.cpu.getUsed();
    if (Game.time % 10 === 0) {
        spawning.workerCreepQueue(room);
        if (room.controller.level >= 4) {
            spawning.remoteCreepQueue(room);
            spawning.militaryCreepQueue(room);
        }
    }
    cleanQueue(room);
    shib.shibBench('creepSpawn', creepSpawn);

    // Manage creeps
    let roomCreeps = shuffle(_.filter(Game.creeps, (r) => r.memory.overlord === room.name));
    let militaryCreeps = shuffle(_.filter(roomCreeps, (r) => r.memory.military));
    // Military first
    for (let key in militaryCreeps) {
        if (Game.cpu.getUsed() > cpuWindow) return;
        minionController(militaryCreeps[key]);
    }
    // Worker minions
    for (let key in roomCreeps) {
        if (Game.cpu.getUsed() > cpuWindow) return;
        minionController(roomCreeps[key]);
    }

    // Observer Control
    let observerCpu = Game.cpu.getUsed();
    observers.observerControl(room);
    shib.shibBench('observerControl', observerCpu);

    // Handle Links
    if (Game.time % 10 === 0) {
        cpu = Game.cpu.getUsed();
        links.linkControl(room);
        shib.shibBench('linkControl', cpu);
    }

    // Handle Terminals
    if (Game.time % 15 === 0) {
        cpu = Game.cpu.getUsed();
        terminals.terminalControl(room);
        shib.shibBench('terminalControl', cpu);
    }
    shib.shibBench('overlordMind', mindStart);
}

module.exports.overlordMind = profiler.registerFN(mind, 'overlordMind');

function minionController(minion) {
    if (minion.spawning) return;
    minion.notifyWhenAttacked(false);
    if (Game.time % 25 === 0) minion.room.cacheRoomIntel();
    let memoryRole = minion.memory.role;
    let creepRole = require('role.' + memoryRole);
    let start = Game.cpu.getUsed();
    creepRole.role(minion);
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
    if (spawns.length === 0) {
        room.memory.buildersNeeded = true;
    } else {
        room.memory.buildersNeeded = undefined;
        let needyRoom = _.filter(Memory.ownedRooms, (r) => r.memory.buildersNeeded && Game.map.findRoute(room.name, r.name).length < 9)[0];
        if (needyRoom) {
            if (room.memory.assistingRoom !== needyRoom.name) {
                room.memory.assistingRoom = needyRoom.name;
                log.a(room.name + ' is sending builders to support ' + needyRoom.name);
            }
        } else {
            room.memory.assistingRoom = undefined;
        }
    }
}