/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.role = function (creep) {
    creep.opportunisticFill();
    //INITIAL CHECKS
    if (creep.wrongRoom()) return;
    creep.say(ICONS.haul, true);
    // Tow Truck
    if (creep.towTruck()) return;
    // If hauling do things
    if (creep.isFull) creep.memory.hauling = true;
    if (!_.sum(creep.store)) creep.memory.hauling = undefined;
    if (creep.memory.hauling) {
        // Perform opportunistic road repair
        creep.repairRoad();
        creep.haulerDelivery();
    } else if (creep.memory.energyDestination || creep.locateEnergy()) {
        creep.withdrawResource()
    } else {
        creep.idleFor(10)
    }
};