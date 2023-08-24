/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.role = function (creep) {
    creep.say(ICONS.haul, true);
    if (creep.towTruck() || (Math.random() > 0.7 && creep.wrongRoom())) return true;
    // If hauling do things
    if (_.sum(creep.store)) {
        creep.opportunisticFill();
        if (!creep.haulerDelivery()) creep.idleFor(5)
    } else {
        if (!creep.memory.energyDestination) creep.memory._shibMove = undefined;
        if (creep.memory.energyDestination || creep.locateEnergy()) {
            creep.withdrawResource()
        } else {
            creep.idleFor(5);
        }
    }
};