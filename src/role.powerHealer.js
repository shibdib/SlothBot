/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.role = function (creep) {
    if (!Memory.auxiliaryTargets[creep.memory.destination]) creep.memory.recycle = true;
    //Initial move
    if (creep.pos.roomName !== creep.memory.destination) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
    } else {
        let powerBank = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_POWER_BANK)[0];
        if (powerBank && creep.pos.isNearTo(powerBank)) creep.moveRandom();
        creep.healMyCreeps();
    }
};