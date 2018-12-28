module.exports.role = function (creep) {
    if (creep.pos.roomName !== creep.memory.destination) creep.memory.destinationReached = false;
    if (creep.pos.roomName === creep.memory.destination) creep.memory.destinationReached = true;
    //Initial move
    if (!creep.memory.destinationReached) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination));
        if (creep.pos.roomName === creep.memory.destination) {
            creep.memory.destinationReached = true;
        }
        return null;
    } else {
        if (creep.hits < creep.hitsMax) return;
        if (creep.memory.powerBank) {
            let powerBank = Game.getObjectById(creep.memory.powerBank);
            switch (creep.attack(powerBank)) {
                case OK:
                    Game.rooms[creep.memory.overlord].memory.powerRooms[creep.room.name].hits = powerBank.hits;
                    Game.rooms[creep.memory.overlord].memory.powerRooms[creep.room.name].decayOn = powerBank.ticksToDecay + Game.time;
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
                delete Game.rooms[creep.memory.overlord].memory.powerRooms[creep.room.name];
                creep.idleFor(25);
            }
        }
    }
};