let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');
let pathing = require('module.pathFinder');

/**
 * @return {null}
 */
module.exports.Hauler = function (creep) {
    //INITIAL CHECKS
    borderChecks.borderCheck(creep);

    //RENEWAL
    creepTools.renewal(creep);

    if (!Game.getObjectById(creep.memory.assignedContainer)) {
        creep.memory.recycle = true;
        creepTools.recycle(creep);
        return null;
    }
    if (creepTools.renewal(creep) === true) {
        return null;
    }
    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy > creep.carryCapacity / 2) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        const container = Game.getObjectById(creep.memory.assignedContainer);
        if (container && container.store[RESOURCE_ENERGY] > 50) {
            if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                pathing.Move(creep, container);
            }
        } else {
            pathing.Move(creep, Game.flags.haulers);
        }
    }

    //Haul to spawn/extension
    if (creep.memory.hauling === true) {
        creepTools.findStorage(creep);
    }
};

/**
 * @return {null}
 */
module.exports.DumpTruck = function (creep) {
    //INITIAL CHECKS
    borderChecks.borderCheck(creep);

    //RENEWAL
    creepTools.renewal(creep);

    //SET HAULING STATE
    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    } else if (creep.carry.energy > 0) {
        creep.memory.hauling = true;
    }

    //GET ENERGY
    if (creep.memory.hauling === false) {
        creepTools.findEnergy(creep);
    }

//Haul to builder/upgrader
    if (creep.memory.hauling === true) {
        creepTools.findBuilder(creep);
        let target = Game.getObjectById(creep.memory.builderID);
        if (target) {
            target.memory.incomingEnergy = creep.id;
            if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                pathing.Move(creep, target);
            }
        } else {
            let newTarget = creepTools.findNewBuilder(creep);
            newTarget = Game.getObjectById(newTarget);
            if (newTarget) {
                newTarget.memory.incomingEnergy = creep.id;
                newTarget.memory.incomingCounter = 0;
                if (creep.transfer(newTarget, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    pathing.Move(creep, newTarget);
                }
            } else {
                pathing.Move(creep, Game.flags.haulers);
            }
        }
    }
};

/**
 * @return {null}
 */
module.exports.BasicHauler = function (creep) {
    //INITIAL CHECKS
    borderChecks.borderCheck(creep);

    //RENEWAL
    creepTools.renewal(creep);

    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy > creep.carryCapacity / 2) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        const energy = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {filter: {resourceType: RESOURCE_ENERGY}});
        if (energy) {
            if (creep.pickup(energy) === ERR_NOT_IN_RANGE) {
                pathing.Move(creep, energy);
            }
        } else {
            creepTools.findEnergy(creep, true);
        }
    } else {
        creepTools.findStorage(creep);
    }
};