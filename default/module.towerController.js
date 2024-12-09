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
    } else if (repairTower) {
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
    // Check if room is in a state where we can repair
    if (room.energyState && repairTower.store[RESOURCE_ENERGY] > TOWER_CAPACITY * 0.25) {
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
    return _.find(room.structures, s =>
        (s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * 0.25) ||
        (s.structureType === STRUCTURE_CONTAINER && s.hits < s.hitsMax * 0.2) ||
        ((s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < 10000)
    );
}

// Handle hostile creeps in the room
function handleHostileCreeps(room) {
    let hostileCreeps = _.sortBy(room.hostileCreeps, 'hits'); // Sort hostile creeps by their hit points for more efficient targeting
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
        if (shouldAttackHostileCreep(attackPower, healPower, hostileCreeps[i])) {
            room.memory.towerTarget = hostileCreeps[i].id;
            towers.forEach(tower => tower.attack(hostileCreeps[i]));
            break;
        }

        // If the hostile creep has enough healing power, spawn defenders
        if (shouldSpawnDefenders(attackPower, healPower)) {
            room.memory.dangerousAttack = true;
            room.memory.spawnDefenders = true;
            room.memory.defenseCooldown = Game.time + CREEP_LIFE_TIME;
            break;
        }
    }
}

// Calculate the attack power against a single hostile creep
function calculateAttackPower(room, hostileCreep, towers) {
    let attackPower = 0;

    let inMeleeRange = _.filter(room.friendlyCreeps, c => c.pos.getRangeTo(hostileCreep) === 1);
    let inRangedRange = _.filter(room.friendlyCreeps, c => c.pos.getRangeTo(hostileCreep) <= 3);

    // Add attack power from friendly creeps
    inMeleeRange.forEach(c => attackPower += c.abilityPower().attack);
    inRangedRange.forEach(c => attackPower += c.abilityPower().ranged);

    // Add tower damage
    towers.forEach(t => attackPower += determineDamage(hostileCreep.pos.getRangeTo(t)));

    return attackPower;
}

// Calculate the heal power of a hostile creep
function calculateHealPower(room, hostileCreep) {
    let healPower = 0;

    if (!room.controller.safeMode) {
        let inRangeMeleeHealers = _.filter(hostileCreep.room.hostileCreeps, s => s.pos.isNearTo(hostileCreep) && s.hasActiveBodyparts(HEAL));
        let inRangeRangedHealers = _.filter(hostileCreep.room.hostileCreeps, s => s.pos.getRangeTo(hostileCreep) < 4 && s.hasActiveBodyparts(HEAL));

        inRangeMeleeHealers.forEach(c => healPower += c.abilityPower().heal);
        inRangeRangedHealers.forEach(c => healPower += c.abilityPower().rangedHeal);
        healPower += hostileCreep.abilityPower().heal;
    }

    return healPower;
}

// Determine if we should attack a hostile creep based on attack and heal power
function shouldAttackHostileCreep(attackPower, healPower, hostileCreep) {
    // Only attack if we can do more damage than the heal power, or if it is an invader (who should always be attacked)
    return (attackPower > healPower && (hostileCreep.owner.username === 'Invader' || hostileCreep.hits > healPower));
}

// Determine if we should spawn defenders based on the attack and heal power
function shouldSpawnDefenders(attackPower, healPower) {
    // If the heal power of the enemy is greater than twice the attack power, we should spawn defenders
    return healPower * 2 > attackPower;
}

// Handle nuke rampart repair logic
function handleNukeRampartRepair(room, towers) {
    room.memory.towerTarget = undefined;

    let nukeRampart = findNukeRampart(room);
    if (nukeRampart) {
        towers.forEach(tower => tower.repair(nukeRampart));
    }
}

// Find the appropriate rampart to repair in case of a nuke
function findNukeRampart(room) {
    let inRangeStructures = _.filter(room.impassibleStructures, s =>
        s.pos.getRangeTo(s.pos.findClosestByRange(FIND_NUKES)) <= 5 && s.pos.checkForRampart() && s.pos.checkForRampart().hits < NUKE_DAMAGE[2] + 15000
    );

    if (!inRangeStructures.length) {
        inRangeStructures = _.filter(room.impassibleStructures, s =>
            !s.pos.getRangeTo(s.pos.findClosestByRange(FIND_NUKES)) && s.pos.checkForRampart() && s.pos.checkForRampart().hits < NUKE_DAMAGE[0] + 15000
        );
    }

    return inRangeStructures.length ? inRangeStructures[0].pos.checkForRampart() : null;
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
