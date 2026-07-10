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
const RESOURCE_SEND_MIN = 100;
const ENERGY_SEND_MIN = 5000;

const PRIORITY_RANK = {urgent: 0, battery: 1, energy: 2, resource: 3, hub: 4, pressure: 5};

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
    } else {
        if (!keep || effective < keep) return 0;
        available = Math.max(0, effective - keep);
        available = Math.min(available, inTerminal);
    }
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

function planHubConsolidation(transfers, ledger, profiles) {
    const hub = ledger.marketHub;
    if (!hub) return;

    const hubRoom = Game.rooms[hub];
    if (!hubRoom?.terminal || !canUseTerminal(hub)) return;

    const {canEmpireSell} = require('termNetwork');

    for (const profile of profiles) {
        if (profile.name === hub) continue;
        const room = Game.rooms[profile.name];
        if (!room?.terminal || !canUseTerminal(profile.name) || room.memory.dangerousAttack) continue;

        for (const resource of Object.keys(room.terminal.store)) {
            if (resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) continue;
            if (!canEmpireSell(resource, ledger)) continue;

            const amount = getTerminalExportable(room, resource);
            if (amount < RESOURCE_SEND_MIN) continue;

            const hubFree = hubRoom.terminal.store.getFreeCapacity(resource);
            if (hubFree < RESOURCE_SEND_MIN) continue;

            const sendAmount = Math.min(amount, hubFree, RESOURCE_SEND_MAX);
            const cost = txCost(profile.name, hub, sendAmount);
            if (cost > sendAmount * 0.25) continue;

            addTransfer(transfers, {
                from: profile.name,
                to: hub,
                resource,
                amount: sendAmount,
                kind: 'hub',
                score: scoreTransfer(sendAmount, cost, 0.5),
            });
        }
    }
}

function planPressureTransfers(transfers, profiles, resources) {
    const pressured = new Set();
    for (const profile of profiles) {
        const room = Game.rooms[profile.name];
        if (!room?.terminal) continue;
        const storage = room.storage;
        const terminalPressure = room.terminal.store.getFreeCapacity() < TERMINAL_CAPACITY * 0.1;
        const storagePressure = storage && storage.store.getFreeCapacity() < STORAGE_CAPACITY * 0.1;
        if (terminalPressure || storagePressure) pressured.add(profile.name);
    }
    if (!pressured.size) return;

    for (const resource of resources) {
        if (resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) continue;
        planResourceTransfers(transfers, resource, profiles, {
            pressureRelief: true,
            kind: 'pressure',
            sourceNames: pressured,
        });
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
    planBatteryTransfers(transfers, profiles);
    planEnergyTransfers(transfers, profiles);

    for (const resource of resources) {
        if (resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) continue;
        planResourceTransfers(transfers, resource, profiles);
    }

    planPressureTransfers(transfers, profiles, resources);
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
    if (!canAffordSend(energyCost)) return false;

    if (terminal.send(resource, amount, to) !== OK) return false;

    recordTransferEnergyCost(terminal, resource, amount, to);
    markTerminalsUsed(terminal.room.name, to, resource);

    const label = transfer.kind === 'pressure' ? 'Pressure relief'
        : transfer.kind === 'hub' ? 'Hub feed' : 'Balancing';
    const msg = `${label}: ${amount} ${resource} to ${roomLink(to)} from ${roomLink(terminal.room.name)}`;
    if (resource === RESOURCE_ENERGY && transfer.kind === 'energy') log.i(msg, 'Market: ');
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

    if (!options.skipAllies && !allowedKinds) {
        if (executeAllyEnergyTransfers(terminal)) return true;
        return executeAllyResourceTransfers(terminal);
    }
    return false;
}


function executeAllyEnergyTransfers(terminal) {
    const {canAffordSend} = require('termBudget');
    if (terminal.room.memory.dangerousAttack || terminal.room.energyState < 2) return false;

    let needyRoom = null;
    for (const key in ALLY_HELP_REQUESTS) {
        if (key === MY_USERNAME) continue;
        const ally = ALLY_HELP_REQUESTS[key];
        if (ally?.requests?.funnel?.length) {
            const entry = _.min(ally.requests.funnel, 'maxAmount');
            if (!needyRoom || entry.maxAmount < needyRoom.maxAmount) needyRoom = entry;
        }
    }
    if (!needyRoom?.roomName) {
        for (const key in ALLY_HELP_REQUESTS) {
            if (key === MY_USERNAME) continue;
            const energyReq = ALLY_HELP_REQUESTS[key]?.requests?.resource
                ?.find(re => re.resourceType === RESOURCE_ENERGY);
            if (energyReq?.roomName) {
                needyRoom = {roomName: energyReq.roomName};
                break;
            }
        }
    }
    if (!needyRoom?.roomName) return false;
    if (!canUseTerminal(terminal.room.name)) return false;

    const destRoom = needyRoom.roomName;
    const dest = Game.rooms[destRoom];
    if (dest?.factory && FactoryControl.roomNeedsBatteryInbound(dest) && terminal.store[RESOURCE_BATTERY]) {
        const need = FactoryControl.factoryBatteryInboundNeed(dest);
        const bAmount = FactoryControl.terminalBatterySendAmount(
            Math.min(terminal.store[RESOURCE_BATTERY] || 0, need),
            dest.terminal?.store.getFreeCapacity(RESOURCE_BATTERY) || 0);
        const bTxCost = Game.market.calcTransactionCost(bAmount, terminal.room.name, destRoom);
        if (bAmount >= 50 && canAffordSend(bTxCost) && terminal.send(RESOURCE_BATTERY, bAmount, destRoom) === OK) {
            recordTransferEnergyCost(terminal, RESOURCE_BATTERY, bAmount, destRoom);
            markTerminalsUsed(terminal.room.name, destRoom, RESOURCE_BATTERY);
            return true;
        }
    }

    const sendAmount = terminalExportableEnergy(terminal, destRoom, RESOURCE_SEND_MAX * 2);
    if (sendAmount < ENERGY_SEND_MIN) return false;
    const allyEnergyTx = Game.market.calcTransactionCost(sendAmount, terminal.room.name, destRoom);
    if (!canAffordSend(sendAmount + allyEnergyTx)) return false;
    if (terminal.send(RESOURCE_ENERGY, sendAmount, destRoom) !== OK) return false;

    recordTransferEnergyCost(terminal, RESOURCE_ENERGY, sendAmount, destRoom);
    markTerminalsUsed(terminal.room.name, destRoom, RESOURCE_ENERGY);
    log.i(`Balancing ${sendAmount} energy to ally ${roomLink(destRoom)} from ${roomLink(terminal.room.name)}`, 'Market: ');
    return true;
}

function executeAllyResourceTransfers(terminal) {
    const {canAffordSend} = require('termBudget');
    const {canEmpireSell} = require('termNetwork');
    for (const key in ALLY_HELP_REQUESTS) {
        if (key === MY_USERNAME) continue;
        const ally = ALLY_HELP_REQUESTS[key];

        for (const resource of Object.keys(terminal.store)) {
            if (resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) continue;
            const request = ally?.requests?.resource?.find(re => re.resourceType === resource);
            if (!request?.roomName) continue;
            if (!canEmpireSell(resource)) continue;

            const available = getTerminalExportable(terminal.room, resource);
            const amount = Math.min(available, RESOURCE_SEND_MAX, request.amount || RESOURCE_SEND_MAX);
            if (amount < RESOURCE_SEND_MIN) continue;

            const allyTxCost = Game.market.calcTransactionCost(amount, terminal.room.name, request.roomName);
            if (!canAffordSend(allyTxCost)) continue;

            if (terminal.send(resource, amount, request.roomName) === OK) {
                recordTransferEnergyCost(terminal, resource, amount, request.roomName);
                markTerminalsUsed(terminal.room.name, request.roomName, resource);
                log.a(`Balancing ${amount} ${resource} to ally ${roomLink(request.roomName)} from ${roomLink(terminal.room.name)}`, 'Market: ');
                return true;
            }
        }
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
};