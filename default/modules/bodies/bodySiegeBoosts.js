/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Siege boost sizing: TOUGH/HEAL parts vs tower damage and lab stock.
 */

const toughMulti = {GO: 0.75, GHO2: 0.55, XGHO2: 0.35};

// HEAL/TOUGH gate the siege body. RA/MOVE are lab wish-list only.
const SIEGE_REQUIRED_BOOSTS = [TOUGH, HEAL];
const SIEGE_OPTIONAL_BOOSTS = [RANGED_ATTACK, MOVE];

function isOptionalSiegeBoost(part) {
    return part === RANGED_ATTACK || part === MOVE;
}

function siegeLabBoosts() {
    return SIEGE_REQUIRED_BOOSTS.concat(SIEGE_OPTIONAL_BOOSTS);
}

function moveFatigueFactor(boost) {
    if (!boost || !BOOSTS[MOVE] || !BOOSTS[MOVE][boost]) return 1;
    return BOOSTS[MOVE][boost].fatigue || 1;
}

function getMaxSiegeCombatBudget(moveFactor = 1) {
    const factor = Math.max(1, moveFactor || 1);
    return Math.floor(50 * factor / (factor + 1));
}

function getMaxSiegeHealParts(toughCount = 0, rangedParts = 0, moveFactor = 1) {
    return Math.max(1, getMaxSiegeCombatBudget(moveFactor) - toughCount - rangedParts);
}

function checkForNeededMove(gen, squadSize = 1) {
    const listed = gen.creepInfo && gen.creepInfo.misc && gen.creepInfo.misc.boosts;
    if (!listed || !listed.includes(MOVE) || !BOOST_USE[MOVE]) {
        return {boost: undefined, factor: 1};
    }
    for (const boost of BOOST_USE[MOVE]) {
        const factor = moveFatigueFactor(boost);
        if (factor < 2) continue;
        const moveParts = Math.ceil(getMaxSiegeCombatBudget(factor) / factor);
        if (gen.room.store(boost) >= LAB_BOOST_MINERAL * moveParts * squadSize) {
            return {boost, factor, moveParts};
        }
    }
    return {boost: undefined, factor: 1};
}

// Hits lost on the focused target after one volley. Tough only multiplies
// the raw it can actually absorb (hits / toughMod); overflow is full damage.
// abilityPower.effectiveHeal = heal / toughMod assumes infinite tough, which
// 6 T3 parts cannot cover for a 6-tower close dump (3600 raw vs 2000 cover).
function hitsFromDump(damage, toughHits, toughMod) {
    if (!(damage > 0)) return 0;
    if (!(toughHits > 0) || !(toughMod > 0) || toughMod >= 1) return damage;
    const rawCovered = toughHits / toughMod;
    if (damage <= rawCovered) return Math.ceil(damage * toughMod);
    return Math.ceil(toughHits + (damage - rawCovered));
}

function getSiegeTowerDamage(intel) {
    if (!intel) return 0;
    const n = intel.towers || 0;
    const td = intel.towerData;
    // Focus-fire dump at range ≤5 (n × 600). Attack routing should still pick
    // the far face; this is the volley we have to survive if we cannot.
    let damage = n * TOWER_POWER_ATTACK;
    if (!damage && td) {
        damage = td.average || td.maxDamage || 0;
    }
    const op = (td && td.operateMult) || (td && td.operated ? 1.5 : 1);
    if (op > 1) damage = Math.ceil(damage * op);
    return damage;
}

function determineNeededHeals(damage) {
    const healTiers = {};
    let tier = 0;
    for (const boost of BOOST_USE[HEAL]) {
        const healPowerPerHeal = HEAL_POWER * BOOSTS[HEAL][boost].heal;
        healTiers[tier] = {};
        healTiers[tier].amount = Math.ceil(damage / healPowerPerHeal);
        healTiers[tier].tier = tier;
        healTiers[tier].boost = boost;
        tier++;
    }
    return healTiers;
}

function checkForNeededHeal(gen, exposureBodies = 1, toughModifier = 1, rangedParts = false, toughCount = 0, moveFactor = 1) {
    const destination = gen.creepInfo.destination;
    const intel = INTEL[destination];
    const damageToTank = getSiegeTowerDamage(intel);
    if (!damageToTank) {
        return false;
    }

    // Towers focus-fire one body. That body's tough absorbs first; squad heal
    // is pooled. exposureBodies < 1 is this body's share of the pool (1/waitFor).
    // exposureBodies >= 1 is a single healer covering that many times the dump
    // (siege-duo stacked pair).
    const dumpMult = exposureBodies >= 1 ? exposureBodies : 1;
    const squadShare = (exposureBodies > 0 && exposureBodies < 1) ? exposureBodies : 1;
    const hitsLost = hitsFromDump(damageToTank * dumpMult, (toughCount || 0) * 100, toughModifier || 1);
    const perBodyHits = Math.ceil(hitsLost * squadShare);

    const tiers = determineNeededHeals(perBodyHits);
    const MIN_RANGED_PARTS = rangedParts ? 5 : 0;
    const MAX_HEAL_PARTS = getMaxSiegeHealParts(toughCount, MIN_RANGED_PARTS, moveFactor);
    const moveShare = BODYPART_COST[MOVE] / Math.max(1, moveFactor || 1);
    const reservedEnergy = MIN_RANGED_PARTS * (BODYPART_COST[RANGED_ATTACK] + moveShare);
    const energyPerHealPair = BODYPART_COST[HEAL] + moveShare;

    function tryTier(tier) {
        const rawHeals = tier.amount;
        if (rawHeals > MAX_HEAL_PARTS || rawHeals < 1) return 0;
        if (rawHeals * energyPerHealPair + reservedEnergy > gen.energyAmount) return 0;
        if (gen.room.store(tier.boost) < 30 * rawHeals) return 0;
        return rawHeals;
    }

    const tierKeys = Object.keys(tiers);
    let chosen;
    let chosenHeals = 0;
    for (const key of tierKeys) {
        const heals = tryTier(tiers[key]);
        if (!heals) continue;
        chosen = tiers[key];
        chosenHeals = heals;
        break;
    }

    if (!chosen) {
        for (let i = tierKeys.length - 1; i >= 0; i--) {
            const heals = tryTier(tiers[tierKeys[i]]);
            if (!heals) continue;
            chosen = tiers[tierKeys[i]];
            chosenHeals = heals;
            break;
        }
    }

    if (!chosen) {
        return false;
    }

    gen.creepInfo.neededBoosts = {
        boostPart: HEAL,
        boost: chosen.boost,
        boostTier: chosen.tier,
        amount: chosenHeals,
    };
    return chosenHeals;
}

function checkForNeededTough(gen, squadSize = 1, rangedCreep = false, moveFactor = 1) {
    const destination = gen.creepInfo.destination;
    const siegeDamage = getSiegeTowerDamage(INTEL[destination]);
    if (!siegeDamage) return {boost: undefined, count: 0};
    if (siegeDamage < 300) return {boost: undefined, count: 0};

    let partCount = siegeDamage >= 1000 ? 8 : (siegeDamage >= 600 ? 6 : 4);
    // 6 T3 tough covers 2000 raw. A 6-tower close dump is 3600 — keep 8 so
    // overflow (and the heal it demands) stays inside a 50-part body.
    const healReserve = rangedCreep ? 10 : 12;
    const rangedReserve = rangedCreep ? 5 : 0;
    partCount = Math.min(partCount, Math.max(0, getMaxSiegeCombatBudget(moveFactor) - healReserve - rangedReserve));

    // Prefer more parts of the highest stocked tier; step down rather than
    // returning 0 when we could still field 4 T3 instead of 6.
    for (let t = partCount; t >= 2; t -= 2) {
        for (const boost of BOOST_USE[TOUGH]) {
            if (gen.room.store(boost) >= 30 * t * squadSize) {
                return {boost: boost, count: t};
            }
        }
    }
    return {boost: undefined, count: 0};
}

function pinAvailableHealBoost(gen, healCount) {
    if (!gen || !gen.creepInfo || !(healCount > 0) || !BOOST_USE || !BOOST_USE[HEAL]) return;
    const waitFor = gen.creepInfo.misc && gen.creepInfo.misc.waitFor;
    const wave = waitFor > 1 ? waitFor : 1;
    const needed = LAB_BOOST_MINERAL * healCount * wave;
    for (let t = 0; t < BOOST_USE[HEAL].length; t++) {
        const boost = BOOST_USE[HEAL][t];
        if (gen.room.store(boost) < needed) continue;
        if (!gen.creepInfo.neededBoosts) gen.creepInfo.neededBoosts = {};
        const nb = gen.creepInfo.neededBoosts;
        nb.boostPart = HEAL;
        nb.boost = boost;
        nb.boostTier = t;
        nb.amount = healCount;
        return;
    }
}

function pinToughBoost(gen, toughData, count) {
    if (!gen || !gen.creepInfo || !toughData || !toughData.boost || !(count > 0)) return;
    if (!gen.creepInfo.neededBoosts) gen.creepInfo.neededBoosts = {};
    gen.creepInfo.neededBoosts.toughBoost = toughData.boost;
    gen.creepInfo.neededBoosts.toughCount = count;
}

module.exports = {
    toughMulti,
    moveFatigueFactor,
    getMaxSiegeCombatBudget,
    getMaxSiegeHealParts,
    hitsFromDump,
    getSiegeTowerDamage,
    determineNeededHeals,
    checkForNeededHeal,
    checkForNeededTough,
    checkForNeededMove,
    pinAvailableHealBoost,
    pinToughBoost,
    SIEGE_REQUIRED_BOOSTS,
    SIEGE_OPTIONAL_BOOSTS,
    isOptionalSiegeBoost,
    siegeLabBoosts,
};