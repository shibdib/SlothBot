/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Empire-wide terminal ledger: supply, demand, and bar/base equivalence.
 */

const state = require('termState');
const {getRoomKeepAmount} = require('termKeep');
const FactoryControl = require('module.factoryController');
const profiler = require('tools.profiler');

const FACTORY_ENERGY_BATCH = 50000;
const LEDGER_TTL = 25;

let equivalenceCache = null;

function buildEquivalenceMap() {
    // COMMODITIES is static — build once per global, not every tick.
    if (equivalenceCache) return equivalenceCache;

    const map = {};
    for (const product of Object.keys(COMMODITIES)) {
        const def = COMMODITIES[product];
        if (!def || !def.components) continue;

        if (product === RESOURCE_ENERGY && def.components[RESOURCE_BATTERY]) {
            const batteryIn = def.components[RESOURCE_BATTERY];
            map[RESOURCE_BATTERY] = [{
                base: RESOURCE_ENERGY,
                ratio: FACTORY_ENERGY_BATCH / batteryIn,
            }];
            continue;
        }

        const entries = [];
        for (const component of Object.keys(def.components)) {
            if (component === RESOURCE_ENERGY) continue;
            entries.push({base: component, ratio: def.components[component]});
        }
        if (entries.length) map[product] = entries;
    }

    equivalenceCache = map;
    return map;
}

function trackedResources() {
    const set = new Set([
        ...BASE_MINERALS,
        ...ALL_BOOSTS,
        ...COMPRESSED_COMMODITIES,
        RESOURCE_ENERGY,
        RESOURCE_GHODIUM,
        RESOURCE_OPS,
        RESOURCE_POWER,
    ]);
    for (const name of MY_ROOMS) {
        const room = Game.rooms[name];
        if (!room) continue;
        for (const lab of room.labs || []) {
            if (lab.memory && lab.memory.itemNeeded) set.add(lab.memory.itemNeeded);
        }
        if (room.memory.neededCommodity) set.add(room.memory.neededCommodity);
        if (room.memory.commodityProduction) {
            const comm = COMMODITIES[room.memory.commodityProduction];
            if (comm && comm.components) {
                for (const component of Object.keys(comm.components)) set.add(component);
            }
        }
    }
    return set;
}

function collectSupply(resources) {
    const supply = {};
    for (const resource of resources) {
        supply[resource] = getResourceTotal(resource);
    }
    return supply;
}

function collectDemand(resources) {
    const {getRoomEffective, getRoomResourceDemand} = require('termTransfers');
    const demand = {};
    const urgent = [];

    for (const resource of resources) {
        let need = 0;
        for (const name of MY_ROOMS) {
            const room = Game.rooms[name];
            if (!room) continue;
            need += getRoomKeepAmount(room, resource);
        }
        if (need) demand[resource] = need;
    }

    for (const name of MY_ROOMS) {
        const room = Game.rooms[name];
        if (!room) continue;

        const roomLabNeeds = new Set();
        for (const lab of room.labs || []) {
            if (lab.memory && lab.memory.itemNeeded) roomLabNeeds.add(lab.memory.itemNeeded);
        }
        for (const resource of roomLabNeeds) {
            const target = REACTION_AMOUNT;
            const roomDemand = getRoomResourceDemand(room, resource);
            const keepOnly = getRoomKeepAmount(room, resource);
            if (roomDemand > keepOnly) {
                demand[resource] = (demand[resource] || 0) + (roomDemand - keepOnly);
            }

            if (!room.terminal) continue;
            const stored = getRoomEffective(room, resource);
            if (stored < target * 0.5) {
                urgent.push({resource, room: name, deficit: target - stored});
            }
        }

        const batteryNeed = FactoryControl.factoryBatteryInboundNeed(room);
        if (batteryNeed > 0) {
            demand[RESOURCE_BATTERY] = Math.max(demand[RESOURCE_BATTERY] || 0, batteryNeed);
            if (room.terminal) {
                const stored = room.store(RESOURCE_BATTERY);
                if (stored < batteryNeed * 0.5) {
                    urgent.push({resource: RESOURCE_BATTERY, room: name, deficit: batteryNeed - stored});
                }
            }
        }
    }

    return {demand, urgent};
}

function computeEffectiveSupply(supply, equivalence) {
    const effective = {...supply};
    for (const derived of Object.keys(equivalence)) {
        const qty = supply[derived] || 0;
        if (!qty) continue;
        for (const {base, ratio} of equivalence[derived]) {
            effective[base] = (effective[base] || 0) + qty * ratio;
        }
    }
    return effective;
}

function buildLedger() {
    const equivalence = buildEquivalenceMap();
    const resources = trackedResources();
    const supply = collectSupply(resources);
    const {demand, urgent} = collectDemand(resources);
    const effectiveSupply = computeEffectiveSupply(supply, equivalence);

    const {selectMarketHub} = require('termMarket');
    const {planTransfers} = require('termTransfers');
    const {buildSendBudget} = require('termBudget');

    const marketHub = selectMarketHub();
    const ledgerDraft = {
        tick: Game.time,
        supply,
        demand,
        effectiveSupply,
        urgent,
        equivalence,
        marketHub,
    };
    const plannedTransfers = planTransfers(ledgerDraft);
    const sendBudget = buildSendBudget();

    const ledger = {
        ...ledgerDraft,
        plannedTransfers,
        sendBudget,
    };

    state.ledger = ledger;
    return state.ledger;
}

function getLedger(force = false) {
    if (state.ledger && state.ledger.tick === Game.time) return state.ledger;
    if (!force && state.ledger && state.ledger.tick + LEDGER_TTL > Game.time) return state.ledger;
    return buildLedger();
}

function getEffectiveSupply(resource, ledger = state.ledger) {
    if (!ledger) ledger = getLedger();
    if (ledger.effectiveSupply[resource] != null) return ledger.effectiveSupply[resource];
    return ledger.supply[resource] || 0;
}

function getEmpireDemand(resource, ledger = state.ledger) {
    if (!ledger) ledger = getLedger();
    if (ledger.demand[resource] == null) return 0;
    return ledger.demand[resource];
}

function canEmpireSell(resource, ledger = state.ledger) {
    if (!ledger) ledger = getLedger();
    if (resource === RESOURCE_OPS || resource === RESOURCE_POWER) return false;

    const equivalence = ledger.equivalence[resource];
    if (equivalence && equivalence.length) {
        for (const {base, ratio} of equivalence) {
            const effective = ledger.effectiveSupply[base] || 0;
            const demand = ledger.demand[base] || 0;
            if (effective < demand + ratio) return false;
        }
        return true;
    }

    if (BASE_MINERALS.includes(resource) || ALL_BOOSTS.includes(resource) || resource === RESOURCE_GHODIUM) {
        const effective = ledger.effectiveSupply[resource] || 0;
        const demand = ledger.demand[resource] || 0;
        const margin = ALL_BOOSTS.includes(resource) ? demand * 0.5 : 0;
        if (effective < demand + margin) return false;
        return true;
    }

    const effective = ledger.effectiveSupply[resource] || ledger.supply[resource] || 0;
    const demand = ledger.demand[resource] || 0;
    return effective >= demand;
}

function compressedSellableUnits(resource, inTerminal, ledger = state.ledger) {
    if (!ledger) ledger = getLedger();
    if (!inTerminal) return 0;
    const equivalence = ledger.equivalence[resource];
    if (!equivalence || !equivalence.length) return 0;

    let sellable = inTerminal;
    for (const {base, ratio} of equivalence) {
        const surplus = Math.max(0, (ledger.effectiveSupply[base] || 0) - (ledger.demand[base] || 0));
        sellable = Math.min(sellable, Math.floor(surplus / ratio));
    }
    return sellable;
}

profiler.registerObject({
    buildLedger,
    getLedger,
    buildEquivalenceMap,
    canEmpireSell,
    getEffectiveSupply,
    getEmpireDemand,
    compressedSellableUnits,
}, 'TermNetwork');

module.exports = {
    buildLedger,
    getLedger,
    buildEquivalenceMap,
    canEmpireSell,
    getEffectiveSupply,
    getEmpireDemand,
    compressedSellableUnits,
};