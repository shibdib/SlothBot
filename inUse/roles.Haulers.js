let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');
let pathing = require('module.pathFinder');


module.exports.Manager = function (creep) {
    if (creep.memory.role === "mineralHauler") {
        mineralHauler(creep);
    } else if (creep.memory.role === "hauler" || "largeHauler") {
        hauler(creep);
    }
}

/**
 * @return {null}
 */
function hauler(creep) {
    //INITIAL CHECKS
    borderChecks.borderCheck(creep);

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
                pathing.Move(creep, storageItem);
            } else {
                creep.memory.storageDestination = null;
                creep.memory.path = null;
            }
            return null;
        }
        creepTools.findStorage(creep);
    }
}

/**
 * @return {null}
 */
function mineralHauler(creep) {
    //INITIAL CHECKS
    borderChecks.borderCheck(creep);

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
                            pathing.Move(creep, mineralContainer);
                        }
                    }
                }
            }
        } else {
            let container = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] === 0});
            if (container.id) {
                if (container.pos.getRangeTo(Game.getObjectById(creep.memory.assignedMineral)) < 5) {
                        pathing.Move(creep, container);
                        creep.memory.mineralDestination = container.id;
                } else {
                    pathing.Move(creep, Game.getObjectById(creep.memory.assignedMineral))
                }
            } else {
                pathing.Move(creep, Game.getObjectById(creep.memory.assignedMineral))
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
                            pathing.Move(creep, terminal, false, 1);
                        }
                    }
                }
            }
        }
    }
}