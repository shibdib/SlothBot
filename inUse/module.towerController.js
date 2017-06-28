/**
 * Created by rober on 5/16/2017.
 */
let _ = require('lodash');
const profiler = require('screeps-profiler');

let doNotAggress = RawMemory.segments[2];

module.exports.towerControl = function () {
    for (let tower of _.values(Game.structures)) {
        if (tower.structureType === STRUCTURE_TOWER) {
            const barriers = tower.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < 500});
            const road = tower.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) && s.hits < s.hitsMax * 0.25});
            const woundedCreep = Game.getObjectById(findWounded(tower));
            const closestHostile = tower.pos.findClosestByRange(FIND_CREEPS, {filter: (s) => _.includes(doNotAggress, s.owner['username']) === false});
            if (closestHostile) {
                tower.attack(closestHostile);
                continue;
            }
            if (woundedCreep) {
                tower.heal(woundedCreep);
                continue;
            }
            if (barriers) {
                tower.repair(barriers);
                continue;
            }
            if (road) {
                tower.repair(road);
                continue;
            }
            if (tower.energy > tower.energyCapacity * 0.75) {
                const closestDamagedStructure = Game.getObjectById(findRepair(tower));
                if (closestDamagedStructure) {
                    tower.repair(closestDamagedStructure);
                }
            }
        }
    }
};

function findRepair(tower) {

    site = tower.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_SPAWN && s.hits < s.hitsMax});
    if (site === null) {
        site = tower.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 1000});
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
    if (site === null) {
        site = tower.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 100000});
    }
    if (site === null) {
        site = tower.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_WALL && s.hits < 100000});
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
