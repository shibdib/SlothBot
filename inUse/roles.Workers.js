let profiler = require('screeps-profiler');
let cache = require('module.cache');
let _ = require('lodash');


function Manager(creep) {
    if (creep.memory.role === "worker") {
        worker(creep);
    } else if (creep.memory.role === "upgrader") {
        upgrader(creep);
    } else if (creep.memory.role === "stationaryHarvester") {
        harvester(creep);
    } else if (creep.memory.role === "mineralHarvester") {
        mineralHarvester(creep);
    } else if (creep.memory.role === "SKworker") {
        SKworker(creep);
    }
}
module.exports.Manager = profiler.registerFN(Manager, 'managerWorkers');

/**
 * @return {null}
 */
function worker(creep) {
    //INITIAL CHECKS
    creep.borderCheck();
    creep.wrongRoom();
    if (creep.carry.energy === 0) {
        creep.memory.working = null;
    }
    if (creep.carry.energy >= creep.carryCapacity * 0.75) {
        creep.memory.working = true;
    }
    if (creep.memory.working === true) {
        creep.findConstruction();
        if (creep.memory.task === 'build' && creep.room.memory.responseNeeded !== true) {
            let construction = Game.getObjectById(creep.memory.constructionSite);
            if (creep.build(construction) === ERR_NOT_IN_RANGE) {
                creep.shibMove(construction);
            }
        } else {
            creep.findRepair(creep.room.controller.level);
            if (creep.memory.task === 'repair' && creep.memory.constructionSite) {
                let repairNeeded = Game.getObjectById(creep.memory.constructionSite);
                if (creep.repair(repairNeeded) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(repairNeeded);
                }
            } else if (creep.upgradeController(Game.rooms[creep.memory.assignedRoom].controller) === ERR_NOT_IN_RANGE) {
                creep.shibMove(Game.rooms[creep.memory.assignedRoom].controller);
            }
        }
    }
    else {
        if (creep.memory.energyDestination) {
            creep.withdrawEnergy();
        } else {
            let storage = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE && s.store[RESOURCE_ENERGY] > 0});
            if (storage) {
                if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(storage);
                }
            } else {
                    creep.findEnergy();
            }
        }
    }
}
worker = profiler.registerFN(worker, 'workerWorkers');

/**
 * @return {null}
 */
function harvester(creep) {
    let source;
//INITIAL CHECKS
    creep.borderCheck();
    creep.wrongRoom();
    if (creep.carry.ticksToLive <= 5) {
        depositEnergy(creep);
        creep.suicide();
        return null;
    }
    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy === creep.carryCapacity || creep.memory.hauling === true) {
        creep.memory.hauling = true;
        depositEnergy(creep);
    } else {
        if (creep.memory.assignedSource) {
            source = Game.getObjectById(creep.memory.assignedSource);
            if (source.energy === 0) {
                creep.idleFor(source.ticksToRegeneration + 1)
            } else if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.shibMove(source);
            }
        } else {
            creep.findSource();
        }
    }
}
harvester = profiler.registerFN(harvester, 'harvesterWorkers');

/**
 * @return {null}
 */
function mineralHarvester(creep) {
    creep.borderCheck();
    creep.wrongRoom();
    if (_.sum(creep.carry) === 0) {
        creep.memory.hauling = false;
    } else if (_.sum(creep.carry) === creep.carryCapacity || creep.memory.hauling === true) {
        creep.memory.hauling = true;
        depositMineral(creep);
    }
    if (creep.memory.hauling !== true) {
        if (creep.memory.extractor) {
            if (Game.getObjectById(creep.memory.extractor).cooldown) {
                creep.idleFor(Game.getObjectById(creep.memory.extractor).cooldown + 1)
            } else {
                let mineral;
                if (creep.memory.assignedMineral) {
                    mineral = Game.getObjectById(creep.memory.assignedMineral);
                }
                let response = creep.harvest(mineral);
                if (response === ERR_NOT_IN_RANGE) {
                    creep.shibMove(mineral);
                } else if (response === ERR_NOT_FOUND) {
                    mineral.pos.createConstructionSite(STRUCTURE_EXTRACTOR);
                }
            }
        } else {
            creep.memory.extractor = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_EXTRACTOR}).id;
        }
    }
}
mineralHarvester = profiler.registerFN(mineralHarvester, 'mineralHarvesterWorkers');

/**
 * @return {null}
 */
function upgrader(creep) {
    //INITIAL CHECKS
    creep.borderCheck();
    creep.wrongRoom();
    if (creep.carry.energy === 0) {
        creep.memory.working = null;
    } else if (creep.carry.energy >= creep.carryCapacity * 0.75) {
        creep.memory.working = true;
    }
    if (creep.memory.working === true) {
        if (creep.upgradeController(Game.rooms[creep.memory.assignedRoom].controller) === ERR_NOT_IN_RANGE) {
            creep.shibMove(Game.rooms[creep.memory.assignedRoom].controller);
        }
    } else {
        if (creep.memory.energyDestination) {
            creep.withdrawEnergy();
        } else {
            let link = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_LINK && s.energy > 0});
            let terminal = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TERMINAL && s.store[RESOURCE_ENERGY] > 0});
            if (terminal && creep.pos.getRangeTo(terminal) < 5) {
                if (creep.withdraw(terminal, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(terminal);
                }
            } else
            if (link && creep.pos.getRangeTo(link) < 5) {
                if (creep.withdraw(link, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(link);
                }
            } else {
                creep.findEnergy();
            }
        }
    }
}
upgrader = profiler.registerFN(upgrader, 'upgraderWorkers');

/**
 * @return {null}
 */
function SKworker(creep) {
    let source;
    let hostiles = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    //Initial move
    if (creep.carry.energy === 0) {
        creep.memory.harvesting = true;
    }
    if (!creep.memory.destinationReached) {
        creep.shibMove(Game.flags[creep.memory.destination], {range: 20});
        if (creep.pos.roomName === Game.flags[creep.memory.destination].pos.roomName) {
            creep.memory.destinationReached = true;
        }
        return null;
    } else if (hostiles && creep.pos.getRangeTo(hostiles) <= 5) {
        switch (creep.attack(hostiles)) {
            case ERR_NOT_IN_RANGE:
                creep.heal(creep);
                creep.rangedAttack(hostiles);
                creep.shibMove(hostiles, {movingTarget: true});
                break;
            case ERR_NO_BODYPART:
                creep.heal(creep);
                break;
            default:
                creep.rangedAttack(hostiles);
        }
    } else if (creep.carry.energy === creep.carryCapacity || creep.memory.harvesting === false) {
        if (creep.hits < creep.hitsMax) {
            creep.heal(creep);
        }
        creep.memory.harvesting = false;
        SKdeposit(creep);
    } else {
        if (creep.hits < creep.hitsMax) {
            creep.heal(creep);
        }
        if (creep.memory.source) {
            source = Game.getObjectById(creep.memory.source);
            if (source.energy === 0) {
                creep.idleFor(source.ticksToRegeneration + 1)
            } else if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.shibMove(source);
            }
        } else {
            if (!creep.findSource()) {
                creep.findMineral();
            }
        }
    }
}
SKworker = profiler.registerFN(SKworker, 'SKworkerWorkers');

function depositEnergy(creep) {
    if (!creep.memory.containerID || Game.getObjectById(creep.memory.containerID).pos.getRangeTo(creep) > 1) {
        creep.memory.containerID = creep.harvestDepositContainer();
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
                creep.memory.linkID = creep.harvestDepositLink();
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
        let buildSite = Game.getObjectById(creep.containerBuilding());
        if (buildSite) {
            creep.build(buildSite);
        } else {
            creep.harvesterContainerBuild();
        }
    }
}
depositEnergy = profiler.registerFN(depositEnergy, 'depositEnergyWorkers');

function depositMineral(creep) {
    if (!creep.memory.containerID) {
        creep.memory.containerID = mineralContainer(creep);
    }
    if (creep.memory.containerID) {
        let container = Game.getObjectById(creep.memory.containerID);
        if (container) {
            if (_.sum(container.store) !== container.storeCapacity) {
                for (const resourceType in creep.carry) {
                    if (creep.transfer(container, resourceType) === ERR_NOT_IN_RANGE) {
                        creep.shibMove(container);
                    }
                }
            }
        }
    } else {
        let buildSite = Game.getObjectById(creep.containerBuilding());
        if (!buildSite && creep.memory.containerBuilding !== true) {
            creep.harvesterContainerBuild();
        } else {
            creep.memory.containerBuilding = true;
        }
    }
}
depositMineral = profiler.registerFN(depositMineral, 'depositMineralWorkers');

function mineralContainer(creep) {
    let container = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] === 0});
    if (container) {
        if (container.pos.getRangeTo(Game.getObjectById(creep.memory.assignedMineral)) < 3) {
            if (creep.pos.getRangeTo(container) <= 1) {
                return container.id;
            } else {
                creep.shibMove(container);
                return container.id;
            }
        }
    }
}
mineralContainer = profiler.registerFN(mineralContainer, 'mineralContainerWorkers');

function SKdeposit(creep) {
    if (!creep.memory.containerID) {
        creep.memory.containerID = creep.harvestDepositContainer();
    }
    if (creep.memory.containerID) {
        let container = Game.getObjectById(creep.memory.containerID);
        if (container) {
            if (container.hits < container.hitsMax * 0.25 && creep.carry[RESOURCE_ENERGY] > 0) {
                creep.repair(container);
                creep.say('Fixing');
            } else if (creep.pos.getRangeTo(container) > 0) {
                creep.shibMove(container, {range: 0});
            } else
            if (_.sum(container.store) !== container.storeCapacity) {
                for (const resourceType in creep.carry) {
                    if (creep.transfer(container, resourceType) === ERR_NOT_IN_RANGE) {
                        creep.shibMove(container, {range: 0});
                    }
                }
            }
        }
    } else {
        let buildSite = Game.getObjectById(creep.containerBuilding());
        if (!buildSite && creep.memory.containerBuilding !== true) {
            creep.harvesterContainerBuild();
        } else {
            creep.build(buildSite);
        }
    }
}
depositMineral = profiler.registerFN(depositMineral, 'depositMineralWorkers');

function dontSitOnRoads(creep) {
    if (creep.room.lookForAt(LOOK_STRUCTURES, creep.pos).length && creep.room.lookForAt(LOOK_STRUCTURES, creep.pos).structureType === STRUCTURE_ROAD) {
        return true;
    }
}
dontSitOnRoads = profiler.registerFN(dontSitOnRoads, 'dontSitOnRoadsWorkers');