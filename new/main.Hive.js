let profiler = require('screeps-profiler');
let overlord = require('main.Overlord');

function mind() {
    Memory.ownedRooms = _.filter(Game.rooms, (r) => r.controller.owner && r.controller.owner['username'] === 'Shibdib');
    let cpuBucket = Game.cpu.bucket;

    // Process Overlords
    let processed = 0;
    let overlordCount = Memory.ownedRooms.length;
    for (let ownedRoom in Memory.ownedRooms) {
        let cpuUsed = Game.cpu.getUsed();
        let cpuLimit = Game.cpu.limit - cpuUsed;
        let cpuTickLimit = Game.cpu.tickLimit - cpuUsed;
        let roomLimit = cpuLimit / (overlordCount - processed);
        if (cpuBucket > 2000) roomLimit = cpuTickLimit / (overlordCount - processed);
        overlord.overlordMind(ownedRoom, roomLimit);
        processed++;
    }
}
module.exports.hiveMind = profiler.registerFN(mind, 'hiveMind');