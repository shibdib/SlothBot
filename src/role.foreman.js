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
    creep.say('FOREMAN', true);
    // Tow Truck
    if (creep.towTruck()) return;
    // Deliver
    if (_.sum(creep.store)) return deliverResource(creep);
    // Get resource
    if (creep.memory.resourceNeeded) return getResource(creep);
    // Empty labs
    if (emptyFactory(creep)) return;
    // Get factory orders
    if (factorySupplies(creep)) return;
    // Handle a super full hub link
    if (linkManager(creep)) return;
    // Handle terminal goods
    if (terminalControl(creep)) return;
    // Empty mineral harvester container
    if (mineralHauler(creep)) return;
    // Handle storage goods
    if (storageEmpty(creep)) return;
    // Handle dropped goodies
    if (droppedResources(creep)) return;
    creep.idleFor(20);
};

// Get item
function getResource(creep) {
    let storageSite = creep.room.terminal;
    if (creep.room.storage.store[creep.memory.resourceNeeded]) storageSite = creep.room.storage;
    let stockedLab = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.mineralType === creep.memory.resourceNeeded && s.mineralType !== s.memory.itemNeeded && s.mineralType !== s.memory.neededBoost)[0];
    if (stockedLab) storageSite = stockedLab;
    if (creep.room.factory && creep.memory.empty) storageSite = creep.room.factory;
    creep.say(creep.memory.resourceNeeded, true);
    if (storageSite.store[creep.memory.resourceNeeded]) {
        switch (creep.withdraw(storageSite, creep.memory.resourceNeeded)) {
            case OK:
                creep.memory.resourceNeeded = undefined;
                creep.memory.empty = undefined;
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
        let needyFactory = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_FACTORY && creep.memory.structureType === STRUCTURE_FACTORY && s.memory.inbound && creep.store[s.memory.inbound])[0];
        if (needyFactory) storeTarget = needyFactory;
        else if (_.sum(creep.room.storage.store) < 0.95 * creep.room.storage.store.getCapacity()) {
            if (_.sum(creep.room.terminal.store) >= 0.90 * creep.room.terminal.store.getCapacity()) storeTarget = creep.room.storage;
            else if (_.includes(BASE_MINERALS, resourceType) && creep.room.storage.store[resourceType] < REACTION_AMOUNT) storeTarget = creep.room.storage;
            else if (_.includes(ALL_COMMODITIES, resourceType)) storeTarget = creep.room.terminal;
            else if (_.includes(_.union(TIER_3_BOOSTS, LAB_PRIORITY), resourceType) && creep.room.storage.store[resourceType] < BOOST_AMOUNT) storeTarget = creep.room.storage;
            else if (!_.includes(BASE_MINERALS, resourceType) && !_.includes(ALL_COMMODITIES, resourceType) && creep.room.storage.store[resourceType] < REACTION_AMOUNT) storeTarget = creep.room.storage;
            else if (resourceType === RESOURCE_ENERGY && creep.room.terminal.store[resourceType] >= TERMINAL_ENERGY_BUFFER * 1.1 && creep.room.storage.store[RESOURCE_ENERGY] < ENERGY_AMOUNT) storeTarget = creep.room.storage;
        }
        switch (creep.transfer(storeTarget, resourceType)) {
            case OK:
                creep.memory.resourceNeeded = undefined;
                creep.memory.structureType = undefined;
                return;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(storeTarget);
                return;
            case ERR_FULL:
                creep.memory.resourceNeeded = undefined;
                creep.memory.structureType = undefined;
                creep.drop(resourceType);
                return true;
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
                needyFactory.memory.inbound = neededResource;
                creep.memory.structureType = STRUCTURE_FACTORY;
                return true;
            }
        }
    }
}

// Empty Factory
function emptyFactory(creep) {
    let needyFactory = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_FACTORY && s.memory.producing)[0];
    if (needyFactory) {
        for (let storedResource of Object.keys(needyFactory.store)) {
            if (!_.includes(Object.keys(COMMODITIES[needyFactory.memory.producing].components), storedResource)) {
                creep.memory.resourceNeeded = storedResource;
                creep.memory.structureType = STRUCTURE_FACTORY;
                creep.memory.empty = true;
                return true;
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
    if (hub && hub.energy >= LINK_CAPACITY * 0.9) {
        creep.say('LINK', true);
        switch (creep.withdraw(hub, RESOURCE_ENERGY)) {
            case OK:
                return true;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(hub);
                return true;
        }
    }
}

// Remove minerals from the terminal if it's overfull and has no energy or move boosts to storage
function terminalControl(creep) {
    // Handle a super full terminal
    if (_.sum(creep.room.terminal.store) >= 0.95 * creep.room.terminal.store.getCapacity()) {
        creep.say('BANKER', true);
        let maxResource = Object.keys(creep.room.terminal.store).sort(function (a, b) {
            return creep.room.terminal.store[a] - creep.room.terminal.store[b]
        })[_.size(creep.room.terminal.store) - 1];
        switch (creep.withdraw(creep.room.terminal, maxResource)) {
            case OK:
                return true;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(creep.room.terminal);
                return true;
        }
    }
    // Handle moving to storage
    else if (_.sum(creep.room.storage.store) < 0.95 * creep.room.storage.store.getCapacity()) {
        for (let resourceType of Object.keys(creep.room.terminal.store)) {
            // Default terminal
            let needsMovement = false;
            // Storage cases
            if (_.sum(creep.room.storage.store) < 0.95 * creep.room.storage.store.getCapacity()) {
                if (_.sum(creep.room.terminal.store) >= 0.90 * creep.room.terminal.store.getCapacity()) needsMovement = true;
                else if (_.includes(BASE_MINERALS, resourceType) && creep.room.storage.store[resourceType] < REACTION_AMOUNT) needsMovement = true;
                else if (!_.includes(BASE_MINERALS, resourceType) && !_.includes(ALL_COMMODITIES, resourceType) && creep.room.storage.store[resourceType] < REACTION_AMOUNT) needsMovement = true;
                else if (resourceType === RESOURCE_ENERGY && creep.room.terminal.store[resourceType] >= TERMINAL_ENERGY_BUFFER * 1.1 && creep.room.storage.store[RESOURCE_ENERGY] < ENERGY_AMOUNT) needsMovement = true;
            }
            if (needsMovement) {
                creep.say('BANKER', true);
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
}

// Remove minerals from the storage if it's overfull and has no energy
function storageEmpty(creep) {
    if (!creep.room.storage || !creep.room.terminal || _.sum(creep.room.terminal.store) >= 0.75 * creep.room.terminal.store.getCapacity()) return false;
    let maxResource = 0;
    let overflow;
    for (let resource of Object.keys(creep.room.storage.store)) {
        if (resource === RESOURCE_ENERGY) maxResource = ENERGY_AMOUNT;
        else if (_.includes(BASE_MINERALS, resource)) maxResource = REACTION_AMOUNT * 1.2;
        else if (_.includes(LAB_PRIORITY, resource)) maxResource = BOOST_AMOUNT * 1.2;
        else if (!_.includes(BASE_MINERALS, resource)) maxResource = REACTION_AMOUNT * 1.2;
        if (creep.room.storage.store[resource] > maxResource) {
            creep.say('BANKER', true);
            maxResource = creep.room.storage.store[resource];
            overflow = resource;
            break;
        }
    }
    creep.say('STORAGE', true);
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