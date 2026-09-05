/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Auxiliary operation planning (power, commodity, mineral, rebuild).

 */


const state = require('hcState');

const POWER_MAX_RANGE = 8;
const POWER_MIN_AMOUNT = 2000;
const POWER_MIN_SPACE = 1;
const POWER_TRAVEL_PER_ROOM = 50;
const POWER_MINE_BUFFER = 1500;
const POWER_MAX_ATTACKERS = 2;
const POWER_HAULER_CARRY = 1250;
const POWER_BANK_MAX_HITS = typeof POWER_BANK_HITS !== 'undefined' ? POWER_BANK_HITS : 2000000;

function auxEntryEligible(r, cache, roomName) {
    const name = roomName || (r && r.name);
    if (!name || !r || cache[name] || r.hostile) return false;
    const banned = Memory.nonCombatRooms;
    return !(banned && banned.includes(name));
}

// Observer range is Chebyshev 8. Route hops inflate around SK/towers, so the
// spawn origin can be farther than the scan radius; still cap so TTL math holds.
const POWER_MAX_ROUTE = 16;

function closestPowerOriginHops(roomName) {
    if (!MY_ROOMS) return null;
    let bestLinear = Infinity;
    let bestRoute = Infinity;
    for (let i = 0; i < MY_ROOMS.length; i++) {
        const name = MY_ROOMS[i];
        const room = Game.rooms[name];
        if (!room || room.level < 8) continue;
        const linear = Game.map.getRoomLinearDistance(name, roomName);
        if (linear > POWER_MAX_RANGE) continue;
        const route = room.routeDistance(roomName);
        const hops = Number.isFinite(route) ? route : Infinity;
        if (hops > POWER_MAX_ROUTE) continue;
        if (linear < bestLinear || (linear === bestLinear && hops < bestRoute)) {
            bestLinear = linear;
            bestRoute = hops;
        }
    }
    return Number.isFinite(bestRoute) ? bestRoute : null;
}

function powerTimeNeeded(dist) {
    return dist * POWER_TRAVEL_PER_ROOM + POWER_MINE_BUFFER;
}

function isUncontestedPowerBank(r) {
    if (!r.power || r.power <= Game.time) return false;
    if (r.powerMined) return false;
    // Chip damage is not a contest — others adjacent is. Requiring full HP
    // dropped every bank that an explorer or NPC had poked.
    if (r.powerHits != null && r.powerHits < POWER_BANK_MAX_HITS * 0.8) return false;
    if (r.powerAmount != null && r.powerAmount < POWER_MIN_AMOUNT) return false;
    if (r.powerSpace != null && r.powerSpace < POWER_MIN_SPACE) return false;
    return true;
}

function scorePowerBank(r, dist) {
    const timeRemaining = r.power - Game.time;
    const amount = r.powerAmount || POWER_MIN_AMOUNT;
    return dist * 100 - Math.min(timeRemaining / 100, 50) - Math.min(amount / 100, 80);
}

function planPowerTeam(r) {
    // One unboosted 25-ATTACK body deals ~750 DPS. After travel that is well
    // under 2M hits in a single life, so never drop to a lone attacker just
    // because the bank has TTL left.
    const attackers = Math.min(Math.max(1, r.powerSpace || 1), POWER_MAX_ATTACKERS);
    const haulers = Math.max(1, Math.ceil((r.powerAmount || POWER_MIN_AMOUNT) / POWER_HAULER_CARRY));
    return {attackers, haulers};
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
        if (op.type === 'power' && !op.complete) activePowerOps++;
        if (op.type === 'commodity') activeCommodityOps++;
    }

    const readiness = state.EMPIRE_READINESS;
    // Power is income, not a siege. Combat-ready / aux-ready pauses froze banks
    // in otherwise healthy RCL 8 rooms (energyState 0 is still <250k at RCL 8).
    const milCpuOk = !readiness || readiness.militaryCpuOk !== false;
    const canLaunchPower = MAX_LEVEL >= 8 && activePowerOps < 2
        && getResourceTotal(RESOURCE_POWER) < DUMP_AMOUNT
        && milCpuOk;

    if (canLaunchPower) {
        let best = null, bestName = null, bestScore = Infinity;
        for (const rName of (idx.power || [])) {
            const r = INTEL[rName];
            if (!auxEntryEligible(r, cache, rName)) continue;
            if (!isUncontestedPowerBank(r)) continue;
            const dist = closestPowerOriginHops(rName);
            if (dist == null) continue;
            if (r.power - Game.time < powerTimeNeeded(dist)) continue;
            const score = scorePowerBank(r, dist);
            if (score < bestScore) {
                bestScore = score;
                best = r;
                bestName = rName;
            }
        }
        if (best && bestName) {
            const team = planPowerTeam(best);
            cache[bestName] = {
                tick: Game.time,
                type: 'power',
                level: 1,
                priority: PRIORITIES.medium,
                space: team.attackers,
                powerAmount: best.powerAmount,
                haulers: team.haulers,
            };
            log.a(`Power mining planned for ${roomLink(bestName)} (${best.powerAmount} power, ${team.attackers} attackers / ${team.attackers * 2} healers / ${team.haulers} haulers)`, 'HIGH COMMAND: ');
        }
    }

    if (MAX_LEVEL >= 4 && auxLimit > 0 && state.ALLOW_NEW_OPS) {
        // Commodity
        if (activeCommodityOps < auxLimit) {
            const cutoff = Game.market.credits < CREDIT_BUFFER * 2 ? 150 : 40;
            let best = null, bestDist = Infinity;
            for (const rName of (idx.commodity || [])) {
                const r = INTEL[rName];
                if (!auxEntryEligible(r, cache, rName)) continue;
                if (!r.commodity || r.commodityCooldown >= cutoff || getResourceTotal(r.commodity) >= DUMP_AMOUNT) continue;
                const dist = findClosestOwnedRoom(rName, true);
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
            if (!auxEntryEligible(r, cache, rName)) continue;
            if (MY_MINERALS[r.mineral]) continue;
            if (!myRoomInSectorCheck(rName)) continue;
            const dist = findClosestOwnedRoom(rName, true);
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
