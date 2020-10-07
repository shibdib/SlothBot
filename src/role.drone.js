/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function role(creep) {
    if (creep.shibKite()) return true;
    //Invader detection
    if (creep.fleeHome()) return;
    // Handle remote drones
    if (creep.memory.destination && creep.room.name !== creep.memory.destination) {
        return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 24});
        // Handle lost guys
    } else if (!creep.memory.destination && creep.wrongRoom()) return;

    // Checks
    if (!creep.store[RESOURCE_ENERGY]) {
        creep.memory.working = undefined;
        creep.memory.constructionSite = undefined;
        creep.memory.task = undefined;
    }
    if (creep.isFull && creep.memory.task !== 'harvest') {
        creep.memory.working = true;
        creep.memory.source = undefined;
        creep.memory.harvest = undefined;
    }
    // If harvester needed harvest
    if (harvest(creep)) return;
    // Work
    if (creep.memory.working === true) {
        creep.memory.source = undefined;
        // If haulers needed haul
        if (hauling(creep)) return;
        // If builder needed build
        if (building(creep)) return;
        // If praiser needed praise
        if (upgrading(creep)) return;
        // Else idle
        creep.memory.working = undefined;
        creep.idleFor(15);
    } else {
        creep.memory.task = undefined;
        if (!creep.memory.harvest && (creep.memory.energyDestination || creep.locateEnergy())) {
            creep.say('Energy!', true);
            creep.withdrawResource();
        } else if (!creep.room.storage) {
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
                        creep.idleFor(source.ticksToRegeneration * 0.5);
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

function harvest(creep) {
    let spawn = _.filter(creep.room.structures, (c) => c.my && c.structureType === STRUCTURE_SPAWN)[0];
    let drone = _.filter(creep.room.creeps, (c) => c.my && c.memory && c.memory.role === 'drone' && c.id !== creep.id)[0];
    let harvester = _.filter(creep.room.creeps, (c) => c.my && c.memory && c.memory.role === 'drone' && c.memory.task === 'harvest')[0];
    if ((!spawn && !harvester && drone && !creep.locateEnergy()) || creep.memory.task === 'harvest') {
        if (!drone) return creep.memory.task = undefined;
        let source = Game.getObjectById(creep.memory.source) || creep.pos.getClosestSource();
        if (source) {
            creep.memory.task = 'harvest';
            creep.say('Harvest!', true);
            creep.memory.source = source.id;
            switch (creep.harvest(source)) {
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(source);
                    if (Math.random() >= 0.9) {
                        creep.memory.harvest = undefined;
                        creep.memory.source = undefined;
                    }
                    return true;
                case ERR_NOT_ENOUGH_RESOURCES:
                    creep.memory.source = undefined;
                    break;
                case OK:
                    return true;
            }
        }
        return true;
    }
}

function building(creep) {
    if (creep.memory.task && creep.memory.task !== 'build' && creep.memory.task !== 'repair') return;
    let upgrader = _.filter(creep.room.creeps, (c) => c.my && c.memory && ((c.memory.role === 'drone' && c.memory.task === 'upgrade') || c.memory.role === 'upgrader' || c.memory.role === 'remoteUpgrader' || c.memory.role === 'praiseUpgrader'));
    if ((creep.memory.task === 'build' || creep.memory.task === 'repair') || ((upgrader.length || creep.room.controller.upgradeBlocked) && (creep.memory.constructionSite || creep.constructionWork()))) {
        creep.say('Build!', true);
        creep.builderFunction();
        return true;
    }
}

function hauling(creep) {
    if (creep.memory.task && creep.memory.task !== 'haul') return;
    if (!creep.room.controller || !creep.room.controller.owner || creep.room.controller.owner.username !== MY_USERNAME) return false;
    let haulers = _.filter(creep.room.creeps, (c) => c.my && c.memory && ((c.memory.role === 'drone' && c.memory.task === 'haul') || c.memory.role === 'hauler' || c.memory.role === 'filler'));
    let needyTower = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_TOWER && !s.energy).length > 0;
    if (creep.memory.task === 'haul' || (creep.isFull && (!haulers.length || needyTower) && !creep.memory.task && (creep.room.energyAvailable < creep.room.energyCapacityAvailable || needyTower))) {
        creep.memory.task = 'haul';
        creep.say('Haul!', true);
        if (creep.memory.storageDestination || creep.haulerDelivery()) {
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
    if (!creep.room.controller || !creep.room.controller.owner || creep.room.controller.owner.username !== MY_USERNAME || creep.room.controller.upgradeBlocked || creep.room.controller.level === 8) return false;
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