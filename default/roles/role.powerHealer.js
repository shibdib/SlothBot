/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RolePowerHealer {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        if (this.room.name !== this.creep.memory.destination) {
            this.travel();
        } else {
            this.healerDuty();
        }
    }

    housekeeping() {
        if (!this.creep.memory.destination || !Memory.auxiliaryTargets[this.creep.memory.destination]) return this.creep.recycleCreep();
    }

    travel() {
        if (!this.creep.memory.destination) {
            this.creep.recycleCreep();
            return;
        }
        this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 23});
    }

    healerDuty() {
        let powerBank = _.filter(this.room.impassibleStructures, (s) => s.structureType === STRUCTURE_POWER_BANK)[0];
        if (powerBank && this.creep.pos.isNearTo(powerBank)) this.creep.moveRandom();
        if (this.creep.memory.assigned) {
            let assignment = Game.getObjectById(this.creep.memory.assigned);
            if (!assignment) return this.creep.memory.assigned = undefined;
            switch (this.creep.heal(assignment)) {
                case ERR_NOT_IN_RANGE:
                    this.creep.shibMove(assignment, {ignoreCreeps: false});
                    this.creep.rangedHeal(assignment);
            }
        } else {
            let attacker = _.filter(this.room.myCreeps, (c) => c.memory.role === 'powerAttacker' && !_.filter(this.room.creeps, (h) => h.my && h.memory.assigned === c.id)[0])[0];
            if (attacker) this.creep.memory.assigned = attacker.id; else {
                if (this.creep.pos.getRangeTo(powerBank) > 2) this.creep.shibMove(powerBank, {range: 2});
                this.creep.healInRange();
            }
        }
    }
}

profiler.registerClass(RolePowerHealer, 'PowerHealer');
module.exports = RolePowerHealer;
