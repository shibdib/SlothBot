/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleShuttle {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        if (_.sum(this.creep.store) > this.creep.store.getCapacity() * 0.2) {
            this.hauling();
        } else {
            this.pickup();
        }
    }

    housekeeping() {
        this.creep.say(ICONS.haul, true);
        this.creep.opportunisticFill();
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
            if (!this.creep.memory.storageDestination) {
                let controllerContainer = Game.getObjectById(this.creep.room.memory.controllerContainer);
                if (this.creep.room.storage && this.creep.room.energyState > 1 && controllerContainer && controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) > 100) this.creep.memory.storageDestination = controllerContainer.id;
                else if (this.creep.room.storage) this.creep.memory.storageDestination = this.creep.room.storage.id; else this.creep.haulerDelivery();
            } else if (!this.creep.haulerDelivery()) this.creep.idleFor(this.creep.room.level)
        }
    }

    pickup() {
        if (this.creep.memory.energyDestination || this.creep.locateEnergy()) {
            this.creep.withdrawResource()
        } else {
            this.creep.idleFor(this.creep.room.level)
        }
    }
}

profiler.registerClass(RoleShuttle, 'Shuttle');
module.exports = RoleShuttle;