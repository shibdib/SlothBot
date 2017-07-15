/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');
/**
 * @return {null}
 */
function role(creep) {
    //INITIAL CHECKS
    if (creep.borderCheck()) return null;
    if (creep.wrongRoom()) return null;
    let getters = _.filter(Game.creeps, (creep) => (creep.memory.role === 'getter' || creep.memory.role === 'basicHauler') && creep.memory.assignedRoom === creep.room.name);
    if (getters.length === 0) {
        creep.memory.energyDestination = undefined;
        creep.memory.storageDestination = undefined;
        creep.memory.role = 'basicHauler';
    }
    if (!creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE})) {
        creep.memory.energyDestination = undefined;
        creep.memory.storageDestination = undefined;
        creep.memory.role = 'basicHauler';
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
            if (storage.store[RESOURCE_ENERGY] === 0) {
                if (creep.memory.energyDestination) {
                    creep.withdrawEnergy();
                } else if (!creep.getEnergy()) {
                    creep.idleFor(10);
                }
            } else if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.shibMove(storage);
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
                creep.shibMove(storageItem, {offRoad: true});
            } else {
                creep.memory.storageDestination = null;
            }
        } else if (!creep.findEssentials()) {
            creep.idleFor(10);
        }
    }
}
module.exports.role = profiler.registerFN(role, 'fillerRole');