/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RolePowerAttacker {
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
            this.extractResource();
        }
    }

    housekeeping() {
        if (!Memory.auxiliaryTargets[this.creep.memory.destination]) {
            this.creep.recycleCreep();
            return true;
        }
    }

    travel() {
        if (!this.creep.memory.destination) {
            this.creep.recycleCreep();
            return;
        }
        this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 23});
    }

    extractResource() {
        if (!this.creep.hasActiveBodyparts(ATTACK) || this.creep.hits < this.creep.hitsMax * 0.25) return;
        // Handle military
        let armedHostile = _.find(this.creep.room.hostileCreeps, (c) => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK));
        if (armedHostile) {
            this.creep.handleMilitaryCreep();
        } else if (this.creep.memory.powerBank) {
            let powerBank = Game.getObjectById(this.creep.memory.powerBank);
            if (!powerBank) {
                return Memory.auxiliaryTargets[this.creep.memory.destination] = undefined;
            }
            if (!Memory.auxiliaryTargets[this.creep.memory.destination].space) Memory.auxiliaryTargets[this.creep.memory.destination].space = powerBank.pos.countOpenTerrainAround();
            if (powerBank.hits < 350000) Memory.auxiliaryTargets[this.creep.memory.destination].hauler = powerBank.power / 1250;
            switch (this.creep.attack(powerBank)) {
                case OK:
                    this.creep.memory.other.stationary = true;
                    break;
                case ERR_NOT_IN_RANGE:
                    this.creep.shibMove(powerBank);
                    break;
            }
        } else {
            let powerBank = _.find(this.room.impassibleStructures, (s) => s.structureType === STRUCTURE_POWER_BANK);
            if (powerBank) {
                this.creep.memory.powerBank = powerBank.id;
            } else {
                Memory.auxiliaryTargets[this.creep.memory.destination] = undefined;
            }
        }
    }
}

profiler.registerClass(RolePowerAttacker, 'PowerAttacker');
module.exports = RolePowerAttacker;
