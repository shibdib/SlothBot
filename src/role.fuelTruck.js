/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    creep.say(ICONS.haul2, true);
    if (creep.room.name !== creep.memory.destination) {
        if (!creep.isFull) {
            if (creep.room.name === creep.memory.overlord) {
                if (creep.ticksToLive < 150) return creep.recycleCreep();
                if (creep.memory.energyDestination) {
                    creep.withdrawResource();
                } else {
                    creep.locateEnergy();
                }
            } else {
                return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 22});
            }
        } else {
            return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 22});
        }
    } else {
        if (!_.sum(creep.store)) {
            return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 22});
        } else if (creep.memory.storageDestination) {
            let storageItem = Game.getObjectById(creep.memory.storageDestination);
            for (const resourceType in creep.store) {
                switch (creep.transfer(storageItem, resourceType)) {
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(storageItem);
                        return true;
                    default:
                        delete creep.memory.resourceDelivery;
                        delete creep.memory.storageDestination;
                        delete creep.memory._shibMove;
                        break;
                }
            }
        } else {
            dropOff(creep)
        }
    }
};

function dropOff(creep) {
    if (creep.memory.resourceDelivery) {
        if (creep.memory.resourceDelivery !== creep.room.name) creep.shibMove(new RoomPosition(25, 25, creep.memory.resourceDelivery), {range: 18});
        else {
            if (creep.room.terminal) creep.memory.storageDestination = creep.room.terminal.id;
            else if (creep.room.storage) creep.memory.storageDestination = creep.room.storage.id;
        }
        return;
    }
    let overlord = Game.rooms[creep.memory.destination];
    // If carrying minerals deposit in terminal or storage
    if (_.sum(creep.store) > creep.store[RESOURCE_ENERGY]) {
        if (overlord.terminal) creep.memory.storageDestination = overlord.terminal.id;
        else if (overlord.storage) creep.memory.storageDestination = overlord.storage.id;
        else creep.memory.resourceDelivery = findClosestOwnedRoom(creep.room.name, false, 4);
        return;
    }
    //Controller
    let controllerContainer = Game.getObjectById(overlord.memory.controllerContainer);
    let lowTower = _.find(creep.room.impassibleStructures, (s) => s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] < TOWER_CAPACITY && !_.find(creep.room.myCreeps, (c) => c.memory.storageDestination === s.id));
    if (lowTower) {
        creep.memory.storageDestination = lowTower.id;
        return true;
    } else if (overlord.terminal && overlord.terminal.store.getFreeCapacity() > _.sum(creep.store) && overlord.terminal.store.getUsedCapacity(RESOURCE_ENERGY) < TERMINAL_ENERGY_BUFFER * 2 && !_.find(creep.room.myCreeps, (c) => c.memory.storageDestination === overlord.terminal.id)) {
        creep.memory.storageDestination = overlord.terminal.id;
        return true;
    } else if (overlord.level === overlord.controller.level && controllerContainer && Math.random() < (controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) / CONTAINER_CAPACITY)) {
        creep.memory.storageDestination = controllerContainer.id;
        return true;
    } else if (overlord.terminal && overlord.terminal.store.getFreeCapacity() > _.sum(creep.store) && overlord.terminal.store.getUsedCapacity(RESOURCE_ENERGY) < TERMINAL_ENERGY_BUFFER * 5) {
        creep.memory.storageDestination = overlord.terminal.id;
        return true;
    } else if (overlord.storage && overlord.storage.store.getFreeCapacity() > _.sum(creep.store)) {
        creep.memory.storageDestination = overlord.storage.id;
        return true;
    } else if (creep.haulerDelivery()) {
        return true;
    } else creep.idleFor(5)
}
