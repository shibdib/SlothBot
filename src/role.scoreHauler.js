/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.role = function (creep) {
    creep.memory.hauling = _.sum(creep.store) > 0;
    // Handle being spawned to gather
    if (creep.memory.destination) {
        //Initial move
        if (creep.pos.roomName !== creep.memory.destination && !creep.memory.hauling) {
            creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
        } else if (!creep.memory.hauling) {
            let score = creep.room.find(FIND_SCORE_CONTAINERS)[0];
            if (score) {
                switch (creep.withdraw(score, RESOURCE_SCORE)) {
                    case OK:
                        creep.memory.closestRoom = undefined;
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
            if (!creep.memory.closestRoom) {
                let scoreRoom = _.min(_.filter(Memory.roomCache, (r) => r.seasonCollector === 1 && Game.map.getRoomLinearDistance(r.name, creep.room.name) <= (creep.ticksToLive / 55) && !r.hostile), 'closestRange');
                if (scoreRoom.name) creep.memory.closestRoom = scoreRoom.name; else creep.memory.closestRoom = creep.memory.closestRoom || creep.room.findClosestOwnedRoom(false, 4);
            } else if (creep.room.name !== creep.memory.closestRoom) {
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
            if (creep.room.name !== creep.memory.overlord) {
                if (!creep.memory.scoreSearch) {
                    let dropped = _.filter(creep.room.droppedResources, (r) => r.resourceType === RESOURCE_SCORE)[0];
                    let tomb = _.filter(creep.room.tombstones, (r) => r.store[RESOURCE_SCORE])[0];
                    let score = creep.room.find(FIND_SCORE_CONTAINERS)[0];
                    if (dropped && creep.pickup(dropped) === ERR_NOT_IN_RANGE) return creep.shibMove(dropped);
                    else if (tomb && creep.withdraw(tomb) === ERR_NOT_IN_RANGE) return creep.shibMove(tomb);
                    else if (score && creep.withdraw(score) === ERR_NOT_IN_RANGE) return creep.shibMove(score);
                    creep.memory.scoreSearch = true;
                } else {
                    return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 23});
                }
            } else {
                let pickup = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_SCORE])[0] || creep.room.storage;
                if (pickup.store[RESOURCE_SCORE]) {
                    switch (creep.withdraw(pickup, RESOURCE_SCORE)) {
                        case OK:
                            creep.memory.closestRoom = undefined;
                            creep.memory.hauling = true;
                            break;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(pickup);
                            break;
                    }
                } else {
                    creep.memory.recycle = true;
                }
            }
        } else {
            if (!creep.memory.closestRoom) {
                let scoreRoom = _.min(_.filter(Memory.roomCache, (r) => r.seasonCollector === 1 && Game.map.getRoomLinearDistance(r.name, creep.room.name) <= (creep.ticksToLive / 55) && !r.hostile), 'closestRange');
                if (scoreRoom.name) creep.memory.closestRoom = scoreRoom.name;
            } else if (creep.room.name !== creep.memory.closestRoom) {
                return creep.shibMove(new RoomPosition(25, 25, creep.memory.closestRoom), {range: 23});
            } else {
                let deliver = creep.room.find(FIND_SCORE_COLLECTORS)[0];
                if (deliver) {
                    switch (creep.transfer(deliver, RESOURCE_SCORE)) {
                        case OK:
                            creep.memory.scoreSearch = undefined;
                            break;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(deliver);
                            break;
                    }
                }
            }
        }
    }
};