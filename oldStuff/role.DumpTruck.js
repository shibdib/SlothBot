let borderChecks = require('inUse/module.creepRestrictions');
let creepTools = require('inUse/module.creepFunctions');
var roleDumpTruck = {

    /** @param {Creep} creep **/
    run: function (creep) {
//BORDER CHECK
        if(borderChecks.isOnBorder(creep) === true){
            borderChecks.nextStepIntoRoom(creep);
        }

        if (creep.carry.energy < 50) {
            creep.memory.hauling = false;
        }
        if (creep.memory.hauling === false) {
            creepTools.findContainer(creep);
                let closestContainer = Game.getObjectById(creep.memory.container);
                if (closestContainer && creep.moveTo(creep.memory.container) !== ERR_NO_PATH) {
                    if (creep.withdraw(closestContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(closestContainer, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
                    }
                } else {
                    var energy = creep.pos.findClosestByRange(FIND_DROPPED_ENERGY, {filter: (s) => s.amount > 50});
                    if (energy) {
                        if (creep.pickup(energy) === ERR_NOT_IN_RANGE) {
                            creep.moveTo(energy, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
                        }
                    }
                }
            }

        //Haul to spawn/extension
        if (creep.carry.energy >= 50) {
            creep.memory.hauling = true;
            creepTools.findBuilder(creep);
            let target = Game.getObjectById(creep.memory.builderID);
            if (target) {
                target.memory.incomingEnergy = creep.id;
                if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }else{
                var newTarget = creepTools.findNewBuilder(creep);
                newTarget = Game.getObjectById(newTarget);
                if (newTarget) {
                    newTarget.memory.incomingEnergy = creep.id;
                    newTarget.memory.incomingCounter = 0;
                    if (creep.transfer(newTarget, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(newTarget, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
                    }
                }else {
                    creep.moveTo(Game.flags.haulers, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }
        }
    }

};

module.exports = roleDumpTruck;
/**
 * Created by rober on 5/15/2017.
 */
