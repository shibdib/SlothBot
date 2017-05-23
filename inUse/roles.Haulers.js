let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');
let pathing = require('module.pathFinder');

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
                creep.moveTo(container, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
    }
    if (creepTools.rangeSource(creep) === 1) {
        creep.moveTo(Game.flags.bump, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
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
                creep.moveTo(targets[0], {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        } else {
            const tower = Game.getObjectById(creepTools.findTower(creep));
            if (tower) {
                if (creep.transfer(tower, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(tower, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }
        }
    }
};

module.exports.Expediter = function (creep) {
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
    if (creepTools.rangeAssignment(creep) > 4) {
        var container = Game.getObjectById(creep.memory.assignedContainer);
        creep.moveTo(container);
        return;
    }
    const energy = creep.pos.findInRange(FIND_DROPPED_ENERGY, 8);
    if (energy) {
        if (creep.pickup(energy[0]) === ERR_NOT_IN_RANGE) {
            if (creep.moveByPath(creep.memory.path) === OK) {
            } else {
                creep.memory.path = pathing.Move(creep,energy[0]);
                creep.moveByPath(creep.memory.path);
            }
        }
    }

    //Haul to container
    var container = Game.getObjectById(creep.memory.assignedContainer);
    if (container && creep.carry.energy === creep.carryCapacity) {
        if (creep.transfer(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            if (creep.moveByPath(creep.memory.path) === OK) {
            } else {
                creep.memory.path = pathing.Move(creep,container);
                creep.moveByPath(creep.memory.path);
            }
        }
    }
};

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
                if (creep.moveByPath(creep.memory.path) === OK) {
                } else {
                    creep.memory.path = pathing.Move(creep,closestContainer);
                    creep.moveByPath(creep.memory.path);
                }
            }
        } else {
            const energy = creep.pos.findClosestByRange(FIND_DROPPED_ENERGY, {filter: (s) => s.amount > 50});
            if (energy) {
                if (creep.pickup(energy) === ERR_NOT_IN_RANGE) {
                    if (creep.moveByPath(creep.memory.path) === OK) {
                    } else {
                        creep.memory.path = pathing.Move(creep,energy);
                        creep.moveByPath(creep.memory.path);
                    }
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
                creep.moveTo(target, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        } else {
            let newTarget = creepTools.findNewBuilder(creep);
            newTarget = Game.getObjectById(newTarget);
            if (newTarget) {
                newTarget.memory.incomingEnergy = creep.id;
                newTarget.memory.incomingCounter = 0;
                if (creep.transfer(newTarget, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    if (creep.moveByPath(creep.memory.path) === OK) {
                    } else {
                        creep.memory.path = pathing.Move(creep,newTarget);
                        creep.moveByPath(creep.memory.path);
                    }
                }
            } else {
                creep.moveTo(Game.flags.haulers, {reusePath: 20}, {
                    visualizePathStyle: {stroke: '#ffffff'}
                });
            }
        }
    }

};

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
                if (creep.moveByPath(creep.memory.path) === OK) {
                } else {
                    creep.memory.path = pathing.Move(creep,energy);
                    creep.moveByPath(creep.memory.path);
                }
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
                if (creep.moveByPath(creep.memory.path) === OK) {
                } else {
                    creep.memory.path = pathing.Move(creep,targets[0]);
                    creep.moveByPath(creep.memory.path);
                }
            }
        }
    }
};