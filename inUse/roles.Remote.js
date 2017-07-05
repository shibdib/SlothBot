let cache = require('module.cache');
const profiler = require('screeps-profiler');


function Manager(creep) {
    if (creep.memory.role === "remoteHarvester") {
        harvester(creep);
    } else if (creep.memory.role === "remoteHauler") {
        hauler(creep);
    } else if (creep.memory.role === "pioneer") {
        pioneer(creep);
    } else if (creep.memory.role === "explorer") {
        explorer(creep);
    }
}
module.exports.Manager = profiler.registerFN(Manager, 'managerRemote');

/**
 * @return {null}
 */
function explorer(creep) {
    cache.cacheRoomIntel(creep);
    if (!creep.memory.targetRooms || !creep.memory.destination) {
        creep.memory.targetRooms = Game.map.describeExits(creep.pos.roomName);
        creep.memory.destination = _.sample(creep.memory.targetRooms);
    }
    if (creep.memory.destinationReached !== true) {
        creep.travelTo(new RoomPosition(25, 25, creep.memory.destination));
        if (creep.pos.roomName === creep.memory.destination) {
            creep.memory.destinationReached = true;
        }
    } else {
        cache.cacheRoomIntel(creep);
        creep.memory.destination = undefined;
        creep.memory.targetRooms = undefined;
        creep.memory.destinationReached = undefined;
    }
}
explorer = profiler.registerFN(explorer, 'explorerRemote');

/**
 * @return {null}
 */
function harvester(creep) {
    let source;
    cache.cacheRoomIntel(creep);
    //Invader detection
    invaderCheck(creep);
    if (creep.memory.invaderDetected === true || creep.memory.invaderCooldown < 50) {
        creep.memory.invaderCooldown++;
        creep.travelTo(Game.getObjectById(creep.memory.assignedSpawn));
        creep.memory.destinationReached = false;
        return null;
    } else if (creep.memory.invaderCooldown > 50) {
        creep.memory.invaderCooldown = undefined;
    }
    //Initial move
    if (creep.carry.energy === 0) {
        creep.memory.harvesting = true;
    }
    if (!creep.memory.destinationReached) {
        creep.travelTo(new RoomPosition(25, 25, creep.memory.destination));
        if (creep.pos.roomName === creep.memory.destination) {
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
            source = creep.findSource();
        }
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            creep.travelTo(source);
        }
    }
}
harvester = profiler.registerFN(harvester, 'harvesterRemote');

/**
 * @return {null}
 */
function hauler(creep) {
    //Invader detection
    invaderCheck(creep);
    if (creep.memory.invaderDetected === true || creep.memory.invaderCooldown < 50) {
        creep.memory.invaderCooldown++;
        creep.travelTo(Game.getObjectById(creep.memory.assignedSpawn));
        creep.memory.destinationReached = false;
        return null;
    } else if (creep.memory.invaderCooldown > 50) {
        creep.memory.invaderCooldown = undefined;
    }

    if (creep.pos.roomName !== creep.memory.destination) {
        creep.memory.destinationReached = false;
    }
    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.hauling = true;
    }

    if (creep.memory.destinationReached === true || creep.memory.hauling === true) {
        if (creep.memory.hauling === false) {
            if (!creep.memory.containerID) {
                let container = creep.room.find(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && _.sum(s.store) > s.storeCapacity / 2});
                if (container.length > 0) {
                    creep.memory.containerID = container[0].id;
                    if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        creep.travelTo(container);
                    }
                }
            } else {
                if (_.sum(Game.getObjectById(creep.memory.containerID).store) === 0) {
                    creep.memory.containerID = undefined;
                }
                if (creep.withdraw(Game.getObjectById(creep.memory.containerID), RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(Game.getObjectById(creep.memory.containerID));
                }
            }
        } else {
            if (creep.pos.getRangeTo(Game.getObjectById(creep.memory.assignedSpawn)) <= 50) {
                creep.memory.destinationReached = false;
                let terminal = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'terminal'), 'id');
                let storage = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'storage'), 'id');
                if (storage.length > 0) {
                    creep.memory.storageDestination = storage[0];
                } else if (terminal.length > 0) {
                    creep.memory.storageDestination = terminal[0];
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
                creep.findStorage();
            } else {
                creep.travelTo(Game.getObjectById(creep.memory.assignedSpawn), {
                    range: 20
                });
            }
        }
    } else if (!creep.memory.destinationReached) {
        creep.memory.containerID = undefined;
        if (creep.pos.getRangeTo(new RoomPosition(25, 25, creep.memory.destination)) <= 25) {
            creep.memory.destinationReached = true;
        }
        creep.travelTo(new RoomPosition(25, 25, creep.memory.destination), {range: 20});
    }
}
hauler = profiler.registerFN(hauler, 'haulerRemote');

/**
 * @return {null}
 */
function pioneer(creep) {
    //Invader detection
    invaderCheck(creep);
    if (creep.memory.invaderDetected === true || creep.memory.invaderCooldown < 50) {
        creep.memory.invaderCooldown++;
        creep.travelTo(Game.getObjectById(creep.memory.assignedSpawn));
        creep.memory.destinationReached = false;
        return null;
    } else if (creep.memory.invaderCooldown > 50) {
        creep.memory.invaderCooldown = undefined;
    }

    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        if (creep.room.name === Game.spawns[Game.getObjectById(creep.memory.assignedSpawn).name].pos.roomName) {
            if (creep.memory.energyDestination) {
                creep.withdrawEnergy();
                return null;
            } else {
                creep.findEnergy();
                return null;
            }
        } else {
            let container = creep.room.find(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 100});
            if (container.length > 0) {
                if (creep.withdraw(container[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(container[0]);
                }
            } else if (creep.memory.source) {
                if (creep.harvest(Game.getObjectById(creep.memory.source)) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(Game.getObjectById(creep.memory.source));
                }
            } else if (!creep.memory.source) {
                creep.findSource();
            }
        }
    } else
    if (!creep.memory.destinationReached && creep.memory.hauling === true) {
        creep.travelTo(Game.flags[creep.memory.destination]);
        if (creep.pos.getRangeTo(Game.flags[creep.memory.destination]) <= 1) {
            creep.memory.destinationReached = true;
        }
    } else if (creep.memory.destinationReached && creep.memory.hauling === true) {
        if (!Game.getObjectById(creep.memory.constructionSite)) {
            creep.memory.constructionSite = undefined;
        }
        if (creep.memory.constructionSite) {
            if (creep.build(Game.getObjectById(creep.memory.constructionSite)) === ERR_NOT_IN_RANGE) {
                creep.travelTo(Game.getObjectById(creep.memory.constructionSite))
            }
        } else {
            creep.findConstruction();
        }
        if (!creep.memory.constructionSite) {
            let repairNeeded = creep.findRepair();
            if (repairNeeded) {
                repairNeeded = Game.getObjectById(repairNeeded);
                if (creep.repair(repairNeeded) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(repairNeeded);
                }
            } else if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                creep.travelTo(creep.room.controller);
            }
        }
    }
}
pioneer = profiler.registerFN(pioneer, 'pioneerRemote');

function depositEnergy(creep) {
    if (!creep.memory.containerID) {
        creep.memory.containerID = creep.harvestDepositContainer();
    }
    if (creep.memory.containerID) {
        let container = Game.getObjectById(creep.memory.containerID);
        if (container) {
            if (container.hits < container.hitsMax * 0.25) {
                if (creep.repair(container) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(container);
                } else {
                    creep.say('Fixing');
                }
            } else if (container.store[RESOURCE_ENERGY] !== container.storeCapacity) {
                creep.transfer(container, RESOURCE_ENERGY);
            }
        }
    } else {
        let buildSite = Game.getObjectById(creep.containerBuilding());
        if (buildSite) {
            creep.build(buildSite);
        } else {
            creep.harvesterContainerBuild();
        }
    }
}

function invaderCheck(creep) {
    let invader = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {filter: (c) => (c.getActiveBodyparts(ATTACK) >= 1 || c.getActiveBodyparts(RANGED_ATTACK) >= 1 || c.getActiveBodyparts(WORK) >= 1) && _.includes(RawMemory.segments[2], c.owner['username']) === false});
    if (invader) {
        let number = creep.room.find(FIND_HOSTILE_CREEPS, {filter: (c) => _.includes(RawMemory.segments[2], c.owner['username']) === false});
        creep.room.memory.responseNeeded = true;
        if (!creep.memory.invaderCooldown) {
            creep.memory.invaderCooldown = 1;
        }
        creep.room.memory.tickDetected = Game.time;
        if (!creep.room.memory.numberOfHostiles || creep.room.memory.numberOfHostiles < number.length) {
            creep.room.memory.numberOfHostiles = number.length;
        }
        creep.memory.invaderDetected = true;
    } else if (creep.room.memory.tickDetected < Game.time - 150 || creep.room.memory.responseNeeded === false) {
        creep.memory.invaderDetected = undefined;
        creep.memory.invaderID = undefined;
        creep.room.memory.numberOfHostiles = undefined;
        creep.room.memory.responseNeeded = false;
    }
}
invaderCheck = profiler.registerFN(invaderCheck, 'invaderCheckRemote');