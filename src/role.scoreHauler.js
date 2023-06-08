/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.role = function (creep) {
    creep.memory.hauling = _.sum(creep.store) > 0;
    creep.say(ICONS.santa, true);
    let thorium = _.find(creep.room.structures, (s) => s && s.store && s.store[RESOURCE_THORIUM]);
    if (!creep.memory.hauling && thorium) {
        switch (creep.withdraw(thorium, RESOURCE_THORIUM)) {
            case ERR_NOT_IN_RANGE:
                creep.shibMove(thorium);
        }
    } else if (creep.memory.hauling) {
        if (!creep.memory.closestRoom) {
            let scoreRoom = _.min(_.filter(Memory.roomCache, (r) => r.seasonReactor && r.seasonReactorOwner === MY_USERNAME && Game.map.getRoomLinearDistance(r.name, creep.room.name) <= (creep.ticksToLive / 55) && !r.hostile && !_.includes(Memory.nonCombatRooms, r.name)), 'closestRange');
            if (scoreRoom.name) creep.memory.closestRoom = scoreRoom.name; else creep.idleFor(15);
        } else if (creep.room.name !== creep.memory.closestRoom) {
            return creep.shibMove(new RoomPosition(25, 25, creep.memory.closestRoom), {range: 23});
        } else {
            let deliver = creep.room.find(FIND_REACTORS)[0] || creep.room.terminal || creep.room.storage;
            if (deliver) {
                switch (creep.transfer(deliver, RESOURCE_THORIUM)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(deliver);
                        break;
                }
            }
        }
    } else {
        creep.suicide();
    }
};