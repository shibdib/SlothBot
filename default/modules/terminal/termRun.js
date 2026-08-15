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
        const globalOrders = hub ? this.getGlobalOrders() : null;
        const myOrders = hub ? getCachedMyOrders() : null;

        if (hub) {
            this.pruneNonHubOrders(myOrders);
            runHousekeeping(this, globalOrders, myOrders);
        }

        const terminal = this.room.terminal;

        // Overfull rooms: evacuate via planned pressure sends first.
        // Fire-sale is hub-only so stuffed satellites do not parse the market.
        // Sell orders do not consume the terminal action — list first so a
        // 4.5k-energy terminal can still shed stock while also sending/dealing.
        if (pressured) {
            if (hub) this.placePressureSellOrders(terminal, myOrders);
            if (this.relieveStoragePressure(terminal)) return;
            if (hub && runActiveMarket(this, globalOrders)) return;
        }

        // Internal network before market — route empire stock first.
        const planned = state.ledger?.plannedTransfers || [];
        const hasPriorityOutbound = planned.some(t =>
            t.from === roomName && ['urgent', 'pressure', 'battery', 'energy', 'resource', 'ally'].includes(t.kind)
        );
        if (this.emergencyEnergy(terminal)) return;
        if (!hub && !hasPriorityOutbound && this.executePlannedTransfers(terminal, {kinds: ['hub']})) return;
        if (this.executePlannedTransfers(terminal)) return;

        if (hub && runActiveMarket(this, globalOrders)) return;
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