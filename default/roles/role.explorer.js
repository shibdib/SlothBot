/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

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
                // inter-shard: destination.room is already a string; same-shard: destination.roomName
                const roomName = portal.destination.shard ? portal.destination.room : portal.destination.roomName;
                this.creep.memory.other.portalJump = roomName;
                if (!this.creep.memory.portal) log.a(this.creep.name + ' has found a portal in ' + roomLink(this.room.name) + ' and is taking it.')
                this.creep.memory.portal = portal.id;
            } else if (this.creep.memory.other.portalJump === this.creep.room.name) {
                return this.creep.memory.usedPortal = true;
            }
            return this.creep.shibMove(portal, {range: 0});
        } else {
            const exits = Game.map.describeExits(this.room.name);
            const rooms = Object.keys(exits).map(direction => ({
                name: exits[direction],
                direction: parseInt(direction, 10)
            }));

            let adjacent = _.filter(rooms, r => {
                if (roomStatus(r.name) === 'closed') return false;
                // Skip rooms we know are hostile or enemy-owned
                const intel = INTEL[r.name];
                if (intel && (intel.hostile || (intel.owner && !FRIENDLIES.includes(intel.owner)))) return false;
                return pathableExit(this.creep, this.room.find(r.direction)[Math.floor(this.room.find(r.direction).length / 2)]);
            });

            // Don't backtrack unless it's the only option
            if (this.creep.memory.lastRoom && adjacent.length > 1) {
                adjacent = _.filter(adjacent, a => a.name !== this.creep.memory.lastRoom);
            }

            // Priority: no intel > stale intel (oldest first) > random
            let target = _.find(adjacent, r => !INTEL[r.name])
                || _.min(adjacent.filter(r => INTEL[r.name]), r => INTEL[r.name].lastSeen || 0)
                || _.sample(adjacent);

            if (target && target.name) this.creep.memory.destination = target.name; else this.creep.idleFor(6);
        }
    }

    exploreRoom() {
        if (SIGN_ROOMS && this.creep.memory.lastRoom !== this.room.name) return this.signRooms();
        this.creep.memory.destination = undefined;
        this.creep.memory.lastRoom = this.room.name;
    }

    travel() {
        this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 22});
    }

    signRooms() {
        if (this.room.controller && (!this.room.controller.sign || this.room.controller.sign.username !== MY_USERNAME) && this.creep.pos.findClosestByPath(this.room.controller)) {
            switch (this.creep.signController(this.room.controller, _.sample(EXPLORED_ROOM_SIGNS) + ` - ` + Game.time)) {
                case OK:
                    this.creep.memory.signAttempt = undefined;
                    break;
                case ERR_NOT_IN_RANGE:
                    if (!this.creep.memory.signAttempt) this.creep.memory.signAttempt = Game.time;
                    else if (this.creep.memory.signAttempt + 50 < Game.time) {
                        this.creep.memory.signAttempt = undefined;
                        this.creep.memory.lastRoom = this.room.name;
                        return;
                    }
                    this.creep.shibMove(this.room.controller);
                    return;
            }
        }
        this.creep.memory.signAttempt = undefined;
        this.creep.memory.lastRoom = this.room.name;
    }
}

function pathableExit(creep, exitPosition) {
    const roomCallback = (roomName) => {
        const room = Game.rooms[roomName];
        const costMatrix = new PathFinder.CostMatrix();
        if (room) {
            const structures = room.impassibleStructures;
            structures.forEach((structure) => costMatrix.set(structure.pos.x, structure.pos.y, 256));
        }
        return costMatrix;
    };
    const search = PathFinder.search(creep.pos, exitPosition, {
        maxRooms: 0,
        roomCallback: roomCallback,
    });
    return search.incomplete !== true && search.path.length > 3;
}

profiler.registerClass(RoleExplorer, 'Explorer');
module.exports = RoleExplorer;