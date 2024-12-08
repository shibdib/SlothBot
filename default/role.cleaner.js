/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("./tools.profiler");

class RoleCleaner {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        if (this.creep.memory.barrierClearing) {
            this.barrierCleaning();
        } else if (this.creep.memory.destination && this.room.name !== this.creep.memory.destination) {
            this.travel();
        } else {
            this.cleanRoom();
        }
    }

    housekeeping() {
        if (this.creep.tryToBoost(['dismantle'])) return true;
        this.creep.say('NOM!', true);
    }

    barrierCleaning() {
        let barrier = Game.getObjectById(this.creep.memory.barrierClearing);
        if (!barrier) return this.creep.memory.barrierClearing = undefined;
        if (this.creep.pos.isNearTo(barrier)) {
            if (this.creep.hasActiveBodyparts(WORK)) {
                return this.creep.dismantle(barrier);
            }
        } else this.creep.shibMove(barrier);
    }

    travel() {
        this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination));
    }

    cleanRoom() {
        if (!this.creep.scorchedEarth()) {
            this.room.cacheRoomIntel(true);
            this.creep.suicide();
        }
    }
}

profiler.registerClass(RoleCleaner, 'Cleaner');
module.exports = RoleCleaner;
