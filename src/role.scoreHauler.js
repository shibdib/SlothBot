/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.role = function (creep) {
    // Handle being spawned to gather
    if (creep.memory.destination) {
        if (creep.pos.roomName !== creep.memory.destination) creep.memory.destinationReached = false;
        if (creep.pos.roomName === creep.memory.destination) creep.memory.destinationReached = true;
        //Initial move
        if (!creep.memory.destinationReached && !_.sum(creep.store) > 0) {
            creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
        } else if (!_.sum(creep.store) > 0) {
            let score = creep.room.find(FIND_SCORE_CONTAINERS)[0];
            if (score) {
                switch (creep.withdraw(score, RESOURCE_SCORE)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(score);
                        break;
                }
            } else {
                creep.room.cacheRoomIntel(true);
                Memory.auxiliaryTargets[creep.room.name] = undefined;
                creep.memory.recycle = true;
            }
        } else {
            if (creep.pos.roomName === creep.memory.destination && !creep.room.find(FIND_SCORE_CONTAINERS)[0]) Memory.auxiliaryTargets[creep.room.name] = undefined;
            let scoreRoom = _.min(_.filter(Memory.roomCache, (r) => !Memory.auxiliaryTargets[r.name] && r.seasonCollector === 1 && (!r.user || r.user === MY_USERNAME)), 'closestRange');
            if (scoreRoom.name) creep.memory.closestRoom = scoreRoom.name; else creep.memory.closestRoom = creep.memory.closestRoom || creep.room.findClosestOwnedRoom(false, 4);
            if (creep.room.name !== creep.memory.closestRoom) {
                return creep.shibMove(new RoomPosition(25, 25, creep.memory.closestRoom), {range: 23});
            } else {
                let deliver = creep.room.find(FIND_SCORE_COLLECTORS)[0] || creep.room.storage;
                if (deliver) {
                    switch (creep.transfer(deliver, RESOURCE_SCORE)) {
                        case OK:
                            break;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(deliver);
                            break;
                    }
                }
            }
        }
    } else {
        // Handle spawning to move score from storage
        if (!creep.memory.hauling) {
            if (creep.room.name !== creep.memory.overlord) return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 23});
            let pickup = creep.room.storage;
            if (_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_SCORE])[0]) pickup = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_SCORE])[0];
            if (pickup.store[RESOURCE_SCORE]) {
                switch (creep.withdraw(pickup, RESOURCE_SCORE)) {
                    case OK:
                        creep.memory.hauling = true;
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(pickup);
                        break;
                }
            } else {
                creep.memory.recycle = true;
            }
        } else {
            let scoreRoom = _.min(_.filter(Memory.roomCache, (r) => !Memory.auxiliaryTargets[r.name] && r.seasonCollector === 1 && (!r.user || r.user === MY_USERNAME)), 'closestRange');
            if (scoreRoom.name) {
                if (creep.room.name !== scoreRoom.name) {
                    return creep.shibMove(new RoomPosition(25, 25, scoreRoom.name), {range: 23});
                } else {
                    let deliver = creep.room.find(FIND_SCORE_COLLECTORS)[0];
                    if (deliver) {
                        switch (creep.transfer(deliver, RESOURCE_SCORE)) {
                            case OK:
                                creep.memory.hauling = _.sum(creep.store) > 0;
                                break;
                            case ERR_NOT_IN_RANGE:
                                creep.shibMove(deliver);
                                break;
                        }
                    }
                }
            } else {
                creep.memory.recycle = true;
            }
        }
    }
};