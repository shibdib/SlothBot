/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Refactored & Deep-Dived by Grok (xAI) - May 2026
 *
 * Version 2.1 - Improved exploration target selection & spreading
 *
 * Key improvements to target selection (main user complaint area):
 * - findHighValueTarget: precomputed assignments (was O(creeps * intel) inside loop), dist cap + weighted,
 *   reduced far-unvisited pull (local wavefront better for systematic map filling), assignment penalties.
 * - findBestLocalTarget (replaces naive first-unvisited BFS): full local search to maxHops with scoring for
 *   unknowns + old intel + local valuables + "borders unknown" frontier bonus + assignment penalty.
 *   Picks the *best* not the first-encountered (order independent, more purposeful).
 * - Fallback adjacent also considers assignment counts.
 * - On arrival (exploreRoom): explicitly force cacheRoomIntel(true) so visits actually populate good INTEL.
 * - Separate caches (portalDestCache vs exitCache) to prevent key collisions.
 * - Overall: better local frontier pushing + high-value without herding or abandoning local exploration.
 *
 * Other:
 * - CPU friendly precomputes for assignments.
 * - Explorers now more reliably fill intel gaps and refresh old areas locally while still chasing worthwhile distant power/commodity.
 */

const profiler = require("tools.profiler");

let destinationCache = {};
let portalDestCache = {};
let exitCache = {};  // separate from portal dests (was polluting the same object before)

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
                if (!portalDestCache[portal.id]) {
                    const destRoom = portal.destination.shard ? portal.destination.room : portal.destination.roomName;
                    portalDestCache[portal.id] = destRoom;

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
                } else if (portalDestCache[portal.id] === this.creep.room.name) {
                    this.creep.memory.usedPortal = true;
                }
            }
        }

        // === SMART DESTINATION SELECTION ===
        const cacheKey = this.room.name;
        if (destinationCache[cacheKey] && destinationCache[cacheKey].tick + 10 > currentTime) {
            const cachedTarget = destinationCache[cacheKey].target;
            // If the cached target is now heavily assigned by other explorers (race or multiple from same origin),
            // ignore cache and re-evaluate for better spreading.
            let assignedToCached = 0;
            for (const cName in Game.creeps) {
                if (Game.creeps[cName].my && Game.creeps[cName].memory.destination === cachedTarget && Game.creeps[cName].memory.role === 'explorer') {
                    assignedToCached++;
                }
            }
            if (assignedToCached < 2) {
                this.creep.memory.destination = cachedTarget;
                return;
            }
            // else fall through to fresh selection
        }

        // 1. Try high-value targets worth traveling for (power, commodity, etc.)
        // Now smarter (see findHighValueTarget) and won't dominate local exploration.
        const highValue = this.findHighValueTarget();
        if (highValue) {
            this.creep.memory.destination = highValue;
            destinationCache[cacheKey] = {target: highValue, tick: currentTime};
            return;
        }

        // 2. Local wavefront / best local target (improved BFS that scores unknowns + stale + local value + frontier bonus)
        const localTarget = this.findBestLocalTarget(6);
        if (localTarget) {
            this.creep.memory.destination = localTarget;
            destinationCache[cacheKey] = {target: localTarget, tick: currentTime};
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

        // Prefer rooms without vision, then oldest intel. Also avoid over-assigned.
        const noVision = candidates.filter(n => !Game.rooms[n]);
        const pool = noVision.length ? noVision : candidates;

        // Quick assigned count for these few candidates
        const assignedHere = {};
        for (const name in Game.creeps) {
            const c = Game.creeps[name];
            if (c.my && c.memory.role === 'explorer' && c.memory.destination && candidates.includes(c.memory.destination)) {
                assignedHere[c.memory.destination] = (assignedHere[c.memory.destination] || 0) + 1;
            }
        }

        const target = _.min(pool, n => {
            const intel = INTEL[n];
            let s = intel ? (intel.lastObservation || 0) : 0;
            s += (assignedHere[n] || 0) * 1000; // strongly deprioritize if others already heading there
            return s;
        });

        if (target) {
            this.creep.memory.destination = target;
            destinationCache[cacheKey] = {target, tick: currentTime};
        } else {
            this.creep.idleFor(6);
        }
    }

    // Find high-value rooms (power banks, deposits, threats, highways) worth traveling for.
    // Improved: precompute assigned to avoid O(N) finds, penalize over-assignment,
    // limit crazy far pulls for pure unvisited (local discovery via BFS/fallback is better for map filling),
    // stronger dist weighting.
    findHighValueTarget() {
        const currentTime = Game.time;

        // Precompute assignments once (explorers only) - fixes previous quadratic cost inside loop
        const assignedCounts = {};
        for (const name in Game.creeps) {
            const c = Game.creeps[name];
            if (c.my && c.memory.role === 'explorer' && c.memory.destination) {
                const d = c.memory.destination;
                assignedCounts[d] = (assignedCounts[d] || 0) + 1;
            }
        }

        let best = null;
        let bestScore = Infinity;

        for (const roomName in INTEL) {
            const intel = INTEL[roomName];
            if (!intel || intel.owner || roomStatus(roomName) === 'closed') continue;

            // Skip recently visited (by anyone)
            if (intel.lastObservation && intel.lastObservation + CREEP_LIFE_TIME > currentTime) continue;

            const assigned = assignedCounts[roomName] || 0;
            if (assigned >= 2) continue; // don't herd too many to same high value

            const dist = Game.map.getRoomLinearDistance(this.room.name, roomName);
            if (dist > 40) continue; // don't chase across the whole map for marginal value

            let score = dist * 12;  // stronger distance cost than before

            // Power banks (high priority)
            if (intel.power && intel.power > currentTime) score -= 550;

            // Commodity deposits
            if (intel.commodity) score -= 450;

            // Threats (scout for danger)
            if (intel.threatLevel && intel.threatLevel > 1) score -= 320;

            // Highways (good for expansion / remote potential)
            if (intel.isHighway) score -= 180;

            // Old heavy intel (need refresh for good data)
            if (intel.cached && intel.cached + 2500 < currentTime) score -= 120;

            // Unvisited / no heavy: only big bonus if relatively local (far unvisited should be discovered by wavefront from other explorers)
            if (!intel.cached) {
                if (dist < 15) score -= 850;
                else score -= 150; // small pull for distant unknowns
            }

            // Penalize multiple targeting same high-value room
            score += assigned * 250;

            if (score < bestScore) {
                bestScore = score;
                best = roomName;
            }
        }

        return best;
    }

    // Improved local target selection via BFS (wavefront expansion).
    // Instead of "first unknown encountered" (order-dependent on describeExits),
    // we explore up to maxHops, score all interesting rooms (unknown or old intel or high value),
    // and pick the best one. This leads to more purposeful exploration:
    // - pushes the frontier into unknown areas
    // - refreshes chains of stale intel locally
    // - prefers high local value (power/commodity/highway near us)
    // - avoids recently visited and over-assigned
    findBestLocalTarget(maxHops = 6) {
        const currentTime = Game.time;
        const seen = new Set([this.room.name]);
        let frontier = [this.room.name];

        // Precompute explorer assignments for penalty (cheap)
        const assignedCounts = {};
        for (const name in Game.creeps) {
            const c = Game.creeps[name];
            if (c.my && c.memory.role === 'explorer' && c.memory.destination) {
                assignedCounts[c.memory.destination] = (assignedCounts[c.memory.destination] || 0) + 1;
            }
        }

        let best = null;
        let bestScore = Infinity;

        for (let hop = 0; hop < maxHops; hop++) {
            const next = [];
            for (const roomName of frontier) {
                const exits = Game.map.describeExits(roomName);
                if (!exits) continue;
                for (const neighbor of Object.values(exits)) {
                    if (seen.has(neighbor) || roomStatus(neighbor) === 'closed') continue;
                    seen.add(neighbor);
                    next.push(neighbor); // always continue wavefront for good coverage, even if this room is popular

                    const intel = INTEL[neighbor];
                    let score = hop * 80;  // base cost for distance in hops (good approx)

                    const assigned = assignedCounts[neighbor] || 0;
                    if (assigned >= 3) {
                        // still traversed, but won't be chosen as destination
                    } else if (!intel) {
                        score -= 600; // strong unknown bonus
                    } else {
                        // Refresh value
                        const age = intel.lastObservation ? currentTime - intel.lastObservation : 99999;
                        if (age > 8000) score -= 280;
                        else if (age > 3000) score -= 120;

                        // Local high value
                        if (intel.power && intel.power > currentTime) score -= 420;
                        if (intel.commodity) score -= 350;
                        if (intel.isHighway) score -= 160;
                        if (intel.threatLevel && intel.threatLevel > 0) score -= 80; // worth scouting

                        // Avoid recently visited
                        if (age < 800) score += 400;

                        // Bonus if this room borders further unknowns (good frontier pusher)
                        const exits2 = Game.map.describeExits(neighbor);
                        if (exits2) {
                            let unknownNeighbors = 0;
                            for (const n2 of Object.values(exits2)) {
                                if (!INTEL[n2] && roomStatus(n2) !== 'closed') unknownNeighbors++;
                            }
                            if (unknownNeighbors >= 2) score -= 150;
                        }
                    }

                    score += assigned * 180;

                    if (assigned < 3 && score < bestScore) {
                        bestScore = score;
                        best = neighbor;
                    }

                    // (push already done earlier for wavefront continuation)
                }
            }
            frontier = next;
            if (!frontier.length) break;
        }
        return best;
    }

    exploreRoom() {
        // As the explorer visiting, force a full intel update so the room (and its structures, sources, etc.)
        // get properly recorded in INTEL (heavy data like towerData, ramparts, hubCheck etc.).
        // This helps future targeting, highCommand, remotes, etc.
        if (this.room) {
            this.room.cacheRoomIntel(true);
        }

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
    if (exitCache[cacheKey] && exitCache[cacheKey].tick + 20 > Game.time) {
        return exitCache[cacheKey].result;
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
    exitCache[cacheKey] = {result, tick: Game.time};
    return result;
}

profiler.registerClass(RoleExplorer, 'Explorer');
module.exports = RoleExplorer;