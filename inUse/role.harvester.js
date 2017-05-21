var roleHarvester = {

    /** @param {Creep} creep **/
    run: function (creep) {
        //BORDER CHECK
        let nextStepIntoRoom = require('module.borderChecks');
        let isOnBorder = require('module.borderChecks');
        if(isOnBorder(creep) === true){
            nextStepIntoRoom(creep);
        }
        if (creep.carry.energy < creep.carryCapacity || creep.carryCapacity === 0) {
            if (creep.memory.assignedSource && creep.moveTo(Game.getObjectById(creep.memory.assignedSource)) !== ERR_NO_PATH){
                source = Game.getObjectById(creep.memory.assignedSource);
            }else if (!source) {
                var source = findSource(creep);
            }
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
            }
        }
    }
};

module.exports = roleHarvester;

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

function findDistantSource(creep) {
    creep.moveTo(Game.flags.scout1);
    var source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
    if (creep.moveTo(source) !== ERR_NO_PATH) {
        creep.memory.source = source.id;
        return source;
    }
}