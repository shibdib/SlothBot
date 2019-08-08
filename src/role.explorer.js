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
    let sayings = EXPLORER_SPAM;
    creep.say(_.sample(sayings), true);
    if (!creep.memory.destination) {
        let adjacent = Game.map.describeExits(creep.pos.roomName);
        let possibles, target;
        possibles = _.filter(adjacent, (r) => !Memory.roomCache[r] || Memory.roomCache[r].cached + 3000 < Game.time);
        if (possibles.length) {
            target = _.sample(possibles);
        } else {
            _.forEach(adjacent, function (room) {
                if ((!target || Game.time - Memory.roomCache[room].cached > Game.time - Memory.roomCache[target].cached) && Game.map.isRoomAvailable(room)) target = room;
            });
        }
        if (!Game.map.isRoomAvailable(target)) return creep.say("??");
        creep.memory.destination = target;
    }
    if (creep.memory.destinationReached !== true) {
        if (creep.pos.roomName === creep.memory.destination) {
            if (creep.room.controller && (!creep.room.controller.owner || creep.room.controller.level < 3) && (!creep.room.controller.reservation || !_.includes(FRIENDLIES, creep.room.controller.reservation.username))) {
                try {
                    if (creep.room.controller.sign && creep.room.controller.sign.username === MY_USERNAME) {
                        return creep.memory.destinationReached = true;
                    }
                } catch (e) {

                }
                let signs = EXPLORED_ROOM_SIGNS;
                if (Memory.roomCache[creep.room.name].claimValue) signs = ['AI Room Claim Value - ' + Memory.roomCache[creep.room.name].claimValue, 'Claim Value of ' + Memory.roomCache[creep.room.name].claimValue];
                if (Memory.roomCache[creep.room.name].needsCleaning) signs = ['This AI Has Marked This Room For Cleaning', 'This AI finds this room filthy, I will return to clean it'];
                if (Memory.roomCache[creep.room.name].potentialTarget) signs = ['This AI Finds This Room Interesting, We Will Return', 'This room has been marked for cleansing by an automated AI'];
                if (Memory.roomCache[creep.room.name].ncp) signs = ['You have been flagged as a NCP, please use your own code or you will be attacked.'];
                switch (creep.signController(creep.room.controller, _.sample(signs))) {
                    case OK:
                        creep.memory.destinationReached = true;
                        break;
                    case ERR_NOT_IN_RANGE:
                        if (!creep.shibMove(creep.room.controller, {offRoad: true})) creep.memory.destinationReached = true;
                }
            } else if (!creep.moveToHostileConstructionSites(true)) {
                creep.memory.destinationReached = true;
            }
        } else {
            creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {
                allowHostile: true,
                offRoad: true
            });
        }
    } else {
        creep.memory.destination = undefined;
        creep.memory.destinationReached = undefined;
    }
};