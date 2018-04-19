/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    creep.borderCheck();
    creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {
        range: 18,
        offRoad: true
    });
    let enemy = _.filter(creep.room.creeps, (c) => !_.includes(FRIENDLIES, c.owner.username) && (c.getActiveBodyparts(ATTACK) >= 1 || c.getActiveBodyparts(RANGED_ATTACK) >= 1) && c.owner.username !== 'Source Keeper');
    if (enemy) creep.kite(8);
}

module.exports.role = profiler.registerFN(role, 'observerRole');
