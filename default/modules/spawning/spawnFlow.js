/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Colony energy-flow helpers shared across spawn queue runners.
 */

/** Energy/tick we try to keep as net surplus even at energyState 3. */
const ENERGY_ACCRUAL_FLOOR = 10;

/**
 * Standing energy in the RCL8 controller link. A 1-WORK upgrader spends 1/tick;
 * the buffer has to clear the 200-energy link send minimum or the refill never
 * qualifies and the controller downgrades on a full storage.
 */
const RCL8_CONTROLLER_LINK_TARGET = 400;
const RCL8_CONTROLLER_LINK_MIN = 100;

/** Controller-link WORK feed while RCL < 8 and the room is below target. */
const UPGRADER_FEED_WORK_POOR = 5;
const UPGRADER_FEED_WORK_RECOVERING = 12;

/**
 * WORK the controller link will actually feed. Undefined = no cap (RCL8 or
 * energyState 2+). Matches scaledControllerTarget in linkController.
 */
function upgraderFeedWorkCap(room) {
    const rcl = (room && room.controller && room.controller.level) || (room && room.level) || 0;
    if (rcl >= 8) return;
    const state = usableEnergyState(room);
    if (state <= 0) return UPGRADER_FEED_WORK_POOR;
    if (state === 1) return UPGRADER_FEED_WORK_RECOVERING;
}

/** Per-tick energy state cached by Colony before spawn queues run. */
function spawnEnergyState(room) {
    if (room && room._spawnEnergyState !== undefined) return room._spawnEnergyState;
    return room ? room.energyState : 0;
}

/**
 * Energy the room can spend. Storage rooms score raw energy against the
 * liquid operating target — energyState counts batteries, so bodies stay full
 * while the spawn cannot pay for them. Pre-storage rooms still use spawn fill.
 */
function usableEnergyState(room) {
    if (!room) return 0;
    if (room._usableEnergyTick === Game.time) return room._usableEnergyState;
    let state;
    if (!room.storage && !room.terminal) {
        state = spawnEnergyState(room) || 0;
    } else {
        let target = 0;
        try {
            target = require('module.colonyProfile').rawEnergyTarget(room);
        } catch (e) {
            target = 0;
        }
        const energy = room.rawEnergy || 0;
        if (!(target > 0)) state = 2;
        else if (energy > target * 1.5) state = 3;
        else if (energy >= target) state = 2;
        else if (energy > target * 0.5) state = 1;
        else state = 0;
    }
    room._usableEnergyTick = Game.time;
    room._usableEnergyState = state;
    return state;
}

function getFlowContext(room) {
    const energyInfo = room.energyInfo;
    const trend = (energyInfo && energyInfo.trend) || 0;
    const spareIncome = (energyInfo && energyInfo.spareIncome) || 0;
    const flowSpare = (energyInfo && typeof energyInfo.flowSpare === 'number')
        ? energyInfo.flowSpare
        : spareIncome + ((energyInfo && energyInfo.militarySpawnExpense) || 0);
    const flowStressed = energyInfo && typeof energyInfo.flowStressed === 'boolean'
        ? energyInfo.flowStressed
        : spareIncome < ENERGY_ACCRUAL_FLOOR || trend < -2;
    return {
        energyInfo,
        trend,
        spareIncome,
        flowSpare,
        trendOk: trend >= -2,
        flowHealthy: trend >= 0,
        flowStressed,
    };
}

/** Discretionary sinks that spend income every tick (factory recipes, optional tower repair). */
function roomCanBurnSurplus(room) {
    const energyState = spawnEnergyState(room) || 0;
    if (energyState < 3) return false;
    const {spareIncome, flowStressed, trend} = getFlowContext(room);
    return !flowStressed && spareIncome >= ENERGY_ACCRUAL_FLOOR && trend >= 0;
}

/**
 * Nuker energy is a one-time fill from the stockpile (up to 300k) and is not
 * counted in rawEnergy. Only a core that is already processing power fills
 * one. A launch room's surplus is shipped to that core instead.
 */
function roomCanFillNuker(room) {
    return roomCanProcessPower(room);
}

/** Minimum a sink requests once the empire has at least this much power. */
const POWER_SINK_FLOOR = 5000;
/** Per-core cap. Terminal-sized so a launch room can empty into a core that still has energy in storage. */
const POWER_SINK_CAP = 300000;

function roomHasActivePowerSpawn(room) {
    const spawn = room && room.powerSpawn;
    if (!spawn) return false;
    try {
        if (spawn.isActive && !spawn.isActive()) return false;
    } catch (e) {
        return false;
    }
    return true;
}

let powerSinkTick = -1;
let powerHoldNames = null;
let powerProcessNames = null;
let powerSinkKeep = 0;

/**
 * Cores hold the empire power and, once they are above 1.5× their stockpile
 * target, burn it. Launch and frontier rooms keep none, so their stock is
 * shipped in. If no core has a power spawn, a surplus room burns it so the
 * pile is not stranded.
 *
 * Spare income is the wrong signal. processPower spends 50 energy/tick and
 * that cost is booked into spareIncome, so a flow check shuts the spawn off
 * as soon as it starts. The stockpile is the fuel.
 */
function refreshPowerSinks() {
    if (powerSinkTick === Game.time && powerHoldNames) return;
    powerSinkTick = Game.time;
    const holders = [];
    const ready = [];
    const fallback = [];
    const names = (typeof MY_ROOMS !== 'undefined' && MY_ROOMS) || [];
    let isCore = function () {
        return false;
    };
    try {
        isCore = require('module.colonyProfile').isCoreRoom;
    } catch (e) { /* profile unavailable */
    }
    for (let i = 0; i < names.length; i++) {
        const room = Game.rooms[names[i]];
        if (!room || !room.terminal || !roomHasActivePowerSpawn(room)) continue;
        const surplus = (spawnEnergyState(room) || 0) >= 3;
        if (isCore(room)) {
            holders.push(room.name);
            if (surplus) ready.push(room.name);
        } else if (surplus) {
            fallback.push(room.name);
        }
    }
    const chosen = holders.length ? holders : fallback;
    powerHoldNames = new Set(chosen);
    powerProcessNames = new Set(holders.length ? ready : fallback);
    let total = 0;
    if (chosen.length && typeof getResourceTotal === 'function') {
        total = getResourceTotal(RESOURCE_POWER) || 0;
    }
    if (!chosen.length || !(total > 0)) {
        powerSinkKeep = 0;
        return;
    }
    let share = Math.ceil(total / chosen.length);
    if (total >= POWER_SINK_FLOOR) share = Math.max(share, POWER_SINK_FLOOR);
    powerSinkKeep = Math.min(POWER_SINK_CAP, share);
}

function roomIsPowerSink(room) {
    if (!room || !room.name) return false;
    refreshPowerSinks();
    return powerHoldNames.has(room.name);
}

/** Terminal keep for a core that warehouses power. Zero on launch and frontier rooms. */
function powerSinkKeepAmount(room) {
    if (!roomIsPowerSink(room)) return 0;
    return powerSinkKeep;
}

function roomCanProcessPower(room) {
    if (!room || !room.name) return false;
    refreshPowerSinks();
    return powerProcessNames.has(room.name);
}

function roomHasPositiveFlow(room) {
    const {spareIncome, flowStressed} = getFlowContext(room);
    return !flowStressed && spareIncome >= ENERGY_ACCRUAL_FLOOR;
}

function noteNukerEnergyDeposit(dest, resource, amount) {
    if (resource && resource !== RESOURCE_ENERGY) return;
    if (!dest || dest.structureType !== STRUCTURE_NUKER) return;
    if (!(amount > 0)) return;
    if (global.bumpEnergyExpense) global.bumpEnergyExpense('nuke', dest.room.name, amount);
}

// Peace keeps a 100-energy gap so one repair shot does not yank every hauler.
// Threat closes that gap: a tower that can still take a load gets it.
const TOWER_FILL_PEACE_GAP = 100;
const TOWER_FILL_THREAT_GAP = 50;
const TOWER_FILL_URGENT = 500;

function towerEnergyCap() {
    return typeof TOWER_CAPACITY === 'number' ? TOWER_CAPACITY : 1000;
}

function roomTowerThreat(room) {
    if (!room) return false;
    if (room.memory && room.memory.dangerousAttack) return true;
    return !!(typeof INTEL !== 'undefined' && INTEL[room.name] && INTEL[room.name].threatLevel);
}

/** Energy level haulers should bring a tower back up to. */
function towerFillFloor(room) {
    const gap = roomTowerThreat(room) ? TOWER_FILL_THREAT_GAP : TOWER_FILL_PEACE_GAP;
    return towerEnergyCap() - gap;
}

function towerUnderFloor(tower, floor) {
    if (!tower || !tower.store || !tower.my) return false;
    if ((tower.store.getFreeCapacity(RESOURCE_ENERGY) || 0) <= 0) return false;
    return (tower.store[RESOURCE_ENERGY] || 0) < floor;
}

function closestTowerUnder(pos, room, floor) {
    const towers = (room && room.towers) || [];
    let best = null;
    let bestRange = 999;
    for (let i = 0; i < towers.length; i++) {
        const tower = towers[i];
        if (!towerUnderFloor(tower, floor)) continue;
        const range = pos.getRangeTo(tower);
        if (range < bestRange) {
            best = tower;
            bestRange = range;
        }
    }
    return best;
}

function lowestTowerUnder(room, floor) {
    const towers = (room && room.towers) || [];
    let best = null;
    let bestEnergy = Infinity;
    for (let i = 0; i < towers.length; i++) {
        const tower = towers[i];
        if (!towerUnderFloor(tower, floor)) continue;
        const energy = tower.store[RESOURCE_ENERGY] || 0;
        if (energy < bestEnergy) {
            best = tower;
            bestEnergy = energy;
        }
    }
    return best;
}

module.exports = {
    ENERGY_ACCRUAL_FLOOR,
    RCL8_CONTROLLER_LINK_TARGET,
    RCL8_CONTROLLER_LINK_MIN,
    UPGRADER_FEED_WORK_POOR,
    UPGRADER_FEED_WORK_RECOVERING,
    upgraderFeedWorkCap,
    spawnEnergyState,
    usableEnergyState,
    getFlowContext,
    roomCanBurnSurplus,
    roomCanFillNuker,
    roomCanProcessPower,
    roomIsPowerSink,
    powerSinkKeepAmount,
    roomHasPositiveFlow,
    noteNukerEnergyDeposit,
    TOWER_FILL_URGENT,
    towerFillFloor,
    closestTowerUnder,
    lowestTowerUnder,
};