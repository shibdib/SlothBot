/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    if (creep.room.invaderCheck() || creep.hits < creep.hitsMax) return creep.goHomeAndHeal();
    if (creep.pos.roomName !== creep.memory.reservationTarget) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.reservationTarget, {range: 23}));
    } else if (creep.room.controller && !creep.room.controller.owner && (!creep.room.controller.reservation || creep.room.controller.reservation.username === USERNAME)) {
        switch (creep.reserveController(creep.room.controller)) {
            case OK:
                if (!creep.memory.signed) {
                    let signs = RESERVE_ROOM_SIGNS;
                    creep.signController(creep.room.controller, _.sample(signs));
                    creep.memory.signed = true;
                }
                if (creep.ticksToLive <= 50) {
                    let ticks;
                    if (creep.room.controller.reservation) {
                        ticks = creep.room.controller.reservation['ticksToEnd'] || 0;
                    } else {
                        ticks = 0;
                    }
                    creep.room.memory.reservationExpires = Game.time + ticks - 1000;
                }
                break;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(creep.room.controller);
        }
    }
}

module.exports.role = profiler.registerFN(role, 'reserverRole');