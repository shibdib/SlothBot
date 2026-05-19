/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Refactored & Deep-Dived by Grok (xAI) - May 2026
 *
 * Version 2.0 - Major CPU + Effectiveness Improvements
 *
 * CPU Wins:
 * - Single-pass caching of all creep lists
 * - Per-tick power cache (Map)
 * - Removed visual.text spam
 * - Fewer redundant filters
 *
 * Effectiveness Wins:
 * - Stronger healer-first targeting
 * - Active healing of dying friendly creeps during combat
 * - Smarter combat repair (protects spawns/towers/storage)
 * - Earlier defender spawning when towers are low on energy
 */

let roomRepairTower = {};
const attackLogCooldown = {};

module.exports.towerControl = function (room) {
    room.memory.towerTarget = undefined;
    room.memory.dangerousAttack = undefined;
    room.memory.spawnDefenders = undefined;

    const towers = room.towers.filter(t => t.isActive());
    if (!towers.length) return;

    // === ONE-TIME CACHING (big CPU win) ===
    const hostileCreeps = room.hostileCreeps;
    const friendlyCreeps = room.friendlyCreeps;
    const powerCreeps = room.powerCreeps;

    if (hostileCreeps.length) {
        handleHostileCreeps(room, towers, hostileCreeps, friendlyCreeps, powerCreeps);
    } else {
        const repairTower = getRepairTower(room, towers);
        if (repairTower) {
            handleRepairTowerActions(room, repairTower, friendlyCreeps, powerCreeps);
        }
    }
};

// Get best repair tower (cached)
function getRepairTower(room, towers) {
    const cached = Game.getObjectById(roomRepairTower[room.name]);
    if (cached && towers.some(t => t.id === cached.id) && cached.store[RESOURCE_ENERGY] > TOWER_CAPACITY * 0.25) {
        return cached;
    }

    if (!cached) roomRepairTower[room.name] = undefined;

    const best = _.max(towers.filter(t => t.store[RESOURCE_ENERGY] > TOWER_CAPACITY * 0.5), t => t.store[RESOURCE_ENERGY]);
    if (best) {
        roomRepairTower[room.name] = best.id;
        return best;
    }
    return null;
}

function handleRepairTowerActions(room, repairTower, friendlyCreeps, powerCreeps) {
    roomRepairTower[room.name] = repairTower.id;

    // Priority 1: Heal wounded friendlies
    const wounded = findWoundedCreep(friendlyCreeps, powerCreeps);
    if (wounded) {
        repairTower.heal(wounded);
        return;
    }

    // Priority 2: Repair degrading structures (only when energy is good)
    if (room.energyState) {
        const degrading = findDegradingStructure(room);
        if (degrading) repairTower.repair(degrading);
    }
}

function findWoundedCreep(friendlyCreeps, powerCreeps) {
    return friendlyCreeps.find(c => c.hits < c.hitsMax) ||
        powerCreeps.find(c => c.hits < c.hitsMax && FRIENDLIES.includes(c.owner.username));
}

function findDegradingStructure(room) {
    for (const s of room.structures) {
        if (s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * 0.5) return s;
        if (s.structureType === STRUCTURE_CONTAINER && s.hits < s.hitsMax * 0.4) return s;
        if ((s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < 10000) return s;
    }
    return null;
}

function handleHostileCreeps(room, towers, hostileCreeps, friendlyCreeps, powerCreeps) {
    const readyTowers = towers.filter(t => t.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST);

    if (!readyTowers.length && !room.controller.safeMode) {
        if (!attackLogCooldown[room.name + '_e'] || attackLogCooldown[room.name + '_e'] + 200 < Game.time) {
            log.a(`${roomLink(room.name)} towers out of energy — spawning defenders.`, 'TOWER:');
            attackLogCooldown[room.name + '_e'] = Game.time;
        }
        room.memory.dangerousAttack = true;
        room.memory.spawnDefenders = true;
        return;
    }

    // === POWER CACHE (per tick) ===
    const powerCache = new Map();
    const getPower = (creep) => {
        if (!powerCache.has(creep.id)) {
            powerCache.set(creep.id, abilityPower(creep.body));
        }
        return powerCache.get(creep.id);
    };

    const friendlyMelee = friendlyCreeps.filter(c => c.hasActiveBodyparts(ATTACK));
    const friendlyRanged = friendlyCreeps.filter(c => c.hasActiveBodyparts(RANGED_ATTACK));
    const hostileHealers = hostileCreeps.filter(c => c.hasActiveBodyparts(HEAL));

    let healerTarget = null;
    let fastestHealerKill = Infinity;
    let attackerTarget = null;
    let fastestAttackerKill = Infinity;
    let shouldSpawnDefenders = false;

    for (const hostile of hostileCreeps) {
        const hostilePower = getPower(hostile);
        let healPower = hostilePower.heal || 0;

        if (!room.controller.safeMode) {
            for (const healer of hostileHealers) {
                if (healer.id === hostile.id) continue;
                const range = hostile.pos.getRangeTo(healer);
                const healerPower = getPower(healer);
                if (range <= 1) healPower += healerPower.heal;
                else if (range <= 3) healPower += healerPower.rangedHeal;
            }
        }

        const targetMultiplier = hostilePower.damageMultiplier || 1;
        const effectiveHeal = healPower / targetMultiplier;

        let attackPower = 0;
        for (const t of readyTowers) {
            attackPower += determineDamage(hostile.pos.getRangeTo(t), t);
        }
        for (const c of friendlyMelee) {
            if (c.pos.isNearTo(hostile)) attackPower += getPower(c).meleeAttack;
        }
        for (const c of friendlyRanged) {
            if (c.pos.getRangeTo(hostile) <= 3) attackPower += getPower(c).rangedAttack;
        }

        if (effectiveHeal * 2 > attackPower) {
            shouldSpawnDefenders = true;
        }

        if (attackPower > effectiveHeal) {
            const ticksToKill = hostile.hits / (attackPower - effectiveHeal);
            const isHealer = hostileHealers.some(h => h.id === hostile.id);

            if (isHealer && ticksToKill < fastestHealerKill) {
                fastestHealerKill = ticksToKill;
                healerTarget = hostile;
            } else if (!isHealer && ticksToKill < fastestAttackerKill) {
                fastestAttackerKill = ticksToKill;
                attackerTarget = hostile;
            }
        }
    }

    const bestTarget = healerTarget || attackerTarget;

    if (shouldSpawnDefenders) {
        if (!attackLogCooldown[room.name + '_d'] || attackLogCooldown[room.name + '_d'] + 200 < Game.time) {
            log.a(`${roomLink(room.name)} under dangerous attack — spawning defenders.`, 'TOWER:');
            attackLogCooldown[room.name + '_d'] = Game.time;
        }
        room.memory.dangerousAttack = true;
        room.memory.spawnDefenders = true;
        room.memory.defenseCooldown = Game.time + CREEP_LIFE_TIME;
    }

    if (bestTarget) {
        room.memory.towerTarget = bestTarget.id;
        for (const tower of readyTowers) {
            tower.attack(bestTarget);
        }
    } else {
        combatRepair(room, readyTowers, hostileCreeps, friendlyCreeps);
    }
}

function combatRepair(room, towers, hostileCreeps, friendlyCreeps) {
    if (!towers.length) return;

    // Priority 1: Heal dying friendlies
    const criticalFriendly = friendlyCreeps.find(c => c.hits < c.hitsMax * 0.4);
    if (criticalFriendly) {
        towers.forEach(t => t.heal(criticalFriendly));
        return;
    }

    const armedEnemies = hostileCreeps.filter(c =>
        c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(WORK)
    );
    if (!armedEnemies.length) return;

    // Priority 2: Protect critical structures near enemies
    let target = null;
    let minHits = Infinity;

    const criticalTypes = [STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_STORAGE, STRUCTURE_TERMINAL];

    for (const s of room.structures) {
        if (!criticalTypes.includes(s.structureType) && s.structureType !== STRUCTURE_RAMPART) continue;
        if (s.hits >= (s.structureType === STRUCTURE_RAMPART ? 800000 : 50000)) continue;

        let isThreatened = false;
        for (const e of armedEnemies) {
            if (s.pos.getRangeTo(e) <= 10) {
                isThreatened = true;
                break;
            }
        }
        if (isThreatened && s.hits < minHits) {
            minHits = s.hits;
            target = s;
        }
    }

    if (target) {
        towers.forEach(t => t.repair(target));
    }
}

function determineDamage(range, tower) {
    let base;
    if (range <= TOWER_OPTIMAL_RANGE) {
        base = TOWER_POWER_ATTACK;
    } else if (range < TOWER_FALLOFF_RANGE) {
        base = TOWER_POWER_ATTACK - TOWER_FALLOFF * (range - TOWER_OPTIMAL_RANGE) / (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE);
    } else {
        base = TOWER_POWER_ATTACK - TOWER_FALLOFF;
    }

    if (tower?.effects) {
        const effect = tower.effects.find(e => e.effect === PWR_OPERATE_TOWER);
        if (effect) base *= POWER_INFO[PWR_OPERATE_TOWER].effect[effect.level - 1];
    }
    return Math.floor(base);
}