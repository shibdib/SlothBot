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
    if (creep.kite(5)) return true;
    if (creep.hits < creep.hitsMax) return creep.goHomeAndHeal();
    // Check if empty
    if (_.sum(creep.carry) === 0) {
        creep.memory.storageDestination = undefined;
        creep.memory.hauling = undefined;
    }
    // Check if ready to haul
    if (!creep.memory.hauling && (_.sum(creep.carry) >= creep.carryCapacity * 0.5 || (creep.memory.overlord === creep.pos.roomName && _.sum(creep.carry)))) creep.memory.hauling = true;
    if (creep.memory.hauling) {
        if (creep.memory.containerID) creep.memory.containerID = undefined;
        creep.repairRoad();
        if (creep.pos.roomName === creep.memory.overlord) {
            // If carrying minerals deposit in terminal or storage
            if (_.sum(creep.carry) > creep.carry[RESOURCE_ENERGY]) creep.memory.storageDestination = creep.room.terminal.id || creep.room.storage.id;
            if (creep.memory.storageDestination) {
                let storageItem = Game.getObjectById(creep.memory.storageDestination);
                for (const resourceType in creep.carry) {
                    switch (creep.transfer(storageItem, resourceType)) {
                        case OK:
                            if (!_.sum(creep.carry) && (storageItem.structureType !== STRUCTURE_LINK || creep.memory.waitLink)) {
                                creep.memory.waitLink = undefined;
                            } else if (storageItem.structureType === STRUCTURE_LINK) {
                                creep.memory.waitLink = true;
                                creep.idleFor(5);
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
            } else if (!dropOff(creep)) creep.idleFor(2)
        } else {
            creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 23});
        }
    } else {
        // Set harvester pairing
        if (!creep.memory.containerID || !Game.getObjectById(creep.memory.containerID)) {
            let containers = [];
            let harvesters = _.filter(Game.creeps, (c) => c.my && c.memory.role === 'remoteHarvester' && c.memory.containerID && c.memory.overlord === creep.memory.overlord);
            if (harvesters.length) {
                harvesters.forEach((h) => containers.push(Game.getObjectById(h.memory.containerID)));
                if (containers.length) {
                    let needyContainer = _.max(_.filter(containers, ((s) => s && Memory.roomCache[s.pos.roomName] && !Memory.roomCache[s.pos.roomName].threatLevel &&
                        s.store.energy >= _.sum(_.filter(Game.creeps, (c) => c.my && c.memory.containerID === s.id && c.id !== creep.id && c.memory.role !== 'remoteHarvester'), '.carryCapacity') + (creep.carryCapacity * 0.5))), '.store.energy');
                    if (needyContainer && needyContainer.id) creep.memory.containerID = needyContainer.id; else creep.idleFor(4);
                } else {
                    creep.idleFor(4);
                }
            }
        }
        // Set Harvester and move to them if not nearby
        let pairedContainer = Game.getObjectById(creep.memory.containerID);
        if (!pairedContainer || !_.sum(pairedContainer.store)) return creep.memory.containerID = undefined;
        // Pickup dropped
        // Handle Moving
        if (creep.room.name !== pairedContainer.room.name) return creep.shibMove(new RoomPosition(25, 25, pairedContainer.room.name), {range: 23});
        let amount = creep.carryCapacity - _.sum(creep.carry);
        if (creep.getActiveBodyparts(MOVE) !== creep.getActiveBodyparts(CARRY) &&
            pairedContainer.pos.findInRange(pairedContainer.room.structures, 4, {filter: (s) => s.structureType === STRUCTURE_ROAD}).length < 3) amount = (creep.carryCapacity / 2) - _.sum(creep.carry);
        creep.withdrawResource(Game.getObjectById(creep.memory.containerID), amount);
    }
};

// Remote Hauler Drop Off
function dropOff(creep) {
    buildLinks(creep);
    //Close Link
    let closestLink = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_LINK && s.id !== s.room.memory.hubLink && s.id !== s.room.memory.controllerLink && s.energy !== s.energyCapacity && s.isActive()});
    //Controller
    let importantBuilds = _.filter(creep.room.constructionSites, (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER).length;
    let controllerContainer = Game.getObjectById(creep.room.memory.controllerContainer);
    let controllerLink = Game.getObjectById(creep.room.memory.controllerLink);
    if (!controllerLink && !importantBuilds && controllerContainer && controllerContainer.store[RESOURCE_ENERGY] < controllerContainer.storeCapacity * 0.5) {
        creep.memory.storageDestination = controllerContainer.id;
        return true;
    }
    //Links
    if (closestLink && closestLink.pos.getRangeTo(creep) <= creep.room.storage.pos.getRangeTo(creep)) {
        creep.memory.storageDestination = closestLink.id;
        return true;
    }
    //Storage
    let storage = creep.room.storage;
    if (storage && (!closestLink || closestLink.pos.getRangeTo(creep) > creep.room.storage.pos.getRangeTo(creep)) && Math.random() >= 0.9) {
        creep.memory.storageDestination = storage.id;
        return true;
    }
    //Tower
    let tower = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TOWER && s.energy < s.energyCapacity * 0.8});
    if (tower && (!closestLink || closestLink.pos.getRangeTo(creep) > tower.pos.getRangeTo(creep))) {
        creep.memory.storageDestination = tower.id;
        return true;
    }
    //Terminal
    if (creep.room.terminal && creep.room.terminal.my && creep.room.terminal.store[RESOURCE_ENERGY] < 5000 && (!closestLink || closestLink.pos.getRangeTo(creep) > creep.room.terminal.pos.getRangeTo(creep))) {
        creep.memory.storageDestination = creep.room.terminal.id;
        return true;
    }
    //Controller
    if (!importantBuilds && !controllerLink && controllerContainer && Math.random() > 0.9) {
        creep.memory.storageDestination = controllerContainer.id;
        return true;
    }
    //Terminal
    if (creep.room.terminal && creep.room.terminal.my && _.sum(creep.room.terminal.store) < creep.room.terminal.storeCapacity * 0.8 && (!closestLink || closestLink.pos.getRangeTo(creep) > creep.room.terminal.pos.getRangeTo(creep))) {
        creep.memory.storageDestination = creep.room.terminal.id;
        return true;
    }
    //Storage
    if (storage && (!closestLink || closestLink.pos.getRangeTo(creep) > creep.room.storage.pos.getRangeTo(creep))) {
        creep.memory.storageDestination = storage.id;
        return true;
    }
    // Hub Container
    let hubContainer = Game.getObjectById(creep.room.memory.hubContainer);
    if (hubContainer && _.sum(hubContainer.store) < 1000 && (!closestLink || closestLink.pos.getRangeTo(creep) > hubContainer.pos.getRangeTo(creep))) {
        creep.memory.storageDestination = hubContainer.id;
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
                let buildPos = new RoomPosition(creep.pos.x + getRandomInt(-1, 1), creep.pos.y + getRandomInt(-1, 1), creep.room.name);
                buildPos.createConstructionSite(STRUCTURE_LINK);
            }
        }
    }
    creep.memory.linkAttempt = true;
}
