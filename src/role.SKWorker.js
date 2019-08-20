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
        if (!source) return creep.kite();
        let sourceKeeper = source.pos.findInRange(creep.room.hostileCreeps, 5)[0] || source.pos.findInRange(creep.room.hostileCreeps, 30, {filter: (c) => c.owner.name !== 'SourceKeeper'})[0];
        // Handle healing
        if (creep.hits < creep.hitsMax * 0.6) return creep.goHomeAndHeal(); else if (creep.hits < creep.hitsMax) creep.heal(creep); else creep.healInRange();
        if (sourceKeeper) {
            creep.fightRanged(sourceKeeper);
        } else {
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
        }
    } else creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
};