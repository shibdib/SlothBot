/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    creep.say(ICONS.respond, true);
    creep.room.invaderCheck();
    if (creep.room.memory.threatLevel > 2) if (!creep.memory.boostAttempt) return creep.tryToBoost(['attack']);
    creep.borderCheck();
    if (!creep.handleDefender()) {
        findDefensivePosition(creep, creep);
    }
}

module.exports.role = profiler.registerFN(role, 'responderRole');

function findDefensivePosition(creep, target) {
    if (target) {
        let bestRampart = target.pos.findClosestByPath(creep.room.structures, {filter: (r) => r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() && (r.pos.lookFor(LOOK_CREEPS).length === 0 || (r.pos.x === creep.pos.x && r.pos.y === creep.pos.y))});
        if (bestRampart) {
            creep.memory.assignedRampart = bestRampart.id;
            if (bestRampart.pos !== creep.pos) {
                creep.shibMove(bestRampart, {forceRepath: true, range: 0});
            }
        }
    }
}
