let profiler = require('screeps-profiler');
let overlord = require('main.Overlord');

function mind() {
    Memory.ownedRooms = _.filter(Game.rooms, (r) => r.controller && r.controller.owner && r.controller.owner['username'] === 'Shibdib');
    let cpuBucket = Game.cpu.bucket;

    // Process Overlords
    let processed = 0;
    let overlordCount = Memory.ownedRooms.length;
    for (let key in Memory.ownedRooms) {
        let activeRoom = Memory.ownedRooms[key];
        if (!activeRoom.memory._caches) activeRoom.memory._caches = {};
        let cpuUsed = Game.cpu.getUsed();
        let cpuLimit = Game.cpu.limit - cpuUsed;
        let cpuTickLimit = Game.cpu.tickLimit - cpuUsed;
        let roomLimit = cpuLimit / (overlordCount - processed);
        if (cpuBucket > 2000) roomLimit = cpuTickLimit / (overlordCount - processed);
        overlord.overlordMind(activeRoom, roomLimit);
        //Expansion Manager
        if (activeRoom.controller.level >= 4 && !activeRoom.memory.claimTarget && Game.gcl.level - 2 > overlordCount) activeRoom.claimNewRoom();
        processed++;
    }
}
module.exports.hiveMind = profiler.registerFN(mind, 'hiveMind');