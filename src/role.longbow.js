/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    creep.room.invaderCheck();
    if (!creep.memory.boostAttempt) return creep.tryToBoost(['ranged']);
    creep.borderCheck();
    if (creep.hits < creep.hitsMax) creep.heal(creep);
    // Responder Mode
    if (creep.memory.responseTarget) {
        creep.say(ICONS.respond, true);
        if (creep.room.name !== creep.memory.responseTarget) {
            let hostile = creep.pos.findClosestByRange(creep.room.creeps, {filter: (c) => !_.includes(FRIENDLIES, c.owner.username)});
            if (hostile) {
                return creep.fightRanged(hostile);
            } else {
                return creep.shibMove(new RoomPosition(25, 25, creep.memory.responseTarget), {range: 15}); //to move to any room}
            }
        } else if (creep.room.name === creep.memory.responseTarget) {
            let hostile = creep.pos.findClosestByRange(creep.room.creeps, {filter: (c) => !_.includes(FRIENDLIES, c.owner.username)});
            let hub;
            if (creep.room.memory.extensionHub) hub = new RoomPosition(creep.room.memory.extensionHub.x, creep.room.memory.extensionHub.y, creep.room.name);
            if (hub && hostile && hub.getRangeTo(hostile) >= 12) return creep.fightRanged(hostile);
            if (!creep.handleDefender()) {
                return findDefensivePosition(creep, creep);
            }
        }
    }
    // Harass
    if (creep.memory.operation && creep.memory.operation === 'harass') creep.harassRoom();
    // Escort
    if (creep.memory.operation && creep.memory.operation === 'guard') creep.guardRoom();
    // Hold
    if (creep.memory.operation && creep.memory.operation === 'hold') creep.holdRoom();
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
        }
    }
}
