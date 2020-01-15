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
    if (creep.memory.operation) {
        switch (creep.memory.operation) {
            case 'marauding':
                creep.marauding();
                break;
            case 'guard':
                creep.guardRoom();
                break;
            case 'hold':
                creep.holdRoom();
                break;
            case 'borderPatrol':
                creep.borderPatrol();
                break;
        }
    }
};
