/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Per-room terminal keep amounts.
 */

const {isLaunchRoom, isCoreRoom} = require('module.colonyProfile');

// One lab load. Enough to pre-reserve upgrader WORK boosts so spawn/claim can start.
const UPGRADE_BOOST_WORKING_STOCK = 3000;
const CORE_BAR_KEEP = 10000;
const COMBAT_BOOST_TYPES = ['attack', 'ranged_attack', 'heal', 'tough', 'dismantle', 'move'];

let upgradePrefTick = -1;
let upgradePref = null;

function isHubRoom(room) {
    return !!(room && Memory._banker && Memory._banker.marketHub === room.name);
}

function isCombatT3Boost(resource) {
    if (!resource || typeof BOOST_USE === 'undefined' || !BOOST_USE) return false;
    for (let i = 0; i < COMBAT_BOOST_TYPES.length; i++) {
        const tiers = BOOST_USE[COMBAT_BOOST_TYPES[i]];
        if (tiers && tiers[0] === resource) return true;
    }
    return false;
}

function isUpgradeBoost(resource) {
    return !!(typeof BOOST_USE !== 'undefined' && BOOST_USE && BOOST_USE.upgrade
        && BOOST_USE.upgrade.includes(resource));
}

function roomCanUseUpgradeBoosts(room) {
    if (!room || !room.terminal || !(room.labs && room.labs.length)) return false;
    if (room.level < 6) return false;
    if (!room.energyState) return false;
    if (room.level === 8 && room.energyState < 2) return false;
    return true;
}

function preferredUpgradeBoost() {
    if (upgradePrefTick === Game.time) return upgradePref;
    upgradePrefTick = Game.time;
    upgradePref = null;
    if (typeof BOOST_USE === 'undefined' || !BOOST_USE || !BOOST_USE.upgrade) return null;
    const totalFn = typeof getResourceTotal === 'function' ? getResourceTotal : () => 0;
    for (let i = 0; i < BOOST_USE.upgrade.length; i++) {
        const t = BOOST_USE.upgrade[i];
        if ((totalFn(t) || 0) >= UPGRADE_BOOST_WORKING_STOCK) {
            upgradePref = t;
            return t;
        }
    }
    upgradePref = BOOST_USE.upgrade[0];
    return upgradePref;
}

function getRoomUpgradeBoostNeed(room, resource) {
    if (!roomCanUseUpgradeBoosts(room) || !isUpgradeBoost(resource)) return 0;
    const tiers = BOOST_USE.upgrade;
    let haveAll = 0;
    for (let i = 0; i < tiers.length; i++) haveAll += room.store(tiers[i]) || 0;
    const haveThis = room.store(resource) || 0;
    if (haveAll >= UPGRADE_BOOST_WORKING_STOCK) {
        return haveThis > 0 ? Math.min(haveThis, UPGRADE_BOOST_WORKING_STOCK) : 0;
    }
    if (haveThis > 0) return UPGRADE_BOOST_WORKING_STOCK;
    return resource === preferredUpgradeBoost() ? UPGRADE_BOOST_WORKING_STOCK : 0;
}

/**
 * What this room actually needs on hand: lab reaction inputs, reserved
 * boost labs, and a small upgrader working stock. Not the empire stockpile.
 */
function getRoomOperationalNeed(room, resource) {
    if (!room || !resource) return 0;
    let need = 0;
    const labs = room.labs || [];
    for (let i = 0; i < labs.length; i++) {
        const mem = labs[i].memory;
        if (!mem) continue;
        if (mem.itemNeeded === resource) need = Math.max(need, REACTION_AMOUNT);
        if (mem.neededBoost === resource) need = Math.max(need, mem.amount || 0);
    }
    need = Math.max(need, getRoomUpgradeBoostNeed(room, resource));
    return need;
}

/**
 * Floor a room may export down to when filling another room's operational
 * boost/lab need. Does not include hub BOOST_AMOUNT stockpile keep.
 */
function getOperationalProtectAmount(room, resource) {
    if (!room || resource === RESOURCE_OPS || resource === RESOURCE_POWER || resource === RESOURCE_ENERGY) {
        return 0;
    }
    let protect = getRoomOperationalNeed(room, resource);
    if (room.memory.neededCommodity === resource) {
        protect = Math.max(protect, REACTION_AMOUNT);
    }
    if (room.memory.commodityProduction) {
        const comm = COMMODITIES[room.memory.commodityProduction];
        if (comm && comm.components && comm.components[resource]) {
            protect = Math.max(protect, REACTION_AMOUNT);
        }
    }
    return protect;
}

function roomUsesResource(room, resource) {
    if (!room || !resource) return false;
    if (room.memory.producingBoost === resource) return true;
    if (room.memory.neededCommodity === resource) return true;
    if (resource === RESOURCE_GHODIUM && room.nuker) return true;
    if (room.memory.commodityProduction) {
        const comm = COMMODITIES[room.memory.commodityProduction];
        if (comm && comm.components && comm.components[resource]) return true;
    }
    for (const lab of room.labs || []) {
        if (lab.memory?.itemNeeded === resource) return true;
        if (lab.memory?.neededBoost === resource) return true;
    }
    return false;
}

function getRoomKeepAmount(room, resource) {
    if (resource === RESOURCE_OPS || resource === RESOURCE_POWER) return 0;
    if (resource === RESOURCE_ENERGY) return 0;
    if (ALL_COMMODITIES.includes(resource) && !COMPRESSED_COMMODITIES.includes(resource)) {
        if (room.memory.neededCommodity === resource) return REACTION_AMOUNT;
        if (room.memory.commodityProduction) {
            const comm = COMMODITIES[room.memory.commodityProduction];
            if (comm && comm.components && comm.components[resource]) return REACTION_AMOUNT;
        }
        return 0;
    }
    if (ALL_BOOSTS.includes(resource)) {
        // Combat T3 lives on launch rooms so waves spawn where the minerals are.
        // Core rooms (and the market hub if there is no core) warehouse the rest.
        if (isCombatT3Boost(resource) && isLaunchRoom(room)) return BOOST_AMOUNT(room, resource);
        if (!isCombatT3Boost(resource) && (isCoreRoom(room) || isHubRoom(room))) {
            return BOOST_AMOUNT(room, resource);
        }
        return getRoomOperationalNeed(room, resource);
    }
    if (resource === RESOURCE_BATTERY) return 1000;
    if (room.memory.commodityProduction && room.mineral && room.mineral.mineralType === resource) return REACTION_AMOUNT * 2;
    if (BASE_MINERALS.includes(resource)) return room.terminal ? REACTION_AMOUNT : 0;
    if (COMPRESSED_COMMODITIES.includes(resource)) {
        if (isCoreRoom(room) || isHubRoom(room)) return CORE_BAR_KEEP;
        return 1000;
    }
    return REACTION_AMOUNT;
}

function isStorageCapacityCritical(room) {
    return !!(room && room.storage && room.storage.store.getFreeCapacity() < STORAGE_CAPACITY * 0.1);
}

/**
 * Floor left in-room when evacuating under capacity pressure.
 * Storage critically full: drop generic keep (10k minerals / 50k boosts) so the
 * terminal can empty for the warehouse pile. Always protect active lab/boost work
 * and a send-energy buffer. Infinity = do not dump this resource.
 */
function getPressureProtectAmount(room, resource) {
    if (!room || resource === RESOURCE_OPS || resource === RESOURCE_POWER) return Infinity;

    const storageCritical = isStorageCapacityCritical(room);

    if (resource === RESOURCE_ENERGY) {
        if ((room.energyState || 0) < 2) return Infinity;
        const buffer = typeof TERMINAL_ENERGY_BUFFER !== 'undefined' ? TERMINAL_ENERGY_BUFFER : 15000;
        if (storageCritical) return buffer;
        const storageReserve = typeof STORAGE_ENERGY_RESERVE !== 'undefined' ? STORAGE_ENERGY_RESERVE : 25000;
        return storageReserve + buffer;
    }

    let protect = getOperationalProtectAmount(room, resource);
    if (room.memory.producingBoost === resource) {
        protect = Math.max(protect, BOOST_AMOUNT(room, resource));
    }

    if (!storageCritical) {
        protect = Math.max(protect, getRoomKeepAmount(room, resource) || 0);
    }
    return protect;
}

function empireHasSpareBoost(resource, minAmount = 100) {
    if (!resource || typeof MY_ROOMS === 'undefined') return false;
    for (let i = 0; i < MY_ROOMS.length; i++) {
        const room = Game.rooms[MY_ROOMS[i]];
        if (!room) continue;
        const spare = (room.store(resource) || 0) - getOperationalProtectAmount(room, resource);
        if (spare >= minAmount) return true;
    }
    return false;
}

function empireHasSpareBoostType(boostType, minAmount = 100) {
    if (!boostType || typeof BOOST_USE === 'undefined' || !BOOST_USE || !BOOST_USE[boostType]) return false;
    const tiers = BOOST_USE[boostType];
    for (let i = 0; i < tiers.length; i++) {
        if (empireHasSpareBoost(tiers[i], minAmount)) return true;
    }
    return false;
}

module.exports = {
    UPGRADE_BOOST_WORKING_STOCK,
    getRoomKeepAmount,
    getPressureProtectAmount,
    getOperationalProtectAmount,
    getRoomOperationalNeed,
    getRoomUpgradeBoostNeed,
    empireHasSpareBoost,
    empireHasSpareBoostType,
    isStorageCapacityCritical,
    isHubRoom,
    isCombatT3Boost,
    roomUsesResource,
};
