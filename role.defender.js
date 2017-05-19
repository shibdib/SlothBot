var roleDefender = {

    /** @param {Creep} creep **/
    run: function (creep) {

        var closestHostile = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        if (closestHostile) {
            creep.say('ATTACKING');
            if (creep.attack(closestHostile) === ERR_NOT_IN_RANGE) {
                creep.moveTo(closestHostile, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        } else {
            creep.moveTo(Game.flags.defender1);
        }
    }

};

module.exports = roleDefender;
/**
 * Created by rober on 5/15/2017.
 */
