/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const {getMiningRouteRooms} = require('remoteMining');
const {exitHopTarget} = require('pathRoute');

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
        if (this.creep.fatigue > 0) return;

        // Sticky claim-TTL abort — recycle from the role, never from inside shibMove.
        if (this.creep.memory._claimAbort === dest) {
            this.creep.memory.destination = undefined;
            return this.creep.recycleCreep();
        }

        const colony = this.creep.memory.colony;
        let route;
        if (colony) {
            route = getMiningRouteRooms(colony, dest);
            if (route && route.length && !route.includes(this.creep.room.name)) {
                route = [this.creep.room.name].concat(route);
            }
        }

        // Hop along the mining route: path only into the next room.
        // Full multi-room PathFinder for fat CLAIM bodies was ~3+ CPU per travel call.
        if (route && route.length) {
            const idx = route.indexOf(this.creep.room.name);
            if (idx >= 0 && idx < route.length - 1) {
                const nextRoom = route[idx + 1];
                // Last hop: aim at cached controller if known, else room center.
                let hopTarget;
                let range;
                if (nextRoom === dest) {
                    const ctrl = this.getCachedControllerPos(dest);
                    hopTarget = ctrl || new RoomPosition(25, 25, dest);
                    range = ctrl ? 1 : 23;
                    return this.creep.shibMove(hopTarget, {
                        range,
                        route: route.slice(idx, idx + 2),
                        claimRoute: route.slice(idx),
                        maxRooms: 2,
                        maxOps: 2500,
                    });
                }
                const lookAhead = idx + 2 < route.length ? route[idx + 2] : dest;
                const hop = exitHopTarget(this.creep.room.name, nextRoom, this.creep.pos, lookAhead);
                if (hop) {
                    return this.creep.shibMove(hop.pos, {
                        range: 0,
                        hopGoals: hop.goals,
                        hopExitDir: hop.exitDir,
                        fullRoute: route,
                        claimRoute: route.slice(idx),
                        maxRooms: 1,
                        maxOps: 2000,
                    });
                }
                hopTarget = new RoomPosition(25, 25, nextRoom);
                range = 23;
                return this.creep.shibMove(hopTarget, {
                    range,
                    route: route.slice(idx, idx + 2),
                    claimRoute: route.slice(idx),
                    maxRooms: 2,
                    maxOps: 2500,
                });
            }
        }

        // Fallback: not on a known route — head for dest center/controller.
        let destination = this.getCachedControllerPos(dest);
        const options = {};
        if (destination) {
            options.range = 1;
        } else {
            destination = new RoomPosition(25, 25, dest);
            options.range = 23;
        }
        if (route && route.length) options.route = route;

        this.creep.shibMove(destination, options);
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
