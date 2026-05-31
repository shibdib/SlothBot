/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleTest {
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
        // Boosting
        if (this.creep.tryToBoost()) return true;
    }

    defenseActions() {
        if (!this.creep.handleMilitaryCreep() && this.creep.findDefensivePosition(this.creep)) this.creep.idleFor(5);
    }
}

profiler.registerClass(RoleTest, 'Test');
module.exports = RoleTest;
