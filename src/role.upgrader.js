/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    // Boost only if room is energy rich
    if (creep.room.energyState && creep.tryToBoost(['upgrade'])) return;
    //INITIAL CHECKS
    if (creep.wrongRoom()) return;
    // Handle yelling
    herald(creep);
    // Set and check container and link
    let container = Game.getObjectById(creep.room.memory.controllerContainer);
    if (!container) creep.room.memory.controllerContainer = undefined;
    let link = Game.getObjectById(creep.room.memory.controllerLink);
    if (!link) creep.room.memory.controllerLink = undefined;
    if (creep.memory.other.inPosition) {
        if (link && link.energy) {
            if (creep.withdraw(link, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.memory.other.inPosition = undefined;
        } else if (container && container.store[RESOURCE_ENERGY]) {
            if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.memory.other.inPosition = undefined;
        }
        if (Math.random() > 0.99) creep.memory.onContainer = undefined;
        if (!creep.memory.onContainer) {
            if (container && (!container.pos.checkForCreep() || container.pos.checkForCreep().memory.role !== 'upgrader') && creep.pos.getRangeTo(container)) {
                if (!container.pos.checkForRampart() && !container.pos.checkForConstructionSites()) container.pos.createConstructionSite(STRUCTURE_RAMPART);
                return creep.shibMove(container, {range: 0});
            } else if (!creep.pos.getRangeTo(container)) {
                creep.memory.onContainer = true;
            } else if (container) {
                if (container.pos.isNearTo(creep)) creep.memory.onContainer = true;
                return creep.shibMove(container, {range: 1});
            }
        }
        creep.upgradeController(Game.rooms[creep.memory.overlord].controller)
    } else {
        if (creep.isFull) creep.memory.working = true;
        if (!creep.store[RESOURCE_ENERGY]) delete creep.memory.working;
        creep.memory.other.inPosition = creep.memory.other.stationary && (!link || creep.pos.isNearTo(link)) && (!container || creep.pos.isNearTo(container)) && creep.pos.getRangeTo(creep.room.controller) <= 3;
        if (creep.memory.working) {
            switch (creep.upgradeController(Game.rooms[creep.memory.overlord].controller)) {
                case OK:
                    if (container && container.store[RESOURCE_ENERGY]) {
                        creep.withdrawResource(container);
                    } else if (link && link.energy) {
                        creep.withdrawResource(link);
                    }
                    return;
                case ERR_NOT_IN_RANGE:
                    if (container && container.store[RESOURCE_ENERGY]) {
                        creep.withdrawResource(container);
                    } else if (link && link.energy) {
                        creep.withdrawResource(link);
                    } else {
                        return creep.shibMove(Game.rooms[creep.memory.overlord].controller, {range: 3});
                    }
            }
        }
        if (creep.memory.energyDestination) {
            creep.withdrawResource();
        } else if (creep.memory.other.stationary || (creep.getActiveBodyparts(WORK) > creep.getActiveBodyparts(MOVE))) {
            creep.memory.other.stationary = true;
            if (container && !creep.memory.onContainer) {
                if ((!container.pos.checkForCreep() || container.pos.checkForCreep().memory.role !== 'upgrader') && creep.pos.getRangeTo(container)) {
                    if (!container.pos.getRangeTo(creep)) creep.memory.onContainer = true;
                    return creep.shibMove(container, {range: 0});
                } else {
                    if (container.pos.isNearTo(creep)) creep.memory.onContainer = true;
                    return creep.shibMove(container, {range: 1});
                }
            } else if (creep.memory.onContainer) {
                if (link && link.energy) {
                    creep.withdrawResource(link);
                } else if (container && container.store[RESOURCE_ENERGY]) {
                    creep.withdrawResource(container);
                }
            }
        } else if (container && container.store[RESOURCE_ENERGY]) {
            creep.withdrawResource(container);
        } else if (!creep.locateEnergy(25)) {
            creep.idleFor(15);
        }
    }
};

function herald(creep) {
    if (creep.memory.notHerald) return;
    if (creep.memory.herald) {
        let sentence = ['-'];
        if (creep.room.memory.lowPower) {
            sentence = sentence.concat(['This', 'Room', 'Is', 'In', 'Low', 'Power', 'Mode', 'For', ((creep.room.memory.lowPower + 10000) - Game.time), 'Ticks']);
        } else {
            if (Memory.LOANalliance) sentence = sentence.concat([Memory.LOANalliance, '-']);
            if (Memory.roomCache[creep.room.name].threatLevel) {
                if (Memory.roomCache[creep.room.name].threatLevel === 1) sentence = sentence.concat(['FPCON', 'ALPHA']);
                if (Memory.roomCache[creep.room.name].threatLevel === 2) sentence = sentence.concat(['FPCON', 'BRAVO']);
                if (Memory.roomCache[creep.room.name].threatLevel === 3) sentence = sentence.concat(['FPCON', 'CHARLIE']);
                if (Memory.roomCache[creep.room.name].threatLevel >= 4) sentence = sentence.concat(['FPCON', 'DELTA']);
            } else if (Memory.roomCache[creep.room.name] && Memory.roomCache[creep.room.name].lastPlayerSighting) {
                sentence = sentence.concat(['LAST', 'ATTACK', Game.time - Memory.roomCache[creep.room.name].lastPlayerSighting, 'TICKS', 'AGO']);
            } else {
                sentence = sentence.concat(['FPCON', 'NORMAL']);
            }
            if (Memory._badBoyArray && Memory._badBoyArray.length) {
                sentence = sentence.concat(['-', 'THREAT', 'LIST', '-']);
                sentence = sentence.concat(Memory._badBoyArray);
            }
            if (Memory._friendArray && Memory._friendArray.length > 1) {
                sentence = sentence.concat(['-', 'FRIENDS', 'LIST', '-']);
                sentence = sentence.concat(FRIENDLIES);
            }
            if (Memory.ncpArray && Memory.ncpArray.length > 1) {
                sentence = sentence.concat(['-', 'KNOWN', 'NCP', 'LIST', '-']);
                sentence = sentence.concat(Memory.ncpArray);
            }
        }
        let word = Game.time % sentence.length;
        creep.say(sentence[word], true);
        if (!creep.memory.signed) {
            let signs = OWNED_ROOM_SIGNS;
            let addition = '';
            if (Game.shard.name === 'treecafe' && creep.room.controller.level >= 4) addition = ' @pvp@';
            switch (creep.signController(creep.room.controller, _.sample(signs) + addition)) {
                case OK:
                    creep.memory.signed = true;
                    break;
            }
        }
    } else {
        let activeHerald = _.filter(creep.room.creeps, (c) => c.my && c.memory.herald);
        if (!activeHerald.length) {
            creep.memory.herald = true;
        } else {
            creep.memory.notHerald = true;
        }
    }
}