let pathFinder = require('module.pathFinder');
var roleWorker = {

    /** @param {Creep} creep **/
    run: function (creep) {
//BORDER CHECK
        let borderChecks = require('module.borderChecks');
        if(borderChecks.isOnBorder(creep) === true){
            borderChecks.nextStepIntoRoom(creep);
        }
        if (rangeSource(creep) === 1 && creep.memory.harvesting !== true) {
            creep.moveTo(Game.flags.bump, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
            return null;
        }

        if (creep.carry.energy === 0) {
            creep.memory.working = null;
        }
        if (creep.carry.energy === creep.carryCapacity) {
            creep.memory.harvesting = false;
            creep.memory.working = true;
        }

        if (creep.memory.working) {
            var repairNeeded = findRepair(creep);
            if (repairNeeded) {
                repairNeeded = Game.getObjectById(repairNeeded);
                if (creep.repair(repairNeeded) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(repairNeeded, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
                }
            } else if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
            }
        }
        else {
            var container = findContainer(creep);
            container = Game.getObjectById(container);
            if (container) {
                if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(container, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
                }
            }
            if (!container) {
                var energy = creep.pos.findClosestByRange(FIND_DROPPED_ENERGY);
                if (energy) {
                    if (creep.pickup(energy) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(energy, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
                    }
                } else {
                    let source = findSource(creep);
                    if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(source, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
                        creep.memory.harvesting = true;
                    }
                }
            }
        }
    }
};

module.exports = roleWorker;

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

function findRepair(creep) {

    site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_SPAWN && s.hits < s.hitsMax});
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 100});
    }
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_EXTENSION && s.hits < s.hitsMax});
    }
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_RAMPART && s.hits < s.hitsMax});
    }
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.hits < 1000});
    }
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax / 2});
    }
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_WALL && s.hits < 1000});
    }
    if (site !== null && site !== undefined) {
        return site.id;
    }
}

function rangeSource(creep) {
    var source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
    if (creep.pos.getRangeTo(source) === 1) {
        return 1;
    }
    return null;
}

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
