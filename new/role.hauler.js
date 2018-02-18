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
            creep.getEnergy();
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
            if (!storageItem) {
                creep.memory.storageDestination = undefined;
                creep.findEssentials();
            }
            switch (creep.transfer(storageItem, RESOURCE_ENERGY)) {
                case OK:
                    creep.memory.storageDestination = undefined;
                    break;
                case ERR_NOT_IN_RANGE:
                    let opportunity = creep.pos.findInRange(FIND_STRUCTURES, 1, {filter: (s) => (s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN) && s.energy < s.energyCapacity});
                    if (opportunity.length > 0) creep.transfer(opportunity[0], RESOURCE_ENERGY);
                    creep.shibMove(storageItem);
                    break;
                case ERR_FULL:
                    creep.memory.storageDestination = undefined;
                    if (storageItem.memory) {
                        storageItem.memory.deliveryIncoming = undefined;
                    }
                    creep.findEssentials();
                    break;
            }
        } else {
            let spawn = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'spawn'), 'id');
            if (spawn.energy < 300) {
                if (creep.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(spawn);
                }
            } else if (!creep.findEssentials()) {
                creep.idleFor(10);
            }
        }
    }
}
module.exports.role = profiler.registerFN(role, 'basicHaulerRole');
