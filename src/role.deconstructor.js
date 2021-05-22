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
    creep.say('NOM!', true);
    if (creep.memory.barrierClearing) return barrierCleaning(creep);
    if (creep.memory.destination) {
        if (creep.room.name !== creep.memory.destination) return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination));
        if (Memory.auxiliaryTargets[creep.memory.destination] && Memory.auxiliaryTargets[creep.memory.destination].type === 'scoreCleaner') {
            Memory.auxiliaryTargets[creep.memory.destination].guard = creep.room.hostileCreeps.length > 0;
            //let collector = creep.room.find(FIND_SCORE_COLLECTORS)[0];
            // Season 2 stuff
            let targetRoom = creep.memory.targetRoom || findTargetRoom(creep);
            if (targetRoom) return creep.shibMove(creep.pos.findClosestByRange(Game.map.findExit(creep.room.name, targetRoom)), {
                tunnel: true,
                ignoreCreeps: true
            }); else {
                Memory.roomCache[creep.room.name].seasonHighwayPath = true;
                Memory.auxiliaryTargets[creep.memory.destination] = undefined;
            }
            /**if (!collector.pos.findClosestByPath(FIND_EXIT)) {
                creep.memory.attackCollector = true;
            } else {
                Memory.auxiliaryTargets[creep.memory.destination] = undefined;
                creep.room.cacheRoomIntel(true, creep);
            }**/
        } else {
            if (!creep.scorchedEarth()) {
                if (Memory.targetRooms[creep.memory.destination]) Memory.targetRooms[creep.memory.destination].cleaner = undefined;
                creep.room.cacheRoomIntel(true, creep);
                creep.suicide();
            }
        }
    }
};

function barrierCleaning(creep) {
    let barrier = Game.getObjectById(creep.memory.barrierClearing);
    if (!barrier) return creep.memory.barrierClearing = undefined;
    if (creep.pos.isNearTo(barrier)) {
        if (creep.getActiveBodyparts(WORK)) {
            return creep.dismantle(barrier);
        } else if (creep.getActiveBodyparts(ATTACK)) {
            return creep.attack(barrier);
        } else if (creep.getActiveBodyparts(RANGED_ATTACK)) {
            return creep.rangedAttack(barrier);
        }
    } else creep.shibMove(barrier);
}

function findTargetRoom(creep) {
    let noPath = _.filter(Game.map.describeExits(creep.room.name), (r) => !creep.pos.findClosestByPath(Game.map.findExit(creep.room.name, r)))[0];
    creep.memory.targetRoom = noPath;
    return noPath;
}