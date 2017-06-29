let creepTools = require('module.creepFunctions');
let cache = require('module.cache');
let pathing = require('module.pathFinder');


module.exports.Manager = function (creep) {
    if (creep.memory.role === "remoteHarvester") {
        harvester(creep);
    } else if (creep.memory.role === "remoteHauler") {
        hauler(creep);
    } else if (creep.memory.role === "spawnBuilder") {
        spawnBuilder(creep);
    }
};

/**
 * @return {null}
 */
function harvester(creep) {
    cache.cacheRoomIntel(creep);
    if (!Game.flags[creep.memory.destination]) {
        creepTools.recycle(creep);
        return null;
    }
    //Invader detection
    invaderCheck(creep);
    if (creep.memory.invaderDetected === true) {
        creep.travelTo(Game.getObjectById(creep.memory.assignedSpawn));
        creep.memory.destinationReached = false;
        return null;
    }
    //Initial move
    if (creep.carry.energy === 0) {
        creep.memory.harvesting = true;
    }
    if (!creep.memory.destinationReached) {
        creep.travelTo(Game.flags[creep.memory.destination]);
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
            creep.travelTo(source);
        }
    }
}
/**
 * @return {null}
 */
function hauler(creep) {
    //Invader detection
    invaderCheck(creep);
    if (creep.memory.invaderDetected === true) {
        creep.travelTo(Game.getObjectById(creep.memory.assignedSpawn));
        creep.memory.destinationReached = false;
        return null;
    }
    if (!creep.memory.destinationReached) {
        creep.travelTo(Game.flags[creep.memory.destination]);
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
                creep.travelTo(container);
            }
        }
    }

    //Haul to terminal -> spawn/extension
    if (creep.memory.hauling === true) {
        if (creep.room.name === Game.spawns[Game.getObjectById(creep.memory.assignedSpawn).name].pos.roomName) {
            let terminal = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'terminal'), 'id');
            let storage = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'storage'), 'id');
            if (terminal.length > 0) {
                creep.memory.storageDestination = terminal[0];
            } else
            if (storage.length > 0) {
                creep.memory.storageDestination = storage[0];
            }
            if (creep.memory.storageDestination) {
                let storageItem = Game.getObjectById(creep.memory.storageDestination);
                if (creep.transfer(storageItem, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(storageItem);
                } else {
                    creep.memory.storageDestination = null;
                    creep.memory.path = null;
                }
                return null;
            }
            creepTools.findStorage(creep);
        } else {
            creep.travelTo(Game.spawns[Game.getObjectById(creep.memory.assignedSpawn).name]);
        }
    }
}
/**
 * @return {null}
 */
function spawnBuilder(creep) {
    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
        creep.memory.destinationReached = null;
    }
    if (!Game.getObjectById(creep.memory.target)) {
        creep.memory.role = "peasantBuilder";
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
                creep.travelTo(source);
            }
        }
    }
    if (!creep.memory.destinationReached && creep.memory.hauling === true) {
        if (creep.pos.getRangeTo(Game.getObjectById(creep.memory.target)) <= 3) {
            creep.memory.destinationReached = true;
        }
        creep.travelTo(Game.getObjectById(creep.memory.target));
    } else if (creep.memory.destinationReached && creep.memory.hauling === true) {
        creep.build(Game.getObjectById(creep.memory.target));
        return null;
    }
}
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
    let spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
    if (!spawn) {
        let invader = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        if (invader) {
            let number = creep.room.find(FIND_HOSTILE_CREEPS);
            creep.room.memory.responseNeeded = true;
            creep.room.memory.numberOfHostiles = number.length;
            creep.memory.invaderDetected = true;
        } else {
            creep.memory.invaderDetected = undefined;
            creep.memory.invaderID = undefined;
            creep.room.memory.numberOfHostiles = undefined;
            creep.room.memory.responseNeeded = false;
        }
    } else {
        creep.memory.invaderDetected = undefined;
        creep.memory.invaderID = undefined;
        creep.room.memory.responseNeeded = false;
    }
}