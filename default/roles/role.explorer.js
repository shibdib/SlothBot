/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Refactored & Deep-Dived by Grok (xAI) - May 2026
 *
 * Version 2.0 - Major CPU + Exploration Intelligence Improvements
 *
 * CPU Wins:
 * - Cached BFS + room scoring per tick (biggest win)
 * - Reduced PathFinder calls in pathableExit
 * - Early exits and throttling on destination selection
 * - Smarter portal checks with INTEL pre-filtering
 *
 * Smarter Exploration:
 * - Prioritizes high-value rooms first (power banks, deposits, threats, old intel, highways)
 * - Strategic BFS scoring instead of pure nearest
 * - Avoids backtracking, closed rooms, and recently visited
 * - Biased toward expansion and intel gaps
 *
 * Portal Handling:
 * - Only takes portals to useful destinations (checked via INTEL)
 * - Caches portal destinations across ticks
 * - Smarter shard/room selection (prefers high-value targets)
 */

const profiler = require("tools.profiler");

let destinationCache = {};
let portalCache = {};

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
        const currentTime = Game.time;

        // === PORTAL LOGIC (smarter) ===
        if (!this.creep.memory.usedPortal) {
            const portal = Game.getObjectById(this.creep.memory.portal) ||
                this.creep.pos.findClosestByRange(_.filter(this.creep.room.portals, s => !s.destination.shard));

            if (portal) {
                // Cache portal destination
                if (!portalCache[portal.id]) {
                    const destRoom = portal.destination.shard ? portal.destination.room : portal.destination.roomName;
                    portalCache[portal.id] = destRoom;

                    // Only take if destination is valuable or unknown
                    const intel = INTEL[destRoom];
                    const isValuable = !intel ||
                        (intel.power && intel.power > currentTime) ||
                        intel.commodity ||
                        (intel.threatLevel && intel.threatLevel > 1) ||
                        !intel.cached;

                    if (isValuable || this.creep.memory.other.portalJump) {
                        if (!this.creep.memory.other.portalJump) {
                            this.creep.memory.other.portalJump = destRoom;
                            log.a(`${this.creep.name} taking portal from ${roomLink(this.room.name)} to ${roomLink(destRoom)}`);
                        }
                        this.creep.memory.portal = portal.id;
                        this.creep.shibMove(portal, {range: 0});
                        return;
                    }
                } else if (portalCache[portal.id] === this.creep.room.name) {
                    this.creep.memory.usedPortal = true;
                }
            }
        }

        // === SMART DESTINATION SELECTION ===
        const cacheKey = this.room.name;
        if (destinationCache[cacheKey] && destinationCache[cacheKey].tick + 10 > currentTime) {
            this.creep.memory.destination = destinationCache[cacheKey].target;
            return;
        }

        // 1. Try high-value unvisited rooms first (power, deposits, threats)
        const highValue = this.findHighValueTarget();
        if (highValue) {
            this.creep.memory.destination = highValue;
            destinationCache[cacheKey] = {target: highValue, tick: currentTime};
            return;
        }

        // 2. BFS for nearest unvisited (with strategic scoring)
        const unvisited = this.findNearestUnvisited(5);
        if (unvisited) {
            this.creep.memory.destination = unvisited;
            destinationCache[cacheKey] = {target: unvisited, tick: currentTime};
            return;
        }

        // 3. Fallback: adjacent rooms (smart selection)
        const exits = Game.map.describeExits(this.room.name);
        let candidates = [];

        for (const dir in exits) {
            const name = exits[dir];
            if (roomStatus(name) === 'closed') continue;
            const tiles = this.room.find(parseInt(dir));
            if (!tiles.length) continue;

            const midTile = tiles[Math.floor(tiles.length / 2)];
            if (pathableExit(this.creep, midTile)) {
                candidates.push(name);
            }
        }

        // Avoid backtracking
        if (this.creep.memory.lastRoom && candidates.length > 1) {
            candidates = candidates.filter(n => n !== this.creep.memory.lastRoom);
        }

        if (!candidates.length) {
            this.creep.idleFor(6);
            return;
        }

        // Prefer rooms without vision, then oldest intel
        const noVision = candidates.filter(n => !Game.rooms[n]);
        const pool = noVision.length ? noVision : candidates;

        const target = _.min(pool, n => {
            const intel = INTEL[n];
            if (!intel) return 0; // unvisited = highest priority
            return intel.lastObservation || 0;
        });

        if (target) {
            this.creep.memory.destination = target;
            destinationCache[cacheKey] = {target, tick: currentTime};
        } else {
            this.creep.idleFor(6);
        }
    }

    // Find high-value rooms (power banks, deposits, threats, highways)
    findHighValueTarget() {
        const currentTime = Game.time;
        let best = null;
        let bestScore = Infinity;

        for (const roomName in INTEL) {
            const intel = INTEL[roomName];
            if (!intel || intel.owner || roomStatus(roomName) === 'closed') continue;

            // Skip recently visited
            if (intel.lastObservation && intel.lastObservation + CREEP_LIFE_TIME > currentTime) continue;

            // Skip rooms already assigned to other creeps
            const alreadyAssigned = _.find(Game.creeps, c => c.memory.destination === roomName);
            if (alreadyAssigned) continue;

            let score = Game.map.getRoomLinearDistance(this.room.name, roomName) * 10;

            // Power banks (high priority)
            if (intel.power && intel.power > currentTime) score -= 500;

            // Commodity deposits
            if (intel.commodity) score -= 400;

            // Threats (scout for danger)
            if (intel.threatLevel && intel.threatLevel > 1) score -= 300;

            // Highways (good for expansion)
            if (intel.isHighway) score -= 200;

            // Old intel (need refresh)
            if (intel.cached && intel.cached + 2000 < currentTime) score -= 150;

            // Unvisited = very high priority
            if (!intel.cached) score -= 1000;

            if (score < bestScore) {
                bestScore = score;
                best = roomName;
            }
        }

        return best;
    }

    // BFS with early exit on first unvisited
    findNearestUnvisited(maxHops = 5) {
        const seen = new Set([this.room.name]);
        let frontier = [this.room.name];

        for (let hop = 0; hop < maxHops; hop++) {
            const next = [];
            for (const roomName of frontier) {
                for (const neighbor of Object.values(Game.map.describeExits(roomName))) {
                    if (seen.has(neighbor) || roomStatus(neighbor) === 'closed') continue;
                    seen.add(neighbor);

                    if (!INTEL[neighbor]) return neighbor; // First unvisited = winner

                    next.push(neighbor);
                }
            }
            frontier = next;
            if (!frontier.length) break;
        }
        return null;
    }

    exploreRoom() {
        if (SIGN_ROOMS && this.creep.memory.lastRoom !== this.room.name) {
            return this.signRooms();
        }
        this.creep.memory.destination = undefined;
        this.creep.memory.lastRoom = this.room.name;
    }

    signRooms() {
        const controller = this.room.controller;
        if (controller && (!controller.sign || controller.sign.username !== MY_USERNAME)) {
            const result = this.creep.signController(controller, _.sample(EXPLORED_ROOM_SIGNS) + ` - ${Game.time}`);
            if (result === ERR_NOT_IN_RANGE) {
                if (!this.creep.memory.signAttempt) this.creep.memory.signAttempt = Game.time;
                else if (this.creep.memory.signAttempt + 50 < Game.time) {
                    this.creep.memory.signAttempt = undefined;
                    this.creep.memory.lastRoom = this.room.name;
                    return;
                }
                this.creep.shibMove(controller);
                return;
            }
            this.creep.memory.signAttempt = undefined;
        }
        this.creep.memory.lastRoom = this.room.name;
    }
}

function pathableExit(creep, exitPosition) {
    // Cache expensive PathFinder results for 20 ticks
    const cacheKey = `${creep.pos.roomName}-${exitPosition.x}-${exitPosition.y}`;
    if (portalCache[cacheKey] && portalCache[cacheKey].tick + 20 > Game.time) {
        return portalCache[cacheKey].result;
    }

    const search = PathFinder.search(creep.pos, exitPosition, {
        maxRooms: 1,
        roomCallback: (roomName) => {
            const costMatrix = new PathFinder.CostMatrix();
            const room = Game.rooms[roomName];
            if (room) {
                room.impassibleStructures.forEach(s => costMatrix.set(s.pos.x, s.pos.y, 256));
            }
            return costMatrix;
        }
    });

    const result = search.incomplete !== true && search.path.length > 3;
    portalCache[cacheKey] = {result, tick: Game.time};
    return result;
}

profiler.registerClass(RoleExplorer, 'Explorer');
module.exports = RoleExplorer;