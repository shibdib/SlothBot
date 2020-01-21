/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    //INITIAL CHECKS
    if (creep.wrongRoom()) return;
    creep.say(ICONS.reaction, true);
    // Tow Truck
    if (creep.towTruck()) return;
    let terminal = creep.room.terminal;
    let storage = creep.room.storage;
    if (!_.sum(creep.store)) creep.memory.hauling = false;
    if (_.sum(creep.store) > creep.store.getCapacity() * 0.75) creep.memory.hauling = true;
    //If creep needs boosts do that first
    if (boostDelivery(creep)) return;
    // Fill needy labs
    if (creep.memory.supplier) return supplyLab(creep);
    // Deliver
    if (_.sum(creep.store)) return storeBoosts(creep);
    // Empty labs
    if (creep.memory.empty) return emptyLab(creep);
    // Empty mineral harvester container
    if (linkManager(creep)) return;
    // Empty mineral harvester container
    if (mineralHauler(creep)) return;
    // Handle terminal goods
    if (terminalControl(creep)) return;
    // Handle storage goods
    if (storageEmpty(creep)) return;
    // Handle dropped goodies
    if (droppedResources(creep)) return;
    let labs = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB);
    for (let lab of labs) {
        // If lab is empty continue
        if (!lab.mineralAmount || !lab.mineralType) continue;
        // If lab has correct resource continue
        if (lab.memory.itemNeeded && lab.memory.itemNeeded === lab.mineralType) continue;
        if (lab.memory.neededBoost && lab.memory.neededBoost === lab.mineralType) continue;
        // If lab is an output lab that isn't full continue
        if (!lab.memory.itemNeeded && !lab.memory.neededBoost && lab.mineralAmount < 750 && lab.memory.creating && lab.memory.creating === lab.mineralType) continue;
        if (!creep.memory.labHelper) creep.memory.labHelper = lab.id;
        creep.memory.empty = true;
        return;
    }
    for (let lab of labs) {
        // If lab doesn't need anything or there isn't anything in the room to give it
        let stockedLab = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.mineralType === lab.memory.itemNeeded)[0];
        if (!lab.memory.itemNeeded || (!storage.store[lab.memory.itemNeeded] && !terminal.store[lab.memory.itemNeeded] && !stockedLab)) continue;
        // If lab has correct resource continue
        if (lab.mineralAmount >= 50) continue;
        if (!creep.memory.labHelper) creep.memory.labHelper = lab.id;
        creep.memory.supplier = true;
        return supplyLab(creep);
    }
    creep.idleFor(2);
};

// Store items
function storeBoosts(creep) {
    if (!_.sum(creep.store)) return false;
    let nuker = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_NUKER)[0];
    let storeTarget;
    for (let resourceType in creep.store) {
        // Default terminal
        storeTarget = creep.room.terminal;
        // Storage cases
        if (_.sum(creep.room.storage.store) < 0.95 * creep.room.storage.store.getCapacity()) {
            if (_.includes(ALL_COMMODITIES, resourceType)) storeTarget = creep.room.terminal;
            else if ((!_.includes(BASE_MINERALS, resourceType) && creep.room.storage.store[resourceType] < BOOST_AMOUNT) || (_.includes(LAB_PRIORITY, resourceType) && creep.room.storage.store[resourceType] < BOOST_AMOUNT * 2)) storeTarget = creep.room.storage;
        }
        // Nuker case
        if (nuker && nuker.ghodium < nuker.ghodiumCapacity && creep.store[RESOURCE_GHODIUM]) storeTarget = nuker;
        switch (creep.transfer(storeTarget, resourceType)) {
            case OK:
                creep.memory.empty = undefined;
                creep.memory.labHelper = undefined;
                return;
            case ERR_NOT_IN_RANGE:
                creep.memory.empty = true;
                creep.shibMove(storeTarget);
                return;
            case ERR_FULL:
                creep.drop(resourceType);
                return true;
        }
    }
}

// Empty Function
function emptyLab(creep) {
    let lab = Game.getObjectById(creep.memory.labHelper);
    creep.say(ICONS.reaction + 'Emptying', true);
    if (_.sum(creep.store)) {
        storeBoosts(creep);
    } else if (lab) {
        if (!lab.mineralType) {
            creep.memory.empty = undefined;
            creep.memory.labHelper = undefined;
            return;
        }
        switch (creep.withdraw(lab, lab.mineralType)) {
            case OK:
                creep.memory.empty = true;
                return undefined;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(lab);
                creep.memory.empty = true;
                return undefined;
            case ERR_NOT_ENOUGH_RESOURCES:
                creep.memory.empty = undefined;
                creep.memory.labHelper = undefined;
                return undefined;
        }
    }
}

// Supplier Function
function supplyLab(creep) {
    let terminal = creep.room.terminal;
    let storage = creep.room.storage;
    let lab = Game.getObjectById(creep.memory.labHelper);
    if (!lab || !terminal || !storage) {
        creep.memory.itemStorage = undefined;
        creep.memory.labHelper = undefined;
        creep.memory.componentNeeded = undefined;
        creep.memory.supplier = undefined;
        return;
    }
    creep.say(ICONS.reaction + 'Filling', true);
    creep.memory.componentNeeded = lab.memory.itemNeeded;
    if (!creep.store[creep.memory.componentNeeded]) {
        let carried = creep.store[creep.memory.componentNeeded] || 0;
        if (_.sum(creep.store) > carried) {
            for (let resourceType in creep.store) {
                if (resourceType === creep.memory.componentNeeded) continue;
                switch (creep.transfer(storage, resourceType)) {
                    case OK:
                        return;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(storage);
                        return;
                }
            }
        }
        if (!creep.memory.itemStorage) {
            if (storage.store[lab.memory.itemNeeded] > 0) {
                creep.memory.itemStorage = storage.id;
            } else if (terminal.store[lab.memory.itemNeeded] > 0) {
                creep.memory.itemStorage = terminal.id;
            } else if (_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.mineralType === lab.memory.itemNeeded)[0] && _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.mineralType === lab.memory.itemNeeded)[0].mineralAmount > 0) {
                creep.memory.itemStorage = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.mineralType === lab.memory.itemNeeded)[0].id;
            } else {
                creep.memory.itemStorage = undefined;
                creep.memory.labHelper = undefined;
                creep.memory.componentNeeded = undefined;
                creep.memory.supplier = undefined;
            }
        } else {
            switch (creep.withdraw(Game.getObjectById(creep.memory.itemStorage), creep.memory.componentNeeded)) {
                case OK:
                    creep.memory.itemStorage = undefined;
                    return;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(Game.getObjectById(creep.memory.itemStorage));
                    return;
                case ERR_NOT_ENOUGH_RESOURCES:
                    creep.memory.itemStorage = undefined;
                    creep.memory.labHelper = undefined;
                    creep.memory.componentNeeded = undefined;
                    creep.memory.supplier = undefined;
                    return;
                case ERR_INVALID_ARGS:
                    creep.memory.itemStorage = undefined;
                    creep.memory.labHelper = undefined;
                    creep.memory.componentNeeded = undefined;
                    creep.memory.supplier = undefined;
                    return;
            }
        }
    } else {
        if (_.sum(creep.store) > creep.store[creep.memory.componentNeeded]) {
            for (let resourceType in creep.store) {
                if (resourceType === creep.memory.componentNeeded) continue;
                switch (creep.transfer(storage, resourceType)) {
                    case OK:
                        return;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(storage);
                        return;
                }
            }
        } else {
            switch (creep.transfer(lab, creep.memory.componentNeeded)) {
                case OK:
                    creep.memory.itemStorage = undefined;
                    creep.memory.labHelper = undefined;
                    creep.memory.componentNeeded = undefined;
                    creep.memory.supplier = undefined;
                    return undefined;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(lab);
                    return undefined;
            }
        }
    }
}

// Deliver boosts
function boostDelivery(creep) {
    if (creep.room.controller.level < 6 || !_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.active === true && s.memory.neededBoost)[0]) return false;
    let lab = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.active === true && s.memory.neededBoost)[0];
    if (!lab) return delete creep.memory.labTech;
    //Make sure creep needing boost exists
    let boostCreep = _.filter(creep.room.creeps, (c) => c.memory && c.memory.boostLab === lab.id)[0];
    if (!boostCreep) {
        delete lab.memory;
        return delete creep.memory.labTech
    }
    //If lab is already full enough continue
    if (lab.mineralType === lab.memory.neededBoost && lab.mineralAmount >= boostCreep.memory.boostNeeded) return false;
    let terminal = creep.room.terminal;
    let storage = creep.room.storage;
    creep.say(lab.memory.neededBoost, true);
    if (_.sum(creep.store) && creep.store[lab.memory.neededBoost] === _.sum(creep.store)) {
        switch (creep.transfer(lab, lab.memory.neededBoost)) {
            case OK:
                return delete creep.memory.labTech;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(lab);
                creep.memory.labTech = true;
                return true;
        }
    } else if (_.sum(creep.store) > creep.store[lab.memory.neededBoost]) {
        for (let resourceType in creep.store) {
            if (resourceType === lab.memory.neededBoost) continue;
            switch (creep.transfer(terminal, resourceType)) {
                case OK:
                    creep.memory.labTech = true;
                    return true;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(terminal);
                    creep.memory.labTech = true;
                    return true;
            }
        }
    }
    if (lab.mineralType && lab.mineralType !== lab.memory.neededBoost) {
        if (_.sum(creep.store) > 0) {
            storeBoosts(creep);
        } else {
            switch (creep.withdraw(lab, lab.mineralType)) {
                case OK:
                    creep.memory.labTech = true;
                    return true;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(lab);
                    creep.memory.labTech = true;
                    return true;
            }
        }
    } else {
        if (!creep.memory.itemStorage) {
            if (storage.store[lab.memory.neededBoost] > 0) {
                creep.memory.labTech = true;
                creep.memory.itemStorage = storage.id;
                return true;
            } else if (terminal.store[lab.memory.neededBoost] > 0) {
                creep.memory.labTech = true;
                creep.memory.itemStorage = terminal.id;
                return true;
            } else {
                delete creep.memory.labTech;
                delete creep.memory.itemStorage;
                delete lab.memory;
                return false;
            }
        } else {
            let amount = creep.store.getCapacity();
            if (boostCreep.memory.boostNeeded < creep.store.getCapacity()) amount = boostCreep.memory.boostNeeded;
            if (!Game.getObjectById(creep.memory.itemStorage) || !Game.getObjectById(creep.memory.itemStorage).store) return creep.memory.itemStorage = undefined;
            if (Game.getObjectById(creep.memory.itemStorage).store[lab.memory.neededBoost] < amount) amount = Game.getObjectById(creep.memory.itemStorage).store[lab.memory.neededBoost];
            switch (creep.withdraw(Game.getObjectById(creep.memory.itemStorage), lab.memory.neededBoost, amount)) {
                case OK:
                    delete creep.memory.itemStorage;
                    return true;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(Game.getObjectById(creep.memory.itemStorage));
                    creep.memory.labTech = true;
                    return true;
                case ERR_NOT_ENOUGH_RESOURCES:
                    delete creep.memory.labTech;
                    delete creep.memory.itemStorage;
                    delete lab.memory;
                    return false;
            }
        }
    }
}

// Get dropped resources
function droppedResources(creep) {
    let tombstone = creep.room.find(FIND_TOMBSTONES, {filter: (r) => _.sum(r.store) > r.store[RESOURCE_ENERGY] || (!r.store[RESOURCE_ENERGY] && _.sum(r.store) > 0)})[0];
    let resources = creep.room.find(FIND_DROPPED_RESOURCES, {filter: (r) => r.resourceType !== RESOURCE_ENERGY})[0];
    if (tombstone) {
        let storage = creep.room.storage;
        if (_.sum(creep.store) > 0) {
            for (let resourceType in creep.store) {
                switch (creep.transfer(storage, resourceType)) {
                    case OK:
                        return false;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(storage);
                        return true;
                }
            }
        } else {
            for (let resourceType in tombstone.store) {
                switch (creep.withdraw(tombstone, resourceType)) {
                    case OK:
                        return true;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(tombstone);
                        return true;
                }
            }
        }
    } else if (resources) {
        let storage = creep.room.storage;
        if (_.sum(creep.store) > 0) {
            for (let resourceType in creep.store) {
                switch (creep.transfer(storage, resourceType)) {
                    case OK:
                        return false;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(storage);
                        return true;
                }
            }
        } else {
            switch (creep.pickup(resources)) {
                case OK:
                    return true;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(resources);
                    return true;
            }
        }
    } else {
        return false;
    }
}

// Full link
function linkManager(creep) {
    let hub = Game.getObjectById(creep.room.hubLink);
    if (hub && hub.energy >= hub.energyCapacity * 0.9) {
        switch (creep.withdraw(hub, RESOURCE_ENERGY)) {
            case OK:
                return true;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(hub);
                return true;
        }
    } else {
        return false;
    }
}

// Remove minerals from the terminal if it's overfull and has no energy or move boosts to storage
function terminalControl(creep) {
    // Handle nuker needing ghodium
    let nuke = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_NUKER)[0];
    if (nuke && nuke.ghodium < nuke.ghodiumCapacity && (creep.room.storage.store[RESOURCE_GHODIUM] || creep.room.terminal.store[RESOURCE_GHODIUM])) {
        let storage = creep.room.terminal;
        if (creep.room.storage.store[RESOURCE_GHODIUM]) storage = creep.room.storage;
        switch (creep.withdraw(storage, RESOURCE_GHODIUM)) {
            case OK:
                return;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(storage);
                return;
        }
    }
    // Store resource in storage up to the stockpile amount
    if (_.sum(creep.room.storage.store) < 0.95 * creep.room.storage.store.getCapacity()) {
        for (let resourceType of Object.keys(creep.room.terminal.store)) {
            if (resourceType !== RESOURCE_ENERGY && !_.includes(BASE_MINERALS, resourceType) && !_.includes(ALL_COMMODITIES, resourceType) && creep.room.storage.store[resourceType] < BOOST_AMOUNT) {
                switch (creep.withdraw(creep.room.terminal, resourceType)) {
                    case OK:
                        return true;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(creep.room.terminal);
                        return true;
                }
            } else if (resourceType === RESOURCE_ENERGY && creep.room.terminal.store[resourceType] >= TERMINAL_ENERGY_BUFFER) {
                switch (creep.withdraw(creep.room.terminal, resourceType)) {
                    case OK:
                        return true;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(creep.room.terminal);
                        return true;
                }
            }
        }
    }
    if (!creep.room.terminal || _.sum(creep.room.terminal.store) < 0.95 * creep.room.terminal.store.getCapacity() || creep.memory.hauling) return false;
    let maxResource = 0;
    for (let resource of Object.keys(creep.room.terminal.store)) {
        if (creep.room.terminal.store[resource] > maxResource) {
            switch (creep.withdraw(creep.room.terminal, resource)) {
                case OK:
                    return true;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(creep.room.terminal);
                    return true;
            }
        }
    }
}

// Remove minerals from the storage if it's overfull and has no energy
function storageEmpty(creep) {
    if (!creep.room.storage || !creep.room.terminal || _.sum(creep.room.terminal.store) >= 0.70 * creep.room.terminal.store.getCapacity() || creep.memory.hauling) return false;
    let maxResource = 0;
    let overflow;
    for (let resource of Object.keys(creep.room.storage.store)) {
        if (resource === RESOURCE_ENERGY) maxResource = ENERGY_AMOUNT;
        if (!_.includes(BASE_MINERALS, resource)) maxResource = BOOST_AMOUNT * 1.2;
        if (_.includes(ALL_COMMODITIES, resource)) maxResource = 0;
        if (creep.room.storage.store[resource] > maxResource) {
            maxResource = creep.room.storage.store[resource];
            overflow = resource;
            break;
        }
    }
    switch (creep.withdraw(creep.room.storage, overflow, creep.room.storage.store[overflow] - maxResource)) {
        case OK:
            return true;
        case ERR_NOT_IN_RANGE:
            creep.shibMove(creep.room.storage);
            return true;
    }
}

// Mineral hauler
function mineralHauler(creep) {
    let container = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && _.sum(s.store) > s.store[RESOURCE_ENERGY] && (_.sum(s.store) - s.store[RESOURCE_ENERGY] >= creep.store.getCapacity() || !creep.room.mineral.mineralAmount))[0];
    if (container) {
        for (let resourceType in container.store) {
            if (resourceType === RESOURCE_ENERGY) continue;
            switch (creep.withdraw(container, resourceType)) {
                case OK:
                    return true;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(container);
                    return true;
            }
        }
    }
}