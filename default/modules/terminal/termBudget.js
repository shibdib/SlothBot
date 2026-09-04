/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Empire-wide terminal send energy budget and market credit budget.
 */

const state = require('termState');
const profiler = require('tools.profiler');

const BUDGET_BASE = 60000;
const BUDGET_PER_TERMINAL = 15000;
const BUDGET_MIN = 20000;
const BUDGET_ENERGY_FRACTION = 0.35;

const CREDIT_FLOOR_FRACTION = 0.5;
const CREDIT_SPEND_WINDOW = 1000;
const CREDIT_SPEND_FRACTION = 0.005;
const CREDIT_SPEND_CAP = 1000000;

function getCreditFloor() {
    const credits = Game.market.credits || 0;
    const configured = typeof CREDIT_BUFFER !== 'undefined' ? CREDIT_BUFFER : 5000000;
    return Math.max(configured, Math.floor(credits * CREDIT_FLOOR_FRACTION));
}

function getSpendingAccount() {
    return Math.max(0, (Game.market.credits || 0) - getCreditFloor());
}

function getCreditBudget() {
    if (!Memory._banker) Memory._banker = {};
    const budget = Memory._banker.creditBudget;
    if (!budget || budget.tick + CREDIT_SPEND_WINDOW <= Game.time) {
        const credits = Game.market.credits || 0;
        Memory._banker.creditBudget = {
            tick: Game.time,
            total: Math.min(Math.floor(credits * CREDIT_SPEND_FRACTION), CREDIT_SPEND_CAP),
            spent: 0,
        };
    }
    return Memory._banker.creditBudget;
}

function canAffordCredits(cost, options = {}) {
    if (!cost) return true;
    const credits = Game.market.credits || 0;
    const floor = options.floor != null ? options.floor : getCreditFloor();
    if (credits - cost < floor) return false;
    if (options.emergency) return true;
    const trend = Memory._banker && Memory._banker.creditTrend;
    if (trend < 0 && !options.allowNegativeTrend) return false;
    const budget = getCreditBudget();
    return budget.spent + cost <= budget.total;
}

function recordCreditSpend(cost) {
    if (!cost) return;
    const budget = getCreditBudget();
    budget.spent += cost;
    if (Memory._banker && Memory._banker.spendingAccount != null) {
        Memory._banker.spendingAccount = Math.max(0, Memory._banker.spendingAccount - cost);
    }
}

function buildSendBudget() {
    let terminalRooms = 0;
    let totalTerminalEnergy = 0;

    for (const name of MY_ROOMS) {
        const room = Game.rooms[name];
        if (!room?.terminal) continue;
        terminalRooms++;
        totalTerminalEnergy += room.terminal.store[RESOURCE_ENERGY] || 0;
    }

    let prevExpense = 0;
    const prev = global.prevTickTerminalEnergyExpense || {};
    for (const r in prev) prevExpense += prev[r] || 0;

    const scaled = BUDGET_BASE + terminalRooms * BUDGET_PER_TERMINAL;
    const energyCap = Math.floor(totalTerminalEnergy * BUDGET_ENERGY_FRACTION);
    let total;
    if (energyCap > 0) {
        total = Math.min(scaled, energyCap);
        total = Math.max(total, Math.min(BUDGET_MIN, energyCap));
    } else if (terminalRooms) {
        total = Math.min(scaled, BUDGET_MIN);
    } else {
        total = BUDGET_MIN;
    }

    if (prevExpense > total * 0.8) total = Math.floor(total * 0.85);

    return {tick: Game.time, total, spent: 0};
}

function canAffordSend(energyCost, options = {}) {
    if (!energyCost) return true;
    // Capacity evacuation must not stall because the empire already spent the soft budget.
    if (options.emergency) return true;
    const budget = state.ledger?.sendBudget;
    if (!budget) return true;
    return budget.spent + energyCost <= budget.total;
}

function recordSendCost(energyCost) {
    const budget = state.ledger?.sendBudget;
    if (!budget || !energyCost) return;
    budget.spent += energyCost;
}

function recordMarketEnergyCost(roomName, energyCost) {
    if (!energyCost) return;
    if (global.bumpEnergyExpense) global.bumpEnergyExpense('terminal', roomName, energyCost);
    recordSendCost(energyCost);
}

profiler.registerObject({
    buildSendBudget,
    canAffordSend,
    recordSendCost,
    recordMarketEnergyCost,
    getCreditFloor,
    getSpendingAccount,
    canAffordCredits,
    recordCreditSpend,
}, 'TermBudget');

module.exports = {
    buildSendBudget,
    canAffordSend,
    recordSendCost,
    recordMarketEnergyCost,
    getCreditFloor,
    getSpendingAccount,
    canAffordCredits,
    recordCreditSpend,
};