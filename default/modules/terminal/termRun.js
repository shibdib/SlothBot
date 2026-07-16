/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Terminal tick orchestration.

 */


const state = require('termState');

const {getCachedGlobalOrders} = require('termCache');
const {isMarketHub, runHousekeeping, runActiveMarket, runPassiveMarket} = require('termMarket');

const TerminalControl = require('termClass');


Object.assign(TerminalControl.prototype, {

    run() {
        if (!this.room.terminal || (state.lastRun[this.room.name] && state.lastRun[this.room.name] + 25 > Game.time)) return;

        state.lastRun[this.room.name] = Game.time;

        if (!Memory._banker) Memory._banker = {};
        if (Memory._banker.spendingAccount == null) {
            Memory._banker.spendingAccount = Math.max(0, Game.market.credits - CREDIT_BUFFER);
        }

        const hub = isMarketHub(this.room.name);
        const globalOrders = this.getGlobalOrders();
        const myOrders = Game.market.orders;

        if (hub) {
            this.pruneNonHubOrders(myOrders);
            runHousekeeping(this, globalOrders, myOrders);
        }

        const terminal = this.room.terminal;
        const storage = terminal.room.storage;
        const terminalPressure = terminal.store.getFreeCapacity() < TERMINAL_CAPACITY * 0.1;
        const storagePressure = storage && storage.store.getFreeCapacity() < STORAGE_CAPACITY * 0.1;
        if (terminalPressure || storagePressure) {
            if (this.relieveStoragePressure(terminal)) return;
        }

        // Internal network before market — route empire stock first.
        const planned = state.ledger?.plannedTransfers || [];
        const hasPriorityOutbound = planned.some(t =>
            t.from === this.room.name && ['urgent', 'battery', 'energy', 'resource', 'ally'].includes(t.kind)
        );
        if (this.emergencyEnergy(terminal)) return;
        if (!hub && !hasPriorityOutbound && this.executePlannedTransfers(terminal, {kinds: ['hub']})) return;
        if (this.executePlannedTransfers(terminal)) return;

        // Active market (deals, fire sales) — any room, after transfers.
        if (runActiveMarket(this, globalOrders)) return;

        // Passive orders — hub only, avoids duplicate buy/sell orders empire-wide.
        if (hub && runPassiveMarket(this, globalOrders, myOrders)) return;
    },

    getGlobalOrders() {
        return this.globalOrders || (this.globalOrders = getCachedGlobalOrders());
    },

    getCreditTrend() {
        return Memory._banker && Memory._banker.creditTrend ? Memory._banker.creditTrend : 0;
    }

});