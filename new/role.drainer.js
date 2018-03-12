/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    if (creep.memory.boostAttempt !== true) return creep.tryToBoost(['heal', 'tough']);
    creep.drainRoom();
}

module.exports.role = profiler.registerFN(role, 'drainerRole');