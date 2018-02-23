/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    if (creep.hits < creep.hitsMax) creep.heal(creep);
    let hostiles = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (creep.pos.roomName !== creep.memory.destination) {
        creep.memory.destinationReached = undefined;
    }
    if (!creep.memory.destinationReached) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 20});
        if (creep.pos.roomName === creep.memory.destination) {
            creep.memory.destinationReached = true;
        }
    } else if (hostiles) {
        switch (creep.attack(hostiles)) {
            case ERR_NOT_IN_RANGE:
                creep.shibMove(hostiles, {movingTarget: true, ignoreCreeps: false});
                break;
            case ERR_NO_BODYPART:
                break;
            default:
        }
    } else {
        if (creep.hits < creep.hitsMax) creep.heal(creep);
        let lair = _.min(creep.room.find(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR}), 'ticksToSpawn');
        creep.shibMove(lair);
    }
}

module.exports.role = profiler.registerFN(role, 'SKAttackerRole');