/*
 * Copyright (c) 2018.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    creep.room.cacheRoomIntel();
    creep.room.invaderCheck();
    let sayings = [creep.memory.overlord, 'PROXIMITY', 'INTRUSION', 'SENSOR'];
    let word = Game.time % sayings.length;
    creep.say(sayings[word], true);
    if (!creep.memory.destination) {
        let remotes = Game.rooms[creep.memory.overlord].memory.remoteRooms;
        creep.memory.destination = _.sample(remotes);
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
                offRoad: true,
                range: 23
            });
        }
    } else {
        creep.memory.destination = undefined;
        creep.memory.destinationReached = undefined;
    }
};
