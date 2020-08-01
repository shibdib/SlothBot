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
    switch (creep.memory.operation) {
        case 'hold':
        case 'clean':
            creep.holdRoom();
            break;
        case 'siege':
            creep.siegeRoom();
            break;
    }
};
