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
    // Hauler mode
    if (creep.memory.haulerMode && creep.memory.haulerMode + 100 > Game.time) {
        let haulerRole = require('role.hauler');
        return haulerRole.role(creep);
    }
    creep.say(ICONS.reaction, true);
    // Deliver
    if (_.sum(creep.store)) return deliverResource(creep);
    // Get resource
    if (creep.memory.resourceNeeded) return getResource(creep);
    // Empty labs
    if (emptyLab(creep)
        //If creep needs boosts do that first
        || boostDelivery(creep)
        // Tow Truck
        || creep.towTruck()
        // Handle dropped goodies
        || droppedResources(creep)
        // Check nuker for ghodium
        || nukeSupplies(creep)
        // Get lab orders
        || labSupplies(creep)
        // Empty mineral harvester container
        || mineralHauler(creep)
        // Empty factories
        || emptyFactory(creep)
        // Get factory orders
        || factorySupplies(creep)
        // Handle terminal goods
        || terminalControl(creep)
        // Handle storage goods
        || storageControl(creep)) return;
    // If nothing to do, be a hauler for 50 ticks
    creep.memory.haulerMode = Game.time;
};

// Get item
function getResource(creep) {
    let storageSite;
    if (creep.room.storage.store[creep.memory.resourceNeeded]) storageSite = creep.room.storage;
    if (creep.room.terminal.store[creep.memory.resourceNeeded]) storageSite = creep.room.terminal;
    let stockedLab = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.mineralType === creep.memory.resourceNeeded && s.mineralType !== s.memory.itemNeeded && s.mineralType !== s.memory.neededBoost)[0];
    let container = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.store[creep.memory.resourceNeeded] && creep.memory.resourceNeeded !== RESOURCE_ENERGY)[0];
    if (container) storageSite = container;
    if (stockedLab) storageSite = stockedLab;
    if (creep.memory.withdrawFrom) storageSite = Game.getObjectById(creep.memory.withdrawFrom);
    creep.say(creep.memory.resourceNeeded, true);
    let amount;
    if (creep.memory.deliverTo && Game.getObjectById(creep.memory.deliverTo).amount) amount = Game.getObjectById(creep.memory.deliverTo).amount;
    if (storageSite && storageSite.store[creep.memory.resourceNeeded]) {
        switch (creep.withdraw(storageSite, creep.memory.resourceNeeded, amount)) {
            case OK:
                creep.memory.resourceNeeded = undefined;
                creep.memory.empty = undefined;
                creep.memory.withdrawFrom = undefined;
                return true;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(storageSite);
                return true;
        }
    } else {
        creep.memory.resourceNeeded = undefined;
    }
}

// Store items
function deliverResource(creep) {
    if (!_.sum(creep.store)) return false;
    let storeTarget;
    creep.say('DELIVER', true);
    for (let resourceType in creep.store) {
        // Default terminal
        storeTarget = creep.room.terminal;
        // Storage cases
        let nuke = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_NUKER && s.store.getFreeCapacity(RESOURCE_GHODIUM))[0];
        let lab = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && creep.memory.structureType === STRUCTURE_LAB && s.memory.active === true && (!s.mineralType || s.mineralType === resourceType) && (s.memory.neededBoost === resourceType || s.memory.itemNeeded === resourceType))[0];
        if (creep.memory.deliverTo) storeTarget = Game.getObjectById(creep.memory.deliverTo)
        else if (lab) storeTarget = lab;
        else if (nuke && creep.store[RESOURCE_GHODIUM]) storeTarget = nuke;
        else if (_.sum(creep.room.storage.store) < 0.95 * creep.room.storage.store.getCapacity()) {
            if (_.sum(creep.room.terminal.store) >= 0.90 * creep.room.terminal.store.getCapacity()) storeTarget = creep.room.storage;
            else if (resourceType === RESOURCE_POWER) storeTarget = creep.room.terminal;
            else if (resourceType === RESOURCE_ENERGY && creep.room.terminal.store[resourceType] < TERMINAL_ENERGY_BUFFER) storeTarget = creep.room.terminal;
            else if (resourceType === RESOURCE_ENERGY && creep.room.storage.store[resourceType] < ENERGY_AMOUNT * 1.1) storeTarget = creep.room.storage;
            else if (resourceType === RESOURCE_ENERGY) storeTarget = creep.room.terminal;
            else if (_.includes(BASE_MINERALS, resourceType) && creep.room.storage.store[resourceType] < REACTION_AMOUNT) storeTarget = creep.room.storage;
            else if (_.includes(COMPRESSED_COMMODITIES, resourceType) && creep.room.terminal.store[resourceType] >= 10000) storeTarget = creep.room.storage;
            else if (_.includes(ALL_COMMODITIES, resourceType)) storeTarget = creep.room.terminal;
            else if (_.includes(ALL_BOOSTS, resourceType) && creep.room.storage.store[resourceType] < BOOST_AMOUNT) storeTarget = creep.room.storage;
            else if (_.includes(ALL_BOOSTS, resourceType)) storeTarget = creep.room.terminal;
            else if (!_.includes(BASE_MINERALS, resourceType) && !_.includes(ALL_COMMODITIES, resourceType) && creep.room.storage.store[resourceType] < REACTION_AMOUNT) storeTarget = creep.room.storage;
        }
        switch (creep.transfer(storeTarget, resourceType)) {
            case OK:
                creep.memory.resourceNeeded = undefined;
                creep.memory.deliverTo = undefined;
                return;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(storeTarget);
                return;
            case ERR_FULL:
                creep.memory.resourceNeeded = undefined;
                creep.memory.deliverTo = undefined;
                creep.drop(resourceType);
                return true;
        }
    }
}

// Needy nuker
function nukeSupplies(creep) {
    let nuke = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_NUKER && s.store.getFreeCapacity(RESOURCE_GHODIUM))[0];
    if (nuke && (creep.room.storage.store[RESOURCE_GHODIUM] || creep.room.terminal.store[RESOURCE_GHODIUM])) {
        creep.memory.resourceNeeded = RESOURCE_GHODIUM;
        return true;
    }
}

// Deliver boosts
function boostDelivery(creep) {
    let lab = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.active && s.memory.neededBoost && s.store[s.memory.neededBoost] < s.memory.amount)[0];
    if (lab) {
        let boostCreep = _.filter(creep.room.creeps, (c) => c.my && c.memory.boosts && c.memory.boosts.boostLab === lab.id)[0];
        if (boostCreep && creep.room.store(lab.memory.neededBoost)) {
            creep.memory.resourceNeeded = lab.memory.neededBoost;
            creep.memory.deliverTo = lab.id;
            return true;
        } else {
            delete lab.memory;
        }
    }
}

// Needy Lab
function labSupplies(creep) {
    let needyLab = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.itemNeeded && (!s.mineralType || s.mineralType === s.memory.itemNeeded) && s.store.getUsedCapacity(s.memory.itemNeeded) < 150 && creep.room.store(s.memory.itemNeeded))[0];
    if (needyLab) {
        creep.memory.resourceNeeded = needyLab.memory.itemNeeded;
        creep.memory.deliverTo = needyLab.id;
        return true;
    }
}

// Empty Labs
function emptyLab(creep) {
    let stockedLab = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.itemNeeded && s.mineralType && s.mineralType !== s.memory.itemNeeded && s.mineralType !== s.memory.neededBoost)[0] ||
        _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.mineralType && !s.memory.itemNeeded && s.memory.creating && (s.mineralType !== s.memory.creating || s.store[s.mineralType] >= 250))[0] ||
        _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.mineralType && s.memory.neededBoost && s.memory.neededBoost !== s.mineralType)[0] ||
        _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.mineralType && !s.memory.itemNeeded && !s.memory.creating && !s.memory.neededBoost)[0];
    if (stockedLab) {
        creep.memory.resourceNeeded = stockedLab.mineralType;
        creep.memory.withdrawFrom = stockedLab.id;
        return true;
    }
}

// Get dropped resources
function droppedResources(creep) {
    let ruin = creep.room.find(FIND_RUINS, {filter: (r) => _.sum(r.store) > r.store[RESOURCE_ENERGY] || (!r.store[RESOURCE_ENERGY] && _.sum(r.store) > 0)})[0];
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
    } else if (ruin) {
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
            for (let resourceType in ruin.store) {
                switch (creep.withdraw(ruin, resourceType)) {
                    case OK:
                        return true;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(ruin);
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

// Remove minerals from the terminal if it's overfull and has no energy or move boosts to storage
function terminalControl(creep) {
    // Sort by max
    // Handle a super full terminal
    if (_.sum(creep.room.terminal.store) >= 0.98 * creep.room.terminal.store.getCapacity()) {
        let maxResource = Object.keys(creep.room.terminal.store).sort(function (a, b) {
            return creep.room.terminal.store[a] - creep.room.terminal.store[b]
        })[_.size(creep.room.terminal.store) - 1];
        creep.say('OFFLOAD', true);
        switch (creep.withdraw(creep.room.terminal, maxResource)) {
            case OK:
                return true;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(creep.room.terminal);
                return true;
        }
    }
    // Handle moving to storage
    else if (_.sum(creep.room.storage.store) < 0.9 * creep.room.storage.store.getCapacity()) {
        let maxResource = Object.keys(creep.room.terminal.store).sort(function (a, b) {
            return creep.room.terminal.store[a] - creep.room.terminal.store[b]
        });
        for (let resourceType of maxResource) {
            let amountNeeded = 0;
            // Storage cases
            if (_.sum(creep.room.storage.store) < 0.95 * creep.room.storage.store.getCapacity()) {
                if (_.sum(creep.room.terminal.store) >= 0.97 * creep.room.terminal.store.getCapacity()) {
                    amountNeeded = creep.store.getFreeCapacity(resourceType);
                } else if (_.includes(_.union(BASE_MINERALS, ALL_BOOSTS), resourceType) && creep.room.storage.store[resourceType] < REACTION_AMOUNT) {
                    amountNeeded = REACTION_AMOUNT - creep.room.storage.store[resourceType];
                } else if (resourceType === RESOURCE_ENERGY && creep.room.terminal.store[resourceType] > TERMINAL_ENERGY_BUFFER && creep.room.storage.store[resourceType] < ENERGY_AMOUNT * 1.1) {
                    amountNeeded = creep.room.terminal.store[resourceType] - TERMINAL_ENERGY_BUFFER;
                } else if (_.includes(COMPRESSED_COMMODITIES, resourceType) && creep.room.terminal.store[resourceType] >= 10000) {
                    amountNeeded = creep.room.terminal.store[resourceType] - 10000;
                }
            }
            if (amountNeeded > creep.store.getFreeCapacity(resourceType)) amountNeeded = creep.store.getFreeCapacity(resourceType);
            if (amountNeeded > creep.room.terminal.store[resourceType]) amountNeeded = creep.room.terminal.store[resourceType];
            if (amountNeeded >= 10) {
                creep.say('BANKER', true);
                switch (creep.withdraw(creep.room.terminal, resourceType, amountNeeded)) {
                    case OK:
                        return true;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(creep.room.terminal);
                        return true;
                }
            }
        }
    }
}

// Remove minerals from the storage if it's overfull and has no energy
function storageControl(creep) {
    // Sort by max
    let maxResource = Object.keys(creep.room.storage.store).sort(function (a, b) {
        return creep.room.storage.store[a] - creep.room.storage.store[b]
    });
    // Handle moving to terminal
    if (_.sum(creep.room.terminal.store) < 0.9 * creep.room.terminal.store.getCapacity()) {
        for (let resourceType of maxResource) {
            if (Game.shard.name === 'shardSeason' && resourceType === RESOURCE_SCORE) continue;
            let amountNeeded = 0;
            // Storage cases
            if (_.includes(BASE_MINERALS) && creep.room.storage.store[resourceType] > REACTION_AMOUNT) {
                amountNeeded = creep.room.storage.store[resourceType] - REACTION_AMOUNT;
            } else if (_.includes(ALL_BOOSTS) && creep.room.storage.store[resourceType] > BOOST_AMOUNT) {
                amountNeeded = creep.room.storage.store[resourceType] - BOOST_AMOUNT;
            } else if (resourceType === RESOURCE_ENERGY && creep.room.terminal.store[resourceType] < TERMINAL_ENERGY_BUFFER) {
                amountNeeded = TERMINAL_ENERGY_BUFFER - creep.room.terminal.store[resourceType];
            } else if (resourceType === RESOURCE_ENERGY && creep.room.storage.store[resourceType] > ENERGY_AMOUNT * 1.1) {
                amountNeeded = creep.room.storage.store[resourceType] - ENERGY_AMOUNT * 1.1;
            } else if (!_.includes(_.union(BASE_MINERALS, ALL_BOOSTS, [RESOURCE_ENERGY], COMPRESSED_COMMODITIES), resourceType)) {
                amountNeeded = creep.room.storage.store[resourceType];
            } else if (_.includes(COMPRESSED_COMMODITIES, resourceType) && creep.room.terminal.store[resourceType] < 10000) {
                amountNeeded = 10000 - creep.room.terminal.store[resourceType];
            } else if (resourceType === RESOURCE_POWER) {
                amountNeeded = 20000;
            }
            if (amountNeeded >= 10) {
                if (amountNeeded > creep.store.getFreeCapacity(resourceType)) amountNeeded = creep.store.getFreeCapacity(resourceType);
                if (amountNeeded > creep.room.storage.store[resourceType]) amountNeeded = creep.room.storage.store[resourceType];
                creep.say('STORAGE', true);
                switch (creep.withdraw(creep.room.storage, resourceType, amountNeeded)) {
                    case OK:
                        return true;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(creep.room.storage);
                        return true;
                }
            }
        }
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

// Needy Factory
function factorySupplies(creep) {
    let needyFactory = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_FACTORY && s.memory.producing)[0];
    if (needyFactory) {
        for (let neededResource of Object.keys(COMMODITIES[needyFactory.memory.producing].components)) {
            if (needyFactory.store[neededResource] < COMMODITIES[needyFactory.memory.producing].components[neededResource] && creep.room.store(neededResource)) {
                creep.memory.resourceNeeded = neededResource;
                creep.memory.deliverTo = needyFactory.id;
                return true;
            }
        }
    }
}

// Empty Factory
function emptyFactory(creep) {
    let needyFactory = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_FACTORY && s.memory.producing && s.store[s.memory.producing] >= 250)[0];
    let disabledFactory = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_FACTORY && !s.memory.producing)[0];
    if (needyFactory) {
        for (let storedResource of Object.keys(needyFactory.store)) {
            if (!_.includes(Object.keys(COMMODITIES[needyFactory.memory.producing].components), storedResource)) {
                creep.memory.resourceNeeded = storedResource;
                creep.memory.withdrawFrom = needyFactory.id;
                creep.memory.empty = true;
                return true;
            }
        }
    } else if (disabledFactory) {
        creep.memory.resourceNeeded = Object.keys(disabledFactory.store)[0];
        creep.memory.withdrawFrom = disabledFactory.id;
        creep.memory.empty = true;
        return true;
    }
}