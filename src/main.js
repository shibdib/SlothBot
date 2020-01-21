/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

//modules
//Setup globals and prototypes
require("require");
let hive = require('main.hive');
let cleanUp = require('module.cleanup');
const tickLengthArray = [];
const lastGlobal = Memory.lastGlobalReset || Game.time;
let memCleaned, LAST_MEMORY_TICK;
log.e('Global Reset - Last reset occurred ' + (Game.time - lastGlobal) + ' ticks ago.');
Memory.lastGlobalReset = Game.time;

module.exports.loop = function () {
    tryInitSameMemory();
    // Handle cleaning memory for respawn
    if (!memCleaned && !_.filter(Game.rooms, (r) => r.controller && r.controller.owner && r.controller.my && (r.memory.bunkerHub || r.memory.praiseRoom)).length) {
        for (let key in Memory) delete Memory[key];
    }
    memCleaned = true;

    //Logging level
    Memory.loggingLevel = 4; //Set level 1-5 (5 being most info)

    // Store owned rooms in array
    if (!Memory.myRooms || !Memory.myRooms.length || Math.random() > 0.5) {
        let myRooms = _.filter(Game.rooms, (r) => r.controller && r.controller.owner && r.controller.my);
        if (myRooms.length) {
            Memory.myRooms = _.pluck(myRooms, '.name');
            Memory.maxLevel = _.max(myRooms, 'controller.level').controller.level;
            Memory.minLevel = _.min(myRooms, 'controller.level').controller.level;
        }
    }

    // Get Tick Length
    let d = new Date();
    let seconds = _.round(d.getTime() / 1000, 2);
    let lastTick = Memory.lastTick || seconds;
    Memory.lastTick = seconds;
    let tickLength = seconds - lastTick;
    if (tickLengthArray.length < 50) {
        tickLengthArray.push(tickLength)
    } else {
        tickLengthArray.shift();
        tickLengthArray.push(tickLength)
    }
    Memory.tickLength = average(tickLengthArray);

    //Routine status
    if (Game.time % 100 === 0) status();

    //Update allies
    populateLOANlist();

    //Must run modules
    cleanUp.cleanup();

    //Bucket Check
    if (Memory.cooldown) {
        if (Memory.cooldown + 25 < Game.time) {
            delete Memory.cooldown;
        } else {
            let countDown = (Memory.cooldown + 25) - Game.time;
            log.e('On CPU Cooldown For ' + countDown + ' more ticks. Current Bucket ' + Game.cpu.bucket);
            return;
        }
    } else if (Game.cpu.bucket < Game.cpu.limit * 10) {
        Memory.cooldown = Game.time;
        log.e('Skipping tick ' + Game.time + ' due to lack of CPU.');
        return;
    }

    //Hive Mind
    if (Memory.myRooms && Memory.myRooms.length) hive.hiveMind();
    //});
};

abandon = function (room) {
    if (!Game.rooms[room] || !Game.rooms[room].memory.bunkerHub) return log.e(room + ' does not appear to be owned by you.');
    let overlordFor = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === room);
    if (overlordFor.length) {
        for (let key in overlordFor) {
            overlordFor[key].memory.recycle = true;
        }
    }
    for (let key in Game.rooms[room].structures) {
        Game.rooms[room].structures[key].destroy();
    }
    for (let key in Game.rooms[room].constructionSites) {
        Game.rooms[room].constructionSites[key].remove();
    }
    let noClaim = Memory.noClaim || [];
    noClaim.push(room);
    delete Game.rooms[room].memory;
    room.cacheRoomIntel(true);
    Memory.roomCache[room.name].noClaim = Game.time;
    Game.rooms[room].controller.unclaim();
};

function tryInitSameMemory() {
    if (LAST_MEMORY_TICK && global.LastMemory && Game.time === (LAST_MEMORY_TICK + 1)) {
        delete global.Memory;
        global.Memory = global.LastMemory;
        RawMemory._parsed = global.LastMemory;
    } else {
        Memory;
        global.LastMemory = RawMemory._parsed;
    }
    LAST_MEMORY_TICK = Game.time;
}

nukes = function (target) {
    let nukes = _.filter(Game.structures, (s) => s.structureType === STRUCTURE_NUKER && s.energy === s.energyCapacity && s.ghodium === s.ghodiumCapacity && !s.cooldown);
    if (target) nukes = _.filter(Game.structures, (s) => s.structureType === STRUCTURE_NUKER && s.energy === s.energyCapacity && s.ghodium === s.ghodiumCapacity && !s.cooldown && Game.map.getRoomLinearDistance(s.room.name, target) <= 10);
    if (!nukes.length && !target) return log.a('No nukes available');
    if (!nukes.length && target) return log.a('No nukes available in range of ' + target);
    for (let key in nukes) {
        if (target) log.a(nukes[key].room.name + ' has a nuclear missile available that is in range of ' + target);
        if (!target) log.a(nukes[key].room.name + ' has a nuclear missile available.')
    }
};

status = function () {
    log.a('---------------------------------------------------------------------------', ' ');
    log.a('--GLOBAL INFO--', ' ');
    log.e('GCL - ' + Game.gcl.level + ' | GCL Progress - ' + ((_.round(Game.gcl.progress / Game.gcl.progressTotal, 2)) * 100) + '% | Creep Count - ' + _.size(Game.creeps), ' ');
    log.a('--ROOM INFO--', ' ');
    let myRooms = _.filter(Game.rooms, (r) => r.energyAvailable && r.controller.owner && r.controller.owner.username === MY_USERNAME);
    for (let activeRoom of myRooms) {
        if (!activeRoom.controller) continue;
        let marauder, averageCpu = 'No Data';
        if (ROOM_CPU_ARRAY[activeRoom.name]) averageCpu = _.round(average(ROOM_CPU_ARRAY[activeRoom.name]), 2) || 'No Data';
        let roomCreeps = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === activeRoom.name);
        let marauderText = '';
        let marauderCreep = _.filter(roomCreeps, (c) => c.memory.operation === 'marauding')[0];
        if (marauderCreep) {
            marauder = roomLink(marauderCreep.pos.roomName);
            marauderText = '| Marauder Location - ' + marauder + ' ';
        }
        log.e(roomLink(activeRoom.name) + ' | RCL - ' + activeRoom.controller.level + ' | CPU Usage - ' + averageCpu + ' | RCL Progress - ' + ((_.round(activeRoom.controller.progress / activeRoom.controller.progressTotal, 2)) * 100) + '% | Energy Available - ' + activeRoom.energy + ' | Avg. Energy Income - ' + _.round(average(JSON.parse(ROOM_ENERGY_INCOME_ARRAY[activeRoom.name])), 0) + ' ' + marauderText + '| Creep Count: ' + _.size(roomCreeps), ' ');
    }
    if (Memory.targetRooms && _.size(Memory.targetRooms)) {
        log.a('--OPERATION INFO--', ' ');
        for (let key in Memory.targetRooms) {
            let level = Memory.targetRooms[key].level;
            let type = Memory.targetRooms[key].type;
            if (type === 'scout' || type === 'attack') continue;
            let priority = Memory.targetRooms[key].priority || 4;
            if (Memory.targetRooms[key].enemyDead || Memory.targetRooms[key].friendlyDead) {
                log.e(_.capitalize(type) + ' | Level - ' + level + ' | Priority - ' + priority + ' | Room ' + roomLink(key) + ' | Enemy KIA - ' + Memory.targetRooms[key].trackedEnemy.length + '/' + Memory.targetRooms[key].enemyDead + ' | Friendly KIA - ' + Memory.targetRooms[key].trackedFriendly.length + '/' + Memory.targetRooms[key].friendlyDead, ' ');
            } else if (Memory.targetRooms[key].type === 'pending') {
                log.e(_.capitalize(type) + ' | Countdown - ' + (Memory.targetRooms[key].dDay - Game.time) + ' ticks | Room ' + roomLink(key), ' ');
            } else {
                log.e(_.capitalize(type) + ' | Level - ' + level + ' | Priority - ' + priority + ' | Room ' + roomLink(key), ' ');
            }
        }
        let scouts = _.filter(Memory.targetRooms, (t) => t.type === 'scout' || t.type === 'attack');
        if (scouts.length) log.e('Scout Target Count - ' + scouts.length, ' ');
    }
    if (Memory._badBoyArray && Memory._badBoyArray.length) {
        log.a('--DIPLOMATIC INFO--', ' ');
        if (Memory._enemies && Memory._enemies.length) log.e('Current Enemies: ' + Memory._enemies.join(", "), ' ');
        if (Memory._nuisance && Memory._nuisance.length) log.e('Current Nuisances: ' + Memory._nuisance.join(", "), ' ');
        if (Memory._threatList && Memory._threatList.length) log.e('Current Threats: ' + Memory._threatList.join(", "), ' ');
    }
    return log.a('---------------------------------------------------------------------------', ' ');
};