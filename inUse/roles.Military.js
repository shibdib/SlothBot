let cache = require('module.cache');
let _ = require('lodash');
let profiler = require('screeps-profiler');

let doNotAggress = RawMemory.segments[2];


function Manager(creep) {
    if (creep.memory.role === "defender") {
        defender(creep);
    } else if (creep.memory.role === "deconstructor") {
        deconstructor(creep);
    } else if (creep.memory.role === "healer") {
        healer(creep);
    } else if (creep.memory.role === "scout") {
        scout(creep);
    } else if (creep.memory.role === "attacker") {
        attacker(creep);
    } else if (creep.memory.role === "claimer") {
        claimer(creep);
    } else if (creep.memory.role === "reserver") {
        reserver(creep);
    } else if (creep.memory.role === "raider") {
        raider(creep);
    } else if (creep.memory.role === "responder") {
        responder(creep);
    } else if (creep.memory.role === "ranged") {
        ranged(creep);
    }
}
module.exports.Manager = profiler.registerFN(Manager, 'managerMilitary');

/**
 * @return {null}
 */
function scout(creep) {
    cache.cacheRoomIntel(creep);
    if (creep.memory.destinationReached !== true) {
        let armedHostile = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(doNotAggress, e.owner['username']) === false});
        if (creep.pos.getRangeTo(armedHostile) < 2) {
            this.kite();
        }
        creep.travelTo(new RoomPosition(25, 25, creep.memory.destination), {range: 24,maxOps: 50000,ensurePath:true});
        if (creep.pos.roomName === creep.memory.destination) {
            cache.cacheRoomIntel(creep);
            creep.memory.destinationReached = true;
        }
    } else {
        creep.say("I.See.U", true);
        cache.cacheRoomIntel(creep);
    }
}
scout = profiler.registerFN(scout, 'scoutMilitary');

/**
 * @return {null}
 */
function healer(creep) {
    cache.cacheRoomIntel(creep);
    if (creep.memory.boostAttempt !== true) {
        let desiredReactions = [
        ];
        let count = 1;
        for (let i = 0; i < desiredReactions.length; i++) {
            let lab = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_LAB && s.mineralType === desiredReactions[i] && s.mineralAmount >= 30 && s.energy >= 20});
            if (lab) {
                count++;
                if (lab.boostCreep(creep) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(lab);
                }
            }
        }
        if (count === 1) {
            creep.memory.boostAttempt = true;
        }
        return null;
    }
    if (creep.hits < creep.hitsMax) {
        creep.heal(creep);
    }
    if (creep.memory.attackType === 'raid') {
        if (Game.time % 15 === 0 && Memory.warControl[creep.memory.attackTarget]) {
            let hostiles = creep.room.find(FIND_CREEPS, {filter: (c) => _.includes(RawMemory.segments[2], c.owner['username']) === false});
            let armedHostile = _.filter(hostiles, (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(RawMemory.segments[2], e.owner['username']) === false);
            let healers = _.filter(hostiles, (e) => (e.getActiveBodyparts(HEAL) >= 3) && _.includes(RawMemory.segments[2], e.owner['username']) === false);
            if ((armedHostile.length > 3 && healers.length > 1) || armedHostile.length > 4 && healers.length > 0) {
                Memory.warControl[creep.memory.attackTarget].threat = 2;
            }
            else if ((armedHostile.length > 2 && healers.length > 0) || armedHostile.length > 3 && healers.length > 0) {
                Memory.warControl[creep.memory.attackTarget].threat = 1;
            } else {
                Memory.warControl[creep.memory.attackTarget].threat = 0;
            }
        }
    }
    let squadLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.squadLeader === true);
    if (squadLeader.length === 0 || creep.memory.squadLeader === true) {
        creep.tacticSquadLeaderMedic()
    } else {
        creep.tacticMedic()
    }
}
healer = profiler.registerFN(healer, 'healerMilitary');

/**
 * @return {null}
 */
function attacker(creep) {
    cache.cacheRoomIntel(creep);
    if (creep.memory.boostAttempt !== true) {
        let desiredReactions = [
        ];
        let count = 1;
        for (let i = 0; i < desiredReactions.length; i++) {
            let lab = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_LAB && s.mineralType === desiredReactions[i] && s.mineralAmount >= 30 && s.energy >= 20});
            if (lab) {
                count++;
                if (lab.boostCreep(creep) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(lab);
                }
            }
        }
        if (count === 1) {
            creep.memory.boostAttempt = true;
        }
        return null;
    }
    let meleeLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.meleeLeader === true);
    if (meleeLeader.length === 0) creep.memory.meleeLeader = true;
    if (creep.memory.attackType === 'raid') {
        if (Game.time % 15 === 0 && Memory.warControl[creep.memory.attackTarget]) {
            let hostiles = creep.room.find(FIND_CREEPS, {filter: (c) => _.includes(RawMemory.segments[2], c.owner['username']) === false});
            let armedHostile = _.filter(hostiles, (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(RawMemory.segments[2], e.owner['username']) === false);
            let healers = _.filter(hostiles, (e) => (e.getActiveBodyparts(HEAL) >= 3) && _.includes(RawMemory.segments[2], e.owner['username']) === false);
            if ((armedHostile.length > 3 && healers.length > 1) || armedHostile.length > 4 && healers.length > 0) {
                Memory.warControl[creep.memory.attackTarget].threat = 2;
            }
            else if ((armedHostile.length > 2 && healers.length > 0) || armedHostile.length > 3 && healers.length > 0) {
                Memory.warControl[creep.memory.attackTarget].threat = 1;
            } else {
                Memory.warControl[creep.memory.attackTarget].threat = 0;
            }
        }
    }
    if (creep.memory.meleeLeader === true) {
        creep.meleeTeamLeader();
    } else {
        creep.meleeTeamMember();
    }
}
attacker = profiler.registerFN(attacker, 'attackerMilitary');

/**
 * @return {null}
 */
function ranged(creep) {
    cache.cacheRoomIntel(creep);
    if (creep.memory.boostAttempt !== true) {
        let desiredReactions = [
            RESOURCE_GHODIUM_OXIDE,
            RESOURCE_KEANIUM_OXIDE
        ];
        let count = 1;
        for (let i = 0; i < desiredReactions.length; i++) {
            let lab = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_LAB && s.mineralType === desiredReactions[i] && s.mineralAmount >= 30 && s.energy >= 20});
            if (lab) {
                count++;
                if (lab.boostCreep(creep) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(lab);
                }
            }
        }
        if (count === 1) {
            creep.memory.boostAttempt = true;
        }
        return null;
    }
    let rangedLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.rangedLeader === true);
    if (rangedLeader.length === 0) creep.memory.rangedLeader = true;
    if (creep.memory.attackType === 'raid') {
        if (Game.time % 15 === 0 && Memory.warControl[creep.memory.attackTarget]) {
            let hostiles = creep.room.find(FIND_CREEPS, {filter: (c) => _.includes(RawMemory.segments[2], c.owner['username']) === false});
            let armedHostile = _.filter(hostiles, (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(RawMemory.segments[2], e.owner['username']) === false);
            let healers = _.filter(hostiles, (e) => (e.getActiveBodyparts(HEAL) >= 3) && _.includes(RawMemory.segments[2], e.owner['username']) === false);
            if ((armedHostile.length > 3 && healers.length > 1) || armedHostile.length > 4 && healers.length > 0) {
                Memory.warControl[creep.memory.attackTarget].threat = 2;
            }
            else if ((armedHostile.length > 0 && healers.length > 0) || armedHostile.length > 3 && healers.length === 0) {
                Memory.warControl[creep.memory.attackTarget].threat = 1;
            } else {
                Memory.warControl[creep.memory.attackTarget].threat = 0;
            }
        }
    }
    if (creep.memory.rangedLeader === true) {
        creep.rangedTeamLeader();
    } else {
        creep.rangedTeamMember();
    }
}
ranged = profiler.registerFN(ranged, 'rangedMilitary');

/**
 * @return {null}
 */
function deconstructor(creep) {
    cache.cacheRoomIntel(creep);
    if (creep.memory.boostAttempt !== true) {
        let desiredReactions = [
        ];
        let count = 1;
        for (let i = 0; i < desiredReactions.length; i++) {
            let lab = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_LAB && s.mineralType === desiredReactions[i] && s.mineralAmount >= 30 && s.energy >= 20});
            if (lab) {
                count++;
                if (lab.boostCreep(creep) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(lab);
                }
            }
        }
        if (count === 1) {
            creep.memory.boostAttempt = true;
        }
        return null;
    }
    creep.tacticSiege();
}
deconstructor = profiler.registerFN(deconstructor, 'deconstructorMilitary');

/**
 * @return {null}
 */
function claimer(creep) {
    //Initial move

    if (!Game.flags[creep.memory.destination]) {
        creep.suicide();
    }
    if (!creep.memory.destinationReached) {
        creep.travelTo(Game.flags[creep.memory.destination]);
        if (creep.pos.getRangeTo(Game.flags[creep.memory.destination]) <= 3) {
            creep.memory.destinationReached = true;
        }
    } else {
        if (creep.room.controller) {
            if (creep.claimController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                creep.travelTo(creep.room.controller);
            }
        }
    }
}
claimer = profiler.registerFN(claimer, 'claimerMilitary');

/**
 * @return {null}
 */
function reserver(creep) {
    //Invader detection
    invaderCheck(creep);
    let reservers = creep.pos.findClosestByRange(FIND_MY_CREEPS, {filter: (c) => c.memory.role === 'reserver' && c.name !== creep.name});
    if (creep.memory.invaderDetected === true) {
        creep.travelTo(Game.getObjectById(creep.memory.assignedSpawn));
        creep.memory.visitedRooms.push(creep.memory.currentDestination);
        creep.memory.currentDestination = undefined;
    }
    if (!creep.memory.targetRooms) {
        creep.memory.targetRooms = Game.map.describeExits(creep.memory.assignedRoom)
    }
    if (creep.memory.reserving) {
        if ((creep.room.controller.reservation && creep.room.controller.reservation['ticksToEnd'] >= 1500) || creep.room.controller.owner) {
            creep.memory.reserving = undefined;
        } else if (creep.reserveController(creep.room.controller) === ERR_NOT_IN_RANGE || creep.signController(creep.room.controller, "Reserved Territory of Overlords - #overlords on Slack") === ERR_NOT_IN_RANGE) {
            creep.travelTo(creep.room.controller);
        }
        return null;
    }
    if (!creep.memory.currentDestination) {
        for (let key in creep.memory.targetRooms) {
            creep.memory.currentDestination = creep.memory.targetRooms[key];
        }
        creep.memory.visitedRooms = [];
    }
    if (creep.pos.roomName !== creep.memory.currentDestination) {
        creep.travelTo((new RoomPosition(25, 25, creep.memory.currentDestination))); //to move to any room
    } else {
        if (creep.room.controller && !creep.room.controller.owner && (!creep.room.controller.reservation || (creep.room.controller.reservation['username'] === 'Shibdib' && creep.room.controller.reservation['ticksToEnd'] < 1000)) && !reservers) {
            creep.travelTo(creep.room.controller);
            creep.memory.reserving = true;
        } else {
            creep.memory.visitedRooms.push(creep.memory.currentDestination);
            creep.memory.currentDestination = undefined;
            for (let key in creep.memory.targetRooms) {
                if (_.includes(creep.memory.visitedRooms, creep.memory.targetRooms[key]) === false) {
                    creep.memory.currentDestination = creep.memory.targetRooms[key];
                }
            }
        }
    }
}
reserver = profiler.registerFN(reserver, 'reserverMilitary');

/**
 * @return {null}
 */
function raider(creep) {
    cache.cacheRoomIntel(creep);
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.returning = true;
        creep.memory.destinationReached = false;
    }
    if (creep.carry.energy === 0) {
        creep.memory.returning = false;
    }
    if (creep.memory.returning === true) {
        if (creep.room.name === Game.getObjectById(creep.memory.assignedSpawn).pos.roomName) {
            let terminal = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'terminal'), 'id');
            let storage = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'storage'), 'id');
            if (terminal.length > 0) {
                creep.memory.storageDestination = terminal[0];
            } else if (storage.length > 0) {
                creep.memory.storageDestination = storage[0];
            }
            if (creep.memory.storageDestination) {
                let storageItem = Game.getObjectById(creep.memory.storageDestination);
                if (creep.transfer(storageItem, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(storageItem);
                } else {
                    creep.memory.storageDestination = null;
                    creep.memory.path = null;
                }
                return null;
            }
            creep.findStorage();
        } else {
            creep.travelTo(Game.getObjectById(creep.memory.assignedSpawn));
            return null;
        }
        return null;
    }
    //Initial move
    if (!creep.memory.destinationReached) {
        creep.travelTo(Game.flags[creep.memory.attackTarget]);
        if (creep.pos.getRangeTo(Game.flags[creep.memory.attackTarget]) <= 3) {
            creep.memory.destinationReached = true;
        }
    } else {
        let storage = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE && s.store[RESOURCE_ENERGY] !== 0});
        if (storage) {
            if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.travelTo(storage);
            }
        } else {
            let extension = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_EXTENSION && s.energy !== 0});
            if (extension) {
                if (creep.withdraw(extension, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(extension);
                }
            } else {
                let spawn = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_SPAWN && s.energy !== 0});
                if (spawn) {
                    if (creep.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        creep.travelTo(spawn);
                    }
                } else {
                    let terminal = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TERMINAL && s.energy !== 0});
                    if (terminal) {
                        if (creep.withdraw(terminal, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                            creep.travelTo(terminal);
                        }
                    } else {
                        if (creep.carry.energy > 0) {
                            creep.memory.returning = true;
                            creep.memory.destinationReached = false;
                        }
                    }
                }
            }
        }
    }
}
raider = profiler.registerFN(raider, 'raiderMilitary');

/**
 * @return {null}
 */
function responder(creep) {
    if (creep.memory.boostAttempt !== true) {
        let desiredReactions = [
            RESOURCE_KEANIUM_OXIDE
        ];
        let count = 1;
        for (let i = 0; i < desiredReactions.length; i++) {
            let lab = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_LAB && s.mineralType === desiredReactions[i] && s.mineralAmount >= 30 && s.energy >= 20});
            if (lab) {
                count++;
                if (lab.boostCreep(creep) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(lab);
                }
            }
        }
        if (count === 1) {
            creep.memory.boostAttempt = true;
        }
        return null;
    }
    creep.borderCheck();
    if (creep.hits < creep.hitsMax / 2) {
        creep.heal(creep);
    }

    if (Game.rooms[creep.memory.responseTarget] && creep.pos.roomName === Game.rooms[creep.memory.responseTarget].name) {
        creep.memory.destinationReached = true;
    }

    let armedHostile = creep.pos.findClosestByRange(FIND_CREEPS, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1 || e.getActiveBodyparts(WORK) >= 1) && _.includes(doNotAggress, e.owner['username']) === false});
    let closestHostileSpawn = creep.pos.findClosestByRange(FIND_HOSTILE_SPAWNS);
    let closestHostileTower = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TOWER});
    let closestHostile = creep.pos.findClosestByRange(FIND_CREEPS, {filter: (e) => _.includes(doNotAggress, e.owner['username']) === false});
    let friendlies = creep.pos.findInRange(FIND_CREEPS, 15, {filter: (c) => c.hits < c.hitsMax && _.includes(doNotAggress, c.owner['username']) === true});
    if (armedHostile) {
        if (creep.pos.roomName === creep.memory.assignedRoom) {
            if (creep.attack(armedHostile) === ERR_NOT_IN_RANGE) {
                findDefensivePosition(creep, armedHostile);
            }
            creep.rangedAttack(armedHostile);
        } else {
            if (creep.attack(armedHostile) === ERR_NOT_IN_RANGE) {
                creep.travelTo(armedHostile);
            }
            creep.rangedAttack(armedHostile);
        }
    } else if (closestHostileTower) {
        if (creep.attack(closestHostileTower) === ERR_NOT_IN_RANGE) {
            creep.travelTo(closestHostileTower);
        }
    } else if (closestHostileSpawn) {
        if (creep.attack(closestHostileSpawn) === ERR_NOT_IN_RANGE) {
            creep.travelTo(closestHostileSpawn);
        }
    } else if (closestHostile) {
        if (creep.pos.roomName === creep.memory.assignedRoom) {
            if (creep.attack(closestHostile) === ERR_NOT_IN_RANGE) {
                findDefensivePosition(creep, closestHostile);
            }
            creep.rangedAttack(closestHostile);
        } else {
            if (creep.attack(closestHostile) === ERR_NOT_IN_RANGE) {
                creep.travelTo(closestHostile);
            }
            creep.rangedAttack(closestHostile);
        }
    } else if (friendlies.length > 0 && creep.room.memory.responseNeeded !== true && creep.memory.destinationReached === true) {
        if (creep.heal(friendlies[0]) === ERR_NOT_IN_RANGE) {
            if (creep.heal(friendlies[0]) === ERR_NOT_IN_RANGE) {
                creep.travelTo(friendlies[0]);
            }
        }
    } else if (creep.memory.destinationReached !== true && Game.rooms[creep.memory.responseTarget]) {
        if (creep.pos.roomName === Game.rooms[creep.memory.responseTarget].name) {
            creep.memory.destinationReached = true;
        }
        creep.moveTo(new RoomPosition(25, 25, Game.rooms[creep.memory.responseTarget].name), {range: 21}); //to move to any room
    } else if (Game.getObjectById(creep.memory.assignedRampart)) {
        if (Game.getObjectById(creep.memory.assignedRampart).pos.x !== creep.pos.x || Game.getObjectById(creep.memory.assignedRampart).pos.y !== creep.pos.y) {
            creep.travelTo(Game.getObjectById(creep.memory.assignedRampart));
        }
    } else if (!creep.memory.assignedRampart || !Game.getObjectById(creep.memory.assignedRampart)) {
        findDefensivePosition(creep, creep);
    }
}
responder = profiler.registerFN(responder, 'responderMilitary');

function invaderCheck(creep) {
    let invader = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {filter: (c) => (c.getActiveBodyparts(ATTACK) >= 1 || c.getActiveBodyparts(RANGED_ATTACK) >= 1 || c.getActiveBodyparts(WORK) >= 1) && _.includes(RawMemory.segments[2], c.owner['username']) === false});
    if (invader) {
        let number = creep.room.find(FIND_HOSTILE_CREEPS, {filter: (c) => _.includes(RawMemory.segments[2], c.owner['username']) === false});
        creep.room.memory.responseNeeded = true;
        creep.room.memory.tickDetected = Game.time;
        if (!creep.room.memory.numberOfHostiles || creep.room.memory.numberOfHostiles < number.length) {
            creep.room.memory.numberOfHostiles = number.length;
        }
        creep.memory.invaderDetected = true;
    } else if (creep.room.memory.tickDetected < Game.time - 150) {
        creep.memory.invaderDetected = undefined;
        creep.memory.invaderID = undefined;
        creep.room.memory.numberOfHostiles = undefined;
        creep.room.memory.responseNeeded = false;
    }
}
invaderCheck = profiler.registerFN(invaderCheck, 'invaderCheckMilitary');

function findDefensivePosition(creep, target) {
    if (target) {
        let bestRampart = target.pos.findClosestByPath(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
        let armedHostile = creep.pos.findClosestByRange(FIND_CREEPS, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1 || e.getActiveBodyparts(WORK) >= 1) && _.includes(doNotAggress, e.owner['username']) === false});
        if (bestRampart && bestRampart.pos !== creep.pos) {
            creep.memory.pathAge = 999;
            bestRampart = target.pos.findClosestByPath(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_RAMPART && (r.pos.lookFor(LOOK_CREEPS).length === 0 || (r.pos.x === creep.pos.x && r.pos.y === creep.pos.y))});
            creep.memory.assignedRampart = bestRampart.id;
            if (bestRampart.pos !== creep.pos && (creep.pos.getRangeTo(bestRampart) < creep.pos.getRangeTo(armedHostile) || !armedHostile)) {
                creep.travelTo(bestRampart);
            }
        }
    }
}
findDefensivePosition = profiler.registerFN(findDefensivePosition, 'findDefensivePositionMilitary');

