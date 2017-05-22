let borderChecks = require('inUse/module.creepRestrictions');
let creepTools = require('inUse/module.creepFunctions');
var roleExpediter = {

    /** @param {Creep} creep **/
    run: function (creep) {
//BORDER CHECK
        if(borderChecks.isOnBorder(creep) === true){
            borderChecks.nextStepIntoRoom(creep);
        }
        if (creepTools.rangeSource(creep) === 1) {
            creep.moveTo(Game.flags.bump, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
            return null;
        }
        if (creepTools.rangeAssignment(creep) > 4) {
            var container = Game.getObjectById(creep.memory.assignedContainer);
            creep.moveTo(container);
            return null;
        }
        var energy = creep.pos.findInRange(FIND_DROPPED_ENERGY, 8);
        if (energy) {
            if (creep.pickup(energy[0]) === ERR_NOT_IN_RANGE) {
                creep.moveTo(energy[0], {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }

        //Haul to container
        var container = Game.getObjectById(creep.memory.assignedContainer);
        if (container && creep.carry.energy === creep.carryCapacity) {
            if (creep.transfer(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(container, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
    }

};

module.exports = roleExpediter;
/**
 * Created by rober on 5/15/2017.
 */
