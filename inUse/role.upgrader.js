let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');
var roleUpgrader = {

    /** @param {Creep} creep **/
    run: function (creep) {
//BORDER CHECK
        if(borderChecks.isOnBorder(creep) === true){
            borderChecks.nextStepIntoRoom(creep);
        }
        creepTools.dumpTruck(creep);

        if (creep.memory.upgrading && creep.carry.energy === 0) {
            creep.memory.upgrading = false;
        }
        if (!creep.memory.upgrading && creep.carry.energy > 0) {
            creep.memory.upgrading = true;
        }

        if (creep.memory.upgrading) {
            if (creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
            }
        }
    }
};

module.exports = roleUpgrader;