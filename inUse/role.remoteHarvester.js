var roleRemoteHarvester = {

    /** @param {Creep} creep **/
    run: function (creep) {
        //Initial move
        if (!creep.memory.destinationReached) {
            creep.moveTo(Game.flags[creep.memory.destination], {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
            if (creep.pos.getRangeTo(Game.flags[creep.memory.destination]) <= 1) {
                creep.memory.destinationReached = true;
            }
        } else
        if (creep.carry.energy < creep.carryCapacity) {
            if (creep.memory.assignedSource && creep.moveTo(Game.getObjectById(creep.memory.assignedSource)) !== ERR_NO_PATH){
                source = Game.getObjectById(creep.memory.assignedSource);
            }else if (!source) {
                var source = findSource(creep);
            }
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
            }
        }else{
            creep.drop(RESOURCE_ENERGY);
        }
    }
};

module.exports = roleRemoteHarvester;

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