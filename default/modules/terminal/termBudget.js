/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Empire-wide terminal send energy budget (Phase 5).
 */

const state = require('termState');
const profiler = require('tools.profiler');

const BUDGET_BASE = 60000;
const BUDGET_PER_TERMINAL = 15000;
const BUDGET_MIN = 20000;
const BUDGET_ENERGY_FRACTION = 0.35;

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
}, 'TermBudget');

module.exports = {
    buildSendBudget,
    canAffordSend,
    recordSendCost,
    recordMarketEnergyCost,
};