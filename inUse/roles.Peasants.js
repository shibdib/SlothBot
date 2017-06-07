let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');
let pathing = require('module.pathFinder');

/**
 * @return {null}
 */
module.exports.Peasant = function (creep) {
    borderChecks.borderCheck(creep);
    if (creep.carry.energy === 0) {
        creep.memory.harvesting = true;
    }
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.harvesting = false;
    }
    if (creep.memory.harvesting) {
        if (creep.memory.assignedSource && creep.moveTo(Game.getObjectById(creep.memory.assignedSource)) !== ERR_NO_PATH) {
            source = Game.getObjectById(creep.memory.assignedSource);
        } else if (!source) {
            var source = creepTools.findSource(creep);
        }
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            pathing.Move(creep, source, true);
        }
    } else {
        let containerID = creepTools.harvestDeposit(creep);
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
};

/**
 * @return {null}
 */
module.exports.PeasantBuilder = function (creep) {
    borderChecks.borderCheck(creep);
    if (creep.memory.building && creep.carry.energy === 0) {
        creep.memory.building = false;
    }
    if (!creep.memory.building && creep.carry.energy === creep.carryCapacity) {
        creep.memory.building = true;
    }
    if (creep.memory.building) {
        let target = creepTools.findConstruction(creep);
        target = Game.getObjectById(target);
        if (target) {
            if (creep.build(target) === ERR_INVALID_TARGET) {
                pathing.Move(creep, Game.flags.haulers);
            } else {
                if (creep.build(target) === ERR_NOT_IN_RANGE) {
                    pathing.Move(creep, target);
                }
            }
        } else {
            if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                pathing.Move(creep, creep.room.controller, 1);
            }
        }
    } else {
        if (creep.memory.energyDestination) {
            creepTools.withdrawEnergy(creep);
        } else {
            creepTools.findEnergy(creep, false);
        }
    }
};

/**
 * @return {null}
 */
module.exports.PeasantUpgrader = function (creep) {
    borderChecks.borderCheck(creep);
    if (creep.memory.upgrading && creep.carry.energy === 0) {
        creep.memory.upgrading = false;
    }
    if (!creep.memory.upgrading && creep.carry.energy === creep.carryCapacity) {
        creep.memory.upgrading = true;
    }

    if (creep.memory.upgrading) {
        if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
            pathing.Move(creep, creep.room.controller);
        }
    } else {
        if (creep.memory.energyDestination) {
            creepTools.withdrawEnergy(creep);
        } else {
            creepTools.findEnergy(creep, false);
        }
    }

};