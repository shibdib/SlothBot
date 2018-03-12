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
    creep.say(ICONS.haul, true);
    if (creep.renewalCheck(5)) return null;
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
        if (!terminalWorker(creep) && !boostDelivery(creep) && !nuclearEngineer(creep)) {
            if (_.sum(creep.carry) > creep.carry[RESOURCE_ENERGY]) {
                let storage = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_STORAGE)[0];
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

function terminalWorker(creep) {
    let terminal = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_TERMINAL)[0];
    let terminalWorker = _.filter(Game.creeps, (creep) => creep.memory.terminalWorker && creep.memory.overlord === creep.room.name)[0];
    if (creep.memory.labTech || creep.memory.nuclearEngineer || (!creep.memory.terminalWorker && (!terminal || terminalWorker))) return undefined;
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
    } else if (creep.memory.terminalWorker) {
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

function boostDelivery(creep) {
    let lab = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.active === true && s.memory.neededBoost)[0];
    let labTech = _.filter(Game.creeps, (creep) => creep.memory.labTech && creep.memory.overlord === creep.room.name)[0];
    if (creep.memory.terminalWorker || creep.memory.nuclearEngineer || (!creep.memory.labTech && (!lab || labTech))) return undefined;
    if (!lab) return creep.memory.labTech = undefined;
    let terminal = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_TERMINAL)[0];
    let storage = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_STORAGE)[0];
    creep.say(ICONS.boost, true);
    if (_.sum(creep.carry) > creep.carry[lab.memory.neededBoost]) {
        for (let resourceType in creep.carry) {
            switch (creep.transfer(storage, resourceType)) {
                case OK:
                    creep.memory.labTech = true;
                    return true;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(storage);
                    creep.memory.labTech = true;
                    return true;
            }
        }
    } else if (creep.carry[lab.memory.neededBoost] > 0) {
        for (let resourceType in creep.carry) {
            switch (creep.transfer(lab, resourceType)) {
                case OK:
                    return creep.memory.labTech = undefined;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(lab);
                    creep.memory.labTech = true;
                    return true;
            }
        }
    }
    if (lab.mineralType && lab.mineralType !== lab.memory.neededBoost) {
        switch (creep.withdraw(lab, lab.mineralType)) {
            case OK:
                creep.memory.labTech = true;
                return true;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(lab);
                creep.memory.labTech = true;
                return true;
        }
    } else {
        if (!creep.memory.itemStorage) {
            if (storage.store[lab.memory.neededBoost] > 0) {
                creep.memory.labTech = true;
                creep.memory.itemStorage = storage.id;
            } else if (terminal.store[lab.memory.neededBoost] > 0) {
                creep.memory.labTech = true;
                creep.memory.itemStorage = terminal.id;
            } else {
                creep.memory.labTech = undefined;
                creep.memory.itemStorage = undefined;
            }
        } else {
            switch (creep.withdraw(Game.getObjectById(creep.memory.itemStorage), lab.memory.neededBoost)) {
                case OK:
                    creep.memory.itemStorage = undefined;
                    return true;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(Game.getObjectById(creep.memory.itemStorage));
                    creep.memory.labTech = true;
                    return true;
            }
        }
    }
}

function nuclearEngineer(creep) {
    let nuker = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_NUKER && s.ghodium < s.ghodiumCapacity)[0];
    let nuclearEngineer = _.filter(Game.creeps, (creep) => creep.memory.nuclearEngineer && creep.memory.overlord === creep.room.name)[0];
    if (creep.memory.terminalWorker || creep.memory.labTech || (!creep.memory.nuclearEngineer && (!nuker || nuclearEngineer))) return undefined;
    let terminal = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_TERMINAL)[0];
    let storage = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_STORAGE)[0];
    let ghodium = getResourceAmount(creep.room, RESOURCE_GHODIUM);
    if (nuker.ghodium < nuker.ghodiumCapacity && ghodium > 0) {
        if (_.sum(creep.carry) > creep.carry[RESOURCE_GHODIUM]) {
            creep.say(ICONS.nuke, true);
            for (let resourceType in creep.carry) {
                switch (creep.transfer(storage, resourceType)) {
                    case OK:
                        creep.memory.nuclearEngineer = true;
                        return true;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(storage);
                        creep.memory.nuclearEngineer = true;
                        return true;
                }
            }
        } else if (creep.carry[RESOURCE_GHODIUM] > 0) {
            creep.say(ICONS.nuke, true);
            switch (creep.transfer(nuker, RESOURCE_GHODIUM)) {
                case OK:
                    creep.memory.nuclearEngineer = undefined;
                    return true;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(nuker);
                    creep.memory.nuclearEngineer = true;
                    return true;
            }
        } else if (!creep.memory.itemStorage) {
            creep.say(ICONS.nuke, true);
            if (storage.store[RESOURCE_GHODIUM] > 0) {
                creep.memory.nuclearEngineer = true;
                creep.memory.itemStorage = storage.id;
            } else if (terminal.store[RESOURCE_GHODIUM] > 0) {
                creep.memory.nuclearEngineer = true;
                creep.memory.itemStorage = terminal.id;
            } else {
                creep.memory.nuclearEngineer = undefined;
                creep.memory.itemStorage = undefined;
            }
        } else if (creep.memory.itemStorage && creep.memory.nuclearEngineer) {
            creep.say(ICONS.nuke, true);
            let stockpile = Game.getObjectById(creep.memory.itemStorage);
            switch (creep.withdraw(stockpile, RESOURCE_GHODIUM)) {
                case OK:
                    creep.memory.nuclearEngineer = true;
                    return true;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(stockpile);
                    creep.memory.nuclearEngineer = true;
                    return true;
            }
        }
    }
}

function getResourceAmount(room, boost) {
    let boostInRoomStructures = _.sum(room.lookForAtArea(LOOK_STRUCTURES, 0, 0, 49, 49, true), (s) => {
        if (s['structure'] && s['structure'].store) {
            return s['structure'].store[boost] || 0;
        } else if (s['structure'] && s['structure'].mineralType === boost) {
            return s['structure'].mineralAmount || 0;
        } else {
            return 0;
        }
    });
    let boostInRoomCreeps = _.sum(room.lookForAtArea(LOOK_CREEPS, 0, 0, 49, 49, true), (s) => {
        if (s['creep'] && s['creep'].carry) {
            return s['creep'].carry[boost] || 0;
        } else {
            return 0;
        }
    });
    return boostInRoomCreeps + boostInRoomStructures;
}