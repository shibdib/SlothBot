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
    if (creep.room.name === creep.memory.destination) {
        //If source is set mine
        if (!creep.memory.source && !creep.findSource()) creep.findMineral();
        let source = Game.getObjectById(creep.memory.source);
        if (!creep.memory.lair) {
            creep.memory.lair = source.pos.findClosestByRange(creep.room.structures, (s) => s.structureType === STRUCTURE_KEEPER_LAIR).id;
        }
        let lair = Game.getObjectById(creep.memory.lair);
        let SK = creep.pos.findInRange(creep.room.creeps, 5, {filter: (c) => c.owner.username === 'Source Keeper'})[0];
        if (SK) {
            return creep.kite(6);
        } else if (lair.ticksToSpawn <= 10) {
            return creep.flee(lair);
        }
        // Handle healing
        switch (creep.harvest(source)) {
            case ERR_NOT_IN_RANGE:
                creep.shibMove(source);
                break;
            case OK:
                if (creep.memory.haulerID && Game.time % 50 === 0) {
                    if (!Array.isArray(creep.memory.haulerID)) creep.memory.haulerID = [creep.memory.haulerID];
                    creep.memory.haulerID = _.remove(creep.memory.haulerID, function (n) {
                        return Game.getObjectById(n);
                    });
                }
                break;
        }
    } else creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
};