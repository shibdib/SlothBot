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
    //Reserver
    if (creep.memory.inPlace) {
        if (!creep.room.controller.reservation || creep.room.controller.reservation.username === MY_USERNAME) {
            switch (creep.reserveController(creep.room.controller)) {
                case OK:
                    creep.memory.other.stationary = true;
                    if (!creep.memory.signed) {
                        let signs = RESERVE_ROOM_SIGNS;
                        creep.signController(creep.room.controller, _.sample(signs));
                        creep.memory.signed = true;
                        if (!Memory.roomCache[creep.room.name].reserverCap) Memory.roomCache[creep.room.name].reserverCap = creep.room.controller.pos.countOpenTerrainAround();
                    }
                    let ticks;
                    if (creep.room.controller.reservation && creep.room.controller.reservation.username === MY_USERNAME) {
                        ticks = creep.room.controller.reservation['ticksToEnd'] || 0;
                    } else {
                        ticks = 0;
                    }
                    Memory.roomCache[creep.room.name].reservationExpires = Game.time + ticks - 2000;
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(creep.room.controller);
            }
        } else if (creep.room.controller.reservation) {
            switch (creep.attackController(creep.room.controller)) {
                case OK:
                    creep.memory.other.stationary = true;
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
        //Initial Move
        if (creep.pos.roomName !== creep.memory.destination) {
            if (creep.room.routeSafe(creep.memory.destination)) {
                return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination, {range: 23}));
            } else {
                return creep.goToHub();
            }
        }
        if (!creep.pos.isNearTo(creep.room.controller)) creep.shibMove(creep.room.controller); else creep.memory.inPlace = true;
    }
};