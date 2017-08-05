/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    creep.borderCheck();
    //Invader detection
    creep.invaderCheck();
    let hostiles = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (hostiles && creep.pos.getRangeTo(hostiles) <= 5) {
        return creep.retreat();
    }

    if (creep.memory.destinationReached && creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_SPAWN})) {
        creep.memory.role = 'worker';
        creep.memory.assignedRoom = creep.room.name;
        creep.memory.assignedSpawn = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_SPAWN}).id;
        return;
    }
    if ((Game.flags[creep.memory.destination] && creep.pos.roomName !== Game.flags[creep.memory.destination].pos.roomName) || (Game.rooms[creep.memory.destination] && creep.pos.roomName !== creep.memory.destination)) {
        creep.memory.destinationReached = undefined;
    }

    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.hauling = true;
    }
    if (creep.memory.destinationReached && creep.memory.hauling === false) {
        let container = creep.room.find(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 100});
        if (container.length > 0) {
            if (creep.withdraw(container[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.shibMove(container[0]);
            }
        } else {
            let source = creep.pos.findClosestByRange(FIND_SOURCES);
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) creep.shibMove(source)
        }
    } else if (!creep.memory.destinationReached) {
        if (!Game.flags[creep.memory.destination] && !Game.rooms[creep.memory.destination]) {
            creep.suicide();
        }
        if (Game.flags[creep.memory.destination]) creep.shibMove(Game.flags[creep.memory.destination]);
        if (Game.rooms[creep.memory.destination]) creep.shibMove(new RoomPosition(25, 25, creep.memory.destination));
        if ((Game.flags[creep.memory.destination] && creep.pos.roomName === Game.flags[creep.memory.destination].pos.roomName) || (Game.rooms[creep.memory.destination] && creep.pos.roomName === creep.memory.destination)) {
            creep.memory.destinationReached = true;
        }
    } else if (creep.memory.destinationReached && creep.memory.hauling === true) {
        if (creep.room.controller && creep.room.controller.owner && creep.room.controller.owner.username === 'Shibdib' && creep.room.controller.ticksToDowngrade < 3000) {
            if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                creep.shibMove(creep.room.controller);
            }
        } else {
            creep.findConstruction();
            if (creep.memory.task === 'build') {
                let construction = Game.getObjectById(creep.memory.constructionSite);
                if (creep.build(construction) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(construction, {range: 3});
                }
            } else {
                creep.findRepair('1');
                if (creep.memory.task === 'repair' && creep.memory.constructionSite) {
                    let repairNeeded = Game.getObjectById(creep.memory.constructionSite);
                    if (creep.repair(repairNeeded) === ERR_NOT_IN_RANGE) {
                        creep.shibMove(repairNeeded, {range: 3});
                    }
                } else if (Game.room && Game.room.controller && creep.upgradeController(Game.room.controller) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(Game.room.controller);
                } else {
                    creep.idleFor(10);
                }
            }
        }
    }
}

module.exports.role = profiler.registerFN(role, 'pioneerRole');