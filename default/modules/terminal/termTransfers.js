/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Centralized terminal transfer planner and executor.
 */

const state = require('termState');
const {
    getRoomKeepAmount,
    getPressureProtectAmount,
    getOperationalProtectAmount,
    getRoomOperationalNeed,
    isHubRoom
} = require('termKeep');
const {getDerivedCommodityAmount} = require('termCache');
const FactoryControl = require('module.factoryController');
const {getColonyRole, isCoreRoom} = require('module.colonyProfile');
const profiler = require('tools.profiler');

const RESOURCE_SEND_MAX = 5000;
const PRESSURE_SEND_MAX = 25000;
const RESOURCE_SEND_MIN = 100;
const BATTERY_SEND_MIN = 50;
const ENERGY_SEND_MIN = 5000;
const ENERGY_INBOUND_MIN = 1000;
const PRESSURE_DEST_FREE_MIN = 5000;
const PARK_TERMINAL_USED_MAX = 0.5;
const PARK_STORAGE_FREE_MIN = 0.2;
const DEST_TERMINAL_BUSY = 0.7;
// 0.25 only covers ~9 rooms; alliance dests are often 15–30 rooms (fee ~0.4–0.65).
const ALLY_FEE_MAX = 0.75;
// Empire fills and hub pulls. 0.5 covers ~20 rooms so a frontier can supply the core.
const EMPIRE_FEE_MAX = 0.5;
const FRONTIER_EVAC_STORAGE_FREE = 0.2;

// Pressure outranks hub/ally consolidation so overfull rooms evacuate first.
const PRIORITY_RANK = {urgent: 0, pressure: 1, battery: 2, energy: 3, resource: 4, ally: 5, hub: 6};

/**
 * Bulk overstock only (storage nearly full). Matches termInventory.isCapacityPressured:
 * free storage means labTech should pull terminal → storage, not network-dump.
 */
function isRoomCapacityPressured(room) {
    if (!room) return false;
    const storage = room.storage;
    if (storage) {
        return storage.store.getFreeCapacity() < STORAGE_CAPACITY * 0.1;
    }
    const terminal = room.terminal;
    if (!terminal) return false;
    return terminal.store.getFreeCapacity() < TERMINAL_CAPACITY * 0.15;
}

function shouldEvacuateToHub(room) {
    if (isRoomCapacityPressured(room)) return true;
    const role = getColonyRole(room);
    if (role !== 'frontier' && role !== 'outpost') return false;
    if (room.storage) {
        return room.storage.store.getFreeCapacity() < STORAGE_CAPACITY * FRONTIER_EVAC_STORAGE_FREE;
    }
    return !!(room.terminal && room.terminal.store.getUsedCapacity() > TERMINAL_CAPACITY * DEST_TERMINAL_BUSY);
}

function getRoomLabNeeds(room) {
    const needs = new Set();
    for (const lab of room.labs || []) {
        if (lab.memory && lab.memory.itemNeeded) needs.add(lab.memory.itemNeeded);
    }
    return needs;
}

function compressedUnpackDemand(room, resource) {
    if (!room || !room.factory || resource === RESOURCE_BATTERY) return 0;
    if (typeof COMPRESSED_COMMODITIES === 'undefined' || !COMPRESSED_COMMODITIES.includes(resource)) return 0;
    const {buildEquivalenceMap} = require('termNetwork');
    const entries = buildEquivalenceMap()[resource];
    if (!entries || !entries.length) return 0;
    let extra = 0;
    for (let i = 0; i < entries.length; i++) {
        const {base, ratio} = entries[i];
        if (!base || !ratio) continue;
        const mineralNeed = getRoomKeepAmount(room, base) || 0;
        const mineralHave = room.store(base) || 0;
        extra = Math.max(extra, Math.ceil(Math.max(0, mineralNeed - mineralHave) / ratio));
    }
    return extra;
}

function getRoomResourceDemand(room, resource) {
    // Keep includes launch combat T3 stockpiles and hub non-combat warehouses.
    let need = getRoomKeepAmount(room, resource);
    if (getRoomLabNeeds(room).has(resource)) need = Math.max(need, REACTION_AMOUNT);
    if (resource === RESOURCE_BATTERY) {
        need = Math.max(need, FactoryControl.factoryBatteryInboundNeed(room));
    }
    need = Math.max(need, compressedUnpackDemand(room, resource));
    return need;
}

function inboundMineralEquivalent(roomName, resource, transfers) {
    const {getInboundPlannedAmount} = require('termMarket');
    let total = getInboundPlannedAmount(roomName, resource, transfers);
    if (!BASE_MINERALS.includes(resource) && resource !== RESOURCE_GHODIUM) return total;
    const {buildEquivalenceMap} = require('termNetwork');
    const eq = buildEquivalenceMap();
    for (const product in eq) {
        const entries = eq[product];
        for (let i = 0; i < entries.length; i++) {
            if (entries[i].base !== resource) continue;
            total += getInboundPlannedAmount(roomName, product, transfers) * entries[i].ratio;
        }
    }
    return total;
}

function getRoomEffective(room, resource) {
    let amount = room.store(resource) || 0;
    // Bars only count where a factory can unpack them. RCL6 labs have no factory.
    if ((BASE_MINERALS.includes(resource) || resource === RESOURCE_GHODIUM) && room.factory) {
        amount += getDerivedCommodityAmount(room, resource);
    }
    return amount;
}

function getExportFloor(room, resource, pressureRelief = false) {
    if (pressureRelief) {
        const protect = getPressureProtectAmount(room, resource);
        return isFinite(protect) ? protect : Infinity;
    }
    // Never strip a real stockpile (launch combat T3 / hub warehouse). Rooms
    // whose keep is only operational still donate surplus to labs elsewhere.
    if (typeof ALL_BOOSTS !== 'undefined' && ALL_BOOSTS.includes(resource)) {
        return Math.max(getRoomKeepAmount(room, resource) || 0, getOperationalProtectAmount(room, resource) || 0);
    }
    return getRoomResourceDemand(room, resource) || 0;
}

function getTerminalExportable(room, resource, pressureRelief = false) {
    const terminal = room.terminal;
    if (!terminal || resource === RESOURCE_ENERGY) return 0;

    const inTerminal = terminal.store[resource] || 0;
    if (!inTerminal) return 0;

    const floor = getExportFloor(room, resource, pressureRelief);
    if (!isFinite(floor)) return 0;

    const effective = getRoomEffective(room, resource);
    const available = Math.min(inTerminal, Math.max(0, effective - floor));
    const maxSend = pressureRelief ? PRESSURE_SEND_MAX : RESOURCE_SEND_MAX;
    return Math.min(available, maxSend);
}

/**
 * When the empire has surplus, any terminal may donate down to the protect
 * floor (labs/boosts/hub keep). Local keep no longer blocks ally offload.
 * Empire shortage: minerals/boosts are not donated.
 */
function getAllyExportable(room, resource, ledger) {
    const terminal = room.terminal;
    if (!terminal || resource === RESOURCE_ENERGY) return 0;

    const inTerminal = terminal.store[resource] || 0;
    if (!inTerminal) return 0;

    if (resource !== RESOURCE_BATTERY) {
        const {canEmpireSell} = require('termNetwork');
        if (!canEmpireSell(resource, ledger)) return 0;
    }

    const protect = getPressureProtectAmount(room, resource);
    if (!isFinite(protect)) return 0;

    const effective = getRoomEffective(room, resource);
    const available = Math.min(inTerminal, Math.max(0, effective - protect));
    return Math.min(available, RESOURCE_SEND_MAX);
}

function destTerminalBusy(room) {
    const terminal = room?.terminal;
    if (!terminal) return true;
    return terminal.store.getUsedCapacity() > TERMINAL_CAPACITY * DEST_TERMINAL_BUSY;
}

function destParkFree(room, resource, inbound) {
    const terminal = room?.terminal;
    if (!terminal) return 0;
    const destFree = terminal.store.getFreeCapacity(resource) - inbound;
    if (destFree < PRESSURE_DEST_FREE_MIN) return 0;
    if (terminal.store.getUsedCapacity() > TERMINAL_CAPACITY * PARK_TERMINAL_USED_MAX) return 0;
    const storage = room.storage;
    if (storage && storage.store.getFreeCapacity() < STORAGE_CAPACITY * PARK_STORAGE_FREE_MIN) return 0;
    return destFree;
}

function canUseTerminal(roomName) {
    return !state.usedTerminals[roomName] || state.usedTerminals[roomName].tick <= Game.time;
}

function txCost(from, to, amount) {
    return Game.market.calcTransactionCost(amount, from, to);
}

function maxAffordableByEnergy(from, to, energy) {
    if (energy <= 0) return 0;
    const factor = 1 - Math.exp(-Game.map.getRoomLinearDistance(from, to) / 30);
    if (factor <= 0) return energy;
    return Math.floor(energy / factor);
}

function minSendAmount(resource) {
    return resource === RESOURCE_BATTERY ? BATTERY_SEND_MIN : RESOURCE_SEND_MIN;
}

function clampSendToEnergy(from, to, resource, amount, energy) {
    const minSend = minSendAmount(resource);
    if (amount < minSend || energy <= 0) return 0;
    while (amount >= minSend) {
        const fee = txCost(from, to, amount);
        const need = (resource === RESOURCE_ENERGY ? amount : 0) + fee;
        if (need <= energy) return amount;
        amount = Math.floor(amount * 0.75);
    }
    return 0;
}

function scoreTransfer(need, cost, bonus = 0) {
    return need / (1 + cost) + bonus;
}

function addTransfer(transfers, transfer) {
    if (transfer.amount < minSendAmount(transfer.resource)) return;
    transfers.push(transfer);
}

function planResourceTransfers(transfers, resource, profiles, options = {}) {
    const {pressureRelief = false, kind = 'resource', bonus = 0, sourceNames = null} = options;
    const deficits = [];

    for (const profile of profiles) {
        const room = Game.rooms[profile.name];
        if (!room?.terminal || !canUseTerminal(profile.name)) continue;
        const demand = getRoomResourceDemand(room, resource);
        if (!demand) continue;
        const effective = getRoomEffective(room, resource);
        const inbound = inboundMineralEquivalent(profile.name, resource, transfers);
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
        if (isRoomCapacityPressured(destRoom)) continue;
        // Don't park keep-fills into an already busy satellite terminal.
        // Operational lab need, core warehouses, and launch combat stockpiles still accept.
        if (destTerminalBusy(destRoom)
            && !getRoomLabNeeds(destRoom).has(resource)
            && !getRoomOperationalNeed(destRoom, resource)
            && !isCoreRoom(destRoom)
            && getRoomKeepAmount(destRoom, resource) <= (getRoomOperationalNeed(destRoom, resource) || 0)) continue;

        const remaining = Math.min(dest.need, destFree, RESOURCE_SEND_MAX);
        const candidates = [];

        for (const src of exportable) {
            if (src.name === dest.name || src.amount < RESOURCE_SEND_MIN) continue;
            const amount = Math.min(remaining, src.amount, RESOURCE_SEND_MAX);
            if (amount < RESOURCE_SEND_MIN) continue;
            const cost = txCost(src.name, dest.name, amount);
            if (cost > amount * EMPIRE_FEE_MAX) continue;
            const srcRole = getColonyRole(src.name);
            const srcBonus = (srcRole === 'frontier' || srcRole === 'outpost') ? 1 : 0;
            candidates.push({
                from: src.name,
                to: dest.name,
                resource,
                amount,
                kind,
                score: scoreTransfer(dest.need, cost, bonus + srcBonus),
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

function compressedFormsOf(base) {
    const {buildEquivalenceMap} = require('termNetwork');
    const eq = buildEquivalenceMap();
    const out = [];
    for (const product in eq) {
        const entries = eq[product];
        for (let i = 0; i < entries.length; i++) {
            if (entries[i].base === base) out.push({product, ratio: entries[i].ratio});
        }
    }
    return out;
}

function planUrgentTransfers(transfers, ledger, profiles) {
    for (const entry of ledger.urgent || []) {
        const destRoom = Game.rooms[entry.room];
        if (!destRoom?.terminal || !canUseTerminal(entry.room)) continue;
        const resource = entry.resource;
        if (resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) continue;

        const destFree = destRoom.terminal.store.getFreeCapacity(resource);
        const need = Math.min(entry.deficit, destFree, RESOURCE_SEND_MAX);
        const candidates = [];

        const consider = (sendResource, sendNeed) => {
            if (sendNeed < RESOURCE_SEND_MIN) return;
            const free = destRoom.terminal.store.getFreeCapacity(sendResource);
            if (free < RESOURCE_SEND_MIN) return;
            for (const profile of profiles) {
                if (profile.name === entry.room) continue;
                const room = Game.rooms[profile.name];
                if (!room?.terminal || !canUseTerminal(profile.name)) continue;
                const available = getTerminalExportable(room, sendResource);
                if (available < RESOURCE_SEND_MIN) continue;
                const amount = Math.min(sendNeed, available, RESOURCE_SEND_MAX, free);
                if (amount < RESOURCE_SEND_MIN) continue;
                const cost = txCost(profile.name, entry.room, amount);
                if (cost > amount * EMPIRE_FEE_MAX) continue;
                candidates.push({
                    from: profile.name,
                    to: entry.room,
                    resource: sendResource,
                    amount,
                    kind: 'urgent',
                    score: scoreTransfer(entry.deficit, cost, sendResource === resource ? 2 : 1.5),
                });
            }
        };

        consider(resource, need);
        if (destRoom.factory && (BASE_MINERALS.includes(resource) || resource === RESOURCE_GHODIUM)) {
            const forms = compressedFormsOf(resource);
            for (let i = 0; i < forms.length; i++) {
                const barsNeeded = Math.ceil(entry.deficit / forms[i].ratio);
                consider(forms[i].product, barsNeeded);
            }
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
        // CRIT dests need energy now; unpack whatever batteries they already have.
        if ((destRoom.energyState || 0) < 1) continue;

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

function energyRoleBonus(srcRoom, destRoom) {
    const destRole = getColonyRole(destRoom);
    const srcRole = getColonyRole(srcRoom);
    let bonus = 0;
    if (destRole === 'launch') bonus += 1.5;
    else if (destRole === 'frontier') bonus += 0.75;
    else if (destRole === 'outpost') bonus += 0.5;
    if (srcRole === 'launch') bonus -= 1;
    else if (srcRole === 'core') bonus += 0.5;
    return bonus;
}

function roomSpareIncome(room) {
    return (room && room.energyInfo && room.energyInfo.spareIncome) || 0;
}

/** Surplus, or at-target with positive spare. Same gate for own-room fills and ally energy. */
function canDonateEnergy(room) {
    if (!room) return false;
    const srcState = room.energyState || 0;
    if (srcState >= 3) return true;
    return srcState >= 2 && roomSpareIncome(room) > 0;
}

function empireEnergyHungry(profiles) {
    for (let i = 0; i < profiles.length; i++) {
        const room = Game.rooms[profiles[i].name];
        if (!room || !room.terminal) continue;
        if ((room.energyState || 0) < 2) return true;
    }
    return false;
}

function energyInboundFloor(destRoom) {
    return (destRoom.energyState || 0) < 1 ? RESOURCE_SEND_MIN : ENERGY_INBOUND_MIN;
}

function energyFeeCap(destRoom) {
    return (destRoom.energyState || 0) < 1 ? ALLY_FEE_MAX : 0.25;
}

function planEnergyTransfers(transfers, profiles) {
    // One terminal.send per source per run. Reserve the donor after a plan so a
    // second dest is assigned a different room instead of a duplicate that never fires.
    const usedSources = Object.create(null);

    for (const profile of profiles) {
        const destRoom = Game.rooms[profile.name];
        if (!destRoom?.terminal || !canUseTerminal(profile.name)) continue;
        if (!FactoryControl.needsBatteryUnpack(destRoom) && destRoom.energyState >= 2) continue;

        const destFree = destRoom.terminal.store.getFreeCapacity(RESOURCE_ENERGY);
        const inboundFloor = energyInboundFloor(destRoom);
        if (destFree < inboundFloor) continue;

        const energyGap = Math.max(0, FactoryControl.energyTarget(destRoom) - destRoom.rawEnergy);
        const minSend = destFree >= ENERGY_SEND_MIN ? ENERGY_SEND_MIN : inboundFloor;
        const desired = Math.min(RESOURCE_SEND_MAX * 2, destFree, Math.max(minSend, Math.floor(energyGap)));
        const feeCap = energyFeeCap(destRoom);

        const candidates = [];
        for (const srcProfile of profiles) {
            if (srcProfile.name === profile.name || usedSources[srcProfile.name]) continue;
            const srcRoom = Game.rooms[srcProfile.name];
            if (!srcRoom?.terminal || !canUseTerminal(srcProfile.name)) continue;
            if (srcRoom.memory.dangerousAttack) continue;
            if (!canDonateEnergy(srcRoom)) continue;

            if ((destRoom.energyState || 0) >= 1 && destRoom.factory
                && FactoryControl.roomNeedsBatteryInbound(destRoom) && srcRoom.terminal.store[RESOURCE_BATTERY]) {
                const bNeed = FactoryControl.factoryBatteryInboundNeed(destRoom);
                const bAmount = FactoryControl.terminalBatterySendAmount(
                    Math.min(srcRoom.terminal.store[RESOURCE_BATTERY] || 0, bNeed),
                    destRoom.terminal.store.getFreeCapacity(RESOURCE_BATTERY));
                if (bAmount >= 50) {
                    const cost = txCost(srcProfile.name, profile.name, bAmount);
                    if (cost <= bAmount * feeCap) {
                        candidates.push({
                            from: srcProfile.name,
                            to: profile.name,
                            resource: RESOURCE_BATTERY,
                            amount: bAmount,
                            kind: 'energy',
                            score: 1 + bAmount / (1 + cost),
                        });
                    }
                }
            }

            const amount = terminalExportableEnergy(srcRoom.terminal, profile.name, desired);
            if (amount < minSend) continue;
            const cost = txCost(srcProfile.name, profile.name, amount);
            if (cost > amount * feeCap) continue;
            candidates.push({
                from: srcProfile.name,
                to: profile.name,
                resource: RESOURCE_ENERGY,
                amount,
                kind: 'energy',
                score: (amount - cost) / (1 + cost) + (destRoom.energyState < 1 ? 2 : 0) + energyRoleBonus(srcRoom, destRoom),
            });
        }

        candidates.sort((a, b) => b.score - a.score);
        const best = candidates[0];
        if (!best) continue;
        addTransfer(transfers, best);
        usedSources[best.from] = true;
    }
}

function plannedAllyResources(transfers) {
    const set = new Set();
    for (let i = 0; i < transfers.length; i++) {
        if (transfers[i].kind === 'ally') set.add(transfers[i].resource);
    }
    return set;
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
    const requests = collectAllyTransferRequests();
    if (!requests.length) return;

    const holdEnergy = empireEnergyHungry(profiles);

    for (const request of requests) {
        const {username, resourceType, roomName, amount, priority} = request;
        if (holdEnergy && (resourceType === RESOURCE_ENERGY || resourceType === RESOURCE_BATTERY)) continue;
        const candidates = [];

        for (const profile of profiles) {
            const room = Game.rooms[profile.name];
            if (!room?.terminal || !canUseTerminal(profile.name) || room.memory.dangerousAttack) continue;

            if (resourceType === RESOURCE_ENERGY) {
                if (!canDonateEnergy(room)) continue;
                const sendAmount = terminalExportableEnergy(
                    room.terminal,
                    roomName,
                    Math.min(amount, RESOURCE_SEND_MAX * 2));
                if (sendAmount < ENERGY_SEND_MIN) continue;
                const cost = txCost(profile.name, roomName, sendAmount);
                if (cost > sendAmount * ALLY_FEE_MAX) continue;
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

            if (resourceType === RESOURCE_BATTERY) {
                if (!canDonateEnergy(room)) continue;
                const available = getAllyExportable(room, resourceType, ledger);
                const sendAmount = Math.min(available, RESOURCE_SEND_MAX, amount);
                if (sendAmount < BATTERY_SEND_MIN) continue;
                const cost = txCost(profile.name, roomName, sendAmount);
                if (cost > sendAmount * ALLY_FEE_MAX) continue;
                candidates.push({
                    from: profile.name,
                    to: roomName,
                    resource: RESOURCE_BATTERY,
                    amount: sendAmount,
                    kind: 'ally',
                    ally: username,
                    score: priority * sendAmount / (1 + cost),
                });
                continue;
            }

            const available = getAllyExportable(room, resourceType, ledger);
            const sendAmount = Math.min(available, RESOURCE_SEND_MAX, amount);
            if (sendAmount < RESOURCE_SEND_MIN) continue;

            const cost = txCost(profile.name, roomName, sendAmount);
            if (cost > sendAmount * ALLY_FEE_MAX) continue;
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

function listCoreWarehouses(profiles, resource, transfers) {
    const {getInboundPlannedAmount} = require('termMarket');
    const dests = [];
    for (const profile of profiles) {
        const room = Game.rooms[profile.name];
        if (!room?.terminal || !isCoreRoom(room)) continue;
        if (!canUseTerminal(profile.name) || isRoomCapacityPressured(room)) continue;
        const inbound = getInboundPlannedAmount(profile.name, resource, transfers);
        const destFree = room.terminal.store.getFreeCapacity(resource) - inbound;
        if (destFree < RESOURCE_SEND_MIN) continue;
        dests.push({name: profile.name, free: destFree});
    }
    return dests;
}

function pickNearestWarehouse(fromName, dests) {
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < dests.length; i++) {
        const dest = dests[i];
        if (dest.name === fromName) continue;
        const dist = Game.map.getRoomLinearDistance(fromName, dest.name);
        if (dist < bestDist || (dist === bestDist && dest.free > (best ? best.free : 0))) {
            best = dest;
            bestDist = dist;
        }
    }
    return best;
}

function planHubConsolidation(transfers, ledger, profiles) {
    const {canEmpireSell} = require('termNetwork');
    const allyPlanned = plannedAllyResources(transfers);
    const fallbackHub = ledger.marketHub;

    for (const profile of profiles) {
        const room = Game.rooms[profile.name];
        if (!room?.terminal || !canUseTerminal(profile.name) || room.memory.dangerousAttack) continue;
        // Cores are the warehouse. Only frontier/launch/outpost dump into them.
        if (isCoreRoom(room)) continue;

        const evacuate = shouldEvacuateToHub(room);
        for (const resource of Object.keys(room.terminal.store)) {
            if (resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) continue;
            if (resource === RESOURCE_OPS || resource === RESOURCE_POWER) continue;
            if (allyPlanned.has(resource)) continue;
            if (!evacuate && !canEmpireSell(resource, ledger)) continue;

            const amount = getTerminalExportable(room, resource, evacuate);
            if (amount < RESOURCE_SEND_MIN) continue;

            const dests = listCoreWarehouses(profiles, resource, transfers);
            let dest = pickNearestWarehouse(profile.name, dests);
            if (!dest && fallbackHub && fallbackHub !== profile.name) {
                const hubRoom = Game.rooms[fallbackHub];
                if (hubRoom?.terminal && canUseTerminal(fallbackHub) && !isRoomCapacityPressured(hubRoom)) {
                    const hubFree = hubRoom.terminal.store.getFreeCapacity(resource);
                    if (hubFree >= RESOURCE_SEND_MIN) dest = {name: fallbackHub, free: hubFree};
                }
            }
            if (!dest) continue;

            const sendAmount = Math.min(amount, dest.free, evacuate ? PRESSURE_SEND_MAX : RESOURCE_SEND_MAX);
            const cost = txCost(profile.name, dest.name, sendAmount);
            if (cost > sendAmount * EMPIRE_FEE_MAX) continue;

            addTransfer(transfers, {
                from: profile.name,
                to: dest.name,
                resource,
                amount: sendAmount,
                kind: evacuate ? 'pressure' : 'hub',
                score: scoreTransfer(sendAmount, cost, evacuate ? 2 : 0.5),
            });
        }
    }
}

/**
 * Evacuate pressured rooms. Prefer dests that actually need the resource, then
 * the hub, then allies who requested it. Last-resort parking is only allowed
 * into rooms with lots of terminal AND storage headroom so we do not congest
 * random working terminals.
 *
 * Minerals first; if the terminal is energy-heavy, also plan energy dumps to rooms
 * that can still accept energy (prefer low energyState). Never leave energy for
 * market fire-sales while an owned room has free terminal capacity.
 */
function planPressureTransfers(transfers, profiles) {
    const {getInboundPlannedAmount} = require('termMarket');
    const pressured = [];
    for (const profile of profiles) {
        const room = Game.rooms[profile.name];
        if (!room?.terminal || !canUseTerminal(profile.name)) continue;
        if (!isRoomCapacityPressured(room)) continue;
        pressured.push(profile.name);
    }
    if (!pressured.length) return;

    const allyRequests = collectAllyTransferRequests();

    for (const srcName of pressured) {
        const srcRoom = Game.rooms[srcName];
        if (!srcRoom?.terminal) continue;

        // Prefer non-energy dumps so energy stays available for send fees and empire use.
        const srcEnergy = srcRoom.terminal.store[RESOURCE_ENERGY] || 0;
        const energyStarved = srcEnergy < TERMINAL_ENERGY_BUFFER;
        const destFreeMin = energyStarved ? RESOURCE_SEND_MIN : PRESSURE_DEST_FREE_MIN;

        const resources = Object.keys(srcRoom.terminal.store)
            .filter(r => r !== RESOURCE_ENERGY && r !== RESOURCE_BATTERY && r !== RESOURCE_OPS && r !== RESOURCE_POWER)
            .sort((a, b) => (srcRoom.terminal.store[b] || 0) - (srcRoom.terminal.store[a] || 0));

        let planned = false;
        for (const resource of resources) {
            const amount = getTerminalExportable(srcRoom, resource, true);
            if (amount < RESOURCE_SEND_MIN) continue;

            const candidates = [];
            for (const profile of profiles) {
                if (profile.name === srcName) continue;
                const destRoom = Game.rooms[profile.name];
                if (!destRoom?.terminal || !canUseTerminal(profile.name)) continue;
                if (isRoomCapacityPressured(destRoom)) continue;

                const inbound = getInboundPlannedAmount(profile.name, resource, transfers);
                const destFree = destRoom.terminal.store.getFreeCapacity(resource) - inbound;
                if (destFree < destFreeMin) continue;

                const demand = getRoomResourceDemand(destRoom, resource);
                const effective = getRoomEffective(destRoom, resource);
                const underKeep = demand ? Math.max(0, demand - effective - inbound) : 0;
                const warehouse = isCoreRoom(destRoom) || isHubRoom(destRoom);
                // Demand and core warehouses always accept. Parking elsewhere requires unused
                // terminal/storage headroom so we don't stuff a working satellite.
                if (underKeep < RESOURCE_SEND_MIN && !warehouse && !destParkFree(destRoom, resource, inbound)) continue;

                let sendAmount = Math.min(amount, destFree, PRESSURE_SEND_MAX,
                    maxAffordableByEnergy(srcName, profile.name, srcEnergy));
                sendAmount = clampSendToEnergy(srcName, profile.name, resource, sendAmount, srcEnergy);
                if (sendAmount < RESOURCE_SEND_MIN) continue;
                const cost = txCost(srcName, profile.name, sendAmount);
                // Efficiency cap is for healthy rooms. Energy-starved overflow
                // spends whatever fee it can afford — 4.5k energy is enough
                // for a nearby dump if we don't insist on a 25k send.
                if (!energyStarved && cost > sendAmount * 0.35) continue;

                const bonus = underKeep ? 3 : warehouse ? 2 : 0;
                candidates.push({
                    from: srcName,
                    to: profile.name,
                    resource,
                    amount: sendAmount,
                    kind: 'pressure',
                    score: scoreTransfer(underKeep || destFree, cost, bonus) + sendAmount / 5000,
                });
            }

            // Allies who asked for this resource beat stuffing a random owned room.
            for (const req of allyRequests) {
                if (req.resourceType !== resource || req.roomName === srcName) continue;
                const destRoom = Game.rooms[req.roomName];
                if (destRoom) {
                    if (!destRoom.terminal || isRoomCapacityPressured(destRoom)) continue;
                    const destFree = destRoom.terminal.store.getFreeCapacity(resource);
                    if (destFree < RESOURCE_SEND_MIN) continue;
                }
                let sendAmount = Math.min(amount, req.amount || amount, PRESSURE_SEND_MAX,
                    maxAffordableByEnergy(srcName, req.roomName, srcEnergy));
                sendAmount = clampSendToEnergy(srcName, req.roomName, resource, sendAmount, srcEnergy);
                if (sendAmount < RESOURCE_SEND_MIN) continue;
                const cost = txCost(srcName, req.roomName, sendAmount);
                if (cost > sendAmount * ALLY_FEE_MAX) continue;
                candidates.push({
                    from: srcName,
                    to: req.roomName,
                    resource,
                    amount: sendAmount,
                    kind: 'pressure',
                    ally: req.username,
                    score: scoreTransfer(sendAmount, cost, 2.5) + sendAmount / 5000,
                });
            }

            candidates.sort((a, b) => b.score - a.score);
            if (candidates[0]) {
                addTransfer(transfers, candidates[0]);
                planned = true;
                // One outbound pressure plan per source room is enough; only one send/tick executes.
                break;
            }
        }

        if (planned) continue;

        // Energy network dump only when the room is energy-rich (storage bulk full of
        // energy or high energyState). Never strip send-buffer energy from needy rooms.
        if ((srcRoom.energyState || 0) < 2) continue;
        const storageE = srcRoom.storage ? (srcRoom.storage.store[RESOURCE_ENERGY] || 0) : 0;
        const storageReserve = 25000;
        if (srcRoom.storage && storageE < storageReserve) continue;

        const inEnergy = srcRoom.terminal.store[RESOURCE_ENERGY] || 0;
        const energySurplus = Math.max(0, inEnergy - TERMINAL_ENERGY_BUFFER);
        if (energySurplus < ENERGY_SEND_MIN) continue;

        const energyCandidates = [];
        for (const profile of profiles) {
            if (profile.name === srcName) continue;
            const destRoom = Game.rooms[profile.name];
            if (!destRoom?.terminal || !canUseTerminal(profile.name)) continue;
            if (isRoomCapacityPressured(destRoom)) continue;
            // Only ship energy to rooms that actually need it — not free-space parking.
            if ((destRoom.energyState || 0) >= 2) continue;

            const destFree = destRoom.terminal.store.getFreeCapacity(RESOURCE_ENERGY);
            const inboundFloor = energyInboundFloor(destRoom);
            if (destFree < inboundFloor) continue;

            const sendAmount = Math.min(energySurplus, destFree, PRESSURE_SEND_MAX);
            if (sendAmount < inboundFloor) continue;
            const cost = txCost(srcName, profile.name, sendAmount);
            const feeCap = (destRoom.energyState || 0) < 1 ? ALLY_FEE_MAX : 0.4;
            if (cost > sendAmount * feeCap) continue;
            if (cost + sendAmount > inEnergy - 1000) continue;

            const hunger = destRoom.energyState < 1 ? 4 : 3;
            energyCandidates.push({
                from: srcName,
                to: profile.name,
                resource: RESOURCE_ENERGY,
                amount: sendAmount,
                kind: 'pressure',
                score: hunger * 10000 + sendAmount / (1 + cost),
            });
        }

        energyCandidates.sort((a, b) => b.score - a.score);
        if (energyCandidates[0]) addTransfer(transfers, energyCandidates[0]);
    }
}

/**
 * After an energy-starved pressured room frees a sliver of terminal space,
 * other rooms ship fee-energy in so the next dump can be larger.
 */
function planEnergyRescue(transfers, profiles) {
    for (const profile of profiles) {
        const destRoom = Game.rooms[profile.name];
        if (!destRoom?.terminal || !canUseTerminal(profile.name)) continue;
        if (!isRoomCapacityPressured(destRoom)) continue;

        const destEnergy = destRoom.terminal.store[RESOURCE_ENERGY] || 0;
        if (destEnergy >= TERMINAL_ENERGY_BUFFER) continue;
        const destFree = destRoom.terminal.store.getFreeCapacity(RESOURCE_ENERGY);
        if (destFree < RESOURCE_SEND_MIN) continue;

        const need = Math.min(TERMINAL_ENERGY_BUFFER - destEnergy, destFree, PRESSURE_SEND_MAX);
        if (need < RESOURCE_SEND_MIN) continue;

        const candidates = [];
        for (const srcProfile of profiles) {
            if (srcProfile.name === profile.name) continue;
            const srcRoom = Game.rooms[srcProfile.name];
            if (!srcRoom?.terminal || !canUseTerminal(srcProfile.name)) continue;
            if (srcRoom.memory.dangerousAttack || (srcRoom.energyState || 0) < 2) continue;

            const amount = terminalExportableEnergy(srcRoom.terminal, profile.name, need);
            if (amount < RESOURCE_SEND_MIN) continue;
            const cost = txCost(srcProfile.name, profile.name, amount);
            if (cost > amount * 0.5) continue;
            candidates.push({
                from: srcProfile.name,
                to: profile.name,
                resource: RESOURCE_ENERGY,
                amount,
                kind: 'urgent',
                score: scoreTransfer(need, cost, 4),
            });
        }
        candidates.sort((a, b) => b.score - a.score);
        if (candidates[0]) addTransfer(transfers, candidates[0]);
    }
}

function planTransfers(ledger) {
    const profiles = MY_ROOMS
        .map(name => Game.rooms[name])
        .filter(room => room && room.terminal)
        .map(room => ({name: room.name}));

    if (!profiles.length) return [];

    const resources = Object.keys(ledger.demand || {});
    // Bars before minerals so inbound bars count against dest mineral need.
    resources.sort((a, b) => {
        const ac = COMPRESSED_COMMODITIES.includes(a) && a !== RESOURCE_BATTERY ? 0 : 1;
        const bc = COMPRESSED_COMMODITIES.includes(b) && b !== RESOURCE_BATTERY ? 0 : 1;
        return ac - bc;
    });
    const transfers = [];

    planUrgentTransfers(transfers, ledger, profiles);
    // Evacuate overfull rooms before normal battery/energy/resource balancing.
    planPressureTransfers(transfers, profiles);
    planEnergyRescue(transfers, profiles);
    planBatteryTransfers(transfers, profiles);
    planEnergyTransfers(transfers, profiles);

    for (const resource of resources) {
        if (resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) continue;
        planResourceTransfers(transfers, resource, profiles);
    }

    planAllyTransfers(transfers, ledger, profiles);
    planHubConsolidation(transfers, ledger, profiles);
    if (typeof IS_SEASON !== 'undefined' && IS_SEASON) {
        require('module.season').planThoriumTransfers(transfers, profiles);
    }

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
    const rn = terminal.room.name;
    if (global.bumpEnergyExpense) global.bumpEnergyExpense('terminal', rn, energyCost);
    const {recordSendCost} = require('termBudget');
    recordSendCost(energyCost);
    return txCost;
}

function markTerminalsUsed(from, to, resource) {
    state.usedTerminals[from] = {tick: Game.time};
    // Dest lock matches terminal cooldown (10) so a lab can take a second input
    // next cycle. Batteries use a longer lock only when the dest is energy-OK
    // so a CRIT/LOW room is not blocked from energy fills for 500 ticks.
    let destLock = 10;
    if (resource === RESOURCE_BATTERY) {
        const dest = Game.rooms[to];
        destLock = dest && (dest.energyState || 0) < 2 ? 10 : 500;
    }
    state.usedTerminals[to] = {tick: Game.time + destLock};
}

function executeTransfer(terminal, transfer) {
    const {to, resource} = transfer;
    if (terminal.pos.roomName !== transfer.from) return false;
    if (!canUseTerminal(to)) return false;
    if (terminal.room.memory.dangerousAttack && transfer.kind !== 'urgent') return false;

    const destRoom = Game.rooms[to];
    const destFree = destRoom?.terminal
        ? destRoom.terminal.store.getFreeCapacity(resource)
        : transfer.amount;
    let amount = Math.min(transfer.amount, destFree, terminal.store[resource] || 0);
    const energy = terminal.store[RESOURCE_ENERGY] || 0;
    amount = clampSendToEnergy(terminal.room.name, to, resource, amount, energy);
    if (amount < minSendAmount(resource)) return false;

    const fee = Game.market.calcTransactionCost(amount, terminal.room.name, to);
    const energyCost = (resource === RESOURCE_ENERGY ? amount : 0) + fee;
    const {canAffordSend} = require('termBudget');
    const emergency = transfer.kind === 'pressure' || transfer.kind === 'urgent';
    if (!canAffordSend(energyCost, {emergency})) return false;

    if (terminal.send(resource, amount, to) !== OK) return false;

    recordTransferEnergyCost(terminal, resource, amount, to);
    markTerminalsUsed(terminal.room.name, to, resource);

    const label = transfer.kind === 'pressure' ? (transfer.ally ? `Pressure relief (ally ${transfer.ally})` : 'Pressure relief')
        : transfer.kind === 'hub' ? 'Hub feed'
            : transfer.kind === 'ally' ? `Ally ${transfer.ally}` : 'Balancing';
    const msg = `${label}: ${amount} ${resource} to ${roomLink(to)} from ${roomLink(terminal.room.name)}`;
    if (transfer.kind === 'ally' || transfer.ally) log.a(msg, 'Market: ');
    else if (transfer.kind === 'pressure' || transfer.kind === 'urgent') log.w(msg, 'Market: ');
    else log.i(msg, 'Market: ');
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