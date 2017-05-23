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
    if (creep.memory.resupply === null || creep.memory.resupply === undefined){
        creep.memory.resupply = 'Spawn1';
        return null;
    }
    if (creepTools.rangeSource(creep) === 1) {
        creep.moveTo(Game.flags.bump, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
        return null;
    }
    if (!creep.memory.destinationReached) {
        creep.moveTo(Game.flags[creep.memory.destination], {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
        if (creep.pos.getRangeTo(Game.flags[creep.memory.destination]) <= 5) {
            creep.memory.destinationReached = true;
        }
        return null;
    }
    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
        creep.memory.destinationReached = null;
    }
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        let container = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER})
        if (container) {
            if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(container, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        }
    }

    //Haul to spawn/extension
    if (creep.memory.hauling === true) {
        if (creep.room.id === Game.spawns[creep.memory.resupply].room.id) {
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
        } else {
            creep.moveTo(Game.spawns[creep.memory.resupply], {visualizePathStyle: {stroke: '#ffaa00'}});
        }
    }
};


module.exports.LongRoadBuilder = function (creep) {
    //Initial move
    let spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
    let home = Game.spawns[creep.memory.resupply];
    if (creep.pos.getRangeTo(Game.flags[creep.memory.destination]) === 0) {
        creep.memory.destinationReached = true;
        creep.memory.returnTrip = false;
    }
    if (!creep.memory.destinationReached) {
        if (creep.carry.energy > 0) {
            if (creepTools.findRoad(creep) === false && spawn !== home) {
                if (creep.pos.createConstructionSite(STRUCTURE_ROAD) === OK) {
                    return;
                }
            }
            if (creepTools.findNearbyConstruction(creep) !== false) {
                creep.build(Game.getObjectById(creep.memory.constructionSite));
                return;
            }
            creep.moveTo(Game.flags[creep.memory.destination], {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
        } else {
            let spawn = Game.spawns[creep.memory.resupply];
            if (creep.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(spawn, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        }
    } else {
        creep.suicide();
    }
};