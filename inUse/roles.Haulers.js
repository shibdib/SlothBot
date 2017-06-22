let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');
let pathing = require('module.pathFinder');


module.exports.Manager = function (creep) {
    if (creep.memory.role === "hauler" || "largeHauler") {
        hauler(creep);
    } else if (creep.memory.role === "mineralHauler") {
        mineralHauler(creep);
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

    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy > creep.carryCapacity / 2) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        if (creep.memory.mineralDestination) {
            creepTools.withdrawEnergy(creep);
        } else {
            let mineralContainer = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && _.sum(s.store) > 0 && s.store[RESOURCE_ENERGY] === 0});
            creep.memory.mineralDestination = mineralContainer.id;
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