/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    if (!creep.memory.boostAttempt) return creep.tryToBoost(['heal', 'tough']);
    if (creep.hits < creep.hitsMax) creep.heal(creep);
    creep.siegeRoom();
}

module.exports.role = profiler.registerFN(role, 'siegeHealer');
