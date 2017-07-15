/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
let cache = require('module.cache');
const profiler = require('screeps-profiler');

function role(creep) {
    if (creep.memory.boostAttempt !== true) {
        let desiredReactions = [
            RESOURCE_GHODIUM_OXIDE,
            RESOURCE_KEANIUM_OXIDE
        ];
        let count = 1;
        for (let i = 0; i < desiredReactions.length; i++) {
            let lab = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_LAB && s.mineralType === desiredReactions[i] && s.mineralAmount >= 30 && s.energy >= 20});
            if (lab) {
                count++;
                switch (lab.boostCreep(creep)) {
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(lab);
                        break;
                    case ERR_NOT_FOUND:
                        count--;
                        break;
                }
            }
        }
        if (count === 1) {
            creep.memory.boostAttempt = true;
        }
        return null;
    }
    let targets = _.min(creep.pos.findInRange(FIND_CREEPS, 15, {filter: (c) => c.hits < c.hitsMax && _.includes(RawMemory.segments[2], c.owner['username']) === true}), 'hits');
    if (creep.hits < creep.hitsMax) {
        creep.heal(creep);
    } else if (targets) {
        creep.rangedHeal(targets);
    }
    let hostiles = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    let hostileHealer = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {filter: (c) => c.getActiveBodyparts(HEAL) > 2});
    if (!creep.memory.destinationReached) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 20});
        if (creep.pos.roomName === creep.memory.destination) {
            creep.memory.destinationReached = true;
        }
    } else if (hostileHealer) {
        creep.fightRanged(hostileHealer);
    } else if (hostiles) {
        creep.fightRanged(hostiles);
    } else {
        let lair = _.min(creep.room.find(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR}), 'ticksToSpawn');
        creep.shibMove(lair, {range: 3});
    }
}

module.exports.role = profiler.registerFN(role, 'SKRangedRole');