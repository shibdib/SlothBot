let profiler = require('screeps-profiler');


function Manager(creep) {
    if (creep.memory.role === "mineralHauler") {
        mineralHauler(creep);
    } else if (creep.memory.role === "labTech") {
        labTech(creep);
    } else if (creep.memory.role === "basicHauler") {
        basicHauler(creep);
    } else if (creep.memory.role === "resupply") {
        resupply(creep);
    } else if (creep.memory.role === "pawn") {
        let storage = Game.getObjectById(_.pluck(_.filter(creep.room.memory.structureCache, 'type', 'storage'), 'id')[0]);
        let roomCreeps = _.filter(Game.creeps, (c) => c.memory.assignedRoom === creep.room.name);
        let fillers = _.filter(roomCreeps, (c) => c.memory.role === 'filler');
        let getters = _.filter(roomCreeps, (c) => c.memory.role === 'getter');
        if (fillers.length < 2) {
            creep.memory.role = 'filler';
        } else if (getters.length < 2) {
            creep.memory.role = 'getter';
        }
    } else if (creep.memory.role === 'filler') {
        filler(creep);
    } else if (creep.memory.role === 'getter') {
        getter(creep);
    } else if (creep.memory.role === 'hauler') {
        hauler(creep);
    }
}
module.exports.Manager = profiler.registerFN(Manager, 'managerHaulers');

/**
 * @return {null}
 */
function basicHauler(creep) {
    let basicHaulers = _.filter(Game.creeps, (creep) => creep.memory.role === 'basicHauler' && creep.memory.assignedRoom === creep.room.name);
    if (creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE}) && basicHaulers.length >= 2) {
        creep.memory.role = 'pawn';
    }
    //INITIAL CHECKS
    creep.borderCheck();
    creep.wrongRoom();
    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy > creep.carryCapacity / 2) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        if (creep.memory.energyDestination) {
            creep.withdrawEnergy();
        } else {
            creep.findEnergy();
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
        } else if (!creep.findEssentials()) {
            creep.idleFor(10);
        }
    }
}
basicHauler = profiler.registerFN(basicHauler, 'basicHaulerHaulers');

/**
 * @return {null}
 */
function hauler(creep) {
    //INITIAL CHECKS
    creep.borderCheck();
    creep.wrongRoom();
    if (creep.carry.energy === 0) {
        creep.memory.storageDestination = undefined;
        creep.memory.hauling = false;
    }
    if (creep.carry.energy > creep.carryCapacity / 2) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        if (creep.memory.energyDestination) {
            creep.withdrawEnergy();
        } else {
            creep.findEnergy();
        }
    } else if (creep.memory.storageDestination) {
        let storageItem = Game.getObjectById(creep.memory.storageDestination);
        if (creep.transfer(storageItem, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.travelTo(storageItem, {movingTarget: true, offRoad: true});
        } else {
            creep.memory.storageDestination = null;
            creep.memory.path = null;
        }
        return null;
    } else {
        creep.findDeliveries()
    }
}
hauler = profiler.registerFN(hauler, 'haulerHaulers');

/**
 * @return {null}
 */
function filler(creep) {
    let getters = _.filter(Game.creeps, (creep) => (creep.memory.role === 'getter' || creep.memory.role === 'basicHauler') && creep.memory.assignedRoom === creep.room.name);
    if (getters.length === 0) {
        creep.memory.role = 'basicHauler';
    }
    if (!creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE})) {
        creep.memory.role = 'basicHauler';
    }
    //INITIAL CHECKS
    creep.borderCheck();
    creep.wrongRoom();
    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy > creep.carryCapacity / 2) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        if (creep.memory.storage) {
            let storage = Game.getObjectById(creep.memory.storage);
            if (storage.store[RESOURCE_ENERGY] === 0) {
                creep.idleFor(10);
            } else if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.travelTo(storage);
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
                creep.travelTo(storageItem, {offRoad: true});
            } else {
                creep.memory.storageDestination = null;
            }
        } else if (!creep.findEssentials()) {
            creep.idleFor(10);
        }
    }
}
filler = profiler.registerFN(filler, 'fillerHaulers');

/**
 * @return {null}
 */
function getter(creep) {
    let fillers = _.filter(Game.creeps, (creep) => (creep.memory.role === 'filler' || creep.memory.role === 'basicHauler') && creep.memory.assignedRoom === creep.room.name);
    if (fillers.length === 0) {
        creep.memory.role = 'basicHauler';
    }
    if (!creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE})) {
        creep.memory.role = 'basicHauler';
    }
    //INITIAL CHECKS
    creep.borderCheck();
    creep.wrongRoom();
    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy > creep.carryCapacity / 2) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        if (creep.memory.energyDestination) {
            creep.withdrawEnergy();
        } else if (!creep.getEnergy()) {
            creep.idleFor(10);
        }
    } else {
        if (creep.memory.storage) {
            if (creep.transfer(Game.getObjectById(creep.memory.storage), RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.travelTo(Game.getObjectById(creep.memory.storage), {offRoad: true});
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
    creep.borderCheck();
    creep.wrongRoom();
    if (_.sum(creep.carry) === 0) {
        creep.memory.hauling = false;
    }
    if (_.sum(creep.carry) > 0) {
        creep.memory.hauling = true;
    }
    for (let key in creep.room.memory.reactions) {
        if (creep.room.memory.reactions[key].assignedHub) {
            if (Game.getObjectById(creep.room.memory.reactions[key].lab1).mineralAmount < 500 && Game.getObjectById(creep.room.memory.reactions[key].lab1).mineralAmount !== 3000) {
                creep.memory.haulingMineral = creep.room.memory.reactions[key].input1;
                creep.memory.deliverTo = creep.room.memory.reactions[key].lab1;
                break;
            } else if (Game.getObjectById(creep.room.memory.reactions[key].lab2).mineralAmount < 500 && Game.getObjectById(creep.room.memory.reactions[key].lab2).mineralAmount !== 3000) {
                creep.memory.haulingMineral = creep.room.memory.reactions[key].input2;
                creep.memory.deliverTo = creep.room.memory.reactions[key].lab2;
                break;
            } else if (Game.getObjectById(creep.room.memory.reactions[key].outputLab).energy < Game.getObjectById(creep.room.memory.reactions[key].outputLab).energyCapacity) {
                creep.memory.haulingMineral = RESOURCE_ENERGY;
                creep.memory.deliverTo = creep.room.memory.reactions[key].outputLab;
                break;
            } else {
                creep.memory.haulingMineral = undefined;
                creep.memory.deliverTo = creep.room.memory.reactions[key].lab1;
            }
        }
    }
    if (!creep.memory.haulingMineral) {
        if (creep.pos.getRangeTo(Game.getObjectById(creep.memory.deliverTo)) > 1) {
            creep.travelTo(Game.getObjectById(creep.memory.deliverTo));
        } else {
            creep.idleFor(15);
        }
    } else if (creep.memory.hauling === false) {
        if (creep.memory.deliverTo && creep.memory.haulingMineral) {
            let structure = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.store && s.store[creep.memory.haulingMineral] > 0});
            if (Game.getObjectById(creep.memory.deliverTo).mineralType && Game.getObjectById(creep.memory.deliverTo).mineralType !== creep.memory.haulingMineral) {
                if (creep.withdraw(Game.getObjectById(creep.memory.deliverTo), Game.getObjectById(creep.memory.deliverTo).mineralType) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(Game.getObjectById(creep.memory.deliverTo));
                }
            } else if (structure) {
                if (creep.withdraw(structure, creep.memory.haulingMineral) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(structure);
                }
            } else {
                creep.travelTo(Game.getObjectById(creep.memory.deliverTo));
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
    creep.borderCheck();
    creep.wrongRoom();
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
                    if (_.sum(mineralContainer.store) > 0) {
                        for (const resourceType in mineralContainer.store) {
                            if (creep.withdraw(mineralContainer, resourceType) === ERR_NOT_IN_RANGE) {
                                creep.shibMove(mineralContainer);
                            }
                        }
                    } else {
                        creep.idleFor(15);
                    }
                }
            }
        } else {
            let container = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] === 0});
            if (container.id) {
                if (container.pos.getRangeTo(Game.getObjectById(creep.memory.assignedMineral)) < 5) {
                    creep.shibMove(container);
                    creep.memory.mineralDestination = container.id;
                } else {
                    creep.shibMove(Game.getObjectById(creep.memory.assignedMineral))
                }
            } else {
                creep.shibMove(Game.getObjectById(creep.memory.assignedMineral))
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
                            creep.shibMove(terminal);
                        }
                    }
                }
            }
        }
    }
}
mineralHauler = profiler.registerFN(mineralHauler, 'mineralHaulerHaulers');

/**
 * @return {null}
 */
function resupply(creep) {
    if (creep.pos.roomName === creep.memory.assignedRoom) {
        creep.memory.destinationReached = undefined;
    } else if (creep.pos.roomName === Game.flags[creep.memory.destination].pos.roomName) {
        creep.memory.destinationReached = true;
    }
    //INITIAL CHECKS
    creep.borderCheck();
    creep.wrongRoom();
    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy === creep.carryCapacity) {
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
        if (creep.memory.destinationReached !== true) {
            creep.travelTo(Game.flags[creep.memory.destination]);
        } else {
            if (creep.memory.deliveryStorage) {
                if (creep.transfer(Game.getObjectById(creep.memory.deliveryStorage), RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(Game.getObjectById(creep.memory.deliveryStorage));
                }
            } else if (!creep.memory.deliveryStorage) {
                let storage = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'storage'), 'id');
                if (storage.length > 0) {
                    creep.memory.deliveryStorage = storage[0];
                } else {
                    creep.memory.deliveryStorage = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE}).id;
                }
                if (!creep.memory.deliveryStorage) {
                    creep.findEssentials();
                }
            }
        }
    }
}
resupply = profiler.registerFN(resupply, 'resupplyHaulers');