/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("./tools.profiler");

class RoleReserver {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.room.name !== this.creep.memory.destination) {
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
        this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination, {range: 23}));
    }

    getToController() {
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
                    if (!INTEL[this.room.name].reserverCap) INTEL[this.room.name].reserverCap = this.room.controller.pos.countOpenTerrainAround();
                }
                let ticks;
                if (this.room.controller.reservation && this.room.controller.reservation.username === MY_USERNAME) {
                    ticks = this.room.controller.reservation['ticksToEnd'] || 0;
                } else {
                    ticks = 0;
                }
                INTEL[this.room.name].reservationExpires = Game.time + ticks - 2000;
                break;
            case ERR_NOT_IN_RANGE:
                this.creep.shibMove(this.room.controller);
        }
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
