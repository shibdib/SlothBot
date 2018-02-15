let profiler = require('screeps-profiler');

function mind(room, roomLimit) {
    // Set CPU windows
    let cpuWindow = Game.cpu.getUsed() + roomLimit;

    // Manage creeps
    if (Game.time % 10 === 0 || !room.memory.creepBuildQueue) {
        room.creepQueueChecks();
        cleanQueue(room);
        room.processBuildQueue();
    }
    let roomCreeps = _.filter(Game.creeps, (r) => r.memory.overlord === room.name);
    let militaryCreeps = _.filter(roomCreeps, (r) => r.memory.military);
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
}
module.exports.overlordMind = profiler.registerFN(mind, 'overlordMind');

function minionController(minion) {
    let memoryRole = minion.memory.role;
    let creepRole = require('role.' + memoryRole);
    creepRole.role(minion);
}
module.exports.minionController = profiler.registerFN(minionController, 'minionController');

function cleanQueue(room) {
    for (let key in room.memory.creepBuildQueue) {
        if (room.memory.creepBuildQueue[key].room !== room.name) delete room.memory.creepBuildQueue[key]
    }
}
module.exports.cleanQueue = profiler.registerFN(cleanQueue, 'cleanCreepQueue');