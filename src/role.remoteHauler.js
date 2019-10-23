/*
 * Copyright (c) 2019.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    //Renew
    if (creep.renewalCheck()) return;
    creep.say(ICONS.haul2, true);
    //Invader detection
    if (creep.hits < creep.hitsMax || creep.memory.runCooldown) return creep.goHomeAndHeal();
    if (creep.memory.hauling) {
        if (creep.pos.roomName === creep.memory.overlord) {
            // Check if empty
            if (!_.sum(creep.store)) {
                creep.memory.storageDestination = undefined;
                creep.memory.hauling = undefined;
                return;
            }
            // If carrying minerals deposit in terminal or storage
            if (_.sum(creep.store) > creep.store[RESOURCE_ENERGY]) creep.memory.storageDestination = creep.room.terminal.id || creep.room.storage.id;
            if (creep.memory.storageDestination) {
                let storageItem = Game.getObjectById(creep.memory.storageDestination);
                for (const resourceType in creep.store) {
                    switch (creep.transfer(storageItem, resourceType)) {
                        case OK:
                            if (!_.sum(creep.store) && (storageItem.structureType !== STRUCTURE_LINK || creep.memory.waitLink)) {
                                creep.memory.waitLink = undefined;
                            } else if (storageItem.structureType === STRUCTURE_LINK && _.sum(creep.store)) {
                                creep.memory.waitLink = true;
                                creep.idleFor(storageItem.cooldown + 1 || 5);
                            }
                            creep.memory.storageDestination = undefined;
                            break;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(storageItem);
                            break;
                        case ERR_FULL:
                            if (storageItem.structureType !== STRUCTURE_LINK || creep.memory.waitLink) {
                                creep.memory.storageDestination = undefined;
                                creep.memory.waitLink = undefined;
                            } else {
                                creep.memory.waitLink = true;
                                creep.idleFor(5);
                            }
                            break;
                    }
                }
            } else {
                dropOff(creep)
            }
        } else {
            creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 23});
        }
    } else {
        // Handle Moving
        if (creep.room.name !== creep.memory.destination) return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
        // Check if ready to haul
        if (!creep.memory.hauling && (_.sum(creep.store) >= creep.store.getCapacity() * 0.8 || (creep.memory.overlord === creep.pos.roomName && _.sum(creep.store)))) return creep.memory.hauling = true;
        if (!creep.memory.energyDestination) findResources(creep);
        if (creep.memory.energyDestination) {
            let energy = Game.getObjectById(creep.memory.energyDestination);
            let amount = creep.store.getCapacity() - _.sum(creep.store);
            if (energy && creep.getActiveBodyparts(MOVE) < creep.getActiveBodyparts(CARRY) && energy.pos.findInRange(energy.room.structures, 4, {filter: (s) => s.structureType === STRUCTURE_ROAD}).length < 3) amount = (creep.store.getCapacity() / 2) - _.sum(creep.store);
            return creep.withdrawResource(energy, amount);
        } else {
            creep.idleFor(10);
        }
    }
};

findResources = function (creep) {
    let droppedResource = creep.pos.findClosestByRange(creep.room.droppedResources, {filter: (r) => r.type !== RESOURCE_ENERGY && r.amount >= _.sum(creep.room.creeps.filter((c) => c.my && c.memory.energyDestination === r.id && c.id !== creep.id), '.store.getCapacity()') + (creep.store.getCapacity() * 0.4)});
    if (droppedResource) {
        creep.memory.energyDestination = droppedResource.id;
        return true;
    }
    // Tombstone
    let tombstone = creep.pos.findClosestByRange(creep.room.tombstones, {filter: (r) => r.store[RESOURCE_ENERGY] >= _.sum(creep.room.creeps.filter((c) => c.my && c.memory.energyDestination === r.id && c.id !== creep.id), '.store.getCapacity()') + (creep.store.getCapacity() * 0.4)});
    if (tombstone) {
        creep.memory.energyDestination = tombstone.id;
        return true;
    }
    //Dropped Energy
    let droppedEnergy = creep.pos.findClosestByRange(creep.room.droppedEnergy, {filter: (r) => r.amount >= _.sum(creep.room.creeps.filter((c) => c.my && c.memory.energyDestination === r.id && c.id !== creep.id), '.store.getCapacity()') + (creep.store.getCapacity() * 0.4)});
    if (droppedEnergy) {
        creep.memory.energyDestination = droppedEnergy.id;
        return true;
    }
    // Container
    let container = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] >= _.sum(creep.room.creeps.filter((c) => c.my && c.memory.energyDestination === s.id && c.id !== creep.id), '.store.getCapacity()') + (creep.store.getCapacity() * 0.4)});
    if (container) {
        creep.memory.energyDestination = container.id;
        return true;
    }
    return false;
};

// Remote Hauler Drop Off
function dropOff(creep) {
    buildLinks(creep);
    // Lab
    let lab = creep.pos.findClosestByRange(creep.room.structures, {
        filter: (s) => s.room.storage && s.structureType === STRUCTURE_LAB && s.energy < s.energyCapacity && !_.filter(creep.room.creeps, (c) => c.my && c.memory.storageDestination === s.id).length && s.isActive()
    });
    //Links
    if (lab) {
        creep.memory.storageDestination = lab.id;
        return true;
    }
    //Tower
    let towerCutoff = 0.65;
    if (Memory.roomCache[creep.room.name].threatLevel) towerCutoff = 0.99;
    let tower = creep.pos.findClosestByRange(creep.room.structures, {
        filter: (s) => s.structureType === STRUCTURE_TOWER && s.energy < s.energyCapacity * towerCutoff
    });
    if (tower) {
        creep.memory.storageDestination = tower.id;
        return true;
    }
    //Controller
    let importantBuilds = _.filter(creep.room.constructionSites, (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER).length;
    let controllerContainer = Game.getObjectById(creep.room.memory.controllerContainer);
    let controllerLink = Game.getObjectById(creep.room.memory.controllerLink);
    if (!controllerLink && (!importantBuilds || creep.room.memory.energySurplus) && controllerContainer &&
        controllerContainer.store[RESOURCE_ENERGY] + _.sum(_.filter(creep.room.creeps, (c) => c.my && c.memory.storageDestination === controllerContainer.id), '.store[RESOURCE_ENERGY]') < controllerContainer.storeCapacity * 0.5) {
        creep.memory.storageDestination = controllerContainer.id;
        return true;
    }
    //Close Link
    let closestLink = creep.pos.findClosestByRange(creep.room.structures, {
        filter: (s) => s.room.storage && s.structureType === STRUCTURE_LINK && s.id !== s.room.memory.hubLink && s.id !== s.room.memory.controllerLink && !_.filter(creep.room.creeps, (c) => c.my && c.memory.storageDestination === s.id).length && s.isActive()
    });
    //Links
    if (closestLink && closestLink.pos.getRangeTo(creep) <= creep.room.storage.pos.getRangeTo(creep)) {
        creep.memory.storageDestination = closestLink.id;
        return true;
    }
    //Terminal
    if (creep.room.terminal && creep.room.terminal.my && _.sum(creep.room.terminal.store) < creep.room.terminal.storeCapacity * 0.8 && (!closestLink || closestLink.pos.getRangeTo(creep) > creep.room.terminal.pos.getRangeTo(creep))) {
        creep.memory.storageDestination = creep.room.terminal.id;
        return true;
    }
    //Storage
    let storage = creep.room.storage;
    if (storage && (!closestLink || closestLink.pos.getRangeTo(creep) > creep.room.storage.pos.getRangeTo(creep)) && Math.random() >= 0.9) {
        creep.memory.storageDestination = storage.id;
        return true;
    }
    //Controller
    if (!importantBuilds && !controllerLink && controllerContainer && Math.random() > 0.9) {
        creep.memory.storageDestination = controllerContainer.id;
        return true;
    }
    // Hub Container
    let hubContainer = Game.getObjectById(creep.room.memory.hubContainer);
    if (hubContainer && _.sum(hubContainer.store) < 1000 && (!closestLink || closestLink.pos.getRangeTo(creep) > hubContainer.pos.getRangeTo(creep))) {
        creep.memory.storageDestination = hubContainer.id;
        return true;
    }
    //Storage
    if (storage && (!closestLink || closestLink.pos.getRangeTo(creep) > creep.room.storage.pos.getRangeTo(creep))) {
        creep.memory.storageDestination = storage.id;
        return true;
    }
    if (closestLink) {
        creep.memory.storageDestination = closestLink.id;
        return true;
    }
    if (creep.findEssentials()) return true;
    return creep.findSpawnsExtensions();
}

// Build remote links
function buildLinks(creep) {
    if (creep.memory.linkAttempt || creep.pos.getRangeTo(creep.pos.findClosestByRange(FIND_EXIT)) > 3) return;
    if (creep.room.controller.level >= 8) {
        let controllerLink = Game.getObjectById(creep.room.memory.controllerLink);
        let hubLink = Game.getObjectById(creep.room.memory.hubLink);
        let allLinks = _.filter(creep.room.structures, (s) => s.my && s.structureType === STRUCTURE_LINK);
        let closestLink = creep.pos.findClosestByRange(allLinks);
        let inBuildLink = _.filter(creep.room.constructionSites, (s) => s.my && s.structureType === STRUCTURE_LINK)[0];
        if (!inBuildLink && controllerLink && hubLink && allLinks.length < 6 && creep.pos.getRangeTo(closestLink) > 10) {
            let hub = new RoomPosition(creep.room.memory.bunkerHub.x, creep.room.memory.bunkerHub.y, creep.room.name);
            if (creep.pos.getRangeTo(hub) >= 18) {
                let buildPos = new RoomPosition(creep.pos.x + getRandomInt(-2, 2), creep.pos.y + getRandomInt(-2, 2), creep.room.name);
                buildPos.createConstructionSite(STRUCTURE_LINK);
            }
        }
    }
    creep.memory.linkAttempt = true;
}
