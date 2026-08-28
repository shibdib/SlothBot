/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

/**
 * Created by Bob on 7/12/2017.
 *
 * Specialties (memory.specialty):
 *   eco        — one 2-source room at 100% regen; leftover ticks fill extensions.
 *   lab        — roam producing rooms and OPERATE_LAB.
 *   factory    — roam factories whose level matches memory.factoryLevel.
 *   generalist — legacy mixed kit; stationed like eco, no new factory upgrades.
 *
 * REGEN_SOURCE is 300 duration / 100 cooldown. Three sources is the mechanical
 * max at 0 travel, but owned rooms have 2 sources, so eco coverage is 1:1:
 * both sources at 100% and leftover ticks for extensions/tower/spawn.
 */

const powerManager = require('module.powerManager');
const {
    SPECIALTY_ECO,
    SPECIALTY_LAB,
    SPECIALTY_FACTORY,
    SPECIALTY_GENERALIST,
    isEcoCover,
} = powerManager;

const SOURCE_REFRESH = 40;
const LAB_REFRESH = 80;
const FACTORY_REFRESH = 80;

const ECO_PLAN = [
    {power: PWR_GENERATE_OPS, max: 5},
    {power: PWR_OPERATE_EXTENSION, max: 5},
    {power: PWR_REGEN_SOURCE, max: 5},
    {power: PWR_OPERATE_TOWER, max: 1},
    {power: PWR_OPERATE_SPAWN, max: 5},
    {power: PWR_OPERATE_POWER, max: 5},
];

const LAB_PLAN = [
    {power: PWR_GENERATE_OPS, max: 5},
    {power: PWR_OPERATE_LAB, max: 5},
    {power: PWR_OPERATE_TOWER, max: 1},
    {power: PWR_OPERATE_EXTENSION, max: 4},
    {power: PWR_OPERATE_TERMINAL, max: 5},
    {power: PWR_OPERATE_SPAWN, max: 4},
];

const FACTORY_PLAN = [
    {power: PWR_GENERATE_OPS, max: 5},
    {power: PWR_OPERATE_FACTORY, max: 5},
    {power: PWR_OPERATE_TOWER, max: 1},
    {power: PWR_OPERATE_TERMINAL, max: 5},
    {power: PWR_OPERATE_EXTENSION, max: 4},
    {power: PWR_OPERATE_STORAGE, max: 5},
];

const GENERALIST_PLAN = [
    {power: PWR_GENERATE_OPS, max: 5},
    {power: PWR_OPERATE_EXTENSION, max: 4},
    {power: PWR_REGEN_SOURCE, max: 5},
    {power: PWR_OPERATE_TOWER, max: 1},
    {power: PWR_REGEN_MINERAL, max: 3},
    {power: PWR_OPERATE_LAB, max: 5},
];

function ensureSpecialty(powerCreep) {
    const pending = Memory._powerCreeps && Memory._powerCreeps.pending && Memory._powerCreeps.pending[powerCreep.name];
    if (pending && pending.specialty) {
        powerCreep.memory.specialty = pending.specialty;
        if (pending.factoryLevel) powerCreep.memory.factoryLevel = pending.factoryLevel;
        delete Memory._powerCreeps.pending[powerCreep.name];
        return powerCreep.memory.specialty;
    }
    if (powerCreep.memory.specialty) return powerCreep.memory.specialty;
    powerCreep.memory.specialty = powerCreep.level > 0 ? SPECIALTY_GENERALIST : SPECIALTY_ECO;
    return powerCreep.memory.specialty;
}

function powerEffectTicks(obj, power) {
    if (!obj || !obj.effects || !obj.effects.length) return 0;
    for (let i = 0; i < obj.effects.length; i++) {
        const effect = obj.effects[i];
        if (effect.effect === power || effect.power === power) return effect.ticksRemaining || 0;
    }
    return 0;
}

function isMine(structure) {
    return !!(structure && structure.safeIsMy && structure.safeIsMy());
}

function operatorHungerScore(room) {
    const state = room.energyState || 0;
    const spare = (room.memory.energyInfo && room.memory.energyInfo.spareIncome) || 0;
    const rclPenalty = room.level >= 8 ? 0 : 200;
    return state * 1000 + spare + rclPenalty;
}

function roomsTakenByEco(exceptId) {
    const taken = {};
    for (const name in Game.powerCreeps) {
        const c = Game.powerCreeps[name];
        if (!c || !c.my || c.id === exceptId || !c.memory) continue;
        if (!isEcoCover(c)) continue;
        if (c.memory.destinationRoom) taken[c.memory.destinationRoom] = true;
    }
    return taken;
}

function roomsTakenByLab(exceptId) {
    const taken = {};
    for (const name in Game.powerCreeps) {
        const c = Game.powerCreeps[name];
        if (!c || !c.my || c.id === exceptId || !c.memory) continue;
        if (c.memory.specialty !== SPECIALTY_LAB) continue;
        if (c.memory.destinationRoom) taken[c.memory.destinationRoom] = true;
    }
    return taken;
}

function pickEcoRoom(exceptId) {
    const taken = roomsTakenByEco(exceptId);
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

function assignEcoRoom(powerCreep) {
    const dest = powerCreep.memory.destinationRoom;
    const taken = roomsTakenByEco(powerCreep.id);
    const destRoom = dest && Game.rooms[dest];
    const destValid = !!(destRoom && destRoom.controller && destRoom.controller.my && destRoom.level >= 7 && !taken[dest]);
    if (destValid) return dest;
    const pick = pickEcoRoom(powerCreep.id);
    if (pick && pick !== dest) powerCreep.memory.destinationRoom = pick;
    return pick || dest;
}

function labNeedsOperate(room) {
    return !!pickOperateLab(room);
}

function pickLabRoom(powerCreep) {
    if (!MY_ROOMS) return null;
    const taken = roomsTakenByLab(powerCreep.id);
    const here = powerCreep.room && powerCreep.room.name;
    let best = null;
    let bestScore = Infinity;
    let fallback = null;
    let fallbackScore = Infinity;
    for (let i = 0; i < MY_ROOMS.length; i++) {
        const name = MY_ROOMS[i];
        const room = Game.rooms[name];
        if (!room || !room.memory || !room.memory.producingBoost) continue;
        if (!labNeedsOperate(room)) continue;
        const dist = here ? Game.map.getRoomLinearDistance(here, name) : 0;
        const score = dist * 10 - unboostedLabCount(room);
        if (!taken[name]) {
            if (score < bestScore || (score === bestScore && (!best || name < best))) {
                bestScore = score;
                best = name;
            }
        } else if (score < fallbackScore || (score === fallbackScore && (!fallback || name < fallback))) {
            fallbackScore = score;
            fallback = name;
        }
    }
    return best || fallback;
}

function assignLabRoom(powerCreep) {
    const room = powerCreep.room;
    if (room && room.controller && room.controller.my && labNeedsOperate(room)) {
        powerCreep.memory.destinationRoom = room.name;
        return room.name;
    }
    const pick = pickLabRoom(powerCreep);
    if (pick) powerCreep.memory.destinationRoom = pick;
    return pick || powerCreep.memory.destinationRoom;
}

function factoryPowerLevel(powerCreep) {
    const power = powerCreep.powers && powerCreep.powers[PWR_OPERATE_FACTORY];
    if (power && power.level) return power.level;
    return powerCreep.memory.factoryLevel || 0;
}

function pickMatchingFactory(powerCreep) {
    const level = factoryPowerLevel(powerCreep);
    if (!level || !MY_ROOMS) return null;
    const here = powerCreep.room && powerCreep.room.name;
    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < MY_ROOMS.length; i++) {
        const room = Game.rooms[MY_ROOMS[i]];
        const factory = room && room.factory;
        if (!factory || factory.level !== level) continue;
        if (powerEffectTicks(factory, PWR_OPERATE_FACTORY) >= FACTORY_REFRESH) continue;
        const dist = here ? Game.map.getRoomLinearDistance(here, room.name) : 0;
        if (dist < bestScore || (dist === bestScore && (!best || room.name < best.room.name))) {
            bestScore = dist;
            best = factory;
        }
    }
    return best;
}

function assignFactoryRoom(powerCreep) {
    const factory = pickMatchingFactory(powerCreep);
    if (factory) {
        powerCreep.memory.destinationRoom = factory.room.name;
        return factory.room.name;
    }
    return powerCreep.memory.destinationRoom;
}

function assignOperator(powerCreep) {
    const spec = powerCreep.memory.specialty;
    if (spec === SPECIALTY_LAB) return assignLabRoom(powerCreep);
    if (spec === SPECIALTY_FACTORY) return assignFactoryRoom(powerCreep);
    return assignEcoRoom(powerCreep);
}

function sourceNeedsRegen(source) {
    return source && powerEffectTicks(source, PWR_REGEN_SOURCE) < SOURCE_REFRESH;
}

function pickRoomSource(room) {
    if (!room || !room.sources) return null;
    let best = null;
    let bestTicks = Infinity;
    for (let i = 0; i < room.sources.length; i++) {
        const source = room.sources[i];
        if (!sourceNeedsRegen(source)) continue;
        const ticks = powerEffectTicks(source, PWR_REGEN_SOURCE);
        if (ticks < bestTicks) {
            bestTicks = ticks;
            best = source;
        }
    }
    return best;
}

function unboostedLabCount(room) {
    if (!room || !room.memory.producingBoost) return 0;
    const labs = room.labs || [];
    let n = 0;
    for (let i = 0; i < labs.length; i++) {
        if (isOperableLab(labs[i], room.memory.producingBoost)) n++;
    }
    return n;
}

function isOperableLab(lab, producing) {
    if (!lab || (lab.safeIsMy && !lab.safeIsMy())) return false;
    const mem = lab.memory;
    if (mem && (mem.itemNeeded || mem.neededBoost || mem.paused)) return false;
    if (lab.mineralType && producing && lab.mineralType !== producing) return false;
    return powerEffectTicks(lab, PWR_OPERATE_LAB) < LAB_REFRESH;
}

function pickOperateLab(room) {
    if (!room || !room.memory.producingBoost) return null;
    const labs = room.labs || [];
    const producing = room.memory.producingBoost;
    let best = null;
    let bestTicks = Infinity;
    let bestCd = -1;
    for (let i = 0; i < labs.length; i++) {
        const lab = labs[i];
        if (!isOperableLab(lab, producing)) continue;
        const ticks = powerEffectTicks(lab, PWR_OPERATE_LAB);
        const cd = lab.cooldown || 0;
        if (ticks < bestTicks || (ticks === bestTicks && cd > bestCd)) {
            best = lab;
            bestTicks = ticks;
            bestCd = cd;
        }
    }
    return best;
}

function canUse(powerCreep, power) {
    const info = powerCreep.powers && powerCreep.powers[power];
    if (!info || info.cooldown) return false;
    const cost = POWER_INFO[power] && POWER_INFO[power].ops;
    if (cost && powerCreep.ops < cost) return false;
    return true;
}

function abilitySwitch(powerCreep, power, target) {
    switch (powerCreep.usePower(power, target)) {
        case OK:
            return true;
        case ERR_NOT_IN_RANGE:
            if (target) powerCreep.shibMove(target, {range: POWER_INFO[power].range});
            return true;
        case ERR_NOT_ENOUGH_RESOURCES:
            return false;
        default:
            return false;
    }
}

function tryEnableRoom(powerCreep) {
    const controller = powerCreep.room.controller;
    if (!controller || !controller.my || controller.isPowerEnabled) return false;
    switch (powerCreep.enableRoom(controller)) {
        case OK:
            return true;
        case ERR_NOT_IN_RANGE:
            powerCreep.shibMove(controller, {range: 1});
            return true;
        default:
            return false;
    }
}

function tryTower(powerCreep) {
    if (!canUse(powerCreep, PWR_OPERATE_TOWER)) return false;
    if (!INTEL[powerCreep.room.name] || !INTEL[powerCreep.room.name].responseNeeded) return false;
    const tower = _.find(powerCreep.room.impassibleStructures, s => isMine(s) && s.structureType === STRUCTURE_TOWER && powerEffectTicks(s, PWR_OPERATE_TOWER) < 20);
    if (!tower) return false;
    powerCreep.say('TOWER', true);
    return abilitySwitch(powerCreep, PWR_OPERATE_TOWER, tower);
}

function tryExtensions(powerCreep) {
    if (!canUse(powerCreep, PWR_OPERATE_EXTENSION)) return false;
    const room = powerCreep.room;
    if (!room.energyCapacityAvailable) return false;
    if (1 - (room.energyAvailable / room.energyCapacityAvailable) <= 0.2) return false;
    const store = (room.storage && room.storage.store[RESOURCE_ENERGY] >= 5000) ? room.storage
        : (room.terminal && room.terminal.store[RESOURCE_ENERGY] >= 5000) ? room.terminal : null;
    if (!store) return false;
    powerCreep.say('FILL', true);
    return abilitySwitch(powerCreep, PWR_OPERATE_EXTENSION, store);
}

function trySpawn(powerCreep) {
    if (!canUse(powerCreep, PWR_OPERATE_SPAWN)) return false;
    const spawn = _.find(powerCreep.room.impassibleStructures, s => isMine(s) && s.structureType === STRUCTURE_SPAWN
        && s.spawning && s.spawning.remainingTime >= 15 && powerEffectTicks(s, PWR_OPERATE_SPAWN) < 50);
    if (!spawn) return false;
    powerCreep.say('SPAWN', true);
    return abilitySwitch(powerCreep, PWR_OPERATE_SPAWN, spawn);
}

function tryMineral(powerCreep) {
    if (!canUse(powerCreep, PWR_REGEN_MINERAL)) return false;
    const mineral = powerCreep.room.mineral;
    if (!mineral || mineral.ticksToRegeneration) return false;
    if (powerEffectTicks(mineral, PWR_REGEN_MINERAL)) return false;
    powerCreep.say('MINERAL', true);
    return abilitySwitch(powerCreep, PWR_REGEN_MINERAL, mineral);
}

function tryFactory(powerCreep) {
    if (!canUse(powerCreep, PWR_OPERATE_FACTORY)) return false;
    const level = powerCreep.powers[PWR_OPERATE_FACTORY].level;
    const factory = powerCreep.room.factory;
    if (!factory || factory.level !== level) return false;
    if (powerEffectTicks(factory, PWR_OPERATE_FACTORY) >= FACTORY_REFRESH) return false;
    powerCreep.say('FACTORY', true);
    return abilitySwitch(powerCreep, PWR_OPERATE_FACTORY, factory);
}

function tryLab(powerCreep) {
    if (!canUse(powerCreep, PWR_OPERATE_LAB)) return false;
    const lab = pickOperateLab(powerCreep.room);
    if (!lab) return false;
    powerCreep.say('LAB', true);
    return abilitySwitch(powerCreep, PWR_OPERATE_LAB, lab);
}

function tryTerminal(powerCreep) {
    if (!canUse(powerCreep, PWR_OPERATE_TERMINAL)) return false;
    const terminal = powerCreep.room.terminal;
    if (!terminal || (terminal.safeIsMy && !terminal.safeIsMy())) return false;
    if (powerEffectTicks(terminal, PWR_OPERATE_TERMINAL) >= 50) return false;
    powerCreep.say('TERM', true);
    return abilitySwitch(powerCreep, PWR_OPERATE_TERMINAL, terminal);
}

function tryStorage(powerCreep) {
    if (!canUse(powerCreep, PWR_OPERATE_STORAGE)) return false;
    const storage = powerCreep.room.storage;
    if (!storage || (storage.safeIsMy && !storage.safeIsMy())) return false;
    if (powerEffectTicks(storage, PWR_OPERATE_STORAGE) >= 50) return false;
    powerCreep.say('STORE', true);
    return abilitySwitch(powerCreep, PWR_OPERATE_STORAGE, storage);
}

function tryOperatePower(powerCreep) {
    if (!canUse(powerCreep, PWR_OPERATE_POWER)) return false;
    const spawn = _.find(powerCreep.room.impassibleStructures, s => isMine(s) && s.structureType === STRUCTURE_POWER_SPAWN
        && powerEffectTicks(s, PWR_OPERATE_POWER) < 50);
    if (!spawn) return false;
    powerCreep.say('POWER', true);
    return abilitySwitch(powerCreep, PWR_OPERATE_POWER, spawn);
}

function trySource(powerCreep, source) {
    if (!source || !canUse(powerCreep, PWR_REGEN_SOURCE)) return false;
    powerCreep.say('SOURCE', true);
    return abilitySwitch(powerCreep, PWR_REGEN_SOURCE, source);
}

function tryDepositOps(powerCreep) {
    if (!powerCreep.store[RESOURCE_OPS] || powerCreep.store[RESOURCE_OPS] < powerCreep.store.getCapacity()) return false;
    const terminal = powerCreep.room.terminal;
    if (!terminal || !terminal.store.getFreeCapacity()) return false;
    switch (powerCreep.transfer(terminal, RESOURCE_OPS, Math.floor(powerCreep.store[RESOURCE_OPS] * 0.5))) {
        case OK:
            return true;
        case ERR_NOT_IN_RANGE:
            powerCreep.shibMove(terminal);
            return true;
        default:
            return false;
    }
}

function doEcoWork(powerCreep, generalist) {
    if (tryTower(powerCreep)) return true;
    if (trySource(powerCreep, pickRoomSource(powerCreep.room))) return true;
    if (tryExtensions(powerCreep)) return true;
    if (trySpawn(powerCreep)) return true;
    if (tryOperatePower(powerCreep)) return true;
    if (generalist && tryMineral(powerCreep)) return true;
    if (generalist && tryFactory(powerCreep)) return true;
    if (generalist && tryLab(powerCreep)) return true;
    return tryDepositOps(powerCreep);
}

function doLabWork(powerCreep, assigned) {
    if (tryTower(powerCreep)) return true;
    if (tryLab(powerCreep)) return true;
    if (assigned && assigned !== powerCreep.room.name) {
        powerCreep.shibMove(new RoomPosition(25, 25, assigned), {range: 24});
        return true;
    }
    if (tryTerminal(powerCreep)) return true;
    if (trySpawn(powerCreep)) return true;
    if (tryExtensions(powerCreep)) return true;
    return tryDepositOps(powerCreep);
}

function doFactoryWork(powerCreep, assigned) {
    if (tryTower(powerCreep)) return true;
    const factory = pickMatchingFactory(powerCreep);
    if (factory) {
        if (factory.room.name !== powerCreep.room.name) {
            powerCreep.shibMove(new RoomPosition(25, 25, factory.room.name), {range: 24});
            return true;
        }
        if (tryFactory(powerCreep)) return true;
    }
    if (assigned && assigned !== powerCreep.room.name) {
        powerCreep.shibMove(new RoomPosition(25, 25, assigned), {range: 24});
        return true;
    }
    if (tryTerminal(powerCreep)) return true;
    if (tryStorage(powerCreep)) return true;
    if (tryExtensions(powerCreep)) return true;
    return tryDepositOps(powerCreep);
}

function needsPowerLevel(powerCreep, power, maxLevel) {
    const info = POWER_INFO[power];
    if (!info) return false;
    const current = (powerCreep.powers[power] && powerCreep.powers[power].level) || 0;
    if (current >= maxLevel) return false;
    const required = info.level[current];
    return powerCreep.level >= required;
}

function upgradePlan(powerCreep) {
    const spec = powerCreep.memory.specialty;
    if (spec === SPECIALTY_LAB) return LAB_PLAN;
    if (spec === SPECIALTY_FACTORY) {
        const target = powerCreep.memory.factoryLevel || 1;
        return FACTORY_PLAN.map(step => step.power === PWR_OPERATE_FACTORY ? {power: step.power, max: target} : step);
    }
    if (spec === SPECIALTY_GENERALIST) return GENERALIST_PLAN;
    return ECO_PLAN;
}

function canUpgrade(powerCreep) {
    if (powerManager.getSparePowerLevels() === 0 || powerCreep.level >= 25) return false;
    const lowest = powerManager.getLowestMyOperator();
    if (lowest.id && lowest.id !== powerCreep.id) return false;
    const spec = powerCreep.memory.specialty;
    if (powerCreep.level >= 11) {
        if ((spec === SPECIALTY_ECO || spec === SPECIALTY_GENERALIST) && powerManager.needMoreEcoOperators()) return false;
        if (spec === SPECIALTY_LAB && powerManager.needMoreLabOperators()) return false;
    }
    return true;
}

function upgradePowers(powerCreep) {
    if (!canUpgrade(powerCreep)) return;
    const plan = upgradePlan(powerCreep);
    for (let i = 0; i < plan.length; i++) {
        if (needsPowerLevel(powerCreep, plan[i].power, plan[i].max)) {
            return upgradeSwitch(powerCreep, plan[i].power);
        }
    }
}

function upgradeSwitch(powerCreep, power) {
    switch (powerCreep.upgrade(power)) {
        case OK:
            log.a(powerCreep.name + ' just upgraded the ' + power + ' ability.');
            break;
        case ERR_NOT_ENOUGH_RESOURCES:
            return;
        case ERR_FULL:
            break;
    }
}

function handleOpsInventory(powerCreep) {
    if (powerCreep.room.store(RESOURCE_OPS) && _.size(powerCreep.powers) > 1 && powerCreep.store[RESOURCE_OPS] < powerCreep.store.getCapacity(RESOURCE_OPS) * 0.5) {
        let store;
        if (powerCreep.room.storage && powerCreep.room.storage.store[RESOURCE_OPS]) store = powerCreep.room.storage;
        else if (powerCreep.room.terminal && powerCreep.room.terminal.store[RESOURCE_OPS]) store = powerCreep.room.terminal;
        if (store) {
            switch (powerCreep.withdraw(store, RESOURCE_OPS)) {
                case OK:
                    return true;
                case ERR_NOT_IN_RANGE:
                    powerCreep.shibMove(store);
                    return true;
            }
        }
    }
    if (powerCreep.store[RESOURCE_OPS] && powerCreep.room.terminal && (_.size(powerCreep.powers) === 1 || powerCreep.store[RESOURCE_OPS] >= powerCreep.store.getCapacity() * 0.6) && powerCreep.room.terminal.store.getFreeCapacity()) {
        let amount = powerCreep.store[RESOURCE_OPS] - powerCreep.store.getCapacity() * 0.5;
        if (_.size(powerCreep.powers) === 1) amount = powerCreep.store[RESOURCE_OPS];
        switch (powerCreep.transfer(powerCreep.room.terminal, RESOURCE_OPS, amount)) {
            case OK:
                return true;
            case ERR_NOT_IN_RANGE:
                powerCreep.shibMove(powerCreep.room.terminal);
                return true;
        }
    }
    return false;
}

function handleRenew(powerCreep) {
    if (powerCreep.ticksToLive > 1000) return false;
    let spawn = _.filter(powerCreep.room.impassibleStructures, s => isMine(s) && s.structureType === STRUCTURE_POWER_SPAWN)[0]
        || _.filter(powerCreep.room.impassibleStructures, s => s.structureType === STRUCTURE_POWER_BANK)[0];
    if (!spawn) {
        for (let r of MY_ROOMS) {
            const room = Game.rooms[r];
            if (!room) continue;
            spawn = _.filter(room.impassibleStructures, s => isMine(s) && s.structureType === STRUCTURE_POWER_SPAWN)[0];
            if (spawn) break;
        }
    }
    if (!spawn) return false;
    switch (powerCreep.renew(spawn)) {
        case OK:
            return false;
        case ERR_NOT_IN_RANGE:
            powerCreep.shibMove(spawn, {range: 1});
            return true;
        default:
            return false;
    }
}

module.exports.role = function (powerCreep) {
    if (!powerCreep.ticksToLive) return;
    if (powerCreep.borderCheck()) return;
    ensureSpecialty(powerCreep);
    upgradePowers(powerCreep);
    if (powerCreep.powers[PWR_GENERATE_OPS] && !powerCreep.powers[PWR_GENERATE_OPS].cooldown) {
        powerCreep.usePower(PWR_GENERATE_OPS);
    }
    if (handleOpsInventory(powerCreep)) return;
    if (handleRenew(powerCreep)) return;
    if (!powerCreep.level) return powerCreep.idleFor(10);

    const assigned = assignOperator(powerCreep);
    if (tryEnableRoom(powerCreep)) return;

    const spec = powerCreep.memory.specialty;
    const stayForWork = spec === SPECIALTY_LAB || spec === SPECIALTY_FACTORY;
    if (!stayForWork && assigned && assigned !== powerCreep.room.name) {
        return powerCreep.shibMove(new RoomPosition(25, 25, assigned), {range: 24});
    }

    const controller = powerCreep.room.controller;
    if (!controller || !controller.my) {
        if (assigned && assigned !== powerCreep.room.name) {
            return powerCreep.shibMove(new RoomPosition(25, 25, assigned), {range: 24});
        }
        return powerCreep.idleFor(5);
    }

    let acted = false;
    if (spec === SPECIALTY_LAB) acted = doLabWork(powerCreep, assigned);
    else if (spec === SPECIALTY_FACTORY) acted = doFactoryWork(powerCreep, assigned);
    else acted = doEcoWork(powerCreep, spec === SPECIALTY_GENERALIST);

    if (!acted) powerCreep.idleFor(5);
};
