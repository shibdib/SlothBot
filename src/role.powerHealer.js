/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.role = function (creep) {
    if (!Memory.auxiliaryTargets[creep.memory.destination]) creep.memory.recycle = true;
    //Initial move
    if (creep.pos.roomName !== creep.memory.destination) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
    } else {
        let powerBank = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_POWER_BANK)[0];
        if (powerBank && creep.pos.isNearTo(powerBank)) creep.moveRandom();
        if (creep.memory.assigned) {
            let assignment = Game.getObjectById(creep.memory.assigned);
            if (!assignment) return creep.memory.assigned = undefined;
            switch (creep.heal(assignment)) {
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(assignment);
                    creep.rangedHeal(assignment);
            }
        } else {
            let attacker = _.filter(creep.room.creeps, (c) => c.my && c.memory.role === 'powerAttacker' && !_.filter(creep.room.creeps, (h) => h.my && h.memory.assigned === c.id)[0])[0];
            if (attacker) creep.memory.assigned = attacker.id; else {
                if (creep.pos.getRangeTo(powerBank) > 2) creep.shibMove(powerBank, {range: 2});
                creep.healInRange();
            }
        }
    }
};