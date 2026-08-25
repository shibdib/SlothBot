/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RolePowerHauler {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        if (_.sum(this.creep.store)) {
            this.deliverResource();
        } else {
            this.pickupResource();
        }
    }

    housekeeping() {
        if (!this.creep.memory.destination) {
            return this.creep.recycleCreep();
        }
        const carrying = _.sum(this.creep.store) > 0;
        const home = carrying
            ? (this.creep.memory.closestRoom || findClosestOwnedRoom(this.room.name, false, 6) || this.creep.memory.colony)
            : this.creep.memory.colony;
        const hops = home ? Game.map.getRoomLinearDistance(this.room.name, home) : 0;
        if (this.creep.ticksToLive < hops * 50 + 80) {
            if (carrying) return false;
            return this.creep.recycleCreep();
        }
    }

    pickupResource() {
        if (this.room.name !== this.creep.memory.destination) {
            const intel = INTEL[this.creep.memory.destination];
            if (intel && intel.powerX != null) {
                return this.creep.shibMove(new RoomPosition(intel.powerX, intel.powerY, this.creep.memory.destination), {range: 3});
            }
            return this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 23});
        }
        const loot = findPowerLoot(this.room);
        if (loot) {
            const result = loot.store ? this.creep.withdraw(loot, RESOURCE_POWER) : this.creep.pickup(loot);
            switch (result) {
                case OK:
                    this.creep.memory.hauling = true;
                    break;
                case ERR_NOT_IN_RANGE:
                    this.creep.shibMove(loot);
                    break;
            }
            return;
        }
        const bank = _.find(this.room.impassibleStructures, (s) => s.structureType === STRUCTURE_POWER_BANK);
        if (bank) {
            if (this.creep.pos.getRangeTo(bank) > 3) this.creep.shibMove(bank, {range: 3});
        } else {
            this.creep.recycleCreep();
        }
    }

    deliverResource() {
        this.creep.memory.closestRoom = this.creep.memory.closestRoom || findClosestOwnedRoom(this.room.name, false, 6);
        if (this.room.name !== this.creep.memory.closestRoom) {
            return this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.closestRoom), {range: 23});
        }
        const spawn = _.find(this.room.impassibleStructures, (s) =>
            s.structureType === STRUCTURE_POWER_SPAWN &&
            s.store.getFreeCapacity(RESOURCE_POWER) > 0
        );
        const deliver = spawn || this.room.terminal || this.room.storage;
        if (deliver) {
            switch (this.creep.transfer(deliver, RESOURCE_POWER)) {
                case OK:
                    this.creep.memory.hauling = _.sum(this.creep.store) > 0;
                    break;
                case ERR_NOT_IN_RANGE:
                    this.creep.shibMove(deliver);
                    break;
            }
        }
    }
}

function findPowerLoot(room) {
    let best = null;
    let bestAmt = 0;
    const drops = room.droppedResources || [];
    for (let i = 0; i < drops.length; i++) {
        const r = drops[i];
        if (r.resourceType !== RESOURCE_POWER || r.amount <= bestAmt) continue;
        best = r;
        bestAmt = r.amount;
    }
    const tombs = room.tombstones || [];
    for (let i = 0; i < tombs.length; i++) {
        const amt = tombs[i].store[RESOURCE_POWER] || 0;
        if (amt > bestAmt) {
            best = tombs[i];
            bestAmt = amt;
        }
    }
    const ruins = room.ruins || [];
    for (let i = 0; i < ruins.length; i++) {
        const store = ruins[i].store;
        const amt = store && store[RESOURCE_POWER] || 0;
        if (amt > bestAmt) {
            best = ruins[i];
            bestAmt = amt;
        }
    }
    return best;
}

profiler.registerClass(RolePowerHauler, 'PowerHauler');
module.exports = RolePowerHauler;
