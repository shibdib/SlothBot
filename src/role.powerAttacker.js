/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.role = function (creep) {
    creep.memory.destinationReached = creep.pos.roomName === creep.memory.destination;
    if (!Memory.auxiliaryTargets[creep.memory.destination]) return creep.suicide();
    //Initial move
    if (!creep.memory.destinationReached) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
    } else {
        if (!creep.hasActiveBodyparts(ATTACK) || creep.hits < creep.hitsMax * 0.25) return;
        // Handle military
        let armedHostile = _.find(creep.room.hostileCreeps, (c) => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK));
        if (armedHostile) {
            creep.handleMilitaryCreep();
        } else if (creep.memory.powerBank) {
            let powerBank = Game.getObjectById(creep.memory.powerBank);
            if (!powerBank) {
                return Memory.auxiliaryTargets[creep.memory.destination] = undefined;
            }
            if (!Memory.auxiliaryTargets[creep.memory.destination].space) Memory.auxiliaryTargets[creep.memory.destination].space = powerBank.pos.countOpenTerrainAround();
            if (powerBank.hits < 350000) Memory.auxiliaryTargets[creep.memory.destination].hauler = powerBank.power / 1250;
            if (!powerBank) {
                Memory.auxiliaryTargets[creep.memory.destination].complete = true;
            }
            switch (creep.attack(powerBank)) {
                case OK:
                    creep.memory.other = {noBump: true}
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(powerBank);
                    break;
            }
        } else {
            let powerBank = _.find(creep.room.impassibleStructures, (s) => s.structureType === STRUCTURE_POWER_BANK);
            if (powerBank) {
                creep.memory.powerBank = powerBank.id;
            } else {
                Memory.auxiliaryTargets[creep.memory.destination] = undefined;
            }
        }
    }
};