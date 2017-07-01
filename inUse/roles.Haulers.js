let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');
let profiler = require('screeps-profiler');


function Manager(creep) {
    if (creep.memory.role === "mineralHauler") {
        mineralHauler(creep);
    } else if (creep.memory.role === "labTech") {
        labTech(creep);
    } else if (creep.memory.role === "hauler" || "largeHauler") {
        hauler(creep);
    }
}
module.exports.Manager = profiler.registerFN(Manager, 'managerHaulers');

/**
 * @return {null}
 */
function hauler(creep) {
    //INITIAL CHECKS
    borderChecks.borderCheck(creep);
    borderChecks.wrongRoom(creep);

    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy > creep.carryCapacity / 2) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        if (creep.memory.energyDestination) {
            creepTools.withdrawEnergy(creep);
        } else {
            creepTools.findEnergy(creep, true);
        }
    } else {
        if (creep.memory.storageDestination) {
            let storageItem = Game.getObjectById(creep.memory.storageDestination);
            if (creep.transfer(storageItem, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.travelTo(storageItem);
            } else {
                creep.memory.storageDestination = null;
                creep.memory.path = null;
            }
            return null;
        }
        creepTools.findStorage(creep);
    }
}
hauler = profiler.registerFN(hauler, 'haulerHaulers');

/**
 * @return {null}
 */
function labTech(creep) {
    //INITIAL CHECKS
    borderChecks.borderCheck(creep);
    borderChecks.wrongRoom(creep);

    //Get reaction info
    let activeReactions = [
        RESOURCE_GHODIUM_OXIDE
    ];
    for (let i = 0; i < activeReactions.length; i++) {
        let reaction = creep.room.memory.reactions[activeReactions[i]];
        let lab1 = Game.getObjectById(reaction.lab1);
        let lab2 = Game.getObjectById(reaction.lab2);
        let output = Game.getObjectById(reaction.outputLab);
        if (lab1.mineralAmount < 500) {
            creep.memory.haulingMineral = reaction.input1;
            creep.memory.deliverTo = reaction.lab1;
        } else if (lab2.mineralAmount < 500) {
            creep.memory.haulingMineral = reaction.input2;
            creep.memory.deliverTo = reaction.lab2;
        } else if (output.energy < 500) {
            creep.memory.haulingMineral = RESOURCE_ENERGY;
            creep.memory.deliverTo = reaction.outputLab;
        }
    }

    if (_.sum(creep.carry) === 0) {
        creep.memory.hauling = false;
    }
    if (_.sum(creep.carry) > creep.carryCapacity / 2) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        let storage = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE && s.store[creep.memory.haulingMineral] > 0});
        let terminal = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TERMINAL && s.store[creep.memory.haulingMineral] > 0});
        if (storage) {
            if (creep.withdraw(storage, creep.memory.haulingMineral) === ERR_NOT_IN_RANGE) {
                creep.travelTo(storage);
            }
        } else if (terminal) {
            if (creep.withdraw(terminal, creep.memory.haulingMineral) === ERR_NOT_IN_RANGE) {
                creep.travelTo(terminal);
            }
        }
    } else {
        if (creep.memory.deliverTo) {
            let storageItem = Game.getObjectById(creep.memory.deliverTo);
            if (creep.transfer(storageItem, creep.memory.haulingMineral) === ERR_NOT_IN_RANGE) {
                creep.travelTo(storageItem);
            }
        }
    }
}
labTech = profiler.registerFN(labTech, 'labTechHaulers');

/**
 * @return {null}
 */
function mineralHauler(creep) {
    //INITIAL CHECKS
    borderChecks.borderCheck(creep);
    borderChecks.wrongRoom(creep);

    if (_.sum(creep.carry) === 0) {
        creep.memory.hauling = false;
    }
    if (_.sum(creep.carry) > creep.carryCapacity / 2) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        if (creep.memory.mineralDestination) {
            let mineralContainer = Game.getObjectById(creep.memory.mineralDestination);
            if (mineralContainer) {
                if (mineralContainer.pos.getRangeTo(Game.getObjectById(creep.memory.assignedMineral)) < 5) {
                    for (const resourceType in mineralContainer.store) {
                        if (creep.withdraw(mineralContainer, resourceType) === ERR_NOT_IN_RANGE) {
                            creep.travelTo(mineralContainer);
                        }
                    }
                }
            }
        } else {
            let container = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] === 0});
            if (container.id) {
                if (container.pos.getRangeTo(Game.getObjectById(creep.memory.assignedMineral)) < 5) {
                    creep.travelTo(container);
                        creep.memory.mineralDestination = container.id;
                } else {
                    creep.travelTo(Game.getObjectById(creep.memory.assignedMineral))
                }
            } else {
                creep.travelTo(Game.getObjectById(creep.memory.assignedMineral))
            }
        }
    } else {
        if (!creep.memory.terminalID) {
            let terminal = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TERMINAL});
            creep.memory.terminalID = terminal.id;
        }
        if (creep.memory.terminalID) {
            let terminal = Game.getObjectById(creep.memory.terminalID);
            if (terminal) {
                if (_.sum(terminal.store) !== terminal.storeCapacity) {
                    for (const resourceType in creep.carry) {
                        if (creep.transfer(terminal, resourceType) === ERR_NOT_IN_RANGE) {
                            creep.travelTo(terminal);
                        }
                    }
                }
            }
        }
    }
}
mineralHauler = profiler.registerFN(mineralHauler, 'mineralHaulerHaulers');