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

    // Abandon hopeless rooms
    unSavableCheck(room);

    if (Game.time % 100 === 0) {
        // Handle nuke defense
        handleNukeAttack(room);
    }

    // Check if you should safemode
    if (Memory.roomCache[room.name].threatLevel > 2 || room.controller.safemode) safeModeManager(room);

    // Tower control
    //let woundedCreep = _.find(room.friendlyCreeps, (c) => c.hits < c.hitsMax && _.includes(FRIENDLIES, c.owner.username)) || _.find(room.powerCreeps, (c) => c.hits < c.hitsMax && _.includes(FRIENDLIES, c.owner.username));
    //if (room.hostileCreeps.length || Game.time % 50 === 0 || woundedCreep) towers.towerControl(room);
    towers.towerControl(room);

    //Manage Ramparts for Allies
    if (RAMPART_ACCESS && FRIENDLIES.length) rampartManager(room, structures);

    // Early Warning System
    if (Game.time % 25 === 0) earlyWarning(room);

    // Send an email on a player attack with details of attack
    if (Memory.roomCache[room.name].threatLevel && !Memory.roomCache[room.name].alertEmail && Memory.roomCache[room.name].threatLevel >= 4) {
        Memory.roomCache[room.name].alertEmail = true;
        let playerHostile = _.filter(room.hostileCreeps, (c) => (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(WORK) || c.hasActiveBodyparts(CLAIM)) && c.owner.username !== 'Invader');
        if (!playerHostile || !playerHostile.length) return;
        let hostileOwners = [];
        for (let hostile of playerHostile) hostileOwners.push(hostile.owner.username)
        hostileOwners = _.uniq(hostileOwners);
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
        let nukeTargets = Memory.MAD || [];
        hostileOwners.forEach((p) => nukeTargets.push(p))
        Memory.MAD = _.uniq(nukeTargets);
    }

    // Request assistance
    if (Memory.roomCache[room.name].threatLevel) {
        if (Memory.roomCache[room.name].threatLevel >= 3 && !room.controller.safeMode) {
            Memory.roomCache[room.name].requestingSupport = true;
        }
    }
};

//Functions

function rampartManager(room, structures) {
    let enemies = _.filter(room.creeps, (c) => !_.includes(FRIENDLIES, c.owner.username));
    // Open all if no enemies
    if (!enemies.length) {
        _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && !s.isPublic).forEach((rampart) => rampart.setPublic(true));
        return;
    }
    // Handle ramparts near enemies
    let allies = _.filter(room.creeps, (c) => _.includes(FRIENDLIES, c.owner.username) && !c.my);
    if (allies.length) {
        // Close ramparts
        _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.isPublic && s.pos.getRangeTo(s.pos.findClosestByRange(enemies)) <= 1).forEach((rampart) => rampart.setPublic(false));
        // Open ramparts
        _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.isPublic && s.pos.getRangeTo(s.pos.findClosestByRange(enemies)) > 1).forEach((rampart) => rampart.setPublic(true));
    } else if (room.hostileCreeps.length) {
        // Close public ones
        _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.isPublic).forEach((rampart) => rampart.setPublic(false));
    }
    // Close ones protecting stuff
    _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.isPublic && s.pos.checkForObstacleStructure()).forEach((rampart) => rampart.setPublic(false));
}

function safeModeManager(room) {
    // Ensure camping enemies continue to gain threat even if no creeps present.
    addThreat(room);
    // Handle an active safemode
    if (room.controller.safemode) {
        // Setup guards for when the safemode ends
        if (room.controller.safemode < 750) {
            let endingTick = Game.time + room.controller.safemode;
            room.memory.defenseCooldown = endingTick + 2500;
        }
    } else {
        let armedHostiles = _.filter(room.hostileCreeps, (c) => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(WORK) || c.hasActiveBodyparts(CLAIM));
        if (!armedHostiles.length || room.controller.safeMode || room.controller.safeModeCooldown || !room.controller.safeModeAvailable) return;
        // Check if any attacks occurred last tick
        let keyAttack;
        let attackEvents = _.filter(room.getEventLog(), (e) => e.event === EVENT_ATTACK);
        if (attackEvents[0]) {
            for (let attack of attackEvents) {
                let attackedObject = Game.getObjectById(attack.data.targetId);
                if (attackedObject instanceof Creep) {
                    keyAttack = true;
                    break;
                } else if (attackedObject instanceof Structure && !_.includes([STRUCTURE_ROAD, STRUCTURE_WALL, STRUCTURE_RAMPART], attackedObject.structureType)) {
                    keyAttack = true;
                    break;
                }
            }
        }
        let towers = _.filter(room.structures, (s) => (s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] > 10)).length > 0;
        // If attacks occurred and we have no towers or the defense is ineffective safemode
        if ((!towers || room.memory.dangerousAttack) && keyAttack) {
            if (room.controller.activateSafeMode() === OK) {
                let ownerArray = [];
                room.hostileCreeps.forEach((c) => ownerArray.push(c.owner.username));
                log.a(roomLink(room.name) + ' has entered safemode with ' + room.hostileCreeps.length + ' attackers in the room, creep owners: ' + _.uniq(ownerArray).toString(), 'DEFENSE COMMAND');
                Game.notify(roomLink(room.name) + ' has entered safemode with ' + room.hostileCreeps.length + ' attackers in the room, creep owners: ' + _.uniq(ownerArray).toString());
            }
        }
    }
}

function earlyWarning(room) {
    let adjacent = _.filter(Game.map.describeExits(room.name), (r) => Memory.roomCache[r] && Memory.roomCache[r].threatLevel >= 4 && Memory.roomCache[r].threatLevel > Memory.roomCache[room.name].threatLevel)[0];
    if (adjacent) {
        Memory.roomCache[room.name].threatLevel = Memory.roomCache[adjacent].threatLevel;
        Memory.roomCache[room.name].tickDetected = Game.time;
    }
}

function unSavableCheck(room) {
    let badCount = room.memory.badCount || 0;
    let worthwhileStructure = _.find(room.structures, (s) => [STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_TERMINAL].includes(s.structureType));
    if ((Memory.roomCache[room.name].threatLevel > 2 || !worthwhileStructure) && _.size(Memory.myRooms) !== 1 && !room.controller.safeMode && !room.controller.safeModeAvailable) {
        let hostiles = _.filter(room.hostileCreeps, (c) => c.owner.username !== 'Invader' && (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(WORK)));
        // If hostiles add a badCount
        if (hostiles.length && room.energy < ENERGY_AMOUNT[room.level] * 0.025 && _.size(Memory.myRooms) === Game.gcl.level) room.memory.badCount += 1;
        // If all worthwhile structures are gone add badCount
        if (!worthwhileStructure) room.memory.badCount += 0.5;
        // If badCount is high enough abandon
        if (room.memory.badCount > room.controller.level * 400) {
            abandonOverrun(room);
            room.cacheRoomIntel(true);
            Memory.roomCache[room.name].noClaim = Game.time;
            log.a(roomLink(room.name) + ' has been abandoned.');
            Game.notify(room.name + ' has been abandoned.');
        } else if (badCount < room.memory.badCount) {
            log.a(roomLink(room.name) + ' has accrued an abandon point. (' + room.memory.badCount + '/' + room.controller.level * 500 + ')');
        }
    } else if (room.memory.badCount) {
        if (badCount <= 0) {
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
            let cache = Memory._userList || {};
            let standing;
            if (cache[user]) {
                standing = cache[user]['standing'] + 0.25;
                if (standing >= 1500) standing = 1500;
            } else if (!cache[user]) {
                standing = 25;
                log.e(roomLink(room.name) + ' has detected a neutral.' + user + ' has now been marked hostile for trespassing.', 'DIPLOMACY:');
            }
            cache[user] = {
                standing: standing,
                lastAction: Game.time,
            };
            Memory._userList = cache;
        }
    }
}

abandonOverrun = function (room) {
    let overlordFor = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === room.name);
    if (overlordFor.length) {
        for (let key in overlordFor) {
            overlordFor[key].suicide();
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
    room.cacheRoomIntel(true);
    Memory.roomCache[room.name].noClaim = Game.time;
    room.controller.unclaim();
};

handleNukeAttack = function (room) {
    let nukes = room.find(FIND_NUKES);
    if (!nukes.length) {
        room.memory.nuke = undefined;
        return false;
    }
    room.memory.nuke = _.min(nukes, '.timeToLand').timeToLand;
    let launchRoom = _.sample(nukes).launchRoomName;
    if (Memory.roomCache[launchRoom] && Memory.roomCache[launchRoom].owner) {
        let nukeTargets = Memory.MAD || [];
        nukeTargets.push(Memory.roomCache[launchRoom].owner);
        Memory.MAD = _.uniq(nukeTargets)
    }
    for (let nuke of nukes) {
        if (nuke.timeToLand <= 75) {
            for (let c of nuke.room.creeps) {
                c.memory.fleeNukeTime = Game.time + nuke.timeToLand + 2;
                c.memory.fleeNukeRoom = nuke.room.name;
            }
            return true;
        }
        let structures = nuke.pos.findInRange(FIND_MY_STRUCTURES, 5, {filter: (s) => s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_STORAGE || s.structureType === STRUCTURE_TERMINAL || s.structureType === STRUCTURE_FACTORY || s.structureType === STRUCTURE_POWER_SPAWN});
        for (let structure of structures) {
            if (structure.pos.checkForConstructionSites() || structure.pos.checkForRampart()) continue;
            structure.pos.createConstructionSite(STRUCTURE_RAMPART);
        }
    }
    return true;
};