/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
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
        // Build container
        if (!creep.memory.containerID && creep.store[RESOURCE_ENERGY]) {
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
                // Handle container
                let container = Game.getObjectById(creep.memory.containerID) || Game.getObjectById(creep.memory.containerSite);
                if (container && container.hits) {
                    if (creep.store[RESOURCE_ENERGY] && container.hits < container.hitsMax * 0.5) return creep.repair(container);
                    if (_.sum(container.store) >= 1980) {
                        if (creep.memory.assignedHauler && !Game.getObjectById(creep.memory.assignedHauler)) creep.memory.assignedHauler = undefined;
                        creep.idleFor(20);
                    } else if (_.sum(container.store) >= CONTAINER_CAPACITY * 0.75 && container.hits < container.hitsMax) creep.repair(container);
                    else if (_.sum(container.store) >= CONTAINER_CAPACITY) creep.idleFor(20);
                    creep.memory.energyAmount = _.sum(container.store);
                    creep.memory.energyId = container.id;
                } else {
                    let dropped = creep.pos.lookFor(LOOK_RESOURCES)[0];
                    if (dropped) {
                        creep.memory.energyAmount = dropped.amount;
                        creep.memory.energyId = dropped.id;
                    }
                }
                break;
        }
    } else {
        // Suicide and cache intel if room is reserved/owned by someone else
        if (creep.room.controller && (creep.room.controller.reservation && creep.room.controller.reservation.username !== MY_USERNAME)) {
            creep.room.cacheRoomIntel(true, creep);
            return creep.suicide();
        }
        // Harvest
        let source = Game.getObjectById(creep.memory.other.source);
        if (source) {
            let container = Game.getObjectById(creep.memory.containerID) || Game.getObjectById(creep.memory.containerSite);
            // Make sure you're on the container
            if (container) {
                if (creep.pos.getRangeTo(container) > 0) {
                    return creep.shibMove(container, {range: 0});
                } else {
                    // Add a check for walls
                    INTEL[creep.room.name].obstacles = _.filter(creep.room.impassibleStructures, (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART).length > 0;
                    creep.memory.onContainer = true;
                }
            } else if (!creep.pos.isNearTo(source)) {
                return creep.shibMove(source);
            } else {
                switch (creep.harvest(source)) {
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(source);
                        break;
                    case ERR_NOT_ENOUGH_RESOURCES:
                        creep.idleFor(source.ticksToRegeneration + 1);
                        break;
                    case OK:
                        if (!creep.memory.containerID || !Game.getObjectById(creep.memory.containerID)) {
                            creep.memory.containerID = harvestDepositContainer(Game.getObjectById(creep.memory.other.source), creep);
                        }
                        break;
                }
            }
        } else if (creep.memory.destination && creep.room.name !== creep.memory.destination) {
            creep.shibMove(new RoomPosition(25, 25, creep.memory.destination, {range: 23}));
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