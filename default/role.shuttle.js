/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("./tools.profiler");

class RoleShuttle {
    constructor(creep) {
        this.creep = creep;
        this.housekeeping();
        if (_.sum(creep.store)) {
            this.hauling();
        } else {
            this.pickup();
        }
    }

    housekeeping() {
        this.creep.say(ICONS.haul, true);
        if (this.creep.towTruck()) return true;
    }

    hauling() {
        if (_.sum(this.creep.store) > this.creep.store[RESOURCE_ENERGY]) {
            let storageItem = this.creep.room.storage || _.filter(this.creep.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.store.getFreeCapacity() >= CONTAINER_CAPACITY * 0.5)[0]
            for (const resourceType in this.creep.store) {
                if (resourceType === RESOURCE_ENERGY) continue;
                if (!storageItem) return this.creep.drop(resourceType);
                switch (this.creep.transfer(storageItem, resourceType)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        this.creep.shibMove(storageItem);
                        break;
                }
            }
        } else {
            this.creep.opportunisticFill();
            // If we have an energy state and a storage, store in the controller container. Otherwise store in storage.
            if (!this.creep.memory.storageDestination) {
                let controllerContainer = Game.getObjectById(this.creep.room.memory.controllerContainer);
                if (this.creep.room.storage && this.creep.room.energyState > 1 && controllerContainer && controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) > 100) this.creep.memory.storageDestination = controllerContainer.id;
                else if (this.creep.room.storage) this.creep.memory.storageDestination = this.creep.room.storage.id;
            }
            if (!this.creep.haulerDelivery()) this.creep.idleFor(5)
        }
    }

    pickup() {
        if (!this.creep.memory.cooldown && (this.creep.memory.energyDestination || this.creep.locateEnergy())) {
            this.creep.withdrawResource()
        } else {
            this.creep.memory.cooldown = undefined;
            this.creep.idleFor(10)
        }
    }
}

profiler.registerClass(RoleShuttle, 'Shuttle');
module.exports = RoleShuttle;