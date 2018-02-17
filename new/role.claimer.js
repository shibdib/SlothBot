/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    //Initial move
    if (!Game.flags[creep.memory.destination]) {
        creep.suicide();
    }
    if (!creep.memory.destinationReached) {
        let destination = new RoomPosition(25, 25, creep.memory.destination);
        creep.shibMove(destination);
        if (creep.pos.getRangeTo(destination) <= 10) {
            creep.memory.destinationReached = true;
        }
    } else {
        if (creep.room.controller) {
            if (creep.claimController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                creep.shibMove(creep.room.controller);
            }
        }
    }
}

module.exports.role = profiler.registerFN(role, 'claimerRole');
