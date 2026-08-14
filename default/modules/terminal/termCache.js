/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Global order cache and terminal cache pruning.

 */


const state = require('termState');
const {buildEquivalenceMap} = require('termNetwork');


function getCachedGlobalOrders() {
    if (state.globalOrdersCache.tick !== Game.time) {
        state.globalOrdersCache.tick = Game.time;
        state.globalOrdersCache.orders = Game.market.getAllOrders();
    }
    return state.globalOrdersCache.orders;
}

function getCachedMyOrders() {
    if (state.myOrdersCache.tick !== Game.time) {
        state.myOrdersCache.tick = Game.time;
        state.myOrdersCache.orders = Game.market.orders;
    }
    return state.myOrdersCache.orders;
}

function pruneTerminalCaches() {
    const roomSet = new Set(MY_ROOMS);
    for (const name in state.lastRun) {
        if (name !== 'updates' && !roomSet.has(name)) delete state.lastRun[name];
    }
    for (const name in state.usedTerminals) {
        if (!roomSet.has(name)) delete state.usedTerminals[name];
    }
}

function derivedCommodityTotals(room) {
    if (!room) return Object.create(null);
    if (room._derivedCommodityTick === Game.time) return room._derivedCommodity;
    const equivalence = buildEquivalenceMap();
    const totals = Object.create(null);
    for (const product of Object.keys(equivalence)) {
        const qty = room.store(product) || 0;
        if (!qty) continue;
        const entries = equivalence[product];
        for (let i = 0; i < entries.length; i++) {
            const {base, ratio} = entries[i];
            totals[base] = (totals[base] || 0) + qty * ratio;
        }
    }
    room._derivedCommodity = totals;
    room._derivedCommodityTick = Game.time;
    return totals;
}

function getDerivedCommodityAmount(room, mineral) {
    return derivedCommodityTotals(room)[mineral] || 0;
}

module.exports = {

    getCachedGlobalOrders,

    getCachedMyOrders,

    pruneTerminalCaches,

    getDerivedCommodityAmount,

};