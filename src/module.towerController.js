/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let roomRepairTower = {};

module.exports.towerControl = function (room) {
    let hostileCreeps = _.sortBy(room.hostileCreeps, 'hits');
    room.memory.towerTarget = undefined;
    room.memory.dangerousAttack = undefined;
    room.memory.spawnDefenders = undefined;
    // Set a repair tower
    let repairTower = Game.getObjectById(roomRepairTower[room.name]) || _.max(_.filter(room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] > TOWER_CAPACITY * 0.15), 'energy');
    if (!hostileCreeps.length && repairTower.id) {
        // Randomly clear repair tower to rotate it
        if (Math.random() > 0.95) roomRepairTower[room.name] = undefined; else roomRepairTower[room.name] = repairTower.id;
        let woundedCreep = _.filter(room.friendlyCreeps, (c) => c.hits < c.hitsMax && _.includes(FRIENDLIES, c.owner.username)).concat(_.filter(room.powerCreeps, (c) => c.hits < c.hitsMax && _.includes(FRIENDLIES, c.owner.username)));
        let degrade = _.filter(room.structures, (s) => (s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * 0.25) || (s.structureType === STRUCTURE_CONTAINER && s.hits < s.hitsMax * 0.2))[0];
        // Handle wounded healing and keep alive of degrading room.structures
        if (repairTower.store[RESOURCE_ENERGY] > TOWER_CAPACITY * 0.15 && (woundedCreep.length || degrade)) {
            if (woundedCreep.length > 0) {
                repairTower.heal(woundedCreep[0]);
            } else if (degrade) {
                return repairTower.repair(degrade);
            }
        } // Handle nuke rampart repair
        else if (room.nukes.length) {
            let nukeRampart;
            let towers = _.filter(room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.isActive() && s.store[RESOURCE_ENERGY]);
            let inRangeStructures = _.filter(room.structures, (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_LINK && s.structureType !== STRUCTURE_LAB && s.pos.getRangeTo(s.pos.findClosestByRange(FIND_NUKES)) <= 5 && s.pos.checkForRampart() && s.pos.checkForRampart().hits < NUKE_DAMAGE[2] + 15000);
            if (!inRangeStructures.length) inRangeStructures = _.filter(room.structures, (s) => !s.pos.getRangeTo(s.pos.findClosestByRange(FIND_NUKES)) && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_ROAD && s.pos.checkForRampart() && s.pos.checkForRampart().hits < NUKE_DAMAGE[0] + 15000 && (s.pos.checkForRampart().hits + ((towers.length * 500) * (s.pos.findClosestByRange(FIND_NUKES).timeToLand * 0.8))) >= NUKE_DAMAGE[0]);
            if (inRangeStructures.length) nukeRampart = inRangeStructures[0].pos.checkForRampart();
            if (nukeRampart) {
                for (let tower of towers) tower.repair(nukeRampart);
            } else {
                nukeRampart = _.filter(room.structures, (s) => s.structureType === STRUCTURE_RAMPART && s.pos.getRangeTo(s.pos.findClosestByRange(FIND_NUKES)) <= 5 && s.hits < NUKE_DAMAGE[2] + 15000 && (s.hits + ((towers.length * 500) * (s.pos.findClosestByRange(FIND_NUKES).timeToLand * 0.8))) >= NUKE_DAMAGE[2])[0];
                for (let tower of towers) tower.repair(nukeRampart);
            }
        } // Handle barrier repair
        else if (repairTower.store[RESOURCE_ENERGY] > TOWER_CAPACITY * 0.5) {
            let barriers = _.min(_.filter(room.structures, (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < 10000), 'hits');
            if (barriers.id) {
                return repairTower.repair(barriers);
            } else if (repairTower.store[RESOURCE_ENERGY] > TOWER_CAPACITY * 0.7 && repairTower.room.energyState) {
                let lowestRampart = _.min(_.filter(room.structures, (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < BARRIER_TARGET_HIT_POINTS[s.room.controller.level] * 0.5), 'hits');
                if (lowestRampart) {
                    return repairTower.repair(lowestRampart);
                }
            }
        }
    } else if (hostileCreeps.length) {
        let towers = _.shuffle(_.filter(room.structures, (s) => s && s.structureType === STRUCTURE_TOWER && s.isActive()));
        let potentialAttack = 0;
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
                let inRangeMeleeHealers = _.filter(hostileCreeps, (s) => s.pos.isNearTo(hostileCreeps[i]) && s.getActiveBodyparts(HEAL));
                let inRangeRangedHealers = _.filter(hostileCreeps, (s) => !s.pos.isNearTo(hostileCreeps[i]) && s.pos.getRangeTo(hostileCreeps[i]) < 4 && s.getActiveBodyparts(HEAL));
                if (inRangeMeleeHealers.length) inRangeMeleeHealers.forEach((c) => healPower += c.abilityPower().heal);
                if (inRangeRangedHealers.length) inRangeRangedHealers.forEach((c) => healPower += c.abilityPower().rangedHeal);
                healPower += hostileCreeps[i].abilityPower().heal;
            }
            // If attack power is less than heal power, spawn defenders
            if (healPower > attackPower) room.memory.spawnDefenders = true;
            let nearStructures = hostileCreeps[i].pos.findInRange(room.structures, 3, {filter: (s) => ![STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_CONTROLLER, STRUCTURE_WALL, STRUCTURE_RAMPART].includes(s.structureType)}).length > 0;
            // If the creep can be killed before it runs away do so
            if ((hostileCreeps[i].hits + healPower) - attackPower <= attackPower * hostileCreeps[i].pos.getRangeTo(hostileCreeps[i].pos.findClosestByRange(FIND_EXIT))) {
                room.memory.towerTarget = hostileCreeps[i].id;
                for (let tower of towers) tower.attack(hostileCreeps[i]);
                break;
            } // If it can be hurt and is near structures kill it
            else if (nearStructures) {
                room.memory.towerTarget = hostileCreeps[i].id;
                for (let tower of towers) tower.attack(hostileCreeps[i]);
                break;
            } // If you can damage it and it's not border humping attack it. Always attack invaders
            else if (attackPower >= healPower && ((hostileCreeps[i].pos.getRangeTo(hostileCreeps[i].pos.findClosestByRange(FIND_EXIT)) >= ((hostileCreeps[i].hits + healPower) / attackPower)) || hostileCreeps[i].owner.username === 'Invader')) {
                room.memory.towerTarget = hostileCreeps[i].id;
                for (let tower of towers) tower.attack(hostileCreeps[i]);
                break;
            } // Handle nuke rampart repair
            else if (room.nukes.length) {
                if (potentialAttack < healPower) room.memory.dangerousAttack = true; else room.memory.towerTarget = hostileCreeps[i].id;
                room.memory.towerTarget = undefined;
                let nukeRampart;
                let towers = _.filter(room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.isActive() && s.store[RESOURCE_ENERGY]);
                let inRangeStructures = _.filter(room.structures, (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_LINK && s.structureType !== STRUCTURE_LAB && s.pos.getRangeTo(s.pos.findClosestByRange(FIND_NUKES)) <= 5 && s.pos.checkForRampart() && s.pos.checkForRampart().hits < NUKE_DAMAGE[2] + 15000);
                if (!inRangeStructures.length) inRangeStructures = _.filter(room.structures, (s) => !s.pos.getRangeTo(s.pos.findClosestByRange(FIND_NUKES)) && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_ROAD && s.pos.checkForRampart() && s.pos.checkForRampart().hits < NUKE_DAMAGE[0] + 15000 && (s.pos.checkForRampart().hits + ((towers.length * 500) * (s.pos.findClosestByRange(FIND_NUKES).timeToLand * 0.8))) >= NUKE_DAMAGE[0]);
                if (inRangeStructures.length) nukeRampart = inRangeStructures[0].pos.checkForRampart();
                if (nukeRampart) {
                    for (let tower of towers) tower.repair(nukeRampart);
                } else {
                    nukeRampart = _.filter(room.structures, (s) => s.structureType === STRUCTURE_RAMPART && s.pos.getRangeTo(s.pos.findClosestByRange(FIND_NUKES)) <= 5 && s.hits < NUKE_DAMAGE[2] + 15000 && (s.hits + ((towers.length * 500) * (s.pos.findClosestByRange(FIND_NUKES).timeToLand * 0.8))) >= NUKE_DAMAGE[2])[0];
                    for (let tower of towers) tower.repair(nukeRampart);
                }
            }  // Else if it's near a barrier, repair the barrier
            else {
                let nearbyRampart = _.min(_.filter(room.structures, (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.pos.findInRange(_.filter(s.room.hostileCreeps, (c) => c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK) || c.getActiveBodyparts(WORK)), 3)[0] && s.hits < BARRIER_TARGET_HIT_POINTS[room.level]), 'hits');
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