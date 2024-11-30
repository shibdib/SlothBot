/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("./tools.profiler");

class RoleHauler {
    constructor(creep) {
        this.creep = creep;

        if (this.housekeeping()) return;

        if (_.sum(creep.store)) {
            this.deliverResource();
        } else {
            this.findResource();
        }
    }

    housekeeping() {
        this.creep.say(ICONS.haul, true);
        if (this.creep.towTruck() || (Math.random() > 0.7 && this.creep.wrongRoom())) return true;
    }

    deliverResource() {
        this.creep.opportunisticFill();
        if (!this.creep.haulerDelivery()) this.creep.idleFor(5)
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