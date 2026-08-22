/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

// Source Keeper: 19 ATTACK, 2 RANGED_ATTACK, 7 HEAL, 13 MOVE
const SK_HITS = 4100;
const SK_HEAL = 7 * HEAL_POWER;
const SK_DPS = 19 * ATTACK_POWER + 2 * RANGED_ATTACK_POWER;
const HOLD_RANGE = 4;
const SURVIVE_BUFFER = 200;

class RoleSKAttacker {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        if (this.room.name !== this.creep.memory.destination) {
            this.creep.memory.keeper = undefined;
            this.creep.memory.lair = undefined;
            this.travel();
        } else {
            this.creep.memory.arrived = true;
            this.SKAttackerTasks();
        }
    }

    housekeeping() {
        // Boosting
        if (this.creep.tryToBoost()) return true;
        if (!this.creep.memory.destination) {
            this.creep.recycleCreep();
            return true;
        }
        // Handle invader core in sk
        if (this.room.hostileStructures.length) {
            let core = _.filter(this.room.impassibleStructures, (s) => s.structureType === STRUCTURE_INVADER_CORE)[0];
            if (core) {
                this.room.cacheRoomIntel(true);
                return this.creep.recycleCreep();
            }
        }
    }

    travel() {
        if (!this.creep.memory.destination) {
            this.creep.recycleCreep();
            return;
        }
        this.healSelf();
        this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 23});
    }

    SKAttackerTasks() {
        this.healSelf();
        let sourceKeeper = Game.getObjectById(this.creep.memory.keeper) || this.creep.pos.findClosestByRange(this.room.creeps,
            {filter: (c) => c.room.name === this.creep.memory.destination && !FRIENDLIES.includes(c.owner.username)});
        if (sourceKeeper) {
            this.creep.memory.lair = undefined;
            this.creep.memory.keeper = sourceKeeper.id;
            this.fightKeeper(sourceKeeper);
        } else {
            this.campLair();
        }
    }

    healSelf() {
        if (this.creep.hits < this.creep.hitsMax && this.creep.hasActiveBodyparts(HEAL)) {
            this.creep.heal(this.creep);
            return;
        }
        this.creep.healInRange();
    }

    meleeHitsNeeded() {
        const attack = this.creep.getActiveBodyparts(ATTACK);
        const heal = this.creep.getActiveBodyparts(HEAL);
        const net = attack * ATTACK_POWER - SK_HEAL;
        if (net <= 0) return Infinity;
        const ttk = Math.ceil(SK_HITS / net);
        const incoming = SK_DPS * ttk;
        const during = heal * HEAL_POWER * (ttk + HOLD_RANGE - 1);
        return incoming - during + SURVIVE_BUFFER;
    }

    canSurviveMelee() {
        return this.creep.hits >= this.meleeHitsNeeded();
    }

    isKeeper(creep) {
        return creep.owner && creep.owner.username === 'Source Keeper';
    }

    holdOutside(target) {
        const range = this.creep.pos.getRangeTo(target);
        if (range < HOLD_RANGE) {
            if (!this.creep.shibKite(HOLD_RANGE)) {
                const dir = this.creep.pos.getDirectionTo(target);
                this.creep.move(((dir + 3) % 8) + 1);
            }
        } else if (range > HOLD_RANGE) {
            this.creep.shibMove(target, {range: HOLD_RANGE});
        }
    }

    fightKeeper(keeper) {
        switch (this.creep.attack(keeper)) {
            case ERR_NOT_IN_RANGE:
                if (this.isKeeper(keeper) && !this.canSurviveMelee()) {
                    this.holdOutside(keeper);
                    return;
                }
                this.creep.shibMove(keeper);
                break;
            case ERR_NO_BODYPART:
                break;
            case OK:
                this.creep.move(this.creep.pos.getDirectionTo(keeper));
                break;
        }
    }

    campLair() {
        this.creep.memory.keeper = undefined;
        let lair = Game.getObjectById(this.creep.memory.lair);
        if (!lair) {
            const lairs = _.filter(this.room.keeperLairs, (s) => s.room.name === this.creep.memory.destination);
            lair = lairs.length ? _.min(lairs, 'ticksToSpawn') : undefined;
        }
        if (!lair || !lair.id) {
            this.creep.memory.lair = undefined;
            this.creep.shibMove(new RoomPosition(25, 25, this.room.name), {range: 10});
            return;
        }
        this.creep.memory.lair = lair.id;
        if (!this.canSurviveMelee()) {
            const healRate = this.creep.getActiveBodyparts(HEAL) * HEAL_POWER;
            const ticksToReady = healRate ? Math.ceil((this.meleeHitsNeeded() - this.creep.hits) / healRate) : Infinity;
            if ((lair.ticksToSpawn || 0) <= ticksToReady + 1) {
                this.holdOutside(lair);
                return;
            }
        }
        if (this.creep.pos.isNearTo(lair)) this.creep.idleFor(lair.ticksToSpawn - 1);
        else this.creep.shibMove(lair);
    }
}

profiler.registerClass(RoleSKAttacker, 'SKAttacker');
module.exports = RoleSKAttacker;
