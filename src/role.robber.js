/*
 * Copyright (c) 2019.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    let sentence = ['Gimme', 'the', 'loot', creep.memory.destination];
    let word = Game.time % sentence.length;
    creep.say(sentence[word], true);
    // Handle movement
    if (creep.room.name !== creep.memory.destination && !creep.store.getUsedCapacity()) {
        if (!Memory.auxiliaryTargets[creep.memory.destination]) return creep.memory.recycle = true;
        return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 24});
    } else if (creep.room.name === creep.memory.destination && creep.store.getFreeCapacity()) {
        let steal = creep.pos.findClosestByRange(_.filter(creep.room.structures, (t) => t.structureType !== STRUCTURE_NUKER && !t.pos.checkForRampart() && t.store && t.store.getUsedCapacity()));
        if (steal) {
            for (let resourceType in steal.store) {
                switch (creep.withdraw(steal, resourceType)) {
                    case OK:
                        return true;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(steal);
                        return true;
                }
            }
        } else {
            Memory.auxiliaryTargets[creep.memory.destination] = undefined;
            creep.room.cacheRoomIntel(true);
            return creep.memory.recycle = true;
        }
    } else {
        creep.memory.closestRoom = creep.memory.closestRoom || creep.room.findClosestOwnedRoom(false, 4) || creep.room.findClosestOwnedRoom(false);
        if (creep.room.name !== creep.memory.closestRoom) {
            return creep.shibMove(new RoomPosition(25, 25, creep.memory.closestRoom), {range: 23});
        } else {
            let deliver = creep.room.terminal || creep.room.storage || _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.store.getFreeCapacity())[0];
            if (deliver) {
                for (let resourceType in creep.store) {
                    switch (creep.transfer(deliver, resourceType)) {
                        case OK:
                            break;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(deliver);
                            break;
                    }
                }
            }
        }
    }
};
