/**
 * Created by rober on 5/16/2017.
 */

let doNotAggress = [
    //Alliance Members
    'Shibdib',
    'PostCrafter',
    'Rising',
    'wages123',

    //Non aggression pacts
    'droben'];

module.exports.towerControl = function () {
    for (let tower of _.values(Game.structures)) {
        if (tower.structureType === STRUCTURE_TOWER) {
            const barriers = tower.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < 500});
            const road = tower.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER && s.hits < s.hitsMax * 0.25});
            const woundedCreep = Game.getObjectById(findWounded(tower));
            const closestHostile = tower.pos.findClosestByRange(FIND_CREEPS, {filter: (s) => include(doNotAggress,s.owner['username']) === false});
            if (barriers) {
                tower.repair(barriers);
            } else if (road) {
                tower.repair(road);
            } else
            //Check if hostiles are in room
            if (closestHostile) {
                tower.attack(closestHostile);
            } else if (woundedCreep) {
                tower.heal(woundedCreep);
            } else if (tower.energy > tower.energyCapacity * 0.75) {
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
        site = tower.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.hits < 1000});
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

function findWounded(tower) {

    const creep = tower.pos.findClosestByRange(FIND_CREEPS, {filter: (s) => s.hits < s.hitsMax});
    if (creep !== null && creep !== undefined) {
        return creep.id;
    }
}

function include(arr,obj) {
    return (arr.indexOf(obj) !== -1);
}
