let borderChecks = require('inUse/module.creepRestrictions');
let creepTools = require('module.creepFunctions');

module.exports.RHarvester = function (creep) {
    //Initial move
    if (!creep.memory.destinationReached) {
        creep.moveTo(Game.flags[creep.memory.destination], {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
        if (creep.pos.getRangeTo(Game.flags[creep.memory.destination]) <= 1) {
            creep.memory.destinationReached = true;
        }
    } else
    if (creep.carry.energy > 0) {
        let containerID = creepTools.harvestDeposit(creep);
        if (containerID) {
            let container = Game.getObjectById(containerID);
            if (container) {
                creep.transfer(container, RESOURCE_ENERGY);
            }
        } else {
            let buildSite = Game.getObjectById(creepTools.containerBuilding(creep));
            if (buildSite) {
                creep.build(buildSite);
            } else {
                creepTools.harvesterContainerBuild(creep);
            }
        }
    } else {
        if (creep.memory.assignedSource && creep.moveTo(Game.getObjectById(creep.memory.assignedSource)) !== ERR_NO_PATH){
            source = Game.getObjectById(creep.memory.assignedSource);
        }else if (!source) {
            var source = creepTools.findSource(creep);
        }
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
        }
    }
};

/**
 * @return {null}
 */
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
            let container = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER})
            if (container) {
                if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(container, {visualizePathStyle: {stroke: '#ffaa00'}});
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