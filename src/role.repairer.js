/*
 * Copyright (c) 2018.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    //INITIAL CHECKS
    if (creep.room.memory.responseNeeded && creep.room.memory.threatLevel > 2 && creep.room.memory.tickDetected + 100 < Game.time) creep.memory.recycle = true;
    if (creep.tryToBoost(['build'])) return;
    if (creep.wrongRoom()) return;
    if (creep.carry.energy === 0) {
        creep.memory.working = undefined;
        creep.memory.constructionSite = undefined;
        creep.memory.task = undefined;
    }
    if (_.sum(creep.carry) >= creep.carryCapacity * 0.8) creep.memory.working = true;
    if (creep.memory.working === true) {
        creep.memory.source = undefined;
        if (!creep.memory.constructionSite || !Game.getObjectById(creep.memory.constructionSite)) {
            creep.memory.constructionSite = undefined;
            creep.memory.task = undefined;
            creep.findRepair(creep.room.controller.level);
        }
        if (creep.memory.task === 'repair' && creep.memory.constructionSite) {
            let repairNeeded = Game.getObjectById(creep.memory.constructionSite);
            if (repairNeeded.hits >= repairNeeded.hitsMax || repairNeeded.hits > 100000 * creep.room.controller.level) return creep.memory.constructionSite = undefined;
            switch (creep.repair(repairNeeded)) {
                case OK:
                    return;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(repairNeeded, {range: 3});
                    break;
                case ERR_NOT_ENOUGH_RESOURCES:
                    creep.memory.constructionSite = undefined;
                    break;
                case ERR_RCL_NOT_ENOUGH:
                    creep.memory.constructionSite = undefined;
            }
        } else if (creep.pos.checkForRoad()) {
            creep.moveRandom();
        } else {
            creep.idleFor(15);
        }
    } else {
        if (creep.memory.energyDestination) {
            creep.withdrawEnergy();
        } else {
            if (!creep.findEnergy()) {
                if (!creep.memory.energyDestination && !creep.memory.source) {
                    let source = creep.pos.getClosestSource();
                    if (source) creep.memory.source = source.id;
                } else if (creep.memory.source) {
                    let source = Game.getObjectById(creep.memory.source);
                    if (creep.harvest(source) === ERR_NOT_IN_RANGE) creep.shibMove(source)
                }
            }
        }
    }
};