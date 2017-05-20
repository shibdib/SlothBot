var roleExpediter = {

    /** @param {Creep} creep **/
    run: function (creep) {
        if (rangeSource(creep) === 1) {
            creep.moveTo(Game.flags.bump);
            return null;
        }
        if (rangeAssignment(creep) > 4) {
            var container = Game.getObjectById(creep.memory.assignedContainer);
            creep.moveTo(container);
            return null;
        }
        var energy = creep.pos.findInRange(FIND_DROPPED_ENERGY, 5);
        if (energy) {
            if (creep.pickup(energy[0]) === ERR_NOT_IN_RANGE) {
                creep.moveTo(energy[0], {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        }

        //Haul to container
        var container = Game.getObjectById(creep.memory.assignedContainer);
        if (container && creep.carry.energy === creep.carryCapacity) {
            if (creep.transfer(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(container, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
    }

};

module.exports = roleExpediter;
/**
 * Created by rober on 5/15/2017.
 */



function findContainer(creep) {

    container = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType == STRUCTURE_CONTAINER
})
    ;
    if (container !== null) {
        return container.id;
    }
    return null;
}


function findStationary(creep) {

    harvester = creep.pos.findClosestByRange(FIND_CREEPS, {filter: (s) => s.memory.role === 'stationaryHarvester'
})
    ;
    if (harvester !== null) {
        return harvester.id;
    }
    return null;
}

function rangeSource(creep) {
    var source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
    if (creep.pos.getRangeTo(source) === 1) {
        return 1;
    }
    return null;
}

function rangeAssignment(creep) {
    var container = Game.getObjectById(creep.memory.assignedContainer);
    var assignment = creep.pos.getRangeTo(container);
    if (assignment) {
        return assignment;
    }
    return null;
}
