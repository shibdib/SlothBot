/*
 * Copyright (c) 2018.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    creep.borderCheck();
    creep.room.cacheRoomIntel();
    let sayings = ['Dont Mind Me', 'Beep Beep', 'Just Saying Hi', 'o/', ':D', ':)'];
    creep.say(_.sample(sayings), true);
    if (!creep.memory.destination) {
        let adjacent = Game.map.describeExits(creep.pos.roomName);
        let target = _.sample(adjacent);
        if (!Game.map.isRoomAvailable(target) || Game.map.getRoomLinearDistance(target, creep.memory.overlord) > 4) return creep.say("??");
        creep.memory.destination = target;
    }
    if (creep.memory.destinationReached !== true) {
        if (creep.pos.roomName === creep.memory.destination) {
            if (creep.room.controller && (!creep.room.controller.sign || creep.room.controller.sign.username !== USERNAME) &&
                !creep.room.controller.owner && (!creep.room.controller.reservation || !_.includes(FRIENDLIES, creep.room.controller.reservation.username))) {
                let signs = EXPLORED_ROOM_SIGNS;
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
        } else {
            creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {
                allowHostile: true,
                offRoad: true,
                range: 23
            });
        }
    } else {
        creep.memory.destination = undefined;
        creep.memory.destinationReached = undefined;
    }
}

module.exports.role = profiler.registerFN(role, 'explorerRole');
