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

function pruneTerminalCaches() {
    const roomSet = new Set(MY_ROOMS);
    for (const name in state.lastRun) {
        if (name !== 'updates' && !roomSet.has(name)) delete state.lastRun[name];
    }
    for (const name in state.usedTerminals) {
        if (!roomSet.has(name)) delete state.usedTerminals[name];
    }
}

function getDerivedCommodityAmount(room, mineral) {
    const equivalence = buildEquivalenceMap();
    let total = 0;
    for (const product of Object.keys(equivalence)) {
        for (const {base, ratio} of equivalence[product]) {
            if (base !== mineral) continue;
            total += (room.store(product) || 0) * ratio;
        }
    }
    return total;
}

module.exports = {

    getCachedGlobalOrders,

    pruneTerminalCaches,

    getDerivedCommodityAmount,

};