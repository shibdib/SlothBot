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
    if (creep.tryToBoost(['dismantle'])) return;
    if (creep.memory.destination) {
        if (creep.room.name !== creep.memory.destination) return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination));
        if (Memory.auxiliaryTargets[creep.memory.destination] && Memory.auxiliaryTargets[creep.memory.destination].type === 'scoreCleaner') {
            let collector = creep.room.find(FIND_SCORE_COLLECTORS)[0];
            Memory.auxiliaryTargets[creep.memory.destination].guard = creep.room.hostileCreeps.length > 0;
            if (creep.memory.attackCollector) return creep.shibMove(collector, {tunnel: true, ignoreCreeps: false});
            if (!collector.pos.findClosestByPath(FIND_EXIT)) {
                creep.memory.attackCollector = true;
            } else {
                Memory.auxiliaryTargets[creep.memory.destination] = undefined;
                creep.room.cacheRoomIntel(true);
            }
        } else {
            if (!creep.scorchedEarth()) {
                creep.room.cacheRoomIntel(true);
                creep.memory.recycle = true;
            }
        }
    }
};
