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
    if (!Memory.auxiliaryTargets[creep.memory.destination]) return creep.memory.recycle = true;
    //Invader detection
    if (creep.fleeHome()) return;
    if (creep.room.name !== creep.memory.destination) {
        return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 22, offRoad: true});
    } else if (creep.memory.deposit && !creep.isFull) {
        let deposit = Game.getObjectById(creep.memory.deposit);
        switch (creep.harvest(deposit)) {
            case OK:
                break;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(deposit);
                break;
            case ERR_NOT_ENOUGH_RESOURCES:
                creep.memory.deposit = undefined;
                break;
            case ERR_TIRED:
                if (creep.pos.isNearTo(deposit)) creep.idleFor(deposit.cooldown);
        }
    } else {
        //Find Source
        let deposit = creep.room.deposits;
        if (deposit) {
            Memory.auxiliaryTargets[creep.memory.destination].tick = Game.time;
            creep.memory.deposit = deposit.id;
        } else {
            creep.room.cacheRoomIntel(true);
            Memory.auxiliaryTargets[creep.memory.destination] = undefined;
            creep.memory.recycle = true;
        }
    }
};