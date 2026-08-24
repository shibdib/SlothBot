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
        if (this.creep.tryToBoost()) return true;
        const op = Memory.auxiliaryTargets[this.creep.memory.destination];
        if (!this.creep.memory.destination || !op || op.complete) {
            this.creep.recycleCreep();
            return true;
        }
    }

    travel() {
        const dest = this.creep.memory.destination;
        if (!dest) {
            this.creep.recycleCreep();
            return;
        }
        const intel = INTEL[dest];
        if (intel && intel.powerX != null) {
            this.creep.shibMove(new RoomPosition(intel.powerX, intel.powerY, dest), {range: 2});
        } else {
            this.creep.shibMove(new RoomPosition(25, 25, dest), {range: 23});
        }
    }

    healerDuty() {
        this.creep.memory.assigned = this.pickAttacker();
        const target = this.creep.memory.assigned && Game.getObjectById(this.creep.memory.assigned);
        const powerBank = _.find(this.room.impassibleStructures, (s) => s.structureType === STRUCTURE_POWER_BANK);
        if (!target) {
            if (powerBank && this.creep.pos.getRangeTo(powerBank) > 2) this.creep.shibMove(powerBank, {range: 2});
            this.creep.healInRange();
            return;
        }
        if (this.creep.pos.getRangeTo(target) > 1) {
            this.creep.shibMove(target, {ignoreCreeps: false, range: 1});
            this.creep.rangedHeal(target);
            return;
        }
        this.creep.heal(target);
        const op = Memory.auxiliaryTargets[this.creep.memory.destination];
        if (powerBank && op && op.space > 1) this.stepOffSeat(target, powerBank);
    }

    stepOffSeat(attacker, bank) {
        if (this.creep.pos.getRangeTo(bank) > 1) return;
        const terrain = this.room.getTerrain();
        const offsets = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
        for (let i = 0; i < offsets.length; i++) {
            const x = this.creep.pos.x + offsets[i][0];
            const y = this.creep.pos.y + offsets[i][1];
            if (x < 1 || x > 48 || y < 1 || y > 48) continue;
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
            const pos = new RoomPosition(x, y, this.room.name);
            if (pos.getRangeTo(attacker) > 1) continue;
            if (pos.getRangeTo(bank) <= 1) continue;
            if (pos.checkForObstacleStructure()) continue;
            if (pos.checkForCreep()) continue;
            this.creep.move(this.creep.pos.getDirectionTo(pos));
            return;
        }
    }

    pickAttacker() {
        const attackers = [];
        const healers = [];
        const creeps = this.room.myCreeps || [];
        for (let i = 0; i < creeps.length; i++) {
            const c = creeps[i];
            if (!c.memory) continue;
            if (c.memory.role === 'powerAttacker') attackers.push(c);
            else if (c.memory.role === 'powerHealer') healers.push(c);
        }
        if (!attackers.length) return undefined;
        attackers.sort((a, b) => (partBoosted(b, ATTACK) - partBoosted(a, ATTACK)) || (a.id < b.id ? -1 : 1));
        healers.sort((a, b) => (partBoosted(b, HEAL) - partBoosted(a, HEAL)) || (a.name < b.name ? -1 : 1));
        let idx = -1;
        for (let i = 0; i < healers.length; i++) {
            if (healers[i].id === this.creep.id) {
                idx = i;
                break;
            }
        }
        if (idx < 0) return attackers[0].id;
        return attackers[Math.min(attackers.length - 1, Math.floor(idx / 2))].id;
    }
}

function partBoosted(creep, part) {
    const body = creep.body;
    for (let i = 0; i < body.length; i++) {
        if (body[i].type === part && body[i].boost) return 1;
    }
    return 0;
}

profiler.registerClass(RolePowerHealer, 'PowerHealer');
module.exports = RolePowerHealer;
