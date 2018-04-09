/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    if (!creep.memory.boostAttempt) return creep.tryToBoost(['attack', 'heal']);
    creep.borderCheck();
    if (creep.hits < creep.hitsMax) creep.heal(creep);
    // Harass
    if (creep.memory.operation && creep.memory.operation === 'harass') creep.harassRoom();
}

module.exports.role = profiler.registerFN(role, 'healerRole');
