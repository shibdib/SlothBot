var roleRemoteHauler = {

    /** @param {Creep} creep **/
    run: function (creep) {
        if (rangeSource(creep) === 1) {
            creep.moveTo(Game.flags.defender1);
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
            if (creep.transfer(Game.spawns['spawn1'], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(Game.spawns['spawn1'], {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
    }

};

module.exports = roleRemoteHauler;
/**
 * Created by rober on 5/15/2017.
 */

function rangeSource(creep) {
    let source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
    if (creep.pos.getRangeTo(source) === 1) {
        return 1;
    }
    return null;
}
