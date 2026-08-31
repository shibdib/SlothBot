/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Market hub selection, empire procurement, and passive order orchestration.
 */

const state = require('termState');
const {getEffectiveSupply, getEmpireDemand, buildEquivalenceMap} = require('termNetwork');
const {getRoomResourceDemand, getRoomEffective} = require('termTransfers');
const {isCoreRoom, getColonyProfile} = require('module.colonyProfile');
const profiler = require('tools.profiler');

const RESOURCE_SEND_MIN = 100;
const EXTREME_SHORTAGE_RATIO = 0.25;

function isValidMarketHub(name) {
    const room = Game.rooms[name];
    return !!(name && room?.terminal && !room.memory.dangerousAttack && _.includes(MY_ROOMS, name));
}

function empireHasCoreHub() {
    for (const name of MY_ROOMS) {
        if (isValidMarketHub(name) && isCoreRoom(name)) return true;
    }
    return false;
}

function scoreMarketHubCandidate(room) {
    const energy = room.terminal.store[RESOURCE_ENERGY] || 0;
    let score = energy + room.level * 1000;
    if (room.energyState >= 2) score += 5000;
    if (room.storage) score += Math.min(room.storage.store.getFreeCapacity(), 300000) / 50;
    const profile = getColonyProfile(room.name);
    if (profile && Number.isFinite(profile.hostileHops)) score += profile.hostileHops * 2000;
    return score;
}

function pickMarketHubCandidate() {
    const cores = [];
    const fallback = [];
    for (const name of MY_ROOMS) {
        const room = Game.rooms[name];
        if (!isValidMarketHub(name)) continue;
        const entry = {name, score: scoreMarketHubCandidate(room)};
        if (isCoreRoom(room)) cores.push(entry);
        else fallback.push(entry);
    }
    const pool = cores.length ? cores : fallback;
    pool.sort((a, b) => b.score - a.score);
    if (pool.length) return pool[0].name;
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

    const storedOk = stored && isValidMarketHub(stored);
    const storedIsCore = storedOk && isCoreRoom(stored);
    if (storedIsCore || (storedOk && !empireHasCoreHub())) {
        if (Memory._banker.marketHub !== stored) Memory._banker.marketHub = stored;
        return stored;
    }

    const chosen = pickMarketHubCandidate();
    if (chosen) {
        if (Memory._banker.marketHub !== chosen) Memory._banker.marketHub = chosen;
    } else if (Memory._banker.marketHub !== undefined) {
        delete Memory._banker.marketHub;
    }
    return chosen;
}

function isMarketHub(roomName) {
    const hub = (state.ledger && state.ledger.marketHub)
        || (Memory._banker && Memory._banker.marketHub);
    return hub === roomName;
}

function getInboundPlannedAmount(roomName, resource, plannedTransfers = null) {
    const transfers = plannedTransfers || state.ledger?.plannedTransfers || [];
    let total = 0;
    for (const transfer of transfers) {
        if (transfer.to === roomName && transfer.resource === resource) total += transfer.amount;
    }
    return total;
}

function getRoomLabNeeds(room) {
    const set = new Set();
    for (const lab of room.labs || []) {
        if (lab.memory?.itemNeeded) set.add(lab.memory.itemNeeded);
    }
    return set;
}

function isCompressedBar(resource) {
    return !!(typeof COMPRESSED_COMMODITIES !== 'undefined'
        && COMPRESSED_COMMODITIES.includes(resource)
        && resource !== RESOURCE_BATTERY);
}

function isMarketProcureResource(resource) {
    if (!resource || resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) return false;
    if (typeof BASE_MINERALS !== 'undefined' && BASE_MINERALS.includes(resource)) return true;
    return isCompressedBar(resource);
}

function getSourceMineral(resource) {
    if (typeof BASE_MINERALS !== 'undefined' && BASE_MINERALS.includes(resource)) return resource;
    if (!isCompressedBar(resource)) return null;
    const entries = buildEquivalenceMap()[resource];
    if (!entries) return null;
    for (let i = 0; i < entries.length; i++) {
        if (entries[i].base) return entries[i].base;
    }
    return null;
}

function historyAvgPrice(resource) {
    if (typeof latestMarketHistory !== 'function') return 0;
    const avg = parseFloat(latestMarketHistory(resource).avg);
    return avg > 0 ? avg : 0;
}

function cheapestSellPrice(resource, globalOrders, minAmount = 50) {
    if (!globalOrders) return 0;
    let best = 0;
    for (let i = 0; i < globalOrders.length; i++) {
        const order = globalOrders[i];
        if (!order || order.resourceType !== resource || order.type !== ORDER_SELL) continue;
        if ((order.remainingAmount || order.amount || 0) < minAmount) continue;
        if (typeof MY_ROOMS !== 'undefined' && MY_ROOMS.includes(order.roomName)) continue;
        if (!best || order.price < best) best = order.price;
    }
    return best;
}

function rawRefPrice(resource, globalOrders) {
    const hist = historyAvgPrice(resource);
    const live = cheapestSellPrice(resource, globalOrders);
    if (hist && live) return Math.min(hist, live);
    return live || hist || 0;
}

function getBarRecipe(resource) {
    if (!isCompressedBar(resource) || typeof COMMODITIES === 'undefined') return null;
    const def = COMMODITIES[resource];
    const source = getSourceMineral(resource);
    if (!def || !def.amount || !source || !def.components) return null;
    const mineralIn = def.components[source];
    if (!mineralIn) return null;
    return {source, ratio: mineralIn / def.amount};
}

/**
 * Ceiling for a bar buy. Mineral content only: 500 raw + 200 energy → 100 bar,
 * so 1 bar unit ≡ `ratio` raw (usually 5).
 *
 * Compress energy is left out on purpose. Cheap energy means buy raw and
 * compress; overpriced energy would inflate this cap and we would overpay
 * for bars. Either way, if raw is cheaper, do not buy bars.
 */
function maxBarBuyPrice(bar, globalOrders) {
    const recipe = getBarRecipe(bar);
    if (!recipe) return 0;
    const mineralPrice = rawRefPrice(recipe.source, globalOrders);
    if (!(mineralPrice > 0)) return 0;
    return recipe.ratio * mineralPrice;
}

function barPriceBeatsRaw(bar, barPrice, globalOrders) {
    if (!(barPrice > 0)) return false;
    const cap = maxBarBuyPrice(bar, globalOrders);
    return cap > 0 && barPrice < cap;
}

function isActivelyMiningMineral(mineralType) {
    if (!mineralType || typeof MY_ROOMS === 'undefined') return false;
    for (const name of MY_ROOMS) {
        const room = Game.rooms[name];
        if (!room || room.level < 6 || !room.extractor) continue;
        const mineral = room.mineral;
        if (!mineral || mineral.mineralType !== mineralType) continue;
        if (mineral.mineralAmount > 0) return true;
    }
    return false;
}

function isExtremeShortage(entry) {
    return !!(entry && entry.stockRatio < EXTREME_SHORTAGE_RATIO);
}

function barCoveredByMineralStock(resource) {
    if (!isCompressedBar(resource)) return false;
    const source = getSourceMineral(resource);
    if (!source) return false;
    return (getEffectiveSupply(source) - getEmpireDemand(source)) >= REACTION_AMOUNT;
}

/**
 * Market procurement is minerals and bars only. Buy when we need it and either
 * nobody is currently mining the source mineral, or stock is critically low.
 * Boosts are never bought.
 */
function shouldProcureResource(resource, entry = null) {
    if (!isMarketProcureResource(resource)) return false;
    if (barCoveredByMineralStock(resource)) return false;
    const deficit = entry || getEmpireResourceDeficit(resource);
    if (!deficit) return false;
    const source = getSourceMineral(resource);
    if (source && isActivelyMiningMineral(source) && !isExtremeShortage(deficit)) return false;
    return true;
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
    if (typeof COMPRESSED_COMMODITIES !== 'undefined') {
        for (let i = 0; i < COMPRESSED_COMMODITIES.length; i++) {
            const resource = COMPRESSED_COMMODITIES[i];
            if (resource !== RESOURCE_BATTERY) resources.add(resource);
        }
    }

    const candidates = [];
    for (const resource of resources) {
        if (resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) continue;
        const entry = getEmpireResourceDeficit(resource);
        if (!entry || !shouldProcureResource(resource, entry)) continue;
        const source = getSourceMineral(resource);
        entry.mining = !!(source && isActivelyMiningMineral(source));
        entry.extreme = isExtremeShortage(entry);
        candidates.push(entry);
    }

    candidates.sort((a, b) => b.urgency - a.urgency);
    return candidates;
}

function runHousekeeping(ctrl, globalOrders, myOrders) {
    if (!Memory._banker) Memory._banker = {};

    if (!state.lastRun['updates'] || state.lastRun['updates'] + 50 < Game.time) {
        ctrl.updateSpendingMoney();
        ctrl.pricingUpdate(globalOrders, myOrders);
        ctrl.orderCleanup(myOrders, globalOrders);
        const {pruneTerminalCaches} = require('termCache');
        pruneTerminalCaches();
        if (['shard0', 'shard1', 'shard2', 'shard3', 'shardX'].includes(Game.shard.name) && SELL_PIXELS) {
            ctrl.sellPixels();
        }
        state.lastRun['updates'] = Game.time;
    }
}

function runActiveMarket(ctrl, globalOrders, options = {}) {
    const terminal = ctrl.room.terminal;
    // Fire sales and surplus deals must run even when MY_MINERALS is empty.
    if (ctrl.quickSell(terminal, globalOrders)) return true;
    if (ctrl.sellSurplus(terminal, globalOrders)) return true;
    // Don't buy into a stuffed room. Skip bargain buys when we have surplus to sell.
    if (options.skipBuys || ctrl.isCapacityPressured(ctrl.room)) return false;
    if (!isMarketHub(ctrl.room.name)) return false;
    if (!_.size(MY_MINERALS)) return false;
    return ctrl.dealFinder(terminal, globalOrders);
}

function runPassiveMarket(ctrl, globalOrders, myOrders, options = {}) {
    const terminal = ctrl.room.terminal;
    // Pressure orders first, and never buy into an already-stuffed room.
    if (ctrl.isCapacityPressured(ctrl.room)) {
        return ctrl.placePressureSellOrders(terminal, myOrders)
            || ctrl.placeSellOrders(terminal, globalOrders, myOrders);
    }
    const listed = ctrl.placeSellOrders(terminal, globalOrders, myOrders);
    if (options.skipBuys || !isMarketHub(ctrl.room.name) || !_.size(MY_MINERALS)) return listed;
    return listed || ctrl.placeBuyOrders(terminal, globalOrders, myOrders);
}

profiler.registerObject({
    selectMarketHub,
    isMarketHub,
    getInboundPlannedAmount,
    getEmpireBuyCandidates,
    shouldProcureResource,
    isMarketProcureResource,
    isActivelyMiningMineral,
    runHousekeeping,
    runActiveMarket,
    runPassiveMarket,
}, 'TermMarket');

module.exports = {
    selectMarketHub,
    isMarketHub,
    getInboundPlannedAmount,
    getEmpireBuyCandidates,
    shouldProcureResource,
    isMarketProcureResource,
    isActivelyMiningMineral,
    isCompressedBar,
    getSourceMineral,
    maxBarBuyPrice,
    barPriceBeatsRaw,
    EXTREME_SHORTAGE_RATIO,
    runHousekeeping,
    runActiveMarket,
    runPassiveMarket,
};