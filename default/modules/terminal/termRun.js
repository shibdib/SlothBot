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
        if (!this.room.terminal) return;

        const pressured = this.isCapacityPressured(this.room);
        // Pressured rooms run every 5 ticks so multi-hundred-k piles can drain;
        // healthy rooms keep the cheaper 25-tick cadence.
        const cooldown = pressured ? 5 : 25;
        if (state.lastRun[this.room.name] && state.lastRun[this.room.name] + cooldown > Game.time) return;

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

        // Overfull rooms: evacuate via planned pressure sends, then fire-sale, before
        // normal balancing/hub feed can consume the terminal action for the tick.
        if (pressured) {
            if (this.relieveStoragePressure(terminal)) return;
            if (runActiveMarket(this, globalOrders)) return;
        }

        // Internal network before market — route empire stock first.
        const planned = state.ledger?.plannedTransfers || [];
        const hasPriorityOutbound = planned.some(t =>
            t.from === this.room.name && ['urgent', 'pressure', 'battery', 'energy', 'resource', 'ally'].includes(t.kind)
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
        return (Memory._banker && Memory._banker.creditTrend != null)
            ? Memory._banker.creditTrend
            : 0;
    }

});