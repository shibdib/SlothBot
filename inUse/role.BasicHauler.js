/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

/**
 * @return {null}
 */
function role(creep) {
    if (creep.borderCheck()) return null;
    if (creep.wrongRoom()) return null;
    let basicHaulers = _.filter(Game.creeps, (creep) => creep.memory.role === 'basicHauler' && creep.memory.assignedRoom === creep.room.name);
    if (creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE}) && basicHaulers.length >= 2) {
        creep.memory.energyDestination = undefined;
        creep.memory.storageDestination = undefined;
        creep.memory.role = 'pawn';
    }
    //INITIAL CHECKS
    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy > creep.carryCapacity / 2) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        if (creep.memory.energyDestination) {
            creep.withdrawEnergy();
        } else {
            creep.findEnergy();
            if (!creep.memory.energyDestination) {
                let energy = creep.room.find(FIND_DROPPED_RESOURCES, {filter: (s) => s.amount > 100 && s.resourceType === RESOURCE_ENERGY});
                if (energy.length > 0) {
                    if (creep.pickup(energy[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        creep.shibMove(energy[0]);
                    }
                }
            }
        }
    } else {
        if (creep.memory.storageDestination) {
            let storageItem = Game.getObjectById(creep.memory.storageDestination);
            if (creep.transfer(storageItem, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.shibMove(storageItem);
            } else {
                creep.memory.storageDestination = null;
                creep.memory.path = null;
            }
        } else if (!creep.findEssentials()) {
            creep.idleFor(10);
        }
    }
}
module.exports.role = profiler.registerFN(role, 'basicHaulerRole');
