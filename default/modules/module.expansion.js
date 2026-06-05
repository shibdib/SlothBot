/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

let _lastRun = 0;
let _lastRejectLog = 0;
let _terrainCache = {}; // Terrain is static — cache forever

function routeDistance(from, to) {
    const route = Game.map.findRoute(from, to);
    return typeof route === 'number' ? Infinity : route.length;
}

class ExpansionControl {
    constructor() {
        this.claimTarget = {};
        this.worthyRooms = [];
    }

    run() {
        if (!MY_ROOMS.length || Object.keys(INTEL).length < 15) return;
        // Expansion decisions change slowly — no need to re-evaluate every tick
        if (_lastRun + 50 > Game.time) return;
        _lastRun = Game.time;

        this.claimTarget = Memory.claimTarget || {};
        this.findClaimTarget();

        const auxiliaryTargets = Memory.auxiliaryTargets || {};
        if (this.claimTarget.room) {
            if (!this.checkForActiveClaims(auxiliaryTargets)) {
                this.claimOperation(this.claimTarget);
            }
        } else if (_lastRejectLog + 500 < Game.time && this.worthyRooms.length) {
            _lastRejectLog = Game.time;
            log.a(`No claim targets found out of ${this.worthyRooms.length} scored rooms.`, 'EXPANSION CONTROL:');
            for (const room of this.worthyRooms.slice(0, 5)) {
                log.a(`  ${roomLink(room.name)} rejected: ${room.rejectReason || 'unknown'}`, 'EXPANSION CONTROL:');
            }
        }
    }

    findClaimTarget() {
        if (this.claimTarget.room) {
            const targetIntel = INTEL[this.claimTarget.room];
            const hostileReservation = targetIntel && targetIntel.reservation &&
                targetIntel.reservation !== MY_USERNAME && targetIntel.reservation !== 'Invader';
            if (!targetIntel || targetIntel.owner || hostileReservation || this.claimTarget.tick + CREEP_LIFE_TIME < Game.time) {
                if (FORCE_CLAIM && (!INTEL[FORCE_CLAIM] || !INTEL[FORCE_CLAIM].owner)) {
                    this.claimTarget = {room: FORCE_CLAIM, tick: Game.time};
                    Memory.claimTarget = this.claimTarget;
                    return;
                }
                log.a(`Refreshing claim target. Old claim target - ${this.claimTarget.room}`, 'EXPANSION CONTROL:');
                Memory.claimTarget = {};
                this.claimTarget = {};
            } else {
                return;
            }
        }

        if (FORCE_CLAIM && (!INTEL[FORCE_CLAIM] || !INTEL[FORCE_CLAIM].owner)) {
            this.claimTarget = {room: FORCE_CLAIM, tick: Game.time};
            Memory.claimTarget = this.claimTarget;
            return;
        }

        this.filterWorthyRooms();
        if (!this.worthyRooms.length) return;

        const sameSectorRooms = this.worthyRooms.filter(room => myRoomInSectorCheck(room.name));
        if (sameSectorRooms.length) this.worthyRooms = sameSectorRooms;

        this.scoreRooms();
        const candidates = this.worthyRooms.filter(r => r.claimValue != null && r.claimValue > -Infinity);
        const max = _.max(candidates, 'claimValue');
        if (max && max.name) {
            this.claimTarget = {room: max.name, tick: Game.time};
            Memory.claimTarget = this.claimTarget;
        }
    }

    filterWorthyRooms() {
        this.worthyRooms = Object.values(INTEL).filter(room =>
            room &&
            room.hubCheck &&
            !room.owner &&
            room.cached + 10000 > Game.time &&
            (!room.noClaim || room.noClaim < Game.time) &&
            !room.obstacles &&
            (!room.reservation || room.reservation === MY_USERNAME) &&
            this.checkNeighboringRooms(room.name) &&
            findClosestOwnedRoom(room.name, true) <= 14
        );
    }

    checkNeighboringRooms(roomName) {
        const neighboring = Object.values(Game.map.describeExits(roomName));
        for (const neighbor of neighboring) {
            const intel = INTEL[neighbor];
            // Only hard-reject if we know the neighbor is owned by someone else.
            // Missing intel is not a dealbreaker — we may not have scouted every room yet.
            if (intel && intel.owner && intel.owner !== MY_USERNAME) return false;
        }
        return true;
    }

    scoreRooms() {
        // Single pass to build both lists instead of two separate filter scans
        const friendlyRooms = [];
        const enemyRooms = [];
        for (const intel of Object.values(INTEL)) {
            if (!intel.level || !intel.owner) continue;
            if (FRIENDLIES.includes(intel.owner)) friendlyRooms.push(intel);
            else if (HOSTILES.includes(intel.owner)) enemyRooms.push(intel);
        }

        for (const room of this.worthyRooms) {
            room.claimValue = this.calculateRoomScore(room, friendlyRooms, enemyRooms);
        }
    }

    calculateRoomScore(room, friendlyRooms, enemyRooms) {
        let score = 10000;
        room.rejectReason = undefined;

        if (room.failedClaim) {
            if (room.failedClaim >= 5) {
                room.rejectReason = `failedClaim=${room.failedClaim} (>=5)`;
                return undefined;
            }
            score -= room.failedClaim * 1000;
        }

        // Proximity to friendly rooms — use linear distance to skip findRoute when clearly out of range
        for (const fRoom of friendlyRooms) {
            const linearDist = Game.map.getRoomLinearDistance(room.name, fRoom.name);
            if (linearDist > 20) continue;
            const distance = routeDistance(room.name, fRoom.name);
            if (distance <= 2) {
                room.rejectReason = `friendly ${fRoom.name} too close (route dist ${distance})`;
                return undefined;
            }
            score += this.friendlyRoomScoreAdjustment(distance);
            if (AVOID_ALLIED_SECTORS && sameSectorCheck(room.name, fRoom.name)) score -= 500;
        }

        // Proximity to enemy rooms — linear distance is always <= route distance, so use it to skip
        for (const eRoom of enemyRooms) {
            const linearDist = Game.map.getRoomLinearDistance(room.name, eRoom.name);
            if (linearDist > 6) continue;
            // Only call findRoute when the enemy is close enough to matter
            const distance = linearDist <= 3
                ? routeDistance(room.name, eRoom.name)
                : linearDist;
            if (distance <= 3) score -= 10000 / distance;
            else if (distance < 6) score -= 250;
        }

        // Count accessible remote sources from neighboring rooms
        const neighboring = Object.values(Game.map.describeExits(room.name));
        let unscoutedNeighbors = 0;
        const sourceCount = neighboring.reduce((sum, r) => {
            const intel = INTEL[r];
            if (!intel) {
                unscoutedNeighbors++;
                return sum;
            } // No intel — don't fabricate sources
            if (intel.owner) return sum; // Owned room — no remote sources available
            return sum + (intel.sources || 0);
        }, 0);

        if (!sourceCount) {
            room.rejectReason = `no remote sources (neighbors=${neighboring.length}, unscouted=${unscoutedNeighbors})`;
            return undefined;
        }
        score += sourceCount * 250;

        score -= this.getSwampPenalty(room.name);

        if (!MY_MINERALS[room.mineral]) {
            score += this.getMineralBonus(room.mineral);
        } else {
            score *= 0.5;
        }

        if (myRoomInSectorCheck(room.name)) score += 7000;

        return score;
    }

    getSwampPenalty(roomName) {
        if (_terrainCache[roomName] !== undefined) return _terrainCache[roomName];
        const terrain = Game.map.getRoomTerrain(roomName);
        let penalty = 0;
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                if (terrain.get(x, y) === TERRAIN_MASK_SWAMP) penalty += 10;
            }
        }
        _terrainCache[roomName] = penalty;
        return penalty;
    }

    friendlyRoomScoreAdjustment(distance) {
        return distance === 3 ? 2000 : distance < 7 ? 100 : distance > 15 ? -Infinity : 1;
    }

    getMineralBonus(mineralType) {
        const bonusTable = {
            [RESOURCE_OXYGEN]: 1500,
            [RESOURCE_HYDROGEN]: 1500,
            [RESOURCE_LEMERGIUM]: 750,
            [RESOURCE_KEANIUM]: 500
        };
        return bonusTable[mineralType] || 200;
    }

    claimOperation(claimTarget) {
        const roomName = claimTarget.room;
        const noviceRoom = MY_ROOMS.find(r => Game.rooms[r] && roomStatus(r) === 'novice');
        const limit = noviceRoom
            ? 3
            : Memory.cpuTracking && Memory.cpuTracking.roomPenalty && Memory.cpuTracking.roomPenalty + 50000 > Game.time
                ? Game.gcl.level - 1
                : Game.gcl.level;

        if (!Memory.auxiliaryTargets) Memory.auxiliaryTargets = {};

        if (limit > MY_ROOMS.length && MAX_LEVEL >= 4 && !Memory.auxiliaryTargets[roomName]) {
            Memory.claimTarget = {};
            Memory.auxiliaryTargets[roomName] = {
                tick: Game.time,
                type: 'claim',
                priority: PRIORITIES.priority
            };
            log.a(`Claim Mission for ${roomLink(roomName)} initiated.`, 'EXPANSION CONTROL:');
        } else if (!Memory.claimTarget || Memory.claimTarget.room !== roomName) {
            log.a(`Next claim target set to ${roomLink(roomName)} once GCL allows (${MY_ROOMS.length}/${limit}).`, 'EXPANSION CONTROL:');
            Memory.claimTarget = {room: roomName, tick: Game.time};
        }
    }

    checkForActiveClaims(auxiliaryTargets) {
        if (!auxiliaryTargets) return false;
        for (const key in auxiliaryTargets) {
            const target = auxiliaryTargets[key];
            if (target && (target.type === 'rebuild' || target.type === 'claim')) return true;
        }
        return false;
    }
}

profiler.registerClass(ExpansionControl, 'ExpansionControl');
module.exports = ExpansionControl;
