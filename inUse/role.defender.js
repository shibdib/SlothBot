var roleDefender = {

    /** @param {Creep} creep **/
    run: function (creep) {
        //BORDER CHECK
        let nextStepIntoRoom = require('module.borderChecks');
        let isOnBorder = require('module.borderChecks');
        if(isOnBorder(creep) === true){
            nextStepIntoRoom(creep);
        }

        var closestHostile = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        if (closestHostile) {
            creep.say('ATTACKING');
            if (creep.attack(closestHostile) === ERR_NOT_IN_RANGE) {
                creep.moveTo(closestHostile, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
            }
        } else {
            creep.moveTo(Game.flags.defender1, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
        }
    }

};

module.exports = roleDefender;
/**
 * Created by rober on 5/15/2017.
 */
