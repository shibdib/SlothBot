/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    if (creep.renewalCheck(6)) return creep.shibMove(creep.pos.findClosestByRange(FIND_MY_SPAWNS));
    if (creep.getActiveBodyparts(WORK) > 0 && creep.pos.checkForRoad()[0] && creep.pos.checkForRoad()[0].hits < creep.pos.checkForRoad()[0].hitsMax * 0.50) creep.repair(creep.pos.checkForRoad()[0]);
    //INITIAL CHECKS
    if (creep.borderCheck()) return null;
    if (creep.wrongRoom()) return null;
    let fillers = _.filter(Game.creeps, (c) => c.memory.role === 'filler' && c.memory.assignedRoom === creep.room.name);
    if (creep.room.controller.level < 4) return creep.memory.role = 'basicHauler';
    if (Game.getObjectById(creep.memory.storage) && Game.getObjectById(creep.memory.storage).store[RESOURCE_ENERGY] >= 25000 && fillers.length < 3) return creep.memory.role = 'filler';
    if (fillers.length === 0) {
        creep.memory.energyDestination = undefined;
        return creep.memory.role = 'filler';
    }
    if (_.sum(creep.carry) === 0) {
        creep.memory.hauling = false;
    }
    if (_.sum(creep.carry) > creep.carryCapacity / 2) {
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
            let minerals = creep.room.find(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && _.sum(s.store) > 1000 && s.store[RESOURCE_ENERGY] === 0});
            if (minerals.length > 0) return getMineral(creep, minerals[0]);
            if (creep.memory.energyDestination) {
                creep.withdrawEnergy();
            } else if (!creep.getEnergy()) {
                creep.idleFor(10);
            }
        } else {
            if (!Game.getObjectById(creep.memory.storage)) creep.memory.role = 'basicHauler';
            for (const resourceType in creep.carry) {
                switch (creep.transfer(storage, resourceType)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        let opportunity = creep.pos.findInRange(FIND_STRUCTURES, 1, {filter: (s) => (s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN) && s.energy < s.energyCapacity});
                        if (opportunity.length > 0 && creep.carry.energy > 0) creep.transfer(opportunity[0], RESOURCE_ENERGY);
                        creep.shibMove(storage);
                        break;
                    case ERR_FULL:
                        delete creep.memory.storageDestination;
                        creep.findStorage();
                        break;
                }
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

function getMineral(creep, container) {
    for (const resourceType in container.store) {
        if (creep.withdraw(container, resourceType) === ERR_NOT_IN_RANGE) {
            creep.shibMove(container);
        }
    }
}