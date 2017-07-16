/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
let cache = require('module.cache');
const profiler = require('screeps-profiler');

function role(creep) {
    creep.cacheRoomIntel();
    if (creep.memory.boostAttempt !== true) {
        let desiredReactions = [];
        let count = 1;
        for (let i = 0; i < desiredReactions.length; i++) {
            let lab = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_LAB && s.mineralType === desiredReactions[i] && s.mineralAmount >= 30 && s.energy >= 20});
            if (lab) {
                count++;
                if (lab.boostCreep(creep) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(lab);
                }
            }
        }
        if (count === 1) {
            creep.memory.boostAttempt = true;
        }
        return null;
    }
    creep.tacticSiege();
}

module.exports.role = profiler.registerFN(role, 'deconstructorRole');
