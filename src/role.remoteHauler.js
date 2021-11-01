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
    if (creep.skSafety()) return;
    // Icon
    creep.say(ICONS.haul2, true);
    // If Hauling
    if (_.sum(creep.store) >= creep.store.getCapacity() * 0.5) {
        creep.memory.assignment = undefined;
        creep.memory.withdrawID = undefined;
        if (creep.memory.storageDestination) {
            let storageItem = Game.getObjectById(creep.memory.storageDestination);
            for (const resourceType in creep.store) {
                switch (creep.transfer(storageItem, resourceType)) {
                    case OK:
                        creep.memory.storageDestination = undefined;
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(storageItem);
                        break;
                    case ERR_FULL:
                    case ERR_NOT_ENOUGH_RESOURCES:
                        creep.memory._shibMove = undefined;
                        creep.memory.storageDestination = undefined;
                        break;
                }
            }
        } else {
            dropOff(creep)
        }
    } else {
        if (safemodeGeneration(creep)) return;
        creep.memory.storageDestination = undefined;
        // Remote haulers will opportunistically pickup score
        if (Game.shard.name === 'shardSeason') {
            /** season 1
             let score = creep.room.find(FIND_SCORE_CONTAINERS)[0];
             if (score) {
                switch (creep.withdraw(score, RESOURCE_SCORE)) {
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(score);
                }
                return;
            }**/
                // Season 2
            let score = creep.room.find(FIND_SYMBOL_CONTAINERS)[0];
            if (score && (_.includes(Memory.ownedSymbols, score.resourceType) || Game.rooms[creep.memory.overlord].storage)) {
                switch (creep.withdraw(score, score.resourceType)) {
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(score);
                }
                return;
            }
        }
        if (creep.memory.energyDestination) return creep.withdrawResource();
        if (creep.memory.misc) {
            let harvester = Game.getObjectById(creep.memory.misc);
            if (!harvester) return creep.memory.misc = undefined;
            if (creep.room.routeSafe(harvester.pos.roomName)) {
                if (Game.getObjectById(harvester.memory.needHauler)) {
                    creep.memory.energyDestination = harvester.memory.needHauler;
                } else {
                    creep.shibMove(harvester);
                }
            } else {
                if (creep.room.name === creep.memory.overlord || !creep.locateEnergy) creep.idleFor(15);
            }
        } else {
            let harvesters = _.filter(Game.creeps, (c) => c.my && c.memory.overlord === creep.memory.overlord && c.memory.role === 'remoteHarvester' && c.memory.carryAmountNeeded);
            if (harvesters.length) {
                for (let h of harvesters) {
                    let assignedHaulers = _.filter(Game.creeps, (c) => c.my && c.memory.misc === h.id);
                    let current = 0;
                    if (assignedHaulers.length) {
                        assignedHaulers.forEach((c) => current += c.store.getCapacity())
                        if (current >= creep.memory.carryAmountNeeded || assignedHaulers.length >= REMOTE_HAULER_CAP) continue;
                    }
                    return creep.memory.misc = h.id
                }
            }
            creep.idleFor(25);
        }
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
    if (overlord.terminal && overlord.terminal.store.getFreeCapacity() > _.sum(creep.store) && overlord.terminal.store.getUsedCapacity(RESOURCE_ENERGY) < TERMINAL_ENERGY_BUFFER * 2) {
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
    } else if (!creep.haulerDelivery()) creep.shibMove(overlord.controller);
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
            let hub = new RoomPosition(creep.room.memory.bunkerHub.x, creep.room.memory.bunkerHub.y, creep.room.name);
            if (creep.pos.getRangeTo(hub) >= 18) {
                creep.pos.createConstructionSite(STRUCTURE_LINK);
            }
        } else if (closestRange < 8) creep.memory.dropOffLink = closestLink.id;
    }
    creep.memory.linkAttempt = true;
}

// Generate safemode
let lastCheck;
function safemodeGeneration(creep) {
    if (lastCheck + 100 > Game.time || creep.room.name !== creep.memory.overlord || creep.store.getFreeCapacity() < SAFE_MODE_COST || creep.room.store(RESOURCE_GHODIUM) < SAFE_MODE_COST) return false;
    lastCheck = Game.time;
    if (!creep.room.controller.safeModeAvailable) {
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
