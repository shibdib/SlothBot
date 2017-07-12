/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

/**
 * @return {null}
 */
function basicHauler(creep) {
    let basicHaulers = _.filter(Game.creeps, (creep) => creep.memory.role === 'basicHauler' && creep.memory.assignedRoom === creep.room.name);
    if (creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE}) && basicHaulers.length >= 2) {
        creep.memory.role = 'pawn';
    }
    //INITIAL CHECKS
    creep.borderCheck();
    creep.wrongRoom();
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
basicHauler = profiler.registerFN(basicHauler, 'basicHaulerRole');
