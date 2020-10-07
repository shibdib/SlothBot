/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.role = function (creep) {
    creep.say(ICONS.haul, true);
    if (creep.wrongRoom()) return;
    // If hauling do things
    if (creep.isFull) creep.memory.hauling = true;
    if (creep.memory.hauling) {
        if (!_.sum(creep.store)) return creep.memory.hauling = undefined;
        // Perform opportunistic filling
        creep.opportunisticFill();
        if (!creep.haulerDelivery()) creep.idleFor(10)
    } else if (creep.towTruck()) {
        return true;
    } else if (creep.room.storage && droppedResources(creep)) {
        return true;
    } else if (creep.memory.energyDestination || creep.locateEnergy()) {
        creep.withdrawResource()
    } else {
        creep.idleFor(10)
    }
};

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