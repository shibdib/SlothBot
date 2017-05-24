let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');
let pathing = require('module.pathFinder');

/**
 * @return {null}
 */
module.exports.Hauler = function (creep) {
    //BORDER CHECK
    if (creep.memory.hauling === true) {
        if (borderChecks.wrongRoom(creep) !== false) {
            return;
        }
        if (borderChecks.isOnBorder(creep) === true) {
            borderChecks.nextStepIntoRoom(creep);
        }
    }
    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        const container = Game.getObjectById(creep.memory.assignedContainer);
        if (container) {
            if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                pathing.Move(creep, container, 3);
            }
        }
    }
    if (creepTools.rangeSource(creep) === 1) {
        pathing.Move(creep, Game.flags.bump);
        return;
    }

    //Haul to spawn/extension
    if (creep.memory.hauling === true) {
        const targets = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType === STRUCTURE_EXTENSION ||
                    structure.structureType === STRUCTURE_SPAWN) && structure.energy < structure.energyCapacity;
            }
        });
        if (targets.length > 0) {
            if (creep.transfer(targets[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                pathing.Move(creep, targets[0], 2);
            }
        } else {
            const tower = Game.getObjectById(creepTools.findTower(creep));
            if (tower) {
                if (creep.transfer(tower, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    pathing.Move(creep, tower, 3);
                }
            }
        }
    }
};

/**
 * @return {null}
 */
module.exports.DumpTruck = function (creep) {
    //BORDER CHECK
    if (borderChecks.wrongRoom(creep) !== false){
        return;
    }
    if (borderChecks.isOnBorder(creep) === true) {
        borderChecks.nextStepIntoRoom(creep);
    }
    if (creep.carry.energy < 50) {
        creep.memory.hauling = false;
    }
    if (creep.memory.hauling === false) {
        creepTools.findContainer(creep);
        let closestContainer = Game.getObjectById(creep.memory.container);
        if (closestContainer) {
            if (creep.withdraw(closestContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                pathing.Move(creep, closestContainer, 3);
            }
        } else {
            const energy = creep.pos.findClosestByRange(FIND_DROPPED_ENERGY, {filter: (s) => s.amount > 50});
            if (energy) {
                if (creep.pickup(energy) === ERR_NOT_IN_RANGE) {
                    pathing.Move(creep, energy, 3);
                }
            }
        }
    }

    //Haul to builder/upgrader
    if (creep.carry.energy >= 50) {
        creep.memory.hauling = true;
        creepTools.findBuilder(creep);
        let target = Game.getObjectById(creep.memory.builderID);
        if (target) {
            target.memory.incomingEnergy = creep.id;
            if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                pathing.Move(creep, target, 1);
            }
        } else {
            let newTarget = creepTools.findNewBuilder(creep);
            newTarget = Game.getObjectById(newTarget);
            if (newTarget) {
                newTarget.memory.incomingEnergy = creep.id;
                newTarget.memory.incomingCounter = 0;
                if (creep.transfer(newTarget, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    pathing.Move(creep, newTarget, 1);
                }
            } else {
                pathing.Move(creep, Game.flags.haulers, 5);
            }
        }
    }

};

/**
 * @return {null}
 */
module.exports.BasicHauler = function (creep) {
    //BORDER CHECK
    if (borderChecks.wrongRoom(creep) !== false){
        return;
    }
    if (borderChecks.isOnBorder(creep) === true) {
        borderChecks.nextStepIntoRoom(creep);
    }
    if (creepTools.rangeSource(creep) === 1) {
        creep.moveTo(Game.flags.bump, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
        return;
    }
    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        const energy = creep.pos.findClosestByRange(FIND_DROPPED_ENERGY);
        if (energy) {
            if (creep.pickup(energy) === ERR_NOT_IN_RANGE) {
                pathing.Move(creep, energy);
            }
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
                pathing.Move(creep, targets[0]);
            }
        }
    }
};