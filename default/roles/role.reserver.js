/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const {getMiningRouteRooms} = require('remoteMining');
const {travelRouteHops} = require('pathRoute');

class RoleReserver {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        if (!this.creep.memory.other) this.creep.memory.other = {};
        this.performRoleActions();
    }

    performRoleActions() {
        // SK check only when relevant — skSafety scans hostiles/structures every call.
        if (this.needsSkSafety() && this.creep.skSafety()) {
            this.creep.memory.other.stationary = undefined;
            this.creep.memory.inPlace = undefined;
            return;
        }

        const dest = this.creep.memory.destination;
        if (!dest) return this.creep.recycleCreep();

        if (Game.time % 50 === 0 && this.creep.memory.colony) {
            const targets = ROOM_REMOTE_TARGETS[this.creep.memory.colony];
            if (targets && targets.length && !targets.some(s => s.room === dest)) {
                return this.creep.recycleCreep();
            }
            const intel = INTEL[dest];
            if (intel && (intel.level || intel.owner)) return this.creep.recycleCreep();
        }

        if (this.room.name !== dest) {
            this.travel(dest);
            return;
        }

        if (!this.creep.memory.inPlace) {
            this.getToController();
            return;
        }

        const controller = this.resolveController();
        if (!controller) {
            this.creep.memory.inPlace = undefined;
            this.getToController();
            return;
        }
        if (controller.owner) return this.creep.recycleCreep();

        // Already adjacent and reserving — no pathing.
        if (!controller.reservation || controller.reservation.username === MY_USERNAME) {
            this.reserveController(controller);
        } else if (!FRIENDLIES.includes(controller.reservation.username)) {
            this.attackController(controller);
        } else {
            this.creep.recycleCreep();
        }
    }

    needsSkSafety() {
        const here = INTEL[this.room.name];
        if (here && here.sk) return true;
        const dest = this.creep.memory.destination;
        if (dest && INTEL[dest] && INTEL[dest].sk) return true;
        if (global.isSourceKeeperRoomName) {
            if (global.isSourceKeeperRoomName(this.room.name)) return true;
            if (dest && global.isSourceKeeperRoomName(dest)) return true;
        }
        return false;
    }

    resolveController() {
        if (this.room.controller) return this.room.controller;
        const id = this.creep.memory.controllerId;
        if (id) {
            const obj = Game.getObjectById(id);
            if (obj) return obj;
        }
        return undefined;
    }

    getCachedControllerPos(roomName) {
        const mem = this.creep.memory;
        if (mem.ctrlX !== undefined && mem.ctrlY !== undefined && mem.ctrlRoom === roomName) {
            return new RoomPosition(mem.ctrlX, mem.ctrlY, roomName);
        }
        return null;
    }

    cacheControllerPos(pos) {
        this.creep.memory.ctrlX = pos.x;
        this.creep.memory.ctrlY = pos.y;
        this.creep.memory.ctrlRoom = pos.roomName;
    }

    travel(dest) {
        // Sticky claim-TTL abort — recycle from the role, never from inside shibMove.
        if (this.creep.memory._claimAbort === dest) {
            this.creep.memory.destination = undefined;
            return this.creep.recycleCreep();
        }

        const colony = this.creep.memory.colony;
        const route = colony ? getMiningRouteRooms(colony, dest) : [];
        const ctrl = this.getCachedControllerPos(dest);
        travelRouteHops(this.creep, dest, route, {
            target: ctrl || new RoomPosition(25, 25, dest),
            range: ctrl ? 1 : 23,
            claimRoute: true,
        });
    }

    getToController() {
        if (this.creep.fatigue > 0) return;

        const controller = this.resolveController();
        if (controller) {
            this.creep.memory.controllerId = controller.id;
            this.cacheControllerPos(controller.pos);
            if (this.creep.pos.isNearTo(controller)) {
                this.creep.memory.inPlace = true;
                return;
            }
            return this.creep.shibMove(controller, {range: 1});
        }

        const pos = this.getCachedControllerPos(this.room.name) || new RoomPosition(25, 25, this.room.name);
        if (this.creep.pos.isNearTo(pos)) {
            this.creep.memory.inPlace = true;
            return;
        }
        this.creep.shibMove(pos, {range: 1});
    }

    reserveController(controller) {
        switch (this.creep.reserveController(controller)) {
            case OK:
                this.creep.memory.other.stationary = true;
                if (!this.creep.memory.signed) {
                    this.creep.signController(controller, _.sample(RESERVE_ROOM_SIGNS));
                    this.creep.memory.signed = true;
                }
                this.updateReservationIntel(controller);
                break;
            case ERR_NOT_IN_RANGE:
                this.creep.memory.inPlace = undefined;
                if (this.creep.fatigue <= 0) this.creep.shibMove(controller, {range: 1});
                break;
            case ERR_INVALID_TARGET:
                return this.creep.recycleCreep();
        }
    }

    attackController(controller) {
        switch (this.creep.attackController(controller)) {
            case OK:
                this.creep.memory.other.stationary = true;
                if (!this.creep.memory.signed) {
                    this.creep.signController(controller, _.sample(RESERVE_ROOM_SIGNS));
                    this.creep.memory.signed = true;
                }
                const intel = INTEL[this.room.name];
                if (intel && !intel.reserverCap) intel.reserverCap = controller.pos.countOpenTerrainAround();
                break;
            case ERR_NOT_IN_RANGE:
                this.creep.memory.inPlace = undefined;
                if (this.creep.fatigue <= 0) this.creep.shibMove(controller, {range: 1});
                break;
        }
    }

    updateReservationIntel(controller) {
        // Throttle intel writes — not needed every tick.
        if (this.creep.memory._resIntelTick && this.creep.memory._resIntelTick + 10 > Game.time) return;
        this.creep.memory._resIntelTick = Game.time;
        const intel = INTEL[this.room.name];
        if (!intel) return;
        const ticks = controller.reservation && controller.reservation.username === MY_USERNAME
            ? controller.reservation.ticksToEnd : 0;
        intel.reservationExpires = Game.time + ticks;
        intel.reservation = MY_USERNAME;
        if (!intel.reserverCap) intel.reserverCap = controller.pos.countOpenTerrainAround();
    }
}

profiler.registerClass(RoleReserver, 'Reserver');
module.exports = RoleReserver;
