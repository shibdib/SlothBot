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
    if (creep.room.name !== creep.memory.destination && !_.sum(creep.store)) {
        if (creep.ticksToLive < 200) return creep.recycleCreep();
        else return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 22, offRoad: true});
    } else if (creep.memory.deposit && !creep.isFull) {
        let deposit = Game.getObjectById(creep.memory.deposit);
        // Store space
        if (Memory.auxiliaryTargets[creep.memory.destination] && !Memory.auxiliaryTargets[creep.memory.destination].space) Memory.auxiliaryTargets[creep.memory.destination].space = deposit.pos.countOpenTerrainAround();
        // Clear the deposit if needed
        if (!deposit || (!deposit.depositType && !deposit.mineralAmount) || deposit.lastCooldown >= 25 || creep.ticksToLive < 250) return creep.memory.deposit = undefined;
        // Refresh the operation
        if (Memory.auxiliaryTargets[creep.memory.destination]) Memory.auxiliaryTargets[creep.memory.destination].tick = Game.time;
        switch (creep.harvest(deposit)) {
            case OK:
                creep.memory.other.noBump = true;
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
        creep.memory.other.noBump = undefined;
        creep.memory.closestRoom = creep.memory.closestRoom || findClosestOwnedRoom(creep.room.name, false, 4);
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
        let deposit = _.filter(creep.room.deposits, (d) => !d.lastCooldown || d.lastCooldown < 25)[0] || creep.room.mineral;
        if (deposit && (deposit.depositType || deposit.mineralAmount)) {
            creep.memory.deposit = deposit.id;
        } else {
            INTEL[creep.memory.destination].commodity = undefined;
            Memory.auxiliaryTargets[creep.memory.destination] = undefined;
            if (!_.sum(creep.store)) creep.suicide();
        }
    }
};