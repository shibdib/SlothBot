/*
 * Copyright (c) 2019.
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
        if (repairTower.energy > repairTower.energyCapacity * 0.15) {
            let creeps = room.creeps;
            let woundedCreep = _.filter(creeps, (c) => c.hits < c.hitsMax && _.includes(FRIENDLIES, c.owner.username));
            woundedCreep = woundedCreep.concat(_.filter(room.powerCreeps, (c) => c.hits < c.hitsMax && _.includes(FRIENDLIES, c.owner.username)));
            if (woundedCreep.length > 0) {
                repairTower.heal(woundedCreep[0]);
            }
        }
        if (!hostileCreeps.length && repairTower.energy > repairTower.energyCapacity * 0.25) {
            let structures = room.structures;
            let barriers = _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 5000);
            if (barriers.length > 0) {
                return repairTower.repair(barriers[0]);
            }
            let road = _.filter(structures, (s) => (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) && s.hits < s.hitsMax * 0.25);
            if (road.length > 0) {
                return repairTower.repair(road[0]);
            }
            if (repairTower.energy > repairTower.energyCapacity * 0.7 && repairTower.room.memory.energySurplus) {
                let lowestRampart = _.min(_.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 250000 * repairTower.room.controller.level), 'hits');
                if (lowestRampart) {
                    return repairTower.repair(lowestRampart);
                }
            }
        }
    }
    if (hostileCreeps.length) {
        let towers = _.shuffle(_.filter(structures, (s) => s.structureType === STRUCTURE_TOWER && s.isActive()));
        let potentialAttack = 0;
        _.filter(creeps, (c) => c.my && c.memory.military).forEach((c) => potentialAttack += c.abilityPower());
        for (let i = 0; i < hostileCreeps.length; i++) {
            towers.forEach((t) => potentialAttack += determineDamage(hostileCreeps[i].pos.getRangeTo(t)));
            let inRangeMeleeHealers = _.filter(hostileCreeps, (s) => s.pos.getRangeTo(hostileCreeps[i]) === 1 && s.getActiveBodyparts(HEAL));
            let inRangeRangedHealers = _.filter(hostileCreeps, (s) => s.pos.getRangeTo(hostileCreeps[i]) > 1 && s.pos.getRangeTo(hostileCreeps[i]) < 4 && s.getActiveBodyparts(HEAL));
            let inRangeResponders = _.filter(creeps, (c) => c.getActiveBodyparts(ATTACK) && c.pos.getRangeTo(hostileCreeps[i]) === 1);
            let inRangeLongbows = _.filter(creeps, (c) => c.getActiveBodyparts(RANGED_ATTACK) && c.pos.getRangeTo(hostileCreeps[i]) < 4);
            let attackPower = 0;
            if (inRangeResponders.length) inRangeResponders.forEach((c) => attackPower += c.abilityPower());
            if (inRangeLongbows.length) inRangeLongbows.forEach((c) => attackPower += c.abilityPower());
            towers.forEach((t) => attackPower += determineDamage(hostileCreeps[i].pos.getRangeTo(t)));
            let healPower = 0;
            if (inRangeMeleeHealers.length) inRangeMeleeHealers.forEach((c) => healPower += c.abilityPower(true) + hostileCreeps[i].abilityPower(true));
            if (inRangeRangedHealers.length) inRangeRangedHealers.forEach((c) => healPower += c.abilityPower(true));
            let nearStructures = hostileCreeps[i].pos.findInRange(room.structures, 3, {filter: (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_CONTROLLER}).length > 0;
            if (hostileCreeps[i].hits <= attackPower) {
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
            } else if (attackPower * 0.6 >= healPower && hostileCreeps[i].pos.getRangeTo(hostileCreeps[i].pos.findClosestByRange(FIND_EXIT)) >= 2) {
                room.memory.towerTarget = hostileCreeps[i].id;
                break;
            } else {
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