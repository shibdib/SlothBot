/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleHauler {
    constructor(creep) {
        this.creep = creep;
        this.performRoleActions();
    }

    performRoleActions() {
        this.housekeeping()
        if (_.sum(this.creep.store)) {
            this.deliverResource();
        } else {
            this.findResource();
        }
    }

    housekeeping() {
        this.creep.say(ICONS.haul, true);
    }

    deliverResource() {
        this.creep.opportunisticFill();
        if (!this.creep.haulerDelivery() && _.sum(this.creep.store)) return;
    }

    findResource() {
        if (!this.creep.memory.energyDestination) this.creep.memory._shibMove = undefined;
        if (this.creep.memory.energyDestination || this.creep.locateEnergy()) {
            this.creep.withdrawResource()
        } else {
            this.creep.idleFor(5);
        }
    }
}

profiler.registerClass(RoleHauler, 'Hauler');
module.exports = RoleHauler;
