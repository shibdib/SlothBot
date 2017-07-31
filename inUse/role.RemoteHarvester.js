/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    let source;
    if (Game.time % 50 === 0) {
        creep.cacheRoomIntel();
    }
    //Invader detection
    creep.invaderCheck();
    if (!_.startsWith(creep.name, 'SK') && !creep.room.controller) {
        if (creep.memory.invaderDetected === true || creep.memory.invaderCooldown < 50) {
            creep.memory.invaderCooldown++;
            creep.shibMove(new RoomPosition(25, 25, creep.memory.assignedRoom));
            creep.memory.destinationReached = false;
            return null;
        } else if (creep.memory.invaderCooldown > 50) {
            creep.memory.invaderCooldown = undefined;
        }
    }
    
    //Mark room as no go if reserved or owned by someone else
    if (creep.room.controller && (creep.room.controller.reservation.username !== 'Shibdib' || creep.room.owner)) {
        creep.room.memory.noRemote = true;
        creep.suicide();
    }

    //Initial move
    if (creep.carry.energy === 0) {
        creep.memory.harvesting = true;
    }
    if (!creep.memory.destinationReached) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination));
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
            if (source) {
                if (source.energy === 0) {
                    creep.idleFor(source.ticksToRegeneration + 1)
                } else if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(source);
                }
            } else {
                creep.memory.source = undefined;
            }
        } else {
            creep.findSource();
        }
    }
}

module.exports.role = profiler.registerFN(role, 'remoteHarvesterRole');

function depositEnergy(creep) {
    if (!creep.memory.containerID) {
        creep.memory.containerID = creep.harvestDepositContainer();
    }
    if (creep.memory.containerID) {
        let container = Game.getObjectById(creep.memory.containerID);
        if (container) {
            if (container.hits < container.hitsMax * 0.25) {
                if (creep.repair(container) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(container);
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