/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleClaimAttacker {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.houseKeeping()) return;
        const controller = this.creep.room.controller;
        if (controller.my) {
            this.creep.recycleCreep();
            return;
        }
        const reservation = controller.reservation && controller.reservation.username;
        if (controller.owner || (reservation && reservation !== MY_USERNAME)) {
            this.attackController(controller);
        } else {
            this.reserveController(controller);
        }
    }

    houseKeeping() {
        const creep = this.creep;
        if (!creep.hasActiveBodyparts(CLAIM)) {
            creep.suicide();
            return true;
        }
        const dest = creep.memory.destination;
        if (!dest || creep.memory._claimAbort === dest) {
            creep.recycleCreep();
            return true;
        }
        const op = Memory.targetRooms[dest];
        if (!op) {
            creep.recycleCreep();
            return true;
        }
        if (creep.room.name !== dest) {
            if (!op.claimAttacker) {
                creep.recycleCreep();
                return true;
            }
            creep.shibMove(new RoomPosition(25, 25, dest), {range: 23});
            return true;
        }
        const controller = creep.room.controller;
        if (!controller || controller.safeMode || controller.upgradeBlocked > creep.ticksToLive) {
            creep.recycleCreep();
            return true;
        }
        return false;
    }

    attackController(controller) {
        const creep = this.creep;
        switch (creep.attackController(controller)) {
            case OK:
                break;
            case ERR_NOT_IN_RANGE:
            case ERR_TIRED:
                if (!creep.pos.isNearTo(controller)) creep.shibMove(controller, {range: 1});
                break;
            case ERR_INVALID_TARGET:
                creep.recycleCreep();
                break;
        }
    }

    reserveController(controller) {
        const creep = this.creep;
        if (!creep.memory.signed) {
            switch (creep.signController(controller, _.sample(ATTACK_ROOM_SIGNS))) {
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(controller, {range: 1});
                    return;
                case OK:
                    creep.memory.signed = true;
                    return;
            }
        }
        switch (creep.reserveController(controller)) {
            case ERR_NOT_IN_RANGE:
                creep.shibMove(controller, {range: 1});
                break;
        }
    }
}

profiler.registerClass(RoleClaimAttacker, 'ClaimAttacker');
module.exports = RoleClaimAttacker;

