/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    if (!creep.getSafe()) {
        if (_.filter(creep.room.constructionSites, (s) => s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_TOWER).length > 0) return creep.memory.role = 'worker';
        if (creep.memory.boostAttempt !== true) return creep.tryToBoost(['upgrade']);
        if (_.filter(Game.creeps, (c) => (c.memory.role === 'stationaryHarvester') && c.memory.overlord === creep.memory.overlord).length === 0) creep.memory.role = 'stationaryHarvester';
        //ANNOUNCE
        if (_.filter(Game.creeps, (c) => (c.memory.announcer === true) && c.memory.overlord === creep.memory.overlord).length === 0) creep.memory.announcer = true;
        if (creep.memory.announcer) {
            let sentence = ['-', '#overlords', '-'];
            if (creep.room.memory.responseNeeded) {
                if (creep.room.memory.threatLevel === 1) sentence = sentence.concat(['FPCON', 'BRAVO']);
                if (creep.room.memory.threatLevel === 2) sentence = sentence.concat(['FPCON', 'CHARLIE']);
                if (creep.room.memory.threatLevel >= 3) sentence = sentence.concat(['FPCON', 'DELTA']);
            } else {
                sentence = sentence.concat(['FPCON', 'ALPHA'])
            }
            if (Memory._badBoyArray && Memory._badBoyArray.length) {
                sentence = sentence.concat(['-', 'THREAT', 'LIST', '-']);
                sentence = sentence.concat(Memory._badBoyArray);
            }
            let word = Game.time % sentence.length;
            creep.say(sentence[word], true);
        }
        //INITIAL CHECKS
        if (creep.borderCheck()) return null;
        if (creep.wrongRoom()) return null;
        let link = Game.getObjectById(creep.room.memory.controllerLink);
        let container = Game.getObjectById(creep.room.memory.controllerContainer);
        let terminal = creep.room.terminal;
        if (creep.carry.energy === 0) {
            creep.memory.working = null;
        } else if (creep.isFull) creep.memory.working = true;
        if (creep.memory.working === true) {
            if (creep.upgradeController(Game.rooms[creep.memory.overlord].controller) === ERR_NOT_IN_RANGE) creep.shibMove(Game.rooms[creep.memory.overlord].controller, {range: 3});
            if (container && creep.pos.getRangeTo(container) <= 1 && container.store[RESOURCE_ENERGY] > 0) creep.withdraw(container, RESOURCE_ENERGY);
            if (terminal && creep.pos.getRangeTo(terminal) <= 1 && terminal.store[RESOURCE_ENERGY] > 0) creep.withdraw(terminal, RESOURCE_ENERGY);
            if (link && creep.pos.getRangeTo(link) <= 1 && link.energy > 0) creep.withdraw(link, RESOURCE_ENERGY);
        } else {
            if (creep.memory.energyDestination) {
                creep.withdrawEnergy();
            } else if (container && container.store[RESOURCE_ENERGY] > 0) {
                switch (creep.withdraw(container, RESOURCE_ENERGY)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(container);
                }
            } else if (link && link.energy > 0) {
                switch (creep.withdraw(link, RESOURCE_ENERGY)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(link);
                }
            } else {
                if (!container) {
                    let container = creep.pos.findClosestByRange(creep.room.structures, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.pos.getRangeTo(s.room.controller) <= 1});
                    if (container) creep.room.memory.controllerContainer = container.id;
                }
                if (terminal && creep.pos.getRangeTo(terminal) < 5 && terminal.store[RESOURCE_ENERGY] > 2000) {
                    if (creep.withdraw(terminal, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        creep.shibMove(terminal);
                    }
                } else if (!creep.memory.energyDestination && creep.room.controller.level <= 4) {
                    if (!creep.findEnergy(6)) {
                        let source = creep.pos.getClosestSource();
                        if (creep.harvest(source) === ERR_NOT_IN_RANGE) creep.shibMove(source)
                    }
                } else {
                    if (creep.pos.getRangeTo(Game.rooms[creep.memory.overlord].controller) > 5) return creep.shibMove(Game.rooms[creep.memory.overlord].controller, {range: 4});
                    creep.idleFor(5);
                }
            }
        }
    }
}
module.exports.role = profiler.registerFN(role, 'upgraderWorkers');