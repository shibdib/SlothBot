/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    creep.borderCheck();
    creep.room.invaderCheck();
    if (creep.hits < creep.hitsMax / 2) {
        creep.heal(creep);
    }
    if (Game.rooms[creep.memory.responseTarget] && creep.pos.roomName === Game.rooms[creep.memory.responseTarget].name) {
        creep.memory.destinationReached = true;
    } else {
        creep.memory.destinationReached = undefined;
    }
    if (!creep.memory.destinationReached) {
        let hostiles = _.filter(creep.room.creeps, (c) => _.includes(FRIENDLIES, c.owner['username']) === false);
        let armedHostile = _.filter(hostiles, (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(FRIENDLIES, e.owner['username']) === false);
        if (creep.hits < creep.hitsMax) {
            creep.heal(creep);
        }
        if (armedHostile.length > 0) {
            creep.handleDefender();
        } else {
            creep.shibMove(new RoomPosition(25, 25, creep.memory.responseTarget), {range: 15}); //to move to any room}
        }
    } else {
        if (!creep.handleDefender()) {
            let structuresInRoom = creep.room.find(FIND_STRUCTURES,  {filter: (s) => s.owner && !_.includes(FRIENDLIES, s.owner['username'])});
            let vulnerableStructure = creep.pos.findClosestByPath(_.filter(structuresInRoom, (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_STORAGE && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_TERMINAL && !s.pos.checkForRampart()));
            if (vulnerableStructure) {
                creep.memory.inCombat = undefined;
                if (creep.pos.getRangeTo(vulnerableStructure) <= 3) creep.rangedAttack(vulnerableStructure);
                if (creep.attack(vulnerableStructure) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(vulnerableStructure);
                }
            } else {
                let ramparts = creep.pos.findClosestByPath(_.filter(structuresInRoom, (s) => s.structureType === STRUCTURE_RAMPART));
                if (ramparts) {
                    creep.memory.inCombat = undefined;
                    if (creep.pos.getRangeTo(vulnerableStructure) <= 3) creep.rangedAttack(vulnerableStructure);
                    if (creep.attack(ramparts) === ERR_NOT_IN_RANGE) {
                        creep.shibMove(ramparts);
                    }
                } else {
                    findDefensivePosition(creep, creep);
                }
            }
        }
    }
}

module.exports.role = profiler.registerFN(role, 'remoteResponder');

function findDefensivePosition(creep, target) {
    if (target) {
        let bestRampart = target.pos.findClosestByPath(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() && (r.pos.lookFor(LOOK_CREEPS).length === 0 || (r.pos.x === creep.pos.x && r.pos.y === creep.pos.y))});
        if (bestRampart) {
            creep.memory.assignedRampart = bestRampart.id;
            if (bestRampart.pos !== creep.pos) {
                creep.shibMove(bestRampart, {forceRepath: true, range: 0});
            }
        }
    }
}
