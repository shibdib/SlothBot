var roleDumpTruck = {

    /** @param {Creep} creep **/
    run: function (creep) {

        if (creep.carry.energy < 50) {
            creep.memory.hauling = false;
        }
        if (creep.memory.hauling === false) {
                findContainer(creep);
                let closestContainer = Game.getObjectById(creep.memory.container);
                if (closestContainer && creep.moveTo(creep.memory.container) !== ERR_NO_PATH) {
                    if (creep.withdraw(closestContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(closestContainer, {visualizePathStyle: {stroke: '#ffaa00'}});
                    }
                } else {
                    var energy = creep.pos.findClosestByRange(FIND_DROPPED_ENERGY, {filter: (s) => s.amount > 50});
                    if (energy) {
                        if (creep.pickup(energy) === ERR_NOT_IN_RANGE) {
                            creep.moveTo(energy, {visualizePathStyle: {stroke: '#ffaa00'}});
                        }
                    }
                }
            }

        //Haul to spawn/extension
        if (creep.carry.energy >= 50) {
            creep.memory.hauling = true;
            findBuilder(creep);
            let target = Game.getObjectById(creep.memory.builderID);
            if (target) {
                target.memory.incomingEnergy = creep.id;
                if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }else{
                var newTarget = findNewBuilder(creep);
                newTarget = Game.getObjectById(newTarget);
                if (newTarget) {
                    newTarget.memory.incomingEnergy = creep.id;
                    newTarget.memory.incomingCounter = 0;
                    if (creep.transfer(newTarget, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(newTarget, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
                    }
                }else {
                    creep.moveTo(Game.flags.haulers);
                }
            }
        }
    }

};

module.exports = roleDumpTruck;
/**
 * Created by rober on 5/15/2017.
 */



function findContainer(creep) {

    var container = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType == STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 1000});
    if (container) {
        creep.memory.container = container.id;
        return container.id;
    }

    var container = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType == STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 500});
    if (container) {
        creep.memory.container = container.id;
        return container.id;
    }

    var container = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType == STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 100});
    if (container) {
        creep.memory.container = container.id;
        return container.id;
    }
    return null;
}

function findBuilder(creep) {
    var stationaryBuilder = creep.pos.findClosestByRange(_.filter(Game.creeps, (builder) => builder.memory.incomingEnergy === creep.id));
    if (stationaryBuilder) {
        creep.memory.builderID = stationaryBuilder.id;
        return stationaryBuilder.id;
    }
    return null;
}

function findNewBuilder(creep) {
    var stationaryBuilder = creep.pos.findClosestByRange(_.filter(Game.creeps, (builder) => builder.memory.needEnergy === true && builder.memory.incomingEnergy === false));
    if (stationaryBuilder) {
        creep.memory.builderID = stationaryBuilder.id;
        creep.memory.haulCounter = 0;
        return stationaryBuilder.id;
    }
    return null;
}
