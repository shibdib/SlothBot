let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');
let profiler = require('screeps-profiler');


function Manager(creep) {
    if (creep.memory.role === "peasant") {
        peasant(creep);
    } else if (creep.memory.role === "peasantBuilder") {
        peasantBuilder(creep);
    } else if (creep.memory.role === "peasantUpgrader") {
        peasantUpgrader(creep);
    }
}
module.exports.Manager = profiler.registerFN(Manager, 'managerPeasants');

/**
 * @return {null}
 */
function peasant(creep) {
    borderChecks.borderCheck(creep);
    if (creep.carry.energy !== creep.carryCapacity) {
        creep.memory.harvesting = true;
    }
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.harvesting = false;
    }
    if (creep.memory.harvesting) {
        if (creep.memory.assignedSource && creep.moveTo(Game.getObjectById(creep.memory.assignedSource)) !== ERR_NO_PATH) {
            source = Game.getObjectById(creep.memory.assignedSource);
        } else if (!source) {
            var source = creep.findSource();
        }
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            creep.travelTo(source);
        }
    } else {
        let containerID = creep.harvestDepositContainer();
        if (containerID) {
            let container = Game.getObjectById(containerID);
            if (container) {
                if (container.hits < 25000) {
                    creep.repair(container);
                    creep.say('Fixing');
                } else {
                    creep.transfer(container, RESOURCE_ENERGY);
                }
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
            creep.findStorage();
        }
    }
}
peasant = profiler.registerFN(peasant, 'peasantPeasants');

/**
 * @return {null}
 */
function peasantBuilder(creep) {
    borderChecks.borderCheck(creep);
    if (creep.memory.building && creep.carry.energy === 0) {
        creep.memory.building = false;
    }
    if (!creep.memory.building && creep.carry.energy === creep.carryCapacity) {
        creep.memory.building = true;
    }
    if (creep.memory.building) {
        let target = creep.findConstruction();
        target = Game.getObjectById(target);
        if (target) {
            if (creep.build(target) === ERR_INVALID_TARGET) {
                creep.travelTo(Game.getObjectById(creep.memory.assignedSpawn));
            } else {
                if (creep.build(target) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(target);
                }
            }
        } else {
            if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                creep.travelTo(creep.room.controller);
            }
        }
    } else {
        if (creep.memory.energyDestination) {
            creepTools.withdrawEnergy(creep);
        } else {
            let source = creep.findSource();
            let harvest = creep.harvest(source);
            if (harvest === ERR_NOT_IN_RANGE) {
                if (creep.travelTo(source) === ERR_NO_PATH) {
                    source = undefined;
                }
            }
            if (!source) {
                creepTools.findEnergy(creep, false);
            }
        }
    }
}
peasantBuilder = profiler.registerFN(peasantBuilder, 'peasantBuilderPeasants');

/**
 * @return {null}
 */
function peasantUpgrader(creep) {
    borderChecks.borderCheck(creep);
    if (creep.memory.upgrading && creep.carry.energy === 0) {
        creep.memory.upgrading = false;
    }
    if (!creep.memory.upgrading && creep.carry.energy === creep.carryCapacity) {
        creep.memory.upgrading = true;
    }

    if (creep.memory.upgrading) {
        if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
            creep.travelTo(creep.room.controller);
        }
    } else {
        if (creep.memory.energyDestination) {
            creep.withdrawEnergy();
        } else {
            let source = creep.findSource();
            let harvest = creep.harvest(source);
            if (harvest === ERR_NOT_IN_RANGE) {
                if (creep.travelTo(source) === ERR_NO_PATH) {
                    source = undefined;
                }
            }
            if (!source) {
                creepTools.findEnergy(creep, false);
            }
        }
    }
}
peasantUpgrader = profiler.registerFN(peasantUpgrader, 'peasantUpgraderPeasants');