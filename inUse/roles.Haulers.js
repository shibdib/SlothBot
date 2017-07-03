let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');
let profiler = require('screeps-profiler');


function Manager(creep) {
    if (creep.memory.role === "mineralHauler") {
        mineralHauler(creep);
    } else if (creep.memory.role === "labTech") {
        labTech(creep);
    } else if (creep.memory.role === "basicHauler") {
        basicHauler(creep);
    } else if (creep.memory.role === "pawn" || creep.memory.role === 'filler' || creep.memory.role === 'getter' || creep.memory.role === 'hauler') {
        let storage = _.pluck(_.filter(spawn.room.memory.structureCache, 'type', 'storage'), 'id')[0];
        let filler = _.filter(Game.creeps, (creep) => creep.memory.role === 'filler' && creep.memory.assignedRoom === creep.room.name);
        let getter = _.filter(Game.creeps, (creep) => creep.memory.role === 'getter' && creep.memory.assignedRoom === creep.room.name);
        let hauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'hauler' && creep.memory.assignedRoom === creep.room.name);
        if (storage.store[RESOURCE_ENERGY] < 25000 && filler.length >= 1 && getter.length <= 2 && (creep.memory.role === 'hauler' || creep.memory.role === 'pawn')) {
            creep.memory.role = 'getter';
        } else if (storage.store[RESOURCE_ENERGY] < 25000 && filler.length === 0) {
            creep.memory.role = 'filler';
        } else if (storage.store[RESOURCE_ENERGY] >= 30000 && filler.length >= 1 && hauler.length <= 2 && (creep.memory.role === 'getter' || creep.memory.role === 'pawn')) {
            creep.memory.role = 'hauler';
        }
        if (creep.memory.role === 'filler') {
            filler(creep);
            return;
        }
        if (creep.memory.role === 'getter') {
            getter(creep);
            return;
        }
        if (creep.memory.role === 'hauler') {
            hauler(creep);
        }
    }
}
module.exports.Manager = profiler.registerFN(Manager, 'managerHaulers');

/**
 * @return {null}
 */
function basicHauler(creep) {
    //INITIAL CHECKS
    borderChecks.borderCheck(creep);
    borderChecks.wrongRoom(creep);

    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy > creep.carryCapacity / 2) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        if (creep.memory.energyDestination) {
            creepTools.withdrawEnergy(creep);
        } else {
            creepTools.findEnergy(creep, true);
        }
    } else {
        if (creep.memory.storageDestination) {
            let storageItem = Game.getObjectById(creep.memory.storageDestination);
            if (creep.transfer(storageItem, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.travelTo(storageItem);
            } else {
                creep.memory.storageDestination = null;
                creep.memory.path = null;
            }
            return null;
        }
        creepTools.findEssentials(creep);
    }
}
basicHauler = profiler.registerFN(basicHauler, 'basicHaulerHaulers');

/**
 * @return {null}
 */
function hauler(creep) {
    if (!creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE})) {
        creep.memory.role = 'basicHauler';
    }
    //INITIAL CHECKS
    borderChecks.borderCheck(creep);
    borderChecks.wrongRoom(creep);

    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy > creep.carryCapacity / 2) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        if (creep.memory.energyDestination) {
            creepTools.withdrawEnergy(creep);
        } else {
            creepTools.findEnergy(creep, true);
        }
    } else {
        if (creep.memory.storageDestination) {
            let storageItem = Game.getObjectById(creep.memory.storageDestination);
            if (creep.transfer(storageItem, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.travelTo(storageItem);
            } else {
                creep.memory.storageDestination = null;
                creep.memory.path = null;
            }
            return null;
        }
        if (!creepTools.findDeliveries(creep)) {
            creepTools.findEssentials(creep);
        }
    }
}
hauler = profiler.registerFN(hauler, 'haulerHaulers');

/**
 * @return {null}
 */
function filler(creep) {
    if (!creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE})) {
        creep.memory.role = 'basicHauler';
    }
    //INITIAL CHECKS
    borderChecks.borderCheck(creep);
    borderChecks.wrongRoom(creep);

    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy > creep.carryCapacity / 2) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        if (creep.memory.storage) {
            if (creep.withdraw(Game.getObjectById(creep.memory.storage), RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.travelTo(Game.getObjectById(creep.memory.storage));
            }
        } else if (!creep.memory.storage) {
            let storage = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'storage'), 'id');
            if (storage.length > 0) {
                creep.memory.storage = storage[0];
            } else {
                creep.memory.storage = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE}).id;
            }
        }
    } else {
        if (creep.memory.storageDestination) {
            let storageItem = Game.getObjectById(creep.memory.storageDestination);
            if (creep.transfer(storageItem, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.travelTo(storageItem);
            } else {
                creep.memory.storageDestination = null;
                creep.memory.path = null;
            }
            return null;
        }
        creepTools.findEssentials(creep);
    }
}
filler = profiler.registerFN(filler, 'fillerHaulers');

/**
 * @return {null}
 */
function getter(creep) {
    if (!creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE})) {
        creep.memory.role = 'basicHauler';
    }
    //INITIAL CHECKS
    borderChecks.borderCheck(creep);
    borderChecks.wrongRoom(creep);

    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy > creep.carryCapacity / 2) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        if (creep.memory.energyDestination) {
            creepTools.withdrawEnergy(creep);
        } else {
            creepTools.findEnergy(creep, true);
        }
    } else {
        creepTools.findStorage(creep);
        if (creep.memory.storage) {
            if (creep.transfer(Game.getObjectById(creep.memory.storage), RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.travelTo(Game.getObjectById(creep.memory.storage));
            }
        } else if (!creep.memory.storage) {
            let storage = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'storage'), 'id');
            if (storage.length > 0) {
                creep.memory.storage = storage[0];
            }
        }
    }
}
getter = profiler.registerFN(getter, 'getterHaulers');

/**
 * @return {null}
 */
function labTech(creep) {
    //INITIAL CHECKS
    borderChecks.borderCheck(creep);
    borderChecks.wrongRoom(creep);
    if (_.sum(creep.carry) === 0) {
        creep.memory.hauling = false;
    }
    if (_.sum(creep.carry) > 0) {
        creep.memory.hauling = true;
    }

    for (let key in creep.room.memory.reactions) {
        if (creep.room.memory.reactions[key].assignedHub) {
            if (Game.getObjectById(creep.room.memory.reactions[key].lab1).mineralAmount < 500) {
                creep.memory.haulingMineral = creep.room.memory.reactions[key].input1;
                creep.memory.deliverTo = creep.room.memory.reactions[key].lab1;
            } else if (Game.getObjectById(creep.room.memory.reactions[key].lab2).mineralAmount < 500) {
                creep.memory.haulingMineral = creep.room.memory.reactions[key].input2;
                creep.memory.deliverTo = creep.room.memory.reactions[key].lab2;
            } else if (Game.getObjectById(creep.room.memory.reactions[key].outputLab).energy < 500) {
                creep.memory.haulingMineral = RESOURCE_ENERGY;
                creep.memory.deliverTo = creep.room.memory.reactions[key].outputLab;
            }
        }
    }
    if (creep.memory.hauling === false) {
        if (creep.memory.deliverTo && creep.memory.haulingMineral) {
            let storage = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE && s.store[creep.memory.haulingMineral] > 0});
            let terminal = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TERMINAL && s.store[creep.memory.haulingMineral] > 0});
            if (Game.getObjectById(creep.memory.deliverTo).mineralType !== creep.memory.haulingMineral) {
                if (creep.withdraw(Game.getObjectById(creep.memory.deliverTo), Game.getObjectById(creep.memory.deliverTo).mineralType) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(Game.getObjectById(creep.memory.deliverTo));
                }
            } else if (storage) {
                if (creep.withdraw(storage, creep.memory.haulingMineral) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(storage);
                }
            } else if (terminal) {
                if (creep.withdraw(terminal, creep.memory.haulingMineral) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(terminal);
                }
            } else {
                creep.travelTo(storage);
            }
        } else {
            let lab = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_LAB && s.mineralAmount > 0});
            if (lab && creep.withdraw(lab, lab.mineralType) === ERR_NOT_IN_RANGE) {
                creep.travelTo(lab);
            } else {
                creep.travelTo(creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_LAB}));
            }
        }
    } else {
        if (!creep.carry[creep.memory.haulingMineral] || !creep.memory.haulingMineral) {
            let storage = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE});
            for (const resourceType in creep.carry) {
                if (creep.transfer(storage, resourceType) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(storage);
                }
            }
        } else if (creep.memory.deliverTo) {
            let storageItem = Game.getObjectById(creep.memory.deliverTo);
            if (creep.transfer(storageItem, creep.memory.haulingMineral) === ERR_NOT_IN_RANGE) {
                creep.travelTo(storageItem);
            }
        }
    }
}
labTech = profiler.registerFN(labTech, 'labTechHaulers');

/**
 * @return {null}
 */
function mineralHauler(creep) {
    //INITIAL CHECKS
    borderChecks.borderCheck(creep);
    borderChecks.wrongRoom(creep);

    if (_.sum(creep.carry) === 0) {
        creep.memory.hauling = false;
    }
    if (_.sum(creep.carry) > creep.carryCapacity / 2) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        if (creep.memory.mineralDestination) {
            let mineralContainer = Game.getObjectById(creep.memory.mineralDestination);
            if (mineralContainer) {
                if (mineralContainer.pos.getRangeTo(Game.getObjectById(creep.memory.assignedMineral)) < 5) {
                    for (const resourceType in mineralContainer.store) {
                        if (creep.withdraw(mineralContainer, resourceType) === ERR_NOT_IN_RANGE) {
                            creep.travelTo(mineralContainer);
                        }
                    }
                }
            }
        } else {
            let container = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] === 0});
            if (container.id) {
                if (container.pos.getRangeTo(Game.getObjectById(creep.memory.assignedMineral)) < 5) {
                    creep.travelTo(container);
                    creep.memory.mineralDestination = container.id;
                } else {
                    creep.travelTo(Game.getObjectById(creep.memory.assignedMineral))
                }
            } else {
                creep.travelTo(Game.getObjectById(creep.memory.assignedMineral))
            }
        }
    } else {
        if (!creep.memory.terminalID) {
            let terminal = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TERMINAL});
            if (terminal) {
                creep.memory.terminalID = terminal.id;
            }
        }
        if (creep.memory.terminalID) {
            let terminal = Game.getObjectById(creep.memory.terminalID);
            if (terminal) {
                if (_.sum(terminal.store) !== terminal.storeCapacity) {
                    for (const resourceType in creep.carry) {
                        if (creep.transfer(terminal, resourceType) === ERR_NOT_IN_RANGE) {
                            creep.travelTo(terminal);
                        }
                    }
                }
            }
        }
    }
}
mineralHauler = profiler.registerFN(mineralHauler, 'mineralHaulerHaulers');