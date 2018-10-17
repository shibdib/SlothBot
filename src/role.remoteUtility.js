/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    let source;
    creep.borderCheck();
    if (creep.room.invaderCheck() || creep.hits < creep.hitsMax) return creep.goHomeAndHeal();
    let lair = Game.getObjectById(creep.memory.lair);
    if (lair && creep.pos.rangeToTarget(lair) <= 5 && lair.ticksToSpawn <= 10) return creep.flee(lair);
    //Initial move
    if (creep.carry.energy === 0) creep.memory.harvesting = true;
    if (creep.pos.roomName !== creep.memory.destination) delete creep.memory.destinationReached;
    if (creep.pos.roomName !== creep.memory.destination && !creep.memory.hauling) {
        return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 20});
    }
    creep.memory.destinationReached = true;
    if (_.sum(creep.carry) === creep.carryCapacity || !creep.memory.harvesting) {
        delete creep.memory.harvesting;
        creep.memory.hauling = true;
        delete creep.memory.source;
        return utilityDeposit(creep);
    } else {
        delete creep.memory.hauling;
        if (creep.memory.source) {
            source = Game.getObjectById(creep.memory.source);
            if (!source || source.pos.roomName !== creep.pos.roomName) return delete creep.memory.source;
            switch (creep.harvest(source)) {
                case OK:
                    break;
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
        } else {
            creep.findSource(true);
        }
    }
}
module.exports.role = profiler.registerFN(role, 'SKMineral');

/**
 * @return {undefined}
 */
function utilityDeposit(creep) {
    if (creep.pos.roomName === creep.memory.overlord) {
        creep.memory.destinationReached = false;
        if (creep.memory.storageDestination) {
            let storageItem = Game.getObjectById(creep.memory.storageDestination);
            for (const resourceType in creep.carry) {
                switch (creep.transfer(storageItem, resourceType)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(storageItem);
                        if (creep.carry[RESOURCE_ENERGY] > 0) {
                            let adjacentStructure = shuffle(_.filter(creep.pos.findInRange(FIND_STRUCTURES, 1), (s) => (s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN) && s.energy < s.energyCapacity));
                            if (adjacentStructure.length) creep.transfer(adjacentStructure[0], RESOURCE_ENERGY);
                        }
                        break;
                    case ERR_FULL:
                        delete creep.memory.storageDestination;
                        break;
                }
            }
        } else {
            let labs = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.energy < s.energyCapacity * 0.75);
            let storage = creep.room.storage;
            let terminal = creep.room.terminal;
            let nuker = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_NUKER && s.energy < s.energyCapacity)[0];
            let controllerContainer = Game.getObjectById(creep.room.memory.controllerContainer);
            if (labs[0] && creep.carry[RESOURCE_ENERGY] === _.sum(creep.carry)) {
                creep.memory.storageDestination = labs[0].id;
            } else if (nuker && creep.carry[RESOURCE_ENERGY] === _.sum(creep.carry)) {
                creep.memory.storageDestination = nuker.id;
            } else if (controllerContainer && creep.carry[RESOURCE_ENERGY] === _.sum(creep.carry) && _.sum(controllerContainer.store) < controllerContainer.storeCapacity * 0.25) {
                creep.memory.storageDestination = controllerContainer.id;
            } else if (terminal && _.sum(terminal.store) < terminal.storeCapacity * 0.90 && (storage.store[RESOURCE_ENERGY] > ENERGY_AMOUNT * 2 ||
                terminal.store[RESOURCE_ENERGY] <= 5000 || _.sum(storage.store) >= storage.storeCapacity * 0.90)) {
                creep.memory.storageDestination = terminal.id;
            } else if (storage) {
                creep.memory.storageDestination = storage.id;
            } else {
                creep.findEssentials()
            }
        }
    } else {
        return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 19});
    }
}