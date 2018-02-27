/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    creep.borderCheck();
    if (creep.memory.operation === 'clean') return creep.cleanRoom();
}

module.exports.role = profiler.registerFN(role, 'deconstructorRole');
