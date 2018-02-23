/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    //if (creep.renewalCheck(4)) return creep.shibMove(Game.rooms[creep.memory.overlord].find(FIND_MY_SPAWNS)[0]);
    let signs = ["Reserved Territory of Overlords - #overlords on Slack", "Overlords Frontier - Visit at your own risk.", "Join Overlords! #overlords", "Overlords Reserved Room"];
    //Invader detection
    creep.room.invaderCheck();
    let hostiles = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (hostiles && creep.pos.getRangeTo(hostiles) <= 5) return creep.retreat();
    if (creep.hits < creep.hitsMax) return creep.goHomeAndHeal();
    if (creep.pos.roomName !== creep.memory.destination) creep.memory.destinationReached = false;
    if (creep.pos.roomName === creep.memory.destination) creep.memory.destinationReached = true;
    if (creep.room.controller.reservation)creep.room.memory.reservationExpires = Game.time + creep.room.controller.reservation['ticksToEnd'];
    creep.room.cacheRoomIntel();
    if (creep.memory.reserving) {
        switch (creep.reserveController(creep.room.controller)) {
            case OK:
                if (!creep.memory.signed) {
                    creep.signController(creep.room.controller, _.sample(signs));
                    creep.memory.signed = true;
                }
                break;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(creep.room.controller);
        }
    } else if (!creep.memory.destinationReached) {
        if (creep.pos.roomName === creep.memory.reservationTarget) {
            creep.memory.destinationReached = true;
        }
        creep.shibMove(new RoomPosition(25, 25, creep.memory.reservationTarget));
    } else {
        if (creep.room.controller && !creep.room.controller.owner && (!creep.room.controller.reservation || creep.room.controller.reservation['username'] === 'Shibdib')) {
            creep.shibMove(creep.room.controller);
            creep.memory.reserving = true;
        }
    }
}

module.exports.role = profiler.registerFN(role, 'reserverRole');