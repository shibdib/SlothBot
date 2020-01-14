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
    if (Game.time % 50 === 0 && creep.wrongRoom()) return;
    creep.say(ICONS.haul, true);
    // Tow Truck
    if (creep.towTruck()) return;
    // If hauling do things
    if (creep.isFull) creep.memory.hauling = true;
    if (!_.sum(creep.store)) creep.memory.hauling = undefined;
    if (creep.memory.hauling) {
        if (creep.memory.storageDestination || creep.haulerDelivery()) {
            let storageItem = Game.getObjectById(creep.memory.storageDestination);
            if (!storageItem) return delete creep.memory.storageDestination;
            switch (creep.transfer(storageItem, RESOURCE_ENERGY)) {
                case OK:
                    delete creep.memory.storageDestination;
                    delete creep.memory._shibMove;
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(storageItem);
                    break;
                case ERR_FULL || ERR_INVALID_TARGET:
                    delete creep.memory.storageDestination;
                    delete creep.memory._shibMove;
                    if (storageItem.memory) delete storageItem.memory.deliveryIncoming;
                    break;
            }
        } else creep.idleFor(5);
    } else if (creep.memory.energyDestination || creep.getEnergy(true)) {
        if (creep.withdrawResource()) {
            if (creep.haulerDelivery()) {
                let storageItem = Game.getObjectById(creep.memory.storageDestination);
                creep.shibMove(storageItem);
            } else creep.idleFor(5);
        }
    } else creep.idleFor(5);
};