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
    // Tow Truck
    if (creep.towTruck()) return;
    // If hauling do things
    if (_.sum(creep.carry) >= creep.carryCapacity * 0.5) creep.memory.hauling = true;
    if (!_.sum(creep.carry)) creep.memory.hauling = undefined;
    if (creep.memory.hauling) {
        // Hub Container
        let hubContainer = Game.getObjectById(creep.memory.storageDestination) || creep.room.storage || creep.pos.findInRange(_.filter(creep.room.structures, (s) => s.my && s.structureType === STRUCTURE_LINK), 3)[0] || Game.getObjectById(creep.room.memory.hubContainer) || Game.getObjectById(creep.findStorage()) || Game.getObjectById(creep.findSpawnsExtensions());
        if (hubContainer) {
            if (_.sum(hubContainer.store) === hubContainer.storeCapacity) return creep.idleFor(10);
            let storageItem = hubContainer;
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
    } else if (creep.memory.energyDestination || creep.fillerEnergy()) creep.withdrawResource(); else creep.idleFor(5);
};