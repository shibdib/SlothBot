/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    creep.say(ICONS.haul, true);
    //if (creep.renewalCheck(4)) return creep.shibMove(Game.rooms[creep.memory.overlord].find(FIND_MY_SPAWNS)[0]);
    creep.borderCheck();
    //Invader detection
    creep.room.invaderCheck();
    let hostiles = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (hostiles && creep.pos.getRangeTo(hostiles) <= 7) return creep.retreat();
    if (creep.hits < creep.hitsMax) return creep.goHomeAndHeal();
    creep.repairRoad();
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
                creep.memory.stuckCounter = undefined;
                creep.memory.destinationReached = false;
                let labs = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.energy < s.energyCapacity * 0.9);
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
                } else if (labs[0] && creep.carry[RESOURCE_ENERGY] === _.sum(creep.carry)) {
                    creep.memory.storageDestination = labs[0].id;
                    switch (creep.transfer(labs[0], RESOURCE_ENERGY)) {
                        case OK:
                            creep.memory.storageDestination = undefined;
                            break;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(labs[0]);
                            break;
                        case ERR_FULL:
                            creep.memory.storageDestination = undefined;
                            creep.findStorage();
                            break;
                    }
                } else {
                    let controllerContainer = Game.getObjectById(creep.room.memory.controllerContainer);
                    let storage = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_STORAGE)[0];
                    let terminal = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_TERMINAL)[0];
                    if (controllerContainer && controllerContainer.store[RESOURCE_ENERGY] < controllerContainer.storeCapacity * 0.70 && creep.carry[RESOURCE_ENERGY] === _.sum(creep.carry) && !_.filter(creep.room.creeps, (c) => c.memory.storageDestination === controllerContainer.id)[0]) {
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
                    } else if (terminal && _.sum(terminal.store) < terminal.storeCapacity * 0.70 && storage.store[RESOURCE_ENERGY] > ENERGY_AMOUNT * 2 && terminal.store[RESOURCE_ENERGY] <= 20000) {
                        creep.memory.storageDestination = terminal.id;
                        switch (creep.transfer(terminal, RESOURCE_ENERGY)) {
                            case OK:
                                creep.memory.storageDestination = undefined;
                                break;
                            case ERR_NOT_IN_RANGE:
                                creep.shibMove(terminal);
                                break;
                            case ERR_FULL:
                                creep.memory.storageDestination = undefined;
                                creep.findStorage();
                                break;
                        }
                    } else if (storage && _.sum(storage.store) < storage.storeCapacity * 0.70) {
                        creep.memory.storageDestination = storage.id;
                        switch (creep.transfer(storage, RESOURCE_ENERGY)) {
                            case OK:
                                creep.memory.storageDestination = undefined;
                                break;
                            case ERR_NOT_IN_RANGE:
                                creep.shibMove(storage);
                                break;
                            case ERR_FULL:
                                creep.memory.storageDestination = undefined;
                                creep.findStorage();
                                break;
                        }
                    }
                }
            } else {
                let stuckCounter = creep.memory.stuckCounter || 0;
                stuckCounter++;
                if (stuckCounter >= 70) {
                    creep.moveTo(new RoomPosition(25, 25, creep.memory.overlord));
                } else {
                    creep.memory.stuckCounter = stuckCounter;
                    creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 23});
                }
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
