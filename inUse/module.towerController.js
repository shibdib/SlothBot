/**
 * Created by rober on 5/16/2017.
 */
let _ = require('lodash');
const profiler = require('screeps-profiler');

let doNotAggress = RawMemory.segments[2];

function towerControl() {
    towers:
        for (let tower of _.values(Game.structures)) {
            if (tower.structureType === STRUCTURE_TOWER) {
                let creeps = tower.room.find(FIND_CREEPS);
                let barriers = tower.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < 1500});
                let road = tower.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) && s.hits < s.hitsMax * 0.25});
                let woundedCreep = _.filter(creeps, (c) => c.hits < c.hitsMax && _.includes(doNotAggress, c.owner['username']) === true);
                let headShot = _.filter(creeps, (c) => c.hits <= 150 && _.includes(doNotAggress, c.owner['username']) === false);
                let armedHostile = _.filter(creeps, (s) => (s.getActiveBodyparts(ATTACK) >= 1 || s.getActiveBodyparts(RANGED_ATTACK) >= 1 || s.getActiveBodyparts(HEAL) >= 1 || s.getActiveBodyparts(WORK) >= 1) && _.includes(doNotAggress, s.owner['username']) === false);
                if (armedHostile.length > 0) {
                    for (let i = 0; i < armedHostile.length; i++) {
                        if (armedHostile[i].pos.getRangeTo(tower) < 8) {
                            tower.attack(armedHostile[i]);
                            continue towers;
                        } else if (armedHostile[i].pos.getRangeTo(armedHostile[i].pos.findClosestByRange(FIND_MY_CREEPS, {filter: (c) => c.memory.role === 'responder'})) <= 3) {
                            tower.attack(armedHostile[i]);
                            continue towers;
                        } else if (armedHostile[i].pos.getRangeTo(armedHostile[i].pos.findClosestByRange(FIND_MY_CREEPS)) <= 1) {
                            tower.attack(armedHostile[i]);
                            continue towers;
                        } else if (armedHostile[i].owner['username'] === 'Invader') {
                            tower.attack(armedHostile[i]);
                            continue towers;
                        }
                    }
                }
                if (headShot.length > 0) {
                    tower.attack(headShot[0]);
                    continue;
                }
                if (woundedCreep.length > 0) {
                    tower.heal(woundedCreep[0]);
                    continue;
                }
                if (tower.room.memory.responseNeeded !== true && tower.energy > tower.energyCapacity * 0.60) {
                    if (barriers) {
                        tower.repair(barriers);
                        continue;
                    }
                    if (road) {
                        tower.repair(road);
                        continue;
                    }
                    if (Game.getObjectById(findRepair(tower))) {
                        tower.repair(Game.getObjectById(findRepair(tower)));
                    }
                }
            }
        }
}
module.exports.towerControl = profiler.registerFN(towerControl, 'towerControl');

function findRepair(tower) {

    let site = tower.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_SPAWN && s.hits < s.hitsMax});
    if (site === null) {
        site = tower.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 2500});
    }
    if (site === null) {
        site = tower.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_EXTENSION && s.hits < s.hitsMax});
    }
    if (site === null) {
        site = tower.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_RAMPART && s.hits < s.hitsMax});
    }
    if (site === null) {
        site = tower.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.hits < s.hitsMax * 0.75});
    }
    if (site === null) {
        site = tower.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax / 2});
    }
    if (site !== null && site !== undefined) {
        return site.id;
    }
}
findRepair = profiler.registerFN(findRepair, 'findRepairTower');

function findWounded(tower) {

    const creep = tower.pos.findClosestByRange(FIND_CREEPS, {filter: (s) => s.hits < s.hitsMax});
    if (creep !== null && creep !== undefined) {
        return creep.id;
    }
}
findWounded = profiler.registerFN(findWounded, 'findRepairTower');

