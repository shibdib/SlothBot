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
    if (creep.tryToBoost(['heal'])) return;
    if (creep.hits < creep.hitsMax) creep.heal(creep);
    if (creep.memory.operation) {
        switch (creep.memory.operation) {
            case 'marauding':
                creep.marauding();
                break;
            case 'siegeGroup':
                creep.siegeGroupRoom();
                break;
            case 'hold':
                creep.holdRoom();
                break;
            case 'borderPatrol':
                creep.borderPatrol();
                break;
        }
    }
    creep.say(ICONS.medical + 'Medic' + ICONS.medical, true);
};
