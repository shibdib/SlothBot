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
        this.creep.say(ICONS.eye, true);
        if (!this.creep.memory.destination) {
            this.findDestination();
        } else if (this.room.name === this.creep.memory.destination) {
            this.exploreRoom();
        } else {
            this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 22});
        }
    }

    findDestination() {
        // Portal logic
        const portal = Game.getObjectById(this.creep.memory.portal) ||
            this.creep.pos.findClosestByRange(_.filter(this.creep.room.structures, s => s.structureType === STRUCTURE_PORTAL && !s.destination.shard));
        if (!this.creep.memory.usedPortal && portal && (this.creep.memory.other.portalJump || Math.random() > 0.01)) {
            if (!this.creep.memory.other.portalJump) {
                const roomName = portal.destination.shard ? portal.destination.room : portal.destination.roomName;
                this.creep.memory.other.portalJump = roomName;
                if (!this.creep.memory.portal) log.a(this.creep.name + ' has found a portal in ' + roomLink(this.room.name) + ' and is taking it.');
                this.creep.memory.portal = portal.id;
            } else if (this.creep.memory.other.portalJump === this.creep.room.name) {
                this.creep.memory.usedPortal = true;
                return;
            }
            this.creep.shibMove(portal, {range: 0});
            return;
        }

        // BFS outward to find the nearest room with no intel entry
        const unvisited = this.findNearestUnvisited();
        if (unvisited) {
            this.creep.memory.destination = unvisited;
            return;
        }

        // Fallback: adjacent passable rooms, avoiding backtrack and current vision
        const exits = Game.map.describeExits(this.room.name);
        let candidates = [];
        for (const dir in exits) {
            const name = exits[dir];
            if (roomStatus(name) === 'closed') continue;
            const tiles = this.room.find(parseInt(dir));
            if (!tiles.length) continue;
            if (pathableExit(this.creep, tiles[Math.floor(tiles.length / 2)])) candidates.push(name);
        }

        if (this.creep.memory.lastRoom && candidates.length > 1) {
            candidates = candidates.filter(n => n !== this.creep.memory.lastRoom);
        }

        if (!candidates.length) {
            this.creep.idleFor(6);
            return;
        }

        // Prefer rooms without current vision; within that, pick the oldest observed
        const noVision = candidates.filter(n => !Game.rooms[n]);
        const pool = noVision.length ? noVision : candidates;
        const target = _.min(pool, n => (INTEL[n] && INTEL[n].lastObservation) ? INTEL[n].lastObservation : 0);
        if (target) this.creep.memory.destination = target;
        else this.creep.idleFor(6);
    }

    // BFS up to maxHops rooms out, returning the first room with no INTEL entry
    findNearestUnvisited(maxHops = 6) {
        const seen = new Set([this.room.name]);
        let frontier = [this.room.name];
        for (let hop = 0; hop < maxHops; hop++) {
            const next = [];
            for (const roomName of frontier) {
                for (const neighbor of Object.values(Game.map.describeExits(roomName))) {
                    if (seen.has(neighbor) || roomStatus(neighbor) === 'closed') continue;
                    seen.add(neighbor);
                    if (!INTEL[neighbor]) return neighbor;
                    next.push(neighbor);
                }
            }
            frontier = next;
            if (!frontier.length) break;
        }
        return null;
    }

    exploreRoom() {
        if (SIGN_ROOMS && this.creep.memory.lastRoom !== this.room.name) return this.signRooms();
        this.creep.memory.destination = undefined;
        this.creep.memory.lastRoom = this.room.name;
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
    const search = PathFinder.search(creep.pos, exitPosition, {
        maxRooms: 0,
        roomCallback: (roomName) => {
            const costMatrix = new PathFinder.CostMatrix();
            const room = Game.rooms[roomName];
            if (room) room.impassibleStructures.forEach(s => costMatrix.set(s.pos.x, s.pos.y, 256));
            return costMatrix;
        }
    });
    return search.incomplete !== true && search.path.length > 3;
}

profiler.registerClass(RoleExplorer, 'Explorer');
module.exports = RoleExplorer;
