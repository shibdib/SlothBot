/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    //Check if claim clear op
    if (creep.memory.operation === 'claimClear') return creep.claimClear();
    //Initial move
    if (!creep.memory.destinationReached) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 17});
        if (creep.pos.roomName === creep.memory.destination) creep.memory.destinationReached = true;
    } else {
        if (creep.pos.roomName !== creep.memory.destination) delete creep.memory.destinationReached;
        creep.room.cacheRoomIntel();
        if (creep.room.controller) {
            if (!creep.memory.signed) {
                switch (creep.signController(creep.room.controller, "#Overlord-Bot Hive")) {
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(creep.room.controller);
                        break;
                    case OK:
                        creep.memory.signed = true;
                }
            } else {
                switch (creep.claimController(creep.room.controller)) {
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(creep.room.controller);
                        break;
                    case ERR_BUSY:
                        break;
                    case ERR_NOT_FOUND:
                        break;
                    case ERR_INVALID_TARGET:
                        break;
                    case OK:
                        Game.rooms[creep.memory.overlord].memory.claimTarget = undefined;
                        cleanRoom(creep.room, creep.room.structures)
                }
            }
        }
    }
};

function cleanRoom(room, structures) {
    for (let key in structures) {
        if (structures[key] && structures[key].owner && !structures[key].my) {
            structures[key].destroy();
        }
    }
}
