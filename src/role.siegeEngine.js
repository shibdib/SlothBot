/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    if (!creep.memory.boostAttempt) return creep.tryToBoost(['tough', 'attack', 'ranged']);
    creep.borderCheck();
    let alliedCreep = _.filter(creep.room.creeps, (c) => !c.my && _.includes(FRIENDLIES, c.owner));
    if (!creep.pos.findInRange(alliedCreep, 3)[0] && creep.getActiveBodyparts(RANGED_ATTACK) > 0) creep.rangedMassAttack();
    creep.siegeRoom();
}

module.exports.role = profiler.registerFN(role, 'siegeEngine');
