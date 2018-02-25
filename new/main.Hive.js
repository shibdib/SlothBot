let profiler = require('screeps-profiler');
let overlord = require('main.Overlord');
let defense = require('military.defense');
let highCommand = require('military.highCommand');
let links = require('module.linkController');
let terminals = require('module.terminalController');
let observers = require('module.observerController');
let labs = require('module.labController');
let shib = require("shibBench");

function mind() {
    Memory.ownedRooms = shuffle(_.filter(Game.rooms, (r) => r.controller && r.controller.owner && r.controller.owner['username'] === 'Shibdib'));
    let cpuBucket = Game.cpu.bucket;

    // Handle Defense
    let cpu = Game.cpu.getUsed();
    defense.controller();
    shib.shibBench('defenseController', cpu);

    // High Command
    if (Game.time % 150 === 0) {
        cpu = Game.cpu.getUsed();
        highCommand.highCommand();
        shib.shibBench('highCommand', cpu);
    }

    // Handle Links
    if (Game.time % 10 === 0) {
        cpu = Game.cpu.getUsed();
        links.linkControl();
        shib.shibBench('linkControl', cpu);
    }

    // Handle Terminals
    if (Game.time % 15 === 0) {
        cpu = Game.cpu.getUsed();
        terminals.terminalControl();
        shib.shibBench('terminalControl', cpu);
    }

    // Handle Labs
    if (Game.time % 15 === 0) {
        cpu = Game.cpu.getUsed();
        labs.labManager();
        shib.shibBench('labControl', cpu);
    }


    // Observer Control
    cpu = Game.cpu.getUsed();
    observers.observerControl();
    shib.shibBench('observerControl', cpu);

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