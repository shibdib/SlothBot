/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    if (creep.renewalCheck()) return;
    creep.memory.needFood = undefined;
    if (creep.store[RESOURCE_ENERGY]) {
        switch (creep.upgradeController(Game.rooms[creep.memory.overlord].controller)) {
            case OK:
                return;
            case ERR_NOT_IN_RANGE:
                return creep.shibMove(Game.rooms[creep.memory.overlord].controller, {range: 3});
        }
    }
    if (creep.memory.energyDestination) {
        creep.withdrawResource();
    } else {
        let spawn = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_SPAWN)[0];
        let foodPos = spawn.pos.getAdjacentPosition(creep.room.controller.pos.getDirectionTo(spawn));
        if (!creep.pos.isNearTo(foodPos)) return creep.shibMove(foodPos, {range: 1}); else if (creep.pos.getRangeTo(foodPos) === 0) creep.moveRandom();
        //Dropped
        let dropped = creep.pos.findInRange(creep.room.droppedEnergy, 3)[0];
        if (dropped) {
            creep.memory.energyDestination = dropped.id;
        }
        // Tombstone
        let tombstone = creep.pos.findInRange(creep.room.tombstones, 3, {filter: (r) => r.store[RESOURCE_ENERGY]})[0];
        if (tombstone) {
            creep.memory.energyDestination = tombstone.id;
        }
        //Dropped
        let neighbor = creep.pos.findInRange(creep.room.creeps, 1, {filter: (r) => r.my && r.store[RESOURCE_ENERGY && r.id !== creep.id && r.memory.shared !== creep.id]})[0];
        if (neighbor) {
            creep.memory.energyDestination = neighbor.id;
            neighbor.memory.shared = creep.id;
        } else {
            creep.memory.needFood = true;
        }
        if (creep.memory.energyDestination) creep.withdrawResource();
    }
};