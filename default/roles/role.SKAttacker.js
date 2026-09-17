/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const {skCombatBlocksMining} = require("remoteMining");

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
            this.creep.memory.skMelee = undefined;
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
        if (!this.creep.getActiveBodyparts(ATTACK)) return false;
        const needed = this.meleeHitsNeeded();
        if (!isFinite(needed)) return false;
        // 20A/5H tanks a keeper. Kiting never kills (no RA); stay in melee
        // and heal between fights. Only refuse a fresh engage at critical HP.
        if (this.creep.memory.skMelee) return true;
        return this.creep.hits > this.creep.hitsMax * 0.2;
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

    holdOutside(target) {
        const range = this.creep.pos.getRangeTo(target);
        if (range > HOLD_RANGE) {
            this.creep.shibMove(target, {range: HOLD_RANGE});
            return;
        }
        if (range >= HOLD_RANGE) return;
        // shibKite uses fleeRange+2, which overshot 4 → 6 and yo-yoed. Step
        // to a higher range, preferring road then plains so we do not walk swamp.
        const dir = this.stepAwayFrom(target);
        if (dir) this.creep.move(dir);
        else this.creep.shibKite(HOLD_RANGE - 2);
    }

    stepAwayFrom(target) {
        const pos = this.creep.pos;
        const terrain = Game.map.getRoomTerrain(pos.roomName);
        const current = pos.getRangeTo(target);
        let bestDir = 0;
        let bestScore = -Infinity;
        for (let d = TOP; d <= TOP_LEFT; d++) {
            const next = pos.positionAtDirection(d);
            if (!next || next.x < 1 || next.x > 48 || next.y < 1 || next.y > 48) continue;
            const tile = terrain.get(next.x, next.y);
            if (tile === TERRAIN_MASK_WALL) continue;
            if (next.checkForObstacleStructure()) continue;
            if (next.checkForCreep()) continue;
            const nextRange = next.getRangeTo(target);
            if (nextRange <= current) continue;
            const rangeScore = nextRange <= HOLD_RANGE
                ? nextRange
                : HOLD_RANGE - (nextRange - HOLD_RANGE);
            let score = rangeScore * 10;
            if (next.checkForRoad()) score += 8;
            else if (tile !== TERRAIN_MASK_SWAMP) score += 4;
            if (score > bestScore) {
                bestScore = score;
                bestDir = d;
            }
        }
        return bestDir;
    }

    fightKeeper(keeper) {
        switch (this.creep.attack(keeper)) {
            case ERR_NOT_IN_RANGE:
                if (!this.canSurviveMelee()) {
                    this.creep.memory.skMelee = undefined;
                    this.holdOutside(keeper);
                    return;
                }
                this.creep.memory.skMelee = true;
                this.creep.shibMove(keeper);
                break;
            case ERR_NO_BODYPART:
                this.creep.memory.skMelee = undefined;
                this.holdOutside(keeper);
                break;
            case OK:
                this.creep.memory.skMelee = true;
                break;
        }
    }

    campLair() {
        this.creep.memory.keeper = undefined;
        this.creep.memory.skMelee = undefined;
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
        if (!this.canSurviveMelee()) {
            this.holdOutside(lair);
            return;
        }
        if (this.creep.pos.isNearTo(lair)) {
            const wait = (lair.ticksToSpawn || 1) - 1;
            if (wait > 0) this.creep.idleFor(wait);
        } else this.creep.shibMove(lair);
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
