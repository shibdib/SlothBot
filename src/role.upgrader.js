/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    // Boost only if room is energy rich
    if (creep.tryToBoost(['upgrade'])) return;
    // Handle yelling
    herald(creep);
    // Set and check container and link
    let container = Game.getObjectById(creep.room.memory.controllerContainer);
    if (!container) creep.room.memory.controllerContainer = undefined;
    let link = Game.getObjectById(creep.room.memory.controllerLink);
    if (!link) creep.room.memory.controllerLink = undefined;
    // Handle stationary upgraders
    if (creep.memory.other.stationary || (_.filter(creep.body, (p) => p.type !== MOVE && p.type !== CARRY).length > _.filter(creep.body, (p) => p.type === MOVE).length)) {
        creep.memory.other.stationary = true;
        // Handle getting in place
        if (!creep.memory.inPosition && container) {
            if (container.pos.checkForCreep() && creep.pos.isNearTo(container) && (!link || creep.pos.isNearTo(link))) creep.memory.inPosition = true;
            else return creep.shibMove(container, {range: 0});
        }
        switch (creep.upgradeController(Game.rooms[creep.memory.overlord].controller)) {
            case OK:
                // Handle resource withdraw
                if (link && link.store[RESOURCE_ENERGY]) {
                    creep.withdrawResource(link);
                } else if (container && container.store[RESOURCE_ENERGY]) {
                    creep.withdrawResource(container);
                } else if (creep.room.memory.secondaryControllerContainer) {
                    if (Game.getObjectById(creep.room.memory.secondaryControllerContainer).store[RESOURCE_ENERGY]) {
                        creep.withdrawResource(Game.getObjectById(creep.room.memory.secondaryControllerContainer));
                    }
                }
                return;
            case ERR_NOT_IN_RANGE:
                return creep.shibMove(Game.rooms[creep.memory.overlord].controller, {range: 3});
            case ERR_NOT_ENOUGH_RESOURCES:
                // Handle resource withdraw
                if (link && link.store[RESOURCE_ENERGY]) {
                    creep.withdrawResource(link);
                } else if (container && container.store[RESOURCE_ENERGY]) {
                    creep.withdrawResource(container);
                } else if (creep.room.memory.secondaryControllerContainer) {
                    if (Game.getObjectById(creep.room.memory.secondaryControllerContainer).store[RESOURCE_ENERGY]) {
                        creep.withdrawResource(Game.getObjectById(creep.room.memory.secondaryControllerContainer));
                    }
                }
        }
    } else {
        if (creep.isFull) creep.memory.working = true;
        if (!creep.store[RESOURCE_ENERGY]) delete creep.memory.working;
        if (creep.memory.working) {
            switch (creep.upgradeController(Game.rooms[creep.memory.overlord].controller)) {
                case OK:
                    creep.memory.other.noBump = true;
                    return;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(Game.rooms[creep.memory.overlord].controller, {range: 3});
                    return;
                case ERR_NOT_ENOUGH_RESOURCES:
                    // Handle resource withdraw
                    if (link && link.store[RESOURCE_ENERGY]) {
                        creep.withdrawResource(link);
                    } else if (container && container.store[RESOURCE_ENERGY]) {
                        creep.withdrawResource(container);
                    }
            }
        } else if (creep.memory.energyDestination) {
            creep.memory.other.noBump = undefined;
            creep.withdrawResource();
        } else if (container && container.store[RESOURCE_ENERGY]) {
            creep.withdrawResource(container);
        } else if (!creep.locateEnergy()) {
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
            if (INTEL[creep.room.name].threatLevel) {
                if (INTEL[creep.room.name].threatLevel === 1) sentence = sentence.concat(['FPCON', 'ALPHA']);
                if (INTEL[creep.room.name].threatLevel === 2) sentence = sentence.concat(['FPCON', 'BRAVO']);
                if (INTEL[creep.room.name].threatLevel === 3) sentence = sentence.concat(['FPCON', 'CHARLIE']);
                if (INTEL[creep.room.name].threatLevel >= 4) sentence = sentence.concat(['FPCON', 'DELTA']);
            } else if (INTEL[creep.room.name] && INTEL[creep.room.name].lastPlayerSighting) {
                sentence = sentence.concat(['LAST', 'ATTACK', Game.time - INTEL[creep.room.name].lastPlayerSighting, 'TICKS', 'AGO']);
            } else {
                sentence = sentence.concat(['FPCON', 'NORMAL']);
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
            if (Game.shard.name === 'treecafe' && creep.room.energyState) addition = ' @pvp@';
            switch (creep.signController(creep.room.controller, _.sample(signs) + addition)) {
                case OK:
                    creep.memory.signed = true;
                    break;
            }
        }
    } else {
        let activeHerald = _.filter(creep.room.myCreeps, (c) => c.memory.herald);
        if (!activeHerald.length) {
            creep.memory.herald = true;
        } else {
            creep.memory.notHerald = true;
        }
    }
}