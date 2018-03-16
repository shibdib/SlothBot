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
                let armedHostile = _.filter(creeps, (s) => (s.getActiveBodyparts(ATTACK) >= 1 || s.getActiveBodyparts(RANGED_ATTACK) >= 1 || s.getActiveBodyparts(HEAL) >= 1 || s.getActiveBodyparts(WORK) >= 1) && _.includes(FRIENDLIES, s.owner['username']) === false);
                let healers = _.filter(creeps, (s) => (s.getActiveBodyparts(HEAL) >= 4 && !_.includes(FRIENDLIES, s.owner['username'])));
                let healPower = 0;
                if (healers.length > 0) healPower = ((healers[0].getActiveBodyparts(HEAL) * HEAL_POWER) * 2) * healers.length;
                if (armedHostile.length > 0) {
                    for (let i = 0; i < armedHostile.length; i++) {
                        let range = armedHostile[i].pos.getRangeTo(tower);
                        let towerDamage = determineDamage(range);
                        if (!healers[0] || (healPower < (towerDamage * towers.length) * 0.9)) {
                            tower.attack(armedHostile[i]);
                            continue towers;
                        } else if (armedHostile[i].pos.getRangeTo(armedHostile[i].pos.findClosestByRange(tower.room.creeps, {filter: (c) => c.memory && (c.memory.role === 'responder' || c.memory.role === 'remoteResponse' || c.memory.role === 'longbow')})) <= 3) {
                            tower.attack(armedHostile[i]);
                            continue towers;
                        }
                    }
                }
                let headShot = _.filter(creeps, (c) => c.hits <= 150 * towers.length && _.includes(FRIENDLIES, c.owner['username']) === false);
                if (headShot.length > 0) {
                    tower.attack(headShot[0]);
                    continue;
                }
                let woundedCreep = _.filter(creeps, (c) => c.hits < c.hitsMax && _.includes(FRIENDLIES, c.owner['username']) === true);
                if (woundedCreep.length > 0) {
                    tower.heal(woundedCreep[0]);
                }
            } else if (tower.energy > tower.energyCapacity * 0.25 && Game.cpu.getUsed() < Game.cpu.limit && Game.cpu.bucket > 2000 && Game.time % 10 === 0 && !_.includes(tower.room.memory.creepBuildQueue, 'stationaryHarvester') && !_.includes(tower.room.memory.creepBuildQueue, 'hauler')) {
                let creeps = tower.room.find(FIND_CREEPS);
                let structures = tower.room.find(FIND_STRUCTURES);
                let woundedCreep = _.filter(creeps, (c) => c.hits < c.hitsMax && _.includes(FRIENDLIES, c.owner['username']) === true);
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
                if (Game.getObjectById(findRepair(tower))) {
                    tower.repair(Game.getObjectById(findRepair(tower, structures)));
                }
            }
        }
}

module.exports.towerControl = profiler.registerFN(towerControl, 'towerControl');

function findRepair(tower, structures) {

    let site = tower.pos.findClosestByRange(structures, {filter: (s) => s.structureType === STRUCTURE_SPAWN && s.hits < s.hitsMax});
    if (site === null) {
        site = tower.pos.findClosestByRange(structures, {filter: (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 2500});
    }
    if (site === null) {
        site = tower.pos.findClosestByRange(structures, {filter: (s) => s.structureType === STRUCTURE_EXTENSION && s.hits < s.hitsMax});
    }
    if (site === null) {
        site = tower.pos.findClosestByRange(structures, {filter: (s) => s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_RAMPART && s.hits < s.hitsMax});
    }
    if (site === null) {
        site = tower.pos.findClosestByRange(structures, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.hits < s.hitsMax * 0.75});
    }
    if (site === null) {
        site = tower.pos.findClosestByRange(structures, {filter: (s) => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax / 2});
    }
    if (site !== null && site !== undefined) {
        return site.id;
    }
}

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