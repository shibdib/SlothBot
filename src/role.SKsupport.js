/**
 * Created by Bob on 8/5/2017.
 */
module.exports.role = function (creep) {
    let SKAttacker = Game.getObjectById(creep.memory.attacker) || _.filter(Game.creeps, (c) => c.memory.role && c.memory.role === 'SKattacker' && c.memory.destination === creep.memory.destination)[0];
    if (!SKAttacker) {
        creep.memory.attacker = undefined;
        if (creep.hits < creep.hitsMax) creep.heal(creep);
        return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 23});
    } else {
        creep.memory.attacker = SKAttacker.id;
        if (SKAttacker.hits < SKAttacker.hitsMax) {
            switch (creep.heal(SKAttacker)) {
                case OK:
                    creep.shibMove(SKAttacker, {range: 0});
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(SKAttacker, {ignoreCreeps: false});
                    if (creep.hits < creep.hitsMax) {
                        creep.heal(creep);
                    } else if (creep.pos.getRangeTo(SKAttacker) <= 3) {
                        creep.rangedHeal(SKAttacker);
                    }
                    break;
                case ERR_NO_BODYPART:
                    break;
                case ERR_INVALID_TARGET:
                    break;
            }
        } else {
            if (creep.room.name === SKAttacker.room.name) {
                let moveRange = 0;
                let ignore = true;
                if (creep.pos.x === 0 || creep.pos.x === 49 || creep.pos.y === 0 || creep.pos.y === 49 || creep.pos.getRangeTo(SKAttacker) > 2) {
                    moveRange = 1;
                    ignore = false;
                }
                creep.shibMove(SKAttacker, {range: moveRange, ignoreCreeps: ignore, ignoreRoads: true});
            } else {
                creep.shibMove(new RoomPosition(25, 25, SKAttacker.room.name), {range: 23});
            }
        }
    }
};
