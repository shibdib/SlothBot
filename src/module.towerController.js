/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let roomRepairTower = {};

module.exports.towerControl = function (room) {
    room.memory.towerTarget = undefined;
    room.memory.dangerousAttack = undefined;
    room.memory.spawnDefenders = undefined;
    // Set a repair tower
    let repairTower = Game.getObjectById(roomRepairTower[room.name]) || _.max(_.filter(room.impassibleStructures, (s) => s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] > TOWER_CAPACITY * 0.5), 'energy');
    if (!room.hostileCreeps.length && repairTower.id && repairTower.store[RESOURCE_ENERGY] > TOWER_CAPACITY * 0.25) {
        roomRepairTower[room.name] = repairTower.id;
        let woundedCreep = _.find(room.friendlyCreeps, (c) => c.hits < c.hitsMax) || _.find(room.powerCreeps, (c) => c.hits < c.hitsMax && _.includes(FRIENDLIES, c.owner.username));
        let degrade = _.find(room.structures, (s) => (s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * 0.25) || (s.structureType === STRUCTURE_CONTAINER && s.hits < s.hitsMax * 0.2) || (s.structureType === STRUCTURE_RAMPART && s.hits < 10000));
        // Handle wounded healing and keep alive of degrading room.structures
        if (woundedCreep || degrade) {
            if (woundedCreep) {
                repairTower.heal(woundedCreep);
            } else if (degrade) {
                repairTower.repair(degrade);
            }
        }
        // If energy rich, pump it into ramparts
        /**
        if (room.energyState) {
            let barrier = _.min(_.filter(room.structures, (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < BARRIER_TARGET_HIT_POINTS[room.level]), 'hits');
            if (barrier.id) repairTower.repair(barrier);
        }**/
    } else if (room.hostileCreeps.length) {
        let hostileCreeps = _.sortBy(room.hostileCreeps, 'hits');
        let towers = _.shuffle(_.filter(room.impassibleStructures, (s) => s && s.structureType === STRUCTURE_TOWER && s.isActive() && s.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST));
        if (!towers.length && !room.controller.safeMode) {
            room.memory.dangerousAttack = true;
            room.memory.spawnDefenders = true;
            return;
        }
        let potentialAttack = 0;
        let woundedCreep = _.find(room.friendlyCreeps, (c) => c.hits < c.hitsMax && _.includes(FRIENDLIES, c.owner.username)) || _.find(room.powerCreeps, (c) => c.hits < c.hitsMax && _.includes(FRIENDLIES, c.owner.username));
        _.filter(room.friendlyCreeps, (c) => c && c.my && c.memory.military).forEach((c) => potentialAttack += c.abilityPower().attack);
        for (let i = 0; i < hostileCreeps.length; i++) {
            // Determine attack power of towers and nearby creeps
            towers.forEach((t) => potentialAttack += determineDamage(hostileCreeps[i].pos.getRangeTo(t)));
            let attackPower = 0;
            let inMeleeRange = _.filter(room.friendlyCreeps, (c) => c.pos.getRangeTo(hostileCreeps[i]) === 1);
            let inRangedRange = _.filter(room.friendlyCreeps, (c) => c.pos.getRangeTo(hostileCreeps[i]) <= 3);
            if (inMeleeRange.length) inMeleeRange.forEach((c) => attackPower += c.abilityPower().attack);
            if (inRangedRange.length) inRangedRange.forEach((c) => attackPower += c.abilityPower().ranged);
            towers.forEach((t) => attackPower += determineDamage(hostileCreeps[i].pos.getRangeTo(t)));
            // Determine heal power only if room isn't safeMode
            let healPower = 0;
            if (!room.controller.safeMode) {
                let inRangeMeleeHealers = _.filter(hostileCreeps, (s) => s.pos.isNearTo(hostileCreeps[i]) && s.hasActiveBodyparts(HEAL));
                let inRangeRangedHealers = _.filter(hostileCreeps, (s) => !s.pos.isNearTo(hostileCreeps[i]) && s.pos.getRangeTo(hostileCreeps[i]) < 4 && s.hasActiveBodyparts(HEAL));
                if (inRangeMeleeHealers.length) inRangeMeleeHealers.forEach((c) => healPower += c.abilityPower().heal);
                if (inRangeRangedHealers.length) inRangeRangedHealers.forEach((c) => healPower += c.abilityPower().rangedHeal);
                healPower += hostileCreeps[i].abilityPower().heal;
            }
            // If attack power is less than heal power, spawn defenders
            if (healPower * 2 > attackPower) {
                room.memory.dangerousAttack = true;
                room.memory.spawnDefenders = true;
                room.memory.defenseCooldown = Game.time + CREEP_LIFE_TIME;
            }
            let nearStructures = hostileCreeps[i].pos.findInRange(room.impassibleStructures, 3).length > 0;
            let rangeToExit = hostileCreeps[i].pos.getRangeTo(hostileCreeps[i].pos.findClosestByRange(FIND_EXIT)) + 1;
            // If it can be hurt and is near structures kill it
            if (attackPower > healPower && nearStructures) {
                room.memory.towerTarget = hostileCreeps[i].id;
                for (let tower of towers) tower.attack(hostileCreeps[i]);
                break;
            } // If you can damage it and it's not border humping attack it. Always attack invaders
            else if (attackPower > healPower && (hostileCreeps[i].owner.username === 'Invader' || (hostileCreeps[i].hits + (healPower * (rangeToExit + (hostileCreeps[i].fatigue * 0.5))) < attackPower * (rangeToExit + (hostileCreeps[i].fatigue * 0.5))))) {
                room.memory.towerTarget = hostileCreeps[i].id;
                for (let tower of towers) tower.attack(hostileCreeps[i]);
                break;
            } // Handle nuke rampart repair
            else if (room.nukes.length) {
                if (potentialAttack < healPower) room.memory.dangerousAttack = true; else room.memory.towerTarget = hostileCreeps[i].id;
                room.memory.towerTarget = undefined;
                let nukeRampart;
                let towers = _.filter(room.impassibleStructures, (s) => s.structureType === STRUCTURE_TOWER && s.isActive() && s.store[RESOURCE_ENERGY]);
                let inRangeStructures = _.filter(room.impassibleStructures, (s) => s.pos.getRangeTo(s.pos.findClosestByRange(FIND_NUKES)) <= 5 && s.pos.checkForRampart() && s.pos.checkForRampart().hits < NUKE_DAMAGE[2] + 15000);
                if (!inRangeStructures.length) inRangeStructures = _.filter(room.impassibleStructures, (s) => !s.pos.getRangeTo(s.pos.findClosestByRange(FIND_NUKES)) && s.pos.checkForRampart() && s.pos.checkForRampart().hits < NUKE_DAMAGE[0] + 15000 && (s.pos.checkForRampart().hits + ((towers.length * 500) * (s.pos.findClosestByRange(FIND_NUKES).timeToLand * 0.8))) >= NUKE_DAMAGE[0]);
                if (inRangeStructures.length) nukeRampart = inRangeStructures[0].pos.checkForRampart();
                if (nukeRampart) {
                    for (let tower of towers) tower.repair(nukeRampart);
                } else {
                    nukeRampart = _.filter(room.structures, (s) => s.structureType === STRUCTURE_RAMPART && s.pos.getRangeTo(s.pos.findClosestByRange(FIND_NUKES)) <= 5 && s.hits < NUKE_DAMAGE[2] + 15000 && (s.hits + ((towers.length * 500) * (s.pos.findClosestByRange(FIND_NUKES).timeToLand * 0.8))) >= NUKE_DAMAGE[2])[0];
                    for (let tower of towers) tower.repair(nukeRampart);
                }
            } // Heal allies
            else if (woundedCreep && repairTower && repairTower.id) {
                repairTower.heal(woundedCreep);
            }  // Else if it's near a barrier, repair the barrier
            else if (room.energyState && room.storage) {
                let nearbyRampart = _.min(_.filter(room.structures, (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.pos.findInRange(_.filter(s.room.hostileCreeps, (c) => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(WORK)), 3)[0] && s.hits < BARRIER_TARGET_HIT_POINTS[room.level]), 'hits');
                if (nearbyRampart.id) for (let tower of towers) tower.repair(nearbyRampart);
                if (potentialAttack < healPower) room.memory.dangerousAttack = true; else room.memory.towerTarget = hostileCreeps[i].id;
                room.memory.towerTarget = undefined;
            }
        }
    }
};

// Computes damage of a tower
function determineDamage(range) {
    if (range <= 5) {
        return 600;
    } else if (range < 20) {
        return 600 - 450 * (range - 5) / 15;
    } else {
        return 150;
    }
}