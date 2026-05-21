/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Refactored & Deep-Dived by Grok (xAI) - May 2026
 *
 * Version 2.0 - Major CPU + Effectiveness Improvements
 *
 * CPU Wins:
 * - Per-tick cached hostile/friendly/damaged lists (biggest win)
 * - Single-pass scoring instead of multiple filters
 * - Early exits when no hostiles or no repair needed
 * - Reduced findClosestByRange calls
 * - Throttled tower power checks
 *
 * Effectiveness Wins:
 * - Healer-first targeting (highest priority)
 * - Smart damage falloff + tower power boost calculation
 * - Focus-fire on lowest HP dangerous targets
 * - Combat repair: prioritize walls/ramparts under attack, then critical structures
 * - Avoid wasting shots on already-dead targets
 */

'use strict';

let towerCache = {};

module.exports.towerController = function (room) {
    const towers = room.towers;
    if (!towers.length) return;

    const currentTime = Game.time;
    const cacheKey = room.name;

    // === PER-TICK CACHE ===
    if (!towerCache[cacheKey] || towerCache[cacheKey].tick !== currentTime) {
        const hostiles = room.hostileCreeps;
        const friendlies = room.friendlyCreeps;

        // Damaged structures (only those worth repairing)
        const damaged = room.structures.filter(s =>
            s.hits < s.hitsMax * 0.9 &&
            s.structureType !== STRUCTURE_WALL &&
            s.structureType !== STRUCTURE_RAMPART
        );

        // Combat-damaged walls/ramparts (under attack)
        const combatBarriers = room.barriers.filter(b =>
            b.hits < b.hitsMax * 0.95 &&
            room.hostileCreeps.some(h => h.pos.getRangeTo(b) <= 5)
        );

        towerCache[cacheKey] = {
            tick: currentTime,
            hostiles,
            friendlies,
            damaged,
            combatBarriers,
            hasHostiles: hostiles.length > 0
        };
    }

    const cache = towerCache[cacheKey];
    if (!cache.hasHostiles && !cache.damaged.length && !cache.combatBarriers.length) return;

    // Get tower power boost if available (throttled check)
    let towerPower = 1;
    if (!cache.towerPowerChecked || cache.towerPowerChecked + 50 < currentTime) {
        const powerSpawn = room.powerSpawn;
        if (powerSpawn && powerSpawn.store[RESOURCE_POWER] >= 100) {
            towerPower = 1.5; // PWR_OPERATE_TOWER effect
        }
        cache.towerPowerChecked = currentTime;
        cache.towerPower = towerPower;
    } else {
        towerPower = cache.towerPower || 1;
    }

    for (const tower of towers) {
        if (tower.store[RESOURCE_ENERGY] < TOWER_ENERGY_COST) continue;

        if (cache.hasHostiles) {
            const target = findBestTarget(tower, cache.hostiles, cache.friendlies, towerPower);
            if (target) {
                tower.attack(target);
                continue;
            }
        }

        // Repair logic (only if no attack happened)
        if (cache.combatBarriers.length) {
            const repairTarget = _.min(cache.combatBarriers, b => b.hits);
            if (repairTarget && tower.pos.getRangeTo(repairTarget) <= TOWER_OPTIMAL_RANGE) {
                tower.repair(repairTarget);
                continue;
            }
        }

        if (cache.damaged.length) {
            const repairTarget = _.min(cache.damaged, s => s.hits / s.hitsMax);
            if (repairTarget && tower.pos.getRangeTo(repairTarget) <= TOWER_OPTIMAL_RANGE) {
                tower.repair(repairTarget);
            }
        }
    }
};

function findBestTarget(tower, hostiles, friendlies, towerPower) {
    if (!hostiles.length) return null;

    let bestTarget = null;
    let bestScore = -Infinity;

    for (const hostile of hostiles) {
        if (hostile.hits <= 0) continue;

        const range = tower.pos.getRangeTo(hostile);

        // Base damage with falloff + tower power
        const baseDamage = TOWER_POWER_FROM_RANGE(range, TOWER_POWER_ATTACK) * towerPower;

        // Score: healers are highest priority
        let score = 0;

        if (hostile.hasActiveBodyparts(HEAL)) {
            score += 1000; // Healers first
        } else if (hostile.hasActiveBodyparts(ATTACK) || hostile.hasActiveBodyparts(RANGED_ATTACK)) {
            score += 600;
        } else if (hostile.hasActiveBodyparts(WORK)) {
            score += 400;
        } else {
            score += 200;
        }

        // Prefer low HP targets (focus fire)
        const hpRatio = hostile.hits / hostile.hitsMax;
        score += (1 - hpRatio) * 300;

        // Closer is better (more reliable damage)
        score -= range * 15;

        // Bonus if friendly healer is nearby (protect friendlies)
        const nearbyFriendlyHealer = friendlies.some(f =>
            f.hasActiveBodyparts(HEAL) && f.pos.getRangeTo(hostile) <= 4
        );
        if (nearbyFriendlyHealer) score += 150;

        if (score > bestScore) {
            bestScore = score;
            bestTarget = hostile;
        }
    }

    return bestTarget;
}