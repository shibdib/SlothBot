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
    // Border Patrol
    if (creep.memory.operation === 'borderPatrol') return creep.borderPatrol();
    // Boosts
    if (!creep.memory.boostAttempt) return creep.tryToBoost(['ranged']);
    // Responder Mode
    if (creep.memory.other.responseTarget || !creep.memory.operation) {
        if (creep.hits < creep.hitsMax) creep.heal(creep);
        creep.say(ICONS.respond, true);
        if (creep.room.memory.towerTarget && Game.getObjectById(creep.room.memory.towerTarget)) {
            return creep.fightRanged(Game.getObjectById(creep.room.memory.towerTarget));
        }
        if (!creep.handleMilitaryCreep(false, true)) {
            if (creep.room.name !== creep.memory.other.responseTarget) {
                return creep.shibMove(new RoomPosition(25, 25, creep.memory.other.responseTarget), {range: 18}); //to move to any room}
            } else {
                creep.findDefensivePosition(creep);
            }
        }
        if (creep.memory.awaitingOrders) return creep.memory.other.responseTarget = undefined;
        if (creep.ticksToLive < 750) creep.memory.operation = 'borderPatrol';
    } else if (creep.memory.operation) {
        switch (creep.memory.operation) {
            case 'marauding':
                creep.marauding();
                break;
            case 'guard':
                creep.guardRoom();
                break;
            case 'hold':
                creep.holdRoom();
                break;
            case 'rangers':
                creep.rangersRoom();
                break;
        }
    }
};
