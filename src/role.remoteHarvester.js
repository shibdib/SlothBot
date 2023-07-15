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
    // SK Safety
    if (creep.skSafety()) return creep.memory.onContainer = undefined;
    // If you're in place just harvest
    if (creep.memory.onContainer) {
        if (Math.random() > 0.9) return creep.memory.onContainer = undefined;
        // Handle setting the pickup for a hauler
        let source = Game.getObjectById(creep.memory.other.source);
        switch (creep.harvest(source)) {
            case ERR_NOT_IN_RANGE:
                creep.memory.onContainer = undefined;
                break;
            case ERR_NOT_ENOUGH_RESOURCES:
                creep.idleFor(source.ticksToRegeneration + 1);
                break;
            case OK:
                creep.memory.other.stationary = true;
                // Handle building container
                if (creep.store[RESOURCE_ENERGY] && creep.memory.containerSite && creep.pos.checkForEnergy() >= 500) {
                    let site = Game.getObjectById(creep.memory.containerSite);
                    if (!site) return creep.memory.containerSite = undefined;
                    switch (creep.build(site)) {
                        case OK:
                            return;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(site);
                            break;
                    }
                }
                // Handle repairing
                let container = Game.getObjectById(creep.memory.containerID);
                if (!container) return creep.memory.containerID = undefined;
                if (creep.store[RESOURCE_ENERGY] && container.hits < container.hitsMax * 0.25) creep.repair(container);
                else if (_.sum(container.store) >= CONTAINER_CAPACITY * 0.75 && container.hits < container.hitsMax) creep.repair(container);
                else if (_.sum(container.store) >= CONTAINER_CAPACITY) creep.idleFor(20);
                break;
        }
    } else {
        // Move to destination
        if (creep.room.name !== creep.memory.destination) return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 17})
        // Suicide and cache intel if room is reserved/owned by someone else
        if (creep.room.controller && ((creep.room.controller.reservation && creep.room.controller.reservation.username !== MY_USERNAME) || creep.room.controller.owner)) {
            creep.room.cacheRoomIntel(true, creep);
            return creep.suicide();
        }
        // Harvest
        if (creep.memory.other.source) {
            let source = Game.getObjectById(creep.memory.other.source);
            let container = Game.getObjectById(creep.memory.containerID) || Game.getObjectById(creep.memory.containerSite);
            // Make sure you're on the container
            if (container) {
                if (creep.pos.getRangeTo(container) > 0) {
                    return creep.shibMove(container, {range: 0});
                } else {
                    // Add a check for walls
                    Memory.roomCache[creep.room.name].needCleaner = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_WALL).length > 0;
                    creep.memory.onContainer = true;
                }
            } else if (!creep.pos.isNearTo(source)) return creep.shibMove(source);
            switch (creep.harvest(source)) {
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(source);
                    break;
                case ERR_NOT_ENOUGH_RESOURCES:
                    creep.idleFor(source.ticksToRegeneration + 1);
                    break;
                case OK:
                    // Set the travel range in the source memory
                    if (!creep.memory.carryAmountUpdate) {
                        if (!source.memory.travelRange || Math.random() > 0.5) {
                            let goHome = Game.map.findExit(creep.room.name, creep.memory.overlord);
                            let homeExit = creep.room.find(goHome);
                            let homeMiddle = _.round(homeExit.length / 2);
                            let distanceToExit = source.pos.getRangeTo(homeExit[homeMiddle]);
                            let roomRange = Game.map.findRoute(creep.room.name, creep.memory.overlord).length;
                            let total = distanceToExit;
                            if (roomRange > 1) total += (roomRange * 30);
                            source.memory.travelRange = total;
                        }
                        creep.memory.carryAmountUpdate = true;
                        source.memory.carryAmountNeeded = _.round((source.memory.travelRange * 1.5) * (creep.getActiveBodyparts(WORK) * HARVEST_POWER));
                    }
                    if (!creep.memory.containerID || !Game.getObjectById(creep.memory.containerID)) {
                        creep.memory.containerID = harvestDepositContainer(Game.getObjectById(creep.memory.other.source), creep);
                    }
                    //if (creep.memory.hauler && Game.time % 50 === 0 && !Game.getObjectById(creep.memory.hauler)) creep.memory.hauler = undefined;
                    if (container && container.hits) {
                        if (creep.store[RESOURCE_ENERGY] && container.hits < container.hitsMax * 0.5) return creep.repair(container);
                        if (_.sum(container.store) >= 1980) creep.idleFor(20);
                    }
                    break;
            }
        }
    }
};

function harvestDepositContainer(source, creep) {
    let container = source.pos.findClosestByRange(creep.room.structures, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.pos.getRangeTo(source) === 1});
    if (container) {
        return container.id;
    } else {
        let site = source.pos.findInRange(creep.room.constructionSites, 3, {filter: (s) => s.structureType === STRUCTURE_CONTAINER})[0];
        if (!creep.memory.siteAttempt && !site && creep.pos.getRangeTo(source) === 1 && !creep.pos.checkForWall()) {
            creep.memory.siteAttempt = true;
            creep.pos.createConstructionSite(STRUCTURE_CONTAINER);
        } else if (!site && creep.pos.checkForWall()) {
            findContainerSpot(creep.room, source.pos);
        } else if (site && site.pos.getRangeTo(source) === 1) {
            creep.memory.containerSite = site.id;
        }
    }
}

function findContainerSpot(room, position) {
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (xOff !== 0 || yOff !== 0) {
                let pos = new RoomPosition(position.x + xOff, position.y + yOff, room.name);
                if (!pos.checkForImpassible()) pos.createConstructionSite(STRUCTURE_CONTAINER);
            }
        }
    }
}