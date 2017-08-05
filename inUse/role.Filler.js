/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    if (creep.renewalCheck(6)) return creep.shibMove(creep.pos.findClosestByRange(FIND_MY_SPAWNS));
    //INITIAL CHECKS
    if (creep.borderCheck()) return null;
    if (creep.wrongRoom()) return null;
    if (creep.room.controller.level < 4) return creep.memory.role = 'basicHauler';
    let getters = _.filter(Game.creeps, (c) => (c.memory.role === 'getter' || c.memory.role === 'basicHauler') && c.memory.assignedRoom === creep.room.name);
    let fillers = _.filter(Game.creeps, (c) => (c.memory.role === 'filler') && c.memory.assignedRoom === creep.room.name);
    if (Game.getObjectById(creep.memory.storage) && Game.getObjectById(creep.memory.storage).store[RESOURCE_ENERGY] <= 5000 && fillers.length > 1) return creep.memory.role = 'getter';
    if (getters.length === 0) {
        creep.memory.energyDestination = undefined;
        creep.memory.storageDestination = undefined;
        return creep.memory.role = 'basicHauler';
    }
    if (!creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE})) {
        creep.memory.energyDestination = undefined;
        creep.memory.storageDestination = undefined;
        return creep.memory.role = 'basicHauler';
    }
    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy > creep.carryCapacity / 2) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        if (creep.memory.storage) {
            let storage = Game.getObjectById(creep.memory.storage);
            switch (creep.withdraw(storage, RESOURCE_ENERGY)) {
                case OK:
                    creep.findEssentials();
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(storage);
                    break;
                case ERR_NOT_ENOUGH_RESOURCES:
                    creep.idleFor(10);
            }
        } else if (!creep.memory.storage) {
            let storage = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'storage'), 'id');
            if (storage.length > 0) {
                creep.memory.storage = storage[0];
            } else {
                creep.memory.storage = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE}).id;
            }
        }
    } else {
        if (creep.memory.storageDestination) {
            let storageItem = Game.getObjectById(creep.memory.storageDestination);
            if (creep.transfer(storageItem, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.shibMove(storageItem);
            } else {
                creep.memory.storageDestination = null;
            }
        } else if (!creep.findEssentials()) {
            creep.idleFor(10);
        }
    }
}
module.exports.role = profiler.registerFN(role, 'fillerRole');