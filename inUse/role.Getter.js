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
    let fillers = _.filter(Game.creeps, (c) => c.memory.role === 'filler' && c.memory.assignedRoom === creep.room.name);
    let mineralHauler = _.filter(Game.creeps, (c) => c.memory.role === 'mineralHauler' && c.memory.assignedRoom === creep.room.name);
    let mineralHarvester = _.filter(Game.creeps, (c) => c.memory.role === 'mineralHarvester' && c.memory.assignedRoom === creep.room.name);
    if (creep.room.controller.level < 4) return creep.memory.role = 'basicHauler';
    if (Game.getObjectById(creep.memory.storage) && Game.getObjectById(creep.memory.storage).store[RESOURCE_ENERGY] >= 25000 && fillers.length < 3) return creep.memory.role = 'filler';
    if (mineralHarvester.length > 0 && mineralHauler.length === 0) return creep.memory.role = 'mineralHauler';
    if (fillers.length === 0) {
        creep.memory.energyDestination = undefined;
        return creep.memory.role = 'filler';
    }
    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy > creep.carryCapacity / 2) {
        creep.memory.hauling = true;
    }
    if (!creep.memory.storage || !Game.getObjectById(creep.memory.storage)) {
        let storage = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'storage'), 'id');
        if (storage.length > 0) {
            creep.memory.storage = storage[0];
        }
    }
    let storage = Game.getObjectById(creep.memory.storage);
    let terminal = Game.getObjectById(_.pluck(_.filter(creep.room.memory.structureCache, 'type', 'terminal'), 'id'));
    if (storage.store[RESOURCE_ENERGY] < ENERGY_AMOUNT) {
        if (creep.memory.hauling === false) {
            if (creep.memory.energyDestination) {
                creep.withdrawEnergy();
            } else if (!creep.getEnergy()) {
                creep.idleFor(10);
            }
        } else {
            if (!Game.getObjectById(creep.memory.storage)) creep.memory.role = 'basicHauler';
            let opportunity = creep.pos.findInRange(FIND_STRUCTURES, 1, {filter: (s) => (s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN) && s.energy < s.energyCapacity});
            if (opportunity.length > 0) creep.transfer(opportunity[0], RESOURCE_ENERGY);
            if (creep.transfer(Game.getObjectById(creep.memory.storage), RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.shibMove(Game.getObjectById(creep.memory.storage), {offRoad: true});
            }
        }
    } else if (terminal) {
        if (creep.memory.hauling === false) {
            if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.shibMove(storage);
            }
        } else {
            if (creep.transfer(terminal, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.shibMove(terminal);
            }
        }
    }
}
module.exports.role = profiler.registerFN(role, 'getterRole');
