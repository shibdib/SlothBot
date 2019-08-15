/*
 * Copyright (c) 2019.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function role(creep) {
    if (creep.borderCheck()) return;
    if (creep.kite()) return true;
    if (creep.hits < creep.hitsMax) return creep.goHomeAndHeal();
    // Handle remote drones
    if (creep.memory.destination && creep.room.name !== creep.memory.destination) {
        return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 24});
    }
    // Checks
    if (creep.carry.energy === 0) {
        creep.memory.working = undefined;
        creep.memory.constructionSite = undefined;
        creep.memory.task = undefined;
    }
    if (_.sum(creep.carry) === creep.carryCapacity) {
        creep.memory.working = true;
        creep.memory.source = undefined;
        creep.memory.harvest = undefined;
    }
    // Work
    if (creep.memory.working === true) {
        creep.memory.source = undefined;
        // If haulers needed haul
        if (hauling(creep)) return;
        // If builder needed build
        if (building(creep)) return;
        // If praiser needed praise
        if (upgrading(creep)) return;
    } else {
        creep.memory.task = undefined;
        if (!creep.memory.harvest && (creep.memory.energyDestination || creep.findEnergy())) {
            creep.say('Energy!', true);
            creep.withdrawResource();
        } else {
            creep.memory.harvest = true;
            let source = Game.getObjectById(creep.memory.source) || creep.pos.getClosestSource();
            if (source) {
                creep.say('Harvest!', true);
                creep.memory.source = source.id;
                switch (creep.harvest(source)) {
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(source);
                        if (Math.random() >= 0.9) {
                            creep.memory.harvest = undefined;
                            creep.memory.source = undefined;
                            return;
                        }
                        break;
                    case ERR_NOT_ENOUGH_RESOURCES:
                        creep.memory.source = undefined;
                        break;
                    case OK:
                        break;
                }
            } else {
                delete creep.memory.harvest;
                creep.idleFor(5);
            }
        }
    }
};

function building(creep) {
    if (creep.memory.task && creep.memory.task !== 'build' && creep.memory.task !== 'repair') return;
    let praiser = _.filter(creep.room.creeps, (c) => c.memory && ((c.memory.role === 'drone' && c.memory.task === 'upgrade') || c.memory.role === 'upgrader'));
    let haulers = _.filter(creep.room.creeps, (c) => c.memory && ((c.memory.role === 'drone' && c.memory.task === 'haul') || c.memory.role === 'hauler'));
    if (((Memory.roomCache[creep.room.name].sk || creep.memory.task === 'build' || creep.memory.task === 'repair') ||
        (praiser.length && (haulers.length || creep.room.energyAvailable >= creep.room.energyCapacityAvailable))) &&
        (creep.memory.constructionSite || creep.findConstruction() || creep.findRepair())) {
        creep.say('Build!', true);
        creep.builderFunction();
        return true;
    }
}

function hauling(creep) {
    if (creep.memory.task && creep.memory.task !== 'haul') return;
    if (!creep.room.controller || !creep.room.controller.owner || creep.room.controller.owner.username !== MY_USERNAME) return false;
    let haulers = _.filter(creep.room.creeps, (c) => c.memory && ((c.memory.role === 'drone' && c.memory.task === 'haul') || c.memory.role === 'hauler'));
    let needyTower = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.energy < s.energyCapacity * 0.5).length > 0;
    if (creep.memory.task === 'haul' || (creep.carry[RESOURCE_ENERGY] === creep.carryCapacity && haulers.length < 2 && !creep.memory.task && (creep.room.energyAvailable < creep.room.energyCapacityAvailable || needyTower))) {
        creep.memory.task = 'haul';
        creep.say('Haul!', true);
        if (creep.memory.storageDestination || creep.findSpawnsExtensions() || creep.findEssentials() || creep.findStorage()) {
            let storageItem = Game.getObjectById(creep.memory.storageDestination);
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
        } else if (creep.room.energyAvailable === creep.room.energyCapacityAvailable) {
            creep.memory.task = undefined;
        }
        return true;
    }
}

function upgrading(creep) {
    if (creep.memory.task && creep.memory.task !== 'upgrade') return;
    if (!creep.room.controller || !creep.room.controller.owner || creep.room.controller.owner.username !== MY_USERNAME) return false;
    creep.memory.task = 'upgrade';
    creep.say('Praise!', true);
    switch (creep.upgradeController(creep.room.controller)) {
        case OK:
            delete creep.memory._shibMove;
            break;
        case ERR_NOT_IN_RANGE:
            creep.shibMove(creep.room.controller, {range: 3});
    }
    return true;
}