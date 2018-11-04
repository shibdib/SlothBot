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
        if (!creep.memory.remotes) creep.memory.remotes = JSON.stringify(Game.rooms[creep.memory.overlord].memory.remoteRooms);
        let remotes = JSON.parse(creep.memory.remotes);
        creep.memory.destination = _.sample(remotes);
    }
    if (creep.memory.destinationReached !== true) {
        if (creep.pos.roomName === creep.memory.destination) {
            remoteManager(creep);
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

function remoteManager(creep) {
    // Remove remote if reserved by someone else
    if (creep.room.controller && creep.room.controller.reservation && creep.room.controller.reservation.username !== MY_USERNAME) Game.rooms[creep.memory.overlord].memory.remoteRooms = _.filter(Game.rooms[creep.memory.overlord].memory.remoteRooms, (r) => r !== creep.room.name);
    // Remove remote if owned by someone else
    if (creep.room.controller && creep.room.controller.owner && creep.room.controller.owner.username !== MY_USERNAME) Game.rooms[creep.memory.overlord].memory.remoteRooms = _.filter(Game.rooms[creep.memory.overlord].memory.remoteRooms, (r) => r !== creep.room.name);
}
