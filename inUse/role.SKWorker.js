/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
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
module.exports.role = profiler.registerFN(role, 'SKWorkerRole');

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
            } else if (_.sum(container.store) !== container.storeCapacity) {
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
