/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (powerCreep) {
    // If not spawned return
    if (!powerCreep.ticksToLive) return;
    // Handle border
    if (powerCreep.borderCheck()) return;
    // Handle upgrades
    upgradePowers(powerCreep);
    // Generate Ops
    if (powerCreep.powers[PWR_GENERATE_OPS] && !powerCreep.powers[PWR_GENERATE_OPS].cooldown) abilitySwitch(powerCreep, PWR_GENERATE_OPS);
    // Get Ops from terminal
    if (powerCreep.room.store(RESOURCE_OPS) && _.size(powerCreep.powers) > 1 && powerCreep.store[RESOURCE_OPS] < powerCreep.store.getCapacity(RESOURCE_OPS) * 0.5) {
        let store;
        if (powerCreep.room.storage && powerCreep.room.storage.store[RESOURCE_OPS]) store = powerCreep.room.storage; else if (powerCreep.room.terminal && powerCreep.room.terminal.store[RESOURCE_OPS]) store = powerCreep.room.terminal;
        if (store) {
            switch (powerCreep.withdraw(store, RESOURCE_OPS)) {
                case OK:
                    return;
                case ERR_NOT_IN_RANGE:
                    powerCreep.shibMove(store);
                    return;
            }
        }
    }
    // Store ops to sell in terminal
    if (powerCreep.store[RESOURCE_OPS] && powerCreep.room.terminal && (_.size(powerCreep.powers) === 1 || powerCreep.store[RESOURCE_OPS] >= powerCreep.store.getCapacity() * 0.6) && powerCreep.room.terminal.store.getFreeCapacity()) {
        let amount = powerCreep.store[RESOURCE_OPS] - powerCreep.store.getCapacity() * 0.5;
        if (_.size(powerCreep.powers) === 1) amount = powerCreep.store[RESOURCE_OPS];
        switch (powerCreep.transfer(powerCreep.room.terminal, RESOURCE_OPS, amount)) {
            case OK:
                return;
            case ERR_NOT_IN_RANGE:
                powerCreep.shibMove(powerCreep.room.terminal);
                return;
        }
    }
    // Handle renewal
    if (powerCreep.ticksToLive <= 1000) {
        let spawn = _.filter(powerCreep.room.structures, (s) => s.my && s.structureType === STRUCTURE_POWER_SPAWN)[0] || _.filter(powerCreep.room.structures, (s) => s.structureType === STRUCTURE_POWER_BANK)[0];
        if (spawn) {
            switch (powerCreep.renew(spawn)) {
                case OK:
                    break;
                case ERR_NOT_IN_RANGE:
                    return powerCreep.shibMove(spawn, {range: 1});
            }
        }
    }
    // level 0 idle
    if (!powerCreep.level) return powerCreep.idleFor(10);
    // Handle room assignment
    if (powerCreep.memory.destinationRoom && powerCreep.memory.destinationRoom !== powerCreep.room.name) {
        return powerCreep.shibMove(new RoomPosition(25, 25, powerCreep.memory.destinationRoom), {range: 24})
    } else if (!powerCreep.memory.destinationRoom) {
        powerCreep.memory.destinationRoom = _.filter(Memory.myRooms, (r) => !_.filter(Game.powerCreeps, (c) => c.memory.destinationRoom === r).length && Game.rooms[r].controller.level === 8)[0];
    }
    // Handle owned rooms
    if (powerCreep.room.controller.owner && powerCreep.room.controller.owner.username === MY_USERNAME) {
        let targetSpawn = _.filter(powerCreep.room.structures, (s) => s.my && s.structureType === STRUCTURE_SPAWN && s.spawning && s.spawning.remainingTime >= 15 && (!s.effects || !s.effects.length))[0];
        let targetTower = _.filter(powerCreep.room.structures, (s) => s.my && s.structureType === STRUCTURE_TOWER && (!s.effects || !s.effects.length))[0];
        let targetObserver = _.filter(powerCreep.room.structures, (s) => s.my && s.structureType === STRUCTURE_OBSERVER && (!s.effects || !s.effects.length))[0];
        let targetFactory = _.filter(powerCreep.room.structures, (s) => s.my && s.structureType === STRUCTURE_FACTORY && (!s.effects || !s.effects.length))[0];
        let targetSource = _.filter(powerCreep.room.sources, (s) => !s.effects || !s.effects.length)[0];
        let targetLab = _.filter(powerCreep.room.structures, (s) => s.my && s.structureType === STRUCTURE_LAB && s.memory.creating && !s.memory.itemNeeded && (!s.effects || !s.effects.length))[0];
        // Enable power
        if (!powerCreep.room.controller.isPowerEnabled) {
            switch (powerCreep.enableRoom(powerCreep.room.controller)) {
                case OK:
                    break;
                case ERR_NOT_IN_RANGE:
                    return powerCreep.shibMove(powerCreep.room.controller, {range: 1});
            }
        }
        // Boost tower when under attack
        else if (targetTower && Memory.roomCache[powerCreep.room.name].responseNeeded && powerCreep.powers[PWR_OPERATE_TOWER] && !powerCreep.powers[PWR_OPERATE_TOWER].cooldown && powerCreep.ops >= POWER_INFO[PWR_OPERATE_TOWER].ops) {
            powerCreep.say('TOWER', true);
            return abilitySwitch(powerCreep, PWR_OPERATE_TOWER, targetTower);
        }
        // Boost Sources
        else if (targetSource && powerCreep.powers[PWR_REGEN_SOURCE] && !powerCreep.powers[PWR_REGEN_SOURCE].cooldown) {
            powerCreep.say('SOURCE', true);
            return abilitySwitch(powerCreep, PWR_REGEN_SOURCE, targetSource);
        }
        // Fill extensions
        else if (powerCreep.powers[PWR_OPERATE_EXTENSION] && !powerCreep.powers[PWR_OPERATE_EXTENSION].cooldown && powerCreep.ops >= POWER_INFO[PWR_OPERATE_EXTENSION].ops &&
            1 - (powerCreep.room.energyAvailable / powerCreep.room.energyCapacityAvailable) > 0.2 &&
            ((powerCreep.room.storage && powerCreep.room.storage.store[RESOURCE_ENERGY] >= 5000) || (powerCreep.room.terminal && powerCreep.room.terminal.store[RESOURCE_ENERGY] >= 5000))) {
            powerCreep.say('FILL', true);
            if (powerCreep.room.storage && powerCreep.room.storage.store[RESOURCE_ENERGY] >= 5000) {
                return abilitySwitch(powerCreep, PWR_OPERATE_EXTENSION, powerCreep.room.storage);
            } else {
                return abilitySwitch(powerCreep, PWR_OPERATE_EXTENSION, powerCreep.room.terminal);
            }
        }
        // Boost Spawn
        else if (targetSpawn && powerCreep.powers[PWR_OPERATE_SPAWN] && !powerCreep.powers[PWR_OPERATE_SPAWN].cooldown && powerCreep.ops >= POWER_INFO[PWR_OPERATE_SPAWN].ops) {
            powerCreep.say('SPAWN', true);
            return abilitySwitch(powerCreep, PWR_OPERATE_SPAWN, targetSpawn);
        }
        // Boost Mineral
        else if (powerCreep.room.mineral && !powerCreep.room.mineral.ticksToRegeneration && powerCreep.powers[PWR_REGEN_MINERAL] && !powerCreep.powers[PWR_REGEN_MINERAL].cooldown && (!powerCreep.room.mineral.effects || !powerCreep.room.mineral.effects.length)) {
            powerCreep.say('MINERAL', true);
            return abilitySwitch(powerCreep, PWR_REGEN_MINERAL, powerCreep.room.mineral);
        }
        // Boost Factory
        else if (targetFactory && powerCreep.powers[PWR_OPERATE_FACTORY] && !powerCreep.powers[PWR_OPERATE_FACTORY].cooldown && powerCreep.ops >= POWER_INFO[PWR_OPERATE_FACTORY].ops) {
            powerCreep.say('FACTORY', true);
            return abilitySwitch(powerCreep, PWR_OPERATE_FACTORY, targetFactory);
        }
            /**
             // Boost Observer
             else if (targetObserver && powerCreep.powers[PWR_OPERATE_OBSERVER] && !powerCreep.powers[PWR_OPERATE_OBSERVER].cooldown && powerCreep.ops >= POWER_INFO[PWR_OPERATE_OBSERVER].ops) {
            abilitySwitch(powerCreep, PWR_OPERATE_OBSERVER, targetObserver);
        }**/
        // Boost Lab
        else if (targetLab && powerCreep.powers[PWR_OPERATE_LAB] && !powerCreep.powers[PWR_OPERATE_LAB].cooldown && powerCreep.ops >= POWER_INFO[PWR_OPERATE_LAB].ops) {
            powerCreep.say('LAB', true);
            return abilitySwitch(powerCreep, PWR_OPERATE_LAB, targetLab);
        }
        // Store Excess Ops
        else if (powerCreep.store[RESOURCE_OPS] >= powerCreep.store.getCapacity()) {
            switch (powerCreep.transfer(powerCreep.room.terminal, RESOURCE_OPS, powerCreep.store[RESOURCE_OPS] * 0.5)) {
                case OK:
                    return;
                case ERR_NOT_IN_RANGE:
                    powerCreep.shibMove(powerCreep.room.terminal);
                    return;
            }
        } else {
            powerCreep.idleFor(5);
        }
    }
};

function upgradePowers(powerCreep) {
    let sparePowerLevels = Game.gpl.level - _.size(Game.powerCreeps);
    if (sparePowerLevels === 0 || powerCreep.level === 25) return;
    // Ops
    if (!powerCreep.powers[PWR_GENERATE_OPS] || (powerCreep.level >= 2 && powerCreep.powers[PWR_GENERATE_OPS].level < 2) || (powerCreep.level >= 7 && powerCreep.powers[PWR_GENERATE_OPS].level < 3) || (powerCreep.level >= 14 && powerCreep.powers[PWR_GENERATE_OPS].level < 4)) {
        return upgradeSwitch(powerCreep, PWR_GENERATE_OPS)
    }
    // Source
    else if (powerCreep.level >= 10 && (!powerCreep.powers[PWR_REGEN_SOURCE] || powerCreep.powers[PWR_REGEN_SOURCE].level < 3 || (powerCreep.level >= 14 && powerCreep.powers[PWR_REGEN_SOURCE].level < 4) || (powerCreep.level >= 22 && powerCreep.powers[PWR_REGEN_SOURCE].level < 5))) {
        return upgradeSwitch(powerCreep, PWR_REGEN_SOURCE)
    }
    // Extensions
    else if (!powerCreep.powers[PWR_OPERATE_EXTENSION] || (powerCreep.level >= 2 && powerCreep.powers[PWR_OPERATE_EXTENSION].level < 2) || (powerCreep.level >= 7 && powerCreep.powers[PWR_OPERATE_EXTENSION].level < 3) || (powerCreep.level >= 14 && powerCreep.powers[PWR_OPERATE_EXTENSION].level < 4)) {
        return upgradeSwitch(powerCreep, PWR_OPERATE_EXTENSION)
    }
    // Spawn
    else if (!powerCreep.powers[PWR_OPERATE_SPAWN] || (powerCreep.level >= 2 && powerCreep.powers[PWR_OPERATE_SPAWN].level < 2) || (powerCreep.level >= 7 && powerCreep.powers[PWR_OPERATE_SPAWN].level < 3)) {
        return upgradeSwitch(powerCreep, PWR_OPERATE_SPAWN)
    }
    // Lab
    else if (!powerCreep.powers[PWR_OPERATE_LAB] || (powerCreep.level >= 2 && powerCreep.powers[PWR_OPERATE_LAB].level < 2) || (powerCreep.level >= 7 && powerCreep.powers[PWR_OPERATE_LAB].level < 3) || (powerCreep.level >= 14 && powerCreep.powers[PWR_OPERATE_LAB].level < 4)) {
        return upgradeSwitch(powerCreep, PWR_OPERATE_LAB)
    }
    // Factory
    else if (!powerCreep.powers[PWR_OPERATE_FACTORY] || (powerCreep.powers[PWR_OPERATE_FACTORY] && powerCreep.powers[PWR_OPERATE_FACTORY].level === 1 && _.filter(Game.powerCreeps, (c) => c.my && c.id !== powerCreep.id && c.powers[PWR_OPERATE_FACTORY] && c.powers[PWR_OPERATE_FACTORY].level === 1)[0] && !_.filter(Game.powerCreeps, (c) => c.my && c.id !== powerCreep.id && c.powers[PWR_OPERATE_FACTORY] && c.powers[PWR_OPERATE_FACTORY].level === 2)[0])) {
        return upgradeSwitch(powerCreep, PWR_OPERATE_FACTORY)
    }
    // Tower
    else if (!powerCreep.powers[PWR_OPERATE_TOWER] || (powerCreep.level >= 2 && powerCreep.powers[PWR_OPERATE_TOWER].level < 2)) {
        return upgradeSwitch(powerCreep, PWR_OPERATE_TOWER)
    }
    // Mineral
    else if (powerCreep.level >= 10 && (!powerCreep.powers[PWR_REGEN_MINERAL] || powerCreep.powers[PWR_REGEN_MINERAL].level < 3)) {
        return upgradeSwitch(powerCreep, PWR_REGEN_MINERAL)
    }
}

function abilitySwitch(powerCreep, power, target = undefined) {
    switch (powerCreep.usePower(power, target)) {
        case OK:
            break;
        case ERR_NOT_IN_RANGE:
            powerCreep.shibMove(target, {range: POWER_INFO[power].range});
            break;
        case ERR_NOT_ENOUGH_RESOURCES:
            return false;
    }
}

function upgradeSwitch(powerCreep, power) {
    switch (powerCreep.upgrade(power)) {
        case OK:
            log.a(powerCreep.name + ' just upgraded the ' + power + ' ability.')
            break;
        case ERR_NOT_ENOUGH_RESOURCES:
            return;
        case ERR_FULL:
            break;
    }
}