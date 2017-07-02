/**
 * Created by Bob on 7/2/2017.
 */
let borderChecks = require('module.borderChecks');
let militaryFunctions = require('module.militaryFunctions');
const profiler = require('screeps-profiler');

let doNotAggress = RawMemory.segments[2];

function inCombat(creep) {
    let squadLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.squadLeader === true);
    let targets = creep.pos.findInRange(FIND_CREEPS, 3, {filter: (c) => c.hits < c.hitsMax && _.includes(doNotAggress, c.owner['username']) === true});
    let armedHostile = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(doNotAggress, e.owner['username']) === false});
    if (!armedHostile || creep.pos.getRangeTo(armedHostile) >= 6) {
        if (targets.length > 0) {
            if (creep.heal(targets[0]) === ERR_NOT_IN_RANGE) {
                creep.rangedHeal(targets[0]);
            }
        }
        if (squadLeader.length > 0) {
            creep.travelTo(squadLeader[0], {allowHostile: true, movingTarget: true});
        } else {
            creep.travelTo(Game.flags[creep.memory.staging]);
        }
    } else {
        if (targets.length > 0) {
            if (creep.heal(targets[0]) === ERR_NOT_IN_RANGE) {
                creep.rangedHeal(targets[0]);
            }
        }
        militaryFunctions.kite(creep, 7);
    }
}
module.exports.inCombat = profiler.registerFN(inCombat, 'inCombatMedicTactic');