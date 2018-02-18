/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    creep.room.cacheRoomIntel();
    if (!Game.map.describeExits(creep.pos.roomName)) creep.suicide();
    if (!creep.memory.targetRooms || !creep.memory.destination) {
        creep.memory.targetRooms = Game.map.describeExits(creep.pos.roomName);
        let target = _.sample(creep.memory.targetRooms);
        if (Game.map.isRoomAvailable(target)) {
            creep.memory.destination = target;
        } else {
            return;
        }
    }
    if (creep.memory.destinationReached !== true) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {allowHostile: true});
        if (creep.pos.roomName === creep.memory.destination) {
            creep.memory.destinationReached = true;
        }
    } else {
        creep.room.cacheRoomIntel();
        creep.memory.destination = undefined;
        creep.memory.targetRooms = undefined;
        creep.memory.destinationReached = undefined;
    }
}

module.exports.role = profiler.registerFN(role, 'explorerRole');
