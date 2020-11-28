/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function role(creep) {
    if (creep.tryToBoost(['build'])) return;
    creep.say(ICONS.castle, true);
    if (creep.wrongRoom()) return;
    // Checks
    if (!creep.store[RESOURCE_ENERGY]) {
        creep.memory.working = undefined;
    }
    if (creep.isFull && creep.memory.task !== 'harvest') {
        creep.memory.working = true;
        creep.memory.source = undefined;
        creep.memory.harvest = undefined;
    }
    // Work
    if (creep.memory.working) {
        wallMaintainer(creep);
    } else {
        if (!creep.memory.harvest && (creep.memory.energyDestination || creep.locateEnergy())) {
            creep.withdrawResource();
        } else {
            creep.idleFor(5);
        }
    }
};

function wallMaintainer(creep) {
    if (!creep.memory.currentTarget || !Game.getObjectById(creep.memory.currentTarget) || Memory.roomCache[creep.room.name].threatLevel || creep.room.memory.nuke) {
        let nukeSite, nukeRampart;
        let barrierStructures = _.filter(creep.room.structures, (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL));
        if (creep.room.memory.nuke) {
            nukeSite = _.filter(creep.room.constructionSites, (s) => s.structureType === STRUCTURE_RAMPART && s.pos.getRangeTo(s.pos.findClosestByRange(FIND_NUKES)) <= 5)[0];
            nukeRampart = _.min(_.filter(barrierStructures, (s) => s.structureType === STRUCTURE_RAMPART && s.pos.getRangeTo(s.pos.findClosestByRange(FIND_NUKES)) <= 5), 'hits');
        }
        let hostileBarrier;
        if (Memory.roomCache[creep.room.name].threatLevel) {
            hostileBarrier = _.min(_.filter(barrierStructures, (s) => s.pos.findInRange(_.filter(s.room.hostileCreeps, (c) => c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK) || c.getActiveBodyparts(WORK)), 5)[0]), 'hits');
        }
        let barriers = _.filter(barrierStructures, (s) => s.hits < BARRIER_TARGET_HIT_POINTS[s.room.controller.level] || s.room.energyState);
        let barrier = _.min(barriers, 'hits');
        let site = _.filter(creep.room.constructionSites, (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL))[0];
        if (!hostileBarrier && barriers.length && barrier.hits < 2000) {
            creep.memory.currentTarget = barrier.id;
            creep.shibMove(barrier, {range: 3})
        } else if (hostileBarrier) {
            creep.memory.currentTarget = hostileBarrier.id;
        } else if (nukeSite) {
            creep.say(ICONS.nuke, true);
            switch (creep.build(nukeSite)) {
                case OK:
                    creep.memory._shibMove = undefined;
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(nukeSite, {range: 3})
            }
        } else if (nukeRampart && nukeRampart.id) {
            creep.say(ICONS.nuke, true);
            creep.memory.currentTarget = nukeRampart.id;
        } else if (site) {
            switch (creep.build(site)) {
                case OK:
                    creep.memory._shibMove = undefined;
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(site, {range: 3})
            }
        } else if (barriers.length && barrier.id) {
            creep.memory.currentTarget = barrier.id;
        }
    }
    let target = Game.getObjectById(creep.memory.currentTarget);
    if (target) {
        if (!creep.memory.targetWallHits) {
            if (target.hits < 10000) {
                creep.memory.targetWallHits = 25000;
            } else {
                creep.memory.targetWallHits = target.hits + 50000;
            }
        }
        target.say(target.hits + ' / ' + creep.memory.targetWallHits);
        switch (creep.repair(target)) {
            case OK:
                if (target.hits >= creep.memory.targetWallHits + 1200) {
                    creep.memory.currentTarget = undefined;
                    creep.memory.targetWallHits = undefined;
                }
                break;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(target, {range: 3})
        }
    }
}