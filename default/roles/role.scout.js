/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const remoteMining = require("remoteMining");

class RoleScout {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        const dest = this.creep.memory.destination;
        if (dest && dest === this.creep.room.name) this.room.cacheRoomIntel(true);
        if (this.abandonUnsafeDest(dest)) return;
        this.housekeeping();
        this.scoutRoom();
        this.creep.moveToHostileConstructionSites();
    }

    /** 1-MOVE scouts must not walk into SK cores/towers, or stomp toward them. */
    abandonUnsafeDest(dest) {
        const room = this.creep.room;
        const inDest = dest && room.name === dest;
        if (inDest) {
            const towered = room.structures.some(s => s.structureType === STRUCTURE_TOWER && !s.my);
            const core = room.structures.some(s => s.structureType === STRUCTURE_INVADER_CORE);
            if (towered || core) {
                this.creep.suicide();
                return true;
            }
            return false;
        }
        if (dest && remoteMining.skCombatBlocksMining(dest)) {
            this.creep.recycleCreep();
            return true;
        }
        return false;
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
