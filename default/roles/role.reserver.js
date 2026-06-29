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
        } else if (!this.creep.memory.destination || this.room.name !== this.creep.memory.destination) {
            if (!this.creep.memory.destination) {
                return this.creep.recycleCreep();
            }
            this.travel();
        } else if (!this.creep.memory.inPlace) {
            this.getToController();
        } else {
            const controller = this.resolveController();
            if (!controller) {
                this.creep.memory.inPlace = undefined;
                this.getToController();
                return;
            }
            if (!controller.reservation || controller.reservation.username === MY_USERNAME) {
                this.reserveController();
            } else if (!FRIENDLIES.includes(controller.reservation.username)) {
                this.attackController();
            } else {
                this.creep.recycleCreep();
            }
        }
    }

    resolveController() {
        if (this.room.controller) return this.room.controller;
        const found = this.room.find(FIND_STRUCTURES, {filter: {structureType: STRUCTURE_CONTROLLER}});
        return found[0];
    }

    getControllerPos() {
        const controller = this.resolveController();
        if (controller) return controller.pos;
        if (this.creep.memory.controllerTarget) {
            try {
                const cached = JSON.parse(this.creep.memory.controllerTarget);
                if (cached && cached.x !== undefined && cached.y !== undefined) {
                    return new RoomPosition(cached.x, cached.y, this.room.name);
                }
            } catch (e) { /* fall through */
            }
        }
        return new RoomPosition(25, 25, this.room.name);
    }

    travel() {
        if (!this.creep.memory.destination) {
            this.creep.recycleCreep();
            return;
        }
        let destination = new RoomPosition(25, 25, this.creep.memory.destination);
        if (this.creep.memory.controllerTarget) {
            try {
                const controller = JSON.parse(this.creep.memory.controllerTarget);
                if (controller && controller.x !== undefined && controller.y !== undefined) {
                    destination = new RoomPosition(controller.x, controller.y, this.creep.memory.destination);
                    return this.creep.shibMove(destination);
                }
            } catch (e) { /* use room center */
            }
        }
        this.creep.shibMove(destination, {range: 23});
    }

    getToController() {
        const controller = this.resolveController();
        const pos = controller ? controller.pos : this.getControllerPos();
        if (controller) this.creep.memory.controllerTarget = JSON.stringify(controller.pos);
        if (!this.creep.pos.isNearTo(pos)) {
            return this.creep.shibMove(controller || pos);
        }
        this.creep.memory.inPlace = true;
    }

    reserveController() {
        const controller = this.resolveController();
        if (!controller) return;
        switch (this.creep.reserveController(controller)) {
            case OK:
                this.creep.memory.other.stationary = true;
                if (!this.creep.memory.signed) {
                    let signs = RESERVE_ROOM_SIGNS;
                    this.creep.signController(controller, _.sample(signs));
                    this.creep.memory.signed = true;
                }
                break;
            case ERR_NOT_IN_RANGE:
                this.creep.shibMove(controller);
        }
        const intel = INTEL[this.room.name];
        if (intel) {
            const ticks = controller.reservation && controller.reservation.username === MY_USERNAME
                ? controller.reservation.ticksToEnd : 0;
            intel.reservationExpires = Game.time + ticks;
            if (!intel.reserverCap) intel.reserverCap = controller.pos.countOpenTerrainAround();
        }
    }

    attackController() {
        const controller = this.resolveController();
        if (!controller) return;
        switch (this.creep.attackController(controller)) {
            case OK:
                this.creep.memory.other.stationary = true;
                if (!this.creep.memory.signed) {
                    let signs = RESERVE_ROOM_SIGNS;
                    this.creep.signController(controller, _.sample(signs));
                    this.creep.memory.signed = true;
                }
                const intel = INTEL[this.room.name];
                if (intel && !intel.reserverCap) intel.reserverCap = controller.pos.countOpenTerrainAround();
                break;
            case ERR_NOT_IN_RANGE:
                this.creep.shibMove(controller);
        }
    }
}

profiler.registerClass(RoleReserver, 'Reserver');
module.exports = RoleReserver;