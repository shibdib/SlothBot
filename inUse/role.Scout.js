/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
let cache = require('module.cache');
const profiler = require('screeps-profiler');

function role(creep) {
    cache.cacheRoomIntel(creep);
    if (creep.memory.destinationReached !== true) {
        let armedHostile = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(doNotAggress, e.owner['username']) === false});
        if (creep.pos.getRangeTo(armedHostile) < 2) {
            this.kite();
        }
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {
            range: 24,
            maxOps: 50000,
            ensurePath: true
        });
        if (creep.pos.roomName === creep.memory.destination) {
            cache.cacheRoomIntel(creep);
            creep.memory.destinationReached = true;
        }
    } else {
        creep.say("I.See.U", true);
        cache.cacheRoomIntel(creep);
    }
}

module.exports.role = profiler.registerFN(role, 'scoutRole');
