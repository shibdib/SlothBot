/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    //Invader detection
    if (creep.fleeHome()) return;
    //Initial Move
    if (creep.pos.roomName !== creep.memory.reservationTarget) return creep.shibMove(new RoomPosition(25, 25, creep.memory.reservationTarget, {range: 23}));
    //Reserver
    if (creep.memory.inPlace) {
        if (creep.ticksToLive <= 3) {
            let ticks;
            if (creep.room.controller.reservation) {
                ticks = creep.room.controller.reservation['ticksToEnd'] || 0;
            } else {
                ticks = 0;
            }
            creep.room.memory.reservationExpires = Game.time + ticks - 1000;
        } else {
            switch (creep.reserveController(creep.room.controller)) {
                case OK:
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(creep.room.controller);
            }
        }
        return;
    } else if (creep.room.controller && !creep.room.controller.owner && (!creep.room.controller.reservation || creep.room.controller.reservation.username === USERNAME)) {
        switch (creep.reserveController(creep.room.controller)) {
            case OK:
                creep.memory.inPlace = true;
                if (!creep.memory.signed) {
                    let signs = RESERVE_ROOM_SIGNS;
                    creep.signController(creep.room.controller, _.sample(signs));
                    creep.memory.signed = true;
                }
                break;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(creep.room.controller);
        }
    } else {
        creep.room.cacheRoomIntel(true);
        creep.memory.recycle = true;
    }
};