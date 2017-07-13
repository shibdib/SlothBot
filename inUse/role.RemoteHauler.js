/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    //Invader detection
    if (!_.startsWith(creep.name, 'SK')) {
        invaderCheck(creep);
        if (creep.memory.invaderDetected === true || creep.memory.invaderCooldown < 50) {
            creep.memory.invaderCooldown++;
            creep.shibMove(Game.getObjectById(creep.memory.assignedSpawn));
            creep.memory.destinationReached = false;
            return null;
        } else if (creep.memory.invaderCooldown > 50) {
            creep.memory.invaderCooldown = undefined;
        }
    } else {
        let invader = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {filter: (c) => (c.getActiveBodyparts(ATTACK) >= 1 || c.getActiveBodyparts(RANGED_ATTACK) >= 1 || c.getActiveBodyparts(WORK) >= 1) && _.includes(RawMemory.segments[2], c.owner['username']) === false});
        if (creep.pos.getRangeTo(invader) < 5) {
            creep.flee(invader);
            return null;
        }
    }
    if (creep.pos.roomName !== creep.memory.destination) {
        creep.memory.destinationReached = false;
    }
    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.hauling = true;
        creep.memory.containerID = undefined;
    }

    if (creep.memory.destinationReached === true || creep.memory.hauling === true) {
        if (creep.memory.hauling === false) {
            if (!creep.memory.containerID) {
                let container = creep.room.find(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && _.sum(s.store) > s.storeCapacity / 2});
                if (container.length > 0) {
                    creep.memory.containerID = container[0].id;
                    for (const resourceType in container.store) {
                        if (creep.withdraw(container, resourceType) === ERR_NOT_IN_RANGE) {
                            creep.shibMove(container);
                        }
                    }
                } else {
                    let energy = creep.room.find(FIND_DROPPED_RESOURCES, {filter: (s) => s.amount > 500});
                    if (energy.length > 0) {
                        for (const resourceType in energy.store) {
                            if (creep.pickup(energy, resourceType) === ERR_NOT_IN_RANGE) {
                                creep.shibMove(energy);
                            }
                        }
                    }
                }
            } else {
                if (!Game.getObjectById(creep.memory.containerID) || _.sum(Game.getObjectById(creep.memory.containerID).store) === 0) {
                    creep.memory.containerID = undefined;
                }
                if (creep.withdraw(Game.getObjectById(creep.memory.containerID), RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(Game.getObjectById(creep.memory.containerID), {offRoad: true});
                }
            }
        } else {
            if (creep.pos.getRangeTo(Game.getObjectById(creep.memory.assignedSpawn)) <= 50 && creep.pos.roomName !== creep.memory.destination) {
                creep.memory.destinationReached = false;
                let terminal = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'terminal'), 'id');
                let storage = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'storage'), 'id');
                if (storage.length > 0) {
                    creep.memory.storageDestination = storage[0];
                } else if (terminal.length > 0) {
                    creep.memory.storageDestination = terminal[0];
                }
                if (creep.memory.storageDestination) {
                    let storageItem = Game.getObjectById(creep.memory.storageDestination);
                    for (const resourceType in creep.carry) {
                        if (creep.transfer(storageItem, resourceType) === ERR_NOT_IN_RANGE) {
                            creep.shibMove(storageItem);
                        }
                    }
                }
                creep.findStorage();
            } else {
                creep.shibMove(Game.getObjectById(creep.memory.assignedSpawn), {
                    range: 5
                });
            }
        }
    } else if (!creep.memory.destinationReached) {
        creep.memory.containerID = undefined;
        if (creep.pos.getRangeTo(new RoomPosition(25, 25, creep.memory.destination)) <= 10) {
            creep.memory.destinationReached = true;
        }
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 7, offRoad: true});
    }
}

module.exports.role = profiler.registerFN(role, 'remoteHaulerRole');

function invaderCheck(creep) {
    let invader = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {filter: (c) => (c.getActiveBodyparts(ATTACK) >= 1 || c.getActiveBodyparts(RANGED_ATTACK) >= 1 || c.getActiveBodyparts(WORK) >= 1) && _.includes(RawMemory.segments[2], c.owner['username']) === false});
    if (invader) {
        creep.room.memory.responseNeeded = true;
        if (!creep.memory.invaderCooldown) {
            creep.memory.invaderCooldown = 1;
        }
        creep.room.memory.tickDetected = Game.time;
        creep.memory.invaderDetected = true;
    } else if (creep.room.memory.tickDetected < Game.time - 150 || creep.room.memory.responseNeeded === false) {
        creep.memory.invaderDetected = undefined;
        creep.memory.invaderID = undefined;
        creep.room.memory.numberOfHostiles = undefined;
        creep.room.memory.responseNeeded = false;
    }
}
