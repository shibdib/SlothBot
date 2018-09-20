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
    try {
        highCommand.highCommand();
    } catch (e) {
        log.e('High Command Module experienced an error');
        log.e(e.stack);
        Game.notify(e.stack);
    }
    shib.shibBench('highCommand', cpu);

    // Handle Labs
    cpu = Game.cpu.getUsed();
    log.d('Lab Manager Module');
    if (Game.cpu.bucket > 5000) {
        try {
            labs.labManager();
        } catch (e) {
            log.e('Lab Module experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
    }
    shib.shibBench('labControl', cpu);

    // Handle Diplomacy
    log.d('Diplomacy Module');
    try {
        diplomacy.diplomacyOverlord();
    } catch (e) {
        log.e('Diplomacy Module experienced an error');
        log.e(e.stack);
        Game.notify(e.stack);
    }

    // Military first
    log.d('Military Creep Management');
    let militaryCreeps = shuffle(_.filter(Game.creeps, (r) => r.memory.military));
    for (let key in militaryCreeps) {
        try {
            minionController(militaryCreeps[key]);
        } catch (e) {
            log.e('Military Minion Controller experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
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
        try {
            overlord.overlordMind(activeRoom, roomLimit);
        } catch (e) {
            log.e('Overlord Module experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
        //Expansion Manager
        let maxRooms = _.round((Game.cpu.limit - 15) / 20);
        if (TEN_CPU) {
            maxRooms = 2;
        }
        let needyRoom = _.filter(Memory.ownedRooms, (r) => r.memory.buildersNeeded);
        let safemoded = _.filter(Memory.ownedRooms, (r) => r.controller.safeMode);
        if (cpuBucket === 10000 && Game.time % 500 === 0 && !activeRoom.memory.claimTarget && activeRoom.controller.level >= 3 && Game.gcl.level > overlordCount && !activeClaim && overlordCount <= maxRooms && !needyRoom.length && !safemoded.length) {
            log.d('Expansion Module');
            try {
                expansion.claimNewRoom(activeRoom);
            } catch (e) {
                log.e('Expansion Module experienced an error');
                log.e(e.stack);
                Game.notify(e.stack);
            }
        }
        processed++;
    }
    //Non room specific creep spawning
    if (Game.time % 3 === 0) {
        cpu = Game.cpu.getUsed();
        log.d('Military Build Queue');
        try {
            spawning.militaryCreepQueue();
        } catch (e) {
            log.e('Military Creep queue experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
        shib.shibBench('militarySpawn', cpu);
    }
    //Process creep build queues
    if (Game.time % 2 === 0) {
        cpu = Game.cpu.getUsed();
        log.d('Process Build Queues');
        try {
            spawning.processBuildQueue();
        } catch (e) {
            log.e('Creep build queue experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
        shib.shibBench('processBuildQueue', cpu);
    }
    //Room HUD (If CPU Allows)
    if (!TEN_CPU && Game.cpu.getUsed() < Game.cpu.limit) {
        cpu = Game.cpu.getUsed();
        log.d('Room HUD');
        try {
            hud.hud();
        } catch (e) {
            log.e('Room HUD experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
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
        let used = Game.cpu.getUsed() - start;
        minion.memory.cpuUsageArray = minion.memory.cpuUsageArray || [];
        if (minion.memory.cpuUsageArray.length < 50) {
            minion.memory.cpuUsageArray.push(used)
        } else {
            minion.memory.cpuUsageArray.shift();
            minion.memory.cpuUsageArray.push(used);
            if (average(minion.memory.cpuUsageArray) > 10) {
                minion.suicide();
                log.e(minion.name + ' was killed for overusing CPU in room ' + minion.room.name);
            }
        }
        minion.room.visual.text(
            _.round(average(minion.memory.cpuUsageArray), 2),
            minion.pos.x,
            minion.pos.y,
            {opacity: 0.8, font: 0.4, stroke: '#000000', strokeWidth: 0.05}
        );
    } catch (e) {
        log.e(minion.name + ' experienced an error in room ' + minion.room.name);
        log.e(e.stack);
        Game.notify(e.stack);
    }
    shib.shibBench(memoryRole, start, Game.cpu.getUsed());
}

module.exports.hiveMind = profiler.registerFN(mind, 'hiveMind');

