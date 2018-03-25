/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    creep.say(ICONS.haul, true);
    if (creep.renewalCheck(7)) return null;
    if (creep.room.invaderCheck()) return creep.goHomeAndHeal();
    creep.repairRoad();
    if (_.sum(creep.carry) === 0) {
        delete creep.memory.storageDestination;
        creep.memory.hauling = false;
    }
    if (_.sum(creep.carry) === creep.carryCapacity) {
        creep.memory.hauling = true;
        delete creep.memory.destination;
        delete creep.memory.containerID;
    }
    if (!creep.memory.destination && !creep.memory.hauling) {
        let remotes = shuffle(Game.rooms[creep.memory.overlord].memory.remoteRooms);
        for (let key in remotes) {
            let remote = remotes[key];
            let hauler = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === creep.memory.overlord && c.memory.role === creep.memory.role && c.memory.destination === remotes[key])[0];
            if (Game.rooms[remote] && !hauler && Game.rooms[remote].memory.needsPickup) {
                creep.memory.destination = remotes[key];
                break;
            }
        }
    }
    if (creep.pos.roomName === creep.memory.destination) creep.memory.destinationReached = true;
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
                creep.memory.destinationReached = false;
                let labs = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.energy < s.energyCapacity * 0.75);
                if (creep.memory.storageDestination) {
                    let storageItem = Game.getObjectById(creep.memory.storageDestination);
                    for (const resourceType in creep.carry) {
                        switch (creep.transfer(storageItem, resourceType)) {
                            case OK:
                                break;
                            case ERR_NOT_IN_RANGE:
                                creep.shibMove(storageItem, {ignoreRoads: true});
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
                            creep.shibMove(labs[0], {ignoreRoads: true});
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
                    if (controllerContainer && controllerContainer.store[RESOURCE_ENERGY] < controllerContainer.storeCapacity * 0.70
                        && creep.carry[RESOURCE_ENERGY] === _.sum(creep.carry) && _.filter(creep.room.creeps, (c) => c.memory && c.memory.storageDestination === controllerContainer.id).length < 2
                        && (!storage || storage.store[RESOURCE_ENERGY] >= ENERGY_AMOUNT * 1.5)) {
                        creep.memory.storageDestination = controllerContainer.id;
                        switch (creep.transfer(controllerContainer, RESOURCE_ENERGY)) {
                            case OK:
                                delete creep.memory.storageDestination;
                                break;
                            case ERR_NOT_IN_RANGE:
                                creep.shibMove(controllerContainer, {ignoreRoads: true});
                                break;
                            case ERR_FULL:
                                delete creep.memory.storageDestination;
                                creep.findStorage();
                                break;
                        }
                    } else if (terminal && _.sum(terminal.store) < terminal.storeCapacity * 0.8 && storage.store[RESOURCE_ENERGY] > ENERGY_AMOUNT * 2 && terminal.store[RESOURCE_ENERGY] <= 25000) {
                        creep.memory.storageDestination = terminal.id;
                        switch (creep.transfer(terminal, RESOURCE_ENERGY)) {
                            case OK:
                                delete creep.memory.storageDestination;
                                break;
                            case ERR_NOT_IN_RANGE:
                                creep.shibMove(terminal, {ignoreRoads: true});
                                break;
                            case ERR_FULL:
                                delete creep.memory.storageDestination;
                                creep.findStorage();
                                break;
                        }
                    } else if (storage && _.sum(storage.store) < storage.storeCapacity * 0.95) {
                        creep.memory.storageDestination = storage.id;
                        switch (creep.transfer(storage, RESOURCE_ENERGY)) {
                            case OK:
                                delete creep.memory.storageDestination;
                                break;
                            case ERR_NOT_IN_RANGE:
                                creep.shibMove(storage, {ignoreRoads: true});
                                break;
                            case ERR_FULL:
                                delete creep.memory.storageDestination;
                                creep.findStorage();
                                break;
                        }
                    }
                }
            } else {
                creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 23, ignoreRoads: true});
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

module.exports.role = profiler.registerFN(role, 'remoteHaulerRole');
