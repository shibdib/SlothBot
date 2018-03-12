/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    let source;
    creep.borderCheck();
    let hostiles = creep.pos.findClosestByRange(creep.room.creeps, {filter: (c) => !_.includes(FRIENDLIES, c.owner['username'])});
    if (hostiles && creep.pos.getRangeTo(hostiles) <= 4) return creep.retreat();
    let lair = Game.getObjectById(creep.memory.lair);
    if (lair && creep.pos.getRangeTo(lair) <= 6 && lair.ticksToSpawn <= 10) return creep.flee(lair);
    if (creep.hits < creep.hitsMax) return creep.goHomeAndHeal();
    //Initial move
    if (creep.carry.energy === 0) creep.memory.harvesting = true;
    if (creep.pos.roomName !== creep.memory.destination) creep.memory.destinationReached = undefined;
    if (creep.pos.roomName !== creep.memory.destination) {
        return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 20});
    }
    creep.memory.destinationReached = true;
    creep.borderCheck();
    if (_.sum(creep.carry) === creep.carryCapacity || creep.memory.harvesting === false) {
        creep.memory.harvesting = false;
        SKdeposit(creep);
    } else {
        if (creep.memory.source) {
            source = Game.getObjectById(creep.memory.source);
            if (!source || source.pos.roomName !== creep.pos.roomName) return creep.memory.source = undefined;
            if (!creep.memory.lair) creep.memory.lair = source.pos.findClosestByRange(creep.room.structures, {filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR}).id;
            if (source.energy === 0) {
                if (lair && creep.pos.getRangeTo(lair) <= 6) return creep.flee(lair);
                creep.idleFor(source.ticksToRegeneration + 1)
            } else {
                switch (creep.harvest(source)) {
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(source);
                        break;
                    case ERR_NO_BODYPART:
                        creep.shibMove(source);
                        break;
                    case ERR_TIRED:
                        creep.idleFor(creep.pos.findClosestByRange(creep.room.structures, {filter: (s) => s.structureType === STRUCTURE_EXTRACTOR}).cooldown);
                        break;
                    case ERR_NOT_ENOUGH_RESOURCES:
                        break;
                }
            }
        } else {
            creep.findMineral();
        }
    }
}

module.exports.role = profiler.registerFN(role, 'SKMineral');

/**
 * @return {undefined}
 */
function SKdeposit(creep) {
    if (creep.pos.roomName === creep.memory.overlord) {
        if (creep.renewalCheck(8)) return;
        if (creep.memory.storageDestination) {
            let storageItem = Game.getObjectById(creep.memory.storageDestination);
            for (const resourceType in creep.carry) {
                switch (creep.transfer(storageItem, resourceType)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        let adjacentStructure = creep.pos.findInRange(FIND_STRUCTURES, 1);
                        let opportunity = _.filter(adjacentStructure, (s) => (s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN) && s.energy < s.energyCapacity);
                        if (opportunity.length > 0) creep.transfer(opportunity[0], RESOURCE_ENERGY);
                        creep.shibMove(storageItem);
                        break;
                    case ERR_FULL:
                        creep.memory.storageDestination = undefined;
                        creep.findStorage();
                        break;
                }
            }
        } else {
            let storage = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_STORAGE)[0];
            let terminal = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_TERMINAL)[0];
            if (terminal && _.sum(terminal.store) < terminal.storeCapacity * 0.70 && storage.store[RESOURCE_ENERGY] > ENERGY_AMOUNT * 2 && terminal.store[RESOURCE_ENERGY] <= 25000) {
                creep.memory.storageDestination = terminal.id;
                switch (creep.transfer(terminal, RESOURCE_ENERGY)) {
                    case OK:
                        creep.memory.storageDestination = undefined;
                        creep.memory.destinationReached = false;
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(terminal);
                        break;
                    case ERR_FULL:
                        creep.memory.storageDestination = undefined;
                        creep.findStorage();
                        break;
                }
            } else if (storage && _.sum(storage.store) < storage.storeCapacity * 0.70) {
                creep.memory.storageDestination = storage.id;
                switch (creep.transfer(storage, RESOURCE_ENERGY)) {
                    case OK:
                        creep.memory.storageDestination = undefined;
                        creep.memory.destinationReached = false;
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(storage);
                        break;
                    case ERR_FULL:
                        creep.memory.storageDestination = undefined;
                        creep.findStorage();
                        break;
                }
            }
        }
    } else {
        return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 19});
    }
}