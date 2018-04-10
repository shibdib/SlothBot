let profiler = require('screeps-profiler');
let overlord = require('main.Overlord');
let highCommand = require('military.highCommand');
let labs = require('module.labController');
let spawning = require('module.creepSpawning');
let diplomacy = require('module.diplomacy');
let hud = require('module.hud');
let shib = require("shibBench");

function mind() {
    // Set Name
    if (!global.USERNAME) {
        for (let key in Game.spawns) {
            global.USERNAME = Game.spawns[key].owner.username;
        }
    }

    Memory.ownedRooms = shuffle(_.filter(Game.rooms, (r) => r.controller && r.controller.owner && r.controller.owner['username'] === USERNAME));
    let cpuBucket = Game.cpu.bucket;

    let cpu;
    // High Command
        cpu = Game.cpu.getUsed();
        highCommand.highCommand();
        shib.shibBench('highCommand', cpu);

    // Handle Labs
    cpu = Game.cpu.getUsed();
    labs.labManager();
    shib.shibBench('labControl', cpu);

    // Handle Diplomacy
    diplomacy.diplomacyOverlord();

    // Process Overlords
    let processed = 0;
    let activeClaim;
    let overlordCount = Memory.ownedRooms.length;
    for (let key in Memory.ownedRooms) {
        let activeRoom = Memory.ownedRooms[key];
        let cpuUsed = Game.cpu.getUsed();
        let cpuLimit = Game.cpu.limit - cpuUsed;
        let cpuTickLimit = Game.cpu.tickLimit - cpuUsed;
        let roomLimit = cpuLimit / (overlordCount - processed);
        if (cpuBucket > 5000) roomLimit = cpuTickLimit / (overlordCount - processed);
        overlord.overlordMind(activeRoom, roomLimit);
        //Expansion Manager
        let maxRooms = 99;
        if (TEN_CPU) {
            maxRooms = 2;
        }
        if (Game.time % 500 === 0 && !activeRoom.memory.activeClaim && activeRoom.controller.level >= 4 && Game.gcl.level > overlordCount && !activeClaim && overlordCount <= maxRooms) {
            activeRoom.claimNewRoom();
        }
        processed++;
    }
    //Non room specific creep spawning
    if (Game.time % 15 === 0) {
        cpu = Game.cpu.getUsed();
        spawning.militaryCreepQueue();
        shib.shibBench('militarySpawn', cpu);
    }
    //Process creep build queues
    if (Game.time % 5 === 0) {
        cpu = Game.cpu.getUsed();
        spawning.processBuildQueue();
        shib.shibBench('processBuildQueue', cpu);
    }
    //Room HUD (If CPU Allows)
    if (Game.cpu.getUsed() < Game.cpu.limit) {
        cpu = Game.cpu.getUsed();
        hud.hud();
        shib.shibBench('roomHud', cpu);
    }
}
module.exports.hiveMind = profiler.registerFN(mind, 'hiveMind');

