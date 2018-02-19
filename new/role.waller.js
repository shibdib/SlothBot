/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    if (creep.renewalCheck()) return creep.shibMove(creep.pos.findClosestByRange(FIND_MY_SPAWNS));
    if (creep.getActiveBodyparts(WORK) > 0 && creep.pos.checkForRoad()[0] && creep.pos.checkForRoad()[0].hits < creep.pos.checkForRoad()[0].hitsMax * 0.50) creep.repair(creep.pos.checkForRoad()[0]);
    //INITIAL CHECKS
    if (creep.borderCheck()) return null;
    if (creep.wrongRoom()) return null;
    if (creep.carry.energy === 0) {
        creep.memory.working = null;
    }
    if (creep.carry.energy >= creep.carryCapacity * 0.75) {
        creep.memory.working = true;
    }
    if (creep.memory.working === true) {
        if (!creep.memory.currentTarget) {
            let barrier = _.min(creep.room.find(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART}), 'hits');
            creep.memory.currentTarget = barrier.id;
            if (barrier) {
                if (barrier.hits < 500000) {
                    creep.memory.targetHits = 500000;
                } else if (barrier.hits < 500000 * creep.room.controller.level) {
                    creep.memory.targetHits = 500000 * creep.room.controller.level;
                } else {
                    creep.memory.targetHits = barrier.hits + 500000;
                }
            }
            let site = creep.room.find(FIND_CONSTRUCTION_SITES, {filter: (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART})[0];
            if (site) {
                switch (creep.build(site)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(site)
                }
            }
        } else {
            let target = Game.getObjectById(creep.memory.currentTarget);
            switch (creep.repair(target)) {
                case OK:
                    if (target.hits >= creep.memory.targetHits + 2000) delete creep.memory.currentTarget;
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(target)
            }
        }
    } else {
        if (creep.memory.energyDestination) {
            creep.withdrawEnergy();
        } else {
            let storage = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE && s.store[RESOURCE_ENERGY] > 0});
            if (storage) {
                if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(storage);
                }
            } else {
                creep.findEnergy();
            }
            if (!creep.memory.energyDestination && creep.room.controller.level <= 2) {
                let source = creep.pos.findClosestByRange(FIND_SOURCES);
                if (creep.harvest(source) === ERR_NOT_IN_RANGE) creep.shibMove(source)
            }
        }
    }
}

module.exports.role = profiler.registerFN(role, 'wallerRole');