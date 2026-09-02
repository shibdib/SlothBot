/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const {findRoute} = require('pathRoute');
const {canSpareCpuForRoom} = require('hcReadiness');
const season = require('module.season');

let _lastRun = 0;
let _lastRejectLog = 0;
let _terrainCache = {}; // Terrain is static — cache forever

const GREENFIELD_BORDER_BONUS = 3000;
/** How long after last active remote work we still treat a room as "ours" for claim blocking. */
const OWN_REMOTE_PROTECT_WINDOW = 1500;

function routeDistance(from, to) {
    const route = findRoute(from, to, {shortest: true});
    return Array.isArray(route) && route.length ? route.length : Infinity;
}

function isNonSelfFriendly(user) {
    return !!(user && user !== MY_USERNAME && FRIENDLIES.includes(user));
}

class ExpansionControl {
    constructor() {
        this.claimTarget = {};
        this.worthyRooms = [];
        this.roomScores = {};
    }

    run() {
        if (!MY_ROOMS.length || Object.keys(INTEL).length < 15) return;
        // Expansion decisions change slowly — no need to re-evaluate every tick
        if (_lastRun + 50 > Game.time) return;
        _lastRun = Game.time;

        this.claimTarget = Memory.claimTarget || {};
        this.purgeInvalidClaimMissions();
        this.findClaimTarget();
        this.queueExpansionScouts();

        const auxiliaryTargets = Memory.auxiliaryTargets || {};
        if (this.claimTarget.room) {
            if (!this.checkForActiveClaims(auxiliaryTargets)) {
                this.claimOperation(this.claimTarget);
            }
        } else if (_lastRejectLog + 500 < Game.time && this.worthyRooms.length) {
            _lastRejectLog = Game.time;
            log.a(`No claim targets found out of ${this.worthyRooms.length} scored rooms.`, 'EXPANSION CONTROL:');
            for (const room of this.worthyRooms.slice(0, 5)) {
                const scored = this.roomScores[room.name];
                log.a(`  ${roomLink(room.name)} rejected: ${scored?.rejectReason || 'unknown'}`, 'EXPANSION CONTROL:');
            }
        }
    }

    /**
     * Sticky claim targets must stay valid: not owned, not hostile-reserved,
     * not our remote, not an ally natural remote, and not past lifetime.
     * FORCE_CLAIM bypasses remote/ally gates (manual override).
     */
    isClaimTargetStillValid(roomName, {allowForce = false} = {}) {
        if (allowForce && FORCE_CLAIM && roomName === FORCE_CLAIM) {
            const forceIntel = INTEL[roomName];
            return !forceIntel || !forceIntel.owner;
        }

        const targetIntel = INTEL[roomName];
        if (!targetIntel) return false;
        if (targetIntel.owner) return false;

        const hostileReservation = targetIntel.reservation &&
            targetIntel.reservation !== MY_USERNAME && targetIntel.reservation !== 'Invader';
        if (hostileReservation) return false;

        if (this.claimTarget.tick != null && this.claimTarget.tick + CREEP_LIFE_TIME < Game.time) {
            return false;
        }

        const ownRemote = this.getOwnRemoteBlock(targetIntel, roomName);
        if (ownRemote) return false;

        const allyRemote = this.getAllyRemoteBlock(roomName);
        if (allyRemote) return false;

        return true;
    }

    clearClaimTarget(reason) {
        if (this.claimTarget.room) {
            log.a(`Refreshing claim target. Old claim target - ${this.claimTarget.room}${reason ? ` (${reason})` : ''}`, 'EXPANSION CONTROL:');
        }
        Memory.claimTarget = {};
        this.claimTarget = {};
    }

    /**
     * Drop queued claim/rebuild missions that violate own-remote or ally-remote rules.
     * FORCE_CLAIM rooms are left alone.
     */
    purgeInvalidClaimMissions() {
        const targets = Memory.auxiliaryTargets;
        if (!targets) return;
        for (const roomName in targets) {
            const t = targets[roomName];
            if (!t || (t.type !== 'claim' && t.type !== 'rebuild')) continue;
            if (FORCE_CLAIM && roomName === FORCE_CLAIM) continue;

            const intel = INTEL[roomName];
            if (intel && intel.owner === MY_USERNAME) continue; // already claimed — let op finish/clean

            const ownRemote = this.getOwnRemoteBlock(intel || {}, roomName);
            const allyRemote = this.getAllyRemoteBlock(roomName);
            if (!ownRemote && !allyRemote) continue;

            const reason = (ownRemote && ownRemote.rejectReason) || (allyRemote && allyRemote.rejectReason);
            log.a(`Canceling ${t.type} mission for ${roomLink(roomName)}: ${reason}`, 'EXPANSION CONTROL:');
            delete targets[roomName];
        }
    }

    findClaimTarget() {
        if (this.claimTarget.room) {
            if (this.isClaimTargetStillValid(this.claimTarget.room, {
                allowForce: !!(FORCE_CLAIM && this.claimTarget.room === FORCE_CLAIM),
            })) {
                return;
            }
            const reason = this.explainClaimInvalid(this.claimTarget.room);
            this.clearClaimTarget(reason);
        }

        if (FORCE_CLAIM && (!INTEL[FORCE_CLAIM] || !INTEL[FORCE_CLAIM].owner)) {
            this.claimTarget = {room: FORCE_CLAIM, tick: Game.time};
            Memory.claimTarget = this.claimTarget;
            return;
        }

        this.filterWorthyRooms();
        if (!this.worthyRooms.length) return;

        this.scoreRooms();
        const candidates = this.worthyRooms
            .map(room => ({room, ...this.roomScores[room.name]}))
            .filter(r => r.claimValue != null && r.claimValue > -Infinity);
        const max = _.max(candidates, 'claimValue');
        if (max && max.room) {
            this.claimTarget = {room: max.room.name, tick: Game.time};
            Memory.claimTarget = this.claimTarget;
        }
    }

    explainClaimInvalid(roomName) {
        const intel = INTEL[roomName];
        if (!intel) return 'no intel';
        if (intel.owner) return `owned by ${intel.owner}`;
        if (intel.reservation && intel.reservation !== MY_USERNAME && intel.reservation !== 'Invader') {
            return `reserved by ${intel.reservation}`;
        }
        if (this.claimTarget.tick != null && this.claimTarget.tick + CREEP_LIFE_TIME < Game.time) {
            return 'expired';
        }
        const ownRemote = this.getOwnRemoteBlock(intel, roomName);
        if (ownRemote) return ownRemote.rejectReason;
        const allyRemote = this.getAllyRemoteBlock(roomName);
        if (allyRemote) return allyRemote.rejectReason;
        return 'invalid';
    }

    filterWorthyRooms() {
        const idx = global.getIntelIndexes ? global.getIntelIndexes() : null;
        const worthy = [];
        if (idx && idx.claimCandidates) {
            for (const roomName of idx.claimCandidates) {
                const room = INTEL[roomName];
                if (!room) continue;
                if (this.checkNeighboringRooms(room.name) && findClosestOwnedRoom(room.name, true) <= 14) {
                    worthy.push(room);
                }
            }
        } else {
            for (const roomName in INTEL) {
                const room = INTEL[roomName];
                if (!room || !room.hubCheck || room.owner) continue;
                if (room.cached + 10000 <= Game.time) continue;
                if (room.noClaim && room.noClaim >= Game.time) continue;
                if (room.obstacles) continue;
                if (room.reservation && room.reservation !== MY_USERNAME) continue;
                if (this.checkNeighboringRooms(room.name) && findClosestOwnedRoom(room.name, true) <= 14) {
                    worthy.push(room);
                }
            }
        }
        this.worthyRooms = worthy;
    }

    checkNeighboringRooms(roomName) {
        const neighboring = Object.values(Game.map.describeExits(roomName));
        for (const neighbor of neighboring) {
            const intel = INTEL[neighbor];
            if (!intel) continue;
            if (intel.owner && HOSTILES.includes(intel.owner)) return false;
            if (intel.reservation && intel.reservation !== MY_USERNAME && intel.reservation !== 'Invader') return false;
        }
        return true;
    }

    clearExpansionIntelFields() {
        const cleared = new Set();
        const clearIntel = (intel) => {
            if (!intel?.name || cleared.has(intel.name)) return;
            cleared.add(intel.name);
            delete intel.claimValue;
            delete intel.rejectReason;
        };

        for (const room of this.worthyRooms) clearIntel(room);

        const idx = global.getIntelIndexes ? global.getIntelIndexes() : null;
        if (idx && idx.claimCandidates) {
            for (const roomName of idx.claimCandidates) clearIntel(INTEL[roomName]);
            return;
        }
        for (const intel of Object.values(INTEL)) clearIntel(intel);
    }

    collectOwnedRoomsByAffiliation(idx) {
        const friendlyRooms = [];
        const enemyRooms = [];
        for (let i = 0; i < FRIENDLIES.length; i++) {
            const rooms = idx.byOwner[FRIENDLIES[i]];
            if (!rooms) continue;
            for (let j = 0; j < rooms.length; j++) {
                const intel = rooms[j];
                if (intel?.level && intel.owner) friendlyRooms.push(intel);
            }
        }
        for (let i = 0; i < HOSTILES.length; i++) {
            const rooms = idx.byOwner[HOSTILES[i]];
            if (!rooms) continue;
            for (let j = 0; j < rooms.length; j++) {
                const intel = rooms[j];
                if (intel?.level && intel.owner) enemyRooms.push(intel);
            }
        }
        return {friendlyRooms, enemyRooms};
    }

    scoreRooms() {
        this.roomScores = {};
        this.clearExpansionIntelFields();

        const idx = global.getIntelIndexes ? global.getIntelIndexes() : null;
        let friendlyRooms = [];
        let enemyRooms = [];
        if (idx && idx.byOwner) {
            ({friendlyRooms, enemyRooms} = this.collectOwnedRoomsByAffiliation(idx));
        } else {
            for (const intel of Object.values(INTEL)) {
                if (!intel || !intel.level || !intel.owner) continue;
                if (FRIENDLIES.includes(intel.owner)) friendlyRooms.push(intel);
                else if (HOSTILES.includes(intel.owner)) enemyRooms.push(intel);
            }
        }

        for (const room of this.worthyRooms) {
            this.roomScores[room.name] = this.calculateRoomScore(room, friendlyRooms, enemyRooms);
        }
    }

    /**
     * Colonies that currently (or very recently) treat this room as a remote.
     * Uses live ROOM_REMOTE_TARGETS plus recently-active remoteRoom parents.
     * Does NOT use bare remoteRoom alone — that list is never pruned and
     * includes probed-but-unmined rooms.
     * @param {object} room - intel object
     * @param {string} [roomName] - fallback when intel.name is missing
     */
    getOwnRemoteParents(room, roomName) {
        const name = (room && room.name) || roomName;
        const parents = new Set();

        if (name) {
            const targets = global.ROOM_REMOTE_TARGETS;
            if (targets) {
                for (let i = 0; i < MY_ROOMS.length; i++) {
                    const colony = MY_ROOMS[i];
                    const list = targets[colony];
                    if (!list || !list.length) continue;
                    for (let j = 0; j < list.length; j++) {
                        if (list[j] && list[j].room === name) {
                            parents.add(colony);
                            break;
                        }
                    }
                }
            }
        }

        // Recently worked remote (activeRemote is vision-backed; keep a full creep lifetime)
        const activeAt = room && room.activeRemote;
        if (activeAt && activeAt + OWN_REMOTE_PROTECT_WINDOW > Game.time) {
            const fromIntel = room.remoteRoom || [];
            for (let i = 0; i < fromIntel.length; i++) {
                if (MY_ROOMS.includes(fromIntel[i])) parents.add(fromIntel[i]);
            }
        }

        // Live remote workforce still assigned here (covers global-reset gaps in ROOM_REMOTE_TARGETS)
        if (name) {
            const acc = (c) => {
                if (!c.my || c.memory.destination !== name) return;
                const role = c.memory.role;
                if (role !== 'remoteHarvester' && role !== 'reserver' && role !== 'remoteHauler' &&
                    role !== 'remoteBuilder' && role !== 'roadBuilder') return;
                const colony = c.memory.colony;
                if (colony && MY_ROOMS.includes(colony)) parents.add(colony);
            };
            const grouped = global.world && global.world.colonyCreeps;
            if (grouped) {
                for (const colonyName in grouped) {
                    const list = grouped[colonyName];
                    for (let i = 0; i < list.length; i++) acc(list[i]);
                }
            } else {
                for (const creepName in Game.creeps) acc(Game.creeps[creepName]);
            }
        }

        return [...parents];
    }

    /** Hard block: never claim rooms we already mine as remotes. */
    getOwnRemoteBlock(room, roomName) {
        if (!room && !roomName) return null;
        const parents = this.getOwnRemoteParents(room || {}, roomName || (room && room.name));
        if (!parents.length) return null;
        return {
            rejectReason: `owned remote of ${parents.join(',')}`,
            remoteClaim: `owned remote of ${parents.join(',')}`,
        };
    }

    /**
     * Hard block: rooms that are natural remotes of FRIENDLIES (exit neighbor
     * owned or reserved by a non-self friendly). Does not use activeRemote.
     */
    getAllyRemoteBlock(roomName) {
        const exits = Object.values(Game.map.describeExits(roomName) || {});
        for (let i = 0; i < exits.length; i++) {
            const neighbor = exits[i];
            const intel = INTEL[neighbor];
            if (!intel) continue;

            if (isNonSelfFriendly(intel.owner)) {
                return {
                    rejectReason: `ally ${intel.owner} remote of ${neighbor}`,
                    remoteClaim: `ally remote of ${neighbor} (${intel.owner})`,
                };
            }
            if (isNonSelfFriendly(intel.reservation)) {
                return {
                    rejectReason: `ally ${intel.reservation} reserved neighbor ${neighbor}`,
                    remoteClaim: `ally reserved neighbor ${neighbor} (${intel.reservation})`,
                };
            }
        }
        return null;
    }

    calculateRoomScore(room, friendlyRooms, enemyRooms) {
        let score = 10000;

        if (room.failedClaim) {
            if (room.failedClaim >= 5) {
                return {rejectReason: `failedClaim=${room.failedClaim} (>=5)`};
            }
            score -= room.failedClaim * 1000;
        }

        const ownRemote = this.getOwnRemoteBlock(room, room.name);
        if (ownRemote) {
            return {
                rejectReason: ownRemote.rejectReason,
                remoteClaim: ownRemote.remoteClaim,
            };
        }

        const allyRemote = this.getAllyRemoteBlock(room.name);
        if (allyRemote) {
            return {
                rejectReason: allyRemote.rejectReason,
                remoteClaim: allyRemote.remoteClaim,
            };
        }

        // Proximity to owned vs allied rooms — border claims (dist 1–2 to our rooms) are desired
        let closestOwn = Infinity;
        let closestOwnRoom;
        let closestAlly = Infinity;
        let closestAllyRoom;
        for (const fRoom of friendlyRooms) {
            const linearDist = Game.map.getRoomLinearDistance(room.name, fRoom.name);
            if (linearDist > 20) continue;
            const distance = routeDistance(room.name, fRoom.name);
            const isMine = fRoom.owner === MY_USERNAME;
            if (isMine) {
                if (distance < closestOwn) {
                    closestOwn = distance;
                    closestOwnRoom = fRoom.name;
                }
            } else if (distance < closestAlly) {
                closestAlly = distance;
                closestAllyRoom = fRoom.name;
            }
        }

        if (closestAlly <= 2) {
            return {rejectReason: `ally ${closestAllyRoom} too close (route dist ${closestAlly})`};
        }

        if (closestOwn === Infinity) {
            return {rejectReason: 'no owned room within 20 linear tiles'};
        }

        if (closestOwn <= 2) {
            score += GREENFIELD_BORDER_BONUS;
        } else {
            const ownAdjust = this.friendlyRoomScoreAdjustment(closestOwn);
            if (!Number.isFinite(ownAdjust)) {
                return {rejectReason: `owned ${closestOwnRoom} too far (route dist ${closestOwn})`};
            }
            score += ownAdjust;
        }

        if (AVOID_ALLIED_SECTORS && closestAllyRoom && closestAlly <= 6 && sameSectorCheck(room.name, closestAllyRoom)) {
            score -= 500;
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
            }
            if (intel.owner) return sum;
            // Do not count ally-held neighbors as expansion "remote source" value
            if (isNonSelfFriendly(intel.reservation)) return sum;
            return sum + (intel.sources || 0);
        }, room.sources || 0);

        if (!sourceCount) {
            return {
                rejectReason: `no remote sources (neighbors=${neighboring.length}, unscouted=${unscoutedNeighbors})`,
            };
        }
        score += sourceCount * 250;

        score -= this.getSwampPenalty(room.name);

        if (!MY_MINERALS[room.mineral]) {
            score += this.getMineralBonus(room.mineral);
        } else {
            score *= 0.5;
        }

        if (typeof IS_SEASON !== 'undefined' && IS_SEASON) {
            score += season.roomNorthValue(room.name) * 150;
            const thoriumAmt = room.thoriumAmount || (room.mineral === RESOURCE_THORIUM ? room.mineralAmount : 0) || 0;
            if (thoriumAmt > 0) score += Math.min(thoriumAmt / 10, 4000);
            else score -= 2000;
        }

        if (myRoomInSectorCheck(room.name)) score += 7000;

        return {claimValue: score};
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

        // Final gate before launching (skip remote/ally gates only for FORCE_CLAIM)
        if (!(FORCE_CLAIM && roomName === FORCE_CLAIM)) {
            const intel = INTEL[roomName];
            const ownRemote = this.getOwnRemoteBlock(intel || {}, roomName);
            if (ownRemote) {
                this.clearClaimTarget(ownRemote.rejectReason);
                return;
            }
            const allyRemote = this.getAllyRemoteBlock(roomName);
            if (allyRemote) {
                this.clearClaimTarget(allyRemote.rejectReason);
                return;
            }
        }

        const noviceRoom = MY_ROOMS.find(r => Game.rooms[r] && roomStatus(r) === 'novice');
        const limit = noviceRoom
            ? 3
            : Memory.cpuTracking && Memory.cpuTracking.roomPenalty && Memory.cpuTracking.roomPenalty + 50000 > Game.time
                ? Game.gcl.level - 1
                : Game.gcl.level;

        if (!Memory.auxiliaryTargets) Memory.auxiliaryTargets = {};

        const forceClaim = !!(FORCE_CLAIM && roomName === FORCE_CLAIM);
        const cpu = forceClaim ? {ok: true} : canSpareCpuForRoom();

        if (limit > MY_ROOMS.length && MAX_LEVEL >= 4 && !Memory.auxiliaryTargets[roomName] && cpu.ok) {
            Memory.claimTarget = {};
            Memory.auxiliaryTargets[roomName] = {
                tick: Game.time,
                type: 'claim',
                priority: PRIORITIES.priority
            };
            log.a(`Claim Mission for ${roomLink(roomName)} initiated.`, 'EXPANSION CONTROL:');
        } else if (!cpu.ok) {
            if (_lastRejectLog + 500 < Game.time) {
                _lastRejectLog = Game.time;
                log.a(`Holding claim of ${roomLink(roomName)} — no CPU spare for another room (${cpu.reason}).`, 'EXPANSION CONTROL:');
            }
            if (!Memory.claimTarget || Memory.claimTarget.room !== roomName) {
                Memory.claimTarget = {room: roomName, tick: Game.time};
            }
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

    auditExpansion() {
        const idx = global.getIntelIndexes ? global.getIntelIndexes() : null;
        const candidateNames = idx && idx.claimCandidates
            ? [...idx.claimCandidates]
            : Object.keys(INTEL).filter((name) => {
                const room = INTEL[name];
                return room && room.hubCheck && !room.owner && (!room.cached || room.cached + 10000 > Game.time);
            });

        const worthyReject = {};
        const worthy = [];
        for (const roomName of candidateNames) {
            const room = INTEL[roomName];
            if (!room) continue;
            if (!this.checkNeighboringRooms(room.name)) {
                worthyReject.neighboringCheck = (worthyReject.neighboringCheck || 0) + 1;
                continue;
            }
            if (findClosestOwnedRoom(room.name, true) > 14) {
                worthyReject.tooFar = (worthyReject.tooFar || 0) + 1;
                continue;
            }
            worthy.push(room);
        }

        this.worthyRooms = worthy;
        this.scoreRooms();

        const scored = [];
        const scoreRejected = [];
        for (const room of worthy) {
            const scoredRoom = this.roomScores[room.name];
            if (scoredRoom && scoredRoom.claimValue != null && scoredRoom.claimValue > -Infinity) {
                const entry = {room: room.name, claimValue: scoredRoom.claimValue};
                if (scoredRoom.remoteClaim) entry.remoteClaim = scoredRoom.remoteClaim;
                scored.push(entry);
            } else {
                let reason = scoredRoom?.rejectReason;
                if (!reason && scoredRoom?.claimValue != null && !Number.isFinite(scoredRoom.claimValue)) {
                    reason = 'score not finite';
                }
                const rejected = {room: room.name, reason: reason || 'unknown', claimValue: scoredRoom?.claimValue};
                if (scoredRoom?.remoteClaim) rejected.remoteClaim = scoredRoom.remoteClaim;
                scoreRejected.push(rejected);
            }
        }
        scored.sort((a, b) => b.claimValue - a.claimValue);

        const limit = Game.gcl.level;
        const cpu = canSpareCpuForRoom();
        return {
            claimTarget: Memory.claimTarget,
            cpu: {ok: cpu.ok, reason: cpu.reason || null, avg: cpu.avg, spare: cpu.spare, need: cpu.need},
            gcl: {owned: MY_ROOMS.length, level: Game.gcl.level, claimSlots: limit},
            funnel: {
                claimCandidates: candidateNames.length,
                worthy: worthy.length,
                worthyReject,
                scored: scored.length,
                scoreRejected: scoreRejected.length,
            },
            topScored: scored.slice(0, 8),
            topRejected: scoreRejected.slice(0, 10),
        };
    }

    queueExpansionScouts() {
        const candidates = [];
        const stale = (name) => {
            const intel = INTEL[name];
            return !intel || !intel.hubCheck || intel.cached + 10000 <= Game.time;
        };

        if (this.claimTarget.room) {
            candidates.push(this.claimTarget.room);
            for (const n of Object.values(Game.map.describeExits(this.claimTarget.room) || {})) candidates.push(n);
        }
        for (const room of this.worthyRooms.slice(0, 8)) {
            if (stale(room.name)) candidates.push(room.name);
        }

        const unique = [...new Set(candidates)].filter(stale).slice(0, 5);
        const prev = Memory.expansionScoutRooms;
        if (!prev || prev.length !== unique.length || unique.some((r, i) => prev[i] !== r)) {
            Memory.expansionScoutRooms = unique;
        }
        if (!unique.length) return;
        if (!Memory.auxiliaryTargets) Memory.auxiliaryTargets = {};
        for (const roomName of unique) {
            const existing = Memory.auxiliaryTargets[roomName];
            if (existing && (existing.type === 'claim' || existing.type === 'rebuild')) continue;
            if (!existing || existing.type !== 'scout') {
                Memory.auxiliaryTargets[roomName] = {
                    tick: Game.time,
                    type: 'scout',
                    priority: PRIORITIES.priority,
                };
            }
        }
    }
}

profiler.registerClass(ExpansionControl, 'ExpansionControl');
module.exports = ExpansionControl;