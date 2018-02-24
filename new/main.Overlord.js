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
        shib.shibBench('roomBuild', roomBuild);
    }

    // Manage creep spawning
    if (Game.time % 10 === 0) {
        let creepSpawn = Game.cpu.getUsed();
        room.workerCreepQueue();
        if (room.controller.level >= 4) {
            room.remoteCreepQueue();
            room.militaryCreepQueue();
        }
        cleanQueue(room);
        room.processBuildQueue();
        shib.shibBench('creepSpawn', creepSpawn);
    }

    // Manage creeps
    let roomCreeps = shuffle(_.filter(Game.creeps, (r) => r.memory.overlord === room.name));
    let militaryCreeps = shuffle(_.filter(roomCreeps, (r) => r.memory.military));
    // Military first
    for (let key in militaryCreeps){
        if (Game.cpu.getUsed() > cpuWindow) return;
        minionController(militaryCreeps[key]);
    }
    // Worker minions
    for (let key in roomCreeps){
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