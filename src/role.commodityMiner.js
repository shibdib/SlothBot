/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.role = function (creep) {
    if (creep.tryToBoost(['harvest'])) return;
    //Invader detection
    if (creep.fleeHome()) return;
    if (Memory.auxiliaryTargets[creep.memory.destination] && creep.room.name !== creep.memory.destination && !_.sum(creep.store)) {
        if (creep.ticksToLive < 200) return creep.suicide();
        return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 22, offRoad: true});
    } else if (creep.memory.deposit && !creep.isFull) {
        let deposit = Game.getObjectById(creep.memory.deposit);
        if (!deposit) return creep.memory.deposit = undefined;
        if (deposit.lastCooldown >= 25 || creep.ticksToLive < 200) return creep.memory.deposit = undefined;
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
    } else if (_.sum(creep.store)) {
        creep.memory.closestRoom = creep.memory.closestRoom || creep.room.findClosestOwnedRoom(false, 6);
        if (creep.room.name !== creep.memory.closestRoom) {
            return creep.shibMove(new RoomPosition(25, 25, creep.memory.closestRoom), {range: 23});
        } else {
            let deliver = creep.room.terminal || creep.room.storage;
            if (deliver) {
                for (let resourceType in creep.store) {
                    switch (creep.transfer(deliver, resourceType)) {
                        case OK:
                            creep.memory.hauling = undefined;
                            break;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(deliver);
                            break;
                    }
                }
            }
        }
    } else {
        //Find Deposit
        let deposit = _.filter(creep.room.deposits, (d) => !d.lastCooldown || d.lastCooldown < 25)[0];
        if (deposit) {
            Memory.auxiliaryTargets[creep.memory.destination].tick = Game.time;
            creep.memory.deposit = deposit.id;
        } else {
            creep.room.cacheRoomIntel(true, creep);
            Memory.auxiliaryTargets[creep.memory.destination] = undefined;
            creep.suicide();
        }
    }
};