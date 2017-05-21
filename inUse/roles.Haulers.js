let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');

module.exports.Hauler = function (creep) {
    //BORDER CHECK
    if (borderChecks.isOnBorder(creep) === true) {
        borderChecks.nextStepIntoRoom(creep);
    }
    if (creepTools.rangeSource(creep) === 1) {
        creep.moveTo(Game.flags.bump, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
        return;
    }
    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        var container = Game.getObjectById(creep.memory.assignedContainer);
        if (container) {
            if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(container, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
            }
        }
    }

    //Haul to spawn/extension
    if (creep.memory.hauling === true) {
        var targets = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType === STRUCTURE_EXTENSION ||
                    structure.structureType === STRUCTURE_SPAWN) && structure.energy < structure.energyCapacity;
            }
        })
        if (targets.length > 0) {
            if (creep.transfer(targets[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(targets[0], {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
            }
        } else {
            var tower = Game.getObjectById(creepTools.findTower(creep));
            if (tower) {
                if (creep.transfer(tower, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(tower, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
                }
            }
        }
    }
};

module.exports.Expediter = function (creep) {
    //BORDER CHECK
    if (borderChecks.isOnBorder(creep) === true) {
        borderChecks.nextStepIntoRoom(creep);
    }
    if (creepTools.rangeSource(creep) === 1) {
        creep.moveTo(Game.flags.bump, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
        return;
    }
    if (creepTools.rangeAssignment(creep) > 4) {
        var container = Game.getObjectById(creep.memory.assignedContainer);
        creep.moveTo(container);
        return;
    }
    var energy = creep.pos.findInRange(FIND_DROPPED_ENERGY, 8);
    if (energy) {
        if (creep.pickup(energy[0]) === ERR_NOT_IN_RANGE) {
            creep.moveTo(energy[0], {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
        }
    }

    //Haul to container
    var container = Game.getObjectById(creep.memory.assignedContainer);
    if (container && creep.carry.energy === creep.carryCapacity) {
        if (creep.transfer(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(container, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
        }
    }
};

module.exports.DumpTruck = function (creep) {
    //BORDER CHECK
    if (borderChecks.isOnBorder(creep) === true) {
        borderChecks.nextStepIntoRoom(creep);
    }

    if (creep.carry.energy < 50) {
        creep.memory.hauling = false;
    }
    if (creep.memory.hauling === false) {
        creepTools.findContainer(creep);
        let closestContainer = Game.getObjectById(creep.memory.container);
        if (closestContainer && creep.moveTo(creep.memory.container) !== ERR_NO_PATH) {
            if (creep.withdraw(closestContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(closestContainer, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
            }
        } else {
            var energy = creep.pos.findClosestByRange(FIND_DROPPED_ENERGY, {filter: (s) => s.amount > 50});
            if (energy) {
                if (creep.pickup(energy) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(energy, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
                }
            }
        }
    }

    //Haul to spawn/extension
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
            var newTarget = creepTools.findNewBuilder(creep);
            newTarget = Game.getObjectById(newTarget);
            if (newTarget) {
                newTarget.memory.incomingEnergy = creep.id;
                newTarget.memory.incomingCounter = 0;
                if (creep.transfer(newTarget, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(newTarget, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
                }
            } else {
                creep.moveTo(Game.flags.haulers, {reusePath: 20}, {
                    visualizePathStyle: {stroke: '#ffffff'},
                    maxRooms: 1
                });
            }
        }
    }

};

module.exports.BasicHauler = function (creep) {
    //BORDER CHECK
    if (borderChecks.isOnBorder(creep) === true) {
        borderChecks.nextStepIntoRoom(creep);
    }
    if (creepTools.rangeSource(creep) === 1) {
        creep.moveTo(Game.flags.bump, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
        return;
    }
    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        var energy = creep.pos.findClosestByRange(FIND_DROPPED_ENERGY);
        if (energy) {
            if (creep.pickup(energy) === ERR_NOT_IN_RANGE) {
                creep.moveTo(energy, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
            }
        }
    } else {
        var targets = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType === STRUCTURE_EXTENSION ||
                    structure.structureType === STRUCTURE_SPAWN) && structure.energy < structure.energyCapacity;
            }
        })
        if (targets.length > 0) {
            if (creep.transfer(targets[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(targets[0], {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
            }
        }
    }
};