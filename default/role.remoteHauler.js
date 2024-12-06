/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    // Handle robberies
    if (creep.memory.operation === 'robbery') return creep.robRoom();
    // Icon
    creep.say(ICONS.haul2, true);
    // Check for tow
    if (creep.towTruck()) return true;
    // If Hauling
    if (_.sum(creep.store) || creep.memory.hauling || creep.memory.storageDestination) {
        if (!_.sum(creep.store)) {
            creep.memory.storageDestination = undefined;
            creep.memory.hauling = undefined;
            return;
        } else creep.memory.hauling = true;
        // Sanity check for container and non energy
        if (_.sum(creep.store) > creep.store[RESOURCE_ENERGY] && creep.memory.storageDestination && Game.getObjectById(creep.memory.storageDestination) instanceof StructureContainer) return creep.memory.storageDestination = undefined;
        creep.memory.energyDestination = undefined;
        creep.opportunisticRepair();
        creep.opportunisticFill();
        if (creep.memory.storageDestination) {
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
    } else {
        // If unsafe return home
        if (creep.skSafety()) return;
        // Attempt to generate safemodes
        if (safemodeGeneration(creep)) return;
        // If you have energy target get it
        if (creep.memory.energyDestination) return creep.withdrawResource();
        // Perform a storage space check
        if (Game.rooms[creep.memory.overlord].storage && _.sum(Game.rooms[creep.memory.overlord].storage.store) < Game.rooms[creep.memory.overlord].storage.store.getCapacity() * 0.8) {
            // Pickup dropped resource
            if (creep.room.droppedResources.length && _.max(creep.room.droppedResources, 'amount').amount > creep.store.getCapacity() * 0.1) return creep.memory.energyDestination = _.max(creep.room.droppedResources, 'amount').id;
            // Empty ruins
            if (creep.room.ruins.length && _.find(creep.room.ruins, (r) => r.store.getUsedCapacity())) return creep.memory.energyDestination = _.find(creep.room.ruins, (r) => r.store.getUsedCapacity()).id;
        }
        // If we don't have a destination, find one
        if (!creep.memory.energyDestination) {
            let harvester = _.find(Game.creeps, (c) => c.my && c.memory.overlord === creep.memory.overlord && c.memory.role === 'remoteHarvester' && c.memory.energyAmount >= CONTAINER_CAPACITY * 0.5
                && !_.find(Game.creeps, (h) => h.my && h.memory.energyDestination === c.memory.energyId));
            if (harvester && harvester.id) {
                return creep.memory.energyDestination = harvester.memory.energyId;
            }
        }
        // If we're already outside the room check for energy
        if (creep.room.name !== creep.memory.overlord && creep.locateEnergy()) return;
        creep.idleFor(15);
    }
};

// Remote Hauler Drop Off
function dropOff(creep) {
    if (creep.memory.resourceDelivery) {
        if (creep.memory.resourceDelivery !== creep.room.name) creep.shibMove(new RoomPosition(25, 25, creep.memory.resourceDelivery), {range: 18});
        else {
            if (creep.room.terminal) creep.memory.storageDestination = creep.room.terminal.id;
            else if (creep.room.storage) creep.memory.storageDestination = creep.room.storage.id;
        }
        return;
    }
    let overlord = Game.rooms[creep.memory.overlord];
    // If carrying minerals deposit in terminal or storage
    if (_.sum(creep.store) > creep.store[RESOURCE_ENERGY]) {
        if (overlord.terminal) creep.memory.storageDestination = overlord.terminal.id;
        else if (overlord.storage) creep.memory.storageDestination = overlord.storage.id;
        else creep.memory.resourceDelivery = findClosestOwnedRoom(creep.room.name, false, 4);
    } else {
        //Controller
        let controllerContainer = Game.getObjectById(overlord.memory.controllerContainer);
        let lowTower = _.find(creep.room.impassibleStructures, (s) => s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] < TOWER_CAPACITY * 0.7 && !_.find(creep.room.myCreeps, (c) => c.memory.storageDestination === s.id));
        if (lowTower) {
            creep.memory.storageDestination = lowTower.id;
            return true;
        } else if (overlord.terminal && overlord.terminal.store.getFreeCapacity() > _.sum(creep.store) && overlord.terminal.store.getUsedCapacity(RESOURCE_ENERGY) < TERMINAL_ENERGY_BUFFER) {
            creep.memory.storageDestination = overlord.terminal.id;
            return true;
        } else if (overlord.level === overlord.controller.level && controllerContainer && Math.random() < (controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) / CONTAINER_CAPACITY)) {
            creep.memory.storageDestination = controllerContainer.id;
            return true;
        } else if (overlord.energyState && overlord.nuker && overlord.nuker.store.getFreeCapacity(RESOURCE_ENERGY)) {
            creep.memory.storageDestination = overlord.nuker.id;
            return true;
        } else if (overlord.energyState && controllerContainer && controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) > 100) {
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
        } else if (creep.pos.getRangeTo(Game.rooms[creep.memory.overlord].controller) > 2) {
            creep.shibMove(Game.rooms[creep.memory.overlord].controller, {range: 2});
        } else creep.idleFor(5)
    }
}

// Generate safemode
function safemodeGeneration(creep) {
    // Only run in your room and if we haven't checked yet
    if (creep.memory.safemodeCheck || creep.room.name !== creep.memory.overlord) return false;
    creep.memory.safemodeCheck = true;
    // Check if we can fit it or is it exists
    if (creep.store.getFreeCapacity() < SAFE_MODE_COST || creep.room.store(RESOURCE_GHODIUM) < SAFE_MODE_COST) return false;
    // Only do it if we have less than 2 safemodes
    if (!creep.room.controller.safeModeAvailable || creep.room.controller.safeModeAvailable < 2) {
        if (creep.store.getUsedCapacity(RESOURCE_GHODIUM) < SAFE_MODE_COST) {
            let ghodiumStorage = _.filter(creep.room.impassibleStructures, (s) => s.store && s.store[RESOURCE_GHODIUM])[0];
            if (ghodiumStorage) {
                switch (creep.transfer(ghodiumStorage, RESOURCE_GHODIUM)) {
                    case OK:
                        creep.memory.storageDestination = undefined;
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(ghodiumStorage);
                        break;
                    case ERR_FULL:
                    case ERR_NOT_ENOUGH_RESOURCES:
                        creep.memory._shibMove = undefined;
                        creep.memory.storageDestination = undefined;
                        break;
                }
            }
        } else {
            switch (creep.generateSafeMode(creep.room.controller)) {
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(creep.room.controller);
                    break;
            }
        }
        return true;
    }
}
