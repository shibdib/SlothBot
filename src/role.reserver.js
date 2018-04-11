/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    //if (creep.renewalCheck(4)) return creep.shibMove(Game.rooms[creep.memory.overlord].find(FIND_MY_SPAWNS)[0]);
    creep.borderCheck();
    let signs = ["Reserved Territory of an #Overlord-Bot", "#Overlord-Bot Frontier - Visit at your own risk.", "#Overlord-Bot Exclusion Zone", "#Overlord-Bot Reserved Room"];
    let hostiles = creep.findClosestEnemy();
    if (hostiles && creep.pos.getRangeTo(hostiles) <= 4) return creep.retreat();
    if (creep.hits < creep.hitsMax) return creep.goHomeAndHeal();
    if (creep.pos.roomName !== creep.memory.reservationTarget) creep.memory.destinationReached = false;
    if (creep.pos.roomName === creep.memory.reservationTarget) creep.memory.destinationReached = true;
    if (!creep.memory.destinationReached) {
        if (creep.pos.roomName === creep.memory.reservationTarget) {
            creep.memory.destinationReached = true;
        }
        creep.shibMove(new RoomPosition(25, 25, creep.memory.reservationTarget));
    } else if (creep.room.controller && !creep.room.controller.owner && (!creep.room.controller.reservation || creep.room.controller.reservation.username === USERNAME)) {
        switch (creep.reserveController(creep.room.controller)) {
            case OK:
                if (!creep.memory.signed) {
                    creep.signController(creep.room.controller, _.sample(signs));
                    creep.memory.signed = true;
                }
                let ticks;
                if (creep.room.controller.reservation) {
                    ticks = creep.room.controller.reservation['ticksToEnd'] || 0;
                } else {
                    ticks = 0;
                }
                let needReserver = Game.time + ticks - 250;
                creep.room.memory.reservationExpires = needReserver;
                break;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(creep.room.controller);
        }
    }
}

module.exports.role = profiler.registerFN(role, 'reserverRole');