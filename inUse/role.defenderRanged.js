var roleDefenderRanged = {

    /** @param {Creep} creep **/
    run: function (creep) {

        var closestHostile = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        if (closestHostile) {
            creep.say('ATTACKING');
            if (creep.rangedAttack(closestHostile) === ERR_NOT_IN_RANGE) {
                creep.moveTo(closestHostile, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        } else {
            creep.moveTo(Game.flags.defender1);
        }
    }

};

module.exports = roleDefenderRanged;
/**
 * Created by rober on 5/15/2017.
 */
