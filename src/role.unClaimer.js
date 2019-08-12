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
    if (creep.room.name !== creep.memory.targetRoom) return creep.shibMove(new RoomPosition(25, 25, creep.memory.targetRoom), {range: 22});
    if (creep.room.controller.upgradeBlocked > creep.ticksToLive) creep.memory.recycle = true;
    if (creep.room.controller && (creep.room.controller.owner || creep.room.controller.reservation)) {
        switch (creep.attackController(creep.room.controller)) {
            case OK:
                if (!creep.memory.signed) {
                    let signs = ATTACK_ROOM_SIGNS;
                    creep.signController(creep.room.controller, _.sample(signs));
                    creep.memory.signed = true;
                }
                break;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(creep.room.controller, {range: 1});
                break;
        }
    } else if (creep.room.controller) {
        switch (creep.reserveController(creep.room.controller)) {
            case OK:
                if (!creep.memory.signed) {
                    let signs = ATTACK_ROOM_SIGNS;
                    creep.signController(creep.room.controller, _.sample(signs));
                    creep.memory.signed = true;
                }
                break;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(creep.room.controller, {range: 1});
                break;
        }
    }
};