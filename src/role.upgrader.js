/*
 * Copyright (c) 2019.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    //INITIAL CHECKS
    if (creep.tryToBoost(['upgrade']) || creep.wrongRoom()) return;
    // Handle yelling
    herald(creep);
    if (_.sum(creep.carry) >= creep.carryCapacity * 0.8) creep.memory.working = true;
    if (!creep.carry.energy) delete creep.memory.working;
    let container = Game.getObjectById(creep.room.memory.controllerContainer);
    let link = Game.getObjectById(creep.room.memory.controllerLink);
    if (creep.memory.working) {
        if (!creep.memory.onContainer) {
            if (container && !container.pos.checkForCreep() && creep.pos.getRangeTo(container) > 0) {
                return creep.shibMove(container, {range: 0});
            } else {
                creep.memory.onContainer = true;
            }
        }
        switch (creep.upgradeController(Game.rooms[creep.memory.overlord].controller)) {
            case OK:
                if (Math.random() > 0.99) creep.memory.onContainer = undefined;
                delete creep.memory._shibMove;
                if (link && link.energy) {
                    creep.withdrawResource(link);
                } else if (container && container.store[RESOURCE_ENERGY]) {
                    creep.withdrawResource(container);
                }
                return;
            case ERR_NOT_IN_RANGE:
                return creep.shibMove(Game.rooms[creep.memory.overlord].controller, {range: 3});
        }
    }
    if (creep.memory.energyDestination) {
        creep.withdrawResource();
    } else if (creep.getActiveBodyparts(WORK) > creep.getActiveBodyparts(MOVE)) {
        if (link && link.energy) {
            creep.withdrawResource(link);
        } else if (container && container.store[RESOURCE_ENERGY] >= creep.carryCapacity) {
            creep.withdrawResource(container);
        }
    } else if (container && container.store[RESOURCE_ENERGY] >= creep.carryCapacity) {
        creep.withdrawResource(container);
    } else if (!creep.findEnergy(25)) {
        let source = creep.pos.getClosestSource();
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) creep.shibMove(source)
    }
};

function herald(creep) {
    if (creep.memory.notHerald) return;
    if (creep.memory.herald) {
        let sentence = ['-', '#overlords', '-'];
        if (creep.room.memory.responseNeeded) {
            if (Memory.roomCache[creep.room.name].threatLevel === 1) sentence = sentence.concat(['FPCON', 'ALPHA']);
            if (Memory.roomCache[creep.room.name].threatLevel === 2) sentence = sentence.concat(['FPCON', 'BRAVO']);
            if (Memory.roomCache[creep.room.name].threatLevel === 3) sentence = sentence.concat(['FPCON', 'CHARLIE']);
            if (Memory.roomCache[creep.room.name].threatLevel >= 4) sentence = sentence.concat(['FPCON', 'DELTA']);
        } else {
            sentence = sentence.concat(['FPCON', 'NORMAL'])
        }
        if (Memory._badBoyArray && Memory._badBoyArray.length) {
            sentence = sentence.concat(['-', 'THREAT', 'LIST', '-']);
            sentence = sentence.concat(Memory._badBoyArray);
        }
        if (Memory._friendsArray && Memory._friendsArray.length > 1) {
            sentence = sentence.concat(['-', 'FRIENDS', 'LIST', '-']);
            sentence = sentence.concat(Memory._friendsArray);
        }
        let word = Game.time % sentence.length;
        creep.say(sentence[word], true);
        if (!creep.memory.signed) {
            let signs = OWNED_ROOM_SIGNS;
            let addition = '';
            if (Game.shard.name === 'vsrv2' && creep.room.controller.level >= 4) addition = ' @pvp@';
            switch (creep.signController(creep.room.controller, _.sample(signs) + addition)) {
                case OK:
                    creep.memory.signed = true;
                    break;
                case ERR_NOT_IN_RANGE:
                    return creep.shibMove(creep.room.controller, {range: 1});
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