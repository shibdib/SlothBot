/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    creep.cacheRoomIntel();
    let reservers = creep.pos.findClosestByRange(FIND_MY_CREEPS, {filter: (c) => c.memory.role === 'reserver' && c.name !== creep.name});
    if (creep.memory.invaderDetected === true) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.assignedRoom));
        creep.memory.visitedRooms.push(creep.memory.currentDestination);
        creep.memory.currentDestination = undefined;
    }
    if (!creep.memory.targetRooms) {
        creep.memory.targetRooms = Game.rooms[creep.memory.assignedRoom].memory.remoteRooms
    }
    if (creep.memory.reserving) {
        if ((creep.room.controller.reservation && creep.room.controller.reservation['ticksToEnd'] >= 1500) || creep.room.controller.owner) {
            creep.memory.reserving = undefined;
        } else if (creep.reserveController(creep.room.controller) === ERR_NOT_IN_RANGE || creep.signController(creep.room.controller, "Reserved Territory of Overlords - #overlords on Slack") === ERR_NOT_IN_RANGE) {
            creep.shibMove(creep.room.controller);
        }
    } else if (!creep.memory.currentDestination) {
        for (let key in creep.memory.targetRooms) {
            creep.memory.currentDestination = creep.memory.targetRooms[key];
        }
        creep.memory.visitedRooms = [];
    } else if (creep.pos.roomName !== creep.memory.currentDestination) {
        creep.shibMove((new RoomPosition(25, 25, creep.memory.currentDestination))); //to move to any room
    } else {
        if (creep.room.controller && !creep.room.controller.owner && (!creep.room.controller.reservation || (creep.room.controller.reservation['username'] === 'Shibdib' && creep.room.controller.reservation['ticksToEnd'] < 750)) && !reservers) {
            creep.shibMove(creep.room.controller);
            creep.memory.reserving = true;
        } else {
            creep.memory.visitedRooms.push(creep.memory.currentDestination);
            creep.memory.currentDestination = undefined;
            for (let key in creep.memory.targetRooms) {
                if (_.includes(creep.memory.visitedRooms, creep.memory.targetRooms[key]) === false) {
                    creep.memory.currentDestination = creep.memory.targetRooms[key];
                }
            }
        }
    }
}

module.exports.role = profiler.registerFN(role, 'reserverRole');

function invaderCheck(creep) {
    let invader = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {filter: (c) => (c.getActiveBodyparts(ATTACK) >= 1 || c.getActiveBodyparts(RANGED_ATTACK) >= 1 || c.getActiveBodyparts(WORK) >= 1) && _.includes(RawMemory.segments[2], c.owner['username']) === false});
    if (invader) {
        let number = creep.room.find(FIND_HOSTILE_CREEPS, {filter: (c) => _.includes(RawMemory.segments[2], c.owner['username']) === false});
        creep.room.memory.responseNeeded = true;
        creep.room.memory.tickDetected = Game.time;
        if (!creep.room.memory.numberOfHostiles || creep.room.memory.numberOfHostiles < number.length) {
            creep.room.memory.numberOfHostiles = number.length;
        }
        creep.memory.invaderDetected = true;
    } else if (creep.room.memory.tickDetected < Game.time - 150) {
        creep.memory.invaderDetected = undefined;
        creep.memory.invaderID = undefined;
        creep.room.memory.numberOfHostiles = undefined;
        creep.room.memory.responseNeeded = false;
    }
}