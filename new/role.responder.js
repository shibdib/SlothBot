/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');


let protectedStructures = [
    STRUCTURE_SPAWN,
    STRUCTURE_STORAGE,
    STRUCTURE_TOWER,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_TERMINAL,
    STRUCTURE_NUKER,
    STRUCTURE_OBSERVER,
    STRUCTURE_LINK
];

function role(creep) {
    creep.invaderCheck();
    if (creep.memory.boostAttempt !== true) {
        let desiredReactions = [
            RESOURCE_KEANIUM_OXIDE
        ];
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
    creep.borderCheck();
    if (!creep.handleDefender()) {
        findDefensivePosition(creep, creep);
    }
}

module.exports.role = profiler.registerFN(role, 'responderRole');

function findDefensivePosition(creep, target) {
    if (target) {
        let bestRampart = target.pos.findClosestByPath(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() && (r.pos.lookFor(LOOK_CREEPS).length === 0 || (r.pos.x === creep.pos.x && r.pos.y === creep.pos.y))});
        if (bestRampart) {
            creep.memory.assignedRampart = bestRampart.id;
            if (bestRampart.pos !== creep.pos) {
                creep.shibMove(bestRampart, {forceRepath: true, range: 0});
            }
        }
    }
}
