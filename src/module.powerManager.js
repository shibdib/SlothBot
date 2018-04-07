/**
 * Created by rober on 5/16/2017.
 */
let _ = require('lodash');
const profiler = require('screeps-profiler');

function powerControl(room) {
    let powerSpawn = _.filter(room.structures, (s) => s.structureType === STRUCTURE_POWER_SPAWN)[0];
    if (powerSpawn) {
        if (powerSpawn.power >= 1 && powerSpawn.energy >= 50) {
            powerSpawn.processPower();
        }
    }
}

module.exports.powerControl = profiler.registerFN(powerControl, 'powerControl');

