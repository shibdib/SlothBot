/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

/**
 * @return {null}
 */
function role(creep) {
    //INITIAL CHECKS
    if (creep.borderCheck()) return null;
    if (creep.wrongRoom()) return null;
    creep.repairRoad();
    if (creep.carry[RESOURCE_ENERGY] > 0) {
        let adjacentStructure = _.filter(creep.pos.findInRange(FIND_STRUCTURES, 1), (s) => (s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN) && s.energy < s.energyCapacity);
        if (adjacentStructure.length > 0) creep.transfer(adjacentStructure[0], RESOURCE_ENERGY);
    }
    if (_.sum(creep.carry) === 0) creep.memory.hauling = false;
    if (creep.isFull) creep.memory.hauling = true;
    if (!creep.getSafe(true)) {
        if (!terminalWorker(creep) && !mineralHauler(creep) && !labTech(creep)) {
            if (creep.memory.hauling === false) {
                creep.getEnergy();
                creep.withdrawEnergy();
            } else {
                if (creep.memory.storageDestination) {
                    let storageItem = Game.getObjectById(creep.memory.storageDestination);
                    if (!storageItem) return creep.memory.storageDestination = undefined;
                    switch (creep.transfer(storageItem, RESOURCE_ENERGY)) {
                        case OK:
                            creep.memory.storageDestination = undefined;
                            break;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(storageItem);
                            break;
                        case ERR_FULL:
                            creep.memory.storageDestination = undefined;
                            if (storageItem.memory) storageItem.memory.deliveryIncoming = undefined;
                            creep.findEssentials();
                            break;
                    }
                } else if (!creep.findEssentials()) {
                    if (!creep.findStorage()) creep.idleFor(3);
                }
            }
        }
    }
}

module.exports.role = profiler.registerFN(role, 'basicHaulerRole');

function mineralHauler(creep) {
    let mineralHauler = _.filter(Game.creeps, (creep) => creep.memory.mineralHauling && creep.memory.overlord === creep.room.name)[0];
    if (!creep.memory.mineralHauling || !Game.getObjectById(creep.room.memory.mineralContainer) || !mineralHauler) return undefined;
    if (creep.memory.hauling === false) {
        if (_.sum(Game.getObjectById(creep.room.memory.mineralContainer).store) > 1000) {
            creep.memory.mineralHauling = true;
            let mineralContainer = Game.getObjectById(creep.room.memory.mineralContainer);
            for (const resourceType in mineralContainer.store) {
                switch (creep.withdraw(mineralContainer, resourceType)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(mineralContainer);
                }
            }
            return true;
        }
    } else {
        let terminal = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_TERMINAL)[0];
        for (let resourceType in creep.carry) {
            switch (creep.transfer(terminal, resourceType)) {
                case OK:
                    creep.memory.mineralHauling = undefined;
                    return undefined;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(terminal);
            }
        }
        return true;
    }
}

function terminalWorker(creep) {
    let terminal = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_TERMINAL)[0];
    let terminalWorker = _.filter(Game.creeps, (creep) => creep.memory.terminalWorker && creep.memory.overlord === creep.room.name)[0];
    if (!creep.memory.terminalWorker || (!terminal || terminalWorker)) return undefined;
    if (creep.memory.hauling === false) {
        if (_.sum(terminal.store) > 0.9 * terminal.storeCapacity) {
            creep.memory.terminalWorker = true;
            switch (creep.withdraw(terminal, _.max(Object.keys(terminal.store), key => terminal.store[key]))) {
                case OK:
                    break;
                case ERR_NOT_IN_RANGE:
                    return creep.shibMove(terminal);
            }
            return true;
        }
    } else {
        let storage = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_STORAGE)[0];
        for (let resourceType in creep.carry) {
            switch (creep.transfer(storage, resourceType)) {
                case OK:
                    creep.memory.terminalWorker = undefined;
                    return undefined;
                case ERR_NOT_IN_RANGE:
                    return creep.shibMove(storage);
            }
        }
        return true;
    }
}

function labTech(creep) {
    let labs = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB);
    let labTech = _.filter(Game.creeps, (creep) => creep.memory.labTech && creep.memory.overlord === creep.room.name)[0];
    let terminal = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_TERMINAL)[0];
    let storage = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_STORAGE)[0];
    if (!creep.memory.labTech && (!labs[0] || labTech)) return undefined;
    for (let key in labs) {
        if (labs[key].memory.itemNeeded && (labs[key].mineralType !== labs[key].memory.itemNeeded || (labs[key].mineralType === labs[key].memory.itemNeeded && labs[key].mineralAmount < 250))) {
            if (creep.carry[labs[key].memory.itemNeeded] === 0 || !creep.carry[labs[key].memory.itemNeeded]) {
                if (!creep.memory.labHelper && !creep.memory.itemStorage) {
                    if (storage.store[labs[key].memory.itemNeeded] > 0) {
                        creep.memory.labTech = true;
                        creep.memory.labHelper = labs[key].id;
                        creep.memory.itemStorage = storage.id;
                    } else if (terminal.store[labs[key].memory.itemNeeded] > 0) {
                        creep.memory.labTech = true;
                        creep.memory.labHelper = labs[key].id;
                        creep.memory.itemStorage = terminal.id;
                    } else {
                        creep.memory.labTech = undefined;
                        creep.memory.itemStorage = undefined;
                    }
                    return undefined;
                }
                if (_.sum(creep.carry) > 0) {
                    for (let resourceType in creep.carry) {
                        switch (creep.transfer(storage, resourceType)) {
                            case OK:
                                return undefined;
                            case ERR_NOT_IN_RANGE:
                                creep.shibMove(storage);
                                return undefined;
                        }
                    }
                }
                if (creep.memory.itemStorage) {
                    creep.say(ICONS.testPassed);
                    creep.memory.storageDestination = labs[key].id;
                    switch (creep.withdraw(Game.getObjectById(creep.memory.itemStorage), labs[key].memory.itemNeeded)) {
                        case OK:
                            creep.memory.itemStorage = undefined;
                            return undefined;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(Game.getObjectById(creep.memory.itemStorage));
                            return undefined;
                    }
                }
            } else {
                creep.say(ICONS.testPassed);
                let lab = Game.getObjectById(creep.memory.labHelper);
                if (lab) {
                    switch (creep.transfer(lab, labs[key].memory.itemNeeded)) {
                        case OK:
                            creep.memory.labHelper = undefined;
                            creep.memory.labTech = undefined;
                            return undefined;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(lab);
                            return undefined;
                    }
                } else {
                    creep.memory.labHelper = undefined;
                    creep.memory.labTech = undefined;
                }
            }
        }

    }
}