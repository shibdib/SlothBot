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
    if (_.sum(creep.carry) === 0) {
        creep.memory.hauling = false;
    }
    if (_.sum(creep.carry) > 0) {
        creep.memory.hauling = true;
    }
    for (let key in creep.room.memory.reactions) {
        if (creep.room.memory.reactions[key].assignedHub) {
            if (Game.getObjectById(creep.room.memory.reactions[key].lab1).mineralAmount < 500 && Game.getObjectById(creep.room.memory.reactions[key].lab1).mineralAmount !== 3000) {
                creep.memory.haulingMineral = creep.room.memory.reactions[key].input1;
                creep.memory.deliverTo = creep.room.memory.reactions[key].lab1;
                break;
            } else if (Game.getObjectById(creep.room.memory.reactions[key].lab2).mineralAmount < 500 && Game.getObjectById(creep.room.memory.reactions[key].lab2).mineralAmount !== 3000) {
                creep.memory.haulingMineral = creep.room.memory.reactions[key].input2;
                creep.memory.deliverTo = creep.room.memory.reactions[key].lab2;
                break;
            } else if (Game.getObjectById(creep.room.memory.reactions[key].outputLab).energy < Game.getObjectById(creep.room.memory.reactions[key].outputLab).energyCapacity) {
                creep.memory.haulingMineral = RESOURCE_ENERGY;
                creep.memory.deliverTo = creep.room.memory.reactions[key].outputLab;
                break;
            } else {
                creep.memory.haulingMineral = undefined;
                creep.memory.deliverTo = creep.room.memory.reactions[key].lab1;
            }
        }
    }
    if (!creep.memory.haulingMineral) {
        if (creep.pos.getRangeTo(Game.getObjectById(creep.memory.deliverTo)) > 1) {
            creep.shibMove(Game.getObjectById(creep.memory.deliverTo));
        } else {
            creep.idleFor(15);
        }
    } else if (creep.memory.hauling === false) {
        if (creep.memory.deliverTo && creep.memory.haulingMineral) {
            let structure = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.store && s.store[creep.memory.haulingMineral] > 0});
            if (Game.getObjectById(creep.memory.deliverTo).mineralType && Game.getObjectById(creep.memory.deliverTo).mineralType !== creep.memory.haulingMineral) {
                if (creep.withdraw(Game.getObjectById(creep.memory.deliverTo), Game.getObjectById(creep.memory.deliverTo).mineralType) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(Game.getObjectById(creep.memory.deliverTo));
                }
            } else if (structure) {
                if (creep.withdraw(structure, creep.memory.haulingMineral) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(structure);
                }
            } else {
                creep.shibMove(Game.getObjectById(creep.memory.deliverTo));
            }
        } else {
            let lab = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_LAB && s.mineralAmount > 0});
            if (lab && creep.withdraw(lab, lab.mineralType) === ERR_NOT_IN_RANGE) {
                creep.shibMove(lab);
            } else {
                creep.shibMove(creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_LAB}));
            }
        }
    } else {
        if (!creep.carry[creep.memory.haulingMineral] || !creep.memory.haulingMineral) {
            let storage = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE});
            for (const resourceType in creep.carry) {
                if (creep.transfer(storage, resourceType) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(storage);
                }
            }
        } else if (creep.memory.deliverTo) {
            let storageItem = Game.getObjectById(creep.memory.deliverTo);
            if (creep.transfer(storageItem, creep.memory.haulingMineral) === ERR_NOT_IN_RANGE) {
                creep.shibMove(storageItem);
            }
        }
    }
}
module.exports.role = profiler.registerFN(role, 'labTechRole');