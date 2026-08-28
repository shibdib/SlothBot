/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

/**
 * Created by Bob on 7/12/2017.
 */

const OPERATOR_STICKY = CREEP_LIFE_TIME;

function assignedOperatorRooms(exceptId) {
    const taken = {};
    for (const name in Game.powerCreeps) {
        const c = Game.powerCreeps[name];
        if (!c || !c.my || c.id === exceptId) continue;
        if (c.memory && c.memory.destinationRoom) taken[c.memory.destinationRoom] = true;
    }
    return taken;
}

function operatorHungerScore(room) {
    const state = room.energyState || 0;
    const spare = (room.memory.energyInfo && room.memory.energyInfo.spareIncome) || 0;
    const rclPenalty = room.level >= 8 ? 0 : 200;
    return state * 1000 + spare + rclPenalty;
}

function pickOperatorRoom(exceptId) {
    const taken = assignedOperatorRooms(exceptId);
    let best = null;
    let bestScore = Infinity;
    if (!MY_ROOMS) return null;
    for (let i = 0; i < MY_ROOMS.length; i++) {
        const name = MY_ROOMS[i];
        if (taken[name]) continue;
        const room = Game.rooms[name];
        if (!room || !room.controller || room.level < 7) continue;
        const score = operatorHungerScore(room);
        if (score < bestScore || (score === bestScore && (!best || name < best))) {
            bestScore = score;
            best = name;
        }
    }
    return best;
}

function assignOperatorRoom(powerCreep) {
    const dest = powerCreep.memory.destinationRoom;
    const destRoom = dest && Game.rooms[dest];
    const destValid = !!(destRoom && destRoom.controller && destRoom.controller.my && destRoom.level >= 7);
    const stickyUntil = powerCreep.memory.destinationStickyUntil || 0;
    if (destValid && stickyUntil > Game.time) return dest;

    const pick = pickOperatorRoom(powerCreep.id);
    const destHealthy = destValid && (destRoom.energyState || 0) >= 3
        && ((destRoom.memory.energyInfo && destRoom.memory.energyInfo.spareIncome) || 0) >= 0;
    const pickRoom = pick && Game.rooms[pick];
    const pickHungry = pickRoom && (pickRoom.energyState || 0) < 2;

    let next = destValid ? dest : pick;
    if (!destValid) next = pick;
    else if (destHealthy && pickHungry) next = pick;

    if (next && next !== dest) powerCreep.memory.destinationRoom = next;
    if (next) powerCreep.memory.destinationStickyUntil = Game.time + OPERATOR_STICKY;
    return next || dest;
}

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
        let spawn = _.filter(powerCreep.room.impassibleStructures, (s) => (s.safeIsMy ? s.safeIsMy() : false) && s.structureType === STRUCTURE_POWER_SPAWN)[0] || _.filter(powerCreep.room.impassibleStructures, (s) => s.structureType === STRUCTURE_POWER_BANK)[0];
        if (!spawn) {
            for (let r of MY_ROOMS) {
                let room = Game.rooms[r];
                if (room) {
                    spawn = _.filter(room.impassibleStructures, (s) => (s.safeIsMy ? s.safeIsMy() : false) && s.structureType === STRUCTURE_POWER_SPAWN)[0];
                    if (spawn) break;
                }
            }
        }
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
    // Handle room assignment — hungriest RCL7+ room, sticky one life, rehome from surplus.
    const assigned = assignOperatorRoom(powerCreep);
    if (assigned && assigned !== powerCreep.room.name) {
        return powerCreep.shibMove(new RoomPosition(25, 25, assigned), {range: 24});
    }
    // Handle owned rooms
    if (powerCreep.room.controller.owner && powerCreep.room.controller.owner.username === MY_USERNAME) {
        let targetSpawn = _.find(powerCreep.room.impassibleStructures, (s) => (s.safeIsMy ? s.safeIsMy() : false) && s.structureType === STRUCTURE_SPAWN && s.spawning && s.spawning.remainingTime >= 15 && (!s.effects || !s.effects.length));
        let targetTower = _.find(powerCreep.room.impassibleStructures, (s) => (s.safeIsMy ? s.safeIsMy() : false) && s.structureType === STRUCTURE_TOWER && (!s.effects || !s.effects.length));
        let targetFactory = _.find(powerCreep.room.impassibleStructures, (s) => (s.safeIsMy ? s.safeIsMy() : false) && s.structureType === STRUCTURE_FACTORY && (!s.effects || !s.effects.length));
        let targetSource = _.find(powerCreep.room.sources, (s) => !s.effects || !s.effects.length || s.effects.ticksRemaining < 25);
        let targetLab = pickOperateLab(powerCreep.room);
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
        else if (targetTower && INTEL[powerCreep.room.name] && INTEL[powerCreep.room.name].responseNeeded && powerCreep.powers[PWR_OPERATE_TOWER] && !powerCreep.powers[PWR_OPERATE_TOWER].cooldown && powerCreep.ops >= POWER_INFO[PWR_OPERATE_TOWER].ops) {
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
    const powerManager = require('module.powerManager');
    const sparePowerLevels = powerManager.getSparePowerLevels();
    const myRooms = _.filter(Game.rooms, (r) => r.energyAvailable && r.controller && r.controller.owner && r.controller.owner.username === MY_USERNAME && r.controller.level >= 8);
    const lowestOperator = powerManager.getLowestMyOperator();
    const blockedByLowerOp = lowestOperator.id && lowestOperator.id !== powerCreep.id;
    if (sparePowerLevels === 0 || powerCreep.level === 25 || blockedByLowerOp || (_.size(Game.powerCreeps) < myRooms.length && powerCreep.level >= 11)) return;
    // Ops — fuel for every other power, always first.
    if (!powerCreep.powers[PWR_GENERATE_OPS] || (powerCreep.level >= 2 && powerCreep.powers[PWR_GENERATE_OPS].level < 2) || (powerCreep.level >= 7 && powerCreep.powers[PWR_GENERATE_OPS].level < 3) || (powerCreep.level >= 14 && powerCreep.powers[PWR_GENERATE_OPS].level < 4) || (powerCreep.level >= 22 && powerCreep.powers[PWR_GENERATE_OPS].level < 5)) {
        return upgradeSwitch(powerCreep, PWR_GENERATE_OPS)
    }
        // Extensions — strongest room-economy power, usable from creep level 0.
        // Lets us spawn big bodies under energy pressure and feeds the squad
    // pipeline, so it sits ahead of source regen which is locked at lv 10.
    else if (!powerCreep.powers[PWR_OPERATE_EXTENSION] || (powerCreep.level >= 2 && powerCreep.powers[PWR_OPERATE_EXTENSION].level < 2) || (powerCreep.level >= 7 && powerCreep.powers[PWR_OPERATE_EXTENSION].level < 3) || (powerCreep.level >= 14 && powerCreep.powers[PWR_OPERATE_EXTENSION].level < 4)) {
        return upgradeSwitch(powerCreep, PWR_OPERATE_EXTENSION)
    }
    // Source — major economy boost (+ energy/tick), gated to creep level 10.
    else if (powerCreep.level >= 10 && (!powerCreep.powers[PWR_REGEN_SOURCE] || powerCreep.powers[PWR_REGEN_SOURCE].level < 3 || (powerCreep.level >= 14 && powerCreep.powers[PWR_REGEN_SOURCE].level < 4) || (powerCreep.level >= 22 && powerCreep.powers[PWR_REGEN_SOURCE].level < 5))) {
        return upgradeSwitch(powerCreep, PWR_REGEN_SOURCE)
    }
        // Tower — level 1 only. These creeps are support-focused, so we enable
    // tower boost for emergencies but don't burn upgrade points doubling it.
    else if (!powerCreep.powers[PWR_OPERATE_TOWER]) {
        return upgradeSwitch(powerCreep, PWR_OPERATE_TOWER)
    }
    // Mineral — extra throughput, gated to creep level 10.
    else if (powerCreep.level >= 10 && (!powerCreep.powers[PWR_REGEN_MINERAL] || powerCreep.powers[PWR_REGEN_MINERAL].level < 3)) {
        return upgradeSwitch(powerCreep, PWR_REGEN_MINERAL)
    }
    // Lab — speeds reactions, supports the boost production pipeline.
    else if (!powerCreep.powers[PWR_OPERATE_LAB] || (powerCreep.level >= 2 && powerCreep.powers[PWR_OPERATE_LAB].level < 2) || (powerCreep.level >= 7 && powerCreep.powers[PWR_OPERATE_LAB].level < 3) || (powerCreep.level >= 14 && powerCreep.powers[PWR_OPERATE_LAB].level < 4) || (powerCreep.level >= 22 && powerCreep.powers[PWR_OPERATE_LAB].level < 5)) {
        return upgradeSwitch(powerCreep, PWR_OPERATE_LAB)
    }
        // Factory — level 1 floor. Demoted from #3 because +50% commodity speed
    // matters less than spawn / source / lab support for room operations.
    else if (!powerCreep.powers[PWR_OPERATE_FACTORY]) {
        return upgradeSwitch(powerCreep, PWR_OPERATE_FACTORY)
    }
        // Factory level 2 — only when another operator already has level 1 and
        // nobody has level 2 yet. Splits the team across factory tiers so we can
        // cover multiple commodity levels (each operator's boost locks the
    // factory's effective level while active).
    else if (powerCreep.powers[PWR_OPERATE_FACTORY] && powerCreep.powers[PWR_OPERATE_FACTORY].level === 1 && _.filter(Game.powerCreeps, (c) => c.my && c.id !== powerCreep.id && c.powers[PWR_OPERATE_FACTORY] && c.powers[PWR_OPERATE_FACTORY].level === 1)[0] && !_.filter(Game.powerCreeps, (c) => c.my && c.id !== powerCreep.id && c.powers[PWR_OPERATE_FACTORY] && c.powers[PWR_OPERATE_FACTORY].level === 2)[0]) {
        return upgradeSwitch(powerCreep, PWR_OPERATE_FACTORY)
    }
}

function pickOperateLab(room) {
    if (!room || !room.memory.producingBoost) return null;
    const labs = room.labs || [];
    const producing = room.memory.producingBoost;
    let best = null;
    let bestCd = -1;
    for (let i = 0; i < labs.length; i++) {
        const lab = labs[i];
        if (!lab || (lab.safeIsMy && !lab.safeIsMy())) continue;
        const mem = lab.memory;
        if (mem && (mem.itemNeeded || mem.neededBoost || mem.paused)) continue;
        if (lab.effects && lab.effects.length) continue;
        if (lab.mineralType && lab.mineralType !== producing) continue;
        const cd = lab.cooldown || 0;
        if (!best || cd > bestCd) {
            best = lab;
            bestCd = cd;
        }
    }
    return best;
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