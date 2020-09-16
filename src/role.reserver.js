/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    //Invader detection
    if (creep.fleeHome()) return;
    //Initial Move
    if (creep.pos.roomName !== creep.memory.destination) return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination, {range: 23}));
    //Reserver
    if (creep.memory.inPlace) {
        if (!creep.room.controller.reservation || creep.room.controller.reservation.username === MY_USERNAME) {
            switch (creep.reserveController(creep.room.controller)) {
                case OK:
                    if (!creep.memory.signed) {
                        let signs = RESERVE_ROOM_SIGNS;
                        creep.signController(creep.room.controller, _.sample(signs));
                        creep.memory.signed = true;
                    }
                    let ticks;
                    if (creep.room.controller.reservation && creep.room.controller.reservation.username === MY_USERNAME) {
                        ticks = creep.room.controller.reservation['ticksToEnd'] || 0;
                    } else {
                        ticks = 0;
                    }
                    Memory.roomCache[creep.room.name].reservationExpires = Game.time + ticks - 2000;
                    if (!Memory.roomCache[creep.room.name].reserverCap) Memory.roomCache[creep.room.name].reserverCap = creep.room.controller.pos.countOpenTerrainAround();
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(creep.room.controller);
            }
        } else if (creep.room.controller.reservation) {
            switch (creep.attackController(creep.room.controller)) {
                case OK:
                    if (!creep.memory.signed) {
                        let signs = RESERVE_ROOM_SIGNS;
                        creep.signController(creep.room.controller, _.sample(signs));
                        creep.memory.signed = true;
                    }
                    if (!Memory.roomCache[creep.room.name].reserverCap) Memory.roomCache[creep.room.name].reserverCap = creep.room.controller.pos.countOpenTerrainAround();
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(creep.room.controller);
            }
        }
    } else {
        if (!creep.pos.isNearTo(creep.room.controller)) creep.shibMove(creep.room.controller); else creep.memory.inPlace = true;
    }
};