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
    if (creep.hits < creep.hitsMax) {
        creep.heal(creep);
    }
    let hostiles = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (!creep.memory.destinationReached) {
        creep.shibMove(Game.flags[creep.memory.destination], {range: 20});
        if (creep.pos.roomName === Game.flags[creep.memory.destination].pos.roomName) {
            creep.memory.destinationReached = true;
        }
    } else if (hostiles) {
        creep.fightRanged(hostiles);
    } else {
        let lair = _.min(creep.room.find(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR}), 'ticksToSpawn');
        creep.shibMove(lair, {range: 3});
    }
}

module.exports.role = profiler.registerFN(role, 'SKRangedRole');