/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    let source;
    if (creep.hits < creep.hitsMax) {
        creep.heal(creep);
    }
    let SKRanged = _.filter(Game.creeps, (sk) => sk.memory.destination === creep.memory.destination && sk.memory.role === 'SKranged');
    if (SKRanged.length === 0) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.assignedRoom), {range: 20});
        return;
    }
    let hostiles = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    //Initial move
    if (creep.carry.energy === 0) {
        creep.memory.harvesting = true;
    }
    if (!creep.memory.destinationReached) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 20});
        if (creep.pos.roomName === creep.memory.destination) {
            creep.memory.destinationReached = true;
        }
        return null;
    } else if (hostiles && creep.pos.getRangeTo(hostiles) <= 5) {
        creep.flee(hostiles);
    } else if (creep.carry.energy === creep.carryCapacity || creep.memory.harvesting === false) {
        if (creep.hits < creep.hitsMax) {
            creep.heal(creep);
        }
        creep.memory.harvesting = false;
        SKdeposit(creep);
    } else {
        if (creep.memory.source) {
            source = Game.getObjectById(creep.memory.source);
            if (source.energy === 0) {
                creep.idleFor(source.ticksToRegeneration + 1)
            } else {
                switch (creep.harvest(source)) {
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(source);
                        break;
                    case ERR_NO_BODYPART:
                        creep.shibMove(source);
                        creep.heal(creep);
                        break;
                }
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
            creep.memory.containerBuilding = undefined;
            if (container.hits < container.hitsMax * 0.75 && creep.carry[RESOURCE_ENERGY] > 0) {
                switch (creep.repair(container)) {
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(container);
                        break;
                }
                creep.say('Fixing');
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
            creep.memory.containerBuilding = true;
        }
    }
}
