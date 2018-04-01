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
    if (_.sum(creep.carry) === 0) {
        creep.memory.hauling = false;
        if (creep.memory.storageDestination && creep.memory._shibMove) {
            creep.memory.storageDestination = undefined;
            creep.memory._shibMove = undefined;
        }
    }
    if (_.sum(creep.carry) >= creep.carryCapacity * 0.5) creep.memory.hauling = true;
    if (!creep.getSafe(true)) {
        if (Game.time % 25 === 0 || creep.memory.nuclearEngineer || creep.memory.terminalWorker) if (nuclearEngineer(creep) || terminalWorker(creep)) return null;
        if (Game.time % 5 === 0 || creep.memory.labTech) if (boostDelivery(creep)) return null;
        if (_.sum(creep.carry) > creep.carry[RESOURCE_ENERGY]) {
            let storage = creep.room.storage;
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
                if (!storageItem) {
                    delete creep.memory.storageDestination;
                    return null;
                }
                switch (creep.transfer(storageItem, RESOURCE_ENERGY)) {
                    case OK:
                        delete creep.memory.storageDestination;
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(storageItem);
                        break;
                    case ERR_FULL:
                        delete creep.memory.storageDestination;
                        if (storageItem.memory) delete storageItem.memory.deliveryIncoming;
                        creep.findEssentials();
                        break;
                }
            } else if (!creep.findEssentials()) if (!creep.findStorage()) creep.idleFor(3);
        }
    }
}

module.exports.role = profiler.registerFN(role, 'basicHaulerRole');

function terminalWorker(creep) {
    let terminal = creep.room.terminal;
    let storage = creep.room.storage;
    let haulers = _.filter(creep.room.creeps, (c) => c.memory && c.memory.role === 'hauler');
    let terminalWorker = _.filter(Game.creeps, (c) => c.memory.terminalWorker && c.memory.overlord === creep.memory.overlord)[0];
    if (creep.memory.labTech || creep.memory.nuclearEngineer || (!creep.memory.terminalWorker && (!terminal || terminalWorker)) || haulers.length < 2) return undefined;
    if (creep.memory.terminalDelivery) {
        for (let resourceType in creep.carry) {
            switch (creep.transfer(terminal, resourceType)) {
                case OK:
                    delete creep.memory.terminalDelivery;
                    return delete creep.memory.terminalWorker;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(terminal);
                    creep.memory.terminalWorker = true;
                    return true;
            }
        }
    } else {
        for (let resourceType in storage.store) {
            if (_.sum(terminal.store) > 0.9 * terminal.storeCapacity) break;
            if (_.includes(END_GAME_BOOSTS, resourceType) || _.includes(TIER_2_BOOSTS, resourceType) || _.includes(TIER_1_BOOSTS, resourceType) || resourceType === RESOURCE_GHODIUM || (!creep.room.memory.reactionRoom && resourceType !== RESOURCE_ENERGY)) {
                if (_.sum(creep.carry) > 0) {
                    for (let resourceType in creep.carry) {
                        switch (creep.transfer(storage, resourceType)) {
                            case OK:
                                creep.memory.terminalWorker = true;
                                creep.memory.terminalDelivery = resourceType;
                                return true;
                            case ERR_NOT_IN_RANGE:
                                creep.shibMove(storage);
                                creep.memory.terminalWorker = true;
                                return true;
                        }
                    }
                } else {
                    creep.memory.terminalWorker = true;
                    switch (creep.withdraw(storage, resourceType)) {
                        case OK:
                            creep.memory.terminalWorker = true;
                            creep.memory.terminalDelivery = resourceType;
                            return true;
                        case ERR_NOT_IN_RANGE:
                            creep.memory.terminalWorker = true;
                            return creep.shibMove(storage);
                    }
                }
            }
        }
    }
    if (creep.memory.hauling === false) {
        if (_.sum(terminal.store) > 0.9 * terminal.storeCapacity) {
            creep.memory.terminalWorker = true;
            creep.memory.terminalCleaning = true;
            switch (creep.withdraw(terminal, _.max(Object.keys(terminal.store), key => terminal.store[key]))) {
                case OK:
                    return true;
                case ERR_NOT_IN_RANGE:
                    return creep.shibMove(terminal);
            }
            return true;
        }
    } else if (creep.memory.terminalCleaning) {
        let storage = creep.room.storage;
        for (let resourceType in creep.carry) {
            switch (creep.transfer(storage, resourceType)) {
                case OK:
                    delete creep.memory.terminalWorker;
                    delete creep.memory.terminalCleaning;
                    return undefined;
                case ERR_NOT_IN_RANGE:
                    return creep.shibMove(storage);
            }
        }
        return true;
    } else if (_.sum(storage.store) >= storage.storeCapacity * 0.90 && storage.store[RESOURCE_ENERGY] > 150000) {
        creep.memory.terminalWorker = true;
        switch (creep.withdraw(storage, RESOURCE_ENERGY)) {
            case OK:
                creep.memory.terminalDelivery = RESOURCE_ENERGY;
                return true;
            case ERR_NOT_IN_RANGE:
                return creep.shibMove(storage);
        }
    }
    delete creep.memory.terminalDelivery;
    return delete creep.memory.terminalWorker;
}

function boostDelivery(creep) {
    let lab = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.active === true && s.memory.neededBoost)[0];
    let labTech = _.filter(Game.creeps, (c) => c.memory.labTech && c.memory.overlord === creep.memory.overlord)[0];
    if (creep.memory.terminalWorker || creep.memory.nuclearEngineer || (!creep.memory.labTech && (!lab || labTech))) return undefined;
    if (!lab) return delete creep.memory.labTech;
    //Make sure creep needing boost exists
    let boostCreep = _.filter(creep.room.creeps, (c) => c.memory && c.memory.boostLab === lab.id)[0];
    if (!boostCreep) {
        delete lab.memory;
        return delete creep.memory.labTech
    }
    let terminal = creep.room.terminal;
    let storage = creep.room.storage;
    creep.say(ICONS.boost, true);
    if (creep.carry[lab.memory.neededBoost] > 0) {
        switch (creep.transfer(lab, lab.memory.neededBoost)) {
            case OK:
                return delete creep.memory.labTech;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(lab, {ignoreCreeps: false});
                creep.memory.labTech = true;
                return true;
        }
    } else if (_.sum(creep.carry) > creep.carry[lab.memory.neededBoost]) {
        for (let resourceType in creep.carry) {
            if (resourceType === lab.memory.neededBoost) continue;
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
                delete creep.memory.labTech;
                delete creep.memory.itemStorage;
            }
        } else {
            switch (creep.withdraw(Game.getObjectById(creep.memory.itemStorage), lab.memory.neededBoost)) {
                case OK:
                    delete creep.memory.itemStorage;
                    return true;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(Game.getObjectById(creep.memory.itemStorage));
                    creep.memory.labTech = true;
                    return true;
                case ERR_NOT_ENOUGH_RESOURCES:
                    delete creep.memory.itemStorage;
                    return true;
            }
        }
    }
}

function nuclearEngineer(creep) {
    let nuker = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_NUKER && s.ghodium < s.ghodiumCapacity)[0];
    let nuclearEngineer = _.filter(Game.creeps, (c) => c.memory.nuclearEngineer && c.memory.overlord === creep.memory.overlord)[0];
    if (creep.memory.terminalWorker || creep.memory.labTech || (!creep.memory.nuclearEngineer && (!nuker || nuclearEngineer))) return undefined;
    let terminal = creep.room.terminal;
    let storage = creep.room.storage;
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
                    delete creep.memory.nuclearEngineer;
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
                delete creep.memory.nuclearEngineer;
                delete creep.memory.itemStorage;
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