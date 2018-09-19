/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    if (!creep.memory.boostAttempt) return creep.tryToBoost(['heal']);
    creep.borderCheck();
    if (creep.hits < creep.hitsMax) creep.heal(creep);
    if (creep.memory.healTarget) {
        let target = Game.getObjectById(creep.memory.healTarget);
        if (!target) return creep.memory.healTarget = undefined;
        switch (creep.heal(target)) {
            case ERR_NOT_IN_RANGE:
                if (target.room.name !== creep.room.name) {
                    return creep.shibMove(new RoomPosition(25, 25, target.room.name), {range: 18}); //to move to any room}
                }
                creep.shibMove(target);
                creep.rangedHeal(target);
                break;
            case OK:
                creep.shibMove(target, {ignoreCreeps: true, ignoreStructures: false, range: 0});
                if (target.hits === target.hitsMax) creep.memory.healTarget = undefined;
                return true;

        }
    } else {
        let needsHeals = _.min(_.filter(Game.creeps, (c) => c.memory && c.memory.healsPlease && !c.memory.healsInbound && Game.map.findRoute(c.room.name, creep.room.name).length <= 10), 'hits');
        if (needsHeals.name) {
            needsHeals.memory.healsInbound = creep.id;
            creep.memory.healTarget = needsHeals.id;
            log.a(creep.name + ' reassigned to heal ' + needsHeals.name + ' in ' + needsHeals.room.name + ' from ' + creep.room.name);
        } else if (creep.pos.checkForRoad()) {
            creep.moveRandom();
        } else if (creep.room.name !== creep.memory.overlord) {
            return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 18});
        } else {
            creep.idleFor(15)
        }
    }
}

module.exports.role = profiler.registerFN(role, 'healerRole');
