let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');
let pathing = require('module.pathFinder');
let militaryFunctions = require('module.militaryFunctions');
let _ = require('lodash');

let doNotAggress = [
    //Alliance Members
    'Shibdib',
    'PostCrafter',
    'Rising',
    'wages123',

    //Non aggression pacts
    'droben'];


module.exports.Manager = function (creep) {
    if (creep.memory.role === "defender") {
        defender(creep);
    } else if (creep.memory.role === "sentry") {
        sentry(creep);
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
    }
};

function defender(creep) {
    const targets = creep.pos.findInRange(FIND_CREEPS, 10, {filter: (e) => _.includes(doNotAggress, e.owner['username']) === false});
    const closestHostile = creep.pos.findClosestByRange(FIND_CREEPS, {filter: (e) => _.includes(doNotAggress, e.owner['username']) === false});
    if (targets.length > 0) {
        creep.say('ATTACKING');
        if (creep.attack(closestHostile) === ERR_NOT_IN_RANGE) {
            creep.moveTo(closestHostile, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
        }
    } else {
        pathing.Move(creep, creep.memory.assignedSpawn);
    }
}
/**
 * @return {null}
 */
function sentry(creep) {
    const targets = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3);
    if (targets.length > 0) {
        creep.rangedMassAttack();
        creep.say('ATTACKING')
    } else {
        militaryFunctions.findDefensivePosition(creep);
    }
}
/**
 * @return {null}
 */
function healer(creep) {

    //RENEWAL
    if (creepTools.renewal(creep) === true) {
        return null;
    }

    if (!Game.flags[creep.memory.attackTarget]) {
        creep.suicide();
    }

    let attackers = _.filter(Game.creeps, (a) => a.memory.attackTarget === creep.memory.attackTarget && a.memory.role === 'attacker');
    const targets = creep.pos.findInRange(FIND_MY_CREEPS, 15, {filter: (c) => c.hits < c.hitsMax});
    if (targets.length > 0) {
        if (creep.heal(targets[0]) === ERR_NOT_IN_RANGE) {
            if (creep.rangedHeal(targets[0]) === ERR_NOT_IN_RANGE) {
                creep.moveTo(targets[0], {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
    } else {
        if (attackers.length > 0) {
            pathing.Move(creep, attackers[0], false, 16);
        } else {
            let closestTower = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TOWER});
            pathing.Move(creep, closestTower, false, 1);
        }
    }
}
/**
 * @return {null}
 */
function scout(creep) {
    if (creep.memory.destinationReached !== true) {
        pathing.Move(creep, Game.flags[creep.memory.destination], false, 16);
        if (creep.pos.getRangeTo(Game.flags[creep.memory.destination]) <= 1) {
            creep.memory.destinationReached = true;
        }
    } else {
        let HostileCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
        if (HostileCreeps.length > 0) {
            creep.memory.enemyCount = HostileCreeps.length;
            creep.memory.enemyPos = HostileCreeps[0].pos;
        } else {
            creep.memory.enemyCount = null;
            creep.memory.enemyPos = null;
        }
    }
}
/**
 * @return {null}
 */
function attacker(creep) {
    if (!Game.flags[creep.memory.attackTarget]) {
        creep.suicide();
    }
    if (creep.hits < creep.hitsMax) {
        creep.heal(creep);
    }
    let attackers = _.filter(Game.creeps, (a) => a.memory.attackTarget === creep.memory.attackTarget && a.memory.role === 'attacker');
    let healers = _.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.role === 'healer');

    let armedHostile = creep.pos.findClosestByRange(FIND_CREEPS, {filter: (e) => e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1 && _.includes(doNotAggress, e.owner['username']) === false});
    let closestHostileSpawn = creep.pos.findClosestByRange(FIND_HOSTILE_SPAWNS);
    let closestHostileTower = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TOWER});
    let closestHostile = creep.pos.findClosestByRange(FIND_CREEPS, {filter: (e) => _.includes(doNotAggress, e.owner['username']) === false});
    let hostileStructures = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES);
    if (armedHostile) {
        if (creep.attack(armedHostile) === ERR_NOT_IN_RANGE) {
            pathing.AttackMove(creep, armedHostile);
        }
    } else if (closestHostileTower) {
        if (creep.attack(closestHostileTower) === ERR_NOT_IN_RANGE) {
            pathing.AttackMove(creep, closestHostileTower);
        }
    } else if (closestHostileSpawn) {
        if (creep.attack(closestHostileSpawn) === ERR_NOT_IN_RANGE) {
            pathing.AttackMove(creep, closestHostileSpawn);
        }
    } else if (closestHostile) {
        if (creep.attack(closestHostile) === ERR_NOT_IN_RANGE) {
            pathing.AttackMove(creep, closestHostile);
        }
    } else if (hostileStructures) {
        if (creep.attack(hostileStructures) === ERR_NOT_IN_RANGE) {
            pathing.AttackMove(creep, hostileStructures);
        }
    } else if (creep.memory.attackStarted !== true) {
        let closestTower = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TOWER});
        pathing.Move(creep, closestTower, false, 1);
        let nearbyAttackers = creep.pos.findInRange(attackers, 5);
        let nearbyHealers = creep.pos.findInRange(healers, 5);
        if (nearbyAttackers.length >= creep.memory.waitForAttackers && nearbyHealers.length >= creep.memory.waitForHealers) {
            creep.memory.attackStarted = true;
        }
    } else {
        pathing.Move(creep, Game.flags[creep.memory.attackTarget], false, 16);
    }
}
/**
 * @return {null}
 */
function claimer(creep) {
    //Initial move

    if (!Game.flags[creep.memory.destination]) {
        creep.suicide();
    }
    if (!creep.memory.destinationReached) {
        pathing.Move(creep, Game.flags[creep.memory.destination], false, 16);
        if (creep.pos.getRangeTo(Game.flags[creep.memory.destination]) <= 3) {
            creep.memory.destinationReached = true;
        }
    } else {
        if (creep.room.controller) {
            if (creep.claimController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                pathing.Move(creep, creep.room.controller);
            }
        }
    }
}
/**
 * @return {null}
 */
function reserver(creep) {
    invaderCheck(creep);
    if (!creep.memory.targetRooms) {
        creep.memory.targetRooms = Game.map.describeExits(creep.memory.assignedRoom)
    }
    if (creep.memory.reserving) {
        if ((creep.room.controller.reservation && creep.room.controller.reservation['ticksToEnd'] >= 1500) || creep.room.controller.owner) {
            creep.memory.reserving = undefined;
        } else if (creep.reserveController(creep.room.controller) === ERR_NOT_IN_RANGE || creep.signController(creep.room.controller, "Reserved Territory of Overlords - #overlords on Slack") === ERR_NOT_IN_RANGE) {
            pathing.Move(creep, creep.room.controller);
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
        creep.moveTo(new RoomPosition(25, 25, creep.memory.currentDestination), {range: 21}); //to move to any room
    } else {
        if (creep.room.controller && !creep.room.controller.owner && (!creep.room.controller.reservation || (creep.room.controller.reservation['username'] === 'Shibdib' && creep.room.controller.reservation['ticksToEnd'] < 1000))) {
            pathing.Move(creep, creep.room.controller);
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
/**
 * @return {null}
 */
function raider(creep) {

    if (!Game.flags[creep.memory.attackTarget]) {
        creepTools.recycle(creep);
        return null;
    }
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.returning = true;
        creep.memory.destinationReached = false;
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
                    pathing.Move(creep, storageItem);
                } else {
                    creep.memory.storageDestination = null;
                    creep.memory.path = null;
                }
                return null;
            }
            creepTools.findStorage(creep);
        } else {
            pathing.Move(creep, Game.getObjectById(creep.memory.assignedSpawn), false, 16);
            return null;
        }
        if (creep.carry.energy === 0) {
            creep.memory.returning = false;
        }
        return null;
    }
    //Initial move
    if (!creep.memory.destinationReached) {
        pathing.Move(creep, Game.flags[creep.memory.attackTarget], false, 16);
        if (creep.pos.getRangeTo(Game.flags[creep.memory.attackTarget]) <= 3) {
            creep.memory.destinationReached = true;
        }
    } else {
        let storage = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE && s.store[RESOURCE_ENERGY] !== 0});
        if (storage) {
            if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                pathing.Move(creep, storage);
            }
        } else {
            let extension = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_EXTENSION && s.energy !== 0});
            if (extension) {
                if (creep.withdraw(extension, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    pathing.Move(creep, extension);
                }
            } else {
                let spawn = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_SPAWN && s.energy !== 0});
                if (spawn) {
                    if (creep.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        pathing.Move(creep, spawn);
                    }
                } else {
                    let terminal = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TERMINAL && s.energy !== 0});
                    if (terminal) {
                        if (creep.withdraw(terminal, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                            pathing.Move(creep, terminal);
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
/**
 * @return {null}
 */
function responder(creep) {
    if (creep.hits < creep.hitsMax / 2) {
        creep.heal(creep);
    }

    if (!Game.flags["hostile" + creep.memory.responseTarget]) {
        creep.memory.destinationReached = true;
    }

    let armedHostile = creep.pos.findClosestByRange(FIND_CREEPS, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(doNotAggress, e.owner['username']) === false});
    let closestHostileSpawn = creep.pos.findClosestByRange(FIND_HOSTILE_SPAWNS);
    let closestHostileTower = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TOWER});
    let closestHostile = creep.pos.findClosestByRange(FIND_CREEPS, {filter: (e) => _.includes(doNotAggress, e.owner['username']) === false});
    let friendlies = creep.pos.findInRange(FIND_MY_CREEPS, 35, {filter: (c) => c.hits < c.hitsMax});
    if (armedHostile) {
        if (creep.attack(armedHostile) === ERR_NOT_IN_RANGE) {
            pathing.AttackMove(creep, armedHostile);
        }
    } else if (closestHostileTower) {
        if (creep.attack(closestHostileTower) === ERR_NOT_IN_RANGE) {
            pathing.AttackMove(creep, closestHostileTower);
        }
    } else if (closestHostileSpawn) {
        if (creep.attack(closestHostileSpawn) === ERR_NOT_IN_RANGE) {
            pathing.AttackMove(creep, closestHostileSpawn);
        }
    } else if (closestHostile) {
        if (creep.attack(closestHostile) === ERR_NOT_IN_RANGE) {
            pathing.AttackMove(creep, closestHostile);
        }
    } else if (friendlies.length > 0) {
        if (creep.heal(friendlies[0]) === ERR_NOT_IN_RANGE) {
            if (creep.heal(friendlies[0]) === ERR_NOT_IN_RANGE) {
                creep.moveTo(friendlies[0], {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
    } else if (creep.memory.destinationReached !== true) {
        if (creep.pos.roomName === Game.flags["hostile" + creep.memory.responseTarget].pos.roomName) {
            Game.flags["hostile" + creep.memory.responseTarget].remove();
            creep.memory.destinationReached = true;
        }
        pathing.Move(creep, Game.flags["hostile" + creep.memory.responseTarget], false, 16);
    }
}

function invaderCheck(creep) {
    let spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
    if (!spawn) {
        let invader = creep.pos.findClosestByRange(FIND_CREEPS, {filter: (e) => _.includes(doNotAggress, e.owner['username']) === false});
        if (invader && creep.memory.invaderDetected !== true) {
            let hostile = creep.pos.findClosestByRange(FIND_CREEPS, {filter: (e) => _.includes(doNotAggress, e.owner['username']) === false});
            creep.memory.invaderDetected = true;
            creep.memory.invaderID = hostile.id;
            if (!Game.flags["hostile" + hostile.id]) {
                creep.pos.createFlag("hostile" + hostile.id);
            }
        } else {
            creep.memory.invaderDetected = undefined;
            creep.memory.invaderID = undefined;
        }
    }
}
