/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    creep.say(ICONS.haul, true);
    if (creep.room.invaderCheck() || creep.hits < creep.hitsMax) return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {
        range: 18,
        offRoad: true
    });
    if (creep.borderCheck()) return null;
    creep.repairRoad();
    // Set harvester pairing
    if (!creep.memory.harvester || !Game.getObjectById(creep.memory.harvester)) {
        let remoteHarvester = _.filter(Game.creeps, (c) => c.memory.overlord === creep.memory.overlord && c.memory.role === 'remoteHarvester' && !c.memory.hauler)[0];
        if (!remoteHarvester) return creep.idleFor(10);
        creep.memory.harvester = remoteHarvester.id;
        remoteHarvester.memory.hauler = creep.id;
        return;
    }
    // Check if empty
    if (_.sum(creep.carry) === 0) {
        creep.memory.storageDestination = undefined;
        creep.memory.hauling = undefined;
    }
    if (creep.memory.hauling) {
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
                            break;
                        case ERR_FULL:
                            creep.memory.storageDestination = undefined;
                            break;
                    }
                }
            } else {
                let labs = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.energy < s.energyCapacity * 0.75);
                let storage = creep.room.storage;
                let terminal = creep.room.terminal;
                let link = Game.getObjectById(creep.room.memory.controllerLink);
                let nuker = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_NUKER && s.energy < s.energyCapacity)[0];
                let controllerContainer = Game.getObjectById(creep.room.memory.controllerContainer);
                if (labs[0] && creep.carry[RESOURCE_ENERGY] === _.sum(creep.carry)) {
                    creep.memory.storageDestination = labs[0].id;
                } else if (nuker && creep.carry[RESOURCE_ENERGY] === _.sum(creep.carry)) {
                    creep.memory.storageDestination = nuker.id;
                } else if (terminal && _.sum(terminal.store) < terminal.storeCapacity * 0.99 && (!storage || (storage.store[RESOURCE_ENERGY] > ENERGY_AMOUNT * 2 ||
                    terminal.store[RESOURCE_ENERGY] <= 10000 || _.sum(storage.store) >= storage.storeCapacity * 0.90))) {
                    creep.memory.storageDestination = terminal.id;
                } else if (storage && (storage.store[RESOURCE_ENERGY] < ENERGY_AMOUNT * 1.5 || !storage.store[RESOURCE_ENERGY]) && Math.random() > 0.5) {
                    creep.memory.storageDestination = storage.id;
                } else if (!link && controllerContainer && creep.carry[RESOURCE_ENERGY] === _.sum(creep.carry) && _.sum(controllerContainer.store) < controllerContainer.storeCapacity * 0.75) {
                    creep.memory.storageDestination = controllerContainer.id;
                } else if (link && link.energy < link.energyCapacity * 0.2 && controllerContainer && creep.carry[RESOURCE_ENERGY] === _.sum(creep.carry) && _.sum(controllerContainer.store) < controllerContainer.storeCapacity * 0.25) {
                    creep.memory.storageDestination = controllerContainer.id;
                } else if (storage) {
                    creep.memory.storageDestination = storage.id;
                } else if (controllerContainer && _.sum(controllerContainer.store) < controllerContainer.storeCapacity * 0.75) {
                    creep.memory.storageDestination = controllerContainer.id;
                } else if (!creep.findEssentials()) {
                    let spawn = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_SPAWN)[0];
                    creep.shibMove(spawn, {range: 3})
                }
            }
        } else {
            creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 23});
        }
    } else {
        // Check if ready to haul
        if (creep.isFull) {
            creep.memory.hauling = true;
            return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 23});
        }
        // Set Harvester and move to them if not nearby
        let pairedHarvester = Game.getObjectById(creep.memory.harvester);
        // Handle Moving
        if (creep.room.name !== pairedHarvester.room.name) {
            return creep.shibMove(new RoomPosition(25, 25, pairedHarvester.room.name), {range: 23, offRoad: true});
        } else if (creep.pos.getRangeTo(pairedHarvester) > 3) {
            return creep.shibMove(pairedHarvester, {range: 2, offRoad: true});
        } else {
            let container = Game.getObjectById(pairedHarvester.memory.containerID) || undefined;
            if (container && _.sum(container.store) > creep.carryCapacity * 0.7) {
                for (const resourceType in container.store) {
                    if (creep.withdraw(container, resourceType) === ERR_NOT_IN_RANGE) {
                        creep.shibMove(container);
                    }
                }
            } else if (pairedHarvester.pos.findInRange(FIND_DROPPED_RESOURCES, 3, {filter: (s) => s.amount > creep.carryCapacity * 0.7}).length > 0) {
                let dropped = pairedHarvester.pos.findInRange(FIND_DROPPED_RESOURCES, 3, {filter: (s) => s.amount > creep.carryCapacity * 0.7})[0];
                for (const resourceType in dropped) {
                    if (creep.pickup(dropped, resourceType) === ERR_NOT_IN_RANGE) {
                        creep.shibMove(dropped);
                    }
                }
            } else {
                creep.idleFor(10);
            }
        }
    }
}

module.exports.role = profiler.registerFN(role, 'remoteHaulerRole');
