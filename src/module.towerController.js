/**
 * Created by rober on 5/16/2017.
 */
let _ = require('lodash');
const profiler = require('screeps-profiler');

function towerControl(room) {
    let creeps = room.creeps;
    let structures = room.structures;
    let towers = _.filter(structures, (s) => s.structureType === STRUCTURE_TOWER);
    let armedHostile = _.filter(creeps, (s) => (s.getActiveBodyparts(ATTACK) >= 1 || s.getActiveBodyparts(RANGED_ATTACK) >= 1 || s.getActiveBodyparts(WORK) >= 1) && !_.includes(FRIENDLIES, s.owner.username));
    let healers = _.filter(creeps, (s) => (s.getActiveBodyparts(HEAL) >= 3) && !_.includes(FRIENDLIES, s.owner.username));
    let unArmedHostile = _.filter(creeps, (s) => (!s.getActiveBodyparts(ATTACK) && !s.getActiveBodyparts(RANGED_ATTACK) && !s.getActiveBodyparts(HEAL) && !s.getActiveBodyparts(WORK)) && !_.includes(FRIENDLIES, s.owner.username));
    towers:
        for (let tower of towers) {
            if (tower.room.memory.responseNeeded === true) {
                let healPower = 0;
                if (armedHostile.length || unArmedHostile.length) {
                    for (let i = 0; i < armedHostile.length; i++) {
                        let inRangeHealers = _.filter(healers, (s) => s.pos.getRangeTo(armedHostile[i]) === 1);
                        let inRangeResponders = _.filter(creeps, (c) => c.my && c.getActiveBodyparts(ATTACK) && c.pos.getRangeTo(armedHostile[i]) === 1);
                        let inRangeLongbows = _.filter(creeps, (c) => c.my && c.getActiveBodyparts(RANGED_ATTACK) && c.pos.getRangeTo(armedHostile[i]) < 4);
                        let inRangeAttackPower = 0;
                        for (let key in inRangeResponders) {
                            inRangeAttackPower = inRangeAttackPower + (inRangeResponders[key].getActiveBodyparts(ATTACK) * 30)
                        }
                        for (let key in inRangeLongbows) {
                            inRangeAttackPower = inRangeAttackPower + (inRangeLongbows[key].getActiveBodyparts(RANGED_ATTACK) * 10)
                        }
                        if (inRangeHealers.length > 0) healPower = ((inRangeHealers[0].getActiveBodyparts(HEAL) * HEAL_POWER) * 2) * inRangeHealers.length;
                        let range = armedHostile[i].pos.getRangeTo(tower);
                        let towerDamage = determineDamage(range);
                        if ((!inRangeHealers.length || (healPower < ((towerDamage * towers.length) + inRangeAttackPower) * 0.9)) && ((armedHostile[i].pos.x < 48 && armedHostile[i].pos.x > 1 && armedHostile[i].pos.y < 48 && armedHostile[i].pos.y > 1) || armedHostile[i].owner.username === 'Invader')) {
                            tower.attack(armedHostile[i]);
                            continue towers;
                        } else if ((!inRangeHealers.length || (healPower < ((towerDamage * towers.length) + inRangeAttackPower) * 0.95)) && (armedHostile[i].pos.x < 48 && armedHostile[i].pos.x > 1 && armedHostile[i].pos.y < 48 && armedHostile[i].pos.y > 1)) {
                            tower.attack(armedHostile[i]);
                            continue towers;
                        } else if (armedHostile[i].hits <= 150 * towers.length) {
                            tower.attack(armedHostile[i]);
                            continue towers;
                        }
                    }
                    if (unArmedHostile[0]) {
                        tower.attack(unArmedHostile[0]);
                    }
                }
                let headShot = _.filter(creeps, (c) => c.hits <= 150 * towers.length && _.includes(FRIENDLIES, c.owner.username) === false);
                if (headShot.length > 0) {
                    tower.attack(headShot[0]);
                    continue;
                }
                if (healers.length && tower.pos.getRangeTo(healers[0]) <= 6) {
                    tower.attack(healers[0]);
                    continue;
                }
                let woundedCreep = _.filter(creeps, (c) => c.hits < c.hitsMax && _.includes(FRIENDLIES, c.owner.username) === true);
                if (woundedCreep.length > 0) {
                    tower.heal(woundedCreep[0]);
                }
            } else if (unArmedHostile.length) {
                tower.attack(_.sample(unArmedHostile));
            } else if (tower.energy > tower.energyCapacity * 0.75 && (tower.room.memory.state > 1 || tower.room.memory.state === -1)) {
                let structures = tower.room.structures;
                let barriers = _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 1500);
                if (barriers.length > 0) {
                    tower.repair(barriers[0]);
                    continue;
                }
                let road = _.filter(structures, (s) => (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) && s.hits < s.hitsMax * 0.25);
                if (road.length > 0) {
                    tower.repair(road[0]);
                    continue;
                }
                let lowestRampart = _.min(_.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART), 'hits');
                tower.repair(lowestRampart);
            }
            if (tower.energy > tower.energyCapacity * 0.25) {
                let creeps = tower.room.creeps;
                let woundedCreep = _.filter(creeps, (c) => c.hits < c.hitsMax && _.includes(FRIENDLIES, c.owner.username));
                if (woundedCreep.length > 0) {
                    tower.heal(woundedCreep[0]);
                }
            }
        }
}

module.exports.towerControl = profiler.registerFN(towerControl, 'towerControl');

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