/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.role = function (creep) {
    if (creep.pos.roomName !== creep.memory.destination) creep.memory.destinationReached = false;
    if (creep.pos.roomName === creep.memory.destination) creep.memory.destinationReached = true;
    //Initial move
    if (!creep.memory.destinationReached && !creep.memory.hauling) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
    } else if (!creep.memory.hauling) {
        let power = creep.room.find(FIND_DROPPED_RESOURCES, {filter: (r) => r.resourceType === RESOURCE_POWER})[0];
        if (power) {
            switch (creep.pickup(power)) {
                case OK:
                    creep.memory.hauling = true;
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(power);
                    break;
            }
        } else {
            Memory.auxiliaryTargets[creep.room.name] = undefined;
            creep.memory.recycle = true;
        }
    } else {
        if (creep.room.name !== creep.memory.overlord) {
            return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 23});
        } else {
            let deliver = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_POWER_SPAWN && s.power < s.store.getFreeCapacity(RESOURCE_POWER))[0] || creep.room.terminal || creep.room.storage;
            if (deliver) {
                switch (creep.transfer(deliver, RESOURCE_POWER)) {
                    case OK:
                        creep.memory.hauling = _.sum(creep.store) > 0;
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(deliver);
                        break;
                }
            }
        }
    }
};