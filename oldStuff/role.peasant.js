let borderChecks = require('inUse/module.borderChecks');
let creepTools = require('inUse/module.creepFunctions');
let rolePeasant = {

    /** @param {Creep} creep **/
    run: function (creep) {
//BORDER CHECK
        if(borderChecks.isOnBorder(creep) === true){
            borderChecks.nextStepIntoRoom(creep);
        }
        if (creep.carry.energy < creep.carryCapacity) {
            if (creep.memory.assignedSource && creep.moveTo(Game.getObjectById(creep.memory.assignedSource)) !== ERR_NO_PATH){
                source = Game.getObjectById(creep.memory.assignedSource);
            }else if (!source) {
                var source = creepTools.findSource(creep);
            }
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        } else {
            var targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (structure.structureType === STRUCTURE_EXTENSION ||
                        structure.structureType === STRUCTURE_SPAWN) && structure.energy < structure.energyCapacity;
                }
            })
            if (targets.length > 0) {
                if (creep.transfer(targets[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(targets[0], {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }
        }
    }
};

module.exports = rolePeasant;