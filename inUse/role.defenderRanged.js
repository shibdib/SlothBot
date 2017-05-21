var roleDefenderRanged = {

    /** @param {Creep} creep **/
    run: function (creep) {
//BORDER CHECKlet borderChecks = require('module.borderChecks');if(borderChecks.isOnBorder(creep) === true){	borderChecks.nextStepIntoRoom(creep);}

        var closestHostile = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        if (closestHostile) {
            creep.say('ATTACKING');
            if (creep.rangedAttack(closestHostile) === ERR_NOT_IN_RANGE) {
                creep.moveTo(closestHostile, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
            }
        } else {
            creep.moveTo(Game.flags.defender1, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
        }
    }

};

module.exports = roleDefenderRanged;
/**
 * Created by rober on 5/15/2017.
 */
