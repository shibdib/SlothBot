/*
 * Copyright (c) 2019.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/1/2017.
 */
let towers = require('module.towerController');
let structureCount = {};

//Claimed Defense
module.exports.controller = function (room) {
    //Reset structure count every so often
    if (Game.time % 250 === 0) structureCount = {};
    let creeps = room.creeps;
    let structures = room.structures;

    // Check for invaders and request help
    room.invaderCheck();

    // Tower control
    towers.towerControl(room);

    // Handle nuke defense
    if (Game.time % 100 === 0) room.handleNukeAttack();

    // Check if you should safemode
    if (Game.time % 5 === 0) safeModeManager(room);

    // Abandon hopeless rooms
    if (Game.time % 5 === 0) unsavableCheck(room);

    //Manage Ramparts for Allies
    rampartManager(room, structures);

    // Early Warning System
    if (!Memory.roomCache[room.name].threatLevel) earlyWarning(room);

    // Send an email on a player attack with details of attack
    if (Memory.roomCache[room.name].threatLevel && !Memory.roomCache[room.name].alertEmail && Memory.roomCache[room.name].threatLevel >= 4) {
        Memory.roomCache[room.name].alertEmail = true;
        let playerHostile = _.filter(room.hostileCreeps, (c) => (c.getActiveBodyparts(ATTACK) >= 1 || c.getActiveBodyparts(RANGED_ATTACK) >= 1 || c.getActiveBodyparts(WORK) >= 1) && c.owner.username !== 'Invader')[0];
        if (!playerHostile || !playerHostile.length) return;
        let hostileOwners = [];
        for (let hostile of playerHostile) hostileOwners.push(hostile.owner.username)
        Game.notify('----------------------');
        Game.notify(room.name + ' - Enemy detected, room is now in FPCON DELTA.');
        Game.notify('----------------------');
        Game.notify(Memory.roomCache[room.name].numberOfHostiles + ' - Foreign Hostiles Reported');
        Game.notify('----------------------');
        Game.notify('Hostile Owners - ' + hostileOwners.toString());
        Game.notify('----------------------');
        log.a('----------------------');
        log.a(roomLink(room.name) + ' - Enemy detected, room is now in FPCON DELTA.');
        log.a('----------------------');
        log.a(Memory.roomCache[room.name].numberOfHostiles + ' - Foreign Hostiles Reported');
        log.a('----------------------');
        log.a('Hostile Owners - ' + hostileOwners.toString());
        log.a('----------------------');
    }

    // Request assistance
    if (Memory.roomCache[room.name].threatLevel) {
        if (Memory.roomCache[room.name].threatLevel >= 4 && !room.controller.safeMode) {
            Memory.roomCache[room.name].requestingSupport = true;
        }
    }
};

//Functions

function rampartManager(room, structures) {
    let allies = _.filter(room.creeps, (c) => _.includes(FRIENDLIES, c.owner.username) && !c.my);
    // Check if allies are in the room
    if (allies.length) {
        let enemies = _.filter(room.creeps, (c) => !_.includes(FRIENDLIES, c.owner.username));
        // Open ramparts
        _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && !s.isPublic && !s.pos.checkForObstacleStructure() && s.pos.getRangeTo(s.pos.findClosestByRange(allies)) <= 1 && (!enemies.length || s.pos.getRangeTo(s.pos.findClosestByRange(enemies)) > 2)).forEach((rampart) => rampart.setPublic(true));
        // Close ramparts
        _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.isPublic && (s.pos.getRangeTo(s.pos.findClosestByRange(allies)) > 1 || (enemies.length && s.pos.getRangeTo(s.pos.findClosestByRange(enemies)) <= 2))).forEach((rampart) => rampart.setPublic(false));
    } else if (room.hostileCreeps.length) {
        // Close public ones
        _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.isPublic).forEach((rampart) => rampart.setPublic(false));
    }
}

function safeModeManager(room) {
    // || !_.inRange(room.controller.level, _.max(Memory.ownedRooms, 'controller.level').controller.level - 1, _.max(Memory.ownedRooms, 'controller.level').controller.level + 1)
    if (!room.hostileCreeps.length || room.controller.safeMode || room.controller.safeModeCooldown || !room.controller.safeModeAvailable) {
        structureCount[room.name] = undefined;
        return;
    }
    let worthyCount = structureCount[room.name] || _.filter(room.structures, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_RAMPART).length;
    structureCount[room.name] = worthyCount;
    let structureLost = worthyCount > _.filter(room.structures, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_RAMPART).length;
    let damagedCritical = _.filter(room.structures, (s) => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_TERMINAL || s.structureType === STRUCTURE_STORAGE) && s.hits < s.hitsMax).length;
    let towers = _.filter(room.structures, (s) => (s.structureType === STRUCTURE_TOWER && s.energy > 10)).length;
    if (structureLost || damagedCritical > 0 || !towers) {
        let ownerArray = [];
        room.hostileCreeps.forEach((c) => ownerArray.push(c.owner.username));
        room.controller.activateSafeMode();
        log.a(roomLink(room.name) + ' has entered safemode with ' + room.hostileCreeps.length + ' attackers in the room, creep owners: ' + _.uniq(ownerArray).toString(), 'DEFENSE COMMAND');
        Game.notify(roomLink(room.name) + ' has entered safemode with ' + room.hostileCreeps.length + ' attackers in the room, creep owners: ' + _.uniq(ownerArray).toString());
    }
}

function earlyWarning(room) {
    let adjacent = _.filter(Game.map.describeExits(room.name), (r) => Memory.roomCache[r] && Memory.roomCache[r].threatLevel >= 3)[0];
    if (adjacent) {
        Memory.roomCache[room.name].threatLevel = adjacent.threatLevel;
        Memory.roomCache[room.name].tickDetected = adjacent.tickDetected;
        log.a(roomLink(room.name) + ' has gone to threat level ' + adjacent.threatLevel + ' due to a triggering of the early warning system in ' + roomLink(adjacent.name), 'DEFENSE COMMAND');
    }
}

function unsavableCheck(room) {
    // Abandon Bad Rooms
    if (room.controller.safeMode || !room.hostileCreeps.length) return;
    let hostiles = _.filter(room.hostileCreeps, (c) => !_.includes(FRIENDLIES, c.owner.username) && (c.getActiveBodyparts(ATTACK) >= 3 || c.getActiveBodyparts(RANGED_ATTACK) >= 3 || c.getActiveBodyparts(WORK) >= 3));
    let worthyStructures = _.filter(room.structures, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_TOWER && s.my);
    let towers = _.filter(room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.my);
    let badCount = room.memory.badCount || 0;
    if (hostiles.length && !worthyStructures.length && hostiles.length >= towers.length * 2) {
        if (Game.time % 1500 === 0) {
            room.memory.badCount = badCount + 1;
        }
        if (room.memory.badCount > room.controller.level) {
            let hostileOwners = [];
            for (let hostile of hostiles) hostileOwners.push(hostile.owner.username)
            abandonOverrun(room);
            room.cacheRoomIntel(true);
            Memory.roomCache[room.name].noClaim = true;
            log.a(room.name + ' has been abandoned due to a prolonged enemy presence. (Enemies - ' + hostileOwners.toString() + ')');
            Game.notify(room.name + ' has been abandoned due to a prolonged enemy presence. (Enemies - ' + hostileOwners.toString() + ')');
        }
    } else {
        if (badCount === 0) {
            room.memory.badCount = undefined;
        } else {
            room.memory.badCount = badCount - 1;
        }
    }
}

abandonOverrun = function (room) {
    for (let creep of room.creeps) {
        if (!creep.my) continue;
        creep.memory.recycle = true;
    }
    let overlordFor = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === room.name);
    for (let creep of overlordFor) {
        creep.memory.recycle = true;
    }
    for (let structure of room.structures) {
        structure.destroy();
    }
    for (let site of room.constructionSites) {
        site.remove();
    }
    delete room.memory;
    delete Memory.rooms[room.name];
    delete Memory.roomCache[room.name];
    room.controller.unclaim();
};