var roleHauler = {

    /** @param {Creep} creep **/
    run: function (creep) {
        //BORDER CHECK
        let nextStepIntoRoom = require('module.borderChecks');
        let isOnBorder = require('module.borderChecks');
        if(isOnBorder.run(creep) === true){
            nextStepIntoRoom.run(creep);
        }
        if (rangeSource(creep) === 1) {
            creep.moveTo(Game.flags.bump, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
            return null;
        }
        if (creep.carry.energy === 0) {
            creep.memory.hauling = false;
        }
        if (creep.carry.energy === creep.carryCapacity) {
            creep.memory.hauling = true;
        }
        if (creep.memory.hauling === false) {
            var container = Game.getObjectById(creep.memory.assignedContainer);
            if (container) {
                if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(container, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
                }
            }
        }

        //Haul to spawn/extension
        if (creep.memory.hauling === true) {
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
            }else{
                var tower = Game.getObjectById(findTower(creep));
                if (tower) {
                    if (creep.transfer(tower, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(tower, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
                    }
                }
            }
        }
    }

};

module.exports = roleHauler;
/**
 * Created by rober on 5/15/2017.
 */

function findTower(creep) {

    var tower = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType == STRUCTURE_TOWER && s.energy !== s.energyCapacity});
    if (tower) {
        return tower.id;
    }
    return null;
}

function findContainer(creep) {

    container = creep.pos.findClosestByRange(FIND_STRUCTURES, {
        filter: (s) => s.structureType == STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
    })
    ;
    if (container !== null) {
        creep.memory.container = container.id;
        return container.id;
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
