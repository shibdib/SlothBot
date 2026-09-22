/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Global order cache and terminal cache pruning.

 */


const state = require('termState');
const {buildEquivalenceMap} = require('termNetwork');


const GLOBAL_ORDERS_TTL = 50;

function indexGlobalOrders(orders) {
    const byResource = Object.create(null);
    const myRooms = new Set(typeof MY_ROOMS !== 'undefined' && MY_ROOMS ? MY_ROOMS : []);
    const list = orders || [];
    for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (!o || !o.resourceType) continue;
        let bucket = byResource[o.resourceType];
        if (!bucket) bucket = byResource[o.resourceType] = {buy: [], sell: []};
        if (o.type === ORDER_BUY) bucket.buy.push(o);
        else if (o.type === ORDER_SELL) bucket.sell.push(o);
    }
    return {byResource: byResource, myRooms: myRooms};
}

function getCachedGlobalOrders() {
    if (state.globalOrdersCache.orders && state.globalOrdersCache.tick + GLOBAL_ORDERS_TTL > Game.time) {
        return state.globalOrdersCache.orders;
    }
    const t0 = Game.cpu.getUsed();
    state.globalOrdersCache.tick = Game.time;
    state.globalOrdersCache.orders = Game.market.getAllOrders();
    if (typeof noteMarketCpu === 'function') noteMarketCpu(Game.cpu.getUsed() - t0);
    state.globalOrdersCache.index = indexGlobalOrders(state.globalOrdersCache.orders);
    state.globalOrdersCache.indexTick = Game.time;
    return state.globalOrdersCache.orders;
}

function getOrdersIndex() {
    const cache = state.globalOrdersCache;
    if (!cache.orders) getCachedGlobalOrders();
    if (!cache.index || cache.indexTick !== cache.tick) {
        cache.index = indexGlobalOrders(cache.orders || []);
        cache.indexTick = cache.tick;
    }
    return cache.index;
}

/** Orders for one resource/type. Foreign-only skips our own rooms. */
function ordersFor(resource, type, foreignOnly) {
    const idx = getOrdersIndex();
    const bucket = idx.byResource[resource];
    if (!bucket) return [];
    const list = type === ORDER_BUY ? bucket.buy : bucket.sell;
    if (!foreignOnly) return list;
    const my = idx.myRooms;
    const out = [];
    for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (o.roomName && my.has(o.roomName)) continue;
        out.push(o);
    }
    return out;
}

function getCachedMyOrders() {
    if (state.myOrdersCache.tick !== Game.time) {
        state.myOrdersCache.tick = Game.time;
        // Copy so same-tick creates can be recorded without mutating Game.market.orders.
        // createOrder does not appear in Game.market.orders until the following tick.
        const orders = {};
        const live = Game.market.orders;
        for (const id in live) orders[id] = live[id];
        state.myOrdersCache.orders = orders;
    }
    return state.myOrdersCache.orders;
}

function hasRoomOrder(myOrders, roomName, resourceType, type) {
    const orders = myOrders || getCachedMyOrders();
    if (!orders) return false;
    for (const id in orders) {
        const order = orders[id];
        if (order && order.roomName === roomName && order.resourceType === resourceType && order.type === type) {
            return true;
        }
    }
    return false;
}

function hasEmpireOrder(myOrders, resourceType, type) {
    const orders = myOrders || getCachedMyOrders();
    if (!orders) return false;
    for (const id in orders) {
        const order = orders[id];
        if (order && order.resourceType === resourceType && order.type === type
            && order.roomName && MY_ROOMS.includes(order.roomName)) {
            return true;
        }
    }
    return false;
}

function recordCreatedOrder(order) {
    if (!order || !order.roomName || !order.resourceType || !order.type) return;
    const orders = getCachedMyOrders();
    const id = `pending_${order.roomName}_${order.type}_${order.resourceType}`;
    orders[id] = {
        id,
        type: order.type,
        resourceType: order.resourceType,
        roomName: order.roomName,
        price: order.price,
        remainingAmount: order.totalAmount,
        amount: order.totalAmount,
        totalAmount: order.totalAmount,
        active: true,
        pending: true,
        created: Game.time
    };
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

    getOrdersIndex,

    ordersFor,

    hasRoomOrder,

    hasEmpireOrder,

    recordCreatedOrder,

    pruneTerminalCaches,

    getDerivedCommodityAmount,

};