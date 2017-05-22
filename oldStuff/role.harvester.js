let borderChecks = require('inUse/module.borderChecks');
let creepTools = require('inUse/module.creepFunctions');
var roleHarvester = {

    /** @param {Creep} creep **/
    run: function (creep) {
//BORDER CHECK
        if(borderChecks.isOnBorder(creep) === true){
            borderChecks.nextStepIntoRoom(creep);
        } if
        (creep.carry.energy < creep.carryCapacity || creep.carryCapacity === 0) {
            if (creep.memory.assignedSource && creep.moveTo(Game.getObjectById(creep.memory.assignedSource)) !== ERR_NO_PATH){
                source = Game.getObjectById(creep.memory.assignedSource);
            }else if (!source) {
                var source = creepTools.findSource(creep);
            }
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
    }
};

module.exports = roleHarvester;