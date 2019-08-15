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
    //Invader detection
    if (creep.kite(5)) {
        creep.memory.onContainer = undefined;
        return true;
    }
    if (creep.hits < creep.hitsMax) return creep.goHomeAndHeal();
    // If you're in place just harvest
    if (creep.memory.onContainer) {
        let source = Game.getObjectById(creep.memory.source);
        let container = Game.getObjectById(creep.memory.containerID);
        switch (creep.harvest(source)) {
            case ERR_NOT_IN_RANGE:
                creep.shibMove(source);
                break;
            case ERR_NOT_ENOUGH_RESOURCES:
                creep.idleFor(source.ticksToRegeneration + 1);
                break;
            case OK:
                if (creep.memory.hauler && Game.time % 50 === 0 && !Game.getObjectById(creep.memory.hauler)) creep.memory.hauler = undefined;
                if (creep.memory.containerID) {
                    if (creep.carry[RESOURCE_ENERGY] && container.hits < container.hitsMax * 0.5) return creep.repair(container);
                    if (_.sum(container.store) >= 1980) creep.idleFor(20);
                }
                break;
        }
    } else {
        //Set destination reached
        creep.memory.destinationReached = creep.pos.roomName === creep.memory.destination;
        //Initial move
        if (!creep.memory.destinationReached) {
            creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
        } else {
            //Suicide and cache intel if room is reserved/owned by someone else
            if (creep.room.controller && ((creep.room.controller.reservation && creep.room.controller.reservation.username !== MY_USERNAME) || creep.room.controller.owner)) {
                creep.room.cacheRoomIntel(true);
                return creep.memory.recycle = true;
            }
            //If source is set mine
            if (!creep.memory.source) creep.findSource();
        }
        //Harvest
        if (creep.memory.source) {
            if (!creep.memory.containerID || !Game.getObjectById(creep.memory.containerID)) {
                creep.memory.containerID = harvestDepositContainer(Game.getObjectById(creep.memory.source), creep);
            }
            let container = Game.getObjectById(creep.memory.containerID) || Game.getObjectById(creep.memory.containerSite);
            //Make sure you're on the container
            if (!creep.memory.onContainer) {
                if (container && creep.pos.getRangeTo(container) > 0) {
                    return creep.shibMove(container, {range: 0});
                } else if (container) {
                    creep.memory.onContainer = true;
                }
            }
            let source = Game.getObjectById(creep.memory.source);
            switch (creep.harvest(source)) {
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(source);
                    break;
                case ERR_NOT_ENOUGH_RESOURCES:
                    creep.idleFor(source.ticksToRegeneration + 1);
                    break;
                case OK:
                    if (creep.memory.hauler && Game.time % 50 === 0 && !Game.getObjectById(creep.memory.hauler)) creep.memory.hauler = undefined;
                    if (creep.memory.containerID) {
                        if (creep.carry[RESOURCE_ENERGY] && container.hits < container.hitsMax * 0.5) return creep.repair(container);
                        if (_.sum(container.store) >= 1980) creep.idleFor(20);
                    }
                    break;
            }
        }
    }
};

function harvestDepositContainer(source, creep) {
    switch (creep.harvest(Game.getObjectById(creep.memory.source))) {
        case OK:
            let container = source.pos.findClosestByRange(creep.room.structures, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.pos.getRangeTo(source) === 1});
            if (container) {
                Memory.roomCache[creep.room.name].builderRequested = undefined;
                return container.id;
            } else {
                let site = source.pos.findInRange(creep.room.constructionSites, 3, {filter: (s) => s.structureType === STRUCTURE_CONTAINER})[0];
                if (!site && creep.pos.getRangeTo(source) === 1 && !creep.pos.checkForWall()) {
                    creep.pos.createConstructionSite(STRUCTURE_CONTAINER);
                } else if (!site && creep.pos.checkForWall()) {
                    findContainerSpot(creep.room, source.pos);
                } else if (site && site.pos.getRangeTo(source) === 1) {
                    Memory.roomCache[creep.room.name].builderRequested = true;
                    creep.memory.containerSite = site.id;
                    if (creep.carry[RESOURCE_ENERGY] && creep.memory.containerSite) {
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
                }
            }
            break;
        case ERR_NOT_IN_RANGE:
            creep.shibMove(Game.getObjectById(creep.memory.source));
            break;
        case ERR_NOT_ENOUGH_RESOURCES:
            creep.idleFor(Game.getObjectById(creep.memory.source).ticksToRegeneration + 1)
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