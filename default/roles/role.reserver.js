/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleReserver {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.creep.skSafety()) {
            this.creep.memory.other.stationary = undefined;
            return true;
        } else if (this.room.name !== this.creep.memory.destination) {
            this.travel()
        } else if (!this.creep.memory.inPlace) {
            this.getToController();
        } else if (!this.room.controller.reservation || this.room.controller.reservation.username === MY_USERNAME) {
            this.reserveController();
        } else if (this.room.controller.reservation) {
            this.attackController();
        }
    }

    travel() {
        let destination = new RoomPosition(25, 25, this.creep.memory.destination);
        if (this.creep.memory.controllerTarget) {
            const controller = JSON.parse(this.creep.memory.controllerTarget)
            destination = new RoomPosition(controller.x, controller.y, this.creep.memory.destination);
            return this.creep.shibMove(destination);
        }
        this.creep.shibMove(destination, {range: 23});
    }

    getToController() {
        this.creep.memory.controllerTarget = JSON.stringify(this.room.controller.pos);
        if (!this.creep.pos.isNearTo(this.room.controller)) return this.creep.shibMove(this.room.controller); else this.creep.memory.inPlace = true;
    }

    reserveController() {
        switch (this.creep.reserveController(this.room.controller)) {
            case OK:
                this.creep.memory.other.stationary = true;
                if (!this.creep.memory.signed) {
                    let signs = RESERVE_ROOM_SIGNS;
                    this.creep.signController(this.creep.room.controller, _.sample(signs));
                    this.creep.memory.signed = true;
                }
                break;
            case ERR_NOT_IN_RANGE:
                this.creep.shibMove(this.room.controller);
        }
        const ticks = this.room.controller.reservation && this.room.controller.reservation.username === MY_USERNAME ? this.room.controller.reservation.ticksToEnd : 0;
        INTEL[this.room.name].reservationExpires = Game.time + ticks;
        if (!INTEL[this.room.name].reserverCap) INTEL[this.room.name].reserverCap = this.room.controller.pos.countOpenTerrainAround();
    }

    attackController() {
        switch (this.creep.attackController(this.room.controller)) {
            case OK:
                this.creep.memory.other.stationary = true;
                if (!this.creep.memory.signed) {
                    let signs = RESERVE_ROOM_SIGNS;
                    this.creep.signController(this.room.controller, _.sample(signs));
                    this.creep.memory.signed = true;
                }
                if (!INTEL[this.room.name].reserverCap) INTEL[this.room.name].reserverCap = this.room.controller.pos.countOpenTerrainAround();
                break;
            case ERR_NOT_IN_RANGE:
                this.creep.shibMove(this.room.controller);
        }
    }
}

profiler.registerClass(RoleReserver, 'Reserver');
module.exports = RoleReserver;
