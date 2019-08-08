/*
 * Copyright (c) 2019.
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
        let adjacent = Game.map.describeExits(creep.pos.roomName);
        let possibles, target;
        possibles = _.filter(adjacent, (r) => (!Memory.roomCache[r] || Memory.roomCache[r].cached + 3000 < Game.time) && Game.map.getRoomLinearDistance(creep.memory.overlord, r) <= LOCAL_SPHERE);
        if (possibles.length) {
            target = _.sample(possibles);
        } else {
            _.forEach(adjacent, function (room) {
                if ((!target || Memory.roomCache[room] && Game.time - Memory.roomCache[room].cached > Game.time - Memory.roomCache[target].cached) && Game.map.isRoomAvailable(room) && Game.map.getRoomLinearDistance(creep.memory.overlord, room) <= LOCAL_SPHERE) target = room;
            });
        }
        if (!Game.map.isRoomAvailable(target)) return creep.say("??");
        creep.memory.destination = target;
    }
    if (creep.memory.destinationReached !== true) {
        if (creep.pos.roomName === creep.memory.destination) {
            remoteManager(creep);
            if (creep.room.controller && (!creep.room.controller.sign || creep.room.controller.sign.username !== MY_USERNAME) &&
                !creep.room.controller.owner && (!creep.room.controller.reservation || !_.includes(FRIENDLIES, creep.room.controller.reservation.username))) {
                let signs = EXPLORED_ROOM_SIGNS;
                switch (creep.signController(creep.room.controller, _.sample(signs))) {
                    case OK:
                        creep.memory.destinationReached = true;
                        break;
                    case ERR_NOT_IN_RANGE:
                        if (!creep.shibMove(creep.room.controller, {offRoad: true})) creep.memory.destinationReached = true;
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
