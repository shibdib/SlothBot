/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    //if (creep.renewalCheck(4)) return creep.shibMove(Game.rooms[creep.memory.overlord].find(FIND_MY_SPAWNS)[0]);
    creep.borderCheck();
    //Invader detection
    creep.room.invaderCheck();
    let hostiles = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (hostiles && creep.pos.getRangeTo(hostiles) <= 4) return creep.retreat();
    if (creep.hits < creep.hitsMax) return creep.goHomeAndHeal();
    if (creep.pos.roomName !== creep.memory.destination) creep.memory.destinationReached = false;
    if (creep.pos.roomName === creep.memory.destination) creep.memory.destinationReached = true;
    if (_.sum(creep.carry) === 0) {
        delete creep.memory.storageDestination;
        creep.memory.hauling = false;
    }
    if (_.sum(creep.carry) === creep.carryCapacity) {
        creep.memory.hauling = true;
        creep.memory.containerID = undefined;
    }

    if (creep.memory.destinationReached === true || creep.memory.hauling === true) {
        if (creep.memory.hauling === false) {
            if (!creep.memory.containerID) {
                let container = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && _.sum(s.store) >= 100);
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
            if (creep.pos.roomName === creep.memory.overlord) {
                creep.memory.destinationReached = false;
                let dropOffLink = Game.getObjectById(creep.memory.dropOffLink);
                if (creep.memory.storageDestination) {
                    let storageItem = Game.getObjectById(creep.memory.storageDestination);
                    for (const resourceType in creep.carry) {
                        switch (creep.transfer(storageItem, resourceType)) {
                            case OK:
                                break;
                            case ERR_NOT_IN_RANGE:
                                let adjacentStructure = creep.pos.findInRange(FIND_STRUCTURES, 1);
                                let opportunity = _.filter(adjacentStructure, (s) => (s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN) && s.energy < s.energyCapacity);
                                if (opportunity.length > 0) creep.transfer(opportunity[0], RESOURCE_ENERGY);
                                creep.shibMove(storageItem);
                                break;
                            case ERR_FULL:
                                creep.memory.storageDestination = undefined;
                                creep.findStorage();
                                break;
                        }
                    }
                } else if (dropOffLink && creep.carry[RESOURCE_ENERGY] === _.sum(creep.carry)) {
                    creep.memory.storageDestination = dropOffLink.id;
                    switch (creep.transfer(dropOffLink, RESOURCE_ENERGY)) {
                        case OK:
                            creep.memory.storageDestination = undefined;
                            break;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(dropOffLink);
                            break;
                        case ERR_FULL:
                            creep.memory.storageDestination = undefined;
                            creep.findStorage();
                            break;
                    }
                } else {
                    let link = _.filter(creep.pos.findInRange(FIND_STRUCTURES, 8), (s) => s.structureType === STRUCTURE_LINK);
                    let controllerContainer = Game.getObjectById(creep.room.memory.controllerContainer);
                    if (link.length > 0 && link[0].id !== creep.room.memory.storageLink && creep.carry[RESOURCE_ENERGY] === _.sum(creep.carry)) {
                        creep.memory.dropOffLink = link[0].id;
                    } else if (controllerContainer && controllerContainer.store[RESOURCE_ENERGY] < controllerContainer.storeCapacity && creep.carry[RESOURCE_ENERGY] === _.sum(creep.carry)) {
                        creep.memory.storageDestination = controllerContainer.id;
                        switch (creep.transfer(controllerContainer, RESOURCE_ENERGY)) {
                            case OK:
                                creep.memory.storageDestination = undefined;
                                break;
                            case ERR_NOT_IN_RANGE:
                                creep.shibMove(controllerContainer);
                                break;
                            case ERR_FULL:
                                creep.memory.storageDestination = undefined;
                                creep.findStorage();
                                break;
                        }
                    } else {
                        creep.findStorage();
                    }
                }
            } else {
                creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {
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
