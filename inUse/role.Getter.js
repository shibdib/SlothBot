/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

/**
 * @return {null}
 */
function role(creep) {
    let fillers = _.filter(Game.creeps, (creep) => (creep.memory.role === 'filler' || creep.memory.role === 'basicHauler') && creep.memory.assignedRoom === creep.room.name);
    if (fillers.length === 0) {
        creep.memory.role = 'basicHauler';
    }
    if (!creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE})) {
        creep.memory.role = 'basicHauler';
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
        } else if (!creep.getEnergy()) {
            creep.idleFor(10);
        }
    } else {
        if (creep.memory.storage) {
            if (creep.transfer(Game.getObjectById(creep.memory.storage), RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.shibMove(Game.getObjectById(creep.memory.storage), {offRoad: true});
            }
        } else if (!creep.memory.storage) {
            let storage = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'storage'), 'id');
            if (storage.length > 0) {
                creep.memory.storage = storage[0];
            }
        }
    }
}
module.exports.role = profiler.registerFN(role, 'getterRole');
