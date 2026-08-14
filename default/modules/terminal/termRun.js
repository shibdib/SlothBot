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
        if (pressured || looksLikeHub || !state.ledger) getLedger(true);

        const hub = isMarketHub(roomName);
        const needsMarket = hub || pressured;
        const globalOrders = needsMarket ? this.getGlobalOrders() : null;
        const myOrders = hub ? getCachedMyOrders() : null;

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
            t.from === roomName && ['urgent', 'pressure', 'battery', 'energy', 'resource', 'ally'].includes(t.kind)
        );
        if (this.emergencyEnergy(terminal)) return;
        if (!hub && !hasPriorityOutbound && this.executePlannedTransfers(terminal, {kinds: ['hub']})) return;
        if (this.executePlannedTransfers(terminal)) return;

        // Active market — hub and pressured rooms only. Healthy satellites transfer.
        if (needsMarket && runActiveMarket(this, globalOrders)) return;

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