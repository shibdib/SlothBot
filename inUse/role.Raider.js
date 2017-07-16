/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    creep.cacheRoomIntel();
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
                    creep.shibMove(storageItem);
                } else {
                    creep.memory.storageDestination = null;
                    creep.memory.path = null;
                }
                return null;
            }
            creep.findStorage();
        } else {
            creep.shibMove(Game.getObjectById(creep.memory.assignedSpawn));
            return null;
        }
        return null;
    }
    //Initial move
    if (!creep.memory.destinationReached) {
        creep.shibMove(Game.flags[creep.memory.attackTarget]);
        if (creep.pos.getRangeTo(Game.flags[creep.memory.attackTarget]) <= 3) {
            creep.memory.destinationReached = true;
        }
    } else {
        let storage = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE && s.store[RESOURCE_ENERGY] !== 0});
        if (storage) {
            if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.shibMove(storage);
            }
        } else {
            let extension = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_EXTENSION && s.energy !== 0});
            if (extension) {
                if (creep.withdraw(extension, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(extension);
                }
            } else {
                let spawn = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_SPAWN && s.energy !== 0});
                if (spawn) {
                    if (creep.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        creep.shibMove(spawn);
                    }
                } else {
                    let terminal = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TERMINAL && s.energy !== 0});
                    if (terminal) {
                        if (creep.withdraw(terminal, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                            creep.shibMove(terminal);
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

module.exports.role = profiler.registerFN(role, 'raiderRole');
