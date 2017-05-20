var roleBasicHauler = {

    /** @param {Creep} creep **/
    run: function (creep) {
        if (creep.carry.energy < creep.carryCapacity) {
            if (creep.memory.energyTarget && Game.getObjectById(creep.memory.energyTarget)) {
                var energy = creep.pos.findClosestByPath(creep.memory.energyTarget);
            } else {
                var energy = creep.pos.findClosestByPath(FIND_DROPPED_ENERGY);
            }
            if (energy) {
                creep.memory.energyTarget = energy[0].id;
                if (creep.pickup(energy[0]) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(energy[0], {visualizePathStyle: {stroke: '#ffaa00'}});
                }
            }
        } else {
            if (creep.memory.spawnID && Game.getObjectById(creep.memory.spawnID)) {
                var spawn = creep.pos.findClosestByPath(creep.memory.spawnID);
            } else {
                var spawn = findSpawn(creep);
            }
            if (creep.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(spawn, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
    }

};

module.exports = roleBasicHauler;
/**
 * Created by rober on 5/15/2017.
 */

function findSpawn(creep) {
    let spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
    if (spawn) {
        if (creep.moveTo(spawn) !== ERR_NO_PATH) {
            if (spawn.id) {
                creep.memory.spawnID = spawn.id;
                return spawn;
            }
        }
    }
}
