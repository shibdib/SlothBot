let borderChecks = require('inUse/module.creepRestrictions');
let creepTools = require('inUse/module.creepFunctions');
let rolePeasantBuilder = {

    /** @param {Creep} creep **/
    run: function (creep) {
//BORDER CHECK
        if(borderChecks.isOnBorder(creep) === true){
            borderChecks.nextStepIntoRoom(creep);
        }
        if (!findSpawn(creep).memory.build === false) {
            if (creep.carry.energy > 0) {
                var target = creepTools.findConstruction(creep);
                target = Game.getObjectById(target);
                if (target) {
                    if (creep.build(target) === ERR_INVALID_TARGET) {
                        creep.moveTo(Game.flags.haulers, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
                    } else {
                        if (creep.build(target) === ERR_NOT_IN_RANGE) {
                            creep.moveTo(target, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
                        }
                    }
                }
            } else {
                if (creep.memory.spawnID && Game.getObjectById(creep.memory.spawnID)) {
                    var spawn = Game.getObjectById(creep.memory.spawnID);
                } else {
                    var spawn = creepTools.findSpawn(creep);
                }
                if (creep.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(spawn, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }
        }
    }
};

module.exports = rolePeasantBuilder;