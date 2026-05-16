/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

let roomRepairTower = {};
const attackLogCooldown = {}; // Prevents per-tick log spam for attack events

module.exports.towerControl = function (room) {
    // Reset memory flags
    room.memory.towerTarget = undefined;
    room.memory.dangerousAttack = undefined;
    room.memory.spawnDefenders = undefined;

    let towers = _.filter(room.towers, s => s.isActive());
    if (!towers.length) return;

    if (room.hostileCreeps.length) {
        handleHostileCreeps(room, towers);
    } else {
        let repairTower = getRepairTower(room, towers);
        if (repairTower) {
            handleRepairTowerActions(room, repairTower);
        }
    }
};

// Helper function to get the best repair tower
function getRepairTower(room, towers) {
    let cachedTower = Game.getObjectById(roomRepairTower[room.name]);
    if (cachedTower && towers.some(t => t.id === cachedTower.id) && cachedTower.store[RESOURCE_ENERGY] > TOWER_CAPACITY * 0.25) {
        return cachedTower;
    }

    // Clear stale cache entry if tower is gone
    if (!cachedTower) roomRepairTower[room.name] = undefined;

    let bestTower = _.max(_.filter(towers, s => s.store[RESOURCE_ENERGY] > TOWER_CAPACITY * 0.5), t => t.store[RESOURCE_ENERGY]);
    if (bestTower && bestTower.id) {
        roomRepairTower[room.name] = bestTower.id;
        return bestTower;
    }
    return null;
}

// Handle repair tower actions
function handleRepairTowerActions(room, repairTower) {
    roomRepairTower[room.name] = repairTower.id;

    let woundedCreep = findWoundedCreep(room);
    if (woundedCreep) {
        repairTower.heal(woundedCreep);
        return;
    }

    let degradingStructure = findDegradingStructure(room);
    if (degradingStructure && room.energyState) {
        repairTower.repair(degradingStructure);
    }
}

// Find the first wounded creep (friendly or powerCreep)
function findWoundedCreep(room) {
    return _.find(room.friendlyCreeps, c => c.hits < c.hitsMax) || _.find(room.powerCreeps, c => c.hits < c.hitsMax && _.includes(FRIENDLIES, c.owner.username));
}

// Find structures that are degrading and need repair
// multi was always 2 here (repair only runs when energyState > 0), so thresholds are inlined
function findDegradingStructure(room) {
    for (const s of room.structures) {
        if (s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * 0.5) return s;
        if (s.structureType === STRUCTURE_CONTAINER && s.hits < s.hitsMax * 0.4) return s;
        if ((s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < 10000) return s;
    }
    return null;
}

// Handle hostile creeps in the room
function handleHostileCreeps(room, towers) {
    let readyTowers = _.filter(towers, s => s.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST);

    // If no towers and no safe mode, trigger defender spawning
    if (!readyTowers.length && !room.controller.safeMode) {
        if (!attackLogCooldown[room.name + '_e'] || attackLogCooldown[room.name + '_e'] + 200 < Game.time) {
            log.a(`${roomLink(room.name)} towers out of energy during attack — spawning defenders.`, 'TOWER:');
            attackLogCooldown[room.name + '_e'] = Game.time;
        }
        room.memory.dangerousAttack = true;
        room.memory.spawnDefenders = true;
        return;
    }

    // Cache friendly damage dealers and hostile healers for this tick
    let friendlyMelee = _.filter(room.friendlyCreeps, c => c.hasActiveBodyparts(ATTACK));
    let friendlyRanged = _.filter(room.friendlyCreeps, c => c.hasActiveBodyparts(RANGED_ATTACK));
    let hostileHealers = _.filter(room.hostileCreeps, c => c.hasActiveBodyparts(HEAL));

    // Power calculation cache for the current tick to avoid redundant body iteration
    let powerCache = new Map();

    function getPower(creep) {
        if (!powerCache.has(creep.id)) {
            powerCache.set(creep.id, abilityPower(creep.body));
        }
        return powerCache.get(creep.id);
    }

    // Two-phase target selection: healers first, then fastest-to-kill attacker.
    // Killing healers first reduces the effective HP of all remaining hostiles.
    let healerTarget = null;
    let fastestHealerKill = Infinity;
    let attackerTarget = null;
    let fastestAttackerKill = Infinity;
    let shouldSpawnDefenders = false;

    for (let hostile of room.hostileCreeps) {

        let hostilePower = getPower(hostile);
        let healPower = hostilePower.heal || 0;

        if (!room.controller.safeMode) {
            for (let healer of hostileHealers) {
                if (healer.id === hostile.id) continue;
                let range = hostile.pos.getRangeTo(healer);
                let healerPower = getPower(healer);
                if (range <= 1) healPower += healerPower.heal;
                else if (range <= 3) healPower += healerPower.rangedHeal;
            }
        }

        let targetMultiplier = hostilePower.damageMultiplier || 1;
        let effectiveHeal = healPower / targetMultiplier;

        let attackPower = 0;
        for (let t of readyTowers) {
            attackPower += determineDamage(hostile.pos.getRangeTo(t), t);
        }
        for (let c of friendlyMelee) {
            if (c.pos.isNearTo(hostile)) attackPower += getPower(c).meleeAttack;
        }
        for (let c of friendlyRanged) {
            if (c.pos.getRangeTo(hostile) <= 3) attackPower += getPower(c).rangedAttack;
        }

        room.visual.text(attackPower + ' / ' + effectiveHeal.toFixed(0), hostile.pos.x, hostile.pos.y, {
            align: 'left',
            opacity: 0.8
        });

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

    // Prefer killing healers — once healing support is gone, remaining creeps fold quickly
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
        for (let tower of readyTowers) {
            tower.attack(bestTarget);
        }
    } else {
        combatRepair(room, readyTowers);
    }
}

function combatRepair(room, towers) {
    if (!towers.length) return;

    const damagedCreep = findWoundedCreep(room);
    if (damagedCreep) {
        towers.forEach((t) => t.heal(damagedCreep));
        return;
    }

    const enemies = _.filter(room.hostileCreeps, c => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(WORK) || c.hasActiveBodyparts(RANGED_ATTACK));
    if (!enemies.length) return;

    let targetRampart = null;
    let minHits = Infinity;

    for (const s of room.structures) {
        if (s.structureType !== STRUCTURE_RAMPART || s.hits >= 1000000) continue;
        let nearEnemy = false;
        for (const e of enemies) {
            if (s.pos.getRangeTo(e) <= 8) {
                nearEnemy = true;
                break;
            }
        }
        if (nearEnemy && s.hits < minHits) {
            minHits = s.hits;
            targetRampart = s;
        }
    }

    if (targetRampart) {
        towers.forEach((t) => t.repair(targetRampart));
    }
}

// Computes damage of a tower based on range, accounting for PWR_OPERATE_TOWER boosts
function determineDamage(range, tower) {
    let base;
    if (range <= TOWER_OPTIMAL_RANGE) {
        base = TOWER_POWER_ATTACK;
    } else if (range < TOWER_FALLOFF_RANGE) {
        base = TOWER_POWER_ATTACK - TOWER_FALLOFF * (range - TOWER_OPTIMAL_RANGE) / (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE);
    } else {
        base = TOWER_POWER_ATTACK - TOWER_FALLOFF;
    }
    // Apply PWR_OPERATE_TOWER boost if a power creep has activated it on this tower
    if (tower && tower.effects) {
        const effect = tower.effects.find(e => e.effect === PWR_OPERATE_TOWER);
        if (effect) base *= POWER_INFO[PWR_OPERATE_TOWER].effect[effect.level - 1];
    }
    return Math.floor(base);
}
