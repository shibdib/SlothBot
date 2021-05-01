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
    // Deliver
    if (_.sum(creep.store)) return deliverResource(creep);
    // Get resource
    if (creep.memory.resourceNeeded) return getResource(creep);
    // Tow Truck
    if (creep.towTruck()
        // Empty labs
        || emptyLab(creep)
        //If creep needs boosts do that first
        || boostDelivery(creep)
        // Handle dropped goodies
        || droppedResources(creep)
        // Check nuker for ghodium
        || nukeSupplies(creep)
        // Get lab orders
        || labSupplies(creep)
        // Empty mineral harvester container
        || mineralHauler(creep)
        // Get factory orders
        || factorySupplies(creep)
        // Handle terminal goods
        || terminalControl(creep)
        // Handle storage goods
        || storageControl(creep)
        // Empty factories
        || emptyFactory(creep)) return;
    // If nothing to do, idle
    creep.idleFor(50);
};

// Get item
function getResource(creep) {
    let storageSite;
    if (!creep.memory.storageSite) {
        if (creep.room.terminal && creep.room.terminal.store[creep.memory.resourceNeeded]) storageSite = creep.room.terminal;
        if (creep.room.storage && creep.room.storage.store[creep.memory.resourceNeeded]) storageSite = creep.room.storage;
        if (creep.room.factory && creep.room.factory.store[creep.memory.resourceNeeded] && creep.memory.deliverTo !== creep.room.factory.id) storageSite = creep.room.factory;
        if (creep.memory.withdrawFrom) {
            if (!Game.getObjectById(creep.memory.withdrawFrom) || !Game.getObjectById(creep.memory.withdrawFrom).store[creep.memory.resourceNeeded]) creep.memory.withdrawFrom = undefined; else storageSite = Game.getObjectById(creep.memory.withdrawFrom);
        }
        let stockedLab = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.mineralType === creep.memory.resourceNeeded && s.mineralType !== s.memory.itemNeeded && s.mineralType !== s.memory.neededBoost)[0];
        let container = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.store[creep.memory.resourceNeeded] && creep.memory.resourceNeeded !== RESOURCE_ENERGY)[0];
        if (container) storageSite = container;
        if (stockedLab) storageSite = stockedLab;
    } else {
        storageSite = Game.getObjectById(creep.memory.storageSite);
    }
    creep.say(creep.memory.resourceNeeded, true);
    let amount = creep.memory.amountNeeded || undefined;
    if (creep.memory.deliverTo && Game.getObjectById(creep.memory.deliverTo).amount) amount = Game.getObjectById(creep.memory.deliverTo).amount;
    if (storageSite && storageSite.store[creep.memory.resourceNeeded]) {
        creep.memory.storageSite = storageSite.id;
        switch (creep.withdraw(storageSite, creep.memory.resourceNeeded, amount)) {
            case OK:
                creep.memory.resourceNeeded = undefined;
                creep.memory.amountNeeded = undefined;
                creep.memory.empty = undefined;
                creep.memory.withdrawFrom = undefined;
                creep.memory.storageSite = undefined;
                return true;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(storageSite);
                return true;
        }
    } else {
        creep.memory.storageSite = undefined;
        creep.memory.resourceNeeded = undefined;
        creep.memory.amountNeeded = undefined;
    }
}

// Store items
function deliverResource(creep) {
    if (!_.sum(creep.store)) return false;
    let storeTarget;
    if (!creep.memory.storeTarget || !creep.memory.deliveryResource) {
        for (let resourceType in creep.store) {
            // Default terminal
            storeTarget = creep.room.terminal;
            // Storage cases
            let nuke = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_NUKER && s.store.getFreeCapacity(RESOURCE_GHODIUM))[0];
            let lab = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && creep.memory.structureType === STRUCTURE_LAB && s.memory.active === true && (!s.mineralType || s.mineralType === resourceType) && (s.memory.neededBoost === resourceType || s.memory.itemNeeded === resourceType))[0];
            if (creep.memory.deliverTo) storeTarget = Game.getObjectById(creep.memory.deliverTo)
            else if (lab) storeTarget = lab;
            else if (nuke && creep.store[RESOURCE_GHODIUM]) storeTarget = nuke;
            else if (_.sum(creep.room.storage.store) < creep.room.storage.store.getCapacity()) {
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
            creep.memory.storeTarget = storeTarget.id;
            creep.memory.deliveryResource = resourceType;
        }
    } else if (creep.memory.storeTarget && creep.memory.deliveryResource) {
        creep.say('DELIVER', true);
        let storeTarget = Game.getObjectById(creep.memory.storeTarget);
        switch (creep.transfer(storeTarget, creep.memory.deliveryResource)) {
            case OK:
                creep.memory.resourceNeeded = undefined;
                creep.memory.deliverTo = undefined;
                creep.memory.storeTarget = undefined;
                creep.memory.deliveryResource = undefined;
                return;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(storeTarget);
                return;
            default:
                creep.memory.resourceNeeded = undefined;
                creep.memory.deliverTo = undefined;
                creep.memory.storeTarget = undefined;
                creep.memory.deliveryResource = undefined;
                creep.drop(creep.memory.deliveryResource);
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
    let needyLab = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.itemNeeded && (!s.mineralType || s.mineralType === s.memory.itemNeeded) && s.store.getUsedCapacity(s.memory.itemNeeded) < 150 && creep.room.store(s.memory.itemNeeded, true))[0];
    if (needyLab) {
        creep.memory.resourceNeeded = needyLab.memory.itemNeeded;
        creep.memory.deliverTo = needyLab.id;
        return true;
    }
}

// Empty Labs
function emptyLab(creep) {
    let stockedLab = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.itemNeeded && s.mineralType && s.mineralType !== s.memory.itemNeeded && s.mineralType !== s.memory.neededBoost)[0] ||
        _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.mineralType && !s.memory.itemNeeded && s.memory.creating && (s.mineralType !== s.memory.creating || s.store[s.mineralType] >= 250) && s.mineralType !== s.memory.neededBoost)[0] ||
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
    if (_.sum(creep.room.terminal.store) >= creep.room.terminal.store.getCapacity() * 0.95) {
        creep.memory.resourceNeeded = Object.keys(creep.room.terminal.store).sort(function (a, b) {
            return creep.room.terminal.store[a] - creep.room.terminal.store[b]
        })[_.size(creep.room.terminal.store) - 1];
        creep.memory.storageSite = creep.room.terminal.id;
    }
    // Handle moving to storage
    else if (_.sum(creep.room.storage.store) < creep.room.storage.store.getCapacity()) {
        let maxResource = Object.keys(creep.room.terminal.store).sort(function (a, b) {
            return creep.room.terminal.store[a] - creep.room.terminal.store[b]
        });
        for (let resourceType of maxResource) {
            let amountNeeded = 0;
            // Storage cases
            if (_.sum(creep.room.terminal.store) >= 0.97 * creep.room.terminal.store.getCapacity()) {
                amountNeeded = creep.store.getFreeCapacity(resourceType);
            } else if (_.includes(_.union(BASE_MINERALS, ALL_BOOSTS), resourceType) && creep.room.storage.store[resourceType] < REACTION_AMOUNT) {
                amountNeeded = REACTION_AMOUNT - creep.room.storage.store[resourceType];
            } else if (resourceType === RESOURCE_ENERGY && creep.room.terminal.store[resourceType] > TERMINAL_ENERGY_BUFFER * 5 && creep.room.storage.store[resourceType] < ENERGY_AMOUNT * 1.1) {
                amountNeeded = creep.room.terminal.store[resourceType] - TERMINAL_ENERGY_BUFFER;
            } else if (_.includes(COMPRESSED_COMMODITIES, resourceType) && creep.room.terminal.store[resourceType] >= 10000) {
                amountNeeded = creep.room.terminal.store[resourceType] - 10000;
            }
            if (amountNeeded > creep.store.getFreeCapacity(resourceType)) amountNeeded = creep.store.getFreeCapacity(resourceType);
            if (amountNeeded > creep.room.terminal.store[resourceType]) amountNeeded = creep.room.terminal.store[resourceType];
            if (amountNeeded >= 10) {
                creep.memory.resourceNeeded = resourceType;
                creep.memory.storageSite = creep.room.terminal.id;
                creep.memory.amountNeeded = amountNeeded;
                return true;
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
            //if (Game.shard.name === 'shardSeason' && resourceType === RESOURCE_SCORE) continue;
            if (Game.shard.name === 'shardSeason' && _.includes(SYMBOLS, resourceType)) continue;
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
                creep.memory.resourceNeeded = resourceType;
                creep.memory.storageSite = creep.room.storage.id;
                creep.memory.amountNeeded = amountNeeded;
                creep.memory.storeTarget = creep.room.terminal.id;
                creep.memory.deliveryResource = resourceType;
                return true;
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
    if (!creep.room.factory) return false;
    if (creep.room.factory.memory.producing && creep.room.factory.store.getUsedCapacity()) {
        for (let storedResource of Object.keys(creep.room.factory.store)) {
            if (!_.includes(Object.keys(COMMODITIES[creep.room.factory.memory.producing].components), storedResource)) {
                creep.memory.resourceNeeded = storedResource;
                creep.memory.withdrawFrom = creep.room.factory.id;
                creep.memory.empty = true;
                return true;
            }
        }
    } else if (!creep.room.factory.memory.producing) {
        if (Object.keys(creep.room.factory.store)[0]) {
            creep.memory.resourceNeeded = Object.keys(creep.room.factory.store)[0];
            creep.memory.withdrawFrom = creep.room.factory.id;
            creep.memory.empty = true;
            return true;
        }
    }
}