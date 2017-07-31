/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    //if (creep.renewalCheck(4)) return creep.shibMove(Game.rooms[creep.memory.assignedRoom].find(FIND_MY_SPAWNS)[0]);
    //Invader detection
    if (!_.startsWith(creep.name, 'SK') && !creep.room.controller) {
        creep.invaderCheck();
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
                let container = creep.room.find(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && _.sum(s.store) >= 100});
                if (container.length > 0) {
                    creep.memory.containerID = container[0].id;
                    for (const resourceType in container.store) {
                        if (creep.withdraw(container, resourceType) === ERR_NOT_IN_RANGE) {
                            creep.shibMove(container);
                        }
                    }
                } else if (creep.room.find(FIND_DROPPED_RESOURCES, {filter: (s) => s.amount > 100}).length > 0) {
                    for (const resourceType in creep.room.find(FIND_DROPPED_RESOURCES, {filter: (s) => s.amount > 100})[0].store) {
                        if (creep.pickup(creep.room.find(FIND_DROPPED_RESOURCES, {filter: (s) => s.amount > 100})[0], resourceType) === ERR_NOT_IN_RANGE) {
                            creep.shibMove(creep.room.find(FIND_DROPPED_RESOURCES, {filter: (s) => s.amount > 100})[0]);
                        }
                    }
                } else {
                    creep.idleFor(2);
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
                } else if (dropOffLink && creep.carry[RESOURCE_ENERGY] > 0) {
                    switch (creep.transfer(dropOffLink, RESOURCE_ENERGY)) {
                        case OK:
                            delete creep.memory.storageDestination;
                            break;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(dropOffLink);
                            break;
                        case ERR_FULL:
                            delete creep.memory.storageDestination;
                            creep.findStorage();
                            break;
                    }
                } else {
                    let link = creep.pos.findInRange(FIND_STRUCTURES, 6, {filter: (s) => s.structureType === STRUCTURE_LINK});
                    if (link.length > 0 && link[0].id !== creep.room.memory.storageLink) {
                        creep.memory.dropOffLink = link[0].id;
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
        if (creep.pos.roomName === creep.memory.destination) {
            creep.memory.destinationReached = true;
        }
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 20, offRoad: true});
    }
}

module.exports.role = profiler.registerFN(role, 'remoteHaulerRole');
