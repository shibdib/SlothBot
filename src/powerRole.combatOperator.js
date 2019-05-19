/*
 * Copyright (c) 2019.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (powerCreep) {
    // Say
    powerCreep.say(ICONS.attack, true);
    // If not spawned return
    if (!powerCreep.ticksToLive) return;
    // Handle border
    if (powerCreep.borderCheck()) return;
    // Handle upgrades
    upgradePowers(powerCreep);
    // Generate Ops
    if (powerCreep.powers[PWR_GENERATE_OPS] && !powerCreep.powers[PWR_GENERATE_OPS].cooldown) abilitySwitch(powerCreep, PWR_GENERATE_OPS);
    // Handle renewal
    if (powerCreep.ticksToLive <= 1000) {
        let spawn = _.filter(powerCreep.room.structures, (s) => s.my && s.structureType === STRUCTURE_POWER_SPAWN)[0] || _.filter(powerCreep.room.structures, (s) => s.structureType === STRUCTURE_POWER_BANK)[0];
        if (spawn) {
            switch (powerCreep.renew(spawn)) {
                case OK:
                    break;
                case ERR_NOT_IN_RANGE:
                    powerCreep.shibMove(spawn, {range: 1});
            }
        } else {
            powerCreep.memory.destinationRoom = powerCreep.room.findClosestOwnedRoom(false, false, 8);
        }
    }
    // level 0 idle
    if (!powerCreep.level) return powerCreep.idleFor(100);
    // Handle room movement
    if (powerCreep.memory.destinationRoom && powerCreep.memory.destinationRoom !== powerCreep.room.name) {
        return powerCreep.shibMove(new RoomPosition(25, 25, powerCreep.memory.destinationRoom), {range: 17})
    }
    else if (powerCreep.memory.destinationRoom && powerCreep.memory.destinationRoom === powerCreep.room.name) {
        powerCreep.memory.destinationRoom = undefined;
    }
    // Handle owned rooms
    if (powerCreep.room.controller.owner && powerCreep.room.controller.owner.username === MY_USERNAME) {
        let targetTower = _.sample(_.filter(powerCreep.room.structures, (s) => s.my && s.structureType === STRUCTURE_TOWER && (!s.effects || !s.effects.length)));
        // Enable power
        if (!powerCreep.room.controller.isPowerEnabled) {
            switch (powerCreep.enableRoom(powerCreep.room.controller)) {
                case OK:
                    break;
                case ERR_NOT_IN_RANGE:
                    powerCreep.shibMove(powerCreep.room.controller, {range: 1});
            }
        }
        // Boost tower when under attack
        else if (targetTower && powerCreep.room.memory.responseNeeded && powerCreep.powers[PWR_OPERATE_TOWER] && !powerCreep.powers[PWR_OPERATE_TOWER].cooldown && powerCreep.ops >= POWER_INFO[PWR_OPERATE_TOWER].ops) {
            abilitySwitch(powerCreep, PWR_OPERATE_TOWER, targetTower);
        }
        // Linger to generate ops
        else if (powerCreep.ops < 100 || powerCreep.ops < powerCreep.carryCapacity * 0.75) {
            powerCreep.idleFor(5);
        }
        else {
            // Find a room in need of response or make yourself available for offensive operations (stage in prime)
            let needsResponse = _.sample(_.filter(Memory.ownedRooms, (r) => Game.map.getRoomLinearDistance(r.name, powerCreep.room.name) < powerCreep.ticksToLive / 150 && r.memory.responseNeeded)).name;
            if (needsResponse) {
                powerCreep.memory.availableForOperation = false;
                powerCreep.memory.destinationRoom = needsResponse;
            } else {
                powerCreep.memory.availableForOperation = true;
                if (powerCreep.room.name !== Memory.primeRoom) powerCreep.memory.destinationRoom = Memory.primeRoom;
            }
            if (!powerCreep.memory.destinationRoom) powerCreep.idleFor(5);
        }
    }
};

function upgradePowers(powerCreep) {
    // Always have generate ops
    if (!powerCreep.powers[PWR_GENERATE_OPS]) {
        upgradeSwitch(powerCreep, PWR_GENERATE_OPS)
    }
    else if (powerCreep.level >= 2 && powerCreep.powers[PWR_GENERATE_OPS].level < 2) {
        upgradeSwitch(powerCreep, PWR_GENERATE_OPS)
    }
    else if (powerCreep.level >= 7 && powerCreep.powers[PWR_GENERATE_OPS].level < 3) {
        upgradeSwitch(powerCreep, PWR_GENERATE_OPS)
    }
    else if (powerCreep.level >= 14 && powerCreep.powers[PWR_GENERATE_OPS].level < 4) {
        upgradeSwitch(powerCreep, PWR_GENERATE_OPS)
    }
    else if (powerCreep.level >= 22 && powerCreep.powers[PWR_GENERATE_OPS].level < 5) {
        upgradeSwitch(powerCreep, PWR_GENERATE_OPS)
    }
    // Operate Tower
    else if (!powerCreep.powers[PWR_OPERATE_TOWER]) {
        upgradeSwitch(powerCreep, PWR_OPERATE_TOWER)
    }
    // Disrupt Tower
    else if (!powerCreep.powers[PWR_DISRUPT_TOWER]) {
        upgradeSwitch(powerCreep, PWR_DISRUPT_TOWER)
    }
    else if (powerCreep.level >= 2 && powerCreep.powers[PWR_OPERATE_TOWER].level < 2) {
        upgradeSwitch(powerCreep, PWR_OPERATE_TOWER)
    }
    else if (powerCreep.level >= 7 && powerCreep.powers[PWR_OPERATE_TOWER].level < 3) {
        upgradeSwitch(powerCreep, PWR_OPERATE_TOWER)
    }
    else if (powerCreep.level >= 14 && powerCreep.powers[PWR_OPERATE_TOWER].level < 4) {
        upgradeSwitch(powerCreep, PWR_OPERATE_TOWER)
    }
    else if (powerCreep.level >= 22 && powerCreep.powers[PWR_OPERATE_TOWER].level < 5) {
        upgradeSwitch(powerCreep, PWR_OPERATE_TOWER)
    }
    else if (powerCreep.level >= 2 && powerCreep.powers[PWR_DISRUPT_TOWER].level < 2) {
        upgradeSwitch(powerCreep, PWR_DISRUPT_TOWER)
    }
    else if (powerCreep.level >= 7 && powerCreep.powers[PWR_DISRUPT_TOWER].level < 3) {
        upgradeSwitch(powerCreep, PWR_DISRUPT_TOWER)
    }
    else if (powerCreep.level >= 14 && powerCreep.powers[PWR_DISRUPT_TOWER].level < 4) {
        upgradeSwitch(powerCreep, PWR_DISRUPT_TOWER)
    }
    else if (powerCreep.level >= 22 && powerCreep.powers[PWR_DISRUPT_TOWER].level < 5) {
        upgradeSwitch(powerCreep, PWR_DISRUPT_TOWER)
    }
}

function abilitySwitch(powerCreep, power, target = undefined) {
    switch (powerCreep.usePower(power, target)) {
        case OK:
            break;
        case ERR_NOT_IN_RANGE:
            powerCreep.shibMove(target, {range: 3});
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