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
    //Invader detection
    if (creep.fleeHome()) return;
    // Check if ready to haul
    if (creep.isFull || (creep.memory.overlord === creep.pos.roomName && _.sum(creep.store))) {
        creep.memory.source = undefined;
        if (creep.pos.roomName === creep.memory.overlord) {
            if (creep.memory.storageDestination) {
                let storageItem = Game.getObjectById(creep.memory.storageDestination);
                for (const resourceType in creep.store) {
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
            } else {
                let storage = creep.room.storage || creep.room.terminal;
                if (storage) creep.memory.storageDestination = storage.id;
            }
        } else {
            return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 22});
        }
    } else if (creep.room.name !== creep.memory.destination) {
        return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 22, offRoad: true});
    } else if (creep.memory.deposit) {
        let deposit = Game.getObjectById(creep.memory.deposit);
        switch (creep.harvest(deposit)) {
            case OK:
                break;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(deposit);
                break;
            case ERR_NOT_ENOUGH_RESOURCES:
                creep.memory.deposit = undefined;
        }
    } else {
        //Find Source
        let deposit = creep.room.deposits;
        if (deposit) creep.memory.deposit = deposit.id; else creep.memory.recycle = true;
    }
};