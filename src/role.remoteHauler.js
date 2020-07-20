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
    creep.opportunisticFill();
    creep.say(ICONS.haul2, true);
    //Invader detection
    if (creep.fleeHome()) return;
    // Check if empty
    if (!_.sum(creep.store)) {
        creep.memory.storageDestination = undefined;
        creep.memory.hauling = undefined;
    } else {
        creep.memory.assignment = undefined;
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling) {
        // Perform opportunistic road repair
        creep.repairRoad();
        if (creep.pos.roomName === creep.memory.overlord) {
            // If carrying minerals deposit in terminal or storage
            if (_.sum(creep.store) > creep.store[RESOURCE_ENERGY]) creep.memory.storageDestination = creep.room.terminal.id || creep.room.storage.id;
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
                            creep.memory.storageDestination = undefined;
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
        if (creep.memory.assignment) {
            let assignment = Game.getObjectById(creep.memory.assignment);
            if (assignment) {
                if (creep.room.name !== assignment.room.name) creep.shibMove(new RoomPosition(25, 25, assignment.room.name)); else creep.withdrawResource(assignment);
            } else {
                creep.memory.assignment = undefined;
            }
        } else {
            // Handle Finding A Harvester In Need, if none exists go home and idle
            let remoteHarvester = _.filter(Game.creeps, (harv) => _.includes(JSON.parse(creep.memory.misc), harv.room.name) && harv.memory.needHauler && !_.filter(Game.creeps, (c) => c.memory.assignment === harv.memory.needHauler)[0]);
            if (remoteHarvester.length) {
                creep.memory.assignment = _.sample(remoteHarvester).memory.needHauler;
            } else {
                if (creep.pos.roomName !== creep.memory.overlord) creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 23}); else {
                    // Tow Truck
                    if (creep.towTruck()) return;
                    creep.idleFor(10);
                }
            }
        }
    }
};

// Remote Hauler Drop Off
function dropOff(creep) {
    buildLinks(creep);
    let controllerContainer = Game.getObjectById(creep.room.memory.controllerContainer);
    //Close Link
    if (!creep.memory.linkSearch) {
        let closestLink = creep.pos.findClosestByRange(creep.room.structures, {
            filter: (s) => s.structureType === STRUCTURE_LINK && s.id !== s.room.memory.hubLink && s.isActive() && s.pos.getRangeTo(s.pos.findClosestByRange(Game.map.findExit(s.room.name, creep.memory.destination))) < 5
        });
        creep.memory.linkSearch = true;
        if (closestLink) creep.memory.borderLink = closestLink.id;
    }
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
    if (creep.room.energyState && creep.room.level === 8) {
        let nuke = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_NUKER && s.store.getFreeCapacity(RESOURCE_ENERGY))[0];
        if (nuke) {
            creep.memory.storageDestination = nuke.id;
            return true;
        }
    }
    if (creep.memory.borderLink) {
        let link = Game.getObjectById(creep.memory.borderLink);
        if (!link) creep.memory.borderLink = undefined;
        if (link.store.getUsedCapacity() < link.store.getCapacity() && creep.pos.getRangeTo(link) <= 10) {
            creep.memory.storageDestination = creep.memory.borderLink;
            return true;
        }
    }
    //Controller
    if (controllerContainer && _.sum(controllerContainer.store) < controllerContainer.store.getCapacity() * 0.5 && !creep.room.controllerLink) {
        creep.memory.storageDestination = controllerContainer.id;
        return true;
    }
    // Terminal
    if (creep.room.terminal && creep.room.terminal.store[RESOURCE_ENERGY] < creep.room.terminal.store.getCapacity() * 0.5) {
        creep.memory.storageDestination = creep.room.terminal.id;
        return true;
    }
    //Storage baseline
    if (creep.room.storage && creep.room.storage.store[RESOURCE_ENERGY] < ENERGY_AMOUNT * 0.20) {
        creep.memory.storageDestination = creep.room.storage.id;
        return true;
    }
    //Controller
    if (controllerContainer && _.sum(controllerContainer.store) < controllerContainer.store.getCapacity() &&
        ((!creep.room.controllerLink && Math.random() > _.sum(controllerContainer.store) / controllerContainer.store.getCapacity()) || (creep.room.controllerLink && Math.random() > (_.sum(controllerContainer.store) / controllerContainer.store.getCapacity()) * 0.5))) {
        creep.memory.storageDestination = controllerContainer.id;
        return true;
    }
    // Terminal
    if (creep.room.terminal && creep.room.terminal.store.getFreeCapacity()) {
        creep.memory.storageDestination = creep.room.terminal.id;
        return true;
    }
    // Storage
    if (creep.room.storage) {
        creep.memory.storageDestination = creep.room.storage.id;
        return true;
    }
    // Else fill spawns/extensions
    if (creep.haulerDelivery()) {
        return true;
    } else creep.idleFor(5);
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
