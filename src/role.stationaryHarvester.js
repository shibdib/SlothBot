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
    //If source is set harvest
    if (creep.memory.source) {
        let source = Game.getObjectById(creep.memory.source);
        // If in place harvest
        if (creep.memory.onContainer) {
            let container = Game.getObjectById(source.memory.container);
            // Build container
            if (!container && creep.store[RESOURCE_ENERGY]) {
                let dropped = creep.pos.lookFor(LOOK_RESOURCES)[0];
                if (dropped && dropped.amount >= 200) {
                    let site = creep.pos.lookFor(LOOK_CONSTRUCTION_SITES)[0];
                    if (site) {
                        creep.build(site);
                        creep.pickup(dropped);
                    }
                    return;
                }
            }
            switch (creep.harvest(source)) {
                case ERR_NOT_IN_RANGE:
                    creep.memory.onContainer = undefined;
                    break;
                case ERR_NOT_ENOUGH_RESOURCES:
                    if (container && creep.store[RESOURCE_ENERGY]) {
                        creep.repair(container);
                    } else creep.idleFor(source.ticksToRegeneration + 1);
                    break;
                case OK:
                    if (container && !container.store.getFreeCapacity(RESOURCE_ENERGY)) depositEnergy(creep);
                    // Set stationary so we don't get bumped
                    creep.memory.other.stationary = true;
                    // If we have a link and container, empty the container of overflow
                    if (source.memory.link && container && container.store[RESOURCE_ENERGY]) creep.withdraw(container, RESOURCE_ENERGY);
                    // Every other tick check for deposit ability
                    if (isEven(Game.time)) {
                        if (creep.store[RESOURCE_ENERGY]) depositEnergy(creep);
                    }
                    break;
            }
        } else {
            let container = Game.getObjectById(source.memory.container);
            //Make sure you're on the container
            if (container) {
                if (creep.pos.getRangeTo(container)) {
                    return creep.shibMove(container, {range: 0});
                } else {
                    creep.memory.onContainer = true;
                }
            } else {
                if (creep.pos.getRangeTo(source) > 1) {
                    return creep.shibMove(source);
                } else {
                    creep.memory.onContainer = true;
                }
            }
        }
    } else {
        if (!creep.findSource()) {
            let oldestHarvester = _.min(_.filter(creep.room.creeps, (c) => c.memory && c.ticksToLive < 500 && c.memory.role === "stationaryHarvester"), "ticksToLive") || _.find(creep.room.creeps, (c) => c.memory && c.memory.role === "stationaryHarvester" && c.memory.other.reboot);
            if (!oldestHarvester || !oldestHarvester.id) return creep.suicide();
            else {
                creep.memory.source = oldestHarvester.memory.source;
                oldestHarvester.suicide();
            }
        }
    }
};

// Rotate between link and container if we don't have a hub and controller link
function depositEnergy(creep) {
    let source = Game.getObjectById(creep.memory.source);
    let container = Game.getObjectById(source.memory.container);
    // Fill nearby
    if (extensionFiller(creep)) return;
    if (container && container.hits < container.hitsMax * 0.5) return creep.repair(container);
    if (source.memory.link) {
        let link = Game.getObjectById(source.memory.link);
        if (link && link.store[RESOURCE_ENERGY] < LINK_CAPACITY) {
            creep.transfer(link, RESOURCE_ENERGY);
            creep.withdraw(container, RESOURCE_ENERGY);
        } else if (container && !container.store.getFreeCapacity(RESOURCE_ENERGY)) {
            if (container.hits < container.hitsMax) creep.repair(container); else if (creep.pos.checkForRampart()) creep.repair(creep.pos.checkForRampart());
        }
    } else if (container) {
        if (!container.store.getFreeCapacity(RESOURCE_ENERGY)) {
            if (container.hits < container.hitsMax) creep.repair(container); else {
                creep.idleFor(5);
            }
        }
    } else {
        creep.memory.containerID = undefined;
        creep.memory.linkID = undefined;
    }
}

function extensionFiller(creep) {
    if (!ROOM_HARVESTER_EXTENSIONS[creep.room.name] || !creep.memory.extensionsFound) {
        creep.memory.extensionsFound = true;
        let container = Game.getObjectById(creep.memory.containerID) || creep;
        let extension = container.pos.findInRange(_.filter(creep.room.impassibleStructures, (s) => s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION), 1);
        let sourceExtensions = ROOM_HARVESTER_EXTENSIONS[creep.room.name] || [];
        ROOM_HARVESTER_EXTENSIONS[creep.room.name] = _.union(sourceExtensions, _.pluck(extension, 'id'));
        // Rampart check if near border or outside
        if (extension.length && creep.room.level >= 3) {
            let nearbyBunkerWall = _.find(container.pos.lookForNearby(LOOK_STRUCTURES, true, 3), (s) => (s.structure.structureType === STRUCTURE_RAMPART && !s.structure.pos.checkForObstacleStructure()) || s.structure.structureType === STRUCTURE_WALL);
            if (nearbyBunkerWall) {
                if (!container.pos.checkForRampart()) container.pos.createConstructionSite(STRUCTURE_RAMPART);
                for (let e of extension) {
                    if (!e.pos.checkForRampart()) {
                        e.pos.createConstructionSite(STRUCTURE_RAMPART);
                    }
                }
            }
        }
    } else {
        if (creep.opportunisticFill()) return true;
    }
}