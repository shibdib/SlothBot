let profiler = require('screeps-profiler');
let overlord = require('main.Overlord');
let defense = require('military.defense');
let highCommand = require('military.highCommand');
let links = require('module.linkController');
let terminals = require('module.terminalController');
let observers = require('module.observerController');

function mind() {
    Memory.ownedRooms = shuffle(_.filter(Game.rooms, (r) => r.controller && r.controller.owner && r.controller.owner['username'] === 'Shibdib'));
    let cpuBucket = Game.cpu.bucket;

    // Handle Defense
    defense.controller();

    // High Command
    if (Game.time % 150 === 0) highCommand.highCommand();

    // Handle Links
    if (Game.time % 10 === 0) links.linkControl();

    // Handle Terminals
    if (Game.time % 15 === 0) terminals.terminalControl();

    // Observer Control
    observers.observerControl();

    // Process Overlords
    let processed = 0;
    let activeClaim;
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
        if (Game.time % 500 === 0 && !activeRoom.memory.activeClaim && activeRoom.controller.level >= 4 && Game.gcl.level - 2 > overlordCount && !activeClaim) {
            activeRoom.claimNewRoom();
        }
        processed++;
    }
}
module.exports.hiveMind = profiler.registerFN(mind, 'hiveMind');