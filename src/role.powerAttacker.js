/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.role = function (creep) {
    creep.memory.destinationReached = creep.pos.roomName === creep.memory.destination;
    if (!Memory.targetRooms[creep.memory.destination]) creep.memory.recycle = true;
    //Initial move
    if (!creep.memory.destinationReached) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
    } else {
        if (!creep.getActiveBodyparts(ATTACK) || creep.hits < creep.hitsMax * 0.25) return;
        if (creep.memory.powerBank) {
            let powerBank = Game.getObjectById(creep.memory.powerBank);
            if (powerBank.hits < 250000) Memory.targetRooms[creep.room.name].hauler = powerBank.power / 1250;
            if (!powerBank) {
                Memory.targetRooms[creep.room.name].complete = true;
                if (!creep.room.find(FIND_DROPPED_RESOURCES, {filter: (r) => r.resourceType === RESOURCE_POWER})[0]) Memory.targetRooms[creep.room.name] = undefined;
            }
            switch (creep.attack(powerBank)) {
                case OK:
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(powerBank);
                    break;
            }
        } else {
            let powerBank = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_POWER_BANK)[0];
            if (powerBank) {
                creep.memory.powerBank = powerBank.id;
            } else {
                console.log('PC ' + roomLink(creep.room.name))
                //creep.memory.recycle = true;
            }
        }
    }
};