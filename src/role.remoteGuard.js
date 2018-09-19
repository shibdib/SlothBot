/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    if (creep.borderCheck()) return;
    if (creep.hits < creep.hitsMax) creep.heal(creep);
    // Responder Mode
    if (creep.memory.responseTarget) {
        creep.say(ICONS.respond, true);
        if (creep.room.name !== creep.memory.responseTarget) {
            let hostile = creep.findClosestEnemy();
            if (hostile && (!creep.room.controller || !creep.room.controller.safeMode)) {
                return creep.handleMilitaryCreep(false, true);
            } else {
                return creep.shibMove(new RoomPosition(25, 25, creep.memory.responseTarget), {range: 18}); //to move to any room}
            }
        } else {
            if (!creep.handleMilitaryCreep(false, true)) {
                creep.memory.awaitingOrders = !creep.room.memory.responseNeeded;
                return findDefensivePosition(creep, creep);
            }
        }
    } else {
        if (!creep.handleMilitaryCreep(false, true)) {
            creep.memory.awaitingOrders = !creep.room.memory.responseNeeded;
            return findDefensivePosition(creep, creep);
        }
    }
}

module.exports.role = profiler.registerFN(role, 'longbow');

function findDefensivePosition(creep, target) {
    if (target) {
        let bestRampart = target.pos.findClosestByPath(creep.room.structures, {
            filter: (r) => r.structureType === STRUCTURE_RAMPART &&
                !r.pos.checkForAllStructure(true) && (r.pos.lookFor(LOOK_CREEPS).length === 0 || (r.pos.x === creep.pos.x && r.pos.y === creep.pos.y)) &&
                (!r.room.memory.extensionHub || (r.pos.x !== r.room.memory.extensionHub.x && r.pos.y !== r.room.memory.extensionHub.y))
        });
        if (bestRampart) {
            creep.memory.assignedRampart = bestRampart.id;
            if (bestRampart.pos !== creep.pos) {
                creep.shibMove(bestRampart, {forceRepath: true, range: 0});
            }
        } else if (creep.pos.checkForRoad()) {
            creep.moveRandom();
        } else {
            creep.idleFor(15)
        }
    }
}
