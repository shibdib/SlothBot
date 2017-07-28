/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    creep.cacheRoomIntel();
    if (!Game.map.describeExits(creep.pos.roomName)) creep.suicide();
    if (!creep.memory.targetRooms || !creep.memory.destination) {
        creep.memory.targetRooms = Game.map.describeExits(creep.pos.roomName);
        creep.memory.destination = _.sample(creep.memory.targetRooms);
    }
    if (creep.memory.destinationReached !== true) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {allowHostile: true});
        if (creep.pos.roomName === creep.memory.destination) {
            creep.memory.destinationReached = true;
        }
    } else {
        creep.cacheRoomIntel();
        creep.memory.destination = undefined;
        creep.memory.targetRooms = undefined;
        creep.memory.destinationReached = undefined;
    }
}

module.exports.role = profiler.registerFN(role, 'explorerRole');
