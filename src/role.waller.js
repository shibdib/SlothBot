/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    if (!creep.getSafe()) {
        if (_.filter(creep.room.constructionSites, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART).length > 5 && _.filter(creep.room.creeps, (creep) => creep.memory && creep.memory.role === 'worker').length < 4) return creep.memory.role = 'worker';
        if (creep.renewalCheck(5)) return null;
        if (!creep.memory.boostAttempt) return creep.tryToBoost(['build']);
        creep.repairRoad();
        if (creep.borderCheck()) return null;
        if (creep.wrongRoom()) return null;
        if (creep.carry.energy === 0) creep.memory.working = null;
        if (creep.isFull) creep.memory.working = true;
        if (creep.memory.working === true) {
            if (!creep.memory.currentTarget) {
                let barrier = _.min(_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART), 'hits');
                let site = _.filter(creep.room.constructionSites, (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART)[0];
                if (barrier && barrier.hits < 2000) {
                    creep.memory.currentTarget = barrier.id;
                    creep.memory.targetHits = 10000;
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
                        if (target.hits >= creep.memory.targetHits + 2000) delete creep.memory.currentTarget;
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(target, {range: 3})
                }
            }
        } else {
            if (creep.memory.energyDestination) {
                creep.withdrawEnergy();
            } else {
                creep.findEnergy();
                if (!creep.memory.energyDestination) {
                    let source = creep.pos.getClosestSource();
                    if (creep.harvest(source) === ERR_NOT_IN_RANGE) creep.shibMove(source)
                }
            }
        }
    }
}

module.exports.role = profiler.registerFN(role, 'wallerRole');