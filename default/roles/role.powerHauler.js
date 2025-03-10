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
        else if (this.creep.memory.misc && this.creep.memory.misc.deliveryRoom) {
            this.roomDelivery();
        } else if (_.sum(this.creep.store)) {
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
            return this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 23});
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

    roomDelivery() {
        this.creep.say('Delivery!', true);
        if (_.sum(this.creep.store)) {
            const deliveryRoom = Game.rooms[this.creep.memory.misc.deliveryRoom];
            if (this.room.name !== deliveryRoom.name) {
                return this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.misc.deliveryRoom), {range: 23});
            } else {
                let deliver = this.room.terminal || this.room.storage;
                if (deliver) {
                    for (let resourceType in this.creep.store) {
                        switch (this.creep.transfer(deliver, resourceType)) {
                            case ERR_NOT_IN_RANGE:
                                this.creep.shibMove(deliver);
                        }
                    }
                } else {
                    this.creep.shibMove(deliveryRoom.controller, {range: 3});
                }
            }
        } else {
            if (this.room.name !== this.creep.memory.colony) {
                return this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.colony), {range: 23});
            } else {
                if (this.creep.memory.energyDestination || this.creep.locateEnergy()) {
                    this.creep.say('Energy!', true);
                    this.creep.withdrawResource();
                }
            }
        }
    }
}

profiler.registerClass(RolePowerHauler, 'PowerHauler');
module.exports = RolePowerHauler;
