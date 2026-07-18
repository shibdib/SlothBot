/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Centralized terminal transfer planner and executor.
 */

const state = require('termState');
const {getRoomKeepAmount} = require('termKeep');
const {getDerivedCommodityAmount} = require('termCache');
const FactoryControl = require('module.factoryController');
const profiler = require('tools.profiler');

const RESOURCE_SEND_MAX = 5000;
const PRESSURE_SEND_MAX = 25000;
const RESOURCE_SEND_MIN = 100;
const ENERGY_SEND_MIN = 5000;
const PRESSURE_DEST_FREE_MIN = 5000;

// Pressure outranks hub/ally consolidation so overfull rooms evacuate first.
const PRIORITY_RANK = {urgent: 0, pressure: 1, battery: 2, energy: 3, resource: 4, ally: 5, hub: 6};

function isRoomCapacityPressured(room) {
    if (!room || !room.terminal) return false;
    if (room.terminal.store.getFreeCapacity() < TERMINAL_CAPACITY * 0.15) return true;
    const storage = room.storage;
    return !!(storage && storage.store.getFreeCapacity() < STORAGE_CAPACITY * 0.1);
}

function getRoomLabNeeds(room) {
    const needs = new Set();
    for (const lab of room.labs || []) {
        if (lab.memory && lab.memory.itemNeeded) needs.add(lab.memory.itemNeeded);
    }
    return needs;
}

function getRoomResourceDemand(room, resource) {
    let need = getRoomKeepAmount(room, resource);
    if (getRoomLabNeeds(room).has(resource)) need = Math.max(need, REACTION_AMOUNT);
    if (resource === RESOURCE_BATTERY) {
        need = Math.max(need, FactoryControl.factoryBatteryInboundNeed(room));
    }
    return need;
}

function getRoomEffective(room, resource) {
    let amount = room.store(resource) || 0;
    if (BASE_MINERALS.includes(resource)) amount += getDerivedCommodityAmount(room, resource);
    return amount;
}

function getTerminalExportable(room, resource, pressureRelief = false) {
    const terminal = room.terminal;
    if (!terminal || resource === RESOURCE_ENERGY) return 0;

    const keep = getRoomResourceDemand(room, resource);
    const inTerminal = terminal.store[resource] || 0;
    if (!inTerminal) return 0;

    const effective = getRoomEffective(room, resource);
    let available;
    if (pressureRelief) {
        available = Math.max(0, effective - keep);
        available = Math.min(available, inTerminal);
        return Math.min(available, PRESSURE_SEND_MAX);
    }
    if (!keep || effective < keep) return 0;
    available = Math.max(0, effective - keep);
    available = Math.min(available, inTerminal);
    return Math.min(available, RESOURCE_SEND_MAX);
}

function canUseTerminal(roomName) {
    return !state.usedTerminals[roomName] || state.usedTerminals[roomName].tick <= Game.time;
}

function txCost(from, to, amount) {
    return Game.market.calcTransactionCost(amount, from, to);
}

function scoreTransfer(need, cost, bonus = 0) {
    return need / (1 + cost) + bonus;
}

function addTransfer(transfers, transfer) {
    if (transfer.amount < (transfer.resource === RESOURCE_BATTERY ? 50 : RESOURCE_SEND_MIN)) return;
    transfers.push(transfer);
}

function planResourceTransfers(transfers, resource, profiles, options = {}) {
    const {pressureRelief = false, kind = 'resource', bonus = 0, sourceNames = null} = options;
    const {getInboundPlannedAmount} = require('termMarket');
    const deficits = [];

    for (const profile of profiles) {
        const room = Game.rooms[profile.name];
        if (!room?.terminal || !canUseTerminal(profile.name)) continue;
        const demand = getRoomResourceDemand(room, resource);
        if (!demand) continue;
        const effective = getRoomEffective(room, resource);
        const inbound = getInboundPlannedAmount(profile.name, resource, transfers);
        const need = demand - effective - inbound;
        if (need < RESOURCE_SEND_MIN) continue;
        deficits.push({name: profile.name, need, demand});
    }

    deficits.sort((a, b) => b.need - a.need);

    const exportable = [];
    for (const profile of profiles) {
        if (sourceNames && !sourceNames.has(profile.name)) continue;
        const room = Game.rooms[profile.name];
        if (!room?.terminal || !canUseTerminal(profile.name)) continue;
        const amount = getTerminalExportable(room, resource, pressureRelief);
        if (amount < RESOURCE_SEND_MIN) continue;
        exportable.push({name: profile.name, amount});
    }

    for (const dest of deficits) {
        const destRoom = Game.rooms[dest.name];
        const destFree = destRoom.terminal.store.getFreeCapacity(resource);
        if (destFree < RESOURCE_SEND_MIN) continue;

        const remaining = Math.min(dest.need, destFree, RESOURCE_SEND_MAX);
        const candidates = [];

        for (const src of exportable) {
            if (src.name === dest.name || src.amount < RESOURCE_SEND_MIN) continue;
            const amount = Math.min(remaining, src.amount, RESOURCE_SEND_MAX);
            if (amount < RESOURCE_SEND_MIN) continue;
            const cost = txCost(src.name, dest.name, amount);
            if (cost > amount * 0.25) continue;
            candidates.push({
                from: src.name,
                to: dest.name,
                resource,
                amount,
                kind,
                score: scoreTransfer(dest.need, cost, bonus),
            });
        }

        candidates.sort((a, b) => b.score - a.score);
        const best = candidates[0];
        if (!best) continue;

        addTransfer(transfers, best);
        const srcEntry = exportable.find(e => e.name === best.from);
        if (srcEntry) srcEntry.amount -= best.amount;
    }
}

function planUrgentTransfers(transfers, ledger, profiles) {
    for (const entry of ledger.urgent || []) {
        const destRoom = Game.rooms[entry.room];
        if (!destRoom?.terminal || !canUseTerminal(entry.room)) continue;
        const resource = entry.resource;
        if (resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) continue;

        const destFree = destRoom.terminal.store.getFreeCapacity(resource);
        const need = Math.min(entry.deficit, destFree, RESOURCE_SEND_MAX);
        if (need < RESOURCE_SEND_MIN) continue;

        const candidates = [];
        for (const profile of profiles) {
            if (profile.name === entry.room) continue;
            const room = Game.rooms[profile.name];
            if (!room?.terminal || !canUseTerminal(profile.name)) continue;
            const available = getTerminalExportable(room, resource);
            if (available < RESOURCE_SEND_MIN) continue;
            const amount = Math.min(need, available, RESOURCE_SEND_MAX);
            const cost = txCost(profile.name, entry.room, amount);
            if (cost > amount * 0.25) continue;
            candidates.push({
                from: profile.name,
                to: entry.room,
                resource,
                amount,
                kind: 'urgent',
                score: scoreTransfer(need, cost, 2),
            });
        }

        candidates.sort((a, b) => b.score - a.score);
        if (candidates[0]) addTransfer(transfers, candidates[0]);
    }
}

function planBatteryTransfers(transfers, profiles) {
    for (const profile of profiles) {
        const destRoom = Game.rooms[profile.name];
        if (!destRoom?.terminal || !destRoom.factory || !canUseTerminal(profile.name)) continue;
        if (destRoom.memory.dangerousAttack || !FactoryControl.roomNeedsBatteryInbound(destRoom)) continue;

        const need = FactoryControl.factoryBatteryInboundNeed(destRoom);
        const destFree = destRoom.terminal.store.getFreeCapacity(RESOURCE_BATTERY);
        const targetNeed = Math.min(need, destFree);
        if (targetNeed < 50) continue;

        const candidates = [];
        for (const srcProfile of profiles) {
            if (srcProfile.name === profile.name) continue;
            const srcRoom = Game.rooms[srcProfile.name];
            if (!srcRoom?.terminal || !canUseTerminal(srcProfile.name) || srcRoom.memory.dangerousAttack) continue;

            const keep = getRoomResourceDemand(srcRoom, RESOURCE_BATTERY);
            const surplus = Math.min(
                srcRoom.terminal.store[RESOURCE_BATTERY] || 0,
                Math.max(0, srcRoom.store(RESOURCE_BATTERY) - keep)
            );
            if (surplus < 50) continue;

            const amount = FactoryControl.terminalBatterySendAmount(Math.min(surplus, targetNeed), destFree);
            if (amount < 50) continue;
            const cost = txCost(srcProfile.name, profile.name, amount);
            if (cost > amount * 0.25) continue;

            const factoryBats = destRoom.factory?.store[RESOURCE_BATTERY] || 0;
            const terminalBats = destRoom.terminal.store[RESOURCE_BATTERY] || 0;
            const score = (destRoom.rawEnergy / FactoryControl.energyTarget(destRoom))
                + (need / FactoryControl.FACTORY_BATTERY_MAX)
                - (factoryBats / FactoryControl.FACTORY_BATTERY_MAX)
                - (keep ? terminalBats / keep : 0);

            candidates.push({
                from: srcProfile.name,
                to: profile.name,
                resource: RESOURCE_BATTERY,
                amount,
                kind: 'battery',
                score,
            });
        }

        candidates.sort((a, b) => b.score - a.score);
        if (candidates[0]) addTransfer(transfers, candidates[0]);
    }
}

function planEnergyTransfers(transfers, profiles) {
    for (const profile of profiles) {
        const destRoom = Game.rooms[profile.name];
        if (!destRoom?.terminal || !canUseTerminal(profile.name)) continue;
        if (!FactoryControl.needsBatteryUnpack(destRoom) && destRoom.energyState >= 2) continue;

        const destFree = destRoom.terminal.store.getFreeCapacity(RESOURCE_ENERGY);
        if (destFree < ENERGY_SEND_MIN) continue;

        const energyGap = Math.max(0, FactoryControl.energyTarget(destRoom) * 0.25 - destRoom.rawEnergy);
        const desired = Math.min(RESOURCE_SEND_MAX * 2, destFree, Math.max(ENERGY_SEND_MIN, Math.floor(energyGap)));

        const candidates = [];
        for (const srcProfile of profiles) {
            if (srcProfile.name === profile.name) continue;
            const srcRoom = Game.rooms[srcProfile.name];
            if (!srcRoom?.terminal || !canUseTerminal(srcProfile.name)) continue;
            if (srcRoom.memory.dangerousAttack || srcRoom.energyState < 2) continue;

            if (destRoom.factory && FactoryControl.roomNeedsBatteryInbound(destRoom) && srcRoom.terminal.store[RESOURCE_BATTERY]) {
                const bNeed = FactoryControl.factoryBatteryInboundNeed(destRoom);
                const bAmount = FactoryControl.terminalBatterySendAmount(
                    Math.min(srcRoom.terminal.store[RESOURCE_BATTERY] || 0, bNeed),
                    destRoom.terminal.store.getFreeCapacity(RESOURCE_BATTERY));
                if (bAmount >= 50) {
                    const cost = txCost(srcProfile.name, profile.name, bAmount);
                    if (cost <= bAmount * 0.25) {
                        candidates.push({
                            from: srcProfile.name,
                            to: profile.name,
                            resource: RESOURCE_BATTERY,
                            amount: bAmount,
                            kind: 'energy',
                            score: (destRoom.energyState < 1 ? 3 : 1) + bAmount / (1 + cost),
                        });
                    }
                }
            }

            const amount = terminalExportableEnergy(srcRoom.terminal, profile.name, desired);
            if (amount < ENERGY_SEND_MIN) continue;
            const cost = txCost(srcProfile.name, profile.name, amount);
            if (cost > amount * 0.25) continue;
            candidates.push({
                from: srcProfile.name,
                to: profile.name,
                resource: RESOURCE_ENERGY,
                amount,
                kind: 'energy',
                score: (amount - cost) / (1 + cost) + (destRoom.energyState < 1 ? 2 : 0),
            });
        }

        candidates.sort((a, b) => b.score - a.score);
        if (candidates[0]) addTransfer(transfers, candidates[0]);
    }
}

function allyWantsResource(resource) {
    if (!global.LOAN_CHECK || !ALLY_HELP_REQUESTS) return false;
    for (const username in ALLY_HELP_REQUESTS) {
        if (username === MY_USERNAME || !FRIENDLIES.includes(username)) continue;
        const reqs = ALLY_HELP_REQUESTS[username]?.requests?.resource || [];
        if (reqs.some(r => r.resourceType === resource)) return true;
    }
    return false;
}

function collectAllyTransferRequests() {
    if (!global.LOAN_CHECK || !ALLY_HELP_REQUESTS) return [];

    const requests = [];
    for (const username in ALLY_HELP_REQUESTS) {
        if (username === MY_USERNAME || !FRIENDLIES.includes(username)) continue;
        const ally = ALLY_HELP_REQUESTS[username];

        for (const entry of ally?.requests?.funnel || []) {
            if (!entry?.roomName) continue;
            requests.push({
                username,
                resourceType: RESOURCE_ENERGY,
                amount: entry.maxAmount || RESOURCE_SEND_MAX * 2,
                priority: 1,
                roomName: entry.roomName,
            });
        }

        for (const req of ally?.requests?.resource || []) {
            if (!req?.roomName || !req?.resourceType) continue;
            requests.push({
                username,
                resourceType: req.resourceType,
                amount: req.amount || RESOURCE_SEND_MAX,
                priority: req.priority || 0.5,
                roomName: req.roomName,
            });
        }
    }

    requests.sort((a, b) => b.priority - a.priority);
    return requests;
}

function planAllyTransfers(transfers, ledger, profiles) {
    const {canEmpireSell} = require('termNetwork');
    const requests = collectAllyTransferRequests();
    if (!requests.length) return;

    for (const request of requests) {
        const {username, resourceType, roomName, amount, priority} = request;
        const candidates = [];

        for (const profile of profiles) {
            const room = Game.rooms[profile.name];
            if (!room?.terminal || !canUseTerminal(profile.name) || room.memory.dangerousAttack) continue;

            if (resourceType === RESOURCE_ENERGY) {
                if (room.energyState < 2) continue;
                const sendAmount = terminalExportableEnergy(
                    room.terminal,
                    roomName,
                    Math.min(amount, RESOURCE_SEND_MAX * 2));
                if (sendAmount < ENERGY_SEND_MIN) continue;
                const cost = txCost(profile.name, roomName, sendAmount);
                if (cost > sendAmount * 0.25) continue;
                candidates.push({
                    from: profile.name,
                    to: roomName,
                    resource: RESOURCE_ENERGY,
                    amount: sendAmount,
                    kind: 'ally',
                    ally: username,
                    score: priority * sendAmount / (1 + cost),
                });
                continue;
            }

            if (resourceType === RESOURCE_BATTERY) continue;
            if (!canEmpireSell(resourceType, ledger)) continue;

            const available = getTerminalExportable(room, resourceType);
            const sendAmount = Math.min(available, RESOURCE_SEND_MAX, amount);
            if (sendAmount < RESOURCE_SEND_MIN) continue;

            const cost = txCost(profile.name, roomName, sendAmount);
            if (cost > sendAmount * 0.25) continue;
            candidates.push({
                from: profile.name,
                to: roomName,
                resource: resourceType,
                amount: sendAmount,
                kind: 'ally',
                ally: username,
                score: priority * sendAmount / (1 + cost),
            });
        }

        candidates.sort((a, b) => b.score - a.score);
        if (candidates[0]) addTransfer(transfers, candidates[0]);
    }
}

function planHubConsolidation(transfers, ledger, profiles) {
    const hub = ledger.marketHub;
    if (!hub) return;

    const hubRoom = Game.rooms[hub];
    if (!hubRoom?.terminal || !canUseTerminal(hub) || isRoomCapacityPressured(hubRoom)) return;

    const {canEmpireSell} = require('termNetwork');

    for (const profile of profiles) {
        if (profile.name === hub) continue;
        const room = Game.rooms[profile.name];
        if (!room?.terminal || !canUseTerminal(profile.name) || room.memory.dangerousAttack) continue;

        const pressured = isRoomCapacityPressured(room);
        for (const resource of Object.keys(room.terminal.store)) {
            if (resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) continue;
            if (resource === RESOURCE_OPS || resource === RESOURCE_POWER) continue;
            if (allyWantsResource(resource)) continue;
            // Pressured rooms may ship local surplus even when empire soft-keep blocks normal sells.
            if (!pressured && !canEmpireSell(resource, ledger)) continue;

            const amount = getTerminalExportable(room, resource, pressured);
            if (amount < RESOURCE_SEND_MIN) continue;

            const hubFree = hubRoom.terminal.store.getFreeCapacity(resource);
            if (hubFree < RESOURCE_SEND_MIN) continue;

            const sendAmount = Math.min(amount, hubFree, pressured ? PRESSURE_SEND_MAX : RESOURCE_SEND_MAX);
            const cost = txCost(profile.name, hub, sendAmount);
            if (cost > sendAmount * (pressured ? 0.35 : 0.25)) continue;

            addTransfer(transfers, {
                from: profile.name,
                to: hub,
                resource,
                amount: sendAmount,
                kind: pressured ? 'pressure' : 'hub',
                score: scoreTransfer(sendAmount, cost, pressured ? 2 : 0.5),
            });
        }
    }
}

/**
 * Evacuate pressured rooms to ANY non-pressured terminal with free space.
 * Demand-based balancing alone cannot clear rooms full of resources everyone already has
 * (e.g. 440k UH sitting in a non-hub storage).
 */
function planPressureTransfers(transfers, profiles) {
    const pressured = [];
    for (const profile of profiles) {
        const room = Game.rooms[profile.name];
        if (!room?.terminal || !canUseTerminal(profile.name)) continue;
        if (!isRoomCapacityPressured(room)) continue;
        pressured.push(profile.name);
    }
    if (!pressured.length) return;

    for (const srcName of pressured) {
        const srcRoom = Game.rooms[srcName];
        if (!srcRoom?.terminal) continue;

        const resources = Object.keys(srcRoom.terminal.store)
            .filter(r => r !== RESOURCE_ENERGY && r !== RESOURCE_BATTERY && r !== RESOURCE_OPS && r !== RESOURCE_POWER)
            .sort((a, b) => (srcRoom.terminal.store[b] || 0) - (srcRoom.terminal.store[a] || 0));

        for (const resource of resources) {
            const amount = getTerminalExportable(srcRoom, resource, true);
            if (amount < RESOURCE_SEND_MIN) continue;

            const candidates = [];
            for (const profile of profiles) {
                if (profile.name === srcName) continue;
                const destRoom = Game.rooms[profile.name];
                if (!destRoom?.terminal || !canUseTerminal(profile.name)) continue;
                if (isRoomCapacityPressured(destRoom)) continue;

                const destFree = destRoom.terminal.store.getFreeCapacity(resource);
                if (destFree < PRESSURE_DEST_FREE_MIN) continue;

                const sendAmount = Math.min(amount, destFree, PRESSURE_SEND_MAX);
                if (sendAmount < RESOURCE_SEND_MIN) continue;
                const cost = txCost(srcName, profile.name, sendAmount);
                // Slightly more lenient than normal balancing (0.25 → 0.35).
                if (cost > sendAmount * 0.35) continue;

                const demand = getRoomResourceDemand(destRoom, resource);
                const effective = getRoomEffective(destRoom, resource);
                const underKeep = demand ? Math.max(0, demand - effective) : 0;
                candidates.push({
                    from: srcName,
                    to: profile.name,
                    resource,
                    amount: sendAmount,
                    kind: 'pressure',
                    score: scoreTransfer(underKeep || destFree, cost, underKeep ? 3 : 1) + sendAmount / 5000,
                });
            }

            candidates.sort((a, b) => b.score - a.score);
            if (candidates[0]) {
                addTransfer(transfers, candidates[0]);
                // One outbound pressure plan per source room is enough; only one send/tick executes.
                break;
            }
        }
    }
}

function planTransfers(ledger) {
    const profiles = MY_ROOMS
        .map(name => Game.rooms[name])
        .filter(room => room && room.terminal)
        .map(room => ({name: room.name}));

    if (!profiles.length) return [];

    const resources = Object.keys(ledger.demand || {});
    const transfers = [];

    planUrgentTransfers(transfers, ledger, profiles);
    // Evacuate overfull rooms before normal battery/energy/resource balancing.
    planPressureTransfers(transfers, profiles);
    planBatteryTransfers(transfers, profiles);
    planEnergyTransfers(transfers, profiles);

    for (const resource of resources) {
        if (resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) continue;
        planResourceTransfers(transfers, resource, profiles);
    }

    planAllyTransfers(transfers, ledger, profiles);
    planHubConsolidation(transfers, ledger, profiles);

    transfers.sort((a, b) => {
        const rank = (PRIORITY_RANK[a.kind] || 9) - (PRIORITY_RANK[b.kind] || 9);
        if (rank !== 0) return rank;
        return b.score - a.score;
    });

    return transfers;
}

function recordTransferEnergyCost(terminal, resource, amount, destRoom) {
    const txCost = Game.market.calcTransactionCost(amount, terminal.room.name, destRoom);
    const energyCost = (resource === RESOURCE_ENERGY ? amount : 0) + txCost;
    Memory.terminalEnergyExpense = Memory.terminalEnergyExpense || {};
    const rn = terminal.room.name;
    Memory.terminalEnergyExpense[rn] = (Memory.terminalEnergyExpense[rn] || 0) + energyCost;
    const {recordSendCost} = require('termBudget');
    recordSendCost(energyCost);
    return txCost;
}

function markTerminalsUsed(from, to, resource) {
    state.usedTerminals[from] = {tick: Game.time};
    state.usedTerminals[to] = {tick: Game.time + (resource === RESOURCE_BATTERY ? 500 : 50)};
}

function executeTransfer(terminal, transfer) {
    const {to, resource, amount} = transfer;
    if (terminal.pos.roomName !== transfer.from) return false;
    if (!canUseTerminal(to)) return false;
    if (terminal.room.memory.dangerousAttack && transfer.kind !== 'urgent') return false;

    const txCost = Game.market.calcTransactionCost(amount, terminal.room.name, to);
    const energyCost = (resource === RESOURCE_ENERGY ? amount : 0) + txCost;
    const {canAffordSend} = require('termBudget');
    const emergency = transfer.kind === 'pressure' || transfer.kind === 'urgent';
    if (!canAffordSend(energyCost, {emergency})) return false;

    if (terminal.send(resource, amount, to) !== OK) return false;

    recordTransferEnergyCost(terminal, resource, amount, to);
    markTerminalsUsed(terminal.room.name, to, resource);

    const label = transfer.kind === 'pressure' ? 'Pressure relief'
        : transfer.kind === 'hub' ? 'Hub feed'
            : transfer.kind === 'ally' ? `Ally ${transfer.ally}` : 'Balancing';
    const msg = `${label}: ${amount} ${resource} to ${roomLink(to)} from ${roomLink(terminal.room.name)}`;
    if (transfer.kind === 'ally') log.a(msg, 'Market: ');
    else if (resource === RESOURCE_ENERGY && transfer.kind === 'energy') log.i(msg, 'Market: ');
    else log.a(msg, 'Market: ');
    return true;
}

function executePlannedTransfers(terminal, options = {}) {
    if (!canUseTerminal(terminal.room.name)) return false;

    const transfers = state.ledger?.plannedTransfers || [];

    const allowedKinds = options.kinds;
    const myTransfers = transfers.filter(t => {
        if (t.from !== terminal.room.name) return false;
        if (allowedKinds && !allowedKinds.includes(t.kind)) return false;
        return true;
    });

    for (const transfer of myTransfers) {
        if (executeTransfer(terminal, transfer)) return true;
    }

    return false;
}

profiler.registerObject({planTransfers, executePlannedTransfers, executeTransfer}, 'TermTransfers');

module.exports = {
    planTransfers,
    executePlannedTransfers,
    getRoomResourceDemand,
    getRoomEffective,
    canUseTerminal,
    markTerminalsUsed,
    recordTransferEnergyCost,
    isRoomCapacityPressured,
};