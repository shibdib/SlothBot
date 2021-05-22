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
    // Handle flee
    if (creep.memory.runCooldown || (!creep.getActiveBodyparts(RANGED_ATTACK) && !creep.getActiveBodyparts(ATTACK))) return creep.fleeHome(true);
    // Border Patrol
    if (creep.memory.operation === 'borderPatrol') return creep.borderPatrol();
    // Responder Mode
    if (creep.memory.other && creep.memory.other.responseTarget) {
        if (creep.memory.other.responseTarget) return creep.guardRoom();
        creep.say(ICONS.respond, true);
        if (!creep.handleMilitaryCreep(false, true)) {
            if (creep.room.name !== creep.memory.other.responseTarget) {
                creep.attackInRange();
                creep.healInRange();
                return creep.shibMove(new RoomPosition(25, 25, creep.memory.other.responseTarget), {range: 18}); //to move to any room}
            } else {
                creep.findDefensivePosition(creep);
            }
        }
        if (creep.memory.awaitingOrders) return creep.memory.other.responseTarget = undefined;
    } else if (creep.memory.operation) {
        switch (creep.memory.operation) {
            case 'guard':
                creep.guardRoom();
                break;
            case 'hold':
                creep.holdRoom();
                break;
            case 'harass':
                creep.harass();
                break;
            case 'siegeGroup':
                creep.siegeGroupRoom();
                break;
        }
    } else if (creep.memory.destination) {
        if (creep.room.name !== creep.memory.destination) {
            creep.attackInRange();
            creep.healInRange();
            return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 22});
        } else {
            creep.handleMilitaryCreep();
        }
    }
};
