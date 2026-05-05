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
        if (this.creep.room.storage) {
            for (const resourceType in this.creep.store) {
                const result = this.creep.transfer(this.creep.room.storage, resourceType);
                if (result === OK) {
                    break;
                } else if (result === ERR_NOT_IN_RANGE) {
                    this.creep.shibMove(this.creep.room.storage);
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