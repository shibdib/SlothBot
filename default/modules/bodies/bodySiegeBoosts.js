/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Siege boost sizing: TOUGH/HEAL parts vs tower damage and lab stock.
 */

const {countRoleForDestination} = require('bodyHelpers');

const toughMulti = {GO: 0.75, GHO2: 0.55, XGHO2: 0.35};

function remainingSquadBodies(gen) {
    const waitFor = Math.max(1, (gen.creepInfo && gen.creepInfo.misc && gen.creepInfo.misc.waitFor) || 1);
    const dest = gen.creepInfo && gen.creepInfo.destination;
    if (!dest) return waitFor;
    const role = gen.role || (gen.creepInfo && gen.creepInfo.role);
    const live = countRoleForDestination(dest, role, gen.creepInfo && gen.creepInfo.operation);
    return Math.max(1, waitFor - live);
}

function getMaxSiegeCombatBudget() {
    return 25;
}

function getMaxSiegeHealParts(toughCount = 0, rangedParts = 0) {
    return Math.max(1, getMaxSiegeCombatBudget() - toughCount - rangedParts);
}

function getSiegeTowerDamage(intel) {
    if (!intel) return 0;
    const td = intel.towerData;
    let damage = 0;
    if (td) {
        damage = Math.max(td.maxDamage || 0, td.average || 0);
        damage = Math.ceil(damage * (td.operated ? 1.1 : 1.05));
    } else if (intel.towers) {
        damage = intel.towers * TOWER_POWER_ATTACK;
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

function checkForNeededHeal(gen, exposureBodies = 1, toughModifier = 1, rangedParts = false, toughCount = 0) {
    const destination = gen.creepInfo.destination;
    const intel = INTEL[destination];
    const targetMemory = Memory.targetRooms[destination];
    const damageToTank = getSiegeTowerDamage(intel);
    if (!damageToTank) {
        if (targetMemory) targetMemory.boostTier = undefined;
        return false;
    }

    const tiers = determineNeededHeals(damageToTank);
    const squadSize = remainingSquadBodies(gen);
    const MIN_RANGED_PARTS = rangedParts ? 5 : 0;
    const MAX_HEAL_PARTS = getMaxSiegeHealParts(toughCount, MIN_RANGED_PARTS);
    const reservedEnergy = MIN_RANGED_PARTS * (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE]);
    const energyPerHealPair = BODYPART_COST[HEAL] + BODYPART_COST[MOVE];
    const healToughFactor = Math.max(toughModifier, 0.85);

    const tierKeys = Object.keys(tiers);
    let chosen;
    let chosenHeals = 0;
    for (const key of tierKeys) {
        const tier = tiers[key];
        const rawHeals = Math.ceil(tier.amount * exposureBodies * healToughFactor);
        if (rawHeals > MAX_HEAL_PARTS) continue;
        const perCreepHeals = rawHeals;
        if (perCreepHeals < 1) continue;
        if (perCreepHeals * energyPerHealPair + reservedEnergy > gen.energyAmount) continue;
        if (gen.room.store(tier.boost) < 30 * perCreepHeals * squadSize) continue;
        chosen = tier;
        chosenHeals = perCreepHeals;
        break;
    }

    if (!chosen) {
        for (let i = tierKeys.length - 1; i >= 0; i--) {
            const tier = tiers[tierKeys[i]];
            const rawHeals = Math.ceil(tier.amount * exposureBodies * healToughFactor);
            if (rawHeals > MAX_HEAL_PARTS) continue;
            const perCreepHeals = rawHeals;
            if (perCreepHeals * energyPerHealPair + reservedEnergy > gen.energyAmount) continue;
            if (gen.room.store(tier.boost) < 30 * perCreepHeals * squadSize) continue;
            chosen = tier;
            chosenHeals = perCreepHeals;
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

function checkForNeededTough(gen, squadSize = 1, rangedCreep = false) {
    const destination = gen.creepInfo.destination;
    const siegeDamage = getSiegeTowerDamage(INTEL[destination]);
    if (!siegeDamage) return {boost: undefined, count: 0};
    if (siegeDamage < 300) return {boost: undefined, count: 0};

    let partCount = siegeDamage >= 1000 ? 8 : (siegeDamage >= 600 ? 6 : 4);
    if (rangedCreep) partCount = Math.min(partCount, 6);
    const healReserve = rangedCreep ? 10 : 12;
    const rangedReserve = rangedCreep ? 5 : 0;
    partCount = Math.min(partCount, Math.max(0, getMaxSiegeCombatBudget() - healReserve - rangedReserve));

    for (const boost of BOOST_USE[TOUGH]) {
        if (gen.room.store(boost) >= 30 * partCount * squadSize) {
            return {boost: boost, count: partCount};
        }
    }
    return {boost: undefined, count: 0};
}

module.exports = {
    toughMulti,
    getMaxSiegeCombatBudget,
    getMaxSiegeHealParts,
    getSiegeTowerDamage,
    determineNeededHeals,
    checkForNeededHeal,
    checkForNeededTough,
};