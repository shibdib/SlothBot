let profiler = require('screeps-profiler');
let overlord = require('main.Overlord');
let highCommand = require('military.highCommand');
let labs = require('module.labController');
let spawning = require('module.creepSpawning');
let expansion = require('module.expansion');
let diplomacy = require('module.diplomacy');
let hud = require('module.hud');
let shib = require("shibBench");

function mind() {
    log.d('Name Set');
    // Set Name
    if (!global.USERNAME) {
        for (let key in Game.spawns) {
            global.USERNAME = Game.spawns[key].owner.username;
            break;
        }
    }

    log.d('Owned Rooms Declared');
    Memory.ownedRooms = shuffle(_.filter(Game.rooms, (r) => r.controller && r.controller.owner && r.controller.owner.username === USERNAME));
    let cpuBucket = Game.cpu.bucket;

    let cpu;
    // High Command
    cpu = Game.cpu.getUsed();
    log.d('High Command Module');
    highCommand.highCommand();
    shib.shibBench('highCommand', cpu);

    // Handle Labs
    cpu = Game.cpu.getUsed();
    log.d('Lab Manager Module');
    if (Game.cpu.bucket > 5000) labs.labManager();
    shib.shibBench('labControl', cpu);

    // Handle Diplomacy
    log.d('Diplomacy Module');
    diplomacy.diplomacyOverlord();

    // Military first
    log.d('Military Creep Management');
    let militaryCreeps = shuffle(_.filter(Game.creeps, (r) => r.memory.military));
    for (let key in militaryCreeps) {
        minionController(militaryCreeps[key]);
    }

    // Process Overlords
    log.d('Overlords Processed');
    let processed = 0;
    let activeClaim;
    let overlordCount = Memory.ownedRooms.length;
    for (let key in Memory.ownedRooms) {
        let activeRoom = Memory.ownedRooms[key];
        let cpuUsed = Game.cpu.getUsed();
        let cpuLimit = Game.cpu.limit - cpuUsed;
        let cpuTickLimit = Game.cpu.tickLimit - cpuUsed;
        let roomLimit = cpuLimit / (overlordCount - processed);
        if (cpuBucket < 10000) roomLimit = (cpuLimit * 0.9) / (overlordCount - processed);
        if (cpuBucket > 7500) roomLimit = cpuTickLimit / (overlordCount - processed);
        log.d('Overlord For ' + activeRoom.name);
        overlord.overlordMind(activeRoom, roomLimit);
        //Expansion Manager
        let maxRooms = _.round(Game.cpu.limit / 15);
        if (TEN_CPU) {
            maxRooms = 2;
        }
        if (Game.time % 100 === 0 && activeRoom.controller.level >= 3 && Game.gcl.level > overlordCount && !activeClaim && overlordCount <= maxRooms) {
            log.d('Expansion Module');
            expansion.claimNewRoom(activeRoom);
        }
        processed++;
    }
    //Non room specific creep spawning
    if (Game.time % 3 === 0) {
        cpu = Game.cpu.getUsed();
        log.d('Military Build Queue');
        spawning.militaryCreepQueue();
        shib.shibBench('militarySpawn', cpu);
    }
    //Process creep build queues
    cpu = Game.cpu.getUsed();
    log.d('Process Build Queues');
    spawning.processBuildQueue();
    shib.shibBench('processBuildQueue', cpu);
    //Room HUD (If CPU Allows)
    if (!TEN_CPU && Game.cpu.getUsed() < Game.cpu.limit) {
        cpu = Game.cpu.getUsed();
        log.d('Room HUD');
        hud.hud();
        shib.shibBench('roomHud', cpu);
    }
}

function minionController(minion) {
    if (minion.spawning) return;
    if (minion.idle) return minion.say(ICONS.wait18);
    minion.notifyWhenAttacked(false);
    minion.reportDamage();
    if (minion.room.name !== minion.memory.overlord) {
        minion.room.invaderCheck();
        minion.room.cacheRoomIntel();
    }
    if (Game.time % 25 === 0) minion.room.cacheRoomIntel();
    let memoryRole = minion.memory.role;
    let creepRole = require('role.' + memoryRole);
    let start = Game.cpu.getUsed();
    try {
        creepRole.role(minion);
    } catch (e) {
        log.e(minion.name + ' experienced an error in room ' + minion.room.name);
        log.e(e.stack);
    }
    shib.shibBench(memoryRole, start, Game.cpu.getUsed());
}

module.exports.hiveMind = profiler.registerFN(mind, 'hiveMind');

