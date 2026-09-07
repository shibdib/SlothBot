/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

'use strict';

const towerCache = {};
const drainState = {};

const DRAIN_BLACKLIST_TICKS = 50;
const DRAIN_NO_PROGRESS_SHOTS = 4;
const COMBAT_BARRIER_RANGE = 8;
const TOWER_SAVE_RESERVE = 700;

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
    const hostiles = room.hostileCreeps;
    const hasHostiles = hostiles.length > 0;

    const ratioThreshold = hasHostiles
        ? CRITICAL_STRUCTURE_RATIO_COMBAT
        : CRITICAL_STRUCTURE_RATIO_PEACE;

    if (!towerCache[cacheKey] || towerCache[cacheKey].tick !== currentTime) {
        const criticalStructures = [];
        const addCritical = (s) => {
            if (s && CRITICAL_STRUCTURE_TYPES.has(s.structureType) && s.hits < s.hitsMax * ratioThreshold) {
                criticalStructures.push(s);
            }
        };
        addCritical(room.storage);
        addCritical(room.terminal);
        addCritical(room.factory);
        addCritical(room.nuker);
        addCritical(room.powerSpawn);
        for (const s of room.spawns) addCritical(s);
        for (const s of room.towers) addCritical(s);
        for (const s of room.labs) addCritical(s);

        const combatBarriers = hasHostiles
            ? room.barriers.filter(b =>
                b && b.structureType &&
                b.hits < CRITICAL_BARRIER_HP &&
                hostiles.some(h => h.pos.getRangeTo(b) <= COMBAT_BARRIER_RANGE))
            : [];

        const injuredFriendlies = room.friendlyCreeps.filter(c => c.hits < c.hitsMax);

        let dyingRamparts = [];
        if (!hasHostiles) {
            const saveHits = typeof RAMPART_TOWER_SAVE_HITS === 'number' ? RAMPART_TOWER_SAVE_HITS : 1000;
            const claimed = wallerClaimedTargetIds(room);
            const ramparts = room.ramparts || [];
            for (let i = 0; i < ramparts.length; i++) {
                const r = ramparts[i];
                if (r && r.hits > 0 && r.hits < saveHits && !claimed.has(r.id)) dyingRamparts.push(r);
            }
        }

        towerCache[cacheKey] = {
            tick: currentTime,
            hostiles,
            criticalStructures,
            combatBarriers,
            dyingRamparts,
            injuredFriendlies,
            hasHostiles
        };
    }

    const cache = towerCache[cacheKey];
    const energyInfo = room.energyInfo;
    const trend = (energyInfo && energyInfo.trend) || 0;
    const spareIncome = (energyInfo && energyInfo.spareIncome) || 0;
    const repairAllowed = room.energyState >= 3
        || (room.energyState >= 2 && spareIncome > 0 && trend >= 0)
        || (room.energyState === 1 && trend >= 0 && spareIncome > 0);
    if (cache.hasHostiles || cache.injuredFriendlies.length) {
        if (!drainState[cacheKey]) drainState[cacheKey] = {};
        const roomDrain = drainState[cacheKey];

        let attacked = false;
        if (cache.hasHostiles) {
            const pick = findBestTarget(room, towers, cache.hostiles, roomDrain, room.friendlyCreeps);
            if (pick && pick.target) {
                updateDrainTracking(roomDrain, pick.target, currentTime, pick.expectProgress);
                for (const tower of towers) {
                    if (tower.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST) tower.attack(pick.target);
                }
                attacked = true;
            }
        }

        // Heal beats repair, but not attack. While hostiles are in the room, topping a
        // combat creep to full is how invader pairs live — the friendly cannot break
        // their heal and the towers are not shooting. Emergency-only in combat.
        if (!attacked && cache.injuredFriendlies.length) {
            const healCandidates = selectHealCandidates(cache.injuredFriendlies, cache.hasHostiles);
            if (healCandidates.length) {
                let i = 0;
                for (const tower of towers) {
                    if (tower.store[RESOURCE_ENERGY] < TOWER_ENERGY_COST) continue;
                    tower.heal(healCandidates[i % healCandidates.length]);
                    i++;
                }
            }
        }
        if (currentTime % 200 === 0) cleanupDrainState(roomDrain, currentTime);
    } else {
        const dyingRamparts = (cache.dyingRamparts || []).slice().sort((a, b) => a.hits - b.hits);
        const damagedCriticalStructures = cache.criticalStructures.filter(s => s.hits < s.hitsMax);
        const towersCanSave = dyingRamparts.length && towers.some(t =>
            (t.store[RESOURCE_ENERGY] || 0) >= TOWER_SAVE_RESERVE);
        let repairCandidates;
        let minEnergy = TOWER_ENERGY_COST;
        if (towersCanSave) {
            repairCandidates = dyingRamparts;
            minEnergy = TOWER_SAVE_RESERVE;
        } else if (cache.combatBarriers.length) {
            repairCandidates = cache.combatBarriers.slice().sort((a, b) => a.hits - b.hits);
        } else {
            repairCandidates = damagedCriticalStructures.slice().sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax));
        }
        // Road repair is a discretionary 10-energy/tower sink — only when overflowing.
        if (!repairCandidates.length && repairAllowed) {
            let keep = null;
            try {
                keep = require('planGeomRoads').getOwnedRoadKeepSet(room);
            } catch (e) { /* ignore */
            }
            repairCandidates = room.structures.filter((s) => {
                if (s.structureType !== STRUCTURE_ROAD || s.hits >= s.hitsMax * 0.5) return false;
                return !keep || keep.has(s.pos.x + 'x' + s.pos.y);
            }).sort(
                (a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax)
            );
        }

        if (repairCandidates.length) {
            // Round-robin to spread repairs — focus-firing 6 towers on one rampart wastes
            // throughput while other barriers continue dropping.
            let i = 0;
            for (const tower of towers) {
                if (tower.store[RESOURCE_ENERGY] < minEnergy) continue;
                tower.repair(repairCandidates[i % repairCandidates.length]);
                i++;
            }
        }
    }
};

function wallerClaimedTargetIds(room) {
    const ids = new Set();
    const creeps = room.myCreeps || [];
    for (let i = 0; i < creeps.length; i++) {
        const c = creeps[i];
        if (c.memory && c.memory.role === 'waller' && c.memory.currentTarget) ids.add(c.memory.currentTarget);
    }
    return ids;
}

function selectHealCandidates(injured, hasHostiles) {
    const list = hasHostiles
        ? injured.filter(c => c.hits / c.hitsMax <= 0.3 || c.hits <= 200)
        : injured;
    return list.slice().sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax));
}

function armedFriendlyNear(hostile, friendlies) {
    if (!friendlies || !friendlies.length) return false;
    for (let i = 0; i < friendlies.length; i++) {
        const f = friendlies[i];
        if (!f || f.pos.getRangeTo(hostile) > 3) continue;
        if (f.hasActiveBodyparts(ATTACK) || f.hasActiveBodyparts(RANGED_ATTACK) || f.hasActiveBodyparts(HEAL)) {
            return true;
        }
    }
    return false;
}

/** Player edge-dancers with no fight in range. Invaders walking in are not drain. */
function isEdgeDrain(hostile, friendlies) {
    const owner = hostile.owner && hostile.owner.username;
    if (owner === 'Invader') return false;
    return !armedFriendlyNear(hostile, friendlies);
}

function findBestTarget(room, towers, hostiles, roomDrain, friendlies) {
    const currentTime = Game.time;
    const storageLow = !room.energyState;

    let bestKillable = null;
    let bestKillableScore = -Infinity;
    let bestFallback = null;
    let bestFallbackScore = -Infinity;

    for (const hostile of hostiles) {
        const x = hostile.pos.x;
        const y = hostile.pos.y;
        if ((x === 0 || x === 49 || y === 0 || y === 49) && isEdgeDrain(hostile, friendlies)) continue;

        const ds = roomDrain[hostile.id];
        const blacklisted = !!(ds && ds.blacklistedUntil > currentTime);

        const rawDamage = computeTowerDamageTo(hostile, towers);
        const effectiveDamage = rawDamage * computeToughMultiplier(hostile);
        const totalHeal = computeHealCapacity(hostile) + computeNearbyAllyHeal(hostile, hostiles);
        const net = effectiveDamage - totalHeal;

        let score = net;
        if (hostile.hasActiveBodyparts(HEAL)) score += 5000;
        else if (hostile.hasActiveBodyparts(ATTACK) || hostile.hasActiveBodyparts(RANGED_ATTACK)) score += 3000;
        else if (hostile.hasActiveBodyparts(WORK)) score += 1500;
        score += (1 - hostile.hits / hostile.hitsMax) * 500;

        const killable = !blacklisted && net > 0
            && !(storageLow && net < rawDamage * 0.25);
        if (killable && score > bestKillableScore) {
            bestKillableScore = score;
            bestKillable = hostile;
        }

        // Unkillable / blacklisted tank: still shoot healers so they self-heal
        // instead of topping the partner. That is how a pair gets broken.
        if (blacklisted && !hostile.hasActiveBodyparts(HEAL)) continue;
        if (score > bestFallbackScore) {
            bestFallbackScore = score;
            bestFallback = hostile;
        }
    }

    if (bestKillable) return {target: bestKillable, expectProgress: true};
    if (bestFallback) return {target: bestFallback, expectProgress: false};
    return null;
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
    if (!creep.body) return 1;
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

function healPartsPower(creep) {
    let melee = 0;
    let ranged = 0;
    const body = creep.body;
    if (!body) return {melee: 0, ranged: 0};
    for (let i = 0; i < body.length; i++) {
        const part = body[i];
        if (part.type !== HEAL || part.hits === 0) continue;
        const mult = healPartMultiplier(HEAL, part.boost);
        melee += HEAL_POWER * mult;
        ranged += RANGED_HEAL_POWER * mult;
    }
    return {melee, ranged};
}

function computeHealCapacity(creep) {
    // Self-heal is always the melee action.
    return healPartsPower(creep).melee;
}

function computeNearbyAllyHeal(target, hostiles) {
    let total = 0;
    for (const h of hostiles) {
        if (h.id === target.id) continue;
        const range = h.pos.getRangeTo(target);
        if (range > 3) continue;
        const power = healPartsPower(h);
        total += range <= 1 ? power.melee : power.ranged;
    }
    return total;
}

function updateDrainTracking(roomDrain, target, currentTime, expectProgress) {
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
    if (expectProgress) {
        if (target.hits >= ds.lastHits) ds.consecutiveNoProgress++;
        else ds.consecutiveNoProgress = 0;
        if (ds.consecutiveNoProgress >= DRAIN_NO_PROGRESS_SHOTS) {
            // Kill-feasibility thought this was killable but HP did not drop
            // (healer joined, boost, moved). Stop treating it as a kill.
            ds.blacklistedUntil = currentTime + DRAIN_BLACKLIST_TICKS;
            ds.consecutiveNoProgress = 0;
        }
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
