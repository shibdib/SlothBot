/*
 * Copyright (c) 2019.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.role = function (creep) {
    //INITIAL CHECKS
    if (Game.time % 50 === 0 && creep.wrongRoom()) return;
    creep.say(ICONS.power, true);
    let powerSpawn = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_POWER_SPAWN)[0];
    let powerSource, energySource;
    if (creep.room.storage.store[RESOURCE_POWER]) powerSource = creep.room.storage;
    if (creep.room.terminal.store[RESOURCE_POWER]) powerSource = creep.room.terminal;
    if (creep.room.terminal.store[RESOURCE_ENERGY]) energySource = creep.room.terminal;
    if (creep.room.storage.store[RESOURCE_ENERGY]) energySource = creep.room.storage;
    if (creep.carry[RESOURCE_ENERGY] && powerSpawn.energy < powerSpawn.energyCapacity) {
        switch (creep.transfer(powerSpawn, RESOURCE_ENERGY)) {
            case OK:
                return true;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(powerSpawn);
                return true;
        }
    } else if (creep.carry[RESOURCE_POWER] && powerSpawn.power !== powerSpawn.powerCapacity) {
        switch (creep.transfer(powerSpawn, RESOURCE_POWER)) {
            case OK:
                return false;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(powerSpawn);
                return true;
        }
    } else if (_.sum(creep.carry)) {
        creep.memory.storageDestination = creep.room.terminal.id || creep.room.storage.id;
        if (creep.memory.storageDestination) {
            let storageItem = Game.getObjectById(creep.memory.storageDestination);
            for (const resourceType in creep.carry) {
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
        creep.withdrawEnergy();
    } else if (energySource && powerSpawn.energy < 1000) {
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
        creep.idleFor(25);
    }
};