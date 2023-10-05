/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

/**
 * Created by Bob on 7/1/2017.
 */
const towers = require('module.towerController');
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
    if (INTEL[room.name].threatLevel > 2 || room.controller.safeMode) safeModeManager(room);

    // Tower control
    towers.towerControl(room);

    //Manage Ramparts for Allies
    // If we aren't allowing access set it once and then return to save cpu
    if (!Memory._rampartsSet || RAMPART_ACCESS) rampartManager(room, structures);

    // Early Warning System
    if (Game.time % 5 === 0) earlyWarning(room);

    // Send an email on a player attack with details of attack
    if (INTEL[room.name].threatLevel && !INTEL[room.name].alertEmail && INTEL[room.name].threatLevel >= 4) {
        INTEL[room.name].alertEmail = true;
        let playerHostile = _.filter(room.hostileCreeps, (c) => (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(WORK) || c.hasActiveBodyparts(CLAIM)) && c.owner.username !== 'Invader');
        if (!playerHostile || !playerHostile.length) return;
        let hostileOwners = [];
        for (let hostile of playerHostile) hostileOwners.push(hostile.owner.username)
        hostileOwners = _.uniq(hostileOwners);
        Game.notify('----------------------');
        Game.notify(roomHistoryLink(room.name) + ' - Enemy detected, room is now in FPCON DELTA.');
        Game.notify('----------------------');
        Game.notify(INTEL[room.name].numberOfHostiles + ' - Foreign Hostiles Reported');
        Game.notify('----------------------');
        Game.notify('Hostile Owners - ' + JSON.stringify(hostileOwners));
        Game.notify('----------------------');
        log.a('----------------------');
        log.a(roomHistoryLink(room.name) + ' - Enemy detected, room is now in FPCON DELTA.');
        log.a('----------------------');
        log.a(INTEL[room.name].numberOfHostiles + ' - Foreign Hostiles Reported');
        log.a('----------------------');
        log.a('Hostile Owners - ' + JSON.stringify(hostileOwners));
        log.a('----------------------');
    }

    // Request assistance
    if (INTEL[room.name].threatLevel) {
        if (INTEL[room.name].threatLevel >= 3 && !room.controller.safeMode) {
            INTEL[room.name].requestingSupport = true;
        }
    }
};

//Functions
function rampartManager(room, structures) {
    // Close if no rampart access
    if (!RAMPART_ACCESS) {
        Memory._rampartsSet = true;
        _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.isPublic).forEach((rampart) => rampart.setPublic(false));
        return;
    } else Memory._rampartsSet = undefined;
    // Open all if no enemies
    if (!room.hostileCreeps.length) {
        _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && !s.isPublic).forEach((rampart) => rampart.setPublic(true));
        return;
    }
    // Handle ramparts near enemies
    let allies = _.filter(room.creeps, (c) => _.includes(FRIENDLIES, c.owner.username) && !c.my);
    if (allies.length) {
        // Close ramparts
        _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.isPublic && s.pos.getRangeTo(s.pos.findClosestByRange(room.hostileCreeps)) <= 1).forEach((rampart) => rampart.setPublic(false));
        // Open ramparts
        _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.isPublic && s.pos.getRangeTo(s.pos.findClosestByRange(room.hostileCreeps)) > 1).forEach((rampart) => rampart.setPublic(true));
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
    if (room.controller.safeMode) {
        room.memory.defenseCooldown = undefined;
        // Setup guards for when the safemode ends
        if (room.controller.safeMode < 750 && room.level >= 5) {
            let endingTick = Game.time + room.controller.safeMode;
            room.memory.defenseCooldown = endingTick + CREEP_LIFE_TIME * 0.5;
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
                if (attackedObject) {
                    if (attackedObject instanceof Creep) {
                        keyAttack = true;
                        break;
                    } else if (attackedObject instanceof Structure && !_.includes([STRUCTURE_ROAD, STRUCTURE_WALL, STRUCTURE_RAMPART], attackedObject.structureType)) {
                        keyAttack = true;
                        break;
                    }
                }
            }
        }
        let towers = _.filter(room.impassibleStructures, (s) => (s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] > 10)).length > 0;
        // If attacks occurred and we have no towers or the defense is ineffective safemode
        if ((!towers || room.memory.dangerousAttack) && keyAttack && room.level >= MAX_LEVEL - 1) {
            if (room.controller.activateSafeMode() === OK) {
                let ownerArray = [];
                room.hostileCreeps.forEach((c) => ownerArray.push(c.owner.username));
                log.a(roomLink(room.name) + ' has entered safemode with ' + room.hostileCreeps.length + ' attackers in the room, creep owners: ' + JSON.stringify(_.uniq(ownerArray)), 'DEFENSE COMMAND');
                Game.notify(room.name + ' has entered safemode with ' + room.hostileCreeps.length + ' attackers in the room, creep owners: ' + JSON.stringify(_.uniq(ownerArray)));
            }
        }
    }
}

function earlyWarning(room) {
    let adjacent = _.find(Game.map.describeExits(room.name), (r) => INTEL[r] && INTEL[r].threatLevel >= 3 && INTEL[r].threatLevel > INTEL[room.name].threatLevel);
    if (adjacent && adjacent.name) {
        INTEL[room.name].threatLevel = INTEL[adjacent.name].threatLevel;
        INTEL[room.name].tickDetected = Game.time;
        log.a('----------------------');
        log.a(roomLink(adjacent.name) + ' - Enemy detected in a remote of ' + roomLink(room.name) + '.');
        log.a('----------------------');
    }
}

function unSavableCheck(room) {
    let badCount = room.memory.badCount || 0;
    let worthwhileStructure = _.find(room.impassibleStructures, (s) => [STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_TERMINAL].includes(s.structureType)) || _.find(room.myCreeps, (c) => c.memory.role === 'drone');
    if (Game.gcl.level <= MY_ROOMS.length && INTEL[room.name].threatLevel > 2 && MY_ROOMS.length > 1 && !room.controller.safeMode && !worthwhileStructure) {
        let hostiles = _.filter(room.hostileCreeps, (c) => c.owner.username !== 'Invader' && (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(WORK)));
        // If hostiles add a badCount
        if (hostiles.length) room.memory.badCount += hostiles.length;
        // If all worthwhile structures are gone add badCount
        room.memory.badCount += 1;
        // If badCount is high enough abandon
        if (room.memory.badCount > room.controller.level * 500) {
            abandonRoom(room);
            log.a(roomLink(room.name) + ' has been abandoned.');
            Game.notify(room.name + ' has been abandoned.');
        } else if (badCount < room.memory.badCount) {
            if (badCount % 10 === 0) log.a(roomLink(room.name) + ' has accrued an abandon point. (' + badCount + '/' + room.controller.level * 500 + ')');
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

handleNukeAttack = function (room) {
    let nukes = room.find(FIND_NUKES);
    if (!nukes.length) {
        room.memory.nuke = undefined;
        return false;
    }
    room.memory.nuke = _.min(nukes, '.timeToLand').timeToLand;
    let launchRoom = _.sample(nukes).launchRoomName;
    if (INTEL[launchRoom] && INTEL[launchRoom].owner) {
        let nukeTargets = Memory.MAD || [];
        nukeTargets.push(INTEL[launchRoom].owner);
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