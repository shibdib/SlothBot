/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    if (creep.memory.boostAttempt !== true) {
        let desiredReactions = [
            RESOURCE_GHODIUM_OXIDE,
            RESOURCE_KEANIUM_OXIDE
        ];
        let count = 1;
        for (let i = 0; i < desiredReactions.length; i++) {
            let lab = creep.pos.findClosestByRange(creep.room.structures, {filter: (s) => s.structureType === STRUCTURE_LAB && s.mineralType === desiredReactions[i] && s.mineralAmount >= 30 && s.energy >= 20});
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
    let SKAttacker = _.filter(Game.creeps, (c) => c.memory.role && c.memory.role === 'SKattacker' && c.memory.destination === creep.memory.destination);
    if (SKAttacker.length === 0) {
        if (creep.hits < creep.hitsMax) creep.heal(creep);
        if (!creep.memory.destinationReached) {
            creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 20});
            if (creep.pos.roomName === creep.memory.destination) creep.memory.destinationReached = true;
        } else if (!creep.handleMilitaryCreep()) {
            let lair = _.min(_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_KEEPER_LAIR), 'ticksToSpawn');
            creep.shibMove(lair, {range: 3});
        }
    } else {
        if (SKAttacker[0].hits < SKAttacker[0].hitsMax) {
            switch (creep.heal(SKAttacker[0])) {
                case OK:
                    creep.shibMove(SKAttacker[0], {range: 0});
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(SKAttacker[0]);
                    if (creep.hits < creep.hitsMax) creep.heal(creep);
                    break;
                case ERR_NO_BODYPART:
                    break;
                case ERR_INVALID_TARGET:
                    break;
            }
        } else {
            creep.shibMove(SKAttacker[0], {range: 0});
            if (creep.hits < creep.hitsMax) creep.heal(creep);
        }
        let hostiles = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        if (hostiles && creep.pos.rangeToTarget(hostiles) < 4) {
            creep.rangedAttack(hostiles);
        }
    }
}

module.exports.role = profiler.registerFN(role, 'SKRangedRole');