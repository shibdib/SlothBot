/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
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
                INTEL[creep.room.name].seasonHighwayPath = true;
                Memory.auxiliaryTargets[creep.memory.destination] = undefined;
            }
        } else {
            if (!creep.scorchedEarth()) {
                creep.room.cacheRoomIntel(true);
                creep.suicide();
            }
        }
    }
};

function barrierCleaning(creep) {
    let barrier = Game.getObjectById(creep.memory.barrierClearing);
    if (!barrier) return creep.memory.barrierClearing = undefined;
    if (creep.pos.isNearTo(barrier)) {
        if (creep.hasActiveBodyparts(WORK)) {
            return creep.dismantle(barrier);
        }
    } else creep.shibMove(barrier);
}

function findTargetRoom(creep) {
    let noPath = _.filter(Game.map.describeExits(creep.room.name), (r) => !creep.pos.findClosestByPath(Game.map.findExit(creep.room.name, r)))[0];
    creep.memory.targetRoom = noPath;
    return noPath;
}