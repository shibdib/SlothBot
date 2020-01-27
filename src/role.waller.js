/*
 * Copyright (c) 2020.
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
    if (creep.wrongRoom()) return;
    if (!creep.store[RESOURCE_ENERGY]) {
        creep.memory.working = undefined;
        if (Memory.roomCache[creep.room.name].responseNeeded) creep.memory.currentTarget = undefined;
    }
    if (creep.isFull) creep.memory.working = true;
    if (creep.memory.working) {
        delete creep.memory.harvest;
        creep.memory.source = undefined;
        if (!creep.memory.currentTarget || !Game.getObjectById(creep.memory.currentTarget) || Memory.roomCache[creep.room.name].threatLevel || creep.room.memory.nuke) {
            let nukeSite, nukeRampart;
            if (creep.room.memory.nuke) {
                nukeSite = _.filter(creep.room.constructionSites, (s) => s.structureType === STRUCTURE_RAMPART && s.pos.getRangeTo(s.pos.findClosestByRange(FIND_NUKES)) <= 5)[0];
                nukeRampart = _.min(_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_RAMPART && s.pos.getRangeTo(s.pos.findClosestByRange(FIND_NUKES)) <= 5), 'hits');
            }
            let hostileBarrier = _.min(_.filter(creep.room.structures, (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.pos.findInRange(_.filter(s.room.hostileCreeps, (c) => c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK) || c.getActiveBodyparts(WORK)), 3)[0]), 'hits');
            let barriers = _.filter(creep.room.structures, (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < BARRIER_TARGET_HIT_POINTS[s.room.controller.level]);
            let barrier = _.min(barriers, 'hits');
            let site = _.filter(creep.room.constructionSites, (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL))[0];
            if (!hostileBarrier.id && barriers.length && barrier.hits < 2000) {
                creep.memory.currentTarget = barrier.id;
                creep.memory.targetHits = 10000;
                creep.shibMove(barrier, {range: 3})
            } else if (hostileBarrier.id) {
                creep.memory.currentTarget = hostileBarrier.id;
                if (hostileBarrier.hits < 10000) {
                    creep.memory.targetHits = 25000;
                } else {
                    creep.memory.targetHits = hostileBarrier.hits + 50000;
                }
            } else if (nukeSite) {
                creep.say('NUKE!', true);
                switch (creep.build(nukeSite)) {
                    case OK:
                        creep.memory._shibMove = undefined;
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(nukeSite, {range: 3})
                }
            } else if (nukeRampart && nukeRampart.id) {
                creep.say('NUKE!', true);
                creep.memory.currentTarget = nukeRampart.id;
                if (barrier.hits < 10000) {
                    creep.memory.targetHits = 25000;
                } else {
                    creep.memory.targetHits = barrier.hits + 50000;
                }
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
                if (barrier.hits < 10000) {
                    creep.memory.targetHits = 25000;
                } else {
                    creep.memory.targetHits = barrier.hits + 50000;
                }
            } else {
                creep.idleFor(50);
            }
        }
        let target = Game.getObjectById(creep.memory.currentTarget);
        if (target) {
            switch (creep.repair(target)) {
                case OK:
                    if (target.hits >= creep.memory.targetHits + 1200) creep.memory.currentTarget = undefined;
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(target, {range: 3})
            }
        }
    } else {
        if (!creep.memory.harvest && (creep.memory.energyDestination || creep.locateEnergy())) {
            creep.say('Energy!', true);
            creep.withdrawResource();
        } else {
            creep.memory.harvest = true;
            let source = Game.getObjectById(creep.memory.source) || creep.pos.getClosestSource();
            if (source) {
                creep.say('Harvest!', true);
                creep.memory.source = source.id;
                switch (creep.harvest(source)) {
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(source);
                        if (Math.random() >= 0.9) {
                            creep.memory.harvest = undefined;
                            creep.memory.source = undefined;
                            return;
                        }
                        break;
                    case ERR_NOT_ENOUGH_RESOURCES:
                        creep.memory.source = undefined;
                        break;
                    case OK:
                        break;
                }
            } else {
                delete creep.memory.harvest;
                creep.idleFor(5);
            }
        }
    }
};