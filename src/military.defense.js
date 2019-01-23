/**
 * Created by Bob on 7/1/2017.
 */
let towers = require('module.towerController');
let shib = require("shibBench");
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
    let towerCpu = Game.cpu.getUsed();
    towers.towerControl(room);
    shib.shibBench('towerController', towerCpu);

    // Handle nuke defense
    if (Game.time % 100 === 0) room.handleNukeAttack();

    // Check if you should safemode
    if (Game.time % 5 === 0) safeModeManager(room);

    // Abandon hopeless rooms
    if (Game.time % 5 === 0) unsavableCheck(room);

    //Manage Ramparts for Allies
    rampartManager(room, structures);

    // Early Warning System
    //earlyWarning(room);

    // Send an email on a player attack with details of attack
    if (room.memory.responseNeeded && !room.memory.alertEmail && room.memory.threatLevel >= 4) {
        room.memory.alertEmail = true;
        let playerHostile = _.filter(room.hostileCreeps, (c) => (c.getActiveBodyparts(ATTACK) >= 1 || c.getActiveBodyparts(RANGED_ATTACK) >= 1 || c.getActiveBodyparts(WORK) >= 1) && c.owner.username !== 'Invader')[0];
        if (!playerHostile || !playerHostile.length) return;
        let hostileOwners = [];
        for (let hostile of playerHostile) hostileOwners.push(hostile.owner.username)
        Game.notify('----------------------');
        Game.notify(room.name + ' - Enemy detected, room is now in FPCON DELTA.');
        Game.notify('----------------------');
        Game.notify(room.memory.numberOfHostiles + ' - Foreign Hostiles Reported');
        Game.notify('----------------------');
        Game.notify('Hostile Owners - ' + hostileOwners.toString());
        Game.notify('----------------------');
        log.a('----------------------');
        log.a(room.name + ' - Enemy detected, room is now in FPCON DELTA.');
        log.a('----------------------');
        log.a(room.memory.numberOfHostiles + ' - Foreign Hostiles Reported');
        log.a('----------------------');
        log.a('Hostile Owners - ' + hostileOwners.toString());
        log.a('----------------------');
    }

    // Request assistance
    if (room.memory.responseNeeded) {
        let towers = _.filter(room.structures, (c) => c.structureType === STRUCTURE_TOWER && c.energy >= 10);
        let responders = _.filter(creeps, (c) => c.memory && c.memory.role === 'responder' && c.memory.overlord === room.name);
        if (((!towers.length && !responders.length) || room.memory.threatLevel >= 4 || room.energy < 1000) && !room.controller.safeMode) {
            room.memory.requestingSupport = true;
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
    if (!room.hostileCreeps.length || room.controller.safeMode || room.controller.safeModeCooldown || !room.controller.safeModeAvailable || !_.inRange(room.controller.level, _.max(Memory.ownedRooms, 'controller.level').controller.level - 1, _.max(Memory.ownedRooms, 'controller.level').controller.level + 1)) return;
    let worthyCount = structureCount[room.name] || _.filter(room.structures, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_CONTROLLER).length;
    let structureLost = worthyCount > _.filter(room.structures, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_CONTROLLER).length;
    let damagedCritical = _.filter(room.structures, (s) => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && s.hits < s.hitsMax).length;
    structureCount[room.name] = worthyCount;
    if (structureLost || damagedCritical > 0) {
        let ownerArray = [];
        room.hostileCreeps.forEach((c) => ownerArray.push(c.owner.username));
        room.controller.activateSafeMode();
        log.a(roomLink(room.name) + ' has entered safemode with ' + room.hostileCreeps.length + ' attackers in the room, creep owners: ' + _.uniq(ownerArray).toString());
        Game.notify(roomLink(room.name) + ' has entered safemode with ' + room.hostileCreeps.length + ' attackers in the room, creep owners: ' + _.uniq(ownerArray).toString());
    }
}

function earlyWarning(room) {
    let earlyWarning;
    if (room.memory.remoteRooms) earlyWarning = _.filter(room.memory.remoteRooms, (r) => Memory.roomCache[r] && Memory.roomCache[r].threatLevel >= 3);
    room.memory.earlyWarning = !!earlyWarning.length;
}

function unsavableCheck(room) {
    // Abandon Bad Rooms
    if (room.controller.safeMode || !room.hostileCreeps.length) return;
    let hostiles = _.filter(room.hostileCreeps, (c) => !_.includes(FRIENDLIES, c.owner.username) && (c.getActiveBodyparts(ATTACK) >= 3 || c.getActiveBodyparts(RANGED_ATTACK) >= 3 || c.getActiveBodyparts(WORK) >= 3));
    let worthyStructures = _.filter(room.structures, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_TOWER && s.my);
    let towers = _.filter(room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.my);
    let badCount = room.memory.badCount || 0;
    if (room.controller.level <= 4 && hostiles.length && !worthyStructures.length && hostiles.length >= towers.length * 2) {
        if (Game.time % 20 === 0) {
            room.memory.badCount = badCount + 1;
        }
        if (room.memory.badCount > 3) {
            let hostileOwners = [];
            for (let hostile of hostiles) hostileOwners.push(hostile.owner.username)
            abandonOverrun(room);
            room.cacheRoomIntel(true);
            Memory.roomCache[room.name].noClaim = true;
            log.a(room.name + ' has been abandoned due to a prolonged enemy presence. (Enemies - ' + hostileOwners.toString());
            Game.notify(room.name + ' has been abandoned due to a prolonged enemy presence. (Enemies - ' + hostileOwners.toString());
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
    for (let key in room.creeps) {
        room.creeps[key].suicide();
    }
    let overlordFor = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === room.name);
    for (let key in overlordFor) {
        overlordFor[key].suicide();
    }
    for (let key in room.structures) {
        room.structures[key].destroy();
    }
    for (let key in room.constructionSites) {
        room.constructionSites[key].remove();
    }
    delete room.memory;
    delete Memory.rooms[room.name];
    delete Memory.roomCache[room.name];
    room.controller.unclaim();
};