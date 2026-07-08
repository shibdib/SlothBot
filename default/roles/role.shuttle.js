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
        this.housekeeping();
        if (this.creep.store[RESOURCE_ENERGY]) {
            this.hauling();
        } else {
            this.pickup();
        }
    }

    housekeeping() {
        this.creep.say(ICONS.haul, true);
        if (Game.time % 5 === 0) this.creep.opportunisticFill();
    }

    hauling() {
        // If we're somehow outside of the colony room, path back in
        if (this.room.name !== this.creep.memory.colony) {
            return this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.colony), {range: 23});
        }

        // During attacks, fill towers before depositing — towers need energy to defend
        if (this.room.memory.dangerousAttack && this.creep.store[RESOURCE_ENERGY] > 0) {
            const lowTower = this.room.towers.find(s => s.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
            if (lowTower) {
                const result = this.creep.transfer(lowTower, RESOURCE_ENERGY);
                if (result === OK || result === ERR_NOT_IN_RANGE) {
                    if (result === ERR_NOT_IN_RANGE) this.creep.shibMove(lowTower);
                    return;
                }
            }
        }

        // Controller container if room has a storage and we have an energyState
        if (this.room.storage && this.room.energyState) {
            const controllerContainer = Game.getObjectById(this.room.memory.controllerContainer);
            if (controllerContainer && controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) > CONTAINER_CAPACITY * 0.5) {
                const result = this.creep.transfer(controllerContainer, RESOURCE_ENERGY);
                if (result === OK || result === ERR_NOT_IN_RANGE) {
                    if (result === ERR_NOT_IN_RANGE) this.creep.shibMove(controllerContainer);
                    return;
                }
            }
        }

        // Otherwise use the storage
        const protoStorage = this.creep.room.memory.protoStorage ? Game.getObjectById(this.creep.room.memory.protoStorage) : undefined;
        if (this.creep.room.storage || protoStorage) {
            const storeTarget = this.creep.room.storage || protoStorage;
            for (const resourceType in this.creep.store) {
                const result = this.creep.transfer(storeTarget, resourceType);
                if (result === OK) {
                    break;
                } else if (result === ERR_NOT_IN_RANGE) {
                    this.creep.shibMove(storeTarget);
                    break;
                }
            }
        } else {
            if (!this.creep.haulerDelivery()) {
                this.creep.idleFor(this.creep.room.level);
            }
        }
    }

    resolveAssignedContainer() {
        if (!this.creep.memory.assignment) return undefined;
        const source = Game.getObjectById(this.creep.memory.assignment);
        if (!source) return undefined;
        if (source.memory.container) return Game.getObjectById(source.memory.container);
        return global.resolveSourceContainer(source, this.room);
    }

    findContainerOverflowDrop(container) {
        if (!container) return undefined;
        let best;
        const track = (resource) => {
            if (!resource || resource.resourceType !== RESOURCE_ENERGY || resource.amount <= 0) return;
            if (!best || resource.amount > best.amount) best = resource;
        };

        for (const resource of container.pos.lookFor(LOOK_RESOURCES)) track(resource);

        if (!container.store.getFreeCapacity(RESOURCE_ENERGY)) {
            for (const resource of this.room.droppedEnergy) {
                if (resource.pos.getRangeTo(container.pos) <= 1) track(resource);
            }
        }

        return best;
    }

    pickup() {
        // During attacks pull from storage for the fastest refill of towers
        if (this.room.memory.dangerousAttack && this.room.storage && this.room.storage.store[RESOURCE_ENERGY] > 0) {
            const result = this.creep.withdraw(this.room.storage, RESOURCE_ENERGY);
            if (result === ERR_NOT_IN_RANGE) this.creep.shibMove(this.room.storage);
            return;
        }

        const container = this.resolveAssignedContainer();
        const overflow = this.findContainerOverflowDrop(container);
        if (overflow) {
            this.creep.memory.energyDestination = overflow.id;
            this.creep.withdrawResource();
            return;
        }

        // Prefer assigned source container when available
        if (!this.creep.memory.energyDestination && container && container.store[RESOURCE_ENERGY] > 0) {
            this.creep.memory.energyDestination = container.id;
        }
        if (this.creep.memory.energyDestination || this.creep.locateEnergy()) {
            this.creep.withdrawResource();
        } else {
            this.creep.idleFor(this.creep.room.level);
        }
    }
}

profiler.registerClass(RoleShuttle, 'Shuttle');
module.exports = RoleShuttle;