let borderChecks = require('inUse/module.borderChecks');
let creepTools = require('inUse/module.creepFunctions');
var roleHauler = {

    /** @param {Creep} creep **/
    run: function (creep) {
//BORDER CHECK
        if(borderChecks.isOnBorder(creep) === true){
            borderChecks.nextStepIntoRoom(creep);
        }
        if (creepTools.rangeSource(creep) === 1) {
            creep.moveTo(Game.flags.bump, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
            return null;
        }
        if (creep.carry.energy === 0) {
            creep.memory.hauling = false;
        }
        if (creep.carry.energy === creep.carryCapacity) {
            creep.memory.hauling = true;
        }
        if (creep.memory.hauling === false) {
            var container = Game.getObjectById(creep.memory.assignedContainer);
            if (container) {
                if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(container, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
                }
            }
        }

        //Haul to spawn/extension
        if (creep.memory.hauling === true) {
            var targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (structure.structureType === STRUCTURE_EXTENSION ||
                        structure.structureType === STRUCTURE_SPAWN) && structure.energy < structure.energyCapacity;
                }
            })
            if (targets.length > 0) {
                if (creep.transfer(targets[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(targets[0], {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
                }
            }else{
                var tower = Game.getObjectById(creepTools.findTower(creep));
                if (tower) {
                    if (creep.transfer(tower, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(tower, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
                    }
                }
            }
        }
    }

};

module.exports = roleHauler;
/**
 * Created by rober on 5/15/2017.
 */
