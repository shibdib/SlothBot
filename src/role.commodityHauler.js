/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.role = function (creep) {
    if (creep.pos.roomName !== creep.memory.destination) creep.memory.destinationReached = false;
    if (creep.pos.roomName === creep.memory.destination) creep.memory.destinationReached = true;
    creep.memory.hauling = creep.isFull || !Memory.auxiliaryTargets[creep.memory.destination] || creep.memory.ticksToLive < 200;
    //Initial move
    if (!creep.memory.destinationReached && !creep.memory.hauling) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
    } else if (!creep.memory.hauling) {
        let dropped = creep.room.find(FIND_DROPPED_RESOURCES)[0];
        if (dropped) {
            switch (creep.pickup(dropped)) {
                case OK:
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(dropped);
                    break;
            }
        } else {
            let miner = _.filter(creep.room.creeps, (c) => c.my && c.memory.role === 'commodityMiner' && _.sum(c.store))[0];
            if (miner) {
                for (let resourceType in miner.store) {
                    switch (miner.transfer(creep, resourceType)) {
                        case OK:
                            break;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(miner);
                            break;
                    }
                }
            } else {
                creep.idleFor(15);
            }
        }
    } else if (creep.room.name !== creep.memory.overlord) {
        return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 23});
    } else {
        let deliver = creep.room.terminal || creep.room.storage;
        if (deliver) {
            for (let resourceType in creep.store) {
                switch (creep.transfer(deliver, resourceType)) {
                    case OK:
                        creep.memory.hauling = undefined;
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(deliver);
                        break;
                }
            }
        }
    }
};