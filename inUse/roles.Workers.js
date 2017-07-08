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
    creep.borderCheck();
    creep.wrongRoom();
    if (creep.carry.energy === creep.carryCapacity / 2) {
        creep.memory.deliveryRequested = true;
    }
    if (creep.carry.energy === 0) {
        creep.memory.working = null;
    }
    if (creep.carry.energy >= creep.carryCapacity * 0.75) {
        creep.memory.deliveryIncoming = undefined;
        creep.memory.deliveryRequested = undefined;
        creep.memory.deliveryWait = undefined;
        creep.memory.working = true;
    }
    if (creep.memory.working === true) {
        creep.findConstruction();
        if (creep.memory.task === 'build' && creep.room.memory.responseNeeded !== true) {
            let construction = Game.getObjectById(creep.memory.constructionSite);
            if (creep.build(construction) === ERR_NOT_IN_RANGE) {
                creep.travelTo(construction, {ignoreCreeps: false});
            }
        } else {
            creep.findRepair(creep.room.controller.level);
            if (creep.memory.task === 'repair' && creep.memory.constructionSite) {
                let repairNeeded = Game.getObjectById(creep.memory.constructionSite);
                if (creep.repair(repairNeeded) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(repairNeeded, {ignoreCreeps: false});
                }
            } else if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                creep.travelTo(creep.room.controller, {ignoreCreeps: false});
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
                    creep.travelTo(storage, {ignoreCreeps: false});
                }
            } else {
                creep.memory.deliveryRequested = true;
                if (!creep.memory.deliveryWait) {
                    creep.memory.deliveryWait = 1;
                } else {
                    creep.memory.deliveryWait = creep.memory.deliveryWait + 1;
                }
                if (creep.memory.deliveryWait > 15 && !creep.memory.deliveryIncoming) {
                    creep.findEnergy();
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
        } else if (!source) {
            source = creep.findSource();
        }
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            creep.travelTo(source, {ignoreCreeps: false});
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
    } else if (creep.memory.hauling !== true) {
        let mineral;
        if (creep.memory.assignedMineral) {
            mineral = Game.getObjectById(creep.memory.assignedMineral);
        }
        let response = creep.harvest(mineral);
        if (response === ERR_NOT_IN_RANGE) {
            creep.travelTo(mineral, {ignoreCreeps: false});
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
    creep.borderCheck();
    creep.wrongRoom();
    if (creep.carry.energy === 0) {
        creep.memory.working = null;
    } else if (creep.carry.energy >= creep.carryCapacity * 0.75) {
        creep.memory.deliveryIncoming = undefined;
        creep.memory.deliveryRequested = undefined;
        creep.memory.deliveryWait = undefined;
        creep.memory.working = true;
    }

    if (creep.memory.working === true) {
        if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
            creep.travelTo(creep.room.controller, {ignoreCreeps: false});
        }
    } else {
        if (creep.memory.energyDestination) {
            creep.withdrawEnergy();
        } else {
            let link = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_LINK && s.energy > 0});
            let terminal = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TERMINAL && s.store[RESOURCE_ENERGY] > 0});
            if (terminal && creep.pos.getRangeTo(terminal) < 5) {
                if (creep.withdraw(terminal, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(terminal);
                }
            } else
            if (link && creep.pos.getRangeTo(link) < 5) {
                if (creep.withdraw(link, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(link);
                }
            } else {
                creep.memory.deliveryRequested = true;
                if (!creep.memory.deliveryWait) {
                    creep.memory.deliveryWait = 1;
                } else {
                    creep.memory.deliveryWait = creep.memory.deliveryWait + 1;
                }
                if (creep.memory.deliveryWait > 15) {
                    creep.say(ICONS.wait5);
                    creep.findEnergy();
                }
            }
        }
    }
}
upgrader = profiler.registerFN(upgrader, 'upgraderWorkers');

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
                    if (creep.transfer(container, resourceType) === ERR_NOT_IN_RANGE) {
                        creep.travelTo(container);
                    }
                }
                return;
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
    if (creep.memory.terminalID) {
        let terminal = Game.getObjectById(creep.memory.terminalID);
        if (terminal) {
            if (_.sum(terminal.store) !== terminal.storeCapacity) {
                for (const resourceType in creep.carry) {
                    if (creep.transfer(terminal, resourceType) === ERR_NOT_IN_RANGE) {
                        creep.travelTo(terminal);
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
        if (container.pos.getRangeTo(Game.getObjectById(creep.memory.assignedMineral)) < 3) {
            if (creep.pos.getRangeTo(container) <= 1) {
                return container.id;
            } else {
                creep.travelTo(container);
                return container.id;
            }
        }
    }
}
mineralContainer = profiler.registerFN(mineralContainer, 'mineralContainerWorkers');

function dontSitOnRoads(creep) {
    if (creep.room.lookForAt(LOOK_STRUCTURES, creep.pos).length && creep.room.lookForAt(LOOK_STRUCTURES, creep.pos).structureType === STRUCTURE_ROAD) {
        return true;
    }
}
dontSitOnRoads = profiler.registerFN(dontSitOnRoads, 'dontSitOnRoadsWorkers');