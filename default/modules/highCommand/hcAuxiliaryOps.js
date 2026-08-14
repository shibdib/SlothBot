/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Auxiliary operation planning (power, commodity, mineral, rebuild).

 */


const state = require('hcState');

function auxEntryEligible(r, cache) {
    return r?.name && !cache[r.name] && !r.hostile && !Memory.nonCombatRooms.includes(r.name);
}

function auxiliaryOperations() {
    const cache = Memory.auxiliaryTargets || {};
    const auxLimit = state.AUXILIARY_LIMIT != null ? state.AUXILIARY_LIMIT : 3;
    const idx = global.getIntelIndexes ? global.getIntelIndexes() : {
        power: new Set(),
        commodity: new Set(),
        mineralCandidates: new Set(),
    };

    let activePowerOps = 0, activeCommodityOps = 0;
    for (const key in cache) {
        const op = cache[key];
        if (!op) continue;
        if (op.type === 'power') activePowerOps++;
        if (op.type === 'commodity') activeCommodityOps++;
    }

    if (MAX_LEVEL >= 4 && auxLimit > 0 && state.ALLOW_NEW_OPS) {
        // Power
        if (MAX_LEVEL >= 8 && activePowerOps === 0 && getResourceTotal(RESOURCE_POWER) < DUMP_AMOUNT) {
            let best = null, bestScore = Infinity;
            for (const rName of (idx.power || [])) {
                const r = INTEL[rName];
                if (!auxEntryEligible(r, cache)) continue;
                if (!r.power || r.power - CREEP_LIFE_TIME < Game.time) continue;
                const dist = findClosestOwnedRoom(r.name, true);
                if (dist > 8) continue;
                const timeRemaining = r.power - Game.time;
                const score = dist * 100 - Math.min(timeRemaining / 100, 50);
                if (score < bestScore) {
                    bestScore = score;
                    best = r;
                }
            }
            if (best) {
                cache[best.name] = {tick: Game.time, type: 'power', level: 1, priority: PRIORITIES.medium};
                log.a(`Power mining planned for ${roomLink(best.name)}`, 'HIGH COMMAND: ');
            }
        }

        // Commodity
        if (activeCommodityOps < auxLimit) {
            const cutoff = Game.market.credits < CREDIT_BUFFER * 2 ? 150 : 40;
            let best = null, bestDist = Infinity;
            for (const rName of (idx.commodity || [])) {
                const r = INTEL[rName];
                if (!auxEntryEligible(r, cache)) continue;
                if (!r.commodity || r.commodityCooldown >= cutoff || getResourceTotal(r.commodity) >= DUMP_AMOUNT) continue;
                const dist = findClosestOwnedRoom(r.name, true);
                if (dist <= 8 && dist < bestDist) {
                    bestDist = dist;
                    best = r;
                }
            }
            if (best) {
                cache[best.name] = {tick: Game.time, type: 'commodity', level: 1, priority: PRIORITIES.medium};
                log.a(`Commodity mining planned for ${roomLink(best.name)}`, 'HIGH COMMAND: ');
            }
        }

        // Mineral
        let bestMineral = null, bestDist = Infinity;
        for (const rName of (idx.mineralCandidates || [])) {
            const r = INTEL[rName];
            if (!auxEntryEligible(r, cache)) continue;
            if (MY_MINERALS[r.mineral]) continue;
            if (!myRoomInSectorCheck(r.name)) continue;
            const dist = findClosestOwnedRoom(r.name, true);
            if (dist <= 5 && dist < bestDist) {
                bestDist = dist;
                bestMineral = r;
            }
        }
        if (bestMineral) {
            cache[bestMineral.name] = {tick: Game.time, type: 'mineral', level: 1, priority: PRIORITIES.medium};
            log.a(`Mineral mining planned for ${roomLink(bestMineral.name)}`, 'HIGH COMMAND: ');
        }
    }

    // Rebuild — always allowed regardless of empire stress
    for (const r of MY_ROOMS) {
        if (Game.rooms[r].memory.buildersNeeded && INTEL[r] && !INTEL[r].hostile && !cache[r]) {
            cache[r] = {tick: Game.time, type: 'rebuild', level: 1, priority: PRIORITIES.priority};
            log.a(`Rebuild planned for ${roomLink(r)}`, 'HIGH COMMAND: ');
            break;
        }
    }

    Memory.auxiliaryTargets = cache;
}

module.exports = {

    auxiliaryOperations,

};