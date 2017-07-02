let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');
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
    }
}
module.exports.Manager = profiler.registerFN(Manager, 'managerWorkers');

/**
 * @return {null}
 */
function worker(creep) {
    //INITIAL CHECKS
    invaderCheck(creep);
    borderChecks.borderCheck(creep);
    borderChecks.wrongRoom(creep);

    if (creep.carry.energy === 0) {
        creep.memory.working = null;
    }
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.deliveryIncoming = undefined;
        creep.memory.deliveryRequested = undefined;
        creep.memory.deliveryWait = undefined;
        creep.memory.working = true;
    }

    if (creep.memory.working === true) {
        let repairNeeded = creepTools.findRepair(creep, creep.room.controller.level);
        let construction = creepTools.findConstruction(creep);
        if (construction && creep.room.memory.responseNeeded !== true) {
            construction = Game.getObjectById(construction);
            if (creep.build(construction) === ERR_INVALID_TARGET) {
                creep.travelTo(Game.flags.haulers);
            } else {
                if (creep.build(construction) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(construction);
                }
            }
        } else if (repairNeeded) {
            repairNeeded = Game.getObjectById(repairNeeded);
            if (creep.repair(repairNeeded) === ERR_NOT_IN_RANGE) {
                creep.travelTo(repairNeeded);
            }
        } else if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
            creep.travelTo(creep.room.controller);
        }
    }
    else {
        if (creep.memory.energyDestination) {
            creepTools.withdrawEnergy(creep);
        } else {
            let storage = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE && s.store[RESOURCE_ENERGY] > 0});
            let terminal = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TERMINAL && s.store[RESOURCE_ENERGY] > 0});
            if (storage) {
                if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(storage);
                }
            } else if (terminal) {
                if (creep.withdraw(terminal, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(terminal);
                }
            } else {
                creep.memory.deliveryRequested = true;
                if (!creep.memory.deliveryWait) {
                    creep.memory.deliveryWait = 1;
                } else {
                    creep.memory.deliveryWait = creep.memory.deliveryWait + 1;
                }
                if (creep.memory.deliveryWait > 15) {
                    creepTools.findEnergy(creep);
                }
            }
        }
    }
}
worker = profiler.registerFN(worker, 'workerWorkers');

/**
 * @return {null}
 */
function harvester(creep) {
    //INITIAL CHECKS
    invaderCheck(creep);
    borderChecks.borderCheck(creep);
    borderChecks.wrongRoom(creep);
    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }

    if (creep.carry.energy === creep.carryCapacity || creep.memory.hauling === true) {
        creep.memory.hauling = true;
        depositEnergy(creep);
    } else if (creep.memory.hauling !== true) {
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
harvester = profiler.registerFN(harvester, 'harvesterWorkers');

/**
 * @return {null}
 */
function mineralHarvester(creep) {
    invaderCheck(creep);
    borderChecks.borderCheck(creep);
    borderChecks.wrongRoom(creep);
    if (_.sum(creep.carry) === 0) {
        creep.memory.hauling = false;
    }

    if (_.sum(creep.carry) === creep.carryCapacity || creep.memory.hauling === true) {
        creep.memory.hauling = true;
        depositMineral(creep);
    } else if (creep.memory.hauling !== true) {
        if (creep.memory.assignedMineral) {
            var mineral = Game.getObjectById(creep.memory.assignedMineral);
        }
        let response = creep.harvest(mineral);
        if (response === ERR_NOT_IN_RANGE) {
            creep.travelTo(mineral);
        }
        if (response === ERR_NOT_FOUND) {
            mineral.pos.createConstructionSite(STRUCTURE_EXTRACTOR);
        }
    }
}
mineralHarvester = profiler.registerFN(mineralHarvester, 'mineralHarvesterWorkers');

/**
 * @return {null}
 */
function upgrader(creep) {
    //INITIAL CHECKS
    invaderCheck(creep);
    borderChecks.borderCheck(creep);
    borderChecks.wrongRoom(creep);

    if (creep.carry.energy === 0) {
        creep.memory.working = null;
    }
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.deliveryIncoming = undefined;
        creep.memory.deliveryRequested = undefined;
        creep.memory.deliveryWait = undefined;
        creep.memory.working = true;
    }

    if (creep.memory.working === true) {
        if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
            creep.travelTo(creep.room.controller);
        } else {
            if (dontSitOnRoads(creep) === true){creep.travelTo(creep.room.controller)}
        }
    } else {
        if (creep.memory.energyDestination) {
            creepTools.withdrawEnergy(creep);
        } else {
            let storage = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE && s.store[RESOURCE_ENERGY] > 0});
            let link = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_LINK && s.energy > 0});
            let terminal = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TERMINAL && s.store[RESOURCE_ENERGY] > 0});
            if (storage) {
                if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(storage);
                }
            } else if (link) {
                if (creep.withdraw(link, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(link);
                }
            } else if (terminal) {
                if (creep.withdraw(terminal, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(terminal);
                }
            } else {
                creep.memory.deliveryRequested = true;
                if (!creep.memory.deliveryWait) {
                    creep.memory.deliveryWait = 1;
                } else {
                    creep.memory.deliveryWait = creep.memory.deliveryWait + 1;
                }
                if (creep.memory.deliveryWait > 15) {
                    creepTools.findEnergy(creep);
                }
            }
        }
    }
}
upgrader = profiler.registerFN(upgrader, 'upgraderWorkers');

function depositEnergy(creep) {
    if (!creep.memory.containerID || Game.getObjectById(creep.memory.containerID).pos.getRangeTo(creep) > 1) {
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
depositEnergy = profiler.registerFN(depositEnergy, 'depositEnergyWorkers');

function depositMineral(creep) {
    if (!creep.memory.terminalID) {
        let terminal = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TERMINAL});
        if (terminal) {
            creep.memory.terminalID = terminal.id;
        }
    }
    if (!creep.memory.containerID) {
        creep.memory.containerID = mineralContainer(creep);
    }
    if (creep.memory.containerID) {
        let container = Game.getObjectById(creep.memory.containerID);
        if (container) {
            if (_.sum(container.store) !== container.storeCapacity) {
                for (const resourceType in creep.carry) {
                    creep.transfer(container, resourceType);
                }
                return;
            }
        }
    } else {
        let buildSite = Game.getObjectById(creepTools.containerBuilding(creep));
        if (!buildSite && creep.memory.containerBuilding !== true) {
            creepTools.harvesterContainerBuild(creep);
        } else {
            creep.memory.containerBuilding = true;
        }
    }
    if (creep.memory.terminalID) {
        let terminal = Game.getObjectById(creep.memory.terminalID);
        if (terminal) {
            if (_.sum(terminal.store) !== terminal.storeCapacity) {
                for (const resourceType in creep.carry) {
                    if (creep.transfer(terminal, resourceType) === ERR_NOT_IN_RANGE) {
                        creep.travelTo(terminal1);
                    }
                }
            }
        }
    }
}
depositMineral = profiler.registerFN(depositMineral, 'depositMineralWorkers');

function mineralContainer(creep) {
    let container = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] === 0});
    if (container) {
        if (container.pos.getRangeTo(Game.getObjectById(creep.memory.assignedMineral)) < 5) {
            if (creep.pos.getRangeTo(container) <= 1) {
                return container.id;
            } else if (creep.pos.getRangeTo(container) <= 3) {
                creep.travelTo(container);
                return container.id;
            }
        }
    }
}
mineralContainer = profiler.registerFN(mineralContainer, 'mineralContainerWorkers');

function invaderCheck(creep) {
    let invader = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (invader) {
        let number = creep.room.find(FIND_HOSTILE_CREEPS);
        creep.room.memory.responseNeeded = true;
        creep.room.memory.tickDetected = Game.time;
        if (!creep.room.memory.numberOfHostiles || creep.room.memory.numberOfHostiles < number.length) {
            creep.room.memory.numberOfHostiles = number.length;
        }
        creep.memory.invaderDetected = true;
    } else if (creep.room.memory.tickDetected < Game.time - 150) {
        creep.memory.invaderDetected = undefined;
        creep.memory.invaderID = undefined;
        creep.room.memory.numberOfHostiles = undefined;
        creep.room.memory.responseNeeded = false;
    }
}
invaderCheck = profiler.registerFN(invaderCheck, 'invaderCheckWorkers');

function dontSitOnRoads(creep) {
    if (creep.room.lookForAt(LOOK_STRUCTURES, creep.pos).length && creep.room.lookForAt(LOOK_STRUCTURES, creep.pos).structureType === STRUCTURE_ROAD) {
        return true;
    }
}
dontSitOnRoads = profiler.registerFN(dontSitOnRoads, 'dontSitOnRoadsWorkers');