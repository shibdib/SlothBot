/**
 * Created by rober on 5/16/2017.
 */

let roomRepairTower = {};

module.exports.towerControl = function (room) {
    let creeps = room.friendlyCreeps;
    let hostileCreeps = room.hostileCreeps;
    let structures = room.structures;
    let towers = _.shuffle(_.filter(structures, (s) => s.structureType === STRUCTURE_TOWER));
    let repairTower = Game.getObjectById(roomRepairTower[room.name]) || _.max(_.filter(structures, (s) => s.structureType === STRUCTURE_TOWER && s.energy > s.energyCapacity * 0.15), 'energy');
    if (hostileCreeps.length) {
        // Target wounded first otherwise find armed
        let armedHostile = _.shuffle(_.filter(hostileCreeps, (s) => (s.getActiveBodyparts(ATTACK) >= 1 || s.getActiveBodyparts(RANGED_ATTACK) >= 1 || s.getActiveBodyparts(WORK) >= 1) && s.hits < s.hitsMax * 0.5));
        if (!armedHostile.length) armedHostile = _.shuffle(_.filter(hostileCreeps, (s) => (s.getActiveBodyparts(ATTACK) >= 1 || s.getActiveBodyparts(RANGED_ATTACK) >= 1 || s.getActiveBodyparts(WORK) >= 1)));
        let unArmedHostile = _.shuffle(_.filter(hostileCreeps, (s) => (!s.getActiveBodyparts(ATTACK) && !s.getActiveBodyparts(RANGED_ATTACK) && !s.getActiveBodyparts(HEAL) && !s.getActiveBodyparts(WORK))));
        let healers = _.shuffle(_.filter(hostileCreeps, (s) => (s.getActiveBodyparts(HEAL) >= 3)));
        towers:
            for (let tower of towers) {
                let healPower = 0;
                let headShot = _.filter(hostileCreeps, (c) => c.hits <= 145 * towers.length);
                if (headShot.length > 0) {
                    tower.attack(headShot[0]);
                } else {
                    for (let i = 0; i < armedHostile.length; i++) {
                        let inRangeHealers = _.filter(healers, (s) => s.pos.getRangeTo(armedHostile[i]) === 1);
                        let inRangeResponders = _.filter(creeps, (c) => c.getActiveBodyparts(ATTACK) && c.pos.getRangeTo(armedHostile[i]) === 1);
                        let inRangeLongbows = _.filter(creeps, (c) => c.getActiveBodyparts(RANGED_ATTACK) && c.pos.getRangeTo(armedHostile[i]) < 4);
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
                        if (healers.length && tower.pos.getRangeTo(healers[0]) <= 6) {
                            tower.attack(healers[0]);
                            continue towers;
                        } else if ((!inRangeHealers.length || (healPower < ((towerDamage * towers.length) + inRangeAttackPower) * 0.9)) && ((armedHostile[i].pos.x < 47 && armedHostile[i].pos.x > 3 && armedHostile[i].pos.y < 47 && armedHostile[i].pos.y > 3) || armedHostile[i].owner.username === 'Invader')) {
                            tower.attack(armedHostile[i]);
                            continue towers;
                        } else if ((!inRangeHealers.length || (healPower < ((towerDamage * towers.length) + inRangeAttackPower) * 0.95)) && (armedHostile[i].pos.x < 47 && armedHostile[i].pos.x > 3 && armedHostile[i].pos.y < 47 && armedHostile[i].pos.y > 3)) {
                            tower.attack(armedHostile[i]);
                            continue towers;
                        } else if (armedHostile[i].hits <= 150 * towers.length) {
                            tower.attack(armedHostile[i]);
                            continue towers;
                        } else if (range <= 10) {
                            tower.attack(armedHostile[i]);
                            continue towers;
                        }
                    }
                    if (!armedHostile.length) {
                        for (let i = 0; i < unArmedHostile.length; i++) {
                            tower.attack(unArmedHostile[i]);
                            continue towers;
                        }
                    }
                }
            }
    } else if (repairTower) {
        if (Math.random() > 0.95) roomRepairTower[room.name] = undefined; else roomRepairTower[room.name] = repairTower.id;
        if (repairTower.energy > repairTower.energyCapacity * 0.15) {
            let creeps = room.creeps;
            let woundedCreep = _.filter(creeps, (c) => c.hits < c.hitsMax && _.includes(FRIENDLIES, c.owner.username));
            woundedCreep = woundedCreep.concat(_.filter(room.powerCreeps, (c) => c.hits < c.hitsMax && _.includes(FRIENDLIES, c.owner.username)));
            if (woundedCreep.length > 0) {
                return repairTower.heal(woundedCreep[0]);
            }
        }
        if (repairTower.energy > repairTower.energyCapacity * 0.25) {
            let structures = room.structures;
            let barriers = _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 5000);
            if (barriers.length > 0) {
                return repairTower.repair(barriers[0]);
            }
            let road = _.filter(structures, (s) => (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) && s.hits < s.hitsMax * 0.25);
            if (road.length > 0) {
                return repairTower.repair(road[0]);
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