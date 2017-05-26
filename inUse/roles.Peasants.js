let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');
let pathing = require('module.pathFinder');

/**
 * @return {null}
 */
module.exports.Peasant = function (creep) {
    if (creep.carry.energy < creep.carryCapacity) {
        if (creep.memory.assignedSource && creep.moveTo(Game.getObjectById(creep.memory.assignedSource)) !== ERR_NO_PATH) {
            source = Game.getObjectById(creep.memory.assignedSource);
        } else if (!source) {
            var source = creepTools.findSource(creep);
        }
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            pathing.Move(creep, source, 1, true);
        }
    } else {
        let containerID = creepTools.harvestDeposit(creep);
        if (containerID) {
            let container = Game.getObjectById(containerID);
            if (container) {
                creep.transfer(container, RESOURCE_ENERGY);
            }
        } else {
            const targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (structure.structureType === STRUCTURE_EXTENSION ||
                        structure.structureType === STRUCTURE_SPAWN) && structure.energy < structure.energyCapacity;
                }
            });
            if (targets.length > 0) {
                if (creep.transfer(targets[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    pathing.Move(creep, targets[0], 1);
                }
            } else {
                let container = creepTools.findContainer(creep);
                container = Game.getObjectById(container);
                if (container && container.store < container.storeCapacity) {
                    if (creep.transfer(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        pathing.Move(creep, container, 1);
                    }
                }
            }
        }
    }
};

/**
 * @return {null}
 */
module.exports.PeasantBuilder = function (creep) {
    if (!creepTools.findSpawn(creep).memory.build === false) {
        if (creep.carry.energy > 0) {
            let target = creepTools.findConstruction(creep);
            target = Game.getObjectById(target);
            if (target) {
                if (creep.build(target) === ERR_INVALID_TARGET) {
                    pathing.Move(creep, Game.flags.haulers, 1);
                } else {
                    if (creep.build(target) === ERR_NOT_IN_RANGE) {
                        pathing.Move(creep, target, 1);
                    }
                }
            }
        } else {
            if (creep.memory.spawnID && Game.getObjectById(creep.memory.spawnID)) {
                var spawn = Game.getObjectById(creep.memory.spawnID);
            } else {
                var spawn = creepTools.findSpawn(creep);
            }
            if (creep.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                pathing.Move(creep, spawn, 1);
            }
        }
    }
};

/**
 * @return {null}
 */
module.exports.PeasantUpgrader = function (creep) {
    if (creep.memory.upgrading && creep.carry.energy === 0) {
        creep.memory.upgrading = false;
    }
    if (!creep.memory.upgrading && creep.carry.energy > 0) {
        creep.memory.upgrading = true;
    }

    if (creep.memory.upgrading) {
        if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
            pathing.Move(creep, creep.room.controller, 1);
        }
    } else {
        let source = creepTools.findSource(creep);
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            pathing.Move(creep, source, 1, true);
        }
    }

};