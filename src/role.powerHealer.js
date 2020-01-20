/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.role = function (creep) {
    creep.memory.destinationReached = creep.pos.roomName === creep.memory.destination;
    if (!Memory.auxiliaryTargets[creep.memory.destination]) creep.memory.recycle = true;
    //Initial move
    if (!creep.memory.destinationReached) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
    } else {
        creep.healMyCreeps();
    }
};