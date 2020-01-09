/*
 * Copyright (c) 2020.
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
    let structures = room.structures;

    // Check for invaders and request help
    room.invaderCheck();

    // Handle nuke defense
    if (Game.time % 5 === 0) handleNukeAttack(room);

    // Check if you should safemode
    if (Game.time % 5 === 0) safeModeManager(room);

    // Abandon hopeless rooms
    if (Game.time % 100 === 0) unSavableCheck(room);

    // Tower control
    towers.towerControl(room);

    //Manage Ramparts for Allies
    rampartManager(room, structures);

    // Early Warning System
    earlyWarning(room);

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
    // Ensure camping enemies continue to gain threat even if no creeps present.
    addThreat(room);
    let controller = room.controller;
    if (!room.hostileCreeps.length || controller.safeMode || controller.safeModeCooldown || !controller.safeModeAvailable || controller.ticksToDowngrade || controller.level < 3) {
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
    let adjacent = _.filter(Game.map.describeExits(room.name), (r) => Memory.roomCache[r] && Memory.roomCache[r].threatLevel > Memory.roomCache[room.name].threatLevel && !Memory.roomCache[r].sk && !Memory.roomCache[r].isHighway)[0];
    if (adjacent) {
        Memory.roomCache[room.name].threatLevel = Memory.roomCache[adjacent].threatLevel;
        Memory.roomCache[room.name].tickDetected = Game.time;
        log.a(roomLink(room.name) + ' has gone to threat level ' + Memory.roomCache[adjacent].threatLevel + ' due to a triggering of the early warning system in ' + roomLink(adjacent) + '.', 'DEFENSE COMMAND');
    } else if (room.controller.safeMode && room.controller.safeMode < 1700) {
        Memory.roomCache[room.name].threatLevel = 4;
        Memory.roomCache[room.name].tickDetected = Game.time;
    }
}

function unSavableCheck(room) {
    // Abandon Bad Rooms
    if (room.controller.safeMode || !room.hostileCreeps.length) return;
    let towers = _.filter(room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.my);
    let badCount = room.memory.badCount || 0;
    if (room.hostileCreeps.length && !towers.length) {
        room.memory.badCount = badCount + 1;
        if (room.memory.badCount > room.controller.level + 2) {
            let hostileOwners = [];
            for (let hostile of room.hostileCreeps) hostileOwners.push(hostile.owner.username)
            abandonOverrun(room);
            room.cacheRoomIntel(true);
            Memory.roomCache[room.name].noClaim = true;
            log.a(room.name + ' has been abandoned due to a prolonged enemy presence. (Enemies - ' + _.uniq(hostileOwners).toString() + ')');
            Game.notify(room.name + ' has been abandoned due to a prolonged enemy presence. (Enemies - ' + _.uniq(hostileOwners).toString() + ')');
        }
    } else {
        if (badCount === 0) {
            room.memory.badCount = undefined;
        } else {
            room.memory.badCount = badCount - 1;
        }
    }
}

function addThreat(room) {
    let neutrals = _.uniq(_.pluck(_.filter(room.creeps, (c) => !c.my && !_.includes(FRIENDLIES, c.owner.username) && c.owner.username !== 'Invader' && c.owner.username !== 'Source Keeper'), 'owner.username'));
    if (neutrals.length) {
        for (let user of neutrals) {
            if (user === MY_USERNAME || _.includes(FRIENDLIES, user)) continue;
            let cache = Memory._badBoyList || {};
            let threatRating;
            if (cache[user]) {
                threatRating = cache[user]['threatRating'] + 0.25;
                if (threatRating >= 1500) threatRating = 1500;
            } else if (!cache[user]) {
                threatRating = 25;
                log.e(name + ' has detected a neutral in ' + roomLink(room.name) + '. ' + user + ' has now been marked hostile for trespassing.', 'DIPLOMACY:');
            }
            cache[user] = {
                threatRating: threatRating,
                lastAction: Game.time,
            };
            Memory._badBoyList = cache;
        }
    }
}

abandonOverrun = function (room) {
    let overlordFor = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === room.name);
    if (overlordFor.length) {
        for (let key in overlordFor) {
            overlordFor[key].memory.recycle = true;
        }
    }
    for (let key in room.structures) {
        room.structures[key].destroy();
    }
    for (let key in room.constructionSites) {
        room.constructionSites[key].remove();
    }
    let noClaim = Memory.noClaim || [];
    noClaim.push(room.name);
    delete room.memory;
    delete Memory.roomCache[room.name];
    room.controller.unclaim();
};

handleNukeAttack = function (room) {
    let nukes = room.find(FIND_NUKES);
    if (!nukes.length) {
        room.memory.nuke = undefined;
        return false;
    }
    room.memory.nuke = _.min(nukes, '.timeToLand').timeToLand;
    for (let nuke of nukes) {
        if (nuke.timeToLand <= 75) {
            for (let c of nuke.room.creeps) {
                c.memory.fleeNukeTime = Game.time + nuke.timeToLand + 2;
                c.memory.fleeNukeRoom = nuke.room.name;
            }
            return true;
        }
        let structures = nuke.pos.findInRange(FIND_MY_STRUCTURES, 5, {filter: (s) => s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_STORAGE || s.structureType === STRUCTURE_TERMINAL});
        for (let structure of structures) {
            if (structure.pos.checkForConstructionSites() || structure.pos.checkForRampart()) continue;
            structure.pos.createConstructionSite(STRUCTURE_RAMPART);
        }
    }
    return true;
};