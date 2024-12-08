/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("./tools.profiler");

class RoleClaimAttacker {
    constructor(creep) {
        this.creep = creep;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.statusChecks(this.creep)) {

        } else if (this.creep.room.controller && (this.creep.room.controller.owner || this.creep.room.controller.reservation)) {
            this.attackController(this.creep);
        } else if (this.creep.room.controller) {
            this.reserveController(this.creep);
        }
    }

    statusChecks(creep) {
        if (Memory.targetRooms[creep.memory.destination] && !Memory.targetRooms[creep.memory.destination].claimAttacker) return creep.recycleCreep();
        if (creep.room.name !== creep.memory.destination) return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 22});
        if (creep.room.controller.upgradeBlocked > creep.ticksToLive) creep.suicide();
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

