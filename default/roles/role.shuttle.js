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
        // During attacks, fill towers before depositing — towers need energy to defend
        if (this.room.memory.dangerousAttack && this.creep.store[RESOURCE_ENERGY] > 0) {
            const lowTower = this.room.structures.find(s =>
                s.structureType === STRUCTURE_TOWER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            );
            if (lowTower) {
                const result = this.creep.transfer(lowTower, RESOURCE_ENERGY);
                if (result === OK || result === ERR_NOT_IN_RANGE) {
                    if (result === ERR_NOT_IN_RANGE) this.creep.shibMove(lowTower);
                    return;
                }
            }
        }

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

    pickup() {
        // During attacks pull from storage for the fastest refill of towers
        if (this.room.memory.dangerousAttack && this.room.storage && this.room.storage.store[RESOURCE_ENERGY] > 0) {
            const result = this.creep.withdraw(this.room.storage, RESOURCE_ENERGY);
            if (result === ERR_NOT_IN_RANGE) this.creep.shibMove(this.room.storage);
            return;
        }

        // Prefer assigned source container when available
        if (!this.creep.memory.energyDestination && this.creep.memory.other.assignedSource) {
            const source = Game.getObjectById(this.creep.memory.other.assignedSource);
            if (source && source.memory.container) {
                const container = Game.getObjectById(source.memory.container);
                if (container && container.store[RESOURCE_ENERGY] > 0) {
                    this.creep.memory.energyDestination = source.memory.container;
                }
            }
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