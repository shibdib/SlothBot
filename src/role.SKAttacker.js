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
        // Handle invader cores in sk
        let core = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_INVADER_CORE)[0];
        if (core) {
            creep.room.cacheRoomIntel(true);
            return creep.memory.recycle = true;
        }
        let invaders = _.filter(creep.room.creeps, (c) => c.owner.username === 'Invader');
        if (invaders.length > 1) {
            Memory.roomCache[creep.room.name].invaderCooldown = Game.time + invaders[0].ticksToLive;
        } else {
            Memory.roomCache[creep.room.name].invaderCooldown = undefined;
        }
        creep.attackInRange();
        let sourceKeeper = creep.pos.findClosestByRange(creep.pos.findInRange(creep.room.hostileCreeps, 30, {filter: (c) => (c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK) || c.getActiveBodyparts(HEAL))})) ||
            creep.pos.findClosestByRange(creep.room.creeps, {filter: (c) => c.owner.username === 'Source Keeper'});
        if (sourceKeeper) {
            switch (creep.attack(sourceKeeper)) {
                case ERR_NOT_IN_RANGE:
                    if (creep.hits < creep.hitsMax) {
                        creep.heal(creep);
                        if (creep.hits < creep.hitsMax * 0.8 && creep.pos.getRangeTo(sourceKeeper) >= 5) return;
                    }
                    creep.shibMove(sourceKeeper);
                    break;
                case ERR_NO_BODYPART:
                    break;
                case OK:
                    Memory.roomCache[creep.room.name].mined = Game.time;
                    break;
            }
        } else {
            creep.healInRange();
            let lair = _.min(_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_KEEPER_LAIR), 'ticksToSpawn');
            creep.shibMove(lair, {range: 1});
        }
    } else {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
    }
};