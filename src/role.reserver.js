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
    //Initial Move
    if (creep.pos.roomName !== creep.memory.reservationTarget) return creep.shibMove(new RoomPosition(25, 25, creep.memory.reservationTarget, {range: 23}));
    //Invader detection
    if (creep.kite(5) || creep.memory.runCooldown) {
        return creep.goHomeAndHeal();
    }
    if (creep.hits < creep.hitsMax) return creep.goHomeAndHeal();
    //Reserver
    if (creep.memory.inPlace) {
        switch (creep.reserveController(creep.room.controller)) {
            case OK:
                let ticks;
                if (creep.room.controller.reservation) {
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
    } else if (creep.room.controller && !creep.room.controller.owner && (!creep.room.controller.reservation || creep.room.controller.reservation.username === MY_USERNAME)) {
        switch (creep.reserveController(creep.room.controller)) {
            case OK:
                creep.memory.inPlace = true;
                if (!creep.memory.signed) {
                    let signs = RESERVE_ROOM_SIGNS;
                    creep.signController(creep.room.controller, _.sample(signs));
                    creep.memory.signed = true;
                }
                break;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(creep.room.controller);
        }
    } else {
        creep.room.cacheRoomIntel(true);
        creep.memory.recycle = true;
    }
};