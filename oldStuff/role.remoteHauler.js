let borderChecks = require('inUse/module.borderChecks');
let creepTools = require('inUse/module.creepFunctions');
var roleRemoteHauler = {

    /** @param {Creep} creep **/
    run: function (creep) {
        if (creepTools.rangeSource(creep) === 1) {
            creep.moveTo(Game.flags.bump, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
            return null;
        }
        if (creep.carry.energy !== creep.carryCapacity) {
            creep.memory.hauling = false;
        }
        if (creep.carry.energy === creep.carryCapacity) {
            creep.memory.hauling = true;
        }
        if (creep.memory.hauling === false) {
            let remoteHarvester = Game.getObjectById(creep.memory.assignedHarvester);
            if (remoteHarvester && creep.memory.hauling === false) {
                creep.moveTo(remoteHarvester, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
            if (creep.pos.getRangeTo(remoteHarvester) === 1) {
                let energy = creep.pos.findInRange(FIND_DROPPED_ENERGY, 5);
                if (energy) {
                    if (creep.pickup(energy[0]) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(energy[0], {visualizePathStyle: {stroke: '#ffaa00'}});
                    }
                }
            }
        }

        //Haul to spawn/extension
        if (creep.memory.hauling === true) {
            if (creep.transfer(Game.spawns['Spawn1'], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(Game.spawns['Spawn1'], {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
    }

};

module.exports = roleRemoteHauler;
/**
 * Created by rober on 5/15/2017.
 */
