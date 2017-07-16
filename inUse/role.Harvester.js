/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

/**
 * @return {null}
 */
function role(creep) {
    let source;
//INITIAL CHECKS
    if (creep.borderCheck()) return null;
    if (creep.wrongRoom()) return null;
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
    } else if (creep.memory.assignedSource) {
        source = Game.getObjectById(creep.memory.assignedSource);
        if (source.energy === 0) {
            creep.idleFor(source.ticksToRegeneration + 1)
        } else if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            creep.shibMove(source);
        }
    } else {
        creep.findSource();
        creep.memory.assignedSource = creep.memory.source;
    }
}
module.exports.role = profiler.registerFN(role, 'harvesterRole');

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