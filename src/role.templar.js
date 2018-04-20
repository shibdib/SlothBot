/**
 * Created by Bob on 7/19/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    creep.borderCheck();
    if (!creep.memory.boostAttempt) return creep.tryToBoost(['heal', 'tough', 'ranged']);
    // Harass
    if (creep.memory.operation && creep.memory.operation === 'harass') creep.harassRoom();
    // Escort
    if (creep.memory.operation && creep.memory.operation === 'guard') creep.guardRoom();
    // Hold
    if (creep.memory.operation && creep.memory.operation === 'hold') creep.holdRoom();
    // Swarm
    if (creep.memory.operation && creep.memory.operation === 'templarSiege') creep.templarSiege();

}

module.exports.role = profiler.registerFN(role, '');