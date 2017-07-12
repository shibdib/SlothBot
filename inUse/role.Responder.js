/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
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
                    creep.shibMove(lab);
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
                creep.shibMove(armedHostile);
            }
            creep.rangedAttack(armedHostile);
        }
    } else if (closestHostileTower) {
        if (creep.attack(closestHostileTower) === ERR_NOT_IN_RANGE) {
            creep.shibMove(closestHostileTower);
        }
    } else if (closestHostileSpawn) {
        if (creep.attack(closestHostileSpawn) === ERR_NOT_IN_RANGE) {
            creep.shibMove(closestHostileSpawn);
        }
    } else if (closestHostile) {
        if (creep.pos.roomName === creep.memory.assignedRoom) {
            if (creep.attack(closestHostile) === ERR_NOT_IN_RANGE) {
                findDefensivePosition(creep, closestHostile);
            }
            creep.rangedAttack(closestHostile);
        } else {
            if (creep.attack(closestHostile) === ERR_NOT_IN_RANGE) {
                creep.shibMove(closestHostile);
            }
            creep.rangedAttack(closestHostile);
        }
    } else if (friendlies.length > 0 && creep.room.memory.responseNeeded !== true && creep.memory.destinationReached === true) {
        if (creep.heal(friendlies[0]) === ERR_NOT_IN_RANGE) {
            if (creep.heal(friendlies[0]) === ERR_NOT_IN_RANGE) {
                creep.shibMove(friendlies[0]);
            }
        }
    } else if (creep.memory.destinationReached !== true && Game.rooms[creep.memory.responseTarget]) {
        if (creep.pos.roomName === Game.rooms[creep.memory.responseTarget].name) {
            creep.memory.destinationReached = true;
        }
        creep.moveTo(new RoomPosition(25, 25, Game.rooms[creep.memory.responseTarget].name), {range: 21}); //to move to any room
    } else if (Game.getObjectById(creep.memory.assignedRampart)) {
        if (Game.getObjectById(creep.memory.assignedRampart).pos.x !== creep.pos.x || Game.getObjectById(creep.memory.assignedRampart).pos.y !== creep.pos.y) {
            creep.shibMove(Game.getObjectById(creep.memory.assignedRampart));
        }
    } else if (!creep.memory.assignedRampart || !Game.getObjectById(creep.memory.assignedRampart)) {
        findDefensivePosition(creep, creep);
    }
}

module.exports.role = profiler.registerFN(role, 'responderRole');

function findDefensivePosition(creep, target) {
    if (target) {
        let bestRampart = target.pos.findClosestByPath(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
        let armedHostile = creep.pos.findClosestByRange(FIND_CREEPS, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1 || e.getActiveBodyparts(WORK) >= 1) && _.includes(doNotAggress, e.owner['username']) === false});
        if (bestRampart && bestRampart.pos !== creep.pos) {
            creep.memory.pathAge = 999;
            bestRampart = target.pos.findClosestByPath(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_RAMPART && (r.pos.lookFor(LOOK_CREEPS).length === 0 || (r.pos.x === creep.pos.x && r.pos.y === creep.pos.y))});
            creep.memory.assignedRampart = bestRampart.id;
            if (bestRampart.pos !== creep.pos && (creep.pos.getRangeTo(bestRampart) < creep.pos.getRangeTo(armedHostile) || !armedHostile)) {
                creep.shibMove(bestRampart);
            }
        }
    }
}
