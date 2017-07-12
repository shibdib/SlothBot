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
    creep.borderCheck();
    creep.wrongRoom();
    if (creep.carry.energy === 0) {
        creep.memory.working = null;
    }
    if (creep.carry.energy >= creep.carryCapacity * 0.75) {
        creep.memory.working = true;
    }
    if (creep.memory.working === true) {
        creep.findConstruction();
        if (creep.memory.task === 'build' && creep.room.memory.responseNeeded !== true) {
            let construction = Game.getObjectById(creep.memory.constructionSite);
            if (creep.build(construction) === ERR_NOT_IN_RANGE) {
                creep.shibMove(construction);
            }
        } else {
            creep.findRepair(creep.room.controller.level);
            if (creep.memory.task === 'repair' && creep.memory.constructionSite) {
                let repairNeeded = Game.getObjectById(creep.memory.constructionSite);
                if (creep.repair(repairNeeded) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(repairNeeded);
                }
            } else if (creep.upgradeController(Game.rooms[creep.memory.assignedRoom].controller) === ERR_NOT_IN_RANGE) {
                creep.shibMove(Game.rooms[creep.memory.assignedRoom].controller);
            }
        }
    }
    else {
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
        }
    }
}
module.exports.role = profiler.registerFN(role, 'workerRole');