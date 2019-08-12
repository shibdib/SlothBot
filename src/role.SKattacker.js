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
    if (creep.memory.boostAttempt !== true) return creep.tryToBoost(['attack']);
    if (creep.room.name === creep.memory.destination) {
        let sourceKeeper = creep.pos.findClosestByRange(creep.room.creeps, {filter: (c) => c.owner.username === 'Source Keeper'});
        if (sourceKeeper) {
            switch (creep.attack(sourceKeeper)) {
                case ERR_NOT_IN_RANGE:
                    if (creep.hits < creep.hitsMax) {
                        creep.heal(creep);
                        if (creep.pos.getRangeTo(sourceKeeper) >= 5) return;
                    }
                    creep.shibMove(sourceKeeper);
                    break;
                case ERR_NO_BODYPART:
                    break;
                case OK:
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