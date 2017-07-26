/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    creep.cacheRoomIntel();
    if (creep.memory.reserving) {
        if (creep.reserveController(creep.room.controller) === ERR_NOT_IN_RANGE || creep.signController(creep.room.controller, "Reserved Territory of Overlords - #overlords on Slack") === ERR_NOT_IN_RANGE) {
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