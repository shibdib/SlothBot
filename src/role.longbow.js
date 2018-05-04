/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    if (!creep.memory.boostAttempt) return creep.tryToBoost(['ranged']);
    if (creep.borderCheck()) return;
    if (creep.hits < creep.hitsMax) creep.heal(creep);
    // Responder Mode
    if (creep.memory.responseTarget) {
        creep.say(ICONS.respond, true);
        if (creep.room.name !== creep.memory.responseTarget) {
            let hostile = creep.findClosestEnemy();
            if (hostile) {
                return creep.fightRanged(hostile);
            } else {
                return creep.shibMove(new RoomPosition(25, 25, creep.memory.responseTarget), {range: 18}); //to move to any room}
            }
        } else {
            if (!creep.handleMilitaryCreep(false, true)) {
                creep.memory.awaitingOrders = !creep.room.memory.responseNeeded;
                return findDefensivePosition(creep, creep);
            }
        }
        return;
    }
    // Harass
    if (creep.memory.operation && creep.memory.operation === 'harass') creep.harassRoom();
    // Escort
    if (creep.memory.operation && creep.memory.operation === 'guard') creep.guardRoom();
    // Hold
    if (creep.memory.operation && creep.memory.operation === 'hold') creep.holdRoom();
    // Hold
    if (creep.memory.operation && creep.memory.operation === 'rangers') creep.rangersRoom();
}

module.exports.role = profiler.registerFN(role, 'longbow');

function findDefensivePosition(creep, target) {
    if (target) {
        let bestRampart = target.pos.findClosestByPath(creep.room.structures, {filter: (r) => r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() && (r.pos.lookFor(LOOK_CREEPS).length === 0 || (r.pos.x === creep.pos.x && r.pos.y === creep.pos.y))});
        if (bestRampart) {
            creep.memory.assignedRampart = bestRampart.id;
            if (bestRampart.pos !== creep.pos) {
                creep.shibMove(bestRampart, {forceRepath: true, range: 0});
            }
        } else {
            return creep.shibMove(new RoomPosition(25, 25, creep.memory.responseTarget), {range: 18}); //to move to any room}
        }
    }
}
