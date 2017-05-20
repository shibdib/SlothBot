let rolePeasant = {

    /** @param {Creep} creep **/
    run: function (creep) {
        if (creep.carry.energy < creep.carryCapacity) {
            if (creep.memory.source && creep.moveTo(Game.getObjectById(creep.memory.source)) !== ERR_NO_PATH){
                source = Game.getObjectById(creep.memory.source);
            }else if (!source) {
                var source = findSource(creep);
            }
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source, {visualizePathStyle: {stroke: '#ffaa00'}});
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

module.exports = rolePeasant;

function findSource(creep) {
    var source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
    if (source) {
        if (creep.moveTo(source) !== ERR_NO_PATH) {
            if (source.id) {
                creep.memory.source = source.id;
                return source;
            }
        }
    }
    return null;
}

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