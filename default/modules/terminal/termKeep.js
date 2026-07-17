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

module.exports = {getRoomKeepAmount};