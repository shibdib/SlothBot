/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    if (!creep.memory.boostAttempt) return creep.tryToBoost(['build']);
    creep.repairRoad();
    if (creep.borderCheck()) return null;
    if (creep.wrongRoom()) return null;
    if (creep.carry.energy === 0) {
        creep.memory.working = undefined;
        if (creep.room.memory.responseNeeded) creep.memory.currentTarget = undefined;
    }
    if (creep.isFull) creep.memory.working = true;
    if (creep.memory.working) {
        creep.memory.source = undefined;
        if (!creep.memory.currentTarget || !Game.getObjectById(creep.memory.currentTarget)) {
            let barrier = _.min(_.filter(creep.room.structures, (s) => (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) && (s.pos.x === 2 || s.pos.y === 2 || s.pos.x === 1 || s.pos.y === 1)), 'hits');
            if (barrier.hits > barrier.hits < 500000 * creep.room.controller.level) barrier = _.min(_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART), 'hits');
            let site = _.filter(creep.room.constructionSites, (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART)[0];
            if (barrier && barrier.hits < 2000) {
                creep.memory.currentTarget = barrier.id;
                creep.memory.targetHits = 10000 * creep.room.controller.level;
                creep.shibMove(barrier, {range: 3})
            } else if (site) {
                switch (creep.build(site)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(site, {range: 3})
                }
            } else if (barrier) {
                creep.memory.currentTarget = barrier.id;
                if (barrier.hits < 500000) {
                    creep.memory.targetHits = 550000;
                } else if (barrier.hits < 500000 * creep.room.controller.level) {
                    creep.memory.targetHits = 510000 * creep.room.controller.level;
                } else {
                    creep.memory.targetHits = barrier.hits + 500000;
                }
            }
        } else {
            let target = Game.getObjectById(creep.memory.currentTarget);
            switch (creep.repair(target)) {
                case OK:
                    if (target.hits >= creep.memory.targetHits + 2000) creep.memory.currentTarget = undefined;
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(target, {range: 3})
            }
        }
    } else {
        if (creep.memory.energyDestination) {
            creep.withdrawEnergy();
        } else {
            if (!creep.findEnergy()) {
                if (creep.pos.checkForRoad()) {
                    creep.moveRandom();
                } else {
                    return creep.idleFor(15);
                }
            }
        }
    }
}

module.exports.role = profiler.registerFN(role, 'wallerRole');