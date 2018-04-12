/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    creep.borderCheck();
    creep.room.cacheRoomIntel();
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
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {allowHostile: true, offRoad: true});
        if (creep.pos.roomName === creep.memory.destination) {
            if (creep.room.controller && creep.room.controller.pos.findInRange(creep.room.structures, 1).length < 2 &&
                (!creep.room.controller.sign || creep.room.controller.sign.username !== USERNAME) && (!creep.room.controller.owner ||
                    !_.includes(FRIENDLIES, creep.room.controller.owner.username)) && (!creep.room.controller.reservation ||
                    !_.includes(FRIENDLIES, creep.room.controller.reservation.username))) {
                let signs = ["#Overlord-Bot was here.", "#Overlord-Bot has collected intel from this room. We Know."];
                switch (creep.signController(creep.room.controller, _.sample(signs))) {
                    case OK:
                        creep.memory.destinationReached = true;
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(creep.room.controller, {offRoad: true});
                }
            } else if (!creep.moveToHostileConstructionSites()) {
                creep.memory.destinationReached = true;
            }
        }
    } else {
        delete creep.memory.destination;
        delete creep.memory.targetRooms;
        delete creep.memory.destinationReached;
    }
}

module.exports.role = profiler.registerFN(role, 'explorerRole');
