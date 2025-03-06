/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

let roomRepairTower = {};

module.exports.towerControl = function (room) {
    // Reset memory flags
    room.memory.towerTarget = undefined;
    room.memory.dangerousAttack = undefined;
    room.memory.spawnDefenders = undefined;

    // Handle repair tower selection and checking energy state
    let repairTower = getRepairTower(room);

    if (room.hostileCreeps.length) {
        handleHostileCreeps(room);
    } else if (repairTower && room.energyState) {
        handleRepairTowerActions(room, repairTower);
    }
};

// Helper function to get the best repair tower
function getRepairTower(room) {
    return Game.getObjectById(roomRepairTower[room.name]) || _.max(
        _.filter(room.impassibleStructures, s => s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] > TOWER_CAPACITY * 0.5),
        'energy'
    );
}

// Handle repair tower actions
function handleRepairTowerActions(room, repairTower) {
    // Clear bugged towers
    if (!(repairTower instanceof StructureTower)) {
        return roomRepairTower[room.name] = undefined;
    }
    // Check if room is in a state where we can repair
    if (repairTower && repairTower.store[RESOURCE_ENERGY] > TOWER_CAPACITY * 0.25) {
        roomRepairTower[room.name] = repairTower.id;

        let woundedCreep = findWoundedCreep(room);
        let degradingStructure = findDegradingStructure(room);

        // Perform healing or repair
        if (woundedCreep) {
            repairTower.heal(woundedCreep);
        } else if (degradingStructure) {
            repairTower.repair(degradingStructure);
        }
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
        (s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * (0.25 & multi)) ||
        (s.structureType === STRUCTURE_CONTAINER && s.hits < s.hitsMax * (0.2 & multi)) ||
        ((s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < 10000)
    );
}

// Handle hostile creeps in the room
function handleHostileCreeps(room) {
    let hostileCreeps = _.sortBy(room.hostileCreeps, function (c) {
        return c.hits + calculateHealPower(room, c);
    }); // Sort hostile creeps by their hit points for more efficient targeting
    let towers = _.shuffle(_.filter(room.impassibleStructures, s => s.structureType === STRUCTURE_TOWER && s.isActive() && s.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST));

    // If no towers and no safe mode, trigger defender spawning
    if (!towers.length && !room.controller.safeMode) {
        room.memory.dangerousAttack = true;
        room.memory.spawnDefenders = true;
        return;
    }

    for (let i = 0; i < hostileCreeps.length; i++) {
        let attackPower = calculateAttackPower(room, hostileCreeps[i], towers);
        let healPower = calculateHealPower(room, hostileCreeps[i]);

        // Check if the enemy creep should be attacked or if defenders should be spawned
        if (attackPower > healPower) {
            room.memory.towerTarget = hostileCreeps[i].id;
            const targetTank = hostileCreeps[i].hits + healPower;
            let damageDone = 0;
            const sortedTowers = _.sortBy(towers, function (t) {
                return determineDamage(t.pos.getRangeTo(hostileCreeps[i]));
            })
            for (const tower of sortedTowers) {
                tower.attack(hostileCreeps[i]);
                damageDone += determineDamage(tower.pos.getRangeTo(hostileCreeps[i]));
                if (damageDone > targetTank) break;
            }
            break;
        } else if (room.energyState) {
            combatRepair(room);
        }

        // If the hostile creep has enough healing power, spawn defenders
        if (healPower * 2 > attackPower) {
            room.memory.dangerousAttack = true;
            room.memory.spawnDefenders = true;
            room.memory.defenseCooldown = Game.time + CREEP_LIFE_TIME;
            break;
        }
    }
}

function combatRepair(room) {
    const enemies = room.creeps.filter((c) => !c.my && (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(WORK) || c.hasActiveBodyparts(RANGED_ATTACK)));
    const damagedCreep = findWoundedCreep(room);
    const ramparts = room.structures.filter((s) => s.structureType === STRUCTURE_RAMPART && s.hits < 1000000 && s.pos.findInRange(enemies, 8).length);
    const towers = room.structures.filter((s) => s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] > TOWER_ENERGY_COST);
    if (damagedCreep) {
        towers.forEach((t) => t.heal(damagedCreep))
    } else if (ramparts.length) {
        towers.forEach((t) => t.repair(_.min(ramparts, 'hits')))
    }
}

// Calculate the attack power against a single hostile creep
function calculateAttackPower(room, hostileCreep, towers) {
    let attackPower = 0;

    let inMeleeRange = _.filter(room.friendlyCreeps, c => c.pos.isNearTo(hostileCreep) && c.hasActiveBodyparts(ATTACK));
    let inRangedRange = _.filter(room.friendlyCreeps, c => c.pos.getRangeTo(hostileCreep) <= 3 && c.hasActiveBodyparts(RANGED_ATTACK));

    // Add attack power from friendly creeps
    inMeleeRange.forEach(c => attackPower += abilityPower(c.body).attack);
    inRangedRange.forEach(c => attackPower += abilityPower(c.body).rangedAttack);

    // Add tower damage
    towers.forEach(t => attackPower += determineDamage(hostileCreep.pos.getRangeTo(t)));

    return attackPower;
}

// Calculate the heal power of a hostile creep
const healPowerCache = {};
function calculateHealPower(room, hostileCreep) {
    const cacheKey = hostileCreep.id + '.' + _.filter(hostileCreep.body, (b) => b.hits).length;
    if (healPowerCache[cacheKey]) return healPowerCache[cacheKey];
    let healPower = 0;

    if (!room.controller.safeMode) {
        let inRangeMeleeHealers = _.filter(room.hostileCreeps, s => s.pos.isNearTo(hostileCreep) && s.hasActiveBodyparts(HEAL));
        let inRangeRangedHealers = _.filter(room.hostileCreeps, s => s.pos.getRangeTo(hostileCreep) <= 3 && s.hasActiveBodyparts(HEAL));

        inRangeMeleeHealers.forEach(c => healPower += abilityPower(c.body).heal);
        inRangeRangedHealers.forEach(c => healPower += abilityPower(c.body).rangedHeal);
        healPower += abilityPower(hostileCreep.body).heal;
    }

    healPowerCache[cacheKey] = healPower;
    return healPower;
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
