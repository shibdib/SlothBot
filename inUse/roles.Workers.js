let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');

module.exports.Worker = function (creep) {
    //BORDER CHECK
    if (borderChecks.wrongRoom(creep) !== false){
        return;
    }
    if (borderChecks.isOnBorder(creep) === true) {
        borderChecks.nextStepIntoRoom(creep);
    }
    if (creepTools.rangeSource(creep) === 1 && creep.memory.harvesting !== true) {
        creep.moveTo(Game.flags.bump, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
        return;
    }

    if (creep.carry.energy === 0) {
        creep.memory.working = null;
    }
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.harvesting = false;
        creep.memory.working = true;
    }

    if (creep.memory.working) {
        var repairNeeded = creepTools.findRepair(creep);
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
        var container = creepTools.findContainer(creep);
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
                let source = creepTools.findSource(creep);
                if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(source, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
                    creep.memory.harvesting = true;
                }
            }
        }
    }
};

module.exports.Harvester = function (creep) {
    //BORDER CHECK
    if (borderChecks.wrongRoom(creep) !== false){
        return;
    }
    if (borderChecks.isOnBorder(creep) === true) {
        borderChecks.nextStepIntoRoom(creep);
    }
    if (creep.carry.energy < creep.carryCapacity || creep.carryCapacity === 0) {
        if (creep.memory.assignedSource && creep.moveTo(Game.getObjectById(creep.memory.assignedSource)) !== ERR_NO_PATH){
            source = Game.getObjectById(creep.memory.assignedSource);
        }else if (!source) {
            var source = creepTools.findSource(creep);
        }
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
        }
    }
};

module.exports.wallRepairer = function (creep) {
//BORDER CHECK
    if (borderChecks.wrongRoom(creep) !== false){
        return;
    }
    if (borderChecks.isOnBorder(creep) === true) {
        borderChecks.nextStepIntoRoom(creep);
    }
    if (creepTools.rangeSource(creep) === 1) {
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
        var repairNeeded = creepTools.wallRepair(creep);
        if (repairNeeded) {
            repairNeeded = Game.getObjectById(repairNeeded);
            if (creep.repair(repairNeeded) === ERR_NOT_IN_RANGE) {
                creep.moveTo(repairNeeded, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
            }
        } else
            var target = Game.getObjectById(creepTools.findConstruction(creep));
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
        var container = creepTools.findContainer(creep);
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

};

module.exports.Upgrader = function (creep) {
    //BORDER CHECK
    if (borderChecks.wrongRoom(creep) !== false){
        return;
    }
    if (borderChecks.isOnBorder(creep) === true) {
        borderChecks.nextStepIntoRoom(creep);
    }
    creepTools.dumpTruck(creep);

    if (creep.memory.upgrading && creep.carry.energy === 0) {
        creep.memory.upgrading = false;
    }
    if (!creep.memory.upgrading && creep.carry.energy > 0) {
        creep.memory.upgrading = true;
    }

    if (creep.memory.upgrading) {
        if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
            creep.moveTo(creep.room.controller, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
        }
    }
};

module.exports.Builder = function (creep) {
    //BORDER CHECK
    if (borderChecks.wrongRoom(creep) !== false){
        return;
    }
    if (borderChecks.isOnBorder(creep) === true) {
        borderChecks.nextStepIntoRoom(creep);
    }
    if (creepTools.rangeSource(creep) === 1) {
        creep.moveTo(Game.flags.bump);
        return;
    }
    creepTools.dumpTruck(creep);

    if (creep.memory.constructionSite && creep.carry.energy > 0) {
        target = Game.getObjectById(creep.memory.constructionSite);
        if (target && target.progress < target.progressTotal) {
            if (creep.build(target) === ERR_INVALID_TARGET) {
                creep.moveTo(Game.flags.haulers, {reusePath: 20}, {
                    visualizePathStyle: {stroke: '#ffffff'},
                    maxRooms: 1
                });
            } else {
                if (creep.build(target) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
                }
            }
        } else {
            creep.memory.constructionSite = null;
        }
    } else if (creep.carry.energy > 0) {
        var target = creepTools.findConstruction(creep);
        target = Game.getObjectById(target);
        if (target) {
            if (creep.build(target) === ERR_INVALID_TARGET) {
                creep.moveTo(Game.flags.haulers, {reusePath: 20}, {
                    visualizePathStyle: {stroke: '#ffffff'},
                    maxRooms: 1
                });
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
};

module.exports.RoadBuilder = function (creep) {
    //BORDER CHECK
    if (borderChecks.wrongRoom(creep) !== false){
        return;
    }
    if (borderChecks.isOnBorder(creep) === true) {
        borderChecks.nextStepIntoRoom(creep);
    }
    if (!creepTools.findSpawn(creep).memory.build === false) {
        if (creep.carry.energy > 0) {
            var target = creepTools.findRoadWork(creep);
            target = Game.getObjectById(target);
            if (target) {
                if (creep.build(target) === ERR_INVALID_TARGET) {
                    creep.moveTo(Game.flags.haulers, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
                } else {
                    if (creep.build(target) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(target, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
                    }
                }
            }
        } else {
            let container = creepTools.findContainer(creep);
            if (container) {
                if (creep.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(spawn, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
                }
            } else {
                if (creep.memory.spawnID && Game.getObjectById(creep.memory.spawnID)) {
                    var spawn = Game.getObjectById(creep.memory.spawnID);
                } else {
                    var spawn = creepTools.findSpawn(creep);
                }
                if (creep.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(spawn, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
                }
            }
        }
    }
};