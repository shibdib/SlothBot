
let borderChecks = require('module.borderChecks');
var roleUpgrader = {

    /** @param {Creep} creep **/
    run: function (creep) {
//BORDER CHECK
        if(borderChecks.isOnBorder(creep) === true){
            borderChecks.nextStepIntoRoom(creep);
        }
        dumpTruck(creep);

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

function dumpTruck(creep) {
    if (!creep.memory.incomingEnergy) {
        creep.memory.incomingEnergy = false;
    }
    if (creep.memory.incomingEnergy) {
        creep.memory.incomingCounter = creep.memory.incomingCounter+1;
        if (creep.memory.incomingCounter > 25){
            creep.memory.incomingEnergy = false;
        }
    }
    if (creep.carry.energy < (creep.carryCapacity/2)) {
        creep.memory.needEnergy = true;
    }
    if (creep.carry.energy > (creep.carryCapacity/2)) {
        creep.memory.incomingCounter = 0;
        creep.memory.needEnergy = false;
        creep.memory.incomingEnergy = false;
    }
}