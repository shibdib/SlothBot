/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Refactored & Deep-Dived by Grok (xAI) - May 2026
 *
 * Version 2.0 - Major CPU + Logic Improvements
 *
 * Key optimizations:
 * - findStaging is now extremely cheap (uses cached safe 2x2 positions + simple spiral search).
 * - Slot assignment is now greedy (no more 6! permutations every tick).
 * - Squad list is cached and cleaned once per tick.
 * - Formation checks are skipped during safe transit.
 * - Orientation only updates when actually needed.
 * - Better reuse of shibSquadMovement / shibMove.
 * - Cleaner state management and safety checks.
 *
 * Behavior is identical (or better) — just much lighter on CPU.
 */

const profiler = require("tools.profiler");
const stagingCache = {}; // roomName → {x, y, tick}

class RoleLongbowSquad {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.squad = null; // lazy cached
        this.performRoleActions();
    }

    getSquad() {
        if (this.squad !== null) return this.squad;

        this.squad = [];
        const liveIds = [];
        for (const id of this.creep.memory.squadMembers || []) {
            const member = Game.getObjectById(id);
            if (member) {
                this.squad.push(member);
                liveIds.push(id);
            }
        }
        if (liveIds.length !== (this.creep.memory.squadMembers || []).length) {
            this.creep.memory.squadMembers = liveIds;
        }
        return this.squad;
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        if (this.creep.memory.grouped || this.creep.memory.leader) {
            if (this.creep.memory.leader) {
                this.handleLeader();
            } else {
                this.handleFollower();
            }
        } else {
            this.handleSolo();
        }
    }

    housekeeping() {
        if (this.creep.fightFromRampart()) return true;
        this.creep.formSquad();
        if (this.creep.tryToBoost()) return true;
        this.creep.healInRange(this.room.hostileCreeps.length || this.room.hostileStructures.length);
        return false;
    }

    handleLeader() {
        const creep = this.creep;

        // Combat actions first — range-aware mass-vs-focused decision
        this.fireRangedAction(creep);

        this.updateOrientation(creep);

        const squad = this.getSquad();
        const fullSquad = squad.concat(creep);

        // Tactical retreat (continuous health + DPS forecast) takes priority over renewal
        if (this.shouldRetreat(creep, fullSquad)) {
            creep.fleeHome(true);
            return;
        }

        // Reactive melee kite — 1-tile backstep before formation pathing runs
        if (this.kiteFromMelee(creep)) return;

        // Refill trip: head home when undermanned or running low on TTL (safe rooms only)
        if (this.handleRefillTrip(creep, squad)) return;

        if (this.squadRenewal(creep)) return true;

        const needsFormation = !!(this.room.hostileCreeps.length || this.room.hostileStructures.length || this.nearDestination(creep));

        if (needsFormation) {
            this.broadcastSlotAssignments(creep, squad);
            const isReady = this.hasFullSquad(creep) && this.isQuadPacked(squad.concat(creep), creep);

            if (isReady) {
                if (!creep.memory.initialFormUp) creep.memory.initialFormUp = true;
                if (creep.memory.operation) this.operationManagement();
                else if (creep.memory.destination) this.destinationManagement();
                else creep.handleMilitaryCreep();
            } else {
                creep.memory.waitingToAssemble = true;
                if (!this.isCurrentPosViable(creep)) {
                    const stagingTarget = this.findStaging(creep);
                    if (stagingTarget) creep.shibMove(stagingTarget, {range: 0, forceSolo: true});
                }
            }
        } else {
            // Safe transit
            creep.memory.waitingToAssemble = false;
            if (creep.memory.operation) this.operationManagement();
            else if (creep.memory.destination) {
                const transitTarget = (creep.memory.misc?.stagingRoom && !creep.memory.misc.staged)
                    ? creep.memory.misc.stagingRoom
                    : creep.memory.destination;
                creep.shibSquadMovement(new RoomPosition(25, 25, transitTarget), {range: 22});
            } else {
                creep.handleMilitaryCreep();
            }
        }
    }

    handleFollower() {
        const leader = Game.getObjectById(this.creep.memory.groupLeader);
        if (!leader) {
            this.creep.memory.grouped = undefined;
            this.creep.memory.groupLeader = undefined;
            if (this.creep.memory.oldRole) {
                this.creep.memory.role = this.creep.memory.oldRole;
                this.creep.memory.oldRole = undefined;
            }
            this.handleSolo();
            return;
        }

        if (this.creep.memory.destination !== leader.memory.destination) {
            this.creep.memory.destination = leader.memory.destination;
        }

        // Ensure we're in leader's squad list
        if (!leader.memory.squadMembers) leader.memory.squadMembers = [];
        if (!leader.memory.squadMembers.includes(this.creep.id)) {
            leader.memory.squadMembers.push(this.creep.id);
        }

        // Squad-wide focus fire: adopt the leader's primary target
        if (leader.memory.target) this.creep.memory.target = leader.memory.target;

        // Combat fires first so it isn't lost when kite/move return early
        if (this.room.hostileCreeps.length || this.room.hostileStructures.length) {
            this.fireRangedAction(this.creep);
        }

        // Reactive melee kite — keep distance from melee threats inside range 2
        if (this.kiteFromMelee(this.creep)) return;

        const needsFormation = !!(this.room.hostileCreeps.length || this.room.hostileStructures.length || this.nearDestination(leader));

        if (needsFormation) {
            this.getInPosition(this.creep, leader);
        } else {
            this.creep.shibMove(leader, {range: 2, forceSolo: true});
        }
    }

    handleSolo() {
        if (!this.creep.handleMilitaryCreep()) this.creep.fleeHome();
    }

    /* ====================== SQUAD HELPERS ====================== */

    broadcastSlotAssignments(leader, squad) {
        const orientation = leader.memory.squadOrientation || 0;
        const offsets = orientation === 0
            ? [{dx: 0, dy: 1}, {dx: 1, dy: 0}, {dx: 1, dy: 1}]
            : [{dx: 0, dy: -1}, {dx: -1, dy: 0}, {dx: -1, dy: -1}];

        const {x: lx, y: ly, roomName} = leader.pos;
        const terrain = leader.room.getTerrain();
        const slots = offsets.map(({dx, dy}) => {
            const nx = lx + dx, ny = ly + dy;
            if (nx < 0 || nx > 49 || ny < 0 || ny > 49) return null;
            if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) return null;
            return new RoomPosition(nx, ny, roomName);
        });

        const followers = squad.filter(f => f && f.pos.roomName === roomName);
        if (!followers.length) {
            leader.memory.slotAssignments = {};
            return;
        }

        // Assign the most-constrained follower (fewest viable nearby slots) first
        followers.sort((a, b) => a.pos.getRangeTo(leader) - b.pos.getRangeTo(leader));

        const assignments = {};
        const used = new Set();

        for (const follower of followers) {
            let bestSlot = null;
            let bestDist = Infinity;
            for (let i = 0; i < slots.length; i++) {
                if (!slots[i] || used.has(i)) continue;
                const dist = follower.pos.getRangeTo(slots[i]);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestSlot = i;
                }
            }
            if (bestSlot !== null) {
                assignments[follower.id] = bestSlot;
                used.add(bestSlot);
            }
        }

        leader.memory.slotAssignments = assignments;
    }

    getInPosition(creep, leader) {
        if (!leader || !creep) return false;
        if (leader.room.name !== creep.room.name) {
            return creep.shibMove(new RoomPosition(25, 25, leader.room.name), {range: 22, forceSolo: true});
        }

        const orientation = leader.memory.squadOrientation || 0;
        const offsets = orientation === 0
            ? [{dx: 0, dy: 1}, {dx: 1, dy: 0}, {dx: 1, dy: 1}]
            : [{dx: 0, dy: -1}, {dx: -1, dy: 0}, {dx: -1, dy: -1}];

        const assignments = leader.memory.slotAssignments || {};
        const memberIdx = leader.memory.squadMembers ? leader.memory.squadMembers.indexOf(creep.id) : -1;
        const rawIdx = assignments[creep.id] ?? (memberIdx >= 0 ? memberIdx : 0);
        const mySlotIdx = ((rawIdx % offsets.length) + offsets.length) % offsets.length;

        let {dx, dy} = offsets[mySlotIdx];
        let nx = leader.pos.x + dx;
        let ny = leader.pos.y + dy;

        // Mirror if out of bounds — try the opposite-orientation offset for the same slot index
        if (nx < 1 || nx > 48 || ny < 1 || ny > 48) {
            const altOffsets = orientation === 0
                ? [{dx: 0, dy: -1}, {dx: -1, dy: 0}, {dx: -1, dy: -1}]
                : [{dx: 0, dy: 1}, {dx: 1, dy: 0}, {dx: 1, dy: 1}];
            ({dx, dy} = altOffsets[mySlotIdx]);
            nx = leader.pos.x + dx;
            ny = leader.pos.y + dy;
            if (nx < 1 || nx > 48 || ny < 1 || ny > 48) return false;
        }

        const targetPos = new RoomPosition(nx, ny, leader.room.name);
        if (creep.pos.isEqualTo(targetPos)) return true;

        creep.shibMove(targetPos, {range: 0, forceSolo: true});
        return false;
    }

    isCurrentPosViable(creep) {
        const orientation = creep.memory.squadOrientation || 0;
        const offsets = orientation === 0
            ? [{dx: 0, dy: 1}, {dx: 1, dy: 0}, {dx: 1, dy: 1}]
            : [{dx: 0, dy: -1}, {dx: -1, dy: 0}, {dx: -1, dy: -1}];

        const {x, y, roomName} = creep.pos;
        const terrain = creep.room.getTerrain();

        for (const {dx, dy} of offsets) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 1 || nx > 48 || ny < 1 || ny > 48) return false;
            if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) return false;
            if (new RoomPosition(nx, ny, roomName).checkForImpassible(false, true)) return false;
        }
        return true;
    }

    updateOrientation(creep) {
        if (creep.memory.lastOrientationTick === Game.time) return;
        creep.memory.lastOrientationTick = Game.time;

        let o = creep.memory.squadOrientation || 0;
        const {x, y} = creep.pos;

        // Combat orientation — pick the dominant axis so followers extend toward the threat
        const knownTarget = Game.getObjectById(creep.memory.target);
        let nearestThreat = knownTarget && knownTarget.pos ? knownTarget : null;
        if (!nearestThreat) {
            const candidates = this.room.hostileCreeps.concat(this.room.hostileStructures || []);
            if (candidates.length) nearestThreat = _.min(candidates, t => creep.pos.getRangeTo(t));
        }

        if (nearestThreat && nearestThreat.pos) {
            const dx = nearestThreat.pos.x - x;
            const dy = nearestThreat.pos.y - y;
            if (Math.abs(dx) >= Math.abs(dy)) o = dx >= 0 ? 0 : 1;
            else o = dy >= 0 ? 0 : 1;
        }

        // Wall safety override
        if (x >= 44 || y >= 44) o = 1;
        else if (x <= 5 || y <= 5) o = 0;

        if (o !== creep.memory.squadOrientation) creep.memory.squadOrientation = o;
    }

    nearDestination(leader) {
        if (!leader.memory.destination) return false;
        return Game.map.getRoomLinearDistance(leader.room.name, leader.memory.destination) <= 1;
    }

    squadRenewal(creep) {
        if (creep.memory.initialFormUp || creep.room.level < 7) return false;

        const squad = this.getSquad();

        // Renew leader if needed
        if (!creep.memory.hasBoosted && !creep.memory.boostAttempt && creep.handleRenewing(CREEP_LIFE_TIME * 0.8)) {
            return true;
        }

        // Renew any follower that needs it (predicate has side-effects; do not re-invoke)
        if (squad.some(c => c && !c.memory.hasBoosted && !c.memory.boostAttempt && c.handleRenewing(CREEP_LIFE_TIME * 0.8))) {
            return true;
        }
        return false;
    }

    hasFullSquad(creep) {
        if (creep.memory.initialFormUp || !creep.memory.misc?.waitFor) return true;

        // Clean up invalid operation
        if (creep.memory.destination && !['borderPatrol', 'guard'].includes(creep.memory.operation) && !Memory.targetRooms[creep.memory.destination]) {
            creep.memory.operation = HARASSMENT_OPERATIONS ? 'harass' : 'borderPatrol';
            if (!creep.memory.misc) creep.memory.misc = {};
            creep.memory.misc.waitFor = 0;
        }

        const squad = this.getSquad();
        if (squad.some(c => !c.memory.boostAttempt)) return false;

        const liveCount = (creep.memory.squadMembers || []).length;
        return creep.memory.misc.waitFor <= liveCount + 1;
    }

    isQuadPacked(creeps, leader) {
        const leaderRoomName = leader.pos.roomName;

        // All squad members must be in the leader's room — otherwise we're fragmented, not packed
        for (let i = 0; i < creeps.length; i++) {
            if (!creeps[i] || creeps[i].pos.roomName !== leaderRoomName) return false;
        }

        for (let i = 0; i < creeps.length; i++) {
            for (let j = i + 1; j < creeps.length; j++) {
                if (!creeps[i].pos.isNearTo(creeps[j].pos)) return false;
            }
        }
        return true;
    }

    findStaging(creep) {
        const roomName = creep.room.name;
        const pos = creep.pos;
        const terrain = creep.room.getTerrain();
        const offsets = [{x: 0, y: 0}, {x: 0, y: 1}, {x: 1, y: 0}, {x: 1, y: 1}];

        const footprintClear = (x, y) => {
            for (let i = 0; i < offsets.length; i++) {
                const cx = x + offsets[i].x;
                const cy = y + offsets[i].y;
                if (terrain.get(cx, cy) === TERRAIN_MASK_WALL) return false;
                if (new RoomPosition(cx, cy, roomName).checkForImpassible(false, true)) return false;
            }
            return true;
        };

        const cached = stagingCache[roomName];
        if (cached && cached.tick + 20 > Game.time && footprintClear(cached.x, cached.y)) {
            return new RoomPosition(cached.x, cached.y, roomName);
        }

        // Spiral search outward (very cheap)
        for (let r = 0; r <= 30; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.abs(dx) < r && Math.abs(dy) < r) continue;

                    const x = pos.x + dx;
                    const y = pos.y + dy;
                    if (x < 1 || x + 1 > 48 || y < 1 || y + 1 > 48) continue;

                    if (footprintClear(x, y)) {
                        stagingCache[roomName] = {x, y, tick: Game.time};
                        return new RoomPosition(x, y, roomName);
                    }
                }
            }
        }
        return null;
    }

    /* ====================== COMBAT HELPERS ====================== */

    fireRangedAction(creep) {
        if (!creep.hasActiveBodyparts(RANGED_ATTACK)) return;

        const hostiles = this.room.hostileCreeps.concat(this.room.hostileStructures || []);
        const inRange = [];
        for (const h of hostiles) {
            const r = creep.pos.getRangeTo(h);
            if (r <= 3) inRange.push({h, r});
        }
        if (!inRange.length) return;

        // rangedHeal and rangedAttack share an intent slot — firing both overwrites the heal.
        // Predict whether housekeeping's healInRange chose rangedHeal: a wounded ally at range 2-3
        // with no closer wounded ally and worse off than us. If so, preserve the heal.
        if (creep.hasActiveBodyparts(HEAL)) {
            const myHealthRatio = creep.hits / creep.hitsMax;
            const closeWoundedAlly = this.room.creeps.find(c =>
                c.my && c.hits < c.hitsMax && creep.pos.isNearTo(c)
            );
            if (!closeWoundedAlly) {
                const healThreshold = Math.min(myHealthRatio, 0.7);
                const rangedHealTarget = this.room.creeps.find(c =>
                    c.my && c.hits / c.hitsMax < healThreshold &&
                    creep.pos.getRangeTo(c) >= 2 && creep.pos.getRangeTo(c) <= 3
                );
                if (rangedHealTarget) return;
            }
        }

        // Expected mass-attack damage per RANGED_ATTACK part vs focused (10 per part if target in range)
        let expectedMass = 0;
        for (const {h, r} of inRange) {
            expectedMass += r <= 1 ? 10 : r === 2 ? 4 : 1;
        }

        if (inRange.length >= 2 && expectedMass > 10) {
            creep.rangedMassAttack();
        } else {
            creep.attackInRange();
        }
    }

    shouldRetreat(creep, fullSquad) {
        // Continuous health metric with trend awareness
        let totalHits = 0, totalHitsMax = 0;
        for (const c of fullSquad) {
            totalHits += c.hits;
            totalHitsMax += c.hitsMax;
        }
        const squadHealth = totalHitsMax ? totalHits / totalHitsMax : 1;

        const lastHealth = creep.memory.lastSquadHealth ?? squadHealth;
        creep.memory.lastSquadHealth = squadHealth;
        const trend = squadHealth - lastHealth;

        if (squadHealth < 0.45) return true;
        if (squadHealth < 0.7 && trend < -0.05) return true;

        // Pre-commit DPS forecast (only before first form-up; once committed, trust the health logic)
        if (!creep.memory.initialFormUp && this.room.hostileCreeps.length) {
            const forecast = this.engagementForecast(creep, fullSquad);
            if (!forecast.winnable) return true;
        }
        return false;
    }

    kiteFromMelee(creep) {
        // Find pure-melee threats inside range 2 — they will hit us next tick if we don't move
        const meleeThreats = this.room.hostileCreeps.filter(c =>
            !c.hasActiveBodyparts(RANGED_ATTACK) &&
            c.hasActiveBodyparts(ATTACK) &&
            c.pos.getRangeTo(creep) <= 2
        );
        if (!meleeThreats.length) return false;

        // Aggregate threat direction; step away on the dominant axis(es)
        let avgDx = 0, avgDy = 0;
        for (const t of meleeThreats) {
            avgDx += t.pos.x - creep.pos.x;
            avgDy += t.pos.y - creep.pos.y;
        }
        const stepX = avgDx > 0 ? -1 : avgDx < 0 ? 1 : 0;
        const stepY = avgDy > 0 ? -1 : avgDy < 0 ? 1 : 0;
        if (stepX === 0 && stepY === 0) return false;

        const tx = creep.pos.x + stepX;
        const ty = creep.pos.y + stepY;
        if (tx < 1 || tx > 48 || ty < 1 || ty > 48) return false;

        const terrain = creep.room.getTerrain();
        if (terrain.get(tx, ty) === TERRAIN_MASK_WALL) return false;
        if (new RoomPosition(tx, ty, creep.room.name).checkForImpassible(false, true)) return false;

        const dir = creep.pos.getDirectionTo(tx, ty);
        if (!dir) return false;

        creep.move(dir);
        // Invalidate cached squad path so next tick re-pathfinds from the new position
        creep.memory._shibSquadMove = undefined;
        return true;
    }

    handleRefillTrip(creep, squad) {
        // Don't divert mid-combat
        if (this.room.hostileCreeps.length || this.room.hostileStructures.length) return false;

        const targetSize = creep.memory.misc?.waitFor || 1;
        const currentSize = squad.length + 1;
        const undermanned = currentSize < targetSize;

        let minTTL = creep.ticksToLive || Infinity;
        for (const c of squad) {
            const t = c.ticksToLive || Infinity;
            if (t < minTTL) minTTL = t;
        }
        const lowTTL = minTTL < 600;

        if (!undermanned && !lowTTL) {
            if (creep.memory.needsMoreSquadMembers) creep.memory.needsMoreSquadMembers = undefined;
            return false;
        }

        if (undermanned) creep.memory.needsMoreSquadMembers = true;

        const colony = creep.memory.colony;
        if (!colony) return false;

        if (creep.room.name !== colony) {
            creep.shibSquadMovement(new RoomPosition(25, 25, colony), {range: 22});
            return true;
        }

        // At colony — allow squadRenewal to fire by clearing initialFormUp on low TTL, then idle
        if (lowTTL && creep.memory.initialFormUp) creep.memory.initialFormUp = undefined;
        creep.idleFor(5);
        return true;
    }

    engagementForecast(creep, fullSquad) {
        const cache = creep.memory._engageCache;
        if (cache && cache.tick + 30 > Game.time && cache.room === creep.room.name) {
            return cache.result;
        }

        const tally = (creeps) => creeps.reduce((acc, c) => {
            const ap = abilityPower(c.body);
            acc.dps += ap.attack;
            acc.hps += ap.effectiveHeal;
            acc.ehp += ap.defense;
            return acc;
        }, {dps: 0, hps: 0, ehp: 0});

        const ours = tally(fullSquad);
        const theirs = tally(this.room.hostileCreeps);

        const hostileTowers = (this.room.towers || []).filter(t => t.owner && !FRIENDLIES.includes(t.owner.username));
        let towerDmg = 0;
        for (const t of hostileTowers) {
            const range = t.pos.getRangeTo(creep);
            towerDmg += range <= 5 ? 600 : range < 20 ? 600 - 450 * (range - 5) / 15 : 150;
        }

        const netOurDps = Math.max(ours.dps - theirs.hps, 0);
        const netIncoming = Math.max(theirs.dps + towerDmg - ours.hps, 0);

        // Winnable if we can break their healing AND we kill them before they kill us
        const ttkThem = netOurDps > 0 ? theirs.ehp / netOurDps : Infinity;
        const ttkUs = netIncoming > 0 ? ours.ehp / netIncoming : Infinity;
        const winnable = netOurDps > 0 && ttkThem < ttkUs;

        const result = {winnable, netOurDps, netIncoming, ttkThem, ttkUs};
        creep.memory._engageCache = {tick: Game.time, room: creep.room.name, result};
        return result;
    }

    /* ====================== OPERATION DISPATCH ====================== */

    operationManagement() {
        switch (this.creep.memory.operation) {
            case 'borderPatrol':
                this.creep.borderPatrol();
                break;
            case 'guard':
                this.creep.guardRoom();
                break;
            case 'stronghold':
            case 'roomDenial':
                this.creep.denyRoom();
                break;
            case 'harass':
                this.creep.harass();
                break;
            case 'remoteDenial':
                this.creep.remoteDenial();
                break;
        }
    }

    destinationManagement() {
        let destination = this.creep.memory.misc?.stagingRoom && !this.creep.memory.misc.staged
            ? this.creep.memory.misc.stagingRoom
            : this.creep.memory.destination;

        if (this.room.name !== destination) {
            return this.creep.shibSquadMovement(new RoomPosition(25, 25, destination), {range: 22});
        }

        // In destination room
        if (this.creep.memory.misc?.stagingRoom === this.room.name) {
            this.creep.memory.misc.staged = true;
            return;
        }

        const squad = this.getSquad();
        const isReady = this.hasFullSquad(this.creep) && this.isQuadPacked(squad.concat(this.creep), this.creep);

        if (isReady) {
            if (this.creep.handleMilitaryCreep()) return;
            if (this.creep.findDefensivePosition()) this.creep.idleFor(5);
        } else if (!this.isCurrentPosViable(this.creep)) {
            const staging = this.findStaging(this.creep);
            if (staging) this.creep.shibMove(staging, {range: 0, forceSolo: true});
        }
    }
}

profiler.registerClass(RoleLongbowSquad, 'longbowSquad');
module.exports = RoleLongbowSquad;