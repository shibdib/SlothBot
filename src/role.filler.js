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
    //INITIAL CHECKS
    if (Game.time % 150 === 0 && creep.wrongRoom()) return;
    creep.say(ICONS.haul, true);
    // Tow Truck
    if (creep.towTruck()) return;
    // If hauling do things
    if (creep.isFull) creep.memory.hauling = true;
    if (!_.sum(creep.store)) creep.memory.hauling = undefined;
    if (creep.memory.hauling) {
        // Hub Container
        let hubContainer = Game.getObjectById(creep.memory.storageDestination) || creep.room.storage || Game.getObjectById(creep.room.memory.hubContainer) || creep.pos.findInRange(_.filter(creep.room.structures, (s) => s.my && s.structureType === STRUCTURE_LINK), 3)[0] || Game.getObjectById(creep.haulerDelivery());
        // If extra full deliver to controller
        if (hubContainer && (hubContainer.store[RESOURCE_ENERGY] >= hubContainer.store.getCapacity() * 0.5 || hubContainer.store[RESOURCE_ENERGY] >= ENERGY_AMOUNT)) {
            let controllerContainer = Game.getObjectById(creep.room.memory.controllerContainer);
            if (controllerContainer) hubContainer = controllerContainer;
        }
        if (hubContainer) {
            if (_.sum(hubContainer.store) === hubContainer.store.getCapacity()) return creep.idleFor(10);
            let storageItem = hubContainer;
            if (!storageItem) return delete creep.memory.storageDestination;
            switch (creep.transfer(storageItem, RESOURCE_ENERGY)) {
                case OK:
                    delete creep.memory.storageDestination;
                    delete creep.memory._shibMove;
                    break;
                case ERR_NOT_IN_RANGE:
                    if (storageItem.structureType !== STRUCTURE_TOWER) {
                        let adjacentStructure = _.filter(creep.pos.findInRange(FIND_STRUCTURES, 1), (s) => (s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN) && s.energy < s.energyCapacity);
                        if (adjacentStructure.length > 0) creep.transfer(adjacentStructure[0], RESOURCE_ENERGY);
                    }
                    creep.shibMove(storageItem);
                    break;
                case ERR_FULL || ERR_INVALID_TARGET:
                    delete creep.memory.storageDestination;
                    delete creep.memory._shibMove;
                    if (storageItem.memory) delete storageItem.memory.deliveryIncoming;
                    break;
            }
        }
    } else if (creep.memory.energyDestination || fillerEnergy(creep)) creep.withdrawResource(); else creep.idleFor(5);
};

fillerEnergy = function (creep) {
    let source, container;
    if (!creep.memory.assignedSource) {
        let assignment = _.filter(creep.room.creeps, (c) => c.my && c.memory.role === 'stationaryHarvester' && c.memory.containerAttempt && !c.memory.linkID && !_.filter(creep.room.creeps, (f) => f.my && f.memory.role === 'filler' && f.memory.assignedSource === c.memory.source).length);
        if (assignment.length) {
            creep.memory.assignedSource = assignment[0].memory.source;
        } else {
            // Container
            let container = creep.pos.findClosestByRange(creep.room.structures.filter((s) => s.structureType === STRUCTURE_CONTAINER && s.id !== creep.room.memory.hubContainer && (s.id !== creep.room.memory.controllerContainer || s.store[RESOURCE_ENERGY] > 750)
                && s.store[RESOURCE_ENERGY] >= _.sum(creep.room.creeps.filter((c) => c.my && c.memory.energyDestination === s.id && c.id !== creep.id), '.store.getCapacity()') + (creep.store.getCapacity() * 0.4)));
            if (container) {
                creep.memory.energyDestination = container.id;
                creep.memory.findEnergyCountdown = undefined;
                return true;
            }
            //Dropped
            let dropped = creep.pos.findClosestByRange(creep.room.droppedEnergy, {filter: (r) => r.amount >= 50});
            if (dropped) {
                creep.memory.energyDestination = dropped.id;
                creep.memory.findEnergyCountdown = undefined;
                return true;
            }
            return false;
        }
    } else {
        source = Game.getObjectById(creep.memory.assignedSource);
    }
    // Container
    if (!creep.memory.assignedContainer) {
        source = Game.getObjectById(creep.memory.assignedSource);
        if (source) {
            let container = source.pos.findInRange(FIND_STRUCTURES, 1, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.id !== creep.room.memory.controllerContainer})[0];
            if (container) creep.memory.assignedContainer = container.id;
        }
    } else {
        container = Game.getObjectById(creep.memory.assignedContainer);
        if (container && container.store[RESOURCE_ENERGY] >= creep.store.getCapacity() * 0.5) {
            creep.memory.energyDestination = container.id;
            return true;
        }
    }
    //Dropped
    let dropped = creep.pos.findClosestByRange(creep.room.droppedEnergy, {filter: (r) => r.amount >= _.sum(creep.room.creeps.filter((c) => c.my && c.memory.energyDestination === r.id && c.id !== creep.id), '.store.getCapacity()')});
    if (dropped) {
        creep.memory.energyDestination = dropped.id;
        return true;
    }
    // Tombstone
    let tombstone = creep.pos.findClosestByRange(creep.room.tombstones, {filter: (r) => r.pos.getRangeTo(creep) <= 10 && r.store[RESOURCE_ENERGY] >= _.sum(creep.room.creeps.filter((c) => c.my && c.memory.energyDestination === r.id && c.id !== creep.id), '.store.getCapacity()') + (creep.store.getCapacity() * 0.4)});
    if (tombstone) {
        creep.memory.energyDestination = tombstone.id;
        return true;
    }
    return false;
};