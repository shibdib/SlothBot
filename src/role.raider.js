/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    if (creep.memory.operation === 'robbery') return creep.robbery();
}

module.exports.role = profiler.registerFN(role, 'raiderRole');
