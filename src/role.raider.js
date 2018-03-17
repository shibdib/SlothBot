/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    creep.borderCheck();
    if (creep.ticksToLive < 300) {
        if (creep.room.name !== creep.memory.overlord) return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 20});
        if (creep.renewalCheck(1, 300, 1400, true)) return null;
    }
    if (creep.renewalCheck(1, 800, 1400, true)) return null;
    if (creep.memory.operation === 'robbery') return creep.robbery();
}

module.exports.role = profiler.registerFN(role, 'raiderRole');
