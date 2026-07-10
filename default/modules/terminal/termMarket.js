/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Market hub selection, empire procurement, and passive order orchestration.
 */

const state = require('termState');
const {getEffectiveSupply, getEmpireDemand} = require('termNetwork');
const {getRoomResourceDemand, getRoomEffective} = require('termTransfers');
const profiler = require('tools.profiler');

const RESOURCE_SEND_MIN = 100;

function isValidMarketHub(name) {
    const room = Game.rooms[name];
    return !!(name && room?.terminal && !room.memory.dangerousAttack && _.includes(MY_ROOMS, name));
}

function scoreMarketHubCandidate(room) {
    const energy = room.terminal.store[RESOURCE_ENERGY] || 0;
    let score = energy + room.level * 1000;
    if (room.energyState >= 2) score += 5000;
    return score;
}

function pickMarketHubCandidate() {
    const candidates = [];
    for (const name of MY_ROOMS) {
        const room = Game.rooms[name];
        if (!isValidMarketHub(name)) continue;
        candidates.push({name, score: scoreMarketHubCandidate(room)});
    }
    candidates.sort((a, b) => b.score - a.score);
    if (candidates.length) return candidates[0].name;
    for (const name of MY_ROOMS) {
        if (Game.rooms[name]?.terminal) return name;
    }
    return null;
}

function selectMarketHub() {
    if (!Memory._banker) Memory._banker = {};

    let stored = Memory._banker.marketHub;
    if (!stored && state.ledger?.marketHub) {
        stored = state.ledger.marketHub;
    }

    if (stored && isValidMarketHub(stored)) {
        Memory._banker.marketHub = stored;
        return stored;
    }

    const chosen = pickMarketHubCandidate();
    if (chosen) Memory._banker.marketHub = chosen;
    else delete Memory._banker.marketHub;
    return chosen;
}

function isMarketHub(roomName) {
    return !!(state.ledger && state.ledger.marketHub === roomName);
}

function getInboundPlannedAmount(roomName, resource, plannedTransfers = null) {
    const transfers = plannedTransfers || state.ledger?.plannedTransfers || [];
    let total = 0;
    for (const transfer of transfers) {
        if (transfer.to === roomName && transfer.resource === resource) total += transfer.amount;
    }
    return total;
}

function collectEmpireLabNeeds() {
    const needs = new Set();
    for (const name of MY_ROOMS) {
        const room = Game.rooms[name];
        if (!room) continue;
        for (const lab of room.labs || []) {
            if (lab.memory?.itemNeeded) needs.add(lab.memory.itemNeeded);
        }
    }
    return needs;
}

function getRoomLabNeeds(room) {
    const set = new Set();
    for (const lab of room.labs || []) {
        if (lab.memory?.itemNeeded) set.add(lab.memory.itemNeeded);
    }
    return set;
}

function getEmpireResourceDeficit(resource) {
    let totalDeficit = 0;
    let minStockRatio = 1;
    let hasLabNeed = false;
    const needyRooms = [];

    for (const name of MY_ROOMS) {
        const room = Game.rooms[name];
        if (!room) continue;

        const demand = getRoomResourceDemand(room, resource);
        if (!demand) continue;

        const effective = getRoomEffective(room, resource);
        const inbound = room.terminal ? getInboundPlannedAmount(name, resource) : 0;
        const deficit = Math.max(0, demand - effective - inbound);
        if (deficit < RESOURCE_SEND_MIN) continue;

        totalDeficit += deficit;
        needyRooms.push(name);
        minStockRatio = Math.min(minStockRatio, effective / demand);
        if (getRoomLabNeeds(room).has(resource)) hasLabNeed = true;
    }

    if (!totalDeficit) return null;

    const empireSurplus = getEffectiveSupply(resource) - getEmpireDemand(resource);
    if (empireSurplus >= totalDeficit) return null;

    return {
        resource,
        deficit: totalDeficit,
        needyRooms,
        isLabNeed: hasLabNeed,
        stockRatio: minStockRatio,
        urgency: hasLabNeed ? 2 + (1 - minStockRatio) : 1 - minStockRatio,
    };
}

function getEmpireBuyCandidates() {
    const resources = new Set(BASE_MINERALS);
    for (const need of collectEmpireLabNeeds()) resources.add(need);

    const candidates = [];
    for (const resource of resources) {
        if (resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) continue;
        const entry = getEmpireResourceDeficit(resource);
        if (entry) candidates.push(entry);
    }

    candidates.sort((a, b) => b.urgency - a.urgency);
    return candidates;
}

function runHousekeeping(ctrl, globalOrders, myOrders) {
    if (!Memory._banker) Memory._banker = {};

    if (!state.lastRun['updates'] || state.lastRun['updates'] + 50 < Game.time) {
        ctrl.updateSpendingMoney();
        ctrl.pricingUpdate(globalOrders, myOrders);
        ctrl.orderCleanup(myOrders);
        const {pruneTerminalCaches} = require('termCache');
        pruneTerminalCaches();
        if (['shard0', 'shard1', 'shard2', 'shard3', 'shardX'].includes(Game.shard.name) && SELL_PIXELS) {
            ctrl.sellPixels();
        }
        state.lastRun['updates'] = Game.time;
    }
}

function runActiveMarket(ctrl, globalOrders) {
    if (!_.size(MY_MINERALS)) return false;
    const terminal = ctrl.room.terminal;
    return ctrl.dealFinder(terminal, globalOrders)
        || ctrl.quickSell(terminal, globalOrders);
}

function runPassiveMarket(ctrl, globalOrders, myOrders) {
    if (!_.size(MY_MINERALS)) return false;
    const terminal = ctrl.room.terminal;
    return ctrl.placeSellOrders(terminal, globalOrders, myOrders)
        || ctrl.placeBuyOrders(terminal, globalOrders, myOrders);
}

profiler.registerObject({
    selectMarketHub,
    isMarketHub,
    getInboundPlannedAmount,
    getEmpireBuyCandidates,
    getEmpireResourceDeficit,
    runHousekeeping,
    runActiveMarket,
    runPassiveMarket,
}, 'TermMarket');

module.exports = {
    selectMarketHub,
    isMarketHub,
    getInboundPlannedAmount,
    getEmpireBuyCandidates,
    getEmpireResourceDeficit,
    runHousekeeping,
    runActiveMarket,
    runPassiveMarket,
};