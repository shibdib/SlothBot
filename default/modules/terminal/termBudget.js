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

    return {tick: Game.time, total, spent: 0, reserved: 0};
}

function estimateTransferCost(transfer) {
    const tx = Game.market.calcTransactionCost(transfer.amount, transfer.from, transfer.to);
    return (transfer.resource === RESOURCE_ENERGY ? transfer.amount : 0) + tx;
}

function reserveSendBudget(budget, transfers) {
    if (!budget || !transfers?.length) return;
    const rank = {urgent: 0, battery: 1, energy: 2, resource: 3, hub: 4, pressure: 5};
    const sorted = transfers.slice().sort((a, b) => (rank[a.kind] || 9) - (rank[b.kind] || 9));

    let reserved = 0;
    for (let i = 0; i < sorted.length; i++) {
        const cost = estimateTransferCost(sorted[i]);
        if (reserved + cost <= budget.total) reserved += cost;
    }
    budget.reserved = reserved;
}

function canAffordSend(energyCost) {
    const budget = state.ledger?.sendBudget;
    if (!budget || !energyCost) return true;
    return budget.spent + energyCost <= budget.total;
}

function recordSendCost(energyCost) {
    const budget = state.ledger?.sendBudget;
    if (!budget || !energyCost) return;
    budget.spent += energyCost;
}

function recordMarketEnergyCost(roomName, energyCost) {
    if (!energyCost) return;
    Memory.terminalEnergyExpense = Memory.terminalEnergyExpense || {};
    Memory.terminalEnergyExpense[roomName] = (Memory.terminalEnergyExpense[roomName] || 0) + energyCost;
    recordSendCost(energyCost);
}

function getSendBudgetRemaining() {
    const budget = state.ledger?.sendBudget;
    if (!budget) return Infinity;
    return Math.max(0, budget.total - budget.spent);
}

profiler.registerObject({
    buildSendBudget,
    reserveSendBudget,
    canAffordSend,
    recordSendCost,
    recordMarketEnergyCost,
    getSendBudgetRemaining,
}, 'TermBudget');

module.exports = {
    buildSendBudget,
    reserveSendBudget,
    canAffordSend,
    recordSendCost,
    recordMarketEnergyCost,
    getSendBudgetRemaining,
    estimateTransferCost,
};