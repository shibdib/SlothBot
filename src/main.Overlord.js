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
            if ((structures.owner && structures.owner['username'] !== USERNAME) || structures.structureType === STRUCTURE_WALL) {
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
    if (Game.time % 10 === 0) {
        if (room.controller.level >= 4 && Game.time % 20 === 0) {
            let remoteSpawn = Game.cpu.getUsed();
            spawning.remoteCreepQueue(room);
            shib.shibBench('remoteSpawn', remoteSpawn);
        }
        let creepSpawn = Game.cpu.getUsed();
        spawning.workerCreepQueue(room);
        shib.shibBench('workerCreepQueue', creepSpawn);
        cleanQueue(room);
    }

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
    if (Game.time % 5 === 0) {
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

    // Store Data
    let minerals = Memory.ownedMineral || [];
    if (!_.includes(minerals, room.mineral[0].mineralType)) minerals.push(room.mineral[0].mineralType);
    Memory.ownedMineral = minerals;

    shib.shibBench('overlordMind', mindStart);
}

module.exports.overlordMind = profiler.registerFN(mind, 'overlordMind');

function minionController(minion) {
    if (minion.spawning) return;
    if (minion.idle) {
        return minion.say(ICONS.wait18);
    }
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
        delete room.memory.buildersNeeded;
        let needyRoom = _.filter(Memory.ownedRooms, (r) => r.memory.buildersNeeded && Game.map.findRoute(room.name, r.name).length < 9)[0];
        if (needyRoom) {
            if (room.memory.assistingRoom !== needyRoom.name) {
                room.memory.assistingRoom = needyRoom.name;
                log.a(room.name + ' is sending builders to support ' + needyRoom.name);
            }
        } else {
            delete room.memory.assistingRoom;
        }
    }
}