var roleWallRepairer = {

    /** @param {Creep} creep **/
    run: function (creep) {
//BORDER CHECK
        let borderChecks = require('module.borderChecks');
        if(borderChecks.isOnBorder(creep) === true){
            borderChecks.nextStepIntoRoom(creep);
        }
        if (rangeSource(creep) === 1) {
            creep.moveTo(Game.flags.bump);
            return null;
        }

        if (creep.carry.energy === 0) {
            creep.memory.working = null;
        }
        if (creep.carry.energy === creep.carryCapacity) {
            creep.memory.working = true;
        }

        if (creep.memory.working) {
            var repairNeeded = findRepair(creep);
            if (repairNeeded) {
                repairNeeded = Game.getObjectById(repairNeeded);
                if (creep.repair(repairNeeded) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(repairNeeded, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
                }
            } else
            var target = Game.getObjectById(findConstruction(creep));
            if (target) {
                if (creep.build(target) === ERR_INVALID_TARGET) {
                    creep.moveTo(Game.flags.haulers, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
                } else {
                    if (creep.build(target) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(target, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
                    }
                }
            } else {
                if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(creep.room.controller, {reusePath: 20}, {
                        visualizePathStyle: {stroke: '#ffffff'},
                        maxRooms: 1
                    });
                }
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
                creep.moveTo(Game.flags.haulers);
            }
        }
    }
};

module.exports = roleWallRepairer;

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

    site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 20000});
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_WALL && s.hits < 25000});
    }
    if (site !== null && site !== undefined) {
        return site.id;
    }
}

function findConstruction(creep) {

    site = creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES, {filter: (s) => s.structureType === STRUCTURE_WALL});
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES, {filter: (s) => s.structureType === STRUCTURE_RAMPART});
    }
    if (site !== null && site !== undefined) {
        creep.memory.constructionSite = site.id;
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
