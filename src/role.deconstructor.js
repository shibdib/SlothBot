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
    if (!creep.memory.boostAttempt && creep.memory.operation !== 'clean') return creep.tryToBoost(['dismantle', 'tough']);
    if (!creep.memory.boostAttempt && creep.memory.operation === 'clean') return creep.tryToBoost(['dismantle']);
    if (creep.hits < creep.hitsMax) creep.heal(creep);
    if (creep.memory.operation === 'clean' || creep.memory.operation === 'hold') return creep.cleanRoom();
    if (creep.memory.operation === 'siege') creep.siegeRoom();
};
