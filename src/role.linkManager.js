/*
 * Copyright (c) 2019.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    //INITIAL CHECKS
    if (Game.time % 150 === 0 && creep.wrongRoom()) return;
    creep.say(ICONS.haul, true);
    // If hauling do things
    if (_.sum(creep.carry) >= creep.carryCapacity * 0.5) creep.memory.hauling = true;
    if (!_.sum(creep.carry)) creep.memory.hauling = undefined;
    if (creep.memory.hauling) {
        // Hub Container
        let storageDestination = Game.getObjectById(creep.memory.storageDestination) || creep.room.storage || Game.getObjectById(creep.findStorage()) || Game.getObjectById(creep.findSpawnsExtensions());
        if (storageDestination) {
            if (_.sum(storageDestination.store) === storageDestination.storeCapacity) return creep.idleFor(10);
            let storageItem = storageDestination;
            if (!storageItem) return delete creep.memory.storageDestination;
            switch (creep.transfer(storageItem, RESOURCE_ENERGY)) {
                case OK:
                    delete creep.memory.storageDestination;
                    delete creep.memory._shibMove;
                    break;
                case ERR_NOT_IN_RANGE:
                    if (storageItem.structureType !== STRUCTURE_TOWER) {
                        let adjacentStructure = _.filter(creep.pos.findInRange(FIND_STRUCTURES, 1), (s) => (s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN) && s.energy < s.energyCapacity);
                        if (adjacentStructure.length > 0) creep.transfer(adjacentStructure[0], RESOURCE_ENERGY);
                    }
                    creep.shibMove(storageItem);
                    break;
                case ERR_FULL || ERR_INVALID_TARGET:
                    delete creep.memory.storageDestination;
                    delete creep.memory._shibMove;
                    if (storageItem.memory) delete storageItem.memory.deliveryIncoming;
                    break;
            }
        }
    } else {
        if (!creep.memory.energyDestination) {
            let hubLink = Game.getObjectById(creep.room.memory.hubLink) || Game.getObjectById(_.sample(creep.room.memory.hubLinks));
            if (hubLink && hubLink.energy) creep.memory.energyDestination = hubLink.id;
        }
        if (creep.memory.energyDestination) creep.withdrawResource(); else creep.idleFor(5);
    }
};