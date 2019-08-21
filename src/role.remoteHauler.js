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
    // Handle border
    if (creep.borderCheck()) return;
    //Renew
    if (creep.renewalCheck()) return;
    creep.say(ICONS.haul2, true);
    //Invader detection
    if (creep.hits < creep.hitsMax || creep.memory.runCooldown) {
        return creep.goHomeAndHeal();
    }
    if (creep.hits < creep.hitsMax) return creep.goHomeAndHeal();
    // Check if empty
    if (_.sum(creep.carry) === 0) {
        creep.memory.storageDestination = undefined;
        creep.memory.hauling = undefined;
    }
    // Check if ready to haul
    if (!creep.memory.hauling && (_.sum(creep.carry) >= creep.carryCapacity * 0.5 || (creep.memory.overlord === creep.pos.roomName && _.sum(creep.carry)))) creep.memory.hauling = true;
    if (creep.memory.hauling) {
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
                            } else if (storageItem.structureType === STRUCTURE_LINK && _.sum(creep.carry)) {
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
            } else if (!dropOff(creep)) creep.idleFor(15)
        } else {
            creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 23});
        }
    } else {
        // Tow Truck
        if (creep.towTruck()) return;
        // Set harvester pairing
        if (!creep.memory.harvesterID || !Game.getObjectById(creep.memory.harvesterID)) {
            let multiple = 1;
            if (Game.rooms[creep.memory.overlord].controller.level >= 7) multiple = 2;
            let harvester = _.find(Game.creeps, (c) => c.my && c.memory.role === 'remoteHarvester' && (!c.memory.haulerID || c.memory.haulerID.length < multiple) && c.memory.overlord === creep.memory.overlord) ||
                _.find(Game.creeps, (c) => c.my && c.memory.role === 'SKWorker' && (!c.memory.haulerID || c.memory.haulerID.length < multiple) && c.memory.overlord === creep.memory.overlord);
            if (harvester) {
                if (!harvester.memory.haulerID) harvester.memory.haulerID = [creep.id]; else harvester.memory.haulerID.push(creep.id);
                creep.memory.harvesterID = harvester.id;
            } else {
                creep.memory.harvesterID = undefined;
                creep.idleFor(15);
            }
        } else {
            let harvester = Game.getObjectById(creep.memory.harvesterID);
            // Handle Moving
            if (creep.room.name !== harvester.memory.destination) return creep.shibMove(new RoomPosition(25, 25, harvester.memory.destination), {range: 23});
            let amount = creep.carryCapacity - _.sum(creep.carry);
            if (creep.getActiveBodyparts(MOVE) !== creep.getActiveBodyparts(CARRY) &&
                harvester.pos.findInRange(harvester.room.structures, 4, {filter: (s) => s.structureType === STRUCTURE_ROAD}).length < 3) amount = (creep.carryCapacity / 2) - _.sum(creep.carry);
            let container = Game.getObjectById(harvester.memory.containerID);
            if (container) return creep.withdrawResource(container, amount); else if (creep.memory.energyDestination) return creep.withdrawResource(Game.getObjectById(creep.memory.energyDestination), amount); else creep.findEnergy();
            if (!creep.memory.energyDestination) creep.shibMove(new RoomPosition(25, 25, harvester.memory.destination), {range: 20})
        }
    }
};

// Remote Hauler Drop Off
function dropOff(creep) {
    buildLinks(creep);
    //Tower
    let towerCutoff = 0.65;
    if (Memory.roomCache[creep.room.name].threatLevel) towerCutoff = 0.99;
    let tower = creep.pos.findClosestByRange(creep.room.structures, {
        filter: (s) => s.structureType === STRUCTURE_TOWER &&
            s.energy + _.sum(_.filter(creep.room.creeps, (c) => c.my && c.memory.storageDestination === s.id), '.carry.energy') < s.energyCapacity * towerCutoff
    });
    if (tower) {
        creep.memory.storageDestination = tower.id;
        return true;
    }
    //Empty Lab
    let lab = creep.pos.findClosestByRange(creep.room.structures, {
        filter: (s) => s.structureType === STRUCTURE_LAB &&
            s.energy + _.sum(_.filter(creep.room.creeps, (c) => c.my && c.memory.storageDestination === s.id), '.carry.energy') < s.energyCapacity
    });
    if (lab) {
        creep.memory.storageDestination = lab.id;
        return true;
    }
    //Nuker
    let nuker = creep.pos.findClosestByRange(creep.room.structures, {
        filter: (s) => s.structureType === STRUCTURE_NUKER &&
            s.energy + _.sum(_.filter(creep.room.creeps, (c) => c.my && c.memory.storageDestination === s.id), '.carry.energy') < s.energyCapacity
    });
    if (nuker) {
        creep.memory.storageDestination = nuker.id;
        return true;
    }
    //Close Link
    let closestLink = creep.pos.findClosestByRange(creep.room.structures, {
        filter: (s) => s.structureType === STRUCTURE_LINK && s.id !== s.room.memory.hubLink && s.id !== s.room.memory.controllerLink &&
            s.energy + _.sum(_.filter(creep.room.creeps, (c) => c.my && c.memory.storageDestination === s.id), '.carry.energy') < s.energyCapacity && s.isActive()
    });
    //Controller
    let importantBuilds = _.filter(creep.room.constructionSites, (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER).length;
    let controllerContainer = Game.getObjectById(creep.room.memory.controllerContainer);
    let controllerLink = Game.getObjectById(creep.room.memory.controllerLink);
    if (!controllerLink && (!importantBuilds || creep.room.memory.energySurplus) && controllerContainer &&
        controllerContainer.store[RESOURCE_ENERGY] + _.sum(_.filter(creep.room.creeps, (c) => c.my && c.memory.storageDestination === controllerContainer.id), '.carry.energy') < controllerContainer.storeCapacity * 0.5) {
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
