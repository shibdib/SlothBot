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
    creep.say(ICONS.reaction, true);
    if (creep.renewalCheck(6)) return null;
    if (creep.borderCheck()) return null;
    if (creep.wrongRoom()) return null;
    creep.repairRoad();
    if (creep.carry[RESOURCE_ENERGY] > 0) {
        let adjacentStructure = _.filter(creep.pos.findInRange(FIND_STRUCTURES, 1), (s) => (s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN) && s.energy < s.energyCapacity);
        if (adjacentStructure.length > 0) creep.transfer(adjacentStructure[0], RESOURCE_ENERGY);
    }
    if (_.sum(creep.carry) === 0) creep.memory.hauling = false;
    if (_.sum(creep.carry) > creep.carryCapacity * 0.75) creep.memory.hauling = true;
    if (!creep.getSafe(true)) {
        let labs = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB);
        let terminal = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_TERMINAL)[0];
        let storage = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_STORAGE)[0];
        for (let key in labs) {
            if (creep.memory.emptying ||
                (labs[key].mineralAmount > 0 && labs[key].mineralType !== labs[key].memory.itemNeeded && labs[key].mineralType !== labs[key].memory.creating) ||
                (labs[key].mineralAmount >= 500 && labs[key].mineralType === labs[key].memory.creating)) {
                if (_.sum(creep.carry) > 0) {
                    for (let resourceType in creep.carry) {
                        switch (creep.transfer(storage, resourceType)) {
                            case OK:
                                creep.memory.emptying = undefined;
                                return undefined;
                            case ERR_NOT_IN_RANGE:
                                creep.shibMove(storage);
                                return undefined;
                        }
                    }
                } else {
                    switch (creep.withdraw(labs[key], labs[key].mineralType)) {
                        case OK:
                            creep.memory.emptying = true;
                            return undefined;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(labs[key]);
                            creep.memory.emptying = true;
                            return undefined;
                    }
                }
            }
        }
        for (let key in labs) {
            if (labs[key].memory.itemNeeded && (labs[key].mineralType !== labs[key].memory.itemNeeded || (labs[key].mineralType === labs[key].memory.itemNeeded && labs[key].mineralAmount < 250))) {
                if (creep.carry[labs[key].memory.itemNeeded] === 0 || !creep.carry[labs[key].memory.itemNeeded]) {
                    if (!creep.memory.itemStorage) {
                        if (storage.store[labs[key].memory.itemNeeded] > 0) {
                            creep.memory.labHelper = labs[key].id;
                            creep.memory.itemStorage = storage.id;
                        } else if (terminal.store[labs[key].memory.itemNeeded] > 0) {
                            creep.memory.labHelper = labs[key].id;
                            creep.memory.itemStorage = terminal.id;
                        } else {
                            creep.memory.itemStorage = undefined;
                        }
                    }
                    if (creep.memory.itemStorage) {
                        creep.memory.storageDestination = labs[key].id;
                        switch (creep.withdraw(Game.getObjectById(creep.memory.itemStorage), labs[key].memory.itemNeeded)) {
                            case OK:
                                creep.memory.itemStorage = undefined;
                                return undefined;
                            case ERR_NOT_IN_RANGE:
                                creep.shibMove(Game.getObjectById(creep.memory.itemStorage));
                                return undefined;
                        }
                    }
                } else {
                    let lab = Game.getObjectById(creep.memory.labHelper);
                    if (lab) {
                        switch (creep.transfer(lab, labs[key].memory.itemNeeded)) {
                            case OK:
                                creep.memory.labHelper = undefined;
                                return undefined;
                            case ERR_NOT_IN_RANGE:
                                creep.shibMove(lab);
                                return undefined;
                        }
                    } else {
                        creep.memory.labHelper = undefined;
                        creep.memory.labTech = undefined;
                    }
                }
            }
        }
        creep.idleFor(10);
    }
}

module.exports.role = profiler.registerFN(role, 'labTechRole');