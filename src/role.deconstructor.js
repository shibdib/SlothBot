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
    if (creep.memory.barrierClearing) return barrierCleaning(creep);
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

function barrierCleaning(creep) {
    let barrier = Game.getObjectById(creep.memory.barrierClearing);
    if (!barrier) return creep.memory.barrierClearing = undefined;
    if (creep.pos.isNearTo(barrier)) {
        if (creep.getActiveBodyparts(WORK)) {
            barrier.say(_.round(barrier.hits / (creep.getActiveBodyparts(WORK) * DISMANTLE_POWER)) + ' ticks.')
            return creep.dismantle(barrier);
        } else if (creep.getActiveBodyparts(ATTACK)) {
            barrier.say(_.round(barrier.hits / (creep.getActiveBodyparts(WORK) * ATTACK_POWER)) + ' ticks.')
            return creep.attack(barrier);
        } else if (creep.getActiveBodyparts(RANGED_ATTACK)) {
            barrier.say(_.round(barrier.hits / (creep.getActiveBodyparts(WORK) * RANGED_ATTACK_POWER)) + ' ticks.')
            return creep.rangedAttack(barrier);
        }
    } else creep.shibMove(barrier);
}