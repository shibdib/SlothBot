/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const season = require('module.season');

const DEST_SEARCH_INTERVAL = 15;
const HIGH_VALUE_SEARCH_INTERVAL = 25;
const LOCAL_BFS_HOPS = 4;
const COLONY_GAP_HOPS = 6;
const INTEL_REFRESH_TICKS = 150;
const MAX_EXPLORERS_PER_DEST = 1;
const TICKS_PER_ROOM = 90;
const MAX_TRAVEL_HOPS = 8;

const EXPLORER_ANCHORS = [
    [10, 10], [40, 10], [10, 40], [40, 40],
    [25, 10], [25, 40], [10, 25], [40, 25],
    [18, 18], [32, 18], [18, 32], [32, 32],
];

let explorerAssignTick = -1;
let explorerDestCounts = null;
let colonyGapTick = -1;
let colonyGapRooms = null;
let portalDestCache = {};

function creepHash(creep, salt = '') {
    let h = 0;
    const s = creep.name + salt;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}

function explorerScatterScore(creep, roomName) {
    return (creepHash(creep, roomName) % 1000) * 0.001;
}

function explorerMoveAnchor(roomName, creep) {
    const anchor = EXPLORER_ANCHORS[creepHash(creep, roomName) % EXPLORER_ANCHORS.length];
    return new RoomPosition(anchor[0], anchor[1], roomName);
}

function getExplorerDestCounts() {
    if (explorerAssignTick === Game.time) return explorerDestCounts;
    explorerAssignTick = Game.time;
    explorerDestCounts = Object.create(null);
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c.my || c.memory.role !== 'explorer' || !c.memory.destination) continue;
        const d = c.memory.destination;
        explorerDestCounts[d] = (explorerDestCounts[d] || 0) + 1;
    }
    return explorerDestCounts;
}

function explorerAssigned(roomName) {
    return getExplorerDestCounts()[roomName] || 0;
}

function noteExplorerAssignment(roomName) {
    getExplorerDestCounts();
    explorerDestCounts[roomName] = (explorerDestCounts[roomName] || 0) + 1;
}

function isOwnedHome(roomName) {
    return !!(MY_ROOMS && MY_ROOMS.includes(roomName));
}

function isSkName(roomName) {
    return !!(global.isSourceKeeperRoomName && isSourceKeeperRoomName(roomName));
}

function isCenterName(roomName) {
    return !!(global.isSectorCenterRoomName && isSectorCenterRoomName(roomName));
}

function isHighwayName(roomName) {
    return !!(global.isHighwayRoomName && isHighwayRoomName(roomName));
}

function isSeason() {
    return typeof IS_SEASON !== 'undefined' && IS_SEASON;
}

function skipDangerous(roomName, intel) {
    if (isSkName(roomName)) return true;
    if (intel && intel.owner && intel.towers) return true;
    if (intel && intel.invaderTTL && intel.invaderTTL > Game.time) return true;
    return false;
}

function needsHubCheck(intel) {
    if (!intel || intel.owner || intel.obstacles) return false;
    if (intel.sources !== 2) return false;
    if (intel.hubCheckAt) return false;
    // Heavy hubCheck is skipped while hostiles are in the room. Do not
    // suicide-loop a 1-MOVE explorer back in until they expire.
    if (intel.armedHostile && intel.armedHostile + CREEP_LIFE_TIME > Game.time) return false;
    if (intel.invaderTTL && intel.invaderTTL > Game.time) return false;
    return true;
}

function missingBasicIntel(intel, roomName) {
    if (!intel) return true;
    if (intel.sources != null) return false;
    if (isHighwayName(roomName) || isCenterName(roomName)) return !intel.lastObservation;
    return true;
}

function intelCompleteEnough(intel, roomName, now) {
    if (!intel) return false;
    if (missingBasicIntel(intel, roomName) || needsHubCheck(intel)) return false;
    if (isSeason() && isCenterName(roomName) && intel.reactor == null && !intel.cached) return false;
    if (!intel.lastObservation || now - intel.lastObservation > 800) return false;
    return true;
}

function maxReachableHops(creep) {
    const ttl = creep.ticksToLive || CREEP_LIFE_TIME;
    return Math.max(1, Math.min(MAX_TRAVEL_HOPS, Math.floor((ttl - 80) / TICKS_PER_ROOM)));
}

function getColonyGapRooms() {
    if (colonyGapTick === Game.time && colonyGapRooms) return colonyGapRooms;
    colonyGapTick = Game.time;
    const gaps = [];
    const homes = MY_ROOMS || [];
    const seen = new Set(homes);
    let frontier = homes.slice();

    for (let hop = 0; hop < COLONY_GAP_HOPS; hop++) {
        const next = [];
        for (let i = 0; i < frontier.length; i++) {
            const exits = Game.map.describeExits(frontier[i]);
            if (!exits) continue;
            for (const neighbor of Object.values(exits)) {
                if (seen.has(neighbor) || roomStatus(neighbor) === 'closed') continue;
                seen.add(neighbor);
                next.push(neighbor);
                if (isOwnedHome(neighbor)) continue;
                const intel = INTEL[neighbor];
                if (skipDangerous(neighbor, intel) && intel && intel.sources != null) continue;
                if (isSkName(neighbor)) continue;
                let kind = 0;
                if (missingBasicIntel(intel, neighbor)) kind = 1;
                else if (skipDangerous(neighbor, intel)) continue;
                else if (needsHubCheck(intel)) kind = 2;
                else if (isSeason() && isCenterName(neighbor) && intel.reactor == null && !intel.cached) kind = 3;
                else if (!intel.cached && intel.sources === 2 && !intel.owner) kind = 4;
                else continue;
                gaps.push({room: neighbor, hop, kind});
            }
        }
        frontier = next;
        if (!frontier.length) break;
    }

    const extras = [];
    if (Memory.claimTarget && Memory.claimTarget.room) extras.push(Memory.claimTarget.room);
    const scouts = Memory.expansionScoutRooms;
    if (scouts) {
        for (let i = 0; i < scouts.length; i++) extras.push(scouts[i]);
    }
    for (let i = 0; i < extras.length; i++) {
        const roomName = extras[i];
        if (!roomName || seen.has(roomName) || isOwnedHome(roomName)) continue;
        if (roomStatus(roomName) === 'closed' || isSkName(roomName)) continue;
        const intel = INTEL[roomName];
        if (intel && intelCompleteEnough(intel, roomName, Game.time)) continue;
        if (skipDangerous(roomName, intel) && intel && intel.sources != null) continue;
        gaps.push({room: roomName, hop: 3, kind: needsHubCheck(intel) ? 2 : 1});
        seen.add(roomName);
    }

    colonyGapRooms = gaps;
    return gaps;
}

function colonyHasIntelGaps() {
    return getColonyGapRooms().length > 0;
}

class RoleExplorer {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        this.creep.say(ICONS.eye, true);

        if (!this.creep.memory.destination) {
            // Pathing / portal / dest-clear can dump us in a useful room
            // with no destination. Cache it before walking away.
            if (!isOwnedHome(this.room.name) && this.roomNeedsIntel()) {
                this.exploreRoom();
                return;
            }
            this.findDestination();
        } else if (this.room.name === this.creep.memory.destination) {
            this.exploreRoom();
        } else {
            this.creep.shibMove(explorerMoveAnchor(this.creep.memory.destination, this.creep), {
                range: 12,
                offRoad: true,
            });
        }
    }

    findDestination() {
        const currentTime = Game.time;
        const searchStagger = creepHash(this.creep) % DEST_SEARCH_INTERVAL;

        if (!this.creep.memory.other) this.creep.memory.other = {};

        if (!isSeason()
            && !this.creep.memory.usedPortal && this.creep.room.portals.length
            && !colonyHasIntelGaps()) {
            const portal = Game.getObjectById(this.creep.memory.portal) ||
                this.creep.pos.findClosestByRange(_.filter(this.creep.room.portals, s => !s.destination.shard));

            if (portal) {
                if (!portalDestCache[portal.id]) {
                    const destRoom = portal.destination.shard ? portal.destination.room : portal.destination.roomName;
                    portalDestCache[portal.id] = destRoom;

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

        const colonyGap = this.findColonyGapTarget();
        if (colonyGap) {
            this.assignDestination(colonyGap, currentTime);
            return;
        }

        const lastSearch = this.creep.memory.destSearchTick || 0;
        if (lastSearch + DEST_SEARCH_INTERVAL + searchStagger > currentTime) {
            if (this.pickAdjacentTarget()) return;
        }

        const lastHighValue = this.creep.memory.highValueSearchTick || 0;
        if (lastHighValue + HIGH_VALUE_SEARCH_INTERVAL <= currentTime) {
            this.creep.memory.highValueSearchTick = currentTime;
            const highValue = this.findHighValueTarget();
            if (highValue) {
                this.assignDestination(highValue, currentTime);
                return;
            }
        }

        const localTarget = this.findBestLocalTarget(LOCAL_BFS_HOPS);
        if (localTarget) {
            this.assignDestination(localTarget, currentTime);
            return;
        }

        if (this.pickAdjacentTarget()) {
            this.creep.memory.destSearchTick = currentTime;
            return;
        }

        this.creep.idleFor(3 + (creepHash(this.creep) % 8));
    }

    assignDestination(target, currentTime) {
        if (!target || target === this.room.name) return false;
        if (explorerAssigned(target) >= MAX_EXPLORERS_PER_DEST) return false;
        this.creep.memory.destination = target;
        this.creep.memory.destSearchTick = currentTime;
        noteExplorerAssignment(target);
        return true;
    }

    findColonyGapTarget() {
        const maxDist = maxReachableHops(this.creep);
        const gaps = getColonyGapRooms();
        let best = null;
        let bestScore = Infinity;

        for (let i = 0; i < gaps.length; i++) {
            const gap = gaps[i];
            const roomName = gap.room;
            if (roomName === this.room.name) continue;
            if (explorerAssigned(roomName) >= MAX_EXPLORERS_PER_DEST) continue;
            const dist = Game.map.getRoomLinearDistance(this.room.name, roomName);
            if (dist > maxDist) continue;

            let score = gap.hop * 40 + dist * 25;
            if (gap.kind === 1) score -= gap.hop === 0 ? 2000 : 900;
            else if (gap.kind === 2) score -= 1200;
            else if (gap.kind === 3) score -= 1000;
            else score -= 400;
            if (isSeason()) {
                score -= season.roomNorthValue(roomName);
                if (isCenterName(roomName)) score -= 600;
            }
            score += explorerAssigned(roomName) * 5000;
            score += explorerScatterScore(this.creep, roomName);

            if (score < bestScore) {
                bestScore = score;
                best = roomName;
            }
        }
        return best;
    }

    pickAdjacentTarget() {
        const exits = Game.map.describeExits(this.room.name);
        let candidates = [];

        for (const dir in exits) {
            const name = exits[dir];
            if (roomStatus(name) === 'closed' || isOwnedHome(name) || isSkName(name)) continue;
            const intel = INTEL[name];
            if (skipDangerous(name, intel) && intel && intel.sources != null) continue;
            candidates.push(name);
        }

        if (this.creep.memory.lastRoom && candidates.length > 1) {
            candidates = candidates.filter(n => n !== this.creep.memory.lastRoom);
        }
        if (!candidates.length) return false;

        const incomplete = candidates.filter(n => !intelCompleteEnough(INTEL[n], n, Game.time));
        const pool = incomplete.length ? incomplete : candidates;
        const available = pool.filter(n => explorerAssigned(n) < MAX_EXPLORERS_PER_DEST);
        if (!available.length) return false;

        const target = _.min(available, n => {
            const intel = INTEL[n];
            let s = intel ? (intel.lastObservation || 0) : 0;
            if (missingBasicIntel(intel, n)) s -= 50000;
            else if (needsHubCheck(intel)) s -= 40000;
            s += explorerAssigned(n) * 10000;
            s += explorerScatterScore(this.creep, n);
            if (isSeason()) {
                s -= season.roomNorthValue(n) * 30;
                if (isCenterName(n)) s -= 8000;
            }
            return s;
        });

        if (!target) return false;
        return this.assignDestination(target, Game.time);
    }

    findHighValueTarget() {
        const currentTime = Game.time;
        const maxDist = maxReachableHops(this.creep);
        let best = null;
        let bestScore = Infinity;

        const idx = global.getIntelIndexes ? global.getIntelIndexes(currentTime) : {};
        const candidates = new Set([
            ...(idx.power || []),
            ...(idx.commodity || []),
            ...(idx.unownedSources || []),
            ...(idx.invaderCores || []),
            ...(idx.claimCandidates || []),
            ...(Memory.expansionScoutRooms || []),
        ]);
        if (Memory.claimTarget && Memory.claimTarget.room) candidates.add(Memory.claimTarget.room);

        for (const roomName of candidates) {
            if (!roomName || isOwnedHome(roomName) || isSkName(roomName)) continue;
            if (roomStatus(roomName) === 'closed') continue;
            const intel = INTEL[roomName];
            if (intel && intel.owner) continue;
            if (skipDangerous(roomName, intel)) continue;
            if (intel && intelCompleteEnough(intel, roomName, currentTime)
                && intel.lastObservation + CREEP_LIFE_TIME > currentTime
                && !needsHubCheck(intel)) continue;

            const assigned = explorerAssigned(roomName);
            if (assigned >= MAX_EXPLORERS_PER_DEST) continue;

            const dist = Game.map.getRoomLinearDistance(this.room.name, roomName);
            if (dist > maxDist) continue;

            let score = dist * 12;

            if (!intel || missingBasicIntel(intel, roomName)) score -= 850;
            if (needsHubCheck(intel)) score -= 700;
            if (intel && intel.power && intel.power > currentTime) score -= 550;
            if (intel && intel.commodity) score -= 450;
            if (intel && intel.cached && intel.cached + 2500 < currentTime) score -= 120;
            if (isSeason()) {
                if (intel && intel.reactor) score -= 700;
                score -= season.roomNorthValue(roomName);
                if (isCenterName(roomName)) score -= 600;
            }

            score += assigned * 5000;
            score += explorerScatterScore(this.creep, roomName);

            if (score < bestScore) {
                bestScore = score;
                best = roomName;
            }
        }

        return best;
    }

    findBestLocalTarget(maxHops = LOCAL_BFS_HOPS) {
        const currentTime = Game.time;
        const seen = new Set([this.room.name]);
        let frontier = [this.room.name];

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
                    next.push(neighbor);

                    if (isOwnedHome(neighbor) || isSkName(neighbor)) continue;
                    const assigned = explorerAssigned(neighbor);
                    if (assigned >= MAX_EXPLORERS_PER_DEST) continue;

                    const intel = INTEL[neighbor];
                    if (skipDangerous(neighbor, intel) && intel && intel.sources != null) continue;
                    if (intelCompleteEnough(intel, neighbor, currentTime)) continue;

                    let score = hop * 80;

                    if (missingBasicIntel(intel, neighbor)) {
                        score -= 600;
                        if (isSeason() && isCenterName(neighbor)) score -= 500;
                    } else {
                        const age = intel.lastObservation ? currentTime - intel.lastObservation : 99999;
                        if (age > 8000) score -= 280;
                        else if (age > 3000) score -= 120;
                        if (needsHubCheck(intel)) score -= 500;
                        if (intel.power && intel.power > currentTime) score -= 420;
                        if (intel.commodity) score -= 350;
                        if (isSeason()) {
                            if (intel.reactor) score -= 500;
                            score -= season.roomNorthValue(neighbor);
                            if (isCenterName(neighbor)) score -= 500;
                        }
                    }

                    score += assigned * 5000;
                    score += explorerScatterScore(this.creep, neighbor);

                    if (score < bestScore) {
                        bestScore = score;
                        best = neighbor;
                    }
                }
            }
            frontier = next;
            if (!frontier.length) break;
        }
        return best;
    }

    needsForceIntel() {
        const room = this.room;
        if (room.controller && room.controller.my) return false;
        if (room.hostileCreeps && room.hostileCreeps.length) return false;
        const intel = INTEL[room.name];
        if (room.sources && room.sources.length === 2 && (!room.controller || !room.controller.owner)
            && (!intel || !intel.hubCheckAt)) return true;
        if (isSeason() && isCenterName(room.name) && (!intel || (intel.reactor == null && !intel.cached))) return true;
        return false;
    }

    roomNeedsIntel() {
        const intel = INTEL[this.room.name];
        if (missingBasicIntel(intel, this.room.name) || needsHubCheck(intel)) return true;
        if (isSeason() && isCenterName(this.room.name) && (!intel || (intel.reactor == null && !intel.cached))) return true;
        if (isHighwayName(this.room.name) && (!intel || !intel.lastObservation
            || intel.lastObservation + INTEL_REFRESH_TICKS < Game.time)) return true;
        return false;
    }

    exploreRoom() {
        if (this.room) {
            const intel = INTEL[this.room.name];
            const highway = isHighwayName(this.room.name);
            const force = this.needsForceIntel();
            if (force || highway || !intel || !intel.lastObservation || intel.lastObservation + INTEL_REFRESH_TICKS < Game.time) {
                this.room.cacheRoomIntel(force);
                this.room.invaderCheck();
            }
        }

        const hostiles = this.room.hostileCreeps && this.room.hostileCreeps.length;
        if (SIGN_ROOMS && !hostiles && (this.creep.ticksToLive || 0) > 500
            && this.creep.memory.destination === this.room.name
            && this.creep.memory.lastRoom !== this.room.name) {
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
                    this.creep.memory.destination = undefined;
                    return;
                }
                this.creep.shibMove(controller);
                return;
            }
            this.creep.memory.signAttempt = undefined;
        }
        this.creep.memory.lastRoom = this.room.name;
        this.creep.memory.destination = undefined;
    }
}

profiler.registerClass(RoleExplorer, 'Explorer');
module.exports = RoleExplorer;
