/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    creep.borderCheck();
    if (creep.renewalCheck(1, 800, 1400, true)) return null;
    if (creep.memory.operation === 'robbery') return creep.robbery();
}

module.exports.role = profiler.registerFN(role, 'raiderRole');
