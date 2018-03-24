/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    creep.say(ICONS.haul, true);
    creep.repairRoad();
    if (_.sum(creep.carry) === 0) {
        delete creep.memory.storageDestination;
        creep.memory.hauling = false;
    }
    if (_.sum(creep.carry) === creep.carryCapacity) {
        creep.memory.hauling = true;
        delete creep.memory.containerID;
    }
    if (creep.pos.roomName === creep.memory.destination) creep.memory.destinationReached = true;
    if (creep.memory.destinationReached === true || creep.memory.hauling === true) {
        if (creep.memory.hauling === false) {
            if (!creep.memory.containerID) {
                let container = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && _.sum(s.store) >= 100);
                if (container.length > 0) {
                    creep.memory.containerID = _.sample(container).id;
                } else {
                    creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 20, offRoad: true});
                }
            } else {
                if (!Game.getObjectById(creep.memory.containerID) || _.sum(Game.getObjectById(creep.memory.containerID).store) === 0) {
                    return delete creep.memory.containerID;
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
                delete creep.memory.stuckCounter;
                delete creep.memory.destinationReached;
                if (creep.renewalCheck(8)) return null;
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
                                delete creep.memory.storageDestination;
                                creep.findStorage();
                                break;
                        }
                    }
                } else if (labs[0] && creep.carry[RESOURCE_ENERGY] === _.sum(creep.carry)) {
                    creep.memory.storageDestination = labs[0].id;
                    switch (creep.transfer(labs[0], RESOURCE_ENERGY)) {
                        case OK:
                            delete creep.memory.storageDestination;
                            break;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(labs[0]);
                            break;
                        case ERR_FULL:
                            delete creep.memory.storageDestination;
                            creep.findStorage();
                            break;
                    }
                } else {
                    let controllerContainer = Game.getObjectById(creep.room.memory.controllerContainer);
                    let storage = creep.room.storage;
                    let terminal = creep.room.terminal;
                    if (controllerContainer && controllerContainer.store[RESOURCE_ENERGY] < controllerContainer.storeCapacity * 0.70 && creep.carry[RESOURCE_ENERGY] === _.sum(creep.carry) && _.filter(creep.room.creeps, (c) => c.memory.storageDestination === controllerContainer.id).length < 2) {
                        creep.memory.storageDestination = controllerContainer.id;
                        switch (creep.transfer(controllerContainer, RESOURCE_ENERGY)) {
                            case OK:
                                delete creep.memory.storageDestination;
                                break;
                            case ERR_NOT_IN_RANGE:
                                creep.shibMove(controllerContainer);
                                break;
                            case ERR_FULL:
                                delete creep.memory.storageDestination;
                                creep.findStorage();
                                break;
                        }
                    } else if (terminal && _.sum(terminal.store) < terminal.storeCapacity * 0.70 && storage.store[RESOURCE_ENERGY] > ENERGY_AMOUNT * 2 && terminal.store[RESOURCE_ENERGY] <= 25000) {
                        creep.memory.storageDestination = terminal.id;
                        for (const resourceType in this.carry) {
                            switch (this.transfer(storage, resourceType)) {
                                case OK:
                                    delete this.memory.storageDestination;
                                    delete this.memory.destinationReached;
                                    break;
                                case ERR_NOT_IN_RANGE:
                                    this.shibMove(storage);
                                    break;
                                case ERR_FULL:
                                    delete this.memory.storageDestination;
                                    this.findStorage();
                                    break;
                            }
                        }
                    } else if (storage && _.sum(storage.store) < storage.storeCapacity * 0.70) {
                        creep.memory.storageDestination = storage.id;
                        for (const resourceType in this.carry) {
                            switch (this.transfer(storage, resourceType)) {
                                case OK:
                                    delete this.memory.storageDestination;
                                    delete this.memory.destinationReached;
                                    break;
                                case ERR_NOT_IN_RANGE:
                                    this.shibMove(storage);
                                    break;
                                case ERR_FULL:
                                    delete this.memory.storageDestination;
                                    this.findStorage();
                                    break;
                            }
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
    } else if (creep.memory.destination && !creep.memory.destinationReached) {
        delete creep.memory.containerID;
        if (creep.pos.roomName === creep.memory.destination) {
            creep.memory.destinationReached = true;
        }
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 20, offRoad: true});
    } else {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 18, offRoad: true});
    }
}

module.exports.role = profiler.registerFN(role, 'SKHauler');
