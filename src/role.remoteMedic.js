/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    if (creep.tryToBoost(['heal'])) return;
    if (creep.hits < creep.hitsMax) creep.heal(creep);
    if (creep.memory.healTarget) {
        let target = Game.getObjectById(creep.memory.healTarget);
        if (!target || target.hits === target.hitsMax) return creep.memory.healTarget = undefined;
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
                return true;

        }
    } else {
        let needsHeals = _.min(_.filter(Game.creeps, (c) => c.memory && c.id !== creep.id && c.memory.healsPlease && !c.memory.healsInbound && c.memory.overlord === creep.memory.overlord), 'hits');
        if (needsHeals.name) {
            needsHeals.memory.healsInbound = creep.id;
            creep.memory.healTarget = needsHeals.id;
            log.a(creep.name + ' reassigned to heal ' + needsHeals.name + ' in ' + needsHeals.room.name + ' from ' + creep.room.name);
        } else if (creep.room.name !== creep.memory.overlord) {
            return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 18});
        } else if (creep.pos.checkForRoad()) {
            creep.moveRandom();
        } else {
            if (creep.pos.getRangeTo(new RoomPosition(25, 25, creep.room.name)) > 20) creep.shibMove(new RoomPosition(25, 25, creep.room.name), {range: 18});
            creep.idleFor(15)
        }
    }
};
