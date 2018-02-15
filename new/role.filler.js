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
    if (_.sum(creep.carry) > creep.carry.energy) {
        let terminal = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TERMINAL});
        for (const resourceType in creep.carry) {
            if (!_.includes(DO_NOT_SELL_LIST, resourceType) && resourceType !== RESOURCE_ENERGY) {
                if (creep.transfer(terminal, resourceType) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(terminal);
                }
            }
        }
        return;
    }
    if (_.sum(creep.carry) === 0) {
        creep.memory.hauling = false;
    }
    if (_.sum(creep.carry) > creep.carryCapacity / 2) {
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
                    bookBalancer(creep);
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
                    creep.findStorage();
                    break;
            }
        } else if (!creep.findEssentials()) {
            bookBalancer(creep);
        }
    }
}

module.exports.role = profiler.registerFN(role, 'fillerRole');

function bookBalancer(creep) {
    let storage = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE});
    if (_.sum(storage.store) > storage.store[RESOURCE_ENERGY] && _.sum(creep.carry) !== creep.carryCapacity) {
        for (const resourceType in storage.store) {
            if (!_.includes(DO_NOT_SELL_LIST, resourceType)) {
                if (creep.withdraw(storage, resourceType) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(storage);
                }
            }
        }
    } else {
        creep.idleFor(10);
    }
}