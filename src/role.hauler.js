/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.role = function (creep) {
    creep.say(ICONS.haul, true);
    if (creep.towTruck()) return true;
    // If hauling do things
    if (_.sum(creep.store)) {
        if (_.sum(creep.store) > creep.store[RESOURCE_ENERGY]) {
            let storageItem = creep.room.storage || _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.store.getFreeCapacity() >= CONTAINER_CAPACITY * 0.5)[0]
            for (const resourceType in creep.store) {
                if (resourceType === RESOURCE_ENERGY) continue;
                if (!storageItem) return creep.drop(resourceType);
                switch (creep.transfer(storageItem, resourceType)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(storageItem);
                        break;
                }
            }
        } else {
            if (!_.sum(creep.store)) return creep.memory.hauling = undefined;
            if (!creep.opportunisticFill() && !creep.haulerDelivery()) creep.idleFor(5)
        }
    } else if (Game.shard.name === 'shardSeason' && creep.room.find(FIND_SCORE_CONTAINERS)[0]) {
        creep.say('SCORE!', true)
        let container = creep.room.find(FIND_SCORE_CONTAINERS)[0];
        switch (creep.withdraw(container, RESOURCE_SCORE)) {
            case OK:
                break;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(container);
                break;
        }
    } else if (Game.shard.name === 'shardSeason' && creep.room.storage && _.filter(creep.room.structures, (s) => s.store && s.store[RESOURCE_SCORE] && s.structureType !== STRUCTURE_STORAGE)[0]) {
        creep.say('SCORE!', true)
        let container = _.filter(creep.room.structures, (s) => s.store && s.store[RESOURCE_SCORE] && s.structureType !== STRUCTURE_STORAGE)[0];
        switch (creep.withdraw(container, RESOURCE_SCORE)) {
            case OK:
                break;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(container);
                break;
        }
    } else if (creep.memory.energyDestination || creep.locateEnergy()) {
        creep.withdrawResource()
    } else {
        creep.idleFor(10)
    }
};