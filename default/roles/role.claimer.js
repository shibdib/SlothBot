/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleClaimer {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    // Placeholder for role-specific actions
    performRoleActions() {
        if (this.housekeeping()) {
            return true;
        } else if (this.room.name !== this.creep.memory.destination) {
            this.travel();
        } else if (this.creep.memory.operation === 'claimClear') {
            this.claimClear();
        } else {
            this.claimRoom();
        }
    }

    housekeeping() {
        // If you lost your claim part... die
        if (!this.creep.hasActiveBodyparts(CLAIM)) this.creep.suicide();
        if (Game.gcl.level <= MY_ROOMS.length) {
            delete Memory.auxiliaryTargets[this.creep.room.name];
            return this.creep.recycleCreep();
        }
    }

    travel() {
        this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 23});
    }

    claimRoom() {
        if (this.creep.room.controller.owner) {
            this.cleanRoom(this.room);
            return this.creep.recycleCreep();
        } else if (!this.creep.memory.signed) {
            switch (this.creep.signController(this.room.controller, _.sample(OWNED_ROOM_SIGNS))) {
                case ERR_NOT_IN_RANGE:
                    this.creep.shibMove(this.room.controller);
                    break;
                case OK:
                    this.creep.memory.signed = true;
            }
        } else {
            switch (this.creep.claimController(this.room.controller)) {
                case ERR_NOT_IN_RANGE:
                    this.creep.shibMove(this.room.controller);
                    break;
                case ERR_BUSY:
                    break;
                case ERR_NOT_FOUND:
                    break;
                case ERR_INVALID_TARGET:
                    break;
                case OK:
                    Memory.auxiliaryTargets[this.room.name] = undefined;
                    Memory.targetRooms[this.room.name] = undefined;
                    MY_ROOMS.push(this.room.name);
            }
        }
    }

    cleanRoom() {
        _.filter(this.room.structures, (s) => s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_ROAD).forEach((s) => s.destroy());
        _.filter(this.room.constructionSites, (s) => s.owner.username !== MY_USERNAME).forEach((s) => s.remove());
    }

    claimClear() {
        if (!this.room.controller.owner) {
            switch (this.creep.claimController(this.room.controller)) {
                case ERR_NOT_IN_RANGE:
                    this.creep.shibMove(this.room.controller);
                    break;
                case OK:
                    this.creep.signController(this.creep.room.controller, 'Cleaning provided by SlothBot');
                    INTEL[this.creep.room.name] = undefined;
            }
        } else {
            abandonRoom(this.room);
            if (Memory.auxiliaryTargets) delete Memory.auxiliaryTargets[this.room.name];
            this.creep.recycleCreep();
        }
    }
}

profiler.registerClass(RoleClaimer, 'Claimer');
module.exports = RoleClaimer;

