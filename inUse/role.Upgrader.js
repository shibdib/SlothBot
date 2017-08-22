/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

/**
 * @return {null}
 */
function role(creep) {
    if (creep.renewalCheck(6)) return creep.shibMove(creep.pos.findClosestByRange(FIND_MY_SPAWNS));
    if (creep.getActiveBodyparts(WORK) > 0 && creep.pos.checkForRoad()[0] && creep.pos.checkForRoad()[0].hits < creep.pos.checkForRoad()[0].hitsMax * 0.50) creep.repair(creep.pos.checkForRoad()[0]);
    if (creep.memory.boostAttempt !== true) {
        let desiredReactions = [RESOURCE_CATALYZED_GHODIUM_ACID];
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
                    case OK:
                        creep.memory.boosted = true;
                }
            }
        }
        if (count === 1) {
            creep.memory.boostAttempt = true;
        }
        return null;
    }
    if (_.filter(Game.creeps, (c) => (c.memory.role === 'basicHarvester' || c.memory.role === 'stationaryHarvester') && c.memory.assignedRoom === creep.memory.assignedRoom).length === 0) creep.memory.role = 'stationaryHarvester';
    //ANNOUNCE
    let sentence = ['Spawn', 'More', 'Overlords', '#Overlords'];
    let word = Game.time % sentence.length;
    creep.say(sentence[word], true);
    //INITIAL CHECKS
    if (creep.borderCheck()) return null;
    if (creep.wrongRoom()) return null;
    if (creep.carry.energy === 0) {
        creep.memory.working = null;
    } else if (creep.carry.energy >= creep.carryCapacity * 0.75) {
        creep.memory.working = true;
    }
    if (creep.memory.working === true) {
        if (creep.upgradeController(Game.rooms[creep.memory.assignedRoom].controller) === ERR_NOT_IN_RANGE) {
            creep.shibMove(Game.rooms[creep.memory.assignedRoom].controller, {range: 3});
        }
        if (creep.memory.terminal && creep.pos.getRangeTo(Game.getObjectById(creep.memory.terminal)) <= 1 && Game.getObjectById(creep.memory.terminal).store[RESOURCE_ENERGY] > 0) creep.withdraw(Game.getObjectById(creep.memory.terminal), RESOURCE_ENERGY);
        if (creep.memory.controllerLink && creep.pos.getRangeTo(Game.getObjectById(creep.memory.controllerLink)) <= 1 && Game.getObjectById(creep.memory.controllerLink).energy > 0) creep.withdraw(Game.getObjectById(creep.memory.controllerLink), RESOURCE_ENERGY);
    } else {
        let link = Game.getObjectById(creep.room.memory.controllerLink);
        if (creep.memory.energyDestination) {
            creep.withdrawEnergy();
        } else if (link && link.energy > 0) {
            if (creep.withdraw(link, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.shibMove(link);
            }
        } else {
            if (!creep.memory.terminal) {
                let terminal = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TERMINAL && s.store[RESOURCE_ENERGY] > 0});
                if (terminal) creep.memory.terminal = terminal.id;
            }
            let terminal = Game.getObjectById(creep.memory.terminal);
            if (terminal && creep.pos.getRangeTo(terminal) < 5 && terminal.store[RESOURCE_ENERGY] > ENERGY_AMOUNT * 0.5) {
                if (creep.withdraw(terminal, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(terminal);
                }
            } else {
                creep.findEnergy();
            }
            if (!creep.memory.energyDestination && creep.room.controller.level <= 2) {
                let source = creep.pos.findClosestByRange(FIND_SOURCES);
                if (creep.harvest(source) === ERR_NOT_IN_RANGE) creep.shibMove(source)
            }
        }
    }
}
module.exports.role = profiler.registerFN(role, 'upgraderWorkers');