let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');
let pathing = require('module.pathFinder');
let _ = require('lodash');


module.exports.Manager = function (creep) {
    if (creep.memory.role === "worker") {
        worker(creep);
    } else if (creep.memory.role === "upgrader") {
        upgrader(creep);
    } else if (creep.memory.role === "stationaryHarvester") {
        harvester(creep);
    } else if (creep.memory.role === "mineralHarvester") {
        mineralHarvester(creep);
    }
};

/**
 * @return {null}
 */
function worker(creep) {
    //INITIAL CHECKS
    borderChecks.borderCheck(creep);
    if (creepTools.noHarvesterProtocol(creep)) {
        creepTools.findStorage(creep);
        return null;
    }

    if (creep.carry.energy === 0) {
        creep.memory.working = null;
    }
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.harvesting = false;
        creep.memory.working = true;
    }

    if (creep.memory.working === true) {
        let repairNeeded = creepTools.findRepair(creep);
        let construction = creepTools.findConstruction(creep);
        if (construction) {
            construction = Game.getObjectById(construction);
            if (creep.build(construction) === ERR_INVALID_TARGET) {
                pathing.Move(creep, Game.flags.haulers);
            } else {
                if (creep.build(construction) === ERR_NOT_IN_RANGE) {
                    pathing.Move(creep, construction);
                }
            }
        } else if (repairNeeded) {
            repairNeeded = Game.getObjectById(repairNeeded);
            if (creep.repair(repairNeeded) === ERR_NOT_IN_RANGE) {
                pathing.Move(creep, repairNeeded);
            }
        } else if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
            pathing.Move(creep, creep.room.controller);
        }
    }
    else {
        if (creep.memory.energyDestination) {
            creepTools.withdrawEnergy(creep);
        } else {
            creepTools.findEnergy(creep, false);
        }
    }
}
/**
 * @return {null}
 */
function harvester(creep) {
    //INITIAL CHECKS
    borderChecks.borderCheck(creep);
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
            pathing.Move(creep, source, true);
        }
    }
}
/**
 * @return {null}
 */
function mineralHarvester(creep) {
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
            pathing.Move(creep, mineral, true);
        }
        if (response === ERR_NOT_FOUND) {
            mineral.pos.createConstructionSite(STRUCTURE_EXTRACTOR);
        }
    }
}
/**
 * @return {null}
 */
function upgrader(creep) {
    //INITIAL CHECKS
    borderChecks.borderCheck(creep);
    if (creepTools.noHarvesterProtocol(creep)) {
        creepTools.findStorage(creep);
        return null;
    }

    if (creep.carry.energy === 0) {
        creep.memory.working = null;
    }
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.working = true;
    }

    if (creep.memory.working === true) {
        if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
            pathing.Move(creep, creep.room.controller);
        }
    } else {
        if (creep.memory.energyDestination) {
            creepTools.withdrawEnergy(creep);
        } else {
            let storage = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE && s.store[RESOURCE_ENERGY] > 0});
            if (storage) {
                if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    pathing.Move(creep, storage, false, 1);
                }
            } else {
                creepTools.findEnergy(creep, false);
            }
        }
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

function depositMineral(creep) {
    if (!creep.memory.terminalID) {
        let terminal = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TERMINAL});
        creep.memory.terminalID = terminal.id;
    }
    if (!creep.memory.containerID) {
        creep.memory.containerID = creepTools.harvestDepositContainer(creep);
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
        if (!buildSite) {
            creepTools.harvesterContainerBuild(creep);
        }
    }
    if (creep.memory.terminalID) {
        let terminal = Game.getObjectById(creep.memory.terminalID);
        if (terminal) {
            if (_.sum(terminal.store) !== terminal.storeCapacity) {
                for (const resourceType in creep.carry) {
                    if (creep.transfer(terminal, resourceType) === ERR_NOT_IN_RANGE) {
                        pathing.Move(creep, terminal, false, 1);
                    }
                }
            }
        }
    }
}