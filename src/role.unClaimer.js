/*
 * Copyright (c) 2018.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */
const profiler = require('screeps-profiler');

function role(creep) {
    if (creep.memory.operation === 'hold') return creep.holdRoom();
}

module.exports.role = profiler.registerFN(role, 'unClaimer');