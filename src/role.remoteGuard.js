/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    if (creep.borderCheck()) return;
    if (creep.hits < creep.hitsMax) creep.heal(creep);
    if (!creep.getActiveBodyparts(ATTACK) && !creep.getActiveBodyparts(RANGED_ATTACK)) return creep.goHomeAndHeal();
    // Squad leader
    let remoteGuardLeader = _.filter(Game.creeps, (c) => c.memory.overlord === creep.memory.overlord && c.memory.role === 'remoteGuard' && c.memory.squadLeader);
    let remoteGuards = _.filter(Game.creeps, (c) => c.memory.overlord === creep.memory.overlord && c.memory.role === 'remoteGuard' && !c.spawning && c.id !== creep.id);
    if (!remoteGuardLeader.length) creep.memory.squadLeader = true;
    if (!creep.memory.squadLeader) {
        if (!creep.findClosestEnemy() && creep.pos.getRangeTo(remoteGuardLeader[0]) > 4) return creep.shibMove(remoteGuardLeader[0]);
        if (remoteGuardLeader[0].memory.responseTarget) {
            creep.memory.responseTarget = remoteGuardLeader[0].memory.responseTarget;
        } else creep.memory.responseTarget = undefined;
    }
    if (!creep.findClosestEnemy() && (!remoteGuards[0] || (creep.memory.squadLeader && remoteGuards[0].pos.roomName === creep.pos.roomName && (creep.pos.getRangeTo(remoteGuards[0]) > 6)))) return creep.shibMove(remoteGuards[0]);
    // Responder Mode
    if (creep.memory.awaitingOrders) creep.memory.responseTarget = undefined;
    if (creep.memory.responseTarget) {
        creep.memory.guardTime = undefined;
        creep.say(ICONS.respond, true);
        if (creep.room.name !== creep.memory.responseTarget) {
            let hostile = creep.findClosestEnemy();
            if (hostile && (!creep.room.controller || !creep.room.controller.safeMode)) {
                return creep.handleMilitaryCreep(false, true);
            } else {
                if (creep.memory.squadLeader && !remoteGuards[0]) return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 18});
                return creep.shibMove(new RoomPosition(25, 25, creep.memory.responseTarget), {range: 18}); //to move to any room}
            }
        } else {
            if (!creep.handleMilitaryCreep(false, true, true)) {
                creep.memory.awaitingOrders = !creep.room.memory.responseNeeded;
                creep.room.invaderCheck();
            }
        }
    } else {
        if (!creep.handleMilitaryCreep(false, true)) {
            if (!creep.memory.guardTime) creep.memory.guardTime = Game.time;
            if (creep.memory.guardTime + 100 <= Game.time && creep.room.name !== creep.memory.overlord) {
                return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 18});
            }
            creep.room.invaderCheck();
            creep.memory.awaitingOrders = !creep.room.memory.responseNeeded;
            if (creep.pos.checkForRoad()) {
                creep.moveRandom();
            } else {
                if (creep.pos.getRangeTo(new RoomPosition(25, 25, creep.room.name)) > 20) creep.shibMove(new RoomPosition(25, 25, creep.room.name), {range: 18});
                creep.idleFor(5)
            }
        }
    }
}

module.exports.role = profiler.registerFN(role, 'longbow');

function findDefensivePosition(creep, target) {
    if (target) {
        let bestRampart = target.pos.findClosestByPath(creep.room.structures, {
            filter: (r) => r.structureType === STRUCTURE_RAMPART &&
                !r.pos.checkForObstacleStructure() && (r.pos.lookFor(LOOK_CREEPS).length === 0 || (r.pos.x === creep.pos.x && r.pos.y === creep.pos.y)) &&
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
            creep.idleFor(5)
        }
    }
}
