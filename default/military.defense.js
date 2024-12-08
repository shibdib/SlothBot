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
    // Reset structure count periodically
    resetStructureCount();

    // Handle room threats
    handleRoomThreats(room);

    // Manage defensive structures
    towers.towerControl(room);

    // Manage ramparts
    if (!Memory._rampartsSet || RAMPART_ACCESS) rampartManager(room, room.structures);

    // Early warning system (run every 5 ticks)
    if (Game.time % 5 === 0) earlyWarning(room);

    // Periodic Nuke Defense Check
    if (Game.time % 100 === 0) handleNukeAttack(room);

    // Manage Safe Mode
    if (INTEL[room.name].threatLevel > 2 || room.controller.safeMode) safeModeManager(room);

    // Handle request for assistance if threat level is high
    requestSupportIfNeeded(room);

    // Check for foreign hostile attacks and notify
    alertHostileAttack(room);
};

// Function to reset the structure count every 250 ticks
function resetStructureCount() {
    if (Game.time % 250 === 0) structureCount = {};
}

// Function to handle invaders and abandoned rooms
function handleRoomThreats(room) {
    // Check for invaders and request help
    room.invaderCheck();

    // Check if the room is savable or should be abandoned
    unSavableCheck(room);
}

// Function to handle alerting for hostile players and logging
function alertHostileAttack(room) {
    if (INTEL[room.name].threatLevel >= 4 && !INTEL[room.name].alertEmail) {
        INTEL[room.name].alertEmail = true;

        // Filter hostile creeps that are not Invaders
        let playerHostile = _.filter(room.hostileCreeps, (c) => (
            (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(WORK) || c.hasActiveBodyparts(CLAIM)) &&
            c.owner.username !== 'Invader'
        ));

        if (!playerHostile || !playerHostile.length) return;

        let hostileOwners = _.uniq(playerHostile.map(hostile => hostile.owner.username));

        // Send notification and log the alert
        sendHostileNotification(room, hostileOwners);
    }
}

// Function to send hostile attack notification
function sendHostileNotification(room, hostileOwners) {
    const historyLink = roomHistoryLink(room.name);
    Game.notify('----------------------');
    Game.notify(`${historyLink} - Enemy detected, room is now in FPCON DELTA.`);
    Game.notify('----------------------');
    Game.notify(`${INTEL[room.name].numberOfHostiles} - Foreign Hostiles Reported`);
    Game.notify('----------------------');
    Game.notify(`Hostile Owners - ${JSON.stringify(hostileOwners)}`);
    Game.notify('----------------------');

    log.a('----------------------');
    log.a(`${historyLink} - Enemy detected, room is now in FPCON DELTA.`);
    log.a('----------------------');
    log.a(`${INTEL[room.name].numberOfHostiles} - Foreign Hostiles Reported`);
    log.a('----------------------');
    log.a(`Hostile Owners - ${JSON.stringify(hostileOwners)}`);
    log.a('----------------------');
}

// Function to request assistance if threat level is high
function requestSupportIfNeeded(room) {
    if (INTEL[room.name].threatLevel >= 3 && !room.controller.safeMode) {
        INTEL[room.name].requestingSupport = true;
    }
}


//Functions
function rampartManager(room, structures) {
    // Exit early if rampart access is disabled
    if (!RAMPART_ACCESS) {
        Memory._rampartsSet = true;
        _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.isPublic).forEach((rampart) => rampart.setPublic(false));
        return;
    }

    // Reset rampartsSet flag when rampart access is allowed
    Memory._rampartsSet = undefined;

    // Open all ramparts if there are no hostile creeps
    if (!room.hostileCreeps.length) {
        _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && !s.isPublic).forEach((rampart) => rampart.setPublic(true));
        return;
    }

    // Handle ramparts based on the presence of friendly or hostile creeps
    const allies = _.filter(room.creeps, (c) => _.includes(FRIENDLIES, c.owner.username) && !c.my);
    const hostileCreeps = room.hostileCreeps;

    // If there are allies in the room
    if (allies.length) {
        // Close ramparts near enemies
        _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.isPublic)
            .forEach((rampart) => {
                const closestHostile = rampart.pos.findClosestByRange(hostileCreeps);
                if (closestHostile && rampart.pos.getRangeTo(closestHostile) <= 1) {
                    rampart.setPublic(false);
                }
            });

        // Open ramparts that are not too close to enemies
        _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && !s.isPublic)
            .forEach((rampart) => {
                const closestHostile = rampart.pos.findClosestByRange(hostileCreeps);
                if (closestHostile && rampart.pos.getRangeTo(closestHostile) > 1) {
                    rampart.setPublic(true);
                }
            });
    }
    // If no allies but hostile creeps are present
    else if (hostileCreeps.length) {
        // Close public ramparts that are exposed to enemies
        _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.isPublic)
            .forEach((rampart) => rampart.setPublic(false));
    }

    // Close ramparts that are protecting structures or are in the way
    _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.isPublic && s.pos.checkForObstacleStructure())
        .forEach((rampart) => rampart.setPublic(false));
}

function safeModeManager(room) {
    // Ensure camping enemies continue to gain threat even if no creeps present.
    addThreat(room);

    // Handle an active safemode
    if (room.controller.safeMode) {
        room.memory.defenseCooldown = undefined;

        // Setup defense cooldown based on when safemode ends
        if (room.controller.safeMode < 750 && room.level >= 5) {
            let endingTick = Game.time + room.controller.safeMode;
            room.memory.defenseCooldown = endingTick + CREEP_LIFE_TIME * 0.5;
        }
        return;
    }

    // If there's no available SafeMode and the room's controller is vulnerable, exit
    if (!room.controller.safeModeAvailable || room.controller.safeModeCooldown) return;

    // Calculate room's threat level dynamically
    let threatLevel = assessRoomThreat(room);
    if (threatLevel < 1) return;

    // Preemptive Safemode for High Threat Level (e.g., large group of attackers or invaders detected)
    if (threatLevel > 3 && room.level >= MAX_LEVEL - 1) {
        // Activate SafeMode early before a major attack occurs
        activateSafeMode(room);
        return;
    }

    // If attack events happened last tick, react to them
    let keyAttack = detectRecentAttack(room);
    if (keyAttack && threatLevel >= 3) {
        // Trigger safemode only if defense is inadequate
        let towers = _.filter(room.impassibleStructures, (s) => s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] > 10);
        if (!towers.length || room.memory.dangerousAttack) {
            activateSafeMode(room);
        }
    }
}

// Function to assess the threat level dynamically
function assessRoomThreat(room) {
    let threatLevel = 0;

    // Count armed hostile creeps (attack, ranged, work, claim parts)
    let armedHostiles = _.filter(room.hostileCreeps, (c) => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(WORK) || c.hasActiveBodyparts(CLAIM));

    // Increase threat level based on number of hostile creeps
    threatLevel += armedHostiles.length;

    // Add additional points if hostiles are nearby the controller or spawns
    let criticalStructures = [room.controller, ...room.find(FIND_MY_SPAWNS)];
    for (let hostile of armedHostiles) {
        if (criticalStructures.some(struct => struct.pos.inRangeTo(hostile, 3))) {
            threatLevel += 2; // Close proximity to critical structures increases threat
        }
    }

    // Consider invaders separately
    let invaders = _.filter(armedHostiles, (c) => c.owner.username === 'Invader');
    if (invaders.length) {
        threatLevel += 3; // Invaders are a high priority threat
    }

    // Additional points for multiple attack types (e.g., range + melee)
    let attackTypes = _.uniq(armedHostiles.map(c => c.body.filter(part => part.type === ATTACK || part.type === RANGED_ATTACK)));
    if (attackTypes.length > 1) {
        threatLevel += 2; // Multiple attack types (e.g., ranged + melee) increases threat
    }

    return threatLevel;
}

// Function to detect if an attack occurred last tick
function detectRecentAttack(room) {
    let attackEvents = _.filter(room.getEventLog(), (e) => e.event === EVENT_ATTACK);
    return attackEvents.length > 0;
}

// Function to activate SafeMode and notify
function activateSafeMode(room) {
    if (room.controller.activateSafeMode() === OK) {
        let ownerArray = _.uniq(room.hostileCreeps.map(c => c.owner.username));
        log.a(roomLink(room.name) + ' has entered safemode with ' + room.hostileCreeps.length + ' attackers in the room, creep owners: ' + JSON.stringify(ownerArray), 'DEFENSE COMMAND');
        Game.notify(room.name + ' has entered safemode with ' + room.hostileCreeps.length + ' attackers in the room, creep owners: ' + JSON.stringify(ownerArray));
    }
}

// Early warning system optimized and integrated with SafeMode
function earlyWarning(room) {
    let adjacent = _.find(Game.map.describeExits(room.name), (r) => INTEL[r] && INTEL[r].threatLevel >= 3 && INTEL[r].threatLevel > INTEL[room.name].threatLevel);

    if (adjacent && adjacent.name) {
        // If a threat in an adjacent room is detected, update the current room's threat level
        INTEL[room.name].threatLevel = INTEL[adjacent.name].threatLevel;
        INTEL[room.name].tickDetected = Game.time;

        log.a('----------------------');
        log.a(roomLink(adjacent.name) + ' - Enemy detected in a remote of ' + roomLink(room.name) + '.');
        log.a('----------------------');

        // Based on the updated threat level, potentially activate Safe Mode
        let threatLevel = assessRoomThreat(room);
        if (threatLevel > 3) {
            activateSafeMode(room);
        }
    }
}

function unSavableCheck(room) {
    let badCount = room.memory.badCount || 0;
    let worthwhileStructure = _.find(room.impassibleStructures, (s) => [STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_TERMINAL].includes(s.structureType)) ||
        _.find(room.myCreeps, (c) => c.memory.role === 'drone');

    // If room is not in safe mode and there are no worthwhile structures
    if (Game.gcl.level <= MY_ROOMS.length && INTEL[room.name].threatLevel > 2 && MY_ROOMS.length > 1 && !room.controller.safeMode && !worthwhileStructure) {
        let hostiles = _.filter(room.hostileCreeps, (c) => c.owner.username !== 'Invader' && (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(WORK)));

        // If there are hostiles, add to badCount
        if (hostiles.length) room.memory.badCount += hostiles.length;

        // If there are no worthwhile structures left, add to badCount
        if (!worthwhileStructure) room.memory.badCount += 1;

        // Adjust the threshold based on the room's importance (core rooms have a higher threshold)
        let abandonThreshold = room.controller.level * 500;
        if (room.controller.level <= 2) abandonThreshold = 100; // For lower-level rooms, a smaller threshold

        // If badCount exceeds the threshold, abandon room
        if (room.memory.badCount > abandonThreshold) {
            abandonRoom(room);
            log.a(roomLink(room.name) + ' has been abandoned.');
            Game.notify(room.name + ' has been abandoned.');
        } else if (badCount < room.memory.badCount) {
            if (room.memory.badCount % 10 === 0) {
                log.a(roomLink(room.name) + ' has accrued an abandon point. (' + room.memory.badCount + '/' + abandonThreshold + ')');
            }
        }
    } else if (room.memory.badCount) {
        // If badCount decreases (room is recovering), reset the bad count to prevent premature abandonment
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

function handleNukeAttack(room) {
    // Find all nukes in the room
    let nukes = room.find(FIND_NUKES);
    if (!nukes.length) {
        room.memory.nuke = undefined;
        return false;
    }

    // Determine when the closest nuke will land
    room.memory.nuke = _.min(nukes, 'timeToLand').timeToLand;

    // Identify the launch room and track its owner for MAD (Mutually Assured Destruction) purposes
    let launchRoom = _.sample(nukes).launchRoomName;
    if (INTEL[launchRoom] && INTEL[launchRoom].owner) {
        let nukeTargets = Memory.MAD || [];
        nukeTargets.push(INTEL[launchRoom].owner);
        Memory.MAD = _.uniq(nukeTargets);
    }

    // If the nuke is landing in less than 75 ticks, order the creeps to flee
    for (let nuke of nukes) {
        if (nuke.timeToLand <= 75) {
            // Fleeing logic: assign a time to flee and the room to flee to
            for (let c of nuke.room.creeps) {
                c.memory.fleeNukeTime = Game.time + nuke.timeToLand + 2;
                c.memory.fleeNukeRoom = nuke.room.name;
            }
            return true;
        }

        // Protect important structures by creating ramparts around them
        let structures = nuke.pos.findInRange(FIND_MY_STRUCTURES, 5, {
            filter: (s) => [
                STRUCTURE_SPAWN,
                STRUCTURE_STORAGE,
                STRUCTURE_TERMINAL,
                STRUCTURE_FACTORY,
                STRUCTURE_POWER_SPAWN
            ].includes(s.structureType)
        });

        // Create ramparts if they don't exist
        for (let structure of structures) {
            if (structure.pos.checkForConstructionSites() || structure.pos.checkForRampart()) continue;
            structure.pos.createConstructionSite(STRUCTURE_RAMPART);
        }
    }
    return true;
}
