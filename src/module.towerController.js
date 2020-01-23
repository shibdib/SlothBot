/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by rober on 5/16/2017.
 */

let roomRepairTower = {};

module.exports.towerControl = function (room) {
    let creeps = room.friendlyCreeps;
    let hostileCreeps = _.sortBy(room.hostileCreeps, 'hits');
    let structures = room.structures;
    let repairTower = Game.getObjectById(roomRepairTower[room.name]) || _.max(_.filter(structures, (s) => s.structureType === STRUCTURE_TOWER && s.energy > s.energyCapacity * 0.15), 'energy');
    if (!hostileCreeps.length && repairTower) {
        if (Math.random() > 0.95) roomRepairTower[room.name] = undefined; else roomRepairTower[room.name] = repairTower.id;
        let woundedCreep = _.filter(creeps, (c) => c.hits < c.hitsMax && _.includes(FRIENDLIES, c.owner.username)).concat(_.filter(room.powerCreeps, (c) => c.hits < c.hitsMax && _.includes(FRIENDLIES, c.owner.username)));
        let degrade = _.filter(structures, (s) => (s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * 0.5) || (s.structureType === STRUCTURE_CONTAINER && s.hits < s.hitsMax * 0.25))[0];
        if (repairTower.energy > repairTower.energyCapacity * 0.15 && (woundedCreep.length || degrade)) {
            if (woundedCreep.length > 0) {
                repairTower.heal(woundedCreep[0]);
            } else if (degrade) {
                return repairTower.repair(degrade);
            }
        } else if (room.memory.nuke) {
            let nukeRampart;
            let towers = _.shuffle(_.filter(structures, (s) => s.structureType === STRUCTURE_TOWER && s.isActive() && s.energy > s.energyCapacity * (s.pos.findClosestByRange(FIND_NUKES).timeToLand / NUKE_LAND_TIME)));
            let inRangeStructures = _.filter(room.structures, (s) => 0 < s.pos.getRangeTo(s.pos.findClosestByRange(FIND_NUKES)) <= 5 && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_ROAD && s.pos.checkForRampart() && s.pos.checkForRampart().hits < NUKE_DAMAGE[2] + 15000 && (s.pos.checkForRampart().hits + ((towers.length * 500) * (s.pos.findClosestByRange(FIND_NUKES).timeToLand * 0.8))) >= NUKE_DAMAGE[2]);
            if (!inRangeStructures.length) inRangeStructures = _.filter(room.structures, (s) => !s.pos.getRangeTo(s.pos.findClosestByRange(FIND_NUKES)) && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_ROAD && s.pos.checkForRampart() && s.pos.checkForRampart().hits < NUKE_DAMAGE[0] + 15000 && (s.pos.checkForRampart().hits + ((towers.length * 500) * (s.pos.findClosestByRange(FIND_NUKES).timeToLand * 0.8))) >= NUKE_DAMAGE[0]);
            if (inRangeStructures.length) nukeRampart = _.filter(inRangeStructures, (s) => s.structureType === STRUCTURE_SPAWN)[0].pos.checkForRampart() || _.filter(inRangeStructures, (s) => s.structureType === STRUCTURE_TERMINAL)[0].pos.checkForRampart() || _.filter(inRangeStructures, (s) => s.structureType === STRUCTURE_STORAGE)[0].pos.checkForRampart() || _.sample(inRangeStructures).pos.checkForRampart();
            if (nukeRampart) {
                for (let tower of towers) tower.repair(nukeRampart);
            } else {
                nukeRampart = _.filter(room.structures, (s) => s.structureType === STRUCTURE_RAMPART && s.pos.getRangeTo(s.pos.findClosestByRange(FIND_NUKES)) <= 5 && s.hits < NUKE_DAMAGE[2] + 15000 && (s.hits + ((towers.length * 500) * (s.pos.findClosestByRange(FIND_NUKES).timeToLand * 0.8))) >= NUKE_DAMAGE[2])[0];
                for (let tower of towers) tower.repair(nukeRampart);
            }
        } else if (repairTower.energy > repairTower.energyCapacity * 0.5) {
            let structures = room.structures;
            let barriers = _.min(_.filter(structures, (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < 5000), 'hits')[0];
            if (barriers) {
                return repairTower.repair(barriers);
            }
            if (repairTower.energy > repairTower.energyCapacity * 0.7) {
                let lowestRampart = _.min(_.filter(structures, (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < BARRIER_TARGET_HIT_POINTS[s.room.controller.level]), 'hits');
                if (lowestRampart) {
                    return repairTower.repair(lowestRampart);
                }
            }
        }
    } else if (hostileCreeps.length) {
        let towers = _.shuffle(_.filter(structures, (s) => s && s.structureType === STRUCTURE_TOWER && s.isActive()));
        let potentialAttack = 0;
        _.filter(creeps, (c) => c && c.my && c.memory.military).forEach((c) => potentialAttack += c.abilityPower().attack);
        for (let i = 0; i < hostileCreeps.length; i++) {
            towers.forEach((t) => potentialAttack += determineDamage(hostileCreeps[i].pos.getRangeTo(t)));
            let inRangeMeleeHealers = _.filter(hostileCreeps, (s) => s.pos.getRangeTo(hostileCreeps[i]) === 1 && s.getActiveBodyparts(HEAL));
            let inRangeRangedHealers = _.filter(hostileCreeps, (s) => s.pos.getRangeTo(hostileCreeps[i]) > 1 && s.pos.getRangeTo(hostileCreeps[i]) < 4 && s.getActiveBodyparts(HEAL));
            let inMeleeRange = _.filter(creeps, (c) => c.pos.getRangeTo(hostileCreeps[i]) === 1);
            let inRangedRange = _.filter(creeps, (c) => c.pos.getRangeTo(hostileCreeps[i]) <= 3);
            let attackPower = 0;
            if (inMeleeRange.length) inMeleeRange.forEach((c) => attackPower += c.abilityPower().attack);
            if (inRangedRange.length) inRangedRange.forEach((c) => attackPower += c.abilityPower().ranged);
            towers.forEach((t) => attackPower += determineDamage(hostileCreeps[i].pos.getRangeTo(t)));
            let healPower = 0;
            if (inRangeMeleeHealers.length) inRangeMeleeHealers.forEach((c) => healPower += c.abilityPower(true).defense);
            if (inRangeRangedHealers.length) inRangeRangedHealers.forEach((c) => healPower += c.abilityPower(true).defense);
            healPower += hostileCreeps[i].abilityPower().defense;
            if (room.controller.safeMode) healPower = 0;
            let nearStructures = hostileCreeps[i].pos.findInRange(room.structures, 3, {filter: (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_RAMPART}).length > 0;
            if ((hostileCreeps[i].hits + healPower) - attackPower <= attackPower * hostileCreeps[i].pos.getRangeTo(hostileCreeps[i].pos.findClosestByRange(FIND_EXIT))) {
                room.memory.towerTarget = hostileCreeps[i].id;
                for (let tower of towers) tower.attack(hostileCreeps[i]);
                break;
            } else if (attackPower > healPower && nearStructures) {
                room.memory.towerTarget = hostileCreeps[i].id;
                for (let tower of towers) tower.attack(hostileCreeps[i]);
                break;
            } else if (potentialAttack > healPower && nearStructures) {
                room.memory.towerTarget = hostileCreeps[i].id;
                break;
            } else if (attackPower * 0.6 >= healPower && ((hostileCreeps[i].pos.getRangeTo(hostileCreeps[i].pos.findClosestByRange(FIND_EXIT)) >= 2 && !room.controller.safeMode) || hostileCreeps[i].owner.username === 'Invader')) {
                room.memory.towerTarget = hostileCreeps[i].id;
                for (let tower of towers) tower.attack(hostileCreeps[i]);
                break;
            } else {
                let nearbyRampart = _.min(_.filter(room.structures, (s) => s.structureType === STRUCTURE_RAMPART && s.pos.findInRange(_.filter(s.room.hostileCreeps, (c) => c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK) || c.getActiveBodyparts(WORK)), 3)[0] && s.hits < 50000 * s.room.controller.level), 'hits');
                if (nearbyRampart.id) for (let tower of towers) tower.repair(nearbyRampart);
                room.memory.towerTarget = undefined;
            }
        }
    } else {
        room.memory.towerTarget = undefined;
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