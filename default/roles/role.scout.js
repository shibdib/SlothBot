/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("./tools.profiler");

class RoleScout {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        this.housekeeping();
        this.scoutRoom();
    }

    housekeeping() {
        this.creep.say(ICONS.eye, true);
    }

    scoutRoom() {
        this.creep.scoutRoom();
    }
}

profiler.registerClass(RoleScout, 'Scout');
module.exports = RoleScout;
