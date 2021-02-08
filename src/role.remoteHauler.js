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
    // Check if empty
    creep.memory.hauling = _.sum(creep.store) > 0;
    if (!creep.memory.hauling) {
        creep.memory.storageDestination = undefined;
        creep.memory.energyDestination = undefined;
    } else {
        creep.memory.assignment = undefined;
        creep.memory.withdrawID = undefined;
    }
    if (creep.memory.hauling) {
        if (creep.pos.roomName === creep.memory.overlord) {
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
                // If carrying minerals deposit in terminal or storage
                if (_.sum(creep.store) > creep.store[RESOURCE_ENERGY]) {
                    if (creep.room.terminal) creep.memory.storageDestination = creep.room.terminal.id;
                    else if (creep.room.storage) creep.memory.storageDestination = creep.room.storage.id;
                    else if (Game.getObjectById(creep.room.memory.controllerContainer)) creep.memory.storageDestination = creep.room.memory.controllerContainer;
                } else dropOff(creep)
            }
        } else {
            creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 23});
        }
    } else {
        // Remote haulers will opportunistically pickup score
        if (Game.shard.name === 'shardSeason') {
            let score = creep.room.find(FIND_SCORE_CONTAINERS)[0];
            if (score) {
                switch (creep.withdraw(score, RESOURCE_SCORE)) {
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
                    if (Game.getObjectById(harvester.memory.needHauler).store && _.sum(Game.getObjectById(harvester.memory.needHauler).store) > Game.getObjectById(harvester.memory.needHauler).store[RESOURCE_ENERGY]) {
                        let resource = _.filter(Object.keys(Game.getObjectById(harvester.memory.needHauler).store), (r) => r !== RESOURCE_ENERGY)[0];
                        creep.withdrawResource(Game.getObjectById(harvester.memory.needHauler), resource);
                    } else {
                        creep.withdrawResource(Game.getObjectById(harvester.memory.needHauler));
                    }
                } else {
                    creep.shibMove(harvester);
                }
            } else {
                creep.idleFor(15);
            }
        } else {
            let harvesters = _.filter(Game.creeps, (c) => c.my && c.memory.overlord === creep.memory.overlord && c.memory.role === 'remoteHarvester' && c.memory.carryAmountNeeded);
            if (harvesters.length) {
                for (let h of harvesters) {
                    let assignedHaulers = _.filter(Game.creeps, (c) => c.my && c.memory.misc === h.id);
                    let current = 0;
                    if (assignedHaulers.length) {
                        continue;
                        //assignedHaulers.forEach((c) => current += c.store.getCapacity())
                        //if (current >= creep.memory.carryAmountNeeded || assignedHaulers.length >= (CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][Game.rooms[creep.memory.overlord].controller.level] + 1)) continue;
                    }
                    return creep.memory.misc = h.id
                }
            } else {
                creep.idleFor(15);
            }
        }
    }
};

// Remote Hauler Drop Off
function dropOff(creep) {
    buildLinks(creep);
    if (creep.memory.dropOffLink && Game.getObjectById(creep.memory.dropOffLink)) return creep.memory.storageDestination = creep.memory.dropOffLink;
    // Lab
    let lab = creep.pos.findClosestByRange(creep.room.structures, {
        filter: (s) => s.structureType === STRUCTURE_LAB && s.energy < s.energyCapacity && !_.filter(creep.room.creeps, (c) => c.my && c.memory.storageDestination === s.id).length && s.isActive()
    });
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
    let nuke = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_NUKER && s.store.getFreeCapacity(RESOURCE_ENERGY))[0];
    if (nuke) {
        creep.memory.storageDestination = nuke.id;
        return true;
    }
    let closestLink = creep.pos.findClosestByRange(creep.room.structures, {filter: (s) => s.structureType === STRUCTURE_LINK && s.store.getFreeCapacity(RESOURCE_ENERGY) && s.isActive() && creep.pos.getRangeTo(s) <= 6});
    if (closestLink) {
        creep.memory.storageDestination = closestLink.id;
        return true;
    }
    let controllerContainer = Game.getObjectById(creep.room.memory.controllerContainer);
    //Controller
    if (controllerContainer && Math.random() > (controllerContainer.store.getUsedCapacity() / CONTAINER_CAPACITY) && Math.random() > (0.7 / (creep.room.energyState + 1))) {
        creep.memory.storageDestination = controllerContainer.id;
        return true;
    } else if (creep.room.terminal && creep.room.terminal.store.getUsedCapacity(RESOURCE_ENERGY) < TERMINAL_ENERGY_BUFFER * 5) {
        creep.memory.storageDestination = creep.room.storage.id;
        return true;
    } else if (creep.room.storage && creep.room.storage.store.getFreeCapacity()) {
        creep.memory.storageDestination = creep.room.storage.id;
        return true;
    }
    // Else fill spawns/extensions
    if (creep.haulerDelivery()) {
        return true;
    } else creep.shibMove(creep.room.controller);
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
                let buildPos = new RoomPosition(creep.pos.x + getRandomInt(-2, 2), creep.pos.y + getRandomInt(-2, 2), creep.room.name);
                buildPos.createConstructionSite(STRUCTURE_LINK);
            }
        } else if (closestRange < 8) creep.memory.dropOffLink = closestLink.id;
    }
    creep.memory.linkAttempt = true;
}
