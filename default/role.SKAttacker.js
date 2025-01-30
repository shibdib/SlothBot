/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("./tools.profiler");

class RoleSKAttacker {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        if (!this.creep.memory.keeper && !this.creep.memory.lair && this.room.name !== this.creep.memory.destination) {
            this.travel();
        } else {
            this.creep.memory.arrived = true;
            this.SKAttackerTasks();
        }
    }

    housekeeping() {
        //if (this.creep.tryToBoost(['attack', 'heal'])) return true;
        // Handle invader core in sk
        if (this.room.hostileStructures.length) {
            let core = _.filter(this.room.impassibleStructures, (s) => s.structureType === STRUCTURE_INVADER_CORE)[0];
            if (core) {
                this.room.cacheRoomIntel(true);
                return this.creep.suicide();
            }
        }
    }

    travel() {
        this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 23});
    }

    SKAttackerTasks() {
        let sourceKeeper = Game.getObjectById(this.creep.memory.keeper) || this.creep.pos.findClosestByRange(this.room.creeps,
            {filter: (c) => c.room.name === this.creep.memory.destination && !FRIENDLIES.includes(c.owner.username)});
        if (sourceKeeper) {
            this.creep.heal(this.creep);
            this.creep.memory.lair = undefined;
            this.creep.memory.keeper = sourceKeeper.id;
            switch (this.creep.attack(sourceKeeper)) {
                case ERR_NOT_IN_RANGE:
                    if (this.creep.hits < this.creep.hitsMax * 0.8 && this.creep.pos.getRangeTo(sourceKeeper) > 7) return;
                    this.creep.shibMove(sourceKeeper);
                    break;
                case ERR_NO_BODYPART:
                    break;
                case OK:
                    break;
            }
        } else {
            this.creep.healInRange();
            let lair = Game.getObjectById(this.creep.memory.lair) || _.min(_.filter(this.room.structures, (s) =>
                s.structureType === STRUCTURE_KEEPER_LAIR && s.room.name === this.creep.memory.destination), 'ticksToSpawn');
            this.creep.memory.keeper = undefined;
            this.creep.memory.lair = lair.id;
            if (this.creep.hits === this.creep.hitsMax && this.creep.pos.isNearTo(lair)) this.creep.idleFor(lair.ticksToSpawn - 1); else this.creep.shibMove(lair);
        }
    }
}

profiler.registerClass(RoleSKAttacker, 'SKAttacker');
module.exports = RoleSKAttacker;
