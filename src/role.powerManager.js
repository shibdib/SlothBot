/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.role = function (creep) {
    //INITIAL CHECKS
    // Hauler mode
    if (creep.memory.haulerMode) {
        if (!creep.store[RESOURCE_ENERGY] && creep.memory.haulerMode + 50 < Game.time) return delete creep.memory.haulerMode;
        const haulerRole = require('role.hauler');
        return haulerRole.role(creep);
    }
    creep.say(ICONS.power, true);
    let powerSpawn = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_POWER_SPAWN)[0];
    if (!powerSpawn) return creep.suicide();
    let powerSource, energySource;
    if (creep.room.storage.store[RESOURCE_POWER]) powerSource = creep.room.storage; else if (creep.room.terminal.store[RESOURCE_POWER]) powerSource = creep.room.terminal;
    if (creep.room.storage.store[RESOURCE_ENERGY]) energySource = creep.room.storage; else if (creep.room.terminal.store[RESOURCE_ENERGY]) energySource = creep.room.terminal;
    if (creep.store[RESOURCE_ENERGY] && powerSpawn.store[RESOURCE_ENERGY] < POWER_SPAWN_ENERGY_CAPACITY) {
        switch (creep.transfer(powerSpawn, RESOURCE_ENERGY)) {
            case OK:
                return true;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(powerSpawn);
                return true;
        }
    } else if (creep.store[RESOURCE_POWER] && powerSpawn.power !== powerSpawn.powerCapacity) {
        switch (creep.transfer(powerSpawn, RESOURCE_POWER)) {
            case OK:
                return false;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(powerSpawn);
                return true;
        }
    } else if (_.sum(creep.store)) {
        creep.memory.storageDestination = creep.room.terminal.id || creep.room.storage.id;
        if (creep.memory.storageDestination) {
            let storageItem = Game.getObjectById(creep.memory.storageDestination);
            for (const resourceType in creep.store) {
                switch (creep.transfer(storageItem, resourceType)) {
                    case OK:
                        creep.memory.storageDestination = undefined;
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(storageItem);
                        break;
                    case ERR_FULL:
                        creep.memory.storageDestination = undefined;
                        break;
                }
            }
        }
    } else if (creep.memory.energyDestination) {
        creep.withdrawResource();
    } else if (energySource && powerSpawn.store[RESOURCE_ENERGY] < 1000) {
        switch (creep.withdraw(energySource, RESOURCE_ENERGY)) {
            case OK:
                return true;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(energySource);
                return true;
        }
    } else if (powerSource && powerSpawn.power !== powerSpawn.powerCapacity) {
        switch (creep.withdraw(powerSource, RESOURCE_POWER)) {
            case OK:
                return true;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(powerSource);
                return true;
        }
    } else {
        // If nothing to do, be a hauler for 50 ticks
        creep.memory.haulerMode = Game.time;
    }
};