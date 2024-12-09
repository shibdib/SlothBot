/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("./tools.profiler");

class RoleClaimAttacker {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.houseKeeping()) {

        } else if (this.creep.room.controller && (!INTEL[this.room.name] || INTEL[this.room.name].user !== MY_USERNAME) &&
            (this.creep.room.controller.owner || this.creep.room.controller.reservation)) {
            this.attackController(this.creep);
        } else if (this.creep.room.controller) {
            this.reserveController(this.creep);
        }
    }

    houseKeeping() {
        if (!Memory.targetRooms[this.creep.memory.destination] || (Memory.targetRooms[this.creep.memory.destination] &&
            !Memory.targetRooms[this.creep.memory.destination].claimAttacker)) {
            this.creep.recycleCreep();
            return true;
        } else if (this.creep.room.name !== this.creep.memory.destination) {
            this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 22});
            return true;
        } else if (this.creep.room.controller && this.creep.room.controller.upgradeBlocked > this.creep.ticksToLive) {
            this.creep.suicide();
            return true;
        }
    }

    attackController(creep) {
        switch (creep.attackController(creep.room.controller)) {
            case OK:
                if (!creep.memory.signed) {
                    creep.signController(creep.room.controller, _.sample(ATTACK_ROOM_SIGNS));
                    creep.memory.signed = true;
                }
                break;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(creep.room.controller, {range: 1});
                break;
        }
    }

    reserveController(creep) {
        switch (creep.reserveController(creep.room.controller)) {
            case OK:
                if (!creep.memory.signed) {
                    creep.signController(creep.room.controller, _.sample(ATTACK_ROOM_SIGNS));
                    creep.memory.signed = true;
                }
                break;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(creep.room.controller, {range: 1});
                break;
        }
    }
}

profiler.registerClass(RoleClaimAttacker, 'ClaimAttacker');
module.exports = RoleClaimAttacker;

