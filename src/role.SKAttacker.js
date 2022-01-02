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
        // Handle invader core in sk
        if (creep.room.hostileStructures.length) {
            let core = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_INVADER_CORE)[0];
            if (core) {
                creep.room.cacheRoomIntel(true, creep);
                return creep.suicide();
            }
        }
        let sourceKeeper = Game.getObjectById(creep.memory.keeper) || creep.pos.findClosestByRange(creep.room.creeps, {filter: (c) => c.owner.username === 'Source Keeper'});
        if (sourceKeeper) {
            creep.heal(creep);
            creep.memory.lair = undefined;
            creep.memory.keeper = sourceKeeper.id;
            switch (creep.attack(sourceKeeper)) {
                case ERR_NOT_IN_RANGE:
                    if (creep.hits < creep.hitsMax * 0.8 && creep.pos.getRangeTo(sourceKeeper) > 7) return;
                    creep.shibMove(sourceKeeper);
                    break;
                case ERR_NO_BODYPART:
                    break;
                case OK:
                    break;
            }
        } else {
            creep.healInRange();
            let lair = Game.getObjectById(creep.memory.lair) || _.min(_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_KEEPER_LAIR), 'ticksToSpawn');
            creep.memory.keeper = undefined;
            creep.memory.lair = lair.id;
            if (creep.hits === creep.hitsMax && creep.pos.isNearTo(lair)) creep.idleFor(lair.ticksToSpawn - 1); else creep.shibMove(lair, {range: 1});
        }
    } else {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
    }
};