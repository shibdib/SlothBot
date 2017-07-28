/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    if (creep.renewalCheck(4)) return creep.shibMove(Game.rooms[creep.memory.assignedRoom].find(FIND_MY_SPAWNS)[0]);
    //Invader detection
    if (!_.startsWith(creep.name, 'SK') && !creep.room.controller) {
        invaderCheck(creep);
        if (creep.memory.invaderDetected === true || creep.memory.invaderCooldown < 50) {
            creep.memory.invaderCooldown++;
            creep.shibMove(new RoomPosition(25, 25, creep.memory.assignedRoom), {forceRepath: true});
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
                let container = creep.room.find(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && _.sum(s.store) >= s.storeCapacity / 2});
                if (container.length > 0) {
                    creep.memory.containerID = container[0].id;
                    for (const resourceType in container.store) {
                        if (creep.withdraw(container, resourceType) === ERR_NOT_IN_RANGE) {
                            creep.shibMove(container);
                        }
                    }
                } else {
                    let energy = creep.room.find(FIND_DROPPED_RESOURCES, {filter: (s) => s.amount > 100});
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
            if (creep.pos.roomName === creep.memory.assignedRoom) {
                creep.memory.destinationReached = false;
                let dropOffLink = Game.getObjectById(creep.memory.dropOffLink);
                if (dropOffLink && creep.carry[RESOURCE_ENERGY] > 0) {
                    if (creep.transfer(dropOffLink, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        creep.shibMove(dropOffLink);
                    }
                } else {
                    let link = creep.pos.findInRange(FIND_STRUCTURES, 6, {filter: (s) => s.structureType === STRUCTURE_LINK});
                    if (link.length > 0 && link[0].id !== creep.room.memory.storageLink) {
                        creep.memory.dropOffLink = link[0].id;
                    }
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
                            switch (creep.transfer(storageItem, resourceType)) {
                                case OK:
                                    delete creep.memory.storageDestination;
                                    break;
                                case ERR_NOT_IN_RANGE:
                                    creep.shibMove(storageItem);
                                    break;
                                case ERR_FULL:
                                    delete creep.memory.storageDestination;
                                    creep.findStorage();
                                    break;
                            }
                        }
                    }
                    creep.findStorage();
                }
            } else {
                creep.shibMove(new RoomPosition(25, 25, creep.memory.assignedRoom), {
                    range: 15
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
        if (!creep.memory.invaderCooldown) {
            creep.memory.invaderCooldown = 1;
        }
        let number = creep.room.find(FIND_HOSTILE_CREEPS, {filter: (c) => _.includes(RawMemory.segments[2], c.owner['username']) === false});
        creep.room.memory.responseNeeded = true;
        creep.room.memory.tickDetected = Game.time;
        if (!creep.room.memory.numberOfHostiles || creep.room.memory.numberOfHostiles < number.length) {
            creep.room.memory.numberOfHostiles = number.length;
        }
    } else if (creep.room.memory.tickDetected < Game.time - 150 || creep.room.memory.responseNeeded === false) {
        creep.memory.invaderDetected = undefined;
        creep.memory.invaderID = undefined;
        creep.room.memory.numberOfHostiles = undefined;
        creep.room.memory.responseNeeded = false;
    }
}
