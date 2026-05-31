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
// Pull the canonical formation offsets from the pathfinder so this role and the
// squad cost-matrix builder can't drift out of sync. orientation 0 = leader at
// the NW corner, followers SE; orientation 1 = mirror.
const {QUAD_FOLLOWER_OFFSETS: QUAD_OFFSETS} = require("module.pathFinder");
const stagingCache = {}; // roomName → {x, y, tick} — quad 2×2 staging only

// All 8 surrounding tiles — used for duo positioning (no fixed orientation).
const ALL_ADJACENT = [
    {dx: 0, dy: 1}, {dx: 0, dy: -1}, {dx: 1, dy: 0}, {dx: -1, dy: 0},
    {dx: 1, dy: 1}, {dx: 1, dy: -1}, {dx: -1, dy: 1}, {dx: -1, dy: -1}
];

// Ticks of consistent disagreement before a threat-driven orientation flip
// commits. Each flip invalidates the cached squad path in shibSquadMovement,
// so we eat one PathFinder.search per flip.
const ORIENTATION_HYSTERESIS_TICKS = 5;

// Squad-health ratio that ends a committed retreat. Higher than the trigger
// thresholds (0.45 / 0.7) so a single heal tick doesn't bounce us back into combat.
const RETREAT_RECOVERY_THRESHOLD = 0.8;

// Per-creep hits ratio below which the squad retreats regardless of average — a
// dying ally inside an otherwise healthy quad shouldn't be hidden by the mean.
const RETREAT_CRITICAL_PER_CREEP = 0.25;

// Trend window for shouldRetreat. A 1-tick delta misses spikes that settle for
// a single tick before resuming; averaging the last N ticks gives a more stable
// "are we losing ground?" signal.
const RETREAT_TREND_WINDOW = 3;

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

        // Snake trail for duo followers: every tick we publish where we currently
        // are, so the follower can step into the tile we're about to vacate.
        // Writing this BEFORE move logic means the value reflects the leader's
        // pre-move position regardless of tick processing order.
        creep.memory.lastPos = {x: creep.pos.x, y: creep.pos.y, roomName: creep.pos.roomName};

        // ensure all creeps in the squad have the same operation, and set followers to have the leaders operation
        if (creep.memory.operation) {
            const squad = this.getSquad();
            const squadOperation = creep.memory.operation;
            for (const member of squad) {
                if (member.memory.operation !== squadOperation) {
                    member.memory.operation = squadOperation;
                }
            }
        }


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

        const needsFormation = !!(this.room.hostileCreeps.find((c) => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)) || this.room.hostileStructures.length || this.nearDestination(creep));

        if (needsFormation) {
            const isReady = this.hasFullSquad(creep) && this.isFormationPacked(squad.concat(creep), creep);

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
            if (creep.memory.destination) {
                const transitTarget = (creep.memory.misc?.stagingRoom && !creep.memory.misc.staged)
                    ? creep.memory.misc.stagingRoom
                    : creep.memory.destination;
                this.leaderTransit(new RoomPosition(25, 25, transitTarget), {range: 22});
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
            this.creep.memory.squadListed = undefined;
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

        // Ensure we're in leader's squad list — only validates once per (leader, follower)
        // pair, so the per-tick includes/push goes away after the first success. Re-runs
        // if we switch leaders (rare) or if the leader's memory was reset.
        if (this.creep.memory.squadListed !== leader.id) {
            if (!leader.memory.squadMembers) leader.memory.squadMembers = [];
            if (!leader.memory.squadMembers.includes(this.creep.id)) {
                leader.memory.squadMembers.push(this.creep.id);
            }
            this.creep.memory.squadListed = leader.id;
        }

        // Squad-wide focus fire: adopt the leader's primary target
        if (leader.memory.target) this.creep.memory.target = leader.memory.target;

        // Combat fires first so it isn't lost when kite/move return early
        if (this.room.hostileCreeps.length || this.room.hostileStructures.length) {
            this.fireRangedAction(this.creep);
        }

        // Reactive melee kite — keep distance from melee threats inside range 2
        if (this.kiteFromMelee(this.creep)) return;

        // Duo movement: pure snake. Target the leader's previous tile (the one they
        // are vacating this tick) so we trail through 1-tile corridors, exit lines,
        // and tight terrain without any formation math. Falls back to a range-1
        // follow when we're catching up or when lastPos is in another room
        // (mid-transition — shibMove handles the cross-room routing).
        const squadSize = (leader.memory.squadMembers || []).length + 1;
        if (squadSize <= 2) {
            const lp = leader.memory.lastPos;
            if (this.creep.pos.isNearTo(leader.pos) && lp && lp.roomName === this.creep.pos.roomName) {
                if (this.creep.pos.x !== lp.x || this.creep.pos.y !== lp.y) {
                    this.creep.shibMove(new RoomPosition(lp.x, lp.y, lp.roomName), {range: 0, forceSolo: true});
                }
                // Already standing on leader's previous tile — stay put, leader will move first.
            } else {
                this.creep.shibMove(leader, {range: 1, forceSolo: true});
            }
            return;
        }

        // Quad formation logic.
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

    // Move the leader toward a transit target. Quads use the squad cost matrix
    // and squadMove so the 2×2 stays packed. Duos path solo: squadMove gates on
    // `members.some(m => m.fatigue)`, which causes the leader to halt every other
    // tick once the follower has any fatigue from the previous snake step, and
    // also overrides the follower's snake-target intent with same-direction
    // formation moves. Solo shibMove sidesteps both — the follower's snake logic
    // handles trailing independently.
    leaderTransit(target, options = {}) {
        const squadSize = (this.creep.memory.squadMembers || []).length + 1;
        const roomThreat = !!(this.room.hostileCreeps.length || this.room.hostileStructures.length || this.nearDestination(this.creep));
        if (squadSize <= 2 || !roomThreat) {
            return this.creep.shibMove(target, Object.assign({forceSolo: true}, options));
        }
        return this.creep.shibSquadMovement(target, options);
    }

    /* ====================== SQUAD HELPERS ====================== */

    // Soft-assignment formup. Each follower independently picks whichever
    // formation slot is closest AND not currently occupied by a squad-mate. If
    // we're already standing on a slot we stay — the rest of the squad fills in
    // around us. This eliminates the swap dance that hard-assigned slots forced
    // when two followers started on each other's "correct" tiles: instead of
    // F1 → F2's slot and F2 → F1's slot (a 2-creep position swap), each just
    // keeps whatever valid slot it's on. New followers arriving fill the
    // remaining gaps.
    getInPosition(creep, leader) {
        if (!leader || !creep) return false;
        if (leader.room.name !== creep.room.name) {
            return creep.shibMove(new RoomPosition(25, 25, leader.room.name), {range: 22, forceSolo: true});
        }

        // handleFollower routes duos through snake-tail movement; this is quad-only.
        const squadSize = (leader.memory.squadMembers || []).length + 1;
        if (squadSize <= 2) return creep.pos.isNearTo(leader.pos);

        const lp = leader.pos;
        const terrain = leader.room.getTerrain();
        const slotPositions = (offsets) => {
            const out = [];
            for (const {dx, dy} of offsets) {
                const nx = lp.x + dx;
                const ny = lp.y + dy;
                if (nx < 1 || nx > 48 || ny < 1 || ny > 48) continue;
                if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) continue;
                out.push(new RoomPosition(nx, ny, lp.roomName));
            }
            return out;
        };

        // Try the leader's current orientation; fall back to the opposite if
        // the first has no walkable slots (e.g., leader cornered against a wall).
        const orientation = leader.memory.squadOrientation || 0;
        let slots = slotPositions(QUAD_OFFSETS[orientation]);
        if (!slots.length) slots = slotPositions(QUAD_OFFSETS[orientation === 0 ? 1 : 0]);
        if (!slots.length) return false;

        // Already on a valid slot? Stay. This is the key fluidity win — no
        // forced relocation just because another follower happens to be closer
        // to the slot we picked last tick.
        if (slots.some(s => creep.pos.isEqualTo(s))) return true;

        // Build the occupancy set: leader's tile plus every other squad-mate
        // currently in the leader's room. Slot is "taken" if any of them sit on it.
        const occupied = new Set();
        occupied.add(`${lp.x},${lp.y}`);
        for (const id of leader.memory.squadMembers || []) {
            if (id === creep.id) continue;
            const m = Game.getObjectById(id);
            if (m && m.pos.roomName === lp.roomName) occupied.add(`${m.pos.x},${m.pos.y}`);
        }

        // Closest unoccupied slot wins. If two followers pick the same slot in
        // the same tick, only one ends up on it (Screeps lets at most one creep
        // land on a tile per resolution); the other re-evaluates next tick and
        // picks a different slot. Costs at most one wasted step.
        let bestSlot = null;
        let bestDist = Infinity;
        for (const s of slots) {
            if (occupied.has(`${s.x},${s.y}`)) continue;
            const d = creep.pos.getRangeTo(s);
            if (d < bestDist) {
                bestDist = d;
                bestSlot = s;
            }
        }

        if (!bestSlot) {
            // Every slot is occupied by another squad-mate — we're surplus this
            // tick (e.g., a fourth follower in a 3-slot quad, or transient state
            // during reshuffle). Inch toward the leader so we're available when
            // a slot frees up.
            if (!creep.pos.isNearTo(leader.pos)) {
                creep.shibMove(leader, {range: 1, forceSolo: true});
            }
            return false;
        }

        // Adjacent slot → direct move(direction). shibMove's pathfinder would
        // penalise squad-mate tiles at cost 100 and route the long way around;
        // a direct intent lets Screeps' swap rule resolve two followers moving
        // into each other's tiles in a single tick.
        if (creep.pos.isNearTo(bestSlot)) {
            const dir = creep.pos.getDirectionTo(bestSlot);
            if (dir) creep.move(dir);
            return false;
        }

        creep.shibMove(bestSlot, {range: 0, forceSolo: true});
        return false;
    }

    isCurrentPosViable(creep) {
        const squadSize = (creep.memory.squadMembers || []).length + 1;

        // Duos: snake-tail behaviour means any passable tile the leader stands on
        // is fine — the follower trails through 1-tile gaps. No footprint to check.
        if (squadSize <= 2) return true;

        const {x, y, roomName} = creep.pos;
        const terrain = creep.room.getTerrain();
        const slotOpen = (dx, dy) => {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 1 || nx > 48 || ny < 1 || ny > 48) return false;
            if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) return false;
            return !new RoomPosition(nx, ny, roomName).checkForImpassible(false, true);
        };

        // Quad — current orientation must fit. If not, try the opposite orientation
        // and flip if it fits, so the squad doesn't abandon a viable corner just
        // because updateOrientation picked the wrong side.
        const orientation = creep.memory.squadOrientation || 0;
        const currentOk = QUAD_OFFSETS[orientation].every(({dx, dy}) => slotOpen(dx, dy));
        if (currentOk) return true;

        const altOrientation = orientation === 0 ? 1 : 0;
        const altOk = QUAD_OFFSETS[altOrientation].every(({dx, dy}) => slotOpen(dx, dy));
        if (altOk) {
            creep.memory.squadOrientation = altOrientation;
            return true;
        }
        return false;
    }

    updateOrientation(creep) {
        if (creep.memory.lastOrientationTick === Game.time) return;
        creep.memory.lastOrientationTick = Game.time;

        // Duos don't use a fixed orientation — getInPosition picks any adjacent tile.
        const squadSize = (creep.memory.squadMembers || []).length + 1;
        if (squadSize <= 2) {
            if (creep.memory.squadOrientation) creep.memory.squadOrientation = 0;
            if (creep.memory.pendingOrientationFlip) creep.memory.pendingOrientationFlip = undefined;
            return;
        }

        const current = creep.memory.squadOrientation || 0;
        const {x, y} = creep.pos;

        // Wall safety override — applies immediately. The 2×2 can't physically fit
        // the other way at a room edge, so hysteresis would just delay the inevitable.
        if (x >= 44 || y >= 44) {
            if (current !== 1) creep.memory.squadOrientation = 1;
            if (creep.memory.pendingOrientationFlip) creep.memory.pendingOrientationFlip = undefined;
            return;
        }
        if (x <= 5 || y <= 5) {
            if (current !== 0) creep.memory.squadOrientation = 0;
            if (creep.memory.pendingOrientationFlip) creep.memory.pendingOrientationFlip = undefined;
            return;
        }

        // Combat orientation — pick the dominant axis so followers extend toward the threat.
        const knownTarget = Game.getObjectById(creep.memory.target);
        let nearestThreat = knownTarget && knownTarget.pos ? knownTarget : null;
        if (!nearestThreat) {
            const candidates = this.room.hostileCreeps.concat(this.room.hostileStructures || []);
            if (candidates.length) nearestThreat = _.min(candidates, t => creep.pos.getRangeTo(t));
        }

        if (!nearestThreat || !nearestThreat.pos) {
            if (creep.memory.pendingOrientationFlip) creep.memory.pendingOrientationFlip = undefined;
            return;
        }

        const dx = nearestThreat.pos.x - x;
        const dy = nearestThreat.pos.y - y;
        const proposed = Math.abs(dx) >= Math.abs(dy)
            ? (dx >= 0 ? 0 : 1)
            : (dy >= 0 ? 0 : 1);

        if (proposed === current) {
            if (creep.memory.pendingOrientationFlip) creep.memory.pendingOrientationFlip = undefined;
            return;
        }

        // Hysteresis: require ORIENTATION_HYSTERESIS_TICKS of consistent disagreement
        // before flipping, so a threat that briefly crosses an axis doesn't churn the
        // cached squad path.
        const pending = creep.memory.pendingOrientationFlip;
        if (pending && pending.to === proposed) {
            if (Game.time - pending.since >= ORIENTATION_HYSTERESIS_TICKS) {
                creep.memory.squadOrientation = proposed;
                creep.memory.pendingOrientationFlip = undefined;
            }
        } else {
            creep.memory.pendingOrientationFlip = {to: proposed, since: Game.time};
        }
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

    isFormationPacked(creeps, leader) {
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
        // Quad-only: isCurrentPosViable always returns true for duos so the leader
        // never asks for staging there. Defensive null return if invoked anyway.
        const squadSize = (creep.memory.squadMembers || []).length + 1;
        if (squadSize <= 2) return null;

        const roomName = creep.room.name;
        const pos = creep.pos;
        const terrain = creep.room.getTerrain();

        const tileClear = (cx, cy) => {
            if (cx < 1 || cx > 48 || cy < 1 || cy > 48) return false;
            if (terrain.get(cx, cy) === TERRAIN_MASK_WALL) return false;
            return !new RoomPosition(cx, cy, roomName).checkForImpassible(false, true);
        };

        // Quad — need a clear 2×2 anchored at (x, y). Accept either quadrant
        // (SE or NW); isCurrentPosViable will flip orientation on arrival if
        // the anchor sits at the bottom-right rather than the top-left.
        const seQuad = [{x: 0, y: 0}, {x: 0, y: 1}, {x: 1, y: 0}, {x: 1, y: 1}];
        const nwQuad = [{x: 0, y: 0}, {x: 0, y: -1}, {x: -1, y: 0}, {x: -1, y: -1}];
        const quadClear = (offsets, x, y) => {
            for (let i = 0; i < offsets.length; i++) {
                if (!tileClear(x + offsets[i].x, y + offsets[i].y)) return false;
            }
            return true;
        };
        const footprintClear = (x, y) => quadClear(seQuad, x, y) || quadClear(nwQuad, x, y);

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
                    if (x < 1 || x > 48 || y < 1 || y > 48) continue;

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

        // rangedHeal and rangedAttack share the ranged-action intent slot — firing
        // both overwrites the heal. Close heal() is a separate slot and doesn't
        // conflict, so we only need to bail when healInRange queued rangedHeal.
        if (creep.hasActiveBodyparts(HEAL) && this.healInRangeWouldRangedHeal(creep)) return;

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

    // Mirrors healInRange's selection (prototype.creepCombat.js) to detect when it
    // queued rangedHeal — which would be overwritten by a subsequent rangedAttack.
    // Keep in sync with healInRange if its logic changes.
    healInRangeWouldRangedHeal(creep) {
        let best = null;
        let bestRatio = Infinity;
        for (const c of this.room.creeps) {
            if (!c.my && (!c.owner || !FRIENDLIES.includes(c.owner.username))) continue;
            if (c.hits >= c.hitsMax) continue;
            if (creep.pos.getRangeTo(c) > 3) continue;
            const ratio = c.hits / c.hitsMax;
            if (ratio < bestRatio) {
                bestRatio = ratio;
                best = c;
            }
        }
        if (!best) return false;

        // healInRange's self-heal short-circuit: fires heal(self) (close, no conflict)
        // when self is wounded and best is even more wounded than self.
        const selfWounded = creep.hits < creep.hitsMax;
        const selfRatio = creep.hits / creep.hitsMax;
        if (selfWounded && bestRatio < selfRatio) return false;

        // heal(best) close — also no conflict.
        if (creep.pos.isNearTo(best)) return false;

        // Otherwise rangedHeal(best) — conflicts with rangedAttack.
        return true;
    }

    shouldRetreat(creep, fullSquad) {
        // Continuous health + per-creep critical floor. The average alone hides
        // a dying member behind healthier squadmates; tracking both catches both
        // "the whole squad is bleeding" and "one creep is about to die" cases.
        let totalHits = 0, totalHitsMax = 0;
        let criticalMember = false;
        for (const c of fullSquad) {
            totalHits += c.hits;
            totalHitsMax += c.hitsMax;
            if (c.hits / c.hitsMax < RETREAT_CRITICAL_PER_CREEP) criticalMember = true;
        }
        const squadHealth = totalHitsMax ? totalHits / totalHitsMax : 1;

        // Trend window: mean of the last N samples. A negative delta against the
        // window mean means we've been losing ground over the window.
        const history = creep.memory.squadHealthHistory || [];
        history.push(squadHealth);
        while (history.length > RETREAT_TREND_WINDOW) history.shift();
        creep.memory.squadHealthHistory = history;
        const windowMean = history.reduce((a, b) => a + b, 0) / history.length;
        const trend = squadHealth - windowMean;

        // Hysteresis: once a health-triggered retreat starts, stay retreating until
        // we both recover above RETREAT_RECOVERY_THRESHOLD AND no member is still
        // critical. A 0.8 average with one creep at 10% should keep us fleeing.
        if (creep.memory.retreating) {
            if (squadHealth >= RETREAT_RECOVERY_THRESHOLD && !criticalMember) {
                creep.memory.retreating = undefined;
                return false;
            }
            return true;
        }

        if (criticalMember || squadHealth < 0.45 || (squadHealth < 0.7 && trend < -0.05)) {
            creep.memory.retreating = true;
            return true;
        }

        // Pre-commit DPS forecast (only before first form-up; once committed, trust the
        // health logic). No hysteresis here — repeated "not winnable" verdicts are
        // already stable, and we want re-entry to be allowed as soon as the matchup shifts.
        if (!creep.memory.initialFormUp && this.room.hostileCreeps.length) {
            const forecast = this.engagementForecast(creep, fullSquad);
            if (!forecast.winnable) return true;
        }
        return false;
    }

    kiteFromMelee(creep) {
        // Follower fast-path: if our leader's shibSquadKite already moved us this
        // tick, the leader's squadMove call queued our movement intent. Return true
        // to short-circuit further follower logic — anything we queue here would
        // either duplicate or override the coordinated direction. Screeps' last-
        // write-wins for move intents protects us from broken tick order, but the
        // CPU saving is worth taking.
        if (creep.memory.groupLeader && !creep.memory.leader) {
            const leader = Game.getObjectById(creep.memory.groupLeader);
            if (leader && leader.memory.squadKiteTick === Game.time) return true;
        }

        // Range 1: any ATTACK threat will land a melee swing next tick — kite even if
        // they also carry RANGED_ATTACK, the immediate hit outweighs the trade.
        // Range 2: only pure-melee is worth kiting; a kiting ranged attacker keeps pace.
        const meleeThreats = this.room.hostileCreeps.filter(c => {
            if (!c.hasActiveBodyparts(ATTACK)) return false;
            const range = c.pos.getRangeTo(creep);
            if (range > 2) return false;
            if (range === 1) return true;
            return !c.hasActiveBodyparts(RANGED_ATTACK);
        });
        if (!meleeThreats.length) return false;

        // Squad kite: when a leader has live followers, use pathfinder's
        // shibSquadKite so the whole formation steps as one. Each member otherwise
        // computes its own kite vector from local threats and the squad tears apart
        // for at least one tick. squadKiteTick flags the move for follower defer.
        if (creep.memory.leader && (creep.memory.squadMembers || []).length) {
            if (creep.shibSquadKite(2)) {
                creep.memory.squadKiteTick = Game.time;
                creep.memory._shibSquadMove = undefined;
                return true;
            }
            // Fall through to the single-step heuristic when the pathfinder can't
            // find a flee path (cornered, fully surrounded, etc.) — better to step
            // any direction than freeze.
        }

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

        if (creep.move(dir) !== OK) return false;
        // Invalidate cached squad path so next tick re-pathfinds from the new position
        creep.memory._shibSquadMove = undefined;
        return true;
    }

    handleRefillTrip(creep, squad) {
        // Don't divert mid-combat
        if (this.room.hostileCreeps.length || this.room.hostileStructures.length || this.creep.memory.hasBoosted) return false;

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
            this.leaderTransit(new RoomPosition(25, 25, colony), {range: 22});
            return true;
        }

        // At colony. Clear initialFormUp on low TTL so hasFullSquad re-evaluates as
        // new spawns join, and so squadRenewal's initialFormUp gate opens for any
        // pre-boost creep that aged out before its lab was ready. squadRenewal is
        // still gated on !hasBoosted internally, so post-boost leaders correctly
        // fall through to idle-and-die-here while a replacement spawns.
        if (lowTTL && creep.memory.initialFormUp) creep.memory.initialFormUp = undefined;
        if (this.squadRenewal(creep)) return true;
        creep.idleFor(5);
        return true;
    }

    engagementForecast(creep, fullSquad) {
        // Body tallies are position-independent — safe to cache across ticks while
        // the leader approaches. Tower damage is position-dependent, so it's
        // computed fresh every call.
        let ours, theirs;
        const cache = creep.memory._engageCache;
        if (cache && cache.tick + 30 > Game.time && cache.room === creep.room.name) {
            ours = cache.ours;
            theirs = cache.theirs;
        } else {
            const tally = (creeps) => creeps.reduce((acc, c) => {
                const ap = abilityPower(c.body);
                acc.dps += ap.attack;
                acc.hps += ap.effectiveHeal;
                acc.ehp += ap.defense;
                return acc;
            }, {dps: 0, hps: 0, ehp: 0});

            ours = tally(fullSquad);
            theirs = tally(this.room.hostileCreeps);
            creep.memory._engageCache = {tick: Game.time, room: creep.room.name, ours, theirs};
        }

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

        return {winnable, netOurDps, netIncoming, ttkThem, ttkUs};
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
            return this.leaderTransit(new RoomPosition(25, 25, destination), {range: 22});
        }

        // In destination room
        if (this.creep.memory.misc?.stagingRoom === this.room.name) {
            this.creep.memory.misc.staged = true;
            return;
        }

        const squad = this.getSquad();
        const isReady = this.hasFullSquad(this.creep) && this.isFormationPacked(squad.concat(this.creep), this.creep);

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