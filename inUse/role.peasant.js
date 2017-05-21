let rolePeasant = {

    /** @param {Creep} creep **/
    run: function (creep) {
        //BORDER CHECK
        let nextStepIntoRoom = require('module.borderChecks');
        let isOnBorder = require('module.borderChecks');
        if(isOnBorder(creep) === true){
            nextStepIntoRoom(creep);
        }
        if (creep.carry.energy < creep.carryCapacity) {
            if (creep.memory.assignedSource && creep.moveTo(Game.getObjectById(creep.memory.assignedSource)) !== ERR_NO_PATH){
                source = Game.getObjectById(creep.memory.assignedSource);
            }else if (!source) {
                var source = findSource(creep);
            }
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
            }
        } else {
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