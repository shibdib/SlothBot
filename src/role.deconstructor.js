/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    if (!creep.memory.boostAttempt && creep.memory.operation !== 'clean') return creep.tryToBoost(['dismantle', 'tough']);
    if (!creep.memory.boostAttempt && creep.memory.operation === 'clean') return creep.tryToBoost(['dismantle']);
    creep.borderCheck();
    if (creep.hits < creep.hitsMax) creep.heal(creep);
    if (creep.memory.operation === 'clean') return creep.cleanRoom();
    if (creep.memory.operation === 'siege') creep.siegeRoom();
}

module.exports.role = profiler.registerFN(role, 'deconstructorRole');
