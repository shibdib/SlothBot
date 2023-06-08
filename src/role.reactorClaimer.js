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
    // If you lost your claim part... die
    if (!creep.hasActiveBodyparts(CLAIM)) creep.suicide();
    //Initial move
    if (creep.pos.roomName !== creep.memory.destination) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
    } else {
        let reactor = creep.room.find(FIND_REACTORS)[0];
        if (reactor) {
            switch (creep.claimReactor(reactor)) {
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(reactor);
                    break;
                case ERR_BUSY:
                    break;
                case ERR_NOT_FOUND:
                    break;
                case ERR_INVALID_TARGET:
                    break;
                case OK:
                    creep.room.cacheRoomIntel(true);
                    creep.suicide();
            }
        }
    }
};
