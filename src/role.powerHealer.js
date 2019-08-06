/*
 * Copyright (c) 2019.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.role = function (creep) {
    if (creep.pos.roomName !== creep.memory.destination) creep.memory.destinationReached = false;
    if (creep.pos.roomName === creep.memory.destination) creep.memory.destinationReached = true;
    if (!Memory.targetRooms[creep.memory.destination]) creep.memory.recycle = true;
    //Initial move
    if (!creep.memory.destinationReached) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination));
        if (creep.pos.roomName === creep.memory.destination) {
            creep.memory.destinationReached = true;
        }
        return;
    } else {
        if (!creep.memory.assignedAttacker) {
            let attacker = _.filter(creep.room.creeps, (c) => c.my && c.memory.role === 'powerAttacker' && (!c.memory.healer || !Game.getObjectById(c.memory.healer)))[0];
            if (attacker) {
                attacker.memory.healer = creep.id;
                creep.memory.assignedAttacker = attacker.id;
            } else {
                creep.healMyCreeps();
            }
        } else {
            let attacker = Game.getObjectById(creep.memory.assignedAttacker);
            if (creep.pos.getRangeTo(attacker) <= 1) {
                creep.heal(attacker);
            } else {
                creep.rangedHeal(attacker);
            }
        }
    }
};