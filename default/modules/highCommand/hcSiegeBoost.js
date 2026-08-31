/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Whether the empire can afford a new roomDenial. Far projection needs a real
 * T3 stockpile; peace-mode opportunistic targets are not worth the boosts.
 */

const {empireDistance, closestOwnedManhattan, listAutoSieges} = require('hcUtils');

const SIEGE_COMBAT_PARTS = [TOUGH, HEAL, RANGED_ATTACK, MOVE];

// Approximate T3 mineral for one 4-body longbow wave (30 per part).
const SIEGE_WAVE_COST = {
    [TOUGH]: 1000,
    [HEAL]: 2000,
    [RANGED_ATTACK]: 1000,
    [MOVE]: 1500,
};

const INTERIOR_WAVES = 1;
const NEAR_WAVES = 3;
const RESERVE_WAVES_PER_SIEGE = 2;
const BOOST_NEAR_DIST = 6;
const FAR_STOCK_RATIO = 0.5;
const T2_WEIGHT = 0.5;

let stockCache = {tick: -1, stocks: null};
let lastGateReason = null;

function setGateReason(reason) {
    lastGateReason = reason;
    return false;
}

function getSiegeGateReason() {
    return lastGateReason;
}

function noteSiegeGateReason(reason) {
    if (reason) lastGateReason = reason;
}

function sampleBoostRoom() {
    const names = (typeof MY_ROOMS !== 'undefined' && MY_ROOMS) || [];
    let fallback = null;
    for (let i = 0; i < names.length; i++) {
        const room = Game.rooms[names[i]];
        if (!room) continue;
        if (room.level >= 8) return room;
        if (!fallback && room.level >= 7) fallback = room;
    }
    return fallback || (names[0] && Game.rooms[names[0]]) || null;
}

function t3For(part) {
    const tiers = typeof BOOST_USE !== 'undefined' && BOOST_USE[part];
    return tiers && tiers[0];
}

function t2For(part) {
    const tiers = typeof BOOST_USE !== 'undefined' && BOOST_USE[part];
    return tiers && tiers[1];
}

function resourceTotal(resource) {
    if (!resource || typeof getResourceTotal !== 'function') return 0;
    return getResourceTotal(resource) || 0;
}

function combatReadyCount() {
    const names = (typeof MY_ROOMS !== 'undefined' && MY_ROOMS) || [];
    let n = 0;
    for (let i = 0; i < names.length; i++) {
        const room = Game.rooms[names[i]];
        if (room && room.level >= 7) n++;
    }
    return n;
}

function computeStocks() {
    const reservedSieges = listAutoSieges().length;
    const reservedWaves = reservedSieges * RESERVE_WAVES_PER_SIEGE;
    const room = sampleBoostRoom();
    const t3 = {};
    const weighted = {};
    const reserved = {};
    const free = {};
    const needFar = {};
    let stockpile = true;
    let stockpileReason = null;

    for (let i = 0; i < SIEGE_COMBAT_PARTS.length; i++) {
        const part = SIEGE_COMBAT_PARTS[i];
        const t3Res = t3For(part);
        const t2Res = t2For(part);
        const t3Amt = resourceTotal(t3Res);
        const t2Amt = resourceTotal(t2Res);
        t3[part] = t3Amt;
        weighted[part] = t3Amt + t2Amt * T2_WEIGHT;
        reserved[part] = reservedWaves * (SIEGE_WAVE_COST[part] || 0);
        free[part] = weighted[part] - reserved[part];

        const target = room && t3Res && typeof BOOST_AMOUNT === 'function'
            ? BOOST_AMOUNT(room, t3Res) * FAR_STOCK_RATIO
            : Infinity;
        needFar[part] = target;
        if (t3Amt - reserved[part] < target) {
            stockpile = false;
            if (!stockpileReason) {
                const have = Math.floor(t3Amt - reserved[part]);
                stockpileReason = `no ${t3Res || part} stockpile (${have}/${Math.floor(target)})`;
            }
        }
    }

    return {
        t3,
        free,
        reserved,
        needFar,
        stockpile,
        stockpileReason,
        combatRooms: combatReadyCount(),
        reservedSieges,
    };
}

function getCombatBoostStocks() {
    if (stockCache.tick === Game.time && stockCache.stocks) return stockCache.stocks;
    const stocks = computeStocks();
    stockCache = {tick: Game.time, stocks};
    return stocks;
}

function isEmpireInterior(roomName) {
    if (!roomName) return false;
    if (typeof HOLD_SECTOR !== 'undefined' && HOLD_SECTOR
        && typeof myRoomInSectorCheck === 'function' && myRoomInSectorCheck(roomName)) {
        return true;
    }
    const bubble = typeof DEFENSIVE_BUBBLE !== 'undefined' ? DEFENSIVE_BUBBLE : 1;
    return closestOwnedManhattan(roomName) <= bubble;
}

function siegeBoostBand(roomName) {
    if (isEmpireInterior(roomName)) return 'interior';
    const d = empireDistance(roomName);
    if (Number.isFinite(d) && d <= BOOST_NEAR_DIST) return 'near';
    return 'far';
}

function isActiveWarEnemy(user) {
    if (!user) return false;
    if (typeof HOSTILES !== 'undefined' && HOSTILES && HOSTILES.includes(user)) return true;
    if (typeof ENEMIES !== 'undefined' && ENEMIES && ENEMIES.includes(user)) return true;
    if (typeof THREATS !== 'undefined' && THREATS && THREATS.includes(user)) return true;
    if (typeof MANUAL_WAR_TARGETS !== 'undefined' && MANUAL_WAR_TARGETS && MANUAL_WAR_TARGETS.includes(user)) {
        return true;
    }
    if (typeof WAR_TARGETS === 'undefined' || !WAR_TARGETS) return false;
    for (let i = 0; i < WAR_TARGETS.length; i++) {
        const t = WAR_TARGETS[i];
        if (!t || t.user !== user) continue;
        if (t.manual) return true;
        if (t.reason && t.reason.indexOf('weak') !== 0) return true;
    }
    return false;
}

function waveShortReason(part, have, need) {
    const res = t3For(part) || part;
    return `${res} ${Math.floor(have)} < ${Math.floor(need)}`;
}

/**
 * New auto roomDenial only. Manual flags and in-flight sieges are not gated.
 * Interior: backyard / same sector — 1 wave of each combat boost is enough.
 * Near: within BOOST_NEAR_DIST of the empire center — 3 waves free.
 * Far: real T3 stockpile, and only against active enemies. Peace is fine.
 */
function resetSiegeGateReason() {
    lastGateReason = null;
}

function siegeAffordable(intel) {
    if (!intel || !intel.name) return setGateReason('no intel');

    const band = siegeBoostBand(intel.name);
    if (band !== 'interior' && !isActiveWarEnemy(intel.owner)) {
        return setGateReason('no active enemies (peace)');
    }

    const stocks = getCombatBoostStocks();
    if (band === 'far') {
        if (!stocks.stockpile) return setGateReason(stocks.stockpileReason || 'no combat stockpile');
        return true;
    }

    const waves = band === 'interior' ? INTERIOR_WAVES : NEAR_WAVES;
    for (let i = 0; i < SIEGE_COMBAT_PARTS.length; i++) {
        const part = SIEGE_COMBAT_PARTS[i];
        const need = waves * (SIEGE_WAVE_COST[part] || 0);
        if (stocks.free[part] < need) {
            return setGateReason(`${band} ${waveShortReason(part, stocks.free[part], need)}`);
        }
    }
    return true;
}

if (typeof global !== 'undefined') {
    global.siegeBoosts = function (roomName) {
        const stocks = getCombatBoostStocks();
        const band = roomName ? siegeBoostBand(roomName) : null;
        console.log(`Siege boosts: stockpile=${stocks.stockpile}  reserved sieges=${stocks.reservedSieges}  RCL7+=${stocks.combatRooms}`);
        for (let i = 0; i < SIEGE_COMBAT_PARTS.length; i++) {
            const part = SIEGE_COMBAT_PARTS[i];
            const t3Res = t3For(part);
            console.log(`  ${part}  t3 ${Math.floor(stocks.t3[part])}  free ${Math.floor(stocks.free[part])}  farNeed ${Math.floor(stocks.needFar[part])}  (${t3Res})`);
        }
        if (roomName) {
            const intel = typeof INTEL !== 'undefined' ? INTEL[roomName] : {name: roomName};
            console.log(`  ${roomName} band=${band} interior=${isEmpireInterior(roomName)} enemy=${isActiveWarEnemy(intel && intel.owner)} ok=${siegeAffordable(intel || {name: roomName})}`);
            if (lastGateReason) console.log(`  gate: ${lastGateReason}`);
        }
        return stocks;
    };
}

module.exports = {
    siegeAffordable,
    siegeBoostBand,
    isEmpireInterior,
    isActiveWarEnemy,
    getSiegeGateReason,
    resetSiegeGateReason,
    noteSiegeGateReason,
    getCombatBoostStocks,
    SIEGE_COMBAT_PARTS,
    BOOST_NEAR_DIST,
};
