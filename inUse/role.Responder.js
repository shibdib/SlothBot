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
    if (creep.hits < creep.hitsMax / 2) {
        creep.heal(creep);
    }

    if (Game.rooms[creep.memory.responseTarget] && creep.pos.roomName === Game.rooms[creep.memory.responseTarget].name) {
        creep.memory.destinationReached = true;
    }

    let friendlies = creep.pos.findInRange(FIND_CREEPS, 15, {filter: (c) => c.hits < c.hitsMax && _.includes(RawMemory.segments[2], c.owner['username']) === true});
    let creepsInRoom = creep.room.find(FIND_CREEPS);
    let hostiles = _.filter(creepsInRoom, (c) => c.pos.y < 49 && c.pos.x > 0 && c.pos.x < 49 && c.pos.y > 0 && _.includes(RawMemory.segments[2], c.owner['username']) === false);
    let armedHostile = _.filter(hostiles, (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(RawMemory.segments[2], e.owner['username']) === false);
    let inRangeCreeps = creep.pos.findInRange(creepsInRoom, 1);
    let inRangeHostile = _.filter(inRangeCreeps, (c) => c.pos.y < 49 && c.pos.x > 0 && c.pos.x < 49 && c.pos.y > 0 && _.includes(RawMemory.segments[2], c.owner['username']) === false);
    let closestArmed = creep.pos.findClosestByPath(armedHostile);
    let closestHostile = creep.pos.findClosestByPath(hostiles);
    let closestStructure = creep.pos.findClosestByPath(FIND_STRUCTURES, {filter: (s) => s.owner && !_.includes(RawMemory.segments[2], s.owner['username']) && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_CONTROLLER});
    if (creep.pos.roomName !== creep.memory.responseTarget) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.responseTarget), {range: 15}); //to move to any room
    } else if (closestArmed) {
        if (!creep.fightRampart(closestArmed)) {
            creep.memory.inCombat = true;
            creep.borderCheck();
            creep.memory.meleeTarget = closestArmed.id;
            if (creep.pos.getRangeTo(closestArmed) <= 3) creep.rangedAttack(closestArmed);
            if (creep.attack(closestArmed) === ERR_NOT_IN_RANGE) {
                if (creep.hits < creep.hitsMax) creep.heal(creep);
                creep.shibMove(closestArmed, {forceRepath: true, ignoreCreeps: false});
            }
        }
    } else if (closestStructure) {
        creep.memory.inCombat = undefined;
        if (creep.attack(closestStructure) === ERR_NOT_IN_RANGE) {
            creep.shibMove(closestStructure);
        }
    } else if (closestHostile) {
        if (!creep.fightRampart(closestHostile)) {
            creep.memory.inCombat = true;
            creep.borderCheck();
            creep.memory.meleeTarget = closestHostile.id;
            if (creep.pos.getRangeTo(closestHostile) <= 3) creep.rangedAttack(closestHostile);
            if (creep.attack(closestHostile) === ERR_NOT_IN_RANGE) {
                if (creep.hits < creep.hitsMax) creep.heal(creep);
                creep.shibMove(closestHostile, {forceRepath: true, ignoreCreeps: false});
            }
        }
    } else if (creep.hits < creep.hitsMax) {
        creep.heal(creep);
    } else if (friendlies.length > 0 && creep.room.memory.responseNeeded !== true && creep.memory.destinationReached === true) {
        if (creep.heal(friendlies[0]) === ERR_NOT_IN_RANGE) {
            if (creep.heal(friendlies[0]) === ERR_NOT_IN_RANGE) {
                creep.shibMove(friendlies[0]);
            }
        }
    } else if (creep.memory.destinationReached !== true && Game.rooms[creep.memory.responseTarget]) {
        if (creep.pos.roomName === Game.rooms[creep.memory.responseTarget].name) {
            creep.memory.destinationReached = true;
        }
        creep.shibMove(new RoomPosition(25, 25, creep.memory.responseTarget), {range: 15}); //to move to any room
    } else if (creep.pos.roomName !== creep.memory.responseTarget) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.responseTarget), {range: 15}); //to move to any room
    } else if (Game.getObjectById(creep.memory.assignedRampart) && Game.getObjectById(creep.memory.assignedRampart).pos.roomName === creep.memory.responseTarget) {
        if (Game.getObjectById(creep.memory.assignedRampart).pos.x !== creep.pos.x || Game.getObjectById(creep.memory.assignedRampart).pos.y !== creep.pos.y) {
            creep.shibMove(Game.getObjectById(creep.memory.assignedRampart), {range: 0});
        }
    } else if (!creep.memory.assignedRampart || !Game.getObjectById(creep.memory.assignedRampart)) {
        findDefensivePosition(creep, creep);
    }
}

module.exports.role = profiler.registerFN(role, 'responderRole');

function findDefensivePosition(creep, target) {
    if (target) {
        let bestRampart = target.pos.findClosestByPath(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
        let armedHostile = creep.pos.findClosestByRange(FIND_CREEPS, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1 || e.getActiveBodyparts(WORK) >= 1) && _.includes(RawMemory.segments[2], e.owner['username']) === false});
        if (bestRampart && bestRampart.pos !== creep.pos) {
            creep.memory.pathAge = 999;
            bestRampart = target.pos.findClosestByPath(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_RAMPART && ((r.pos.lookFor(LOOK_CREEPS).length === 0 && r.pos.lookFor(protectedStructures).length === 0) || (r.pos.x === creep.pos.x && r.pos.y === creep.pos.y))});
            creep.memory.assignedRampart = bestRampart.id;
            if (bestRampart.pos !== creep.pos && (creep.pos.getRangeTo(bestRampart) < creep.pos.getRangeTo(armedHostile) || !armedHostile)) {
                creep.shibMove(bestRampart);
            }
        }
    }
}
