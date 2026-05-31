/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleScout {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.creep.memory.destination && this.creep.memory.destination === this.creep.room.name) this.room.cacheRoomIntel(true);
        this.housekeeping();
        this.scoutRoom();
        this.creep.moveToHostileConstructionSites();
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
