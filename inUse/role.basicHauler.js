let pathFinder = require('module.pathFinder');
var roleBasicHauler = {

    /** @param {Creep} creep **/
    run: function (creep) {
        if (creep.carry.energy !== creep.carryCapacity) {
            creep.memory.hauling = false;
        }
        if (creep.carry.energy === creep.carryCapacity) {
            creep.memory.hauling = true;
        }
        if (creep.memory.hauling === false) {
                let goals = _.map(creep.room.findClosestByRange(FIND_DROPPED_ENERGY), function (source) {
                return {pos: source.pos}});

                var energy = creep.pos.findClosestByRange(FIND_DROPPED_ENERGY);
                if (energy) {
                    if (creep.pickup(energy) === ERR_NOT_IN_RANGE) {
                        creep.move(creep.pos.getDirectionTo(pathFinder(creep,goals,false)));
                    }
                }
        } else {
            if (creep.memory.spawnID && Game.getObjectById(creep.memory.spawnID)) {
                var spawn = Game.getObjectById(creep.memory.spawnID);
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
