/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleDefender {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        this.defenseActions();
    }

    housekeeping() {
        if (INTEL[this.room.name].threatLevel > 2 && this.creep.tryToBoost(['attack', 'ranged_attack'])) return true;
    }

    defenseActions() {
        if (!INTEL[this.room.name].threatLevel && this.creep.ticksToLive <= 100) return this.creep.recycleCreep();
        if (!this.creep.handleMilitaryCreep() && this.creep.findDefensivePosition(this.creep)) this.creep.idleFor(5);
    }
}

profiler.registerClass(RoleDefender, 'Defender');
module.exports = RoleDefender;
