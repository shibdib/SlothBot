/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

module.exports.role = function (creep) {
    // If low TTL return home and recycle
    if (creep.ticksToLive < 75) {
        creep.memory.destination = undefined;
        return creep.recycleCreep();
    }
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
            if (!_.find(creep.room.impassibleStructures, (s) => s.structureType === STRUCTURE_POWER_BANK)) {
                Memory.auxiliaryTargets[creep.room.name] = undefined;
                creep.suicide();
            }
        }
    } else {
        creep.memory.closestRoom = creep.memory.closestRoom || findClosestOwnedRoom(creep.room.name, false, 6);
        if (creep.room.name !== creep.memory.closestRoom) {
            return creep.shibMove(new RoomPosition(25, 25, creep.memory.closestRoom), {range: 23});
        } else {
            let deliver = _.filter(creep.room.impassibleStructures, (s) => s.structureType === STRUCTURE_POWER_SPAWN && s.power < s.store.getFreeCapacity(RESOURCE_POWER))[0] || creep.room.terminal || creep.room.storage;
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