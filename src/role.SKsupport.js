/**
 * Created by Bob on 8/5/2017.
 */
module.exports.role = function (creep) {
    let SKAttacker = _.filter(Game.creeps, (c) => c.memory.role && c.memory.role === 'SKattacker' && c.memory.destination === creep.memory.destination);
    if (SKAttacker.length === 0) {
        if (creep.hits < creep.hitsMax) creep.heal(creep);
        let hostiles = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        if (hostiles && creep.pos.getRangeTo(hostiles) <= 4) {
            creep.retreat();
        }
    } else {
        if (SKAttacker[0].hits < SKAttacker[0].hitsMax) {
            switch (creep.heal(SKAttacker[0])) {
                case OK:
                    creep.shibMove(SKAttacker[0], {range: 0});
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(SKAttacker[0], {ignoreCreeps: false});
                    if (creep.hits < creep.hitsMax) {
                        creep.heal(creep);
                    } else if (creep.pos.getRangeTo(SKAttacker[0]) <= 3) {
                        creep.rangedHeal(SKAttacker[0]);
                    }
                    break;
                case ERR_NO_BODYPART:
                    break;
                case ERR_INVALID_TARGET:
                    break;
            }
        } else {
            creep.shibMove(SKAttacker[0], {range: 0});
        }
    }
};
