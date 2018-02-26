let profiler = require('screeps-profiler');
let shib = require("shibBench");

function mind(room, roomLimit) {
    let mindStart = Game.cpu.getUsed();
    // Set CPU windows
    let cpuWindow = Game.cpu.getUsed() + roomLimit;

    //Cache Buildings
    if (Game.time % 50 === 0) {
        room.memory.structureCache = undefined;
        for (let structures of room.find(FIND_STRUCTURES)) {
            if (structures.owner && structures.owner['username'] !== 'Shibdib') {
                structures.destroy();
                continue;
            }
            if (structures.room === room && structures.structureType !== STRUCTURE_ROAD && structures.structureType !== STRUCTURE_WALL && structures.structureType !== STRUCTURE_RAMPART) {
                room.cacheRoomStructures(structures.id);
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
        room.workerCreepQueue();
        if (room.controller.level >= 4) {
            room.remoteCreepQueue();
            room.militaryCreepQueue();
        }
    }
    cleanQueue(room);
    room.processBuildQueue();
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
    let spawns = _.filter(room.memory.structureCache, 'type', 'spawn');
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