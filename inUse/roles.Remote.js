let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');
let pathing = require('module.pathFinder');

/**
 * @return {null}
 */
module.exports.RHarvester = function (creep) {
    if (creepTools.renewal(creep, 150) === true) {
        creep.memory.destinationReached = null;
        return null;
    }
    //Initial move
    if (creep.carry.energy === 0) {
        creep.memory.harvesting = true;
    }
    if (!creep.memory.destinationReached) {
        pathing.Move(creep, Game.flags[creep.memory.destination], 45, false, 16);
        if (creep.pos.getRangeTo(Game.flags[creep.memory.destination]) <= 1) {
            creep.memory.destinationReached = true;
        }
        return null;
    } else if (creep.carry.energy === creep.carryCapacity || creep.memory.harvesting === false) {
        creep.memory.harvesting = false;
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
            pathing.Move(creep, source);
        }
    }
};

/**
 * @return {null}
 */
module.exports.RHauler = function (creep) {
    if (creepTools.renewal(creep, 120) === true) {
        creep.memory.destinationReached = null;
        creep.memory.hauling = true;
        return null;
    }
    if (creep.memory.resupply === null || creep.memory.resupply === undefined){
        creep.memory.resupply = 'Spawn1';
        return null;
    }
    if (creepTools.rangeSource(creep) === 1) {
        pathing.Move(creep, Game.flags.bump);
        return null;
    }
    if (!creep.memory.destinationReached) {
        pathing.Move(creep, Game.flags[creep.memory.destination], 30, false, 16);
        if (creep.pos.getRangeTo(Game.flags[creep.memory.destination]) <= 1) {
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
        let container = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER});
        if (container) {
            if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                pathing.Move(creep, container, 5, false, 1);
            }
        }
    }

    //Haul to spawn/extension
    if (creep.memory.hauling === true) {
        if (creep.room.name === Game.spawns[creep.memory.resupply].pos.roomName) {
            const targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (structure.structureType === STRUCTURE_EXTENSION ||
                        structure.structureType === STRUCTURE_SPAWN) && structure.energy < structure.energyCapacity;
                }
            });
            if (targets.length > 0) {
                if (creep.transfer(targets[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    pathing.Move(creep, targets[0], 2, false, 1);
                }
            } else {
                const tower = Game.getObjectById(creepTools.findTower(creep));
                if (tower) {
                    if (creep.transfer(tower, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        pathing.Move(creep, tower, 2, false, 1);
                    }
                }
            }
        } else {
            pathing.Move(creep, Game.spawns[creep.memory.resupply], 10, false, 16);
        }
    }
};


/**
 * @return {null}
 */
module.exports.LongRoadBuilder = function (creep) {
    //Initial move
    let spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
    let home = Game.spawns[creep.memory.resupply];
    if (creep.pos.getRangeTo(Game.flags[creep.memory.destination]) <= 3) {
        creep.memory.destinationReached = true;
    }
    if (!creep.memory.destinationReached) {
        if (creep.carry.energy > 0) {
            if (creepTools.findRoad(creep) === false && spawn !== home) {
                if (creep.pos.createConstructionSite(STRUCTURE_ROAD) === OK) {
                    return null;
                }
            }
            if (creepTools.findNearbyConstruction(creep) !== false) {
                creep.build(Game.getObjectById(creep.memory.constructionSite));
                return null;
            }
            pathing.Move(creep, Game.flags[creep.memory.destination], 25, false, 16);
        } else {
            let spawn = Game.spawns[creep.memory.resupply];
            if (creep.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                pathing.Move(creep, spawn, 25, false, 16);
            }
        }
    } else {
        creep.suicide();
    }
};