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
                let barriers = _.pluck(_.min(_.filter(tower.room.memory.barrierCache, (s) => (s.type === 'rampart' || s.type === 'wall') && s.hits < 1500), 'hits'), 'id');
                let towers = _.filter(tower.room.memory.structureCache, (s) => s.type === 'tower');
                let road = _.pluck(_.min(_.filter(tower.room.memory.barrierCache, (s) => s.type === 'road' && s.hits < s.hitsMax * 0.25), 'hits'), 'id');
                let container = _.pluck(_.min(_.filter(tower.room.memory.structureCache, (s) => s.type === 'container' && s.hits < s.hitsMax * 0.25), 'hits'), 'id');
                let woundedCreep = _.filter(creeps, (c) => c.hits < c.hitsMax && _.includes(doNotAggress, c.owner['username']) === true);
                let headShot = _.filter(creeps, (c) => c.hitsMax <= 150 * towers.length && _.includes(doNotAggress, c.owner['username']) === false);
                let armedHostile = _.filter(creeps, (s) => (s.getActiveBodyparts(ATTACK) >= 1 || s.getActiveBodyparts(RANGED_ATTACK) >= 1 || s.getActiveBodyparts(HEAL) >= 1 || s.getActiveBodyparts(WORK) >= 1) && _.includes(doNotAggress, s.owner['username']) === false);
                let healers = _.filter(creeps, (s) => (s.getActiveBodyparts(HEAL) >= 6 && _.includes(doNotAggress, s.owner['username']) === false));
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
                        } else if (armedHostile[i].owner['username'] === 'Invader' && healers.length === 0) {
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
                        tower.repair(Game.getObjectById(barriers));
                        continue;
                    }
                    if (container) {
                        tower.repair(Game.getObjectById(container));
                        continue;
                    }
                    if (road) {
                        tower.repair(Game.getObjectById(road));
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

    let site = _.pluck(_.min(_.filter(tower.room.memory.structureCache, (s) => s.type === 'spawn' && s.hits < s.hitsMax), 'hits'), 'id');
    if (site === null) {
        site = _.pluck(_.min(_.filter(tower.room.memory.barrierCache, (s) => s.type === 'rampart' && s.hits < 2500), 'hits'), 'id');
    }
    if (site === null) {
        site = _.pluck(_.min(_.filter(tower.room.memory.structureCache, (s) => s.type === 'extension' && s.hits < s.hitsMax), 'hits'), 'id');
    }
    if (site === null) {
        site = _.pluck(_.min(_.filter(tower.room.memory.structureCache, (s) => s.type === 'container' && s.hits < s.hitsMax * 0.75), 'hits'), 'id');
    }
    if (site === null) {
        site = _.pluck(_.min(_.filter(tower.room.memory.barrierCache, (s) => s.type === 'road' && s.hits < s.hitsMax / 2), 'hits'), 'id');
    }
    if (site !== null && site !== undefined) {
        return site.id;
    }
}
findRepair = profiler.registerFN(findRepair, 'findRepairTower');

