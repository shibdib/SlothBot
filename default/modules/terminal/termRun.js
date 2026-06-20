/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Terminal tick orchestration.

 */


const state = require('termState');

const {pruneTerminalCaches, getCachedGlobalOrders} = require('termCache');

const TerminalControl = require('termClass');


Object.assign(TerminalControl.prototype, {

    run() {
        if (!this.room.terminal || (state.lastRun[this.room.name] && state.lastRun[this.room.name] + 25 > Game.time)) return;

        if (!Memory._banker) Memory._banker = {};

        state.lastRun[this.room.name] = Game.time;

        const terminal = this.room.terminal;
        const myOrders = Game.market.orders;
        const globalOrders = this.getGlobalOrders();

        if (!state.lastRun['updates'] || state.lastRun['updates'] + 50 < Game.time) {
            this.updateSpendingMoney();
            this.pricingUpdate(globalOrders, myOrders);
            this.orderCleanup(myOrders);
            pruneTerminalCaches();
            if (['shard0', 'shard1', 'shard2', 'shard3', 'shardX'].includes(Game.shard.name) && SELL_PIXELS) this.sellPixels();
            state.lastRun['updates'] = Game.time;
        }

        const storage = terminal.room.storage;
        const terminalPressure = terminal.store.getFreeCapacity() < TERMINAL_CAPACITY * 0.1;
        const storagePressure = storage && storage.store.getFreeCapacity() < STORAGE_CAPACITY * 0.1;
        if (terminalPressure || storagePressure) {
            if (this.relieveStoragePressure(terminal)) return;
        }

        // Market (requires mineral tracking). Deals and instant sells before passive sell orders.
        if (_.size(MY_MINERALS)) {
            if (this.dealFinder(terminal, globalOrders)
                || this.quickSell(terminal, globalOrders)
                || this.placeSellOrders(terminal, globalOrders, myOrders)
                || this.placeBuyOrders(terminal, globalOrders, myOrders)) return;
        }

        if (this.emergencyEnergy(terminal) || this.balanceEnergy(terminal) || this.balanceBatteries(terminal) || this.balanceResources(terminal)) return;
    },

    getGlobalOrders() {
        return this.globalOrders || (this.globalOrders = getCachedGlobalOrders());
    },

    getCreditTrend() {
        return Memory._banker && Memory._banker.creditTrend ? Memory._banker.creditTrend : 0;
    }

});