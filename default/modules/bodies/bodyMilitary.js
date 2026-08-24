/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const {getSiegeDuoUnpaired} = require('bodyHelpers');
const {
    toughMulti,
    getMaxSiegeCombatBudget,
    getSiegeTowerDamage,
    checkForNeededHeal,
    checkForNeededTough,
    checkForNeededMove,
    pinAvailableHealBoost,
    pinToughBoost,
} = require('bodySiegeBoosts');

function listedBoosts(gen) {
    return gen.creepInfo && gen.creepInfo.misc && gen.creepInfo.misc.boosts;
}

function wantsListedBoost(gen, part) {
    const listed = listedBoosts(gen);
    return !!(listed && listed.includes(part));
}

function destHasBoosts(gen) {
    const dest = gen.creepInfo && gen.creepInfo.destination;
    return !!(dest && Memory.targetRooms[dest] && Memory.targetRooms[dest].boosts);
}

function wantsHealBoost(gen) {
    return destHasBoosts(gen) || wantsListedBoost(gen, HEAL);
}

let _waveMoveBoostTick = -1;
let _waveMoveBoostCache = {};

function liveWaveMoveBoost(gen, waitFor) {
    if (!(waitFor > 1) || !gen.creepInfo) return null;
    const dest = gen.creepInfo.destination || '';
    const op = gen.creepInfo.operation || '';
    const role = gen.role;
    const key = `${role}|${dest}|${op}`;
    if (_waveMoveBoostTick !== Game.time) {
        _waveMoveBoostTick = Game.time;
        _waveMoveBoostCache = {};
    }
    if (Object.prototype.hasOwnProperty.call(_waveMoveBoostCache, key)) return _waveMoveBoostCache[key];

    let found = null;
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c.my || !c.memory) continue;
        const r = c.memory.oldRole || c.memory.role || '';
        if (r !== role) continue;
        if ((c.memory.destination || '') !== dest) continue;
        if (op && c.memory.operation && c.memory.operation !== op) continue;
        const nb = c.memory.neededBoosts;
        if (nb && nb.moveBoost && nb.moveFactor > 1) {
            found = {boost: nb.moveBoost, factor: nb.moveFactor};
            break;
        }
    }
    _waveMoveBoostCache[key] = found;
    return found;
}

function buildLongbowFamily(gen) {
    let tough, toughData, heal, rangedAttack;

    if (gen.creepInfo && gen.creepInfo.operation === 'harass') {
        return {rangedAttack: 1};
    }

    const defaultWaitFor = gen.role === 'longbow' ? 1 : 2;
    const waitFor = (gen.creepInfo && gen.creepInfo.misc && gen.creepInfo.misc.waitFor) || defaultWaitFor;
    // MOVE parts scale with the boost (T3 ≈ 10 MOVE vs 25 unboosted). A per-body
    // mineral gate let the whole wave spawn that shape when only one body could
    // actually boost — quads then crawled. HEAL/TOUGH stay per-body below.
    const committed = liveWaveMoveBoost(gen, waitFor);
    const moveData = committed || checkForNeededMove(gen, waitFor);
    const moveFactor = moveData.factor || 1;

    const siegeDamage = getSiegeTowerDamage(INTEL[gen.creepInfo && gen.creepInfo.destination]);
    if (wantsHealBoost(gen) && siegeDamage) {
        // Combat pools squad effectiveHeal against one tower volley. Size each
        // body as its share of waitFor, not as a solo tank of the full shot.
        const exposure = 1 / waitFor;
        heal = false;
        if (wantsListedBoost(gen, TOUGH)) {
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
                    pinToughBoost(gen, toughData, t);
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
        // Guard/rebuild list HEAL without towers. Pin if the wave is stocked;
        // do not fail the body — unboosted squads still have to spawn.
        if (wantsHealBoost(gen)) pinAvailableHealBoost(gen, heal);
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
        if (wantsListedBoost(gen, TOUGH)) {
            toughData = checkForNeededTough(gen, 2);
            tough = toughData.count;
            pinToughBoost(gen, toughData, tough);
        }
        attack = Math.floor(gen.energyAmount / (BODYPART_COST[ATTACK] + BODYPART_COST[MOVE])) || 1;
        attack = Math.min(attack, getMaxSiegeCombatBudget() - (tough || 0));
    } else {
        const siegeDamage = getSiegeTowerDamage(INTEL[dest]);
        if (wantsHealBoost(gen) && siegeDamage) {
            heal = false;
            if (wantsListedBoost(gen, TOUGH)) {
                const desiredTough = checkForNeededTough(gen, 2);
                for (let t = desiredTough.count; t >= 0; t -= 2) {
                    toughData = t === desiredTough.count ? desiredTough : {boost: desiredTough.boost, count: t};
                    const toughModifier = toughData.boost ? toughMulti[toughData.boost] : 1;
                    heal = checkForNeededHeal(gen, 2, toughModifier, false, t);
                    if (heal) {
                        tough = t;
                        pinToughBoost(gen, toughData, t);
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
            if (wantsHealBoost(gen)) pinAvailableHealBoost(gen, heal);
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

    // 25 ATTACK reflects 375/tick unboosted, 1500 at T3 (POWER_BANK_HIT_BACK 0.5).
    // Two 20-HEAL mates cover that at every matched boost tier, with spare if
    // one healer is a step late. 1:1 MOVE so they can leave the road.
    powerAttacker: () => ({attack: 25}),
    powerHealer: () => ({heal: 20}),

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