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
    if (creep.fleeHome()) return;
    // Check if ready to haul
    if (creep.isFull || (creep.memory.overlord === creep.pos.roomName && _.sum(creep.carry))) {
        creep.memory.source = undefined;
        if (creep.pos.roomName === creep.memory.overlord) {
            if (creep.memory.storageDestination) {
                let storageItem = Game.getObjectById(creep.memory.storageDestination);
                for (const resourceType in creep.carry) {
                    switch (creep.transfer(storageItem, resourceType)) {
                        case OK:
                            creep.memory.storageDestination = undefined;
                            if (creep.ticksToLive < 150) creep.memory.recycle = true;
                            break;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(storageItem);
                            break;
                        case ERR_FULL:
                            creep.memory.storageDestination = undefined;
                            break;
                    }
                }
            } else if (!creep.findEssentials() && !creep.findStorage() && !creep.findSpawnsExtensions()) creep.idleFor(5)
        } else {
            return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 22});
        }
    } else if (creep.room.name !== creep.memory.destination) {
        return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 22, offRoad: true});
    } else if (creep.memory.source) {
        //Suicide and cache intel if room is reserved by someone else
        if (creep.room.controller && ((creep.room.controller.reservation && creep.room.controller.reservation.username !== USERNAME) || creep.room.controller.owner)) {
            creep.room.cacheRoomIntel(true);
            return creep.memory.recycle = true;
        }
        let source = Game.getObjectById(creep.memory.source);
        switch (creep.harvest(source)) {
            case OK:
                break;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(source);
                break;
            case ERR_NOT_ENOUGH_RESOURCES:
                creep.memory.source = undefined;
        }
    } else {
        //Find Source
        let source = creep.pos.getClosestSource();
        if (source) creep.memory.source = source.id;
    }
};