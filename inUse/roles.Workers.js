let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');
let pathing = require('module.pathFinder');

/**
 * @return {null}
 */
module.exports.Worker = function (creep) {
    //INITIAL CHECKS
    borderChecks.borderCheck(creep);

    //RENEWAL
    if (creepTools.renewal(creep) === true) {
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
};

/**
 * @return {null}
 */
module.exports.Harvester = function (creep) {
    //INITIAL CHECKS
    borderChecks.borderCheck(creep);

    //RENEWAL
    if (creepTools.renewal(creep) === true) {
        creep.drop(RESOURCE_ENERGY);
        return null;
    }

    if (creep.carry.energy === creep.carryCapacity) {
        let containerID = creepTools.harvestDeposit(creep);
        if (containerID) {
            let container = Game.getObjectById(containerID);
            if (container) {
                if (container.hits < 25000) {
                    creep.repair(container);
                    creep.say('Fixing');
                } else {
                    creep.transfer(container, RESOURCE_ENERGY);
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
    if (creep.carry.energy < creep.carryCapacity) {
        if (creep.memory.assignedSource) {
            source = Game.getObjectById(creep.memory.assignedSource);
        } else if (!source) {
            var source = creepTools.findSource(creep);
        }
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            pathing.Move(creep, source, true);
        }
        if (source.energy === 0 && source.ticksToRegeneration > 50) {
            creep.memory.renew = true;
        }
    }
};

module.exports.wallRepairer = function (creep) {
    //INITIAL CHECKS
    borderChecks.borderCheck(creep);

    //RENEWAL
    if (creepTools.renewal(creep) === true) {
        return null;
    }

    if (creep.carry.energy === 0) {
        creep.memory.working = null;
    }
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.working = true;
    }

    if (creep.memory.working) {
        let ramp = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 2500});
        if (ramp) {
            if (creep.repair(ramp) === ERR_NOT_IN_RANGE) {
                pathing.Move(creep, ramp);
            }
        }
        let build = Game.getObjectById(creepTools.wallBuilding(creep));
        let repairNeeded = Game.getObjectById(creepTools.wallRepair(creep));
        if (build) {
            if (creep.build(build) === ERR_INVALID_TARGET) {
                pathing.Move(creep, build);
            } else {
                if (creep.build(build) === ERR_NOT_IN_RANGE) {
                    pathing.Move(creep, build);
                }
            }
        } else if (repairNeeded) {
            if (creep.repair(repairNeeded) === ERR_NOT_IN_RANGE) {
                pathing.Move(creep, repairNeeded);
            }
        } else {
            if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                pathing.Move(creep, creep.room.controller);
            }
        }
    }
    else {
        if (creep.memory.energyDestination) {
            creepTools.withdrawEnergy(creep);
        } else {
            creepTools.findEnergy(creep, false);
        }
    }

};

/**
 * @return {null}
 */
module.exports.Upgrader = function (creep) {
    //INITIAL CHECKS
    borderChecks.borderCheck(creep);

    //RENEWAL
    if (creepTools.renewal(creep) === true) {
        return null;
    }

    if (creep.carry.energy === 0) {
        creep.memory.working = null;
    }
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.working = true;
    }

    if (creep.memory.working === true){
        if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
            pathing.Move(creep, creep.room.controller);
        }
    } else {
        if (creep.memory.energyDestination) {
            creepTools.withdrawEnergy(creep);
        } else {
            creepTools.findEnergy(creep, false);
        }
    }
};