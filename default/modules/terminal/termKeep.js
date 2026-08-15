/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Per-room terminal keep amounts.
 */

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
    if (ALL_BOOSTS.includes(resource)) return BOOST_AMOUNT(room, resource);
    if (resource === RESOURCE_BATTERY) return 1000;
    if (room.memory.commodityProduction && room.mineral && room.mineral.mineralType === resource) return REACTION_AMOUNT * 2;
    if (BASE_MINERALS.includes(resource)) return room.terminal ? REACTION_AMOUNT : 0;
    if (COMPRESSED_COMMODITIES.includes(resource)) return 1000;
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

    let protect = 0;
    for (const lab of room.labs || []) {
        if (lab.memory?.itemNeeded === resource) {
            protect = Math.max(protect, REACTION_AMOUNT);
        }
        if (lab.memory?.neededBoost === resource) {
            const amt = lab.memory.amount || BOOST_AMOUNT(room, resource);
            protect = Math.max(protect, amt);
        }
    }
    if (room.memory.producingBoost === resource) {
        protect = Math.max(protect, BOOST_AMOUNT(room, resource));
    }
    if (room.memory.neededCommodity === resource) {
        protect = Math.max(protect, REACTION_AMOUNT);
    }
    if (room.memory.commodityProduction) {
        const comm = COMMODITIES[room.memory.commodityProduction];
        if (comm && comm.components && comm.components[resource]) {
            protect = Math.max(protect, REACTION_AMOUNT);
        }
    }

    if (!storageCritical) {
        protect = Math.max(protect, getRoomKeepAmount(room, resource) || 0);
    }
    return protect;
}

module.exports = {getRoomKeepAmount, getPressureProtectAmount, isStorageCapacityCritical};