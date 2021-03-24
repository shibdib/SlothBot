/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.role = function (creep) {
    creep.memory.hauling = _.sum(creep.store) > 0;
    creep.say(ICONS.santa, true);
    let container = creep.room.find(FIND_SYMBOL_CONTAINERS)[0];
    if (!creep.memory.hauling && container) {
        switch (creep.withdraw(container, container.resourceType)) {
            case ERR_NOT_IN_RANGE:
                creep.shibMove(container);
        }
    } else if (creep.memory.hauling) {
        if (!creep.memory.closestRoom) {
            if (creep.room.decoder && creep.store[creep.room.decoder.resourceType]) creep.memory.closestRoom = creep.room.name;
            else {
                let scoreRoom = _.min(_.filter(Memory.roomCache, (r) => r.seasonDecoder && creep.store[r.seasonDecoder] && r.owner && _.includes(FRIENDLIES, r.owner) && Game.map.getRoomLinearDistance(r.name, creep.room.name) <= (creep.ticksToLive / 55) && r.level >= SEASON_RCL_CUTOFF), 'closestRange');
                if (scoreRoom.name) creep.memory.closestRoom = scoreRoom.name; else creep.memory.closestRoom = creep.memory.closestRoom || creep.room.findClosestOwnedRoom(false, 4);
            }
        } else if (creep.room.name !== creep.memory.closestRoom) {
            return creep.shibMove(new RoomPosition(25, 25, creep.memory.closestRoom), {range: 23});
        } else {
            let deliver = creep.room.terminal || creep.room.storage;
            if (creep.room.decoder && creep.store[creep.room.decoder.resourceType]) deliver = creep.room.decoder;
            for (const resourceType in creep.store) {
                if (deliver) {
                    switch (creep.transfer(deliver, resourceType)) {
                        case OK:
                            break;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(deliver);
                            break;
                    }
                }
            }
        }
    } else
        // Handle being spawned to gather
    if (creep.memory.destination) {
        //Initial move
        if (creep.pos.roomName !== creep.memory.destination && !creep.memory.hauling) {
            creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
        } else if (!creep.memory.hauling && !container) {
            creep.room.cacheRoomIntel(true);
            Memory.auxiliaryTargets[creep.room.name] = undefined;
            creep.memory.destination = undefined;
        }
    } else {
        // Handle spawning to move score from storage
        if (!creep.memory.hauling) {
            if (creep.room.name !== creep.memory.overlord) {
                return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 23});
            } else {
                let pickup = _.filter(creep.room.structures, (s) => s.store && s.store[creep.memory.other.resourceType])[0];
                if (pickup) {
                    switch (creep.withdraw(pickup, creep.memory.other.resourceType)) {
                        case OK:
                            creep.memory.closestRoom = undefined;
                            break;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(pickup);
                            break;
                    }
                }
            }
        }
    }
};