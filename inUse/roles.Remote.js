let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');

module.exports.RHarvester = function (creep) {
    //Initial move
    if (!creep.memory.destinationReached) {
        creep.moveTo(Game.flags[creep.memory.destination], {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
        if (creep.pos.getRangeTo(Game.flags[creep.memory.destination]) <= 1) {
            creep.memory.destinationReached = true;
        }
    } else
    if (creep.carry.energy < creep.carryCapacity) {
        if (creep.memory.assignedSource && creep.moveTo(Game.getObjectById(creep.memory.assignedSource)) !== ERR_NO_PATH){
            source = Game.getObjectById(creep.memory.assignedSource);
        }else if (!source) {
            var source = creepTools.findSource(creep);
        }
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
        }
    }else{
        creep.drop(RESOURCE_ENERGY);
    }
};

module.exports.RHauler = function (creep) {
    if (creepTools.rangeSource(creep) === 1) {
        creep.moveTo(Game.flags.bump, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
        return null;
    }
    if (creep.carry.energy !== creep.carryCapacity) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        let remoteHarvester = Game.getObjectById(creep.memory.assignedHarvester);
        if (remoteHarvester && creep.memory.hauling === false) {
            creep.moveTo(remoteHarvester, {visualizePathStyle: {stroke: '#ffaa00'}});
        }
        if (creep.pos.getRangeTo(remoteHarvester) === 1) {
            let energy = creep.pos.findInRange(FIND_DROPPED_ENERGY, 5);
            if (energy) {
                if (creep.pickup(energy[0]) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(energy[0], {visualizePathStyle: {stroke: '#ffaa00'}});
                }
            }
        }
    }

    //Haul to spawn/extension
    if (creep.memory.hauling === true) {
        if (creep.transfer(Game.spawns['Spawn1'], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(Game.spawns['Spawn1'], {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
        }
    }
};