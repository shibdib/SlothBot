/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    if (!creep.memory.boostAttempt) return creep.tryToBoost(['dismantle', 'tough', 'heal']);
    creep.borderCheck();
    creep.siegeRoom();
}

module.exports.role = profiler.registerFN(role, 'siegeEngine');
