/**
 * Created by rober on 5/16/2017.
 */
let _ = require('lodash');
const profiler = require('screeps-profiler');

function towerControl(room) {
    let towers = _.filter(room.structures, (s) => s.structureType === STRUCTURE_TOWER);
    let creeps = room.creeps;
    let structures = room.structures;
    towers:
        for (let tower of towers) {
            if (tower.room.memory.responseNeeded === true) {
                let towers = _.filter(structures, (s) => s.structureType === STRUCTURE_TOWER);
                let armedHostile = _.filter(creeps, (s) => (s.getActiveBodyparts(ATTACK) >= 1 || s.getActiveBodyparts(RANGED_ATTACK) >= 1 || s.getActiveBodyparts(HEAL) >= 1 || s.getActiveBodyparts(WORK) >= 1) && !_.includes(FRIENDLIES, s.owner.username));
                let unArmedHostile = _.filter(creeps, (s) => (!s.getActiveBodyparts(ATTACK) || !s.getActiveBodyparts(RANGED_ATTACK) || !s.getActiveBodyparts(HEAL) || !s.getActiveBodyparts(WORK)) && !_.includes(FRIENDLIES, s.owner.username));
                let healPower = 0;
                if (armedHostile.length > 0) {
                    for (let i = 0; i < armedHostile.length; i++) {
                        let healers = _.filter(creeps, (s) => (s.getActiveBodyparts(HEAL) >= 4 && !_.includes(FRIENDLIES, s.owner.username) && s.pos.getRangeTo(armedHostile[i]) === 1));
                        if (healers.length > 0) healPower = ((healers[0].getActiveBodyparts(HEAL) * HEAL_POWER) * 2) * healers.length;
                        let range = armedHostile[i].pos.getRangeTo(tower);
                        let towerDamage = determineDamage(range);
                        if ((!healers[0] || (healPower < (towerDamage * towers.length) * 0.9)) && (armedHostile[i].pos.x < 48 && armedHostile[i].pos.x > 1 && armedHostile[i].pos.y < 48 && armedHostile[i].pos.y > 1) && tower.pos.getRangeTo(armedHostile[i]) < 10) {
                            tower.attack(armedHostile[i]);
                            continue towers;
                        } else if (armedHostile[i].pos.getRangeTo(armedHostile[i].pos.findClosestByRange(tower.room.creeps, {filter: (c) => c.memory && c.memory.role === 'longbow'})) <= 3) {
                            tower.attack(armedHostile[i]);
                            continue towers;
                        } else if (armedHostile[i].pos.getRangeTo(armedHostile[i].pos.findClosestByRange(tower.room.creeps, {filter: (c) => c.memory && (c.memory.role === 'responder' || c.memory.role === 'remoteResponse')})) === 1) {
                            tower.attack(armedHostile[i]);
                            continue towers;
                        } else if (armedHostile[i].pos.getRangeTo(armedHostile[i].pos.findClosestByRange(tower.room.creeps, {filter: (c) => c.my})) <= 3) {
                            tower.attack(armedHostile[i]);
                            continue towers;
                        } else if (armedHostile[i].hits <= 150 * towers.length) {
                            tower.attack(armedHostile[i]);
                            continue towers;
                        } else if (unArmedHostile[0]) {
                            tower.attack(unArmedHostile[0]);
                            continue towers;
                        }
                    }
                }
                let headShot = _.filter(creeps, (c) => c.hits <= 150 * towers.length && _.includes(FRIENDLIES, c.owner.username) === false);
                if (headShot.length > 0) {
                    tower.attack(headShot[0]);
                    continue;
                }
                let woundedCreep = _.filter(creeps, (c) => c.hits < c.hitsMax && _.includes(FRIENDLIES, c.owner.username) === true);
                if (woundedCreep.length > 0) {
                    tower.heal(woundedCreep[0]);
                }
            } else if (tower.energy > tower.energyCapacity * 0.65) {
                let creeps = tower.room.creeps;
                let structures = tower.room.structures;
                let woundedCreep = _.filter(creeps, (c) => c.hits < c.hitsMax && _.includes(FRIENDLIES, c.owner.username));
                if (woundedCreep.length > 0) {
                    tower.heal(woundedCreep[0]);
                }
                let barriers = _.filter(structures, (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < 1500);
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