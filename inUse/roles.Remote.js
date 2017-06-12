let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');
let pathing = require('module.pathFinder');

/**
 * @return {null}
 */
module.exports.RHarvester = function (creep) {
    if (!Game.flags[creep.memory.destination]) {
        creepTools.recycle(creep);
        return null;
    }
    //Invader detection
    invaderCheck(creep);
    //Initial move
    if (creep.carry.energy === 0) {
        creep.memory.harvesting = true;
    }
    if (!creep.memory.destinationReached) {
        pathing.Move(creep, Game.flags[creep.memory.destination], false, 16);
        if (creep.pos.getRangeTo(Game.flags[creep.memory.destination]) <= 1) {
            creep.memory.destinationReached = true;
        }
        return null;
    } else if (creep.carry.energy === creep.carryCapacity || creep.memory.harvesting === false) {
        creep.memory.harvesting = false;
        depositEnergy(creep);
    } else {
        if (creep.memory.source) {
            source = Game.getObjectById(creep.memory.source);
        } else if (!source) {
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
    if (!creep.memory.destinationReached) {
        pathing.Move(creep, Game.flags[creep.memory.destination], false, 16);
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
                pathing.Move(creep, container, false, 1);
            }
        }
    }

    //Haul to spawn/extension
    if (creep.memory.hauling === true) {
        if (creep.room.name === Game.spawns[Game.getObjectById(creep.memory.assignedSpawn).name].pos.roomName) {
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
        } else {
            pathing.Move(creep, Game.spawns[Game.getObjectById(creep.memory.assignedSpawn).name], false, 16);
        }
    }
};


/**
 * @return {null}
 */
module.exports.roadBuilder = function (creep) {
    if (creep.memory.resupply === null || creep.memory.resupply === undefined) {
        creep.memory.resupply = 'Spawn1';
        return null;
    }
    if (!creep.memory.destinationReached) {
        pathing.Move(creep, Game.flags[creep.memory.destination], false, 16);
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
                pathing.Move(creep, container, false, 1);
            }
        }
    }

    //Haul to spawn/extension and build a road
    if (creep.memory.hauling === true) {
        if (creep.pos.lookFor(LOOK_STRUCTURES).length === 0 && creep.pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            creep.pos.createConstructionSite(STRUCTURE_ROAD);
            return null;
        }
        if (creep.pos.lookFor(LOOK_CONSTRUCTION_SITES).length > 0) {
            let site = creep.pos.findInRange(FIND_CONSTRUCTION_SITES, 0);
            creep.build(site[0]);
            return null;
        } else {
            pathing.Move(creep, Game.spawns[creep.memory.resupply], false, 16);
        }
    }
};

/**
 * @return {null}
 */
module.exports.spawnBuilder = function (creep) {
    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
        creep.memory.destinationReached = null;
    }
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        if (creep.room.name === Game.spawns[Game.getObjectById(creep.memory.assignedSpawn).name].pos.roomName) {
            if (creep.memory.energyDestination) {
                creepTools.withdrawEnergy(creep);
                return null;
            } else {
                creepTools.findEnergy(creep, false);
                return null;
            }
        } else {
            if (creep.memory.assignedSource) {
                source = Game.getObjectById(creep.memory.assignedSource);
            } else if (!source) {
                var source = creepTools.findSource(creep);
            }
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                pathing.Move(creep, source, true);
            }
        }
    }
    if (!creep.memory.destinationReached && creep.memory.hauling === true) {
        if (creep.pos.getRangeTo(Game.getObjectById(creep.memory.target)) <= 3) {
            creep.memory.destinationReached = true;
        }
        pathing.Move(creep, Game.getObjectById(creep.memory.target), false, 16);
    } else if (creep.memory.destinationReached && creep.memory.hauling === true) {
        if (!Game.getObjectById(creep.memory.target)) {
            creep.memory.role = "peasantBuilder";
        }
        creep.build(Game.getObjectById(creep.memory.target));
        return null;
    }
};

function depositEnergy(creep) {
    if (!creep.memory.containerID) {
        creep.memory.containerID = creepTools.harvestDepositContainer(creep);
    }
    if (creep.memory.containerID) {
        let container = Game.getObjectById(creep.memory.containerID);
        if (container) {
            if (container.hits < container.hitsMax * 0.25) {
                creep.repair(container);
                creep.say('Fixing');
            } else if (container.store[RESOURCE_ENERGY] !== container.storeCapacity) {
                creep.transfer(container, RESOURCE_ENERGY);
            } else if (!creep.memory.linkID) {
                creep.memory.linkID = creepTools.harvestDepositLink(creep);
            }
            if (creep.memory.linkID) {
                let link = Game.getObjectById(creep.memory.linkID);
                if (link) {
                    if (link.hits < link.hitsMax * 0.25) {
                        creep.repair(link);
                        creep.say('Fixing');
                    } else if (link.energy !== link.energyCapacity) {
                        creep.transfer(link, RESOURCE_ENERGY);
                    }
                }
            }
        }
    } else {
        let buildSite = Game.getObjectById(creepTools.containerBuilding(creep));
        if (buildSite) {
            creep.build(buildSite);
        } else {
            creepTools.harvesterContainerBuild(creep);
        }
    }
}

function invaderCheck(creep) {
    let invader = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (invader) {
        creep.memory.invaderDetected = true;
    } else {
        creep.memory.invaderDetected = undefined;
    }
}