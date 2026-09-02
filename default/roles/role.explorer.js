/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const season = require('module.season');

const DEST_SEARCH_INTERVAL = 15;
const HIGH_VALUE_SEARCH_INTERVAL = 25;
const DEST_CACHE_TTL = 15;
const LOCAL_BFS_HOPS = 4;
const INTEL_REFRESH_TICKS = 150;
const MAX_EXPLORERS_PER_DEST = 1;

const EXPLORER_ANCHORS = [
    [10, 10], [40, 10], [10, 40], [40, 40],
    [25, 10], [25, 40], [10, 25], [40, 25],
    [18, 18], [32, 18], [18, 32], [32, 32],
];

let destinationCache = {};
let portalDestCache = {};
let explorerAssignTick = -1;
let explorerDestCounts = null;

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

        if (!(typeof IS_SEASON !== 'undefined' && IS_SEASON)
            && !this.creep.memory.usedPortal && this.creep.room.portals.length) {
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

        const cacheKey = this.room.name;
        const cached = destinationCache[cacheKey];
        if (cached && cached.tick + DEST_CACHE_TTL > currentTime) {
            if (this.assignDestination(cached.target, undefined, currentTime)) return;
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
                this.assignDestination(highValue, cacheKey, currentTime);
                return;
            }
        }

        const localTarget = this.findBestLocalTarget(LOCAL_BFS_HOPS);
        if (localTarget) {
            this.assignDestination(localTarget, cacheKey, currentTime);
            return;
        }

        if (this.pickAdjacentTarget()) {
            this.creep.memory.destSearchTick = currentTime;
            return;
        }

        this.creep.idleFor(3 + (creepHash(this.creep) % 8));
    }

    assignDestination(target, cacheKey, currentTime) {
        if (!target || explorerAssigned(target) >= MAX_EXPLORERS_PER_DEST) return false;
        this.creep.memory.destination = target;
        this.creep.memory.destSearchTick = currentTime;
        noteExplorerAssignment(target);
        if (cacheKey !== undefined) destinationCache[cacheKey] = {target, tick: currentTime};
        return true;
    }

    pickAdjacentTarget() {
        const exits = Game.map.describeExits(this.room.name);
        let candidates = [];

        for (const dir in exits) {
            const name = exits[dir];
            if (roomStatus(name) !== 'closed') candidates.push(name);
        }

        if (this.creep.memory.lastRoom && candidates.length > 1) {
            candidates = candidates.filter(n => n !== this.creep.memory.lastRoom);
        }
        if (!candidates.length) return false;

        const noVision = candidates.filter(n => !Game.rooms[n]);
        const pool = noVision.length ? noVision : candidates;
        const available = pool.filter(n => explorerAssigned(n) < MAX_EXPLORERS_PER_DEST);
        if (!available.length) return false;

        const target = _.min(available, n => {
            const intel = INTEL[n];
            let s = intel ? (intel.lastObservation || 0) : 0;
            s += explorerAssigned(n) * 10000;
            s += explorerScatterScore(this.creep, n);
            if (typeof IS_SEASON !== 'undefined' && IS_SEASON) {
                s -= season.roomNorthValue(n) * 30;
                if (typeof isSectorCenterRoomName === 'function' && isSectorCenterRoomName(n)) s -= 8000;
            }
            return s;
        });

        if (!target) return false;
        return this.assignDestination(target, this.room.name, Game.time);
    }

    findHighValueTarget() {
        const currentTime = Game.time;
        let best = null;
        let bestScore = Infinity;

        const idx = global.getIntelIndexes ? global.getIntelIndexes(currentTime) : {};
        const candidates = new Set([
            ...(idx.power || []),
            ...(idx.commodity || []),
            ...(idx.highways || []),
            ...(idx.threats || []),
            ...(idx.unownedSources || []),
            ...(idx.invaderCores || []),
            ...(idx.activeRemotes || [])
        ]);

        for (const roomName of candidates) {
            const intel = INTEL[roomName];
            if (!intel || intel.owner || roomStatus(roomName) === 'closed') continue;
            if (intel.lastObservation && intel.lastObservation + CREEP_LIFE_TIME > currentTime) continue;

            const assigned = explorerAssigned(roomName);
            if (assigned >= MAX_EXPLORERS_PER_DEST) continue;

            const dist = Game.map.getRoomLinearDistance(this.room.name, roomName);
            if (dist > 40) continue;

            let score = dist * 12;

            if (intel.power && intel.power > currentTime) score -= 550;
            if (intel.commodity) score -= 450;
            if (intel.threatLevel && intel.threatLevel > 1) score -= 320;
            if (intel.isHighway) score -= 180;
            if (intel.cached && intel.cached + 2500 < currentTime) score -= 120;
            if (typeof IS_SEASON !== 'undefined' && IS_SEASON) {
                if (intel.reactor) score -= 700;
                score -= season.roomNorthValue(roomName);
                if (typeof isSectorCenterRoomName === 'function' && isSectorCenterRoomName(roomName)) score -= 600;
            }

            if (!intel.cached) {
                if (dist < 15) score -= 850;
                else score -= 150;
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

                    const assigned = explorerAssigned(neighbor);
                    if (assigned >= MAX_EXPLORERS_PER_DEST) continue;

                    const intel = INTEL[neighbor];
                    let score = hop * 80;

                    if (!intel) {
                        score -= 600;
                        if (typeof IS_SEASON !== 'undefined' && IS_SEASON
                            && typeof isSectorCenterRoomName === 'function' && isSectorCenterRoomName(neighbor)) {
                            score -= 500;
                        }
                    } else {
                        const age = intel.lastObservation ? currentTime - intel.lastObservation : 99999;
                        if (age > 8000) score -= 280;
                        else if (age > 3000) score -= 120;

                        if (intel.power && intel.power > currentTime) score -= 420;
                        if (intel.commodity) score -= 350;
                        if (intel.isHighway) score -= 160;
                        if (intel.threatLevel && intel.threatLevel > 0) score -= 80;
                        if (age < 800) score += 400;
                        if (typeof IS_SEASON !== 'undefined' && IS_SEASON) {
                            if (intel.reactor) score -= 500;
                            score -= season.roomNorthValue(neighbor);
                            if (typeof isSectorCenterRoomName === 'function' && isSectorCenterRoomName(neighbor)) score -= 500;
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

    exploreRoom() {
        if (this.room) {
            const intel = INTEL[this.room.name];
            const highway = global.isHighwayRoomName && global.isHighwayRoomName(this.room.name);
            // Banks spawn on a 5k timer. A fresh lastObservation from an empty
            // look used to skip the cache and walk past a new bank.
            if (highway || !intel || !intel.lastObservation || intel.lastObservation + INTEL_REFRESH_TICKS < Game.time) {
                this.room.cacheRoomIntel();
            }
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

profiler.registerClass(RoleExplorer, 'Explorer');
module.exports = RoleExplorer;