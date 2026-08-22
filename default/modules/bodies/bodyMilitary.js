/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const {getSiegeDuoUnpaired} = require('bodyHelpers');
const {
    toughMulti,
    getMaxSiegeCombatBudget,
    checkForNeededHeal,
    checkForNeededTough,
    checkForNeededMove,
} = require('bodySiegeBoosts');

function buildLongbowFamily(gen) {
    let tough, toughData, heal, rangedAttack;

    if (gen.creepInfo && gen.creepInfo.operation === 'harass') {
        return {rangedAttack: 1};
    }

    const defaultWaitFor = gen.role === 'longbow' ? 1 : 2;
    const waitFor = (gen.creepInfo && gen.creepInfo.misc && gen.creepInfo.misc.waitFor) || defaultWaitFor;
    // Mineral gate is per body. Requiring waitFor-live on the first spawn
    // blocked quads in rooms that could still field one boosted longbow.
    const moveData = checkForNeededMove(gen, 1);
    const moveFactor = moveData.factor || 1;
    // Listed MOVE but no mineral: keep 1:1 and do not reserve MOVE labs.
    if (moveFactor <= 1 && gen.creepInfo && gen.creepInfo.misc && gen.creepInfo.misc.boosts
        && gen.creepInfo.misc.boosts.includes(MOVE)) {
        gen.creepInfo.misc.boosts = gen.creepInfo.misc.boosts.filter(b => b !== MOVE);
    }

    if (gen.creepInfo && Memory.targetRooms[gen.creepInfo.destination] && Memory.targetRooms[gen.creepInfo.destination].boosts) {
        // Combat pools squad effectiveHeal against one tower volley. Size each
        // body as its share of waitFor, not as a solo tank of the full shot.
        const exposure = 1 / waitFor;
        heal = false;
        if (gen.creepInfo.misc && gen.creepInfo.misc.boosts && gen.creepInfo.misc.boosts.includes(TOUGH)) {
            const desiredTough = checkForNeededTough(gen, 1, true, moveFactor);
            // Without the mineral the sizer assumed, combat's 1/toughMult
            // multiplier never happens — do not fall through to 0 TOUGH.
            if (!desiredTough.boost || !desiredTough.count) return false;
            for (let t = desiredTough.count; t >= 2; t -= 2) {
                toughData = t === desiredTough.count ? desiredTough : {boost: desiredTough.boost, count: t};
                const toughModifier = toughData.boost ? toughMulti[toughData.boost] : 1;
                heal = checkForNeededHeal(gen, exposure, toughModifier, true, t, moveFactor);
                if (heal) {
                    tough = t;
                    if (gen.creepInfo.neededBoosts) {
                        gen.creepInfo.neededBoosts.toughBoost = toughData.boost;
                        gen.creepInfo.neededBoosts.toughCount = t;
                    }
                    break;
                }
            }
        } else {
            heal = checkForNeededHeal(gen, exposure, 1, true, 0, moveFactor);
        }
        if (!heal) return false;
    } else {
        const moveShareUnboosted = BODYPART_COST[MOVE] / moveFactor;
        heal = Math.floor((gen.energyAmount * 0.3) / (BODYPART_COST[HEAL] + moveShareUnboosted));
        heal = Math.min(heal, 6);
    }
    if (moveData.boost && gen.creepInfo) {
        if (!gen.creepInfo.neededBoosts) gen.creepInfo.neededBoosts = {};
        gen.creepInfo.neededBoosts.moveBoost = moveData.boost;
        gen.creepInfo.neededBoosts.moveFactor = moveFactor;
    }

    // Never halfMove: plains/swamp fatigue, not roads. MOVE boosts change
    // autoMove via moveFactor — they do not set halfMove.
    const moveShare = BODYPART_COST[MOVE] / moveFactor;
    const toughEnergy = (tough || 0) * (BODYPART_COST[TOUGH] + moveShare);
    const remainingEnergy = gen.energyAmount - (heal * (BODYPART_COST[HEAL] + moveShare)) - toughEnergy;
    rangedAttack = Math.floor(remainingEnergy / (BODYPART_COST[RANGED_ATTACK] + moveShare)) || 1;
    rangedAttack = Math.min(rangedAttack, getMaxSiegeCombatBudget(moveFactor) - heal - (tough || 0));

    if (gen.creepInfo && gen.creepInfo.other && gen.creepInfo.other.power) {
        let totalPower = (rangedAttack * RANGED_ATTACK_POWER) + (heal * HEAL_POWER);
        if (totalPower > gen.creepInfo.other.power) {
            const ratio = gen.creepInfo.other.power / totalPower;
            rangedAttack = Math.ceil(rangedAttack * ratio);
            heal = Math.ceil(heal * ratio);
        }
        gen.room.memory.additionalPowerNeeded = totalPower < gen.creepInfo.other.power ? true : undefined;
    }
    return {tough, toughData, heal, rangedAttack, moveFactor};
}

function buildSiegeDuo(gen) {
    const dest = gen.creepInfo.destination;
    const {unpairedHealers, unpairedAttackers} = getSiegeDuoUnpaired(dest);
    let tough, toughData, attack, heal;

    if (unpairedHealers > unpairedAttackers) {
        if (gen.creepInfo.misc && gen.creepInfo.misc.boosts && gen.creepInfo.misc.boosts.includes(TOUGH)) {
            toughData = checkForNeededTough(gen, 2);
            tough = toughData.count;
        }
        attack = Math.floor(gen.energyAmount / (BODYPART_COST[ATTACK] + BODYPART_COST[MOVE])) || 1;
        attack = Math.min(attack, getMaxSiegeCombatBudget() - (tough || 0));
    } else {
        if (Memory.targetRooms[gen.creepInfo.destination] && Memory.targetRooms[gen.creepInfo.destination].boosts) {
            heal = false;
            if (gen.creepInfo.misc && gen.creepInfo.misc.boosts && gen.creepInfo.misc.boosts.includes(TOUGH)) {
                const desiredTough = checkForNeededTough(gen, 2);
                for (let t = desiredTough.count; t >= 0; t -= 2) {
                    toughData = t === desiredTough.count ? desiredTough : {boost: desiredTough.boost, count: t};
                    const toughModifier = toughData.boost ? toughMulti[toughData.boost] : 1;
                    heal = checkForNeededHeal(gen, 2, toughModifier, false, t);
                    if (heal) {
                        tough = t;
                        break;
                    }
                }
            } else {
                heal = checkForNeededHeal(gen, 2, 1, false, 0);
            }
            if (!heal) return false;
        } else {
            heal = Math.floor((gen.energyAmount * 0.3) / (BODYPART_COST[HEAL] + BODYPART_COST[MOVE]));
            heal = Math.min(heal, 6);
        }
    }
    return {tough, toughData, attack, heal};
}

const builders = {
    attacker(gen) {
        let attack = Math.floor(gen.energyAmount / (BODYPART_COST[ATTACK] + BODYPART_COST[MOVE])) || 1;
        attack = Math.min(attack, 25);
        return {attack};
    },

    defender(gen) {
        const halfMove = gen.room.level >= 4 || undefined;
        const moveRatio = halfMove ? 0.5 : 1;
        const meleeMan = gen.room.myCreeps.filter((c) => c.memory.role === 'defender' && c.hasActiveBodyparts(ATTACK));
        let heal, attack, rangedAttack;

        if (meleeMan.length && meleeMan.length >= gen.room.hostileCreeps.length / 4) {
            heal = Math.max(Math.floor(gen.energyAmount * 0.15 / (BODYPART_COST[HEAL] + (BODYPART_COST[MOVE] * moveRatio))), 1);
            heal = Math.min(heal, 6);
            const remainingEnergy = gen.energyAmount - (heal * (BODYPART_COST[HEAL] + (BODYPART_COST[MOVE] * moveRatio)));
            rangedAttack = Math.floor(remainingEnergy / (BODYPART_COST[RANGED_ATTACK] + (BODYPART_COST[MOVE] * moveRatio))) || 1;
            rangedAttack = Math.min(rangedAttack, 49 - heal);
        } else {
            heal = Math.max(Math.floor(gen.energyAmount * 0.1 / (BODYPART_COST[HEAL] + (BODYPART_COST[MOVE] * moveRatio))), 1);
            heal = Math.min(heal, 4);
            const remainingEnergy = gen.energyAmount - (heal * (BODYPART_COST[HEAL] + (BODYPART_COST[MOVE] * moveRatio)));
            attack = Math.floor(remainingEnergy / (BODYPART_COST[ATTACK] + (BODYPART_COST[MOVE] * moveRatio))) || 1;
            attack = Math.min(attack, 49 - heal);
        }
        return {heal, attack, rangedAttack, halfMove};
    },

    longbow: buildLongbowFamily,
    testSquad: buildLongbowFamily,
    longbowSquad: buildLongbowFamily,
    siegeDuo: buildSiegeDuo,

    SKAttacker(gen) {
        // Keeper fight needs this 50-part melee mix; smaller bodies die.
        const movePair = (part) => BODYPART_COST[part] + BODYPART_COST[MOVE];
        const cost = 20 * movePair(ATTACK) + 5 * movePair(HEAL);
        if (gen.energyAmount < cost) return false;
        return {attack: 20, heal: 5};
    },

    powerAttacker: () => ({attack: 25}),
    powerHealer: () => ({heal: 16}),

    powerHauler(gen) {
        let carry = Math.floor(gen.energyAmount / (BODYPART_COST[CARRY] + BODYPART_COST[MOVE])) || 1;
        carry = Math.min(carry, 25);
        return {carry};
    },
};

function build(role, gen) {
    const fn = builders[role];
    return fn ? fn(gen) : undefined;
}

module.exports = {build, builders};