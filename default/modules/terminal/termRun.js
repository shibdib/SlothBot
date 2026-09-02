/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Terminal tick orchestration.

 */


const state = require('termState');
const {getLedger} = require('termNetwork');

const {getCachedGlobalOrders, getCachedMyOrders} = require('termCache');
const {isMarketHub, runHousekeeping, runActiveMarket, runPassiveMarket} = require('termMarket');

const TerminalControl = require('termClass');


Object.assign(TerminalControl.prototype, {

    run() {
        if (!this.room.terminal) return;

        const pressured = this.isCapacityPressured(this.room);
        // Pressured rooms run every 5 ticks so multi-hundred-k piles can drain;
        // healthy rooms keep the cheaper 25-tick cadence.
        const cooldown = pressured ? 5 : 25;
        const roomName = this.room.name;
        const phase = ((roomName.charCodeAt(1) || 0) + (roomName.charCodeAt(3) || 0)) % cooldown;
        if (Game.time % cooldown !== phase) return;
        if (state.lastRun[roomName] && state.lastRun[roomName] + cooldown > Game.time) return;

        state.lastRun[roomName] = Game.time;

        if (!Memory._banker) Memory._banker = {};
        if (Memory._banker.spendingAccount == null) {
            Memory._banker.spendingAccount = Math.max(0, Game.market.credits - CREDIT_BUFFER);
        }

        const looksLikeHub = Memory._banker.marketHub === roomName;
        // Only the hub force-rebuilds. Pressured satellites reuse the plan (25-tick TTL).
        if (looksLikeHub || !state.ledger) getLedger(true);
        else getLedger();

        const hub = isMarketHub(roomName);
        const seasonNoMarket = typeof IS_SEASON !== 'undefined' && IS_SEASON;
        const globalOrders = seasonNoMarket ? [] : this.getGlobalOrders();
        const myOrders = seasonNoMarket ? {} : getCachedMyOrders();

        if (hub && !seasonNoMarket) {
            this.pruneNonHubOrders(myOrders);
            runHousekeeping(this, globalOrders, myOrders);
        }

        const terminal = this.room.terminal;

        // Overfull rooms: list sell orders (no cooldown), then evacuate, then fire-sale.
        if (pressured) {
            if (!seasonNoMarket) this.placePressureSellOrders(terminal, myOrders);
            if (this.relieveStoragePressure(terminal)) return;
            if (!seasonNoMarket && runActiveMarket(this, globalOrders)) return;
        }

        const NETWORK_PRIORITY = ['urgent', 'pressure', 'battery', 'energy', 'ally'];
        const planned = state.ledger?.plannedTransfers || [];
        const hasPriorityOutbound = planned.some(t =>
            t.from === roomName && NETWORK_PRIORITY.concat('resource').includes(t.kind)
        );
        if (this.emergencyEnergy(terminal)) return;
        if (!hub && !hasPriorityOutbound && this.executePlannedTransfers(terminal, {kinds: ['hub']})) return;
        if (this.executePlannedTransfers(terminal, {kinds: NETWORK_PRIORITY})) return;

        // Hub surplus sells before keep-fills so the tick is not spent restocking satellites.
        if (!seasonNoMarket && hub && this.hasSellableSurplus(terminal)) {
            if (runActiveMarket(this, globalOrders, {skipBuys: true})) return;
            runPassiveMarket(this, globalOrders, myOrders);
            return;
        }

        if (this.executePlannedTransfers(terminal)) return;

        if (seasonNoMarket) return;
        if (runActiveMarket(this, globalOrders)) return;
        if (runPassiveMarket(this, globalOrders, myOrders)) return;
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