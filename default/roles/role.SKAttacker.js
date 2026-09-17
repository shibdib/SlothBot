/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const {skCombatBlocksMining} = require("remoteMining");

// Source Keeper: 19 ATTACK, 2 RANGED_ATTACK, 7 HEAL, 13 MOVE

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
            this.creep.memory.arrived = undefined;
            this.travel();
        } else {
            this.SKAttackerTasks();
        }
    }

    housekeeping() {
        const dest = this.creep.memory.destination;
        if (!dest) {
            this.creep.recycleCreep();
            return true;
        }
        // Recycle before labs finish if dest is already blocked — a boosted
        // 4100 body walking into a wave is a mineral dump.
        if (this.room.name !== dest && skCombatBlocksMining(dest)) {
            this.creep.recycleCreep();
            return true;
        }
        if (this.creep.tryToBoost()) return true;
        const core = this.room.impassibleStructures.find(s => s.structureType === STRUCTURE_INVADER_CORE);
        if (core) {
            this.room.cacheRoomIntel(true);
            this.creep.suicide();
            return true;
        }
    }

    travel() {
        if (!this.creep.memory.destination) {
            this.creep.recycleCreep();
            return;
        }
        this.healSelf();
        const dest = this.creep.memory.destination;
        // Invader waves are kitey ranged groups. Do not walk a 4100 melee
        // body back in, and do not park it at home for the rest of the TTL.
        if (skCombatBlocksMining(dest)) {
            this.creep.recycleCreep();
            return;
        }
        this.creep.shibMove(new RoomPosition(25, 25, dest), {range: 23});
    }

    SKAttackerTasks() {
        if (this.abandonInvaders()) return;
        this.creep.memory.arrived = true;
        this.healSelf();
        const sourceKeeper = this.findKeeper();
        if (sourceKeeper) {
            this.creep.memory.lair = undefined;
            this.creep.memory.keeper = sourceKeeper.id;
            this.fightKeeper(sourceKeeper);
        } else {
            this.campLair();
        }
    }

    findKeeper() {
        const stored = Game.getObjectById(this.creep.memory.keeper);
        if (stored && this.isKeeper(stored)) return stored;
        return this.creep.pos.findClosestByRange(this.room.creeps, {filter: (c) => this.isKeeper(c)});
    }

    healSelf() {
        if (this.creep.hits < this.creep.hitsMax && this.creep.hasActiveBodyparts(HEAL)) {
            this.creep.heal(this.creep);
            return;
        }
        this.creep.healInRange();
    }

    isKeeper(creep) {
        return creep.owner && creep.owner.username === 'Source Keeper';
    }

    abandonInvaders() {
        const hostiles = this.room.hostileCreeps;
        let armed = false;
        for (let i = 0; i < hostiles.length; i++) {
            const c = hostiles[i];
            if (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)) {
                armed = true;
                break;
            }
        }
        if (!armed) return false;
        this.room.cacheRoomIntel(true);
        this.room.invaderCheck();
        this.creep.memory.arrived = undefined;
        this.creep.suicide();
        return true;
    }

    fightKeeper(keeper) {
        if (this.creep.attack(keeper) === ERR_NOT_IN_RANGE) {
            this.creep.shibMove(keeper, {range: 1, ignoreKeeper: keeper.id});
        }
    }

    campLair() {
        this.creep.memory.keeper = undefined;
        let lair = Game.getObjectById(this.creep.memory.lair);
        // Live keepers leave ticksToSpawn undefined. Don't camp that lair.
        if (!lair || !lair.ticksToSpawn) {
            lair = this.nextLair();
        }
        if (!lair || !lair.id) {
            this.creep.memory.lair = undefined;
            this.creep.shibMove(new RoomPosition(25, 25, this.room.name), {range: 10});
            return;
        }
        this.creep.memory.lair = lair.id;
        if (!this.creep.pos.isNearTo(lair)) this.creep.shibMove(lair, {range: 1});
    }

    nextLair() {
        const dest = this.creep.memory.destination;
        const lairs = this.room.keeperLairs;
        let best = undefined;
        let bestTicks = Infinity;
        for (let i = 0; i < lairs.length; i++) {
            const s = lairs[i];
            const ticks = s.ticksToSpawn;
            if (typeof ticks !== 'number' || s.room.name !== dest) continue;
            if (ticks < bestTicks) {
                bestTicks = ticks;
                best = s;
            }
        }
        return best;
    }
}

profiler.registerClass(RoleSKAttacker, 'SKAttacker');
module.exports = RoleSKAttacker;
