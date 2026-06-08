/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Global order cache and terminal cache pruning.

 */


const state = require('termState');


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
    const key = Object.keys(COMMODITIES).find(k => COMMODITIES[k].components && COMMODITIES[k].components[mineral]);
    if (!key) return 0;
    return (room.store(key) || 0) * 5;
}

module.exports = {

    getCachedGlobalOrders,

    pruneTerminalCaches,

    getDerivedCommodityAmount,

};