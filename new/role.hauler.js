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
    if (_.sum(creep.carry) === 0) creep.memory.hauling = false;
    if (creep.isFull) creep.memory.hauling = true;
    if (!creep.getSafe(true)) {
        if (!terminalWorker(creep) && !mineralHauler(creep)) {
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
                            let adjacentStructure = _.filter(creep.pos.findInRange(FIND_STRUCTURES, 1), (s) => (s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN) && s.energy < s.energyCapacity);
                            if (adjacentStructure.length > 0) creep.transfer(adjacentStructure[0], RESOURCE_ENERGY);
                            creep.shibMove(storageItem);
                            break;
                        case ERR_FULL:
                            creep.memory.storageDestination = undefined;
                            if (storageItem.memory) storageItem.memory.deliveryIncoming = undefined;
                            creep.findEssentials();
                            break;
                    }
                } else if (!creep.findEssentials()) {
                    if (!creep.findStorage()) creep.idleFor(10);
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