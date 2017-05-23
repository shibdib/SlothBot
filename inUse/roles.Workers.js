let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');
let pathing = require('module.pathFinder');

module.exports.Worker = function (creep) {
    //BORDER CHECK
    if (borderChecks.wrongRoom(creep) !== false){
        return;
    }
    if (borderChecks.isOnBorder(creep) === true) {
        borderChecks.nextStepIntoRoom(creep);
    }
    if (creepTools.rangeSource(creep) === 1 && creep.memory.harvesting !== true) {
        creep.moveTo(Game.flags.bump, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
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
        let repairNeeded = creepTools.findRepair(creep);
        if (repairNeeded) {
            repairNeeded = Game.getObjectById(repairNeeded);
            if (creep.repair(repairNeeded) === ERR_NOT_IN_RANGE) {
                if (creep.moveByPath(creep.memory.path) === OK) {
                } else {
                    creep.memory.path = pathing.Move(creep,repairNeeded);
                }
            }
        } else if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
            if (creep.moveByPath(creep.memory.path) === OK) {
            } else {
                creep.memory.path = pathing.Move(creep,creep.room.controller);
            }
        }
    }
    else {
        let container = creepTools.findContainer(creep);
        container = Game.getObjectById(container);
        if (container) {
            if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                if (creep.moveByPath(creep.memory.path) === OK) {
                } else {
                    creep.memory.path = pathing.Move(creep,container);
                }
            }
        }
        if (!container) {
            const energy = creep.pos.findClosestByRange(FIND_DROPPED_ENERGY);
            if (energy) {
                if (creep.pickup(energy) === ERR_NOT_IN_RANGE) {
                    if (creep.moveByPath(creep.memory.path) === OK) {
                    } else {
                        creep.memory.path = pathing.Move(creep,energy);
                    }
                }
            } else {
                let source = creepTools.findSource(creep);
                if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                    if (creep.moveByPath(creep.memory.path) === OK) {
                    } else {
                        creep.memory.path = pathing.Move(creep,source);
                    }
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
    if (creep.carry.energy > 0) {
        let containerID = creepTools.harvestDeposit(creep);
        if (containerID) {
            let container = Game.getObjectById(containerID);
            if (container) {
                creep.transfer(container, RESOURCE_ENERGY);
            }
        } else {
            let buildSite = Game.getObjectById(creepTools.containerBuilding(creep));
            if (buildSite) {
                creep.build(buildSite);
            } else {
                creepTools.harvesterContainerBuild(creep);
            }
        }
    }
    if (creep.carry.energy < creep.carryCapacity) {
        if (creep.memory.assignedSource && creep.moveTo(Game.getObjectById(creep.memory.assignedSource)) !== ERR_NO_PATH){
            source = Game.getObjectById(creep.memory.assignedSource);
        }else if (!source) {
            var source = creepTools.findSource(creep);
        }
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            if (creep.moveByPath(creep.memory.path) === OK) {
            } else {
                creep.memory.path = pathing.Move(creep,source);
            }
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
        let build = Game.getObjectById(creepTools.wallBuilding(creep));
        let repairNeeded = Game.getObjectById(creepTools.wallRepair(creep));
        if (build) {
            if (creep.build(build) === ERR_INVALID_TARGET) {
                if (creep.moveByPath(creep.memory.path) === OK) {
                } else {
                    creep.memory.path = pathing.Move(creep,build);
                }
            } else {
                if (creep.build(build) === ERR_NOT_IN_RANGE) {
                    if (creep.moveByPath(creep.memory.path) === OK) {
                    } else {
                        creep.memory.path = pathing.Move(creep,build);
                    }
                }
            }
        } else {
            if (repairNeeded) {
                if (creep.repair(repairNeeded) === ERR_NOT_IN_RANGE) {
                    if (creep.moveByPath(creep.memory.path) === OK) {
                    } else {
                        creep.memory.path = pathing.Move(creep,repairNeeded);
                    }
                }
            }
        }
        if (!repairNeeded && !build){
            if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                if (creep.moveByPath(creep.memory.path) === OK) {
                } else {
                    creep.memory.path = pathing.Move(creep,creep.room.controller);
                }
            }
        }
    }
    else {
        let container = creepTools.findContainer(creep);
        container = Game.getObjectById(container);
        if (container) {
            if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                if (creep.moveByPath(creep.memory.path) === OK) {
                } else {
                    creep.memory.path = pathing.Move(creep,container);
                }
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
            if (creep.moveByPath(creep.memory.path) === OK) {
            } else {
                creep.memory.path = pathing.Move(creep,creep.room.controller);
            }
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

    if (creep.memory.constructionSite) {
        target = Game.getObjectById(creep.memory.constructionSite);
        if (target && target.progress < target.progressTotal) {
            if (creep.build(target) === ERR_INVALID_TARGET) {
                creep.moveTo(Game.flags.haulers, {reusePath: 20}, {
                    visualizePathStyle: {stroke: '#ffffff'}
                });
            } else {
                if (creep.build(target) === ERR_NOT_IN_RANGE) {
                    if (creep.moveByPath(creep.memory.path) === OK) {
                    } else {
                        creep.memory.path = pathing.Move(creep,target);
                    }
                }
            }
        } else {
            creep.memory.constructionSite = null;
        }
    } else {
        var target = creepTools.findConstruction(creep);
        target = Game.getObjectById(target);
        if (target) {
            if (creep.build(target) === ERR_INVALID_TARGET) {
                creep.moveTo(Game.flags.haulers, {reusePath: 20}, {
                    visualizePathStyle: {stroke: '#ffffff'}
                });
            } else {
                if (creep.build(target) === ERR_NOT_IN_RANGE) {
                    if (creep.moveByPath(creep.memory.path) === OK) {
                    } else {
                        creep.memory.path = pathing.Move(creep,target);
                    }
                }
            }
        }
        if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
            if (creep.moveByPath(creep.memory.path) === OK) {
            } else {
                creep.memory.path = pathing.Move(creep,creep.room.controller);
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
            let target = creepTools.findRoadWork(creep);
            target = Game.getObjectById(target);
            if (target) {
                if (creep.build(target) === ERR_INVALID_TARGET) {
                    if (creep.moveByPath(creep.memory.path) === OK) {
                    } else {
                        creep.memory.path = pathing.Move(creep,target);
                    }
                } else {
                    if (creep.build(target) === ERR_NOT_IN_RANGE) {
                        if (creep.moveByPath(creep.memory.path) === OK) {
                        } else {
                            creep.memory.path = pathing.Move(creep,target);
                        }
                    }
                }
            }
        } else {
            let container = creepTools.findContainer(creep);
            if (container) {
                if (creep.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    if (creep.moveByPath(creep.memory.path) === OK) {
                    } else {
                        creep.memory.path = pathing.Move(creep,spawn);
                    }
                }
            } else {
                if (creep.memory.spawnID && Game.getObjectById(creep.memory.spawnID)) {
                    var spawn = Game.getObjectById(creep.memory.spawnID);
                } else {
                    var spawn = creepTools.findSpawn(creep);
                }
                if (creep.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    if (creep.moveByPath(creep.memory.path) === OK) {
                    } else {
                        creep.memory.path = pathing.Move(creep,spawn);
                    }
                }
            }
        }
    }
};