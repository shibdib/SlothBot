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
    }
    let hostiles = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (hostiles && creep.pos.getRangeTo(hostiles) <= 5) {
        return creep.flee(hostiles);
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
                    creep.memory.containerID = _.sample(container).id;
                } else if (creep.room.find(FIND_DROPPED_RESOURCES, {filter: (s) => s.amount > 100}).length > 0) {
                    let dropped = creep.room.find(FIND_DROPPED_RESOURCES, {filter: (s) => s.amount > 100})[0];
                    for (const resourceType in dropped) {
                        if (creep.pickup(dropped, resourceType) === ERR_NOT_IN_RANGE) {
                            creep.shibMove(dropped);
                        }
                    }
                } else {
                    creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 20, offRoad: true});
                }
            } else {
                if (!Game.getObjectById(creep.memory.containerID) || _.sum(Game.getObjectById(creep.memory.containerID).store) === 0) {
                    return creep.memory.containerID = undefined;
                }
                let container = Game.getObjectById(creep.memory.containerID);
                for (const resourceType in container.store) {
                    if (creep.withdraw(container, resourceType) === ERR_NOT_IN_RANGE) {
                        creep.shibMove(container);
                    }
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
                    let link = creep.pos.findInRange(FIND_STRUCTURES, 8, {filter: (s) => s.structureType === STRUCTURE_LINK});
                    if (link.length > 0 && link[0].id !== creep.room.memory.storageLink && creep.carry[RESOURCE_ENERGY] > 0) {
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
