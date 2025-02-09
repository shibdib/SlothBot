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
        // If low TTL return home and recycle
        if (this.creep.ticksToLive < 75) {
            this.creep.memory.destination = undefined;
            return this.creep.recycleCreep();
        }
    }

    pickupResource() {
        if (this.room.name !== this.creep.memory.destination) {
            return this.creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
        }
        let power = this.room.find(FIND_DROPPED_RESOURCES, {filter: (r) => r.resourceType === RESOURCE_POWER})[0];
        if (power) {
            switch (this.creep.pickup(power)) {
                case OK:
                    this.creep.memory.hauling = true;
                    break;
                case ERR_NOT_IN_RANGE:
                    this.creep.shibMove(power);
                    break;
            }
        } else {
            if (!_.find(this.room.impassibleStructures, (s) => s.structureType === STRUCTURE_POWER_BANK)) {
                Memory.auxiliaryTargets[this.room.name] = undefined;
                this.creep.suicide();
            }
        }
    }

    deliverResource() {
        this.creep.memory.closestRoom = this.creep.memory.closestRoom || findClosestOwnedRoom(this.room.name, false, 6);
        if (this.room.name !== this.creep.memory.closestRoom) {
            return this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.closestRoom), {range: 23});
        } else {
            let deliver = _.filter(this.room.impassibleStructures, (s) => s.structureType === STRUCTURE_POWER_SPAWN && s.power < s.store.getFreeCapacity(RESOURCE_POWER))[0] || this.room.terminal || this.room.storage;
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
}

profiler.registerClass(RolePowerHauler, 'PowerHauler');
module.exports = RolePowerHauler;
