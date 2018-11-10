/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    if (!creep.memory.boostAttempt) return creep.tryToBoost(['tough', 'attack', 'ranged']);
    if (creep.memory.operation === 'siege') return creep.siegeRoom();
    if (creep.memory.operation === 'siegeGroup') return creep.siegeGroupRoom();
}

module.exports.role = profiler.registerFN(role, 'siegeEngine');
