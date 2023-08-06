/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    // Icon
    creep.say(ICONS.haul2, true);
    // Check for tow
    if (creep.towTruck()) return true;
    // If Hauling
    if (_.sum(creep.store)) {
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
                        delete creep.memory.storageDestination;
                        delete creep.memory._shibMove;
                        break;
                }
            }
        } else {
            dropOff(creep)
        }
    } else {
        // If low TTL return home and recycle
        if (creep.ticksToLive < 75) {
            creep.memory.destination = undefined;
            return creep.recycleCreep();
        }
        // If unsafe return home
        if (creep.skSafety()) return;
        // Attempt to generate safemodes
        if (safemodeGeneration(creep)) return;
        // If you have energy target get it
        if (creep.memory.energyDestination) return creep.withdrawResource();
        // Pickup dropped resource
        if (creep.room.droppedResources.length && _.max(creep.room.droppedResources, 'amount').amount > creep.store.getCapacity() * 0.5) return creep.memory.energyDestination = _.max(creep.room.droppedResources, 'amount').id;
        // Pickup dropped energy
        if (creep.room.droppedEnergy.length && _.max(creep.room.droppedEnergy, 'amount').amount > creep.store.getCapacity() * 0.5) return creep.memory.energyDestination = _.max(creep.room.droppedEnergy, 'amount').id;
        // If you know what room to go to and not already there go to it
        else if (creep.room.name !== creep.memory.destination && creep.room.routeSafe(creep.memory.destination)) return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 18});
        // If in the assigned room, look for energy
        else if (creep.locateEnergy()) return true;
        // Get room assigned based off assigned harv, otherwise find a harv
        else creep.idleFor(25);
    }
};

// Remote Hauler Drop Off
function dropOff(creep) {
    if (creep.memory.overlord !== creep.room.name) return creep.wrongRoom();
    let overlord = Game.rooms[creep.memory.overlord];
    // If carrying minerals deposit in terminal or storage
    if (_.sum(creep.store) > creep.store[RESOURCE_ENERGY]) {
        if (overlord.terminal) creep.memory.storageDestination = overlord.terminal.id;
        else if (overlord.storage) creep.memory.storageDestination = overlord.storage.id;
        else if (Game.getObjectById(overlord.memory.controllerContainer)) creep.memory.storageDestination = overlord.memory.controllerContainer;
        return;
    }
    // Handle border links
    /**
     buildLinks(creep);
     if (!creep.memory.borderLinkAttempt && !creep.memory.borderLink) {
        let borderLink = _.find(creep.room.structures, (s) => s.structureType === STRUCTURE_LINK && s.isActive() && creep.pos.getRangeTo(s) <= 8 && s.id !== s.room.memory.hubLink);
        if (borderLink) creep.memory.borderLink = borderLink.id;
        creep.memory.borderLinkAttempt = true;
    } else if (creep.memory.borderLink) {
        let borderLink = Game.getObjectById(creep.memory.borderLink);
        if (borderLink && (!borderLink.cooldown || borderLink.cooldown < 5) && borderLink.store.getFreeCapacity(RESOURCE_ENERGY)) {
            creep.memory.borderLink = borderLink.id;
            creep.memory.storageDestination = borderLink.id;
            return true;
        }
    }**/

        //Controller
    let controllerContainer = Game.getObjectById(overlord.memory.controllerContainer);
    let storageContainer = Game.getObjectById(overlord.memory.storageContainer);
    let lowTower = _.find(creep.room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] < TOWER_CAPACITY * 0.9);
    if (lowTower && !_.find(creep.room.myCreeps, (c) => c.memory.storageDestination === lowTower.id)) {
        creep.memory.storageDestination = lowTower.id;
        return true;
    } else if (overlord.terminal && overlord.terminal.store.getFreeCapacity() > _.sum(creep.store) && overlord.terminal.store.getUsedCapacity(RESOURCE_ENERGY) < TERMINAL_ENERGY_BUFFER * 2) {
        creep.memory.storageDestination = overlord.terminal.id;
        return true;
    } else if (overlord.level === overlord.controller.level && controllerContainer && controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) > 50 && Math.random() < (controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) / CONTAINER_CAPACITY)) {
        creep.memory.storageDestination = controllerContainer.id;
        return true;
    } else if (overlord.terminal && overlord.terminal.store.getFreeCapacity() > _.sum(creep.store) && overlord.terminal.store.getUsedCapacity(RESOURCE_ENERGY) < TERMINAL_ENERGY_BUFFER * 5) {
        creep.memory.storageDestination = overlord.terminal.id;
        return true;
    } else if (overlord.storage && overlord.storage.store.getFreeCapacity() > _.sum(creep.store)) {
        creep.memory.storageDestination = overlord.storage.id;
        return true;
    } else if (storageContainer && storageContainer.store.getFreeCapacity() > _.sum(creep.store)) {
        creep.memory.storageDestination = storageContainer.id;
        return true;
    } else if (creep.haulerDelivery()) {
        return true;
    } else creep.idleFor(5)
}

// Build remote links
function buildLinks(creep) {
    if (creep.memory.linkAttempt || creep.pos.getRangeTo(creep.pos.findClosestByRange(FIND_EXIT)) > 3) return;
    if (creep.room.controller.level >= 8) {
        let controllerLink = Game.getObjectById(creep.room.memory.controllerLink);
        let hubLink = Game.getObjectById(creep.room.memory.hubLink);
        let allLinks = _.filter(creep.room.structures, (s) => s.my && s.structureType === STRUCTURE_LINK);
        let closestLink = creep.pos.findClosestByRange(allLinks);
        let closestRange = creep.pos.getRangeTo(closestLink);
        let inBuildLink = _.filter(creep.room.constructionSites, (s) => s.my && s.structureType === STRUCTURE_LINK)[0];
        if (!inBuildLink && controllerLink && hubLink && allLinks.length < 6 && closestRange > 8) {
            if (creep.pos.getRangeTo(creep.room.hub) >= 18) {
                creep.pos.createConstructionSite(STRUCTURE_LINK);
            }
        } else if (closestRange < 8) creep.memory.dropOffLink = closestLink.id;
    }
    creep.memory.linkAttempt = true;
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
            let ghodiumStorage = _.filter(creep.room.structures, (s) => s.store && s.store[RESOURCE_GHODIUM])[0];
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
