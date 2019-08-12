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
    if (creep.tryToBoost(['build'])) return;
    creep.say(ICONS.castle, true);
    //If short on harvesters become one
    let harvesters = _.filter(creep.room.creeps, (c) => (c.my && c.memory.role === 'stationaryHarvester'));
    if (!harvesters.length) return creep.memory.role = 'stationaryHarvester';
    if (creep.wrongRoom()) return;
    if (creep.carry.energy === 0) {
        creep.memory.working = undefined;
        if (creep.room.memory.responseNeeded) creep.memory.currentTarget = undefined;
    }
    if (_.sum(creep.carry) >= creep.carryCapacity * 0.8) creep.memory.working = true;
    if (creep.memory.working) {
        creep.memory.source = undefined;
        if (!creep.memory.currentTarget || !Game.getObjectById(creep.memory.currentTarget)) {
            let barrier = _.min(_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_RAMPART), 'hits');
            let site = _.filter(creep.room.constructionSites, (s) => s.structureType === STRUCTURE_RAMPART)[0];
            if (barrier && barrier.hits < 2000) {
                creep.memory.currentTarget = barrier.id;
                creep.memory.targetHits = 10000;
                creep.shibMove(barrier, {range: 3})
            } else if (site) {
                switch (creep.build(site)) {
                    case OK:
                        creep.memory._shibMove = undefined;
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(site, {range: 3})
                }
            } else if (barrier) {
                creep.memory.currentTarget = barrier.id;
                if (barrier.hits < 50000) {
                    creep.memory.targetHits = 70000;
                } else if (barrier.hits < 150000 * creep.room.controller.level) {
                    creep.memory.targetHits = 155000 * creep.room.controller.level;
                } else {
                    creep.memory.targetHits = barrier.hits + 250000;
                }
            }
        } else {
            let target = Game.getObjectById(creep.memory.currentTarget);
            switch (creep.repair(target)) {
                case OK:
                    if (target.hits >= creep.memory.targetHits + 1200) creep.memory.currentTarget = undefined;
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(target, {range: 3})
            }
        }
    } else {
        if (creep.memory.energyDestination) {
            creep.withdrawResource();
        } else {
            if (!creep.requestDelivery() && !creep.findEnergy()) {
                if (creep.pos.checkForRoad()) {
                    creep.moveRandom();
                } else {
                    return creep.idleFor(15);
                }
            }
        }
    }
};