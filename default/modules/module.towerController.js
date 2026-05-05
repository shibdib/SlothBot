/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

let roomRepairTower = {};

module.exports.towerControl = function (room) {
    // Reset memory flags
    room.memory.towerTarget = undefined;
    room.memory.dangerousAttack = undefined;
    room.memory.spawnDefenders = undefined;

    let towers = _.filter(room.impassibleStructures, s => s.structureType === STRUCTURE_TOWER && s.isActive());
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
    if (cachedTower && cachedTower.store[RESOURCE_ENERGY] > TOWER_CAPACITY * 0.25) {
        return cachedTower;
    }

    let bestTower = _.max(_.filter(towers, s => s.store[RESOURCE_ENERGY] > TOWER_CAPACITY * 0.5), 'store.energy');
    if (bestTower && bestTower.id) {
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
function findDegradingStructure(room) {
    const multi = room.energyState ? 2 : 1;
    return _.find(room.structures, s =>
        (s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * (0.25 * multi)) ||
        (s.structureType === STRUCTURE_CONTAINER && s.hits < s.hitsMax * (0.2 * multi)) ||
        ((s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < 10000)
    );
}

// Handle hostile creeps in the room
function handleHostileCreeps(room, towers) {
    let readyTowers = _.filter(towers, s => s.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST);

    // If no towers and no safe mode, trigger defender spawning
    if (!readyTowers.length && !room.controller.safeMode) {
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

    let bestTarget = null;
    let lowestTicksToKill = Infinity;
    let shouldSpawnDefenders = false;

    for (let i = 0; i < room.hostileCreeps.length; i++) {
        let hostile = room.hostileCreeps[i];
        if (hostile.pos.checkIfOutOfBounds()) continue;

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
            attackPower += determineDamage(hostile.pos.getRangeTo(t));
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
            let netDamage = attackPower - effectiveHeal;
            let ticksToKill = hostile.hits / netDamage;
            if (ticksToKill < lowestTicksToKill) {
                lowestTicksToKill = ticksToKill;
                bestTarget = hostile;
            }
        }
    }

    if (shouldSpawnDefenders) {
        room.memory.dangerousAttack = true;
        room.memory.spawnDefenders = true;
        room.memory.defenseCooldown = Game.time + CREEP_LIFE_TIME;
    }

    if (bestTarget) {
        room.memory.towerTarget = bestTarget.id;
        for (let tower of readyTowers) {
            tower.attack(bestTarget);
        }
    } else if (room.energyState) {
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

    for (let s of room.structures) {
        if (s.structureType === STRUCTURE_RAMPART && s.hits < 1000000) {
            let nearEnemy = false;
            for (let e of enemies) {
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
    }

    if (targetRampart) {
        towers.forEach((t) => t.repair(targetRampart));
    }
}

// Computes damage of a tower based on range
function determineDamage(range) {
    if (range <= 5) {
        return 600;
    } else if (range < 20) {
        return 600 - 450 * (range - 5) / 15;
    } else {
        return 150;
    }
}
