module.exports.role = function (creep) {
    if (creep.pos.roomName !== creep.memory.destination) creep.memory.destinationReached = false;
    if (creep.pos.roomName === creep.memory.destination) creep.memory.destinationReached = true;
    //Initial move
    if (!creep.memory.destinationReached && !creep.memory.hauling) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination));
        if (creep.pos.roomName === creep.memory.destination) {
            creep.memory.destinationReached = true;
        }
        return;
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
            creep.memory.role = 'remoteHauler';
        }
    } else {
        if (creep.room.name !== creep.memory.overlord) {
            return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord));
        } else {
            let powerSpawn = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_POWER_SPAWN)[0];
            if (powerSpawn && powerSpawn.power < powerSpawn.powerCapacity) {
                switch (creep.transfer(powerSpawn, RESOURCE_POWER)) {
                    case OK:
                        creep.memory.hauling = undefined;
                        creep.memory.role = 'remoteHauler';
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(powerSpawn);
                        break;
                }
            } else {
                switch (creep.transfer(creep.room.storage, RESOURCE_POWER)) {
                    case OK:
                        creep.memory.hauling = undefined;
                        creep.memory.role = 'remoteHauler';
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(creep.room.storage);
                        break;
                }
            }
        }
    }
};