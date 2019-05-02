/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    creep.say(ICONS.haul2, true);
    //Invader detection
    if (creep.fleeHome()) return creep.memory.destination = undefined;
    // Check if empty
    if (_.sum(creep.carry) === 0) {
        creep.memory.storageDestination = undefined;
        creep.memory.hauling = undefined;
    }
    // Check if ready to haul
    if (_.sum(creep.carry) >= creep.carryCapacity * 0.8 || (creep.memory.overlord === creep.pos.roomName && _.sum(creep.carry))) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling) {
        if (creep.pos.roomName === creep.memory.overlord) {
            // If carrying minerals deposit in terminal or storage
            if (_.sum(creep.carry) > creep.carry[RESOURCE_ENERGY]) creep.memory.storageDestination = creep.room.terminal.id || creep.room.storage.id;
            if (creep.memory.storageDestination) {
                let storageItem = Game.getObjectById(creep.memory.storageDestination);
                for (const resourceType in creep.carry) {
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
            } else if (!dropOff(creep)) creep.idleFor(5)
        } else {
            creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 23});
        }
    } else {
        // Set harvester pairing
        if (!creep.memory.harvester || !Game.getObjectById(creep.memory.harvester)) {
            let remoteHarvester = _.filter(Game.creeps, (c) => c.memory.overlord === creep.memory.overlord && (c.memory.role === 'remoteHarvester' || c.memory.role === 'SKworker') && !c.memory.hauler)[0];
            if (!remoteHarvester) return creep.idleFor(5);
            creep.memory.harvester = remoteHarvester.id;
            remoteHarvester.memory.hauler = creep.id;
            return;
        }
        // Set Harvester and move to them if not nearby
        let pairedHarvester = Game.getObjectById(creep.memory.harvester);
        // Handle Moving
        if (creep.room.name !== pairedHarvester.room.name) {
            return creep.shibMove(new RoomPosition(25, 25, pairedHarvester.room.name), {range: 22, offRoad: true});
        } else {
            if (pairedHarvester.memory.containerID) {
                let container = Game.getObjectById(pairedHarvester.memory.containerID);
                if (container && _.sum(container.store) > 50) {
                    for (const resourceType in container.store) {
                        if (creep.withdraw(container, resourceType) === ERR_NOT_IN_RANGE) {
                            creep.shibMove(container, {offRoad: true});
                        }
                    }
                } else {
                    creep.idleFor(5);
                }
            } else if (pairedHarvester.pos.lookFor(LOOK_RESOURCES)[0]) {
                let dropped = pairedHarvester.pos.lookFor(LOOK_RESOURCES)[0];
                if (creep.pickup(dropped) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(dropped, {offRoad: true});
                }
            } else {
                return creep.shibMove(new RoomPosition(25, 25, pairedHarvester.room.name), {range: 22, offRoad: true});
            }
        }
    }
};

// Remote Hauler Drop Off
function dropOff(creep) {
    buildLinks(creep);
    //Close Link
    let closestLink = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_LINK && s.energy < s.energyCapacity && s.id !== s.room.memory.hubLink});
    if (closestLink && closestLink.pos.getRangeTo(creep) <= 10) {
        creep.memory.storageDestination = closestLink.id;
        return true;
    }
    //Tower
    let tower = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TOWER && s.energy < s.energyCapacity * 0.8});
    if (tower) {
        creep.memory.storageDestination = tower.id;
        return true;
    }
    //Controller
    let controllerContainer = Game.getObjectById(creep.room.memory.controllerContainer);
    let controllerLink = Game.getObjectById(creep.room.memory.controllerLink);
    if (!controllerLink && controllerContainer && Math.random() > 0.7 && controllerContainer.store[RESOURCE_ENERGY] < controllerContainer.storeCapacity * 0.5) {
        creep.memory.storageDestination = controllerContainer.id;
        return true;
    }
    // Hub Container
    let hubContainer = Game.getObjectById(creep.room.memory.hubContainer);
    if (hubContainer && _.sum(hubContainer.store) < 1000) {
        creep.memory.storageDestination = hubContainer.id;
        return true;
    }
    //Terminal
    let terminal = creep.room.terminal;
    if (terminal && terminal.my && terminal.store[RESOURCE_ENERGY] < terminal.storeCapacity) {
        creep.memory.storageDestination = terminal.id;
        return true;
    }
    //Storage
    let storage = creep.room.storage;
    if (storage && storage.my) {
        creep.memory.storageDestination = storage.id;
        return true;
    }
    return false;
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
