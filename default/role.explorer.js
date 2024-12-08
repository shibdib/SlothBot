/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("./tools.profiler");

class RoleExplorer {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        this.housekeeping();
        if (!this.creep.memory.destination) {
            this.findDestination();
        } else if (this.room.name === this.creep.memory.destination) {
            this.exploreRoom();
        } else {
            this.travel();
        }
    }

    housekeeping() {
        this.creep.say(ICONS.eye, true);
    }

    findDestination() {
        let portal = Game.getObjectById(this.creep.memory.portal) || this.creep.pos.findClosestByRange(_.filter(this.creep.room.structures, (s) => s.structureType === STRUCTURE_PORTAL && !s.destination.shard));
        if (!this.creep.memory.usedPortal && portal && (this.creep.memory.other.portalJump || Math.random() > 0.01)) {
            if (!this.creep.memory.other.portalJump) {
                let roomName;
                if (portal.destination.shard) roomName = portal.destination.room.name; else roomName = portal.destination.roomName;
                this.creep.memory.other.portalJump = roomName;
                if (!this.creep.memory.portal) log.a(this.creep.name + ' has found a portal in ' + roomLink(this.room.name) + ' and is taking it.')
                this.creep.memory.portal = portal.id;
            } else if (this.creep.memory.other.portalJump === this.creep.room.name) {
                return this.creep.memory.usedPortal = true;
            }
            return this.creep.shibMove(portal, {range: 0});
        } else {
            let adjacent = _.filter(_.map(Game.map.describeExits(this.room.name)), function (r) {
                let [EW, NS] = r.match(/\d+/g);
                let highway = (INTEL[r] && INTEL[r].isHighway) || EW % 10 === 0 || NS % 10 === 0;
                return roomStatus(r) === (roomStatus(this.creep.memory.overlord) || highway) && (!INTEL[this.room.name].obstacles || this.creep.pos.findPathTo(Game.map.findExit(this.room.name, r)).length)
            });
            // Filter out the last room if we have options
            if (this.creep.memory.lastRoom && adjacent.length > 1) adjacent = _.filter(adjacent, (a) => a !== this.creep.memory.lastRoom);
            // If there's unexplored prioritize else pick random
            let target = _.find(adjacent, (r) => !INTEL[r]) || _.sample(adjacent);
            if (target) this.creep.memory.destination = target; else this.creep.idleFor(25);
        }
    }

    exploreRoom() {
        // Sign the controller
        if (this.room.controller && !this.room.controller.owner && !INTEL[this.room.name].obstructions) {
            if ((SIGN_CLEANER || !this.room.controller.sign) && (!this.room.controller.sign || (this.room.controller.sign.username !== MY_USERNAME && this.room.controller.sign.username !== 'Screeps'))) {
                // Else sign it
                switch (this.creep.signController(this.room.controller, _.sample(EXPLORED_ROOM_SIGNS))) {
                    case OK:
                        this.creep.memory.destination = undefined;
                        break;
                    case ERR_NOT_IN_RANGE:
                        this.creep.shibMove(this.room.controller);
                }
                return;
            }
        }
        this.creep.memory.destination = undefined;
        this.creep.memory.lastRoom = this.room.name;
    }

    travel() {
        this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 10});
    }
}

profiler.registerClass(RoleExplorer, 'Explorer');
module.exports = RoleExplorer;