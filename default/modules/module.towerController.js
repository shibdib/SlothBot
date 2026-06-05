/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

'use strict';

const towerCache = {};
const drainState = {};

const DRAIN_BLACKLIST_TICKS = 50;
const DRAIN_NO_PROGRESS_SHOTS = 4;
const COMBAT_BARRIER_RANGE = 8;

// Tower repair is ~80 HP/energy at optimal and 20 at falloff — strictly worse than a
// WORK creep (~100 HP/energy). Only fire when a creep won't make it in time.
const CRITICAL_BARRIER_HP = 10000;
const CRITICAL_STRUCTURE_RATIO_COMBAT = 0.5;
const CRITICAL_STRUCTURE_RATIO_PEACE = 0.25;
const CRITICAL_STRUCTURE_TYPES = new Set([
    STRUCTURE_SPAWN,
    STRUCTURE_TOWER,
    STRUCTURE_STORAGE,
    STRUCTURE_TERMINAL,
    STRUCTURE_LAB,
    STRUCTURE_NUKER,
    STRUCTURE_FACTORY,
    STRUCTURE_POWER_SPAWN
]);

module.exports.towerController = function (room) {
    const towers = room.towers.filter(t => t.isActive());
    if (!towers.length) return;

    const currentTime = Game.time;
    const cacheKey = room.name;

    if (!towerCache[cacheKey] || towerCache[cacheKey].tick !== currentTime) {
        const hostiles = room.hostileCreeps;
        const hasHostiles = hostiles.length > 0;

        const ratioThreshold = hasHostiles
            ? CRITICAL_STRUCTURE_RATIO_COMBAT
            : CRITICAL_STRUCTURE_RATIO_PEACE;
        const criticalStructures = room.structures.filter(s =>
            CRITICAL_STRUCTURE_TYPES.has(s.structureType) &&
            s.hits < s.hitsMax * ratioThreshold
        );

        const combatBarriers = hasHostiles
            ? room.barriers.filter(b =>
                b.hits < CRITICAL_BARRIER_HP &&
                hostiles.some(h => h.pos.getRangeTo(b) <= COMBAT_BARRIER_RANGE))
            : [];

        const injuredFriendlies = room.friendlyCreeps.filter(c => c.hits < c.hitsMax);

        towerCache[cacheKey] = {
            tick: currentTime,
            hostiles,
            criticalStructures,
            combatBarriers,
            injuredFriendlies,
            hasHostiles
        };
    }

    const cache = towerCache[cacheKey];
    if (!cache.hasHostiles && !cache.criticalStructures.length && !cache.injuredFriendlies.length) return;

    const repairAllowed = room.energyState > 0;

    if (!drainState[cacheKey]) drainState[cacheKey] = {};
    const roomDrain = drainState[cacheKey];

    let attacked = false;
    if (cache.hasHostiles) {
        const target = findBestTarget(room, towers, cache.hostiles, roomDrain);
        if (target) {
            updateDrainTracking(roomDrain, target, currentTime);
            for (const tower of towers) {
                if (tower.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST) tower.attack(target);
            }
            attacked = true;
        }
    }

    // Heal beats repair: a dead defender costs more than a damaged barrier, and the heal
    // path has no storage floor — we top creeps up to full whenever we aren't attacking.
    let healed = false;
    if (!attacked && cache.injuredFriendlies.length) {
        const healCandidates = cache.injuredFriendlies
            .slice()
            .sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax));
        let i = 0;
        for (const tower of towers) {
            if (tower.store[RESOURCE_ENERGY] < TOWER_ENERGY_COST) continue;
            tower.heal(healCandidates[i % healCandidates.length]);
            i++;
        }
        healed = i > 0;
    }

    if (!attacked && !healed && repairAllowed) {
        const repairCandidates = cache.combatBarriers.length
            ? cache.combatBarriers.slice().sort((a, b) => a.hits - b.hits)
            : cache.criticalStructures.slice().sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax));

        if (repairCandidates.length) {
            // Round-robin to spread repairs — focus-firing 6 towers on one rampart wastes
            // throughput while other barriers continue dropping.
            let i = 0;
            for (const tower of towers) {
                if (tower.store[RESOURCE_ENERGY] < TOWER_ENERGY_COST) continue;
                tower.repair(repairCandidates[i % repairCandidates.length]);
                i++;
            }
        }
    }

    if (currentTime % 200 === 0) cleanupDrainState(roomDrain, currentTime);
};

function findBestTarget(room, towers, hostiles, roomDrain) {
    const currentTime = Game.time;
    const storageLow = !room.energyState;

    let bestTarget = null;
    let bestScore = -Infinity;

    for (const hostile of hostiles) {
        const x = hostile.pos.x;
        const y = hostile.pos.y;
        if (x === 0 || x === 49 || y === 0 || y === 49) continue;

        const ds = roomDrain[hostile.id];
        if (ds && ds.blacklistedUntil > currentTime) continue;

        // Kill-feasibility: damage after TOUGH reduction must exceed self + ally heal,
        // otherwise the volley is wasted (and a drain attack profits).
        const rawDamage = computeTowerDamageTo(hostile, towers);
        const effectiveDamage = rawDamage * computeToughMultiplier(hostile);
        const totalHeal = computeHealCapacity(hostile) + computeNearbyAllyHeal(hostile, hostiles);

        if (effectiveDamage <= totalHeal) continue;

        // Under storage pressure, demand a wider margin so we don't bleed reserves on
        // marginal engagements.
        if (storageLow && effectiveDamage - totalHeal < rawDamage * 0.25) continue;

        let score = effectiveDamage - totalHeal;
        if (hostile.hasActiveBodyparts(HEAL)) score += 5000;
        else if (hostile.hasActiveBodyparts(ATTACK) || hostile.hasActiveBodyparts(RANGED_ATTACK)) score += 3000;
        else if (hostile.hasActiveBodyparts(WORK)) score += 1500;
        score += (1 - hostile.hits / hostile.hitsMax) * 500;

        if (score > bestScore) {
            bestScore = score;
            bestTarget = hostile;
        }
    }

    return bestTarget;
}

function computeTowerDamageTo(target, towers) {
    let total = 0;
    for (const tower of towers) {
        if (tower.store[RESOURCE_ENERGY] < TOWER_ENERGY_COST) continue;
        const range = tower.pos.getRangeTo(target);
        total += TOWER_POWER_FROM_RANGE(range, TOWER_POWER_ATTACK) * getTowerBoost(tower);
    }
    return total;
}

function getTowerBoost(tower) {
    if (!tower.effects || !tower.effects.length) return 1;
    const op = tower.effects.find(e => e.effect === PWR_OPERATE_TOWER);
    if (!op || !op.level) return 1;
    return 1 + (POWER_INFO[PWR_OPERATE_TOWER].effect[op.level - 1] / 100);
}

function computeToughMultiplier(creep) {
    // Damage hits TOUGH first; once the front TOUGH dies, the next absorbs.
    // Use the most-protective alive TOUGH as the worst-case (conservative) multiplier.
    let mult = 1;
    for (const part of creep.body) {
        if (part.type !== TOUGH || part.hits === 0) continue;
        const boost = part.boost && BOOSTS[TOUGH] && BOOSTS[TOUGH][part.boost]
            ? BOOSTS[TOUGH][part.boost].damage
            : 1;
        if (boost < mult) mult = boost;
    }
    return mult;
}

function healPartMultiplier(partType, boost) {
    if (!boost || !BOOSTS[partType] || !BOOSTS[partType][boost]) return 1;
    return BOOSTS[partType][boost].heal;
}

function computeHealCapacity(creep) {
    let melee = 0;
    let ranged = 0;
    for (const part of creep.body) {
        if (part.hits === 0) continue;
        const mult = healPartMultiplier(part.type, part.boost);
        if (part.type === HEAL) melee += HEAL_POWER * mult;
    }
    // One heal action per tick — use the stronger of melee heal vs rangedHeal on self.
    return Math.max(melee, ranged);
}

function computeNearbyAllyHeal(target, hostiles) {
    let total = 0;
    for (const h of hostiles) {
        if (h.id === target.id) continue;
        const range = h.pos.getRangeTo(target);
        if (range > 3) continue;

        let melee = 0;
        let ranged = 0;
        for (const part of h.body) {
            if (part.hits === 0) continue;
            const mult = healPartMultiplier(part.type, part.boost);
            if (part.type === HEAL) melee += HEAL_POWER * mult;
        }

        if (range <= 1) total += Math.max(melee, ranged);
        else total += ranged;
    }
    return total;
}

function updateDrainTracking(roomDrain, target, currentTime) {
    let ds = roomDrain[target.id];
    if (!ds) {
        ds = roomDrain[target.id] = {
            firstSeen: currentTime,
            shotsFired: 0,
            lastHits: target.hits,
            consecutiveNoProgress: 0
        };
    }
    ds.shotsFired++;
    if (target.hits >= ds.lastHits) ds.consecutiveNoProgress++;
    else ds.consecutiveNoProgress = 0;
    if (ds.consecutiveNoProgress >= DRAIN_NO_PROGRESS_SHOTS) {
        // The kill-feasibility check thought this was killable but reality says otherwise
        // (boost decay, healer joined, target moved). Park it.
        ds.blacklistedUntil = currentTime + DRAIN_BLACKLIST_TICKS;
        ds.consecutiveNoProgress = 0;
    }
    ds.lastHits = target.hits;
}

function cleanupDrainState(roomDrain, currentTime) {
    for (const id in roomDrain) {
        const ds = roomDrain[id];
        const expiry = Math.max(ds.blacklistedUntil || 0, ds.firstSeen + CREEP_LIFE_TIME);
        if (expiry < currentTime || !Game.getObjectById(id)) delete roomDrain[id];
    }
}
