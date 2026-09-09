/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Auxiliary operation planning (power, commodity, mineral, rebuild).

 */


const state = require('hcState');

const POWER_MAX_RANGE = 12;
const POWER_MIN_AMOUNT = 1000;
const POWER_MIN_SPACE = 1;
const POWER_TRAVEL_PER_ROOM = 50;
const POWER_SPAWN_BUFFER = 150;
const POWER_MAX_ATTACKERS = 2;
const POWER_MAX_OPS = 3;
const POWER_HAULER_CARRY = 1250;
const POWER_HEALER_COST = 6000;
const POWER_ATTACK_DPS = 25 * (typeof ATTACK_POWER !== 'undefined' ? ATTACK_POWER : 30);
const POWER_BANK_MAX_HITS = typeof POWER_BANK_HITS !== 'undefined' ? POWER_BANK_HITS : 2000000;
const POWER_SKIP_LOG_INTERVAL = 100;
let lastPowerSkipLog = 0;

function auxEntryEligible(r, cache, roomName) {
    const name = roomName || (r && r.name);
    if (!name || !r || cache[name] || r.hostile) return false;
    const banned = Memory.nonCombatRooms;
    return !(banned && banned.includes(name));
}

function closestPowerOrigin(roomName) {
    if (!MY_ROOMS) return null;
    let bestLinear = Infinity;
    for (let i = 0; i < MY_ROOMS.length; i++) {
        const name = MY_ROOMS[i];
        const room = Game.rooms[name];
        if (!roomCanSpawnPower(room)) continue;
        const linear = Game.map.getRoomLinearDistance(name, roomName);
        if (linear > POWER_MAX_RANGE) continue;
        if (linear < bestLinear) bestLinear = linear;
    }
    if (!Number.isFinite(bestLinear)) return null;
    return {linear: bestLinear};
}

function roomCanSpawnPower(room) {
    return !!(room && room.controller && room.controller.level >= 8
        && (room.energyCapacityAvailable || 0) >= POWER_HEALER_COST);
}

function anyPowerOrigin() {
    if (!MY_ROOMS) return false;
    for (let i = 0; i < MY_ROOMS.length; i++) {
        if (roomCanSpawnPower(Game.rooms[MY_ROOMS[i]])) return true;
    }
    return false;
}

function forEachPowerRoom(cb) {
    const seen = {};
    const idx = global.getIntelIndexes ? global.getIntelIndexes() : null;
    if (idx && idx.power) {
        for (const rName of idx.power) {
            seen[rName] = true;
            cb(rName, INTEL[rName]);
        }
    }
    const intel = global.INTEL || {};
    for (const rName in intel) {
        if (seen[rName]) continue;
        const r = intel[rName];
        if (r && r.power > Game.time) cb(rName, r);
    }
}

function powerOriginSkipReason() {
    if (!MY_ROOMS) return 'no RCL8 origin in range';
    let rcl8 = 0;
    let spawnCap = 0;
    for (let i = 0; i < MY_ROOMS.length; i++) {
        const room = Game.rooms[MY_ROOMS[i]];
        if (!room || !room.controller || room.controller.level < 8) continue;
        rcl8++;
        if ((room.energyCapacityAvailable || 0) >= POWER_HEALER_COST) spawnCap++;
    }
    if (!rcl8) return 'no RCL 8';
    if (!spawnCap) return `RCL8 energy cap < ${POWER_HEALER_COST}`;
    return `no RCL8 within ${POWER_MAX_RANGE} rooms`;
}

function powerAttackersFor(r) {
    return Math.min(Math.max(1, r.powerSpace || 1), POWER_MAX_ATTACKERS);
}

function powerTimeNeeded(r, linear) {
    const hits = r.powerHits != null ? r.powerHits : POWER_BANK_MAX_HITS;
    const mineTicks = Math.ceil(hits / (powerAttackersFor(r) * POWER_ATTACK_DPS));
    // Travel uses Chebyshev, not inflated SK route hops. Replacements keep a
    // seat filled, so this is hits/dps rather than one 1500-tick life.
    return linear * POWER_TRAVEL_PER_ROOM + mineTicks + POWER_SPAWN_BUFFER;
}

function isUncontestedPowerBank(r) {
    if (!r.power || r.power <= Game.time) return false;
    if (r.powerMined) return false;
    if (r.powerAmount != null && r.powerAmount < POWER_MIN_AMOUNT) return false;
    if (r.powerSpace != null && r.powerSpace < POWER_MIN_SPACE) return false;
    return true;
}

function scorePowerBank(r, linear) {
    const timeRemaining = r.power - Game.time;
    const amount = r.powerAmount || POWER_MIN_AMOUNT;
    return linear * 80 - Math.min(timeRemaining / 80, 40) - Math.min(amount / 40, 200);
}

function logPowerSkip(reason) {
    if (lastPowerSkipLog + POWER_SKIP_LOG_INTERVAL > Game.time) return;
    lastPowerSkipLog = Game.time;
    log.a(`Power mining skipped — ${reason}`, 'HIGH COMMAND: ');
}

function powerBankSkipReason(rName, r, cache) {
    if (!r) return 'no intel';
    const existing = cache[rName];
    // Highway rooms hold banks AND deposits. A commodity/mineral op must not
    // sit on the only aux slot and starve a 5k-TTL bank.
    if (existing && existing.type === 'power') {
        if (!existing.complete) return 'already targeted';
        if (!(r.power > Game.time)) return 'already targeted (complete)';
    }
    const banned = Memory.nonCombatRooms;
    if (banned && banned.includes(rName)) return 'non-combat';
    if (!r.power || r.power <= Game.time) return 'expired';
    if (r.powerMined) return 'contested';
    if (r.powerAmount != null && r.powerAmount < POWER_MIN_AMOUNT) return `amount ${r.powerAmount} < ${POWER_MIN_AMOUNT}`;
    if (r.powerSpace != null && r.powerSpace < POWER_MIN_SPACE) return `space ${r.powerSpace}`;
    const origin = closestPowerOrigin(rName);
    if (!origin) return powerOriginSkipReason();
    const left = r.power - Game.time;
    const need = powerTimeNeeded(r, origin.linear);
    if (left < need) {
        return `ttl ${left} < ${need} (${origin.linear} rooms, ${r.powerSpace != null ? r.powerSpace : '?'} seats, ${r.powerAmount || '?'} power)`;
    }
    return null;
}

function planPowerTeam(r) {
    // One unboosted 25-ATTACK body deals ~750 DPS. After travel that is well
    // under 2M hits in a single life, so never drop to a lone attacker just
    // because the bank has TTL left.
    const attackers = powerAttackersFor(r);
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

    // Power is income, not a siege. Combat-ready / aux-ready / militaryCpuOk
    // froze banks in otherwise healthy RCL 8 rooms (energyState 0 is still
    // <250k at RCL 8). Only skip when the bucket is in emergency.
    const bucket = (typeof Game !== 'undefined' && Game.cpu && Game.cpu.bucket) || 0;
    const canLaunchPower = anyPowerOrigin() && activePowerOps < POWER_MAX_OPS && bucket >= 500;

    if (!canLaunchPower) {
        let why;
        if (activePowerOps >= POWER_MAX_OPS) why = `${activePowerOps} ops already running`;
        else if (bucket < 500) why = `bucket ${bucket}`;
        else why = powerOriginSkipReason();
        logPowerSkip(why);
    } else {
        const slots = POWER_MAX_OPS - activePowerOps;
        const candidates = [];
        let skipNote = null;
        let skipAmount = -1;
        forEachPowerRoom((rName, r) => {
            const skip = powerBankSkipReason(rName, r, cache);
            if (skip) {
                const amount = (r && r.powerAmount) || 0;
                if (amount >= skipAmount) {
                    skipAmount = amount;
                    skipNote = `${roomLink(rName)}: ${skip}`;
                }
                return;
            }
            const origin = closestPowerOrigin(rName);
            candidates.push({r, rName, linear: origin.linear, score: scorePowerBank(r, origin.linear)});
        });
        candidates.sort((a, b) => a.score - b.score);
        const take = Math.min(slots, candidates.length);
        for (let i = 0; i < take; i++) {
            const {r, rName} = candidates[i];
            const team = planPowerTeam(r);
            const previous = cache[rName];
            cache[rName] = {
                tick: Game.time,
                type: 'power',
                level: 1,
                priority: PRIORITIES.urgent,
                space: team.attackers,
                powerAmount: r.powerAmount,
                haulers: team.haulers,
            };
            const replaced = previous && previous.type && previous.type !== 'power'
                ? ` (replaced ${previous.type})` : '';
            log.a(`Power mining planned for ${roomLink(rName)} (${r.powerAmount} power, ${team.attackers} attackers / ${team.attackers * 2} healers / ${team.haulers} haulers)${replaced}`, 'HIGH COMMAND: ');
        }
        if (!take) {
            const n = idx.power && (idx.power.size != null ? idx.power.size : 0);
            logPowerSkip(skipNote || (n ? 'no launchable banks' : 'no banks in intel'));
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
                if (r.power && r.power > Game.time && isUncontestedPowerBank(r)) continue;
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

    // Rebuild — always allowed regardless of empire stress. Every baby room
    // gets its own mission so drones actually assign.
    for (const r of MY_ROOMS) {
        const room = Game.rooms[r];
        if (!room || !room.memory.buildersNeeded) continue;
        const existing = cache[r];
        if (existing && existing.type === 'rebuild') continue;
        cache[r] = {tick: Game.time, type: 'rebuild', level: 1, priority: PRIORITIES.priority};
        log.a(`Rebuild planned for ${roomLink(r)}`, 'HIGH COMMAND: ');
    }

    Memory.auxiliaryTargets = cache;
}

function powerDebug(roomName) {
    const bucket = (typeof Game !== 'undefined' && Game.cpu && Game.cpu.bucket) || 0;
    const stock = typeof getResourceTotal === 'function' ? getResourceTotal(RESOURCE_POWER) : 0;
    const cache = Memory.auxiliaryTargets || {};
    let activePower = 0;
    for (const key in cache) {
        if (cache[key] && cache[key].type === 'power' && !cache[key].complete) activePower++;
    }
    const bucketOk = bucket >= 500;
    log.a(`t=${Game.time} maxRCL=${typeof MAX_LEVEL !== 'undefined' ? MAX_LEVEL : '?'} bucket=${bucket} stock=${stock} origin=${anyPowerOrigin()} powerOps=${activePower}/${POWER_MAX_OPS} canLaunch=${anyPowerOrigin() && activePower < POWER_MAX_OPS && bucketOk}`, 'POWER DEBUG: ');
    if (MY_ROOMS) {
        for (let i = 0; i < MY_ROOMS.length; i++) {
            const room = Game.rooms[MY_ROOMS[i]];
            if (!room || !room.controller || room.controller.level < 8) continue;
            log.a(`${roomLink(MY_ROOMS[i])} rcl=${room.controller.level} lvl=${room.level} cap=${room.energyCapacityAvailable} spawnOk=${roomCanSpawnPower(room)}`, 'POWER DEBUG: ');
        }
    }
    const idx = global.getIntelIndexes ? global.getIntelIndexes() : {power: new Set()};
    const indexed = idx.power ? [...idx.power] : [];
    log.a(`index ${indexed.length} [${indexed.join(',')}]`, 'POWER DEBUG: ');
    const names = [];
    if (roomName) names.push(roomName);
    forEachPowerRoom((n) => {
        if (!names.includes(n)) names.push(n);
    });
    if (!names.length) log.a('no power banks in intel/index', 'POWER DEBUG: ');
    for (let i = 0; i < names.length; i++) {
        const n = names[i];
        const r = INTEL[n];
        const skip = powerBankSkipReason(n, r, cache);
        const ttl = r && r.power ? r.power - Game.time : '?';
        const op = cache[n];
        const opTag = op ? ` op=${op.type}${op.complete ? '/complete' : ''}` : '';
        log.a(`${roomLink(n)} amount=${r && r.powerAmount} space=${r && r.powerSpace} ttl=${ttl} hits=${r && r.powerHits}${opTag} => ${skip || 'LAUNCHABLE'}`, 'POWER DEBUG: ');
    }
}

if (typeof global !== 'undefined') global.powerDebug = powerDebug;

module.exports = {

    auxiliaryOperations,
    powerDebug,

};
