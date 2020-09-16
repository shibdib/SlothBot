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
                creep.memory.assignment = _.max(remoteHarvester, 'memory.energyAmount').memory.needHauler;
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
let praiseSupplied = {};
function dropOff(creep) {
    buildLinks(creep);
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
    let closestLink = creep.pos.findClosestByRange(creep.room.structures, {filter: (s) => s.structureType === STRUCTURE_LINK && s.store.getFreeCapacity(RESOURCE_ENERGY) && s.isActive() && creep.pos.getRangeTo(s) <= 6});
    if (closestLink) {
        creep.memory.storageDestination = closestLink.id;
        return true;
    }
    //Controller
    let controllerContainer = Game.getObjectById(creep.room.memory.controllerContainer);
    if (controllerContainer && ((!praiseSupplied[creep.room.name] && Math.random() > 0.49) || creep.room.energyState) && (!controllerContainer.store[RESOURCE_ENERGY] || controllerContainer.store[RESOURCE_ENERGY] < controllerContainer.store.getCapacity() * 0.5)) {
        praiseSupplied[creep.room.name] = true;
        creep.memory.storageDestination = controllerContainer.id;
        return true;
    }
    if (creep.room.storage) {
        praiseSupplied[creep.room.name] = undefined;
        creep.memory.storageDestination = creep.room.storage.id;
        return true;
    }
    // Else fill spawns/extensions
    if (creep.haulerDelivery()) {
        praiseSupplied[creep.room.name] = undefined;
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
