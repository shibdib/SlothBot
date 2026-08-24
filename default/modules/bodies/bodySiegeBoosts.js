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

function getSiegeTowerDamage(intel) {
    if (!intel) return 0;
    const n = intel.towers || 0;
    const td = intel.towerData;
    // canTankLiveTowers compares squad effectiveHeal to n × 600 (full shot at
    // range 3–5). The worst walkable tile is usually the tower cluster, which
    // the squad never occupies — sizing against it asks for 60+ HEAL parts.
    let damage = n * TOWER_POWER_ATTACK;
    if (!damage && td) {
        damage = td.average || td.maxDamage || 0;
    }
    if (td && td.operated) {
        damage = Math.ceil(damage * 1.1);
    }
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
    const targetMemory = Memory.targetRooms[destination];
    const damageToTank = getSiegeTowerDamage(intel);
    if (!damageToTank) {
        if (targetMemory) targetMemory.boostTier = undefined;
        return false;
    }

    const tiers = determineNeededHeals(damageToTank);
    const MIN_RANGED_PARTS = rangedParts ? 5 : 0;
    const MAX_HEAL_PARTS = getMaxSiegeHealParts(toughCount, MIN_RANGED_PARTS, moveFactor);
    const moveShare = BODYPART_COST[MOVE] / Math.max(1, moveFactor || 1);
    const reservedEnergy = MIN_RANGED_PARTS * (BODYPART_COST[RANGED_ATTACK] + moveShare);
    const energyPerHealPair = BODYPART_COST[HEAL] + moveShare;
    // Combat effectiveHeal = heal / toughMult. Flooring TOUGH at 0.85 made T3
    // XGHO2 (0.35) look like T1 and asked for ~2.4× the heal parts a boosted
    // squad actually needs.
    const healToughFactor = toughModifier || 1;

    function tryTier(tier) {
        const rawHeals = Math.ceil(tier.amount * exposureBodies * healToughFactor);
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
        if (targetMemory) targetMemory.boostTier = undefined;
        return false;
    }

    targetMemory.boostTier = chosen.tier;
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
    if (rangedCreep) partCount = Math.min(partCount, 6);
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
        const dest = gen.creepInfo.destination;
        if (dest && Memory.targetRooms[dest]) Memory.targetRooms[dest].boostTier = t;
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