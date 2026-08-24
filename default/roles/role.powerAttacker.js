/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

const POWER_HIT_BACK = typeof POWER_BANK_HIT_BACK !== 'undefined' ? POWER_BANK_HIT_BACK : 0.5;
const POWER_HAULER_CARRY = 1250;

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
        this.alignAttackBoosts();
        if (this.creep.tryToBoost()) return true;
        const op = Memory.auxiliaryTargets[this.creep.memory.destination];
        if (!op || op.complete) {
            this.creep.recycleCreep();
            return true;
        }
    }

    alignAttackBoosts() {
        if (this.creep.memory.boostAttempt) return;
        if (!this.creep.memory.misc) this.creep.memory.misc = {};
        const owned = this.room.controller && this.room.controller.my;
        if (owned && powerAttackBoostsAvailable(this.room, this.creep)) {
            this.creep.memory.misc.boosts = [ATTACK];
        } else {
            this.creep.memory.misc.boosts = undefined;
        }
    }

    travel() {
        const dest = this.creep.memory.destination;
        if (!dest) {
            this.creep.recycleCreep();
            return;
        }
        if (this.room.controller && this.room.controller.my &&
            this.creep.ticksToLive > 1200 &&
            readyPowerHealers(dest) < 2) {
            this.creep.idleFor(3);
            return;
        }
        const bankPos = powerBankPos(dest);
        if (bankPos) this.creep.shibMove(bankPos, {range: 1});
        else this.creep.shibMove(new RoomPosition(25, 25, dest), {range: 23});
    }

    extractResource() {
        const dest = this.creep.memory.destination;
        const op = Memory.auxiliaryTargets[dest];
        if (!op) return;

        if (!this.creep.hasActiveBodyparts(ATTACK)) {
            this.creep.recycleCreep();
            return;
        }

        const powerBank = this.creep.memory.powerBank
            ? Game.getObjectById(this.creep.memory.powerBank)
            : _.find(this.room.impassibleStructures, (s) => s.structureType === STRUCTURE_POWER_BANK);

        if (!powerBank) {
            this.finishMining(op);
            this.creep.recycleCreep();
            return;
        }

        this.creep.memory.powerBank = powerBank.id;
        if (!op.space) op.space = 1;

        if (this.nearbyThreat(powerBank)) {
            this.clearStationary();
            this.creep.handleMilitaryCreep(false, true, true, powerBank.pos, 4);
            return;
        }

        if (this.creep.hits < this.creep.hitsMax * 0.25) {
            this.clearStationary();
            return;
        }

        if (!this.creep.pos.isNearTo(powerBank)) {
            this.clearStationary();
            this.creep.shibMove(powerBank, {range: 1});
            return;
        }
        if (!this.healCovered()) {
            this.clearStationary();
            return;
        }

        if (!this.creep.memory.other) this.creep.memory.other = {};
        switch (this.creep.attack(powerBank)) {
            case OK:
                this.creep.memory.other.stationary = true;
                break;
            case ERR_NOT_IN_RANGE:
                this.clearStationary();
                this.creep.shibMove(powerBank, {range: 1});
                break;
        }
    }

    nearbyThreat(powerBank) {
        const hostiles = this.creep.room.hostileCreeps;
        for (let i = 0; i < hostiles.length; i++) {
            const c = hostiles[i];
            if (!c.hasActiveBodyparts(ATTACK) && !c.hasActiveBodyparts(RANGED_ATTACK)) continue;
            if (c.pos.getRangeTo(this.creep) <= 3) return true;
            if (powerBank && c.pos.getRangeTo(powerBank) <= 3) return true;
        }
        return false;
    }

    healCovered() {
        const reflected = (abilityPower(this.creep.body).meleeAttack || 0) * POWER_HIT_BACK;
        if (reflected <= 0) return true;
        let adjacentHeal = 0;
        const creeps = this.room.myCreeps || [];
        for (let i = 0; i < creeps.length; i++) {
            const c = creeps[i];
            if (!c.memory || c.memory.role !== 'powerHealer') continue;
            if (c.pos.getRangeTo(this.creep) > 1) continue;
            adjacentHeal += abilityPower(c.body).heal || 0;
        }
        return adjacentHeal >= reflected;
    }

    clearStationary() {
        if (this.creep.memory.other) this.creep.memory.other.stationary = undefined;
    }

    finishMining(op) {
        op.complete = true;
        op.completeTick = Game.time;
        if (!op.haulers) {
            const amount = op.powerAmount || 0;
            op.haulers = Math.max(1, Math.ceil(amount / POWER_HAULER_CARRY));
        }
    }
}

function powerBankPos(roomName) {
    const intel = INTEL[roomName];
    if (!intel || intel.powerX == null || intel.powerY == null) return null;
    return new RoomPosition(intel.powerX, intel.powerY, roomName);
}

function powerAttackBoostsAvailable(room, creep) {
    if (typeof findAvailableBoostTier !== 'function' || !BOOST_USE) return false;
    const attackParts = creep.getActiveBodyparts(ATTACK) || 25;
    const attackNeed = attackParts * LAB_BOOST_MINERAL;
    const healNeed = 20 * LAB_BOOST_MINERAL * 2;
    const attackTier = findAvailableBoostTier(room, ATTACK, attackNeed);
    const healTier = findAvailableBoostTier(room, HEAL, healNeed);
    if (!attackTier || !healTier) return false;
    const attackIdx = BOOST_USE[ATTACK].indexOf(attackTier);
    const healIdx = BOOST_USE[HEAL].indexOf(healTier);
    if (attackIdx < 0 || healIdx < 0) return false;
    return healIdx <= attackIdx;
}

function readyPowerHealers(dest) {
    let n = 0;
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c.my || !c.memory) continue;
        if (c.memory.role !== 'powerHealer' || c.memory.destination !== dest) continue;
        if (c.spawning) continue;
        if (!c.memory.boostAttempt && c.memory.misc && c.memory.misc.boosts) continue;
        n++;
    }
    return n;
}

profiler.registerClass(RolePowerAttacker, 'PowerAttacker');
module.exports = RolePowerAttacker;
