let borderChecks = require('inUse/module.creepRestrictions');
let creepTools = require('inUse/module.creepFunctions');
var roleStationaryBuilder = {

    /** @param {Creep} creep **/
    run: function (creep) {
//BORDER CHECK
        if(borderChecks.isOnBorder(creep) === true){
            borderChecks.nextStepIntoRoom(creep);
        }
        if (creepTools.rangeSource(creep) === 1) {
            creep.moveTo(Game.flags.bump);
            return null;
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
                        creep.moveTo(target, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
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
                        creep.moveTo(target, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
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
    }
};

module.exports = roleStationaryBuilder;