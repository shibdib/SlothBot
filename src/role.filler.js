/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.role = function (creep) {
    creep.say(ICONS.haul, true);
    // If hauling do things
    if (creep.isFull) creep.memory.hauling = true;
    if (creep.memory.hauling) {
        if (!_.sum(creep.store)) return creep.memory.hauling = undefined;
        // Perform opportunistic road repair
        creep.opportunisticFill();
        creep.haulerDelivery();
    } else if (creep.towTruck()) {
        return true;
    } else if (creep.memory.energyDestination || creep.locateEnergy()) {
        creep.withdrawResource()
    } else {
        creep.idleFor(10)
    }
};