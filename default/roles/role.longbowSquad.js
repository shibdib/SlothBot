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
// squad cost-matrix builder can't drift out of sync. 0 NW / 1 SE / 2 NE / 3 SW.
const {QUAD_FOLLOWER_OFFSETS: QUAD_OFFSETS} = require("module.pathFinder");
const stagingCache = {}; // creepId → {x, y, tick, roomName}

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
        const waitFor = this.creep.memory.misc && this.creep.memory.misc.waitFor;
        if (!(waitFor > 1) && this.creep.fightFromRampart()) return true;
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


        const squad = this.getSquad();
        const fullSquad = squad.concat(creep);

        if (this.room.hostileCreeps.length || this.room.hostileStructures.length) {
            const hostile = creep.findClosestEnemy(false, false);
            if (hostile) creep.memory.target = hostile.id;
            else if (creep.memory.target) creep.memory.target = undefined;
        }

        // Combat actions first — range-aware mass-vs-focused decision
        this.fireRangedAction(creep);

        this.updateOrientation(creep);

        // Tactical retreat (continuous health + DPS forecast) takes priority over renewal
        if (this.shouldRetreat(creep, fullSquad)) {
            this.retreatSquad(creep);
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
                if (creep.memory.operation === 'roomDenial' || creep.memory.operation === 'stronghold'
                    || this.isQuad(creep)) {
                    this.leadPackedQuad(creep);
                } else if (creep.memory.operation) {
                    this.operationManagement();
                } else if (creep.memory.destination) {
                    this.destinationManagement();
                } else {
                    creep.handleMilitaryCreep();
                }
            } else {
                creep.memory.waitingToAssemble = true;
                if (!this.holdAtExit(creep, squad) && !this.isCurrentPosViable(creep)) {
                    const stagingTarget = this.findStaging(creep);
                    if (stagingTarget) creep.shibMove(stagingTarget, {range: 0, forceSolo: true});
                }
            }
        } else {
            // Safe transit — one move. denyRoom also paths, so skip it here
            // or the two shibMoves fight (last write wins, two PathFinders).
            creep.memory.waitingToAssemble = false;
            if (creep.memory.destination) {
                if (creep.ensureDenialStaging) creep.ensureDenialStaging();
                const transitTarget = (creep.memory.misc?.stagingRoom && !creep.memory.misc.staged)
                    ? creep.memory.misc.stagingRoom
                    : creep.memory.destination;
                this.leaderTransit(new RoomPosition(25, 25, transitTarget), {range: 22});
            } else if (creep.memory.operation) {
                this.operationManagement();
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
        const waitFor = (this.creep.memory.misc && this.creep.memory.misc.waitFor) || 0;
        if (waitFor > 1) {
            // Incomplete waitFor squad — do not walk into dest alone.
            if (this.creep.memory.destination && this.room.name === this.creep.memory.destination) {
                const toward = (this.creep.memory.misc && this.creep.memory.misc.stagingRoom) || this.creep.memory.colony;
                this.creep.moveToRoomExit(toward);
                return;
            }
            if (this.creep.ensureDenialStaging) this.creep.ensureDenialStaging();
            const staging = this.creep.memory.misc && this.creep.memory.misc.stagingRoom;
            if (staging && this.room.name !== staging) {
                this.creep.shibMove(new RoomPosition(25, 25, staging), {range: 22});
                return;
            }
            if (this.creep.findDefensivePosition()) this.creep.idleFor(5);
            return;
        }
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
            return creep.shibMove(leader, {range: 1, forceSolo: true});
        }

        // handleFollower routes duos through snake-tail movement; this is quad-only.
        const squadSize = (leader.memory.squadMembers || []).length + 1;
        if (squadSize <= 2) return creep.pos.isNearTo(leader.pos);

        const lp = leader.pos;
        const slotPositions = (offsets) => {
            const out = [];
            for (const {dx, dy} of offsets) {
                const nx = lp.x + dx;
                const ny = lp.y + dy;
                if (nx < 1 || nx > 48 || ny < 1 || ny > 48) continue;
                const pos = new RoomPosition(nx, ny, lp.roomName);
                // Same walkability as isCurrentPosViable — walls alone miss
                // constructed obstacles and the follower paths onto a blocked tile.
                if (pos.checkForImpassible(false, true)) continue;
                out.push(pos);
            }
            return out;
        };

        // Try the leader's current orientation; fall back to the opposite if
        // the first has no walkable slots (e.g., leader cornered against a wall).
        const orientation = leader.memory.squadOrientation || 0;
        let slots = slotPositions(QUAD_OFFSETS[orientation] || QUAD_OFFSETS[0]);
        if (!slots.length) {
            for (let o = 0; o < 4; o++) {
                if (o === orientation || !QUAD_OFFSETS[o]) continue;
                slots = slotPositions(QUAD_OFFSETS[o]);
                if (slots.length) break;
            }
        }
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
        const offsets = QUAD_OFFSETS[orientation] || QUAD_OFFSETS[0];
        if (offsets.every(({dx, dy}) => slotOpen(dx, dy))) return true;

        for (let o = 0; o < 4; o++) {
            if (o === orientation || !QUAD_OFFSETS[o]) continue;
            if (QUAD_OFFSETS[o].every(({dx, dy}) => slotOpen(dx, dy))) {
                creep.memory.squadOrientation = o;
                return true;
            }
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
        const crossedRoom = !!(creep.memory.lastPos && creep.memory.lastPos.roomName !== creep.pos.roomName);
        const edge = this.edgeSafeOrientation(x, y);
        const combat = this.combatOrientation(creep, x, y);

        if (edge !== undefined) {
            let next = current;
            if (crossedRoom && combat !== undefined && this.orientationAllowed(edge, combat)
                && this.orientationFits(creep, combat)) {
                next = combat;
            } else if (Array.isArray(edge)) {
                if (!edge.includes(current)) {
                    next = (combat !== undefined && edge.includes(combat)) ? combat : edge[0];
                }
            } else if (current !== edge) {
                next = edge;
            }
            if (next !== current) creep.memory.squadOrientation = next;
            if (creep.memory.pendingOrientationFlip) creep.memory.pendingOrientationFlip = undefined;
            return;
        }

        if (combat === undefined) {
            if (creep.memory.pendingOrientationFlip) creep.memory.pendingOrientationFlip = undefined;
            return;
        }

        if (crossedRoom) {
            creep.memory.squadOrientation = combat;
            if (creep.memory.pendingOrientationFlip) creep.memory.pendingOrientationFlip = undefined;
            return;
        }

        if (combat === current) {
            if (creep.memory.pendingOrientationFlip) creep.memory.pendingOrientationFlip = undefined;
            return;
        }

        const pending = creep.memory.pendingOrientationFlip;
        if (pending && pending.to === combat) {
            if (Game.time - pending.since >= ORIENTATION_HYSTERESIS_TICKS) {
                creep.memory.squadOrientation = combat;
                creep.memory.pendingOrientationFlip = undefined;
            }
        } else {
            creep.memory.pendingOrientationFlip = {to: combat, since: Game.time};
        }
    }

    // 0 NW / 1 SE / 2 NE / 3 SW. Corners are a single legal value; edges are a pair.
    edgeSafeOrientation(x, y) {
        const n = y <= 5, s = y >= 44, w = x <= 5, e = x >= 44;
        if (n && w) return 0;
        if (s && e) return 1;
        if (n && e) return 2;
        if (s && w) return 3;
        if (n) return [0, 2];
        if (s) return [1, 3];
        if (w) return [0, 3];
        if (e) return [1, 2];
        return undefined;
    }

    orientationAllowed(edge, orient) {
        return edge === orient || (Array.isArray(edge) && edge.includes(orient));
    }

    combatOrientation(creep, x, y) {
        const knownTarget = Game.getObjectById(creep.memory.target);
        let nearestThreat = knownTarget && knownTarget.pos ? knownTarget : null;
        if (!nearestThreat) {
            const candidates = this.room.hostileCreeps.concat(this.room.hostileStructures || []);
            if (candidates.length) nearestThreat = _.min(candidates, t => creep.pos.getRangeTo(t));
        }
        if (!nearestThreat || !nearestThreat.pos || nearestThreat.pos.roomName !== creep.pos.roomName) return undefined;
        const dx = nearestThreat.pos.x - x;
        const dy = nearestThreat.pos.y - y;
        if (dx >= 0 && dy >= 0) return 0;
        if (dx < 0 && dy < 0) return 1;
        if (dx < 0 && dy >= 0) return 2;
        return 3;
    }

    orientationFits(creep, orient) {
        const offsets = QUAD_OFFSETS[orient];
        if (!offsets) return false;
        const {x, y, roomName} = creep.pos;
        const terrain = creep.room.getTerrain();
        for (let i = 0; i < offsets.length; i++) {
            const nx = x + offsets[i].dx;
            const ny = y + offsets[i].dy;
            if (nx < 1 || nx > 48 || ny < 1 || ny > 48) return false;
            if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) return false;
            if (new RoomPosition(nx, ny, roomName).checkForImpassible(false, true)) return false;
        }
        return true;
    }

    nearDestination(leader) {
        if (!leader.memory.destination) return false;
        // Quads pack two rooms out so the last hop is a 2×2. Duos snake in
        // transit — treating them like quads here parks the leader mid-route
        // (isCurrentPosViable is always true, so they never move to staging).
        const limit = this.isQuad(leader) ? 2 : 1;
        if (Game.map.getRoomLinearDistance(leader.room.name, leader.memory.destination) <= limit) return true;
        const staging = leader.memory.misc && leader.memory.misc.stagingRoom;
        return !!(staging && leader.room.name === staging);
    }

    isQuad(creep) {
        return (creep.memory.squadMembers || []).length + 1 > 2;
    }

    // Unpacked in dest (or any threatened room): sit on the entry exit until
    // the squad is together. 25,25 / local staging is the bunker.
    holdAtExit(creep, squad) {
        const inDest = !!(creep.memory.destination && creep.room.name === creep.memory.destination);
        const threatened = !!(this.room.hostileCreeps.length || this.room.hostileStructures.length);
        if (!inDest && !threatened) return false;
        const partner = squad && squad[0];
        const toward = partner && partner.pos.roomName !== creep.pos.roomName
            ? partner.pos.roomName
            : (creep.memory.misc && creep.memory.misc.stagingRoom !== creep.room.name
                ? creep.memory.misc.stagingRoom
                : undefined);
        return creep.moveToRoomExit(toward);
    }

    // Packed 2×2: bookkeeping only from denyRoom, then step the formation as one.
    leadPackedQuad(creep) {
        if (creep.memory.operation === 'roomDenial' || creep.memory.operation === 'stronghold') {
            creep.denyRoom({squadMove: true});
            if (creep.memory.operation === 'borderPatrol') return;
        }

        if (creep.memory.destination && creep.room.name === creep.memory.destination) {
            const hostile = Game.getObjectById(creep.memory.target) || creep.findClosestEnemy(false, false);
            if (hostile) {
                creep.memory.target = hostile.id;
                return this.advancePackedQuad(creep, hostile);
            }
            if (creep.room.controller && creep.pos.getRangeTo(creep.room.controller) > 5) {
                return this.leaderTransit(creep.room.controller, {range: 4});
            }
            return;
        }

        if (creep.memory.destination) {
            if (creep.ensureDenialStaging) creep.ensureDenialStaging();
            const transitTarget = (creep.memory.misc && creep.memory.misc.stagingRoom && !creep.memory.misc.staged)
                ? creep.memory.misc.stagingRoom
                : creep.memory.destination;
            return this.leaderTransit(new RoomPosition(25, 25, transitTarget), {range: 22});
        }

        if (creep.memory.operation) return this.operationManagement();
        return creep.handleMilitaryCreep();
    }

    liveHostileTowers() {
        const towers = this.room.towers || [];
        const out = [];
        for (let i = 0; i < towers.length; i++) {
            const t = towers[i];
            const o = t.safeOwnerName ? t.safeOwnerName() : (t.owner && t.owner.username);
            if (!o || FRIENDLIES.includes(o)) continue;
            if (t.store && t.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST) out.push(t);
        }
        return out;
    }

    canTankLiveTowers(creep) {
        const squad = this.getSquad().concat(creep);
        let hps = 0;
        for (let i = 0; i < squad.length; i++) {
            hps += abilityPower(squad[i].body).effectiveHeal;
        }
        return hps > this.liveHostileTowers().length * 600;
    }

    // Range 3 on the target unless live towers would dump 600/tick into the 2×2.
    // Empty towers do not count. Too close without the heal budget → walk back out.
    advancePackedQuad(creep, hostile) {
        const towers = this.liveHostileTowers();
        if (towers.length && !this.canTankLiveTowers(creep)) {
            let closest = towers[0];
            let closestRange = creep.pos.getRangeTo(closest);
            for (let i = 1; i < towers.length; i++) {
                const r = creep.pos.getRangeTo(towers[i]);
                if (r < closestRange) {
                    closest = towers[i];
                    closestRange = r;
                }
            }
            if (closestRange < 6) {
                if (creep.ensureDenialStaging) creep.ensureDenialStaging();
                const staging = creep.memory.misc && creep.memory.misc.stagingRoom;
                if (staging && staging !== creep.room.name) {
                    return this.leaderTransit(new RoomPosition(25, 25, staging), {range: 22});
                }
                return creep.moveToRoomExit(staging || creep.memory.colony);
            }
            if (closestRange <= 8) return;
            return this.leaderTransit(closest, {range: 7});
        }
        return this.leaderTransit(hostile, {range: 3});
    }

    // Back out the way we came (staging, then colony). fleeHome alone can
    // path a duo through the bunker; the follower snakes on lastPos.
    retreatSquad(creep) {
        if (creep.ensureDenialStaging) creep.ensureDenialStaging();
        const staging = creep.memory.misc && creep.memory.misc.stagingRoom;
        const dest = creep.memory.destination;
        if (dest && creep.room.name === dest) {
            if (staging && staging !== creep.room.name) {
                return this.leaderTransit(new RoomPosition(25, 25, staging), {range: 22});
            }
            return creep.moveToRoomExit(staging || creep.memory.colony);
        }
        if (staging && creep.room.name !== staging && this.nearDestination(creep)) {
            return this.leaderTransit(new RoomPosition(25, 25, staging), {range: 22});
        }
        const colony = creep.memory.colony;
        if (colony && creep.room.name !== colony) {
            return this.leaderTransit(new RoomPosition(25, 25, colony), {range: 22});
        }
        return creep.fleeHome(true);
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

        for (let i = 0; i < creeps.length; i++) {
            if (!creeps[i] || creeps[i].pos.roomName !== leaderRoomName) return false;
        }

        // Full 2×2: every pair adjacent. A 3-creep remnant only needs to hug the
        // leader — a line fails pairwise but is still a usable blob.
        if (creeps.length <= 3) {
            for (let i = 0; i < creeps.length; i++) {
                if (creeps[i].id === leader.id) continue;
                if (!creeps[i].pos.isNearTo(leader.pos)) return false;
            }
            return true;
        }

        for (let i = 0; i < creeps.length; i++) {
            for (let j = i + 1; j < creeps.length; j++) {
                if (!creeps[i].pos.isNearTo(creeps[j].pos)) return false;
            }
        }
        return true;
    }

    findStaging(creep) {
        // Quad-only. Never search inside the dest — a clear 2×2 there is the bunker.
        const squadSize = (creep.memory.squadMembers || []).length + 1;
        if (squadSize <= 2) return null;
        if (creep.memory.destination && creep.room.name === creep.memory.destination) return null;

        const roomName = creep.room.name;
        const pos = creep.pos;
        const terrain = creep.room.getTerrain();
        const selfId = creep.id;

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
        const claimedByOther = (x, y) => {
            for (const id in stagingCache) {
                if (id === selfId) continue;
                const c = stagingCache[id];
                if (!c || c.roomName !== roomName || c.tick + 20 <= Game.time) continue;
                if (Math.abs(c.x - x) <= 1 && Math.abs(c.y - y) <= 1) return true;
            }
            return false;
        };

        const dest = creep.memory.destination;
        if (dest && dest !== roomName && Game.map.getRoomLinearDistance(roomName, dest) <= 1) {
            const exitSpot = this.findExitStaging(creep, dest, footprintClear, claimedByOther, tileClear);
            if (exitSpot) {
                stagingCache[selfId] = {x: exitSpot.x, y: exitSpot.y, tick: Game.time, roomName};
                if (exitSpot.orientation !== undefined) creep.memory.squadOrientation = exitSpot.orientation;
                return new RoomPosition(exitSpot.x, exitSpot.y, roomName);
            }
        }

        const cached = stagingCache[selfId];
        if (cached && cached.tick + 20 > Game.time && cached.roomName === roomName
            && footprintClear(cached.x, cached.y) && !claimedByOther(cached.x, cached.y)) {
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

                    if (footprintClear(x, y) && !claimedByOther(x, y)) {
                        stagingCache[selfId] = {x, y, tick: Game.time, roomName};
                        return new RoomPosition(x, y, roomName);
                    }
                }
            }
        }
        return null;
    }

    // 2×2 just inside the dest-facing exit so the last hop is a packed cross.
    findExitStaging(creep, dest, footprintClear, claimedByOther, tileClear) {
        const dir = creep.room.findExitTo(dest);
        if (!(dir > 0)) return null;
        const tiles = creep.room.find(dir);
        if (!tiles.length) return null;
        const spec = {
            1: {ix: 0, iy: 1, orients: [0, 2]},
            3: {ix: -1, iy: 0, orients: [1, 2]},
            5: {ix: 0, iy: -1, orients: [1, 3]},
            7: {ix: 1, iy: 0, orients: [0, 3]}
        }[dir];
        if (!spec) return null;

        let best = null;
        let bestDist = Infinity;
        for (let i = 0; i < tiles.length; i++) {
            const lx = tiles[i].x + spec.ix;
            const ly = tiles[i].y + spec.iy;
            if (lx < 1 || lx > 48 || ly < 1 || ly > 48) continue;
            if (claimedByOther(lx, ly) || !footprintClear(lx, ly)) continue;
            const d = creep.pos.getRangeTo(lx, ly);
            if (d >= bestDist) continue;
            bestDist = d;
            let orientation = spec.orients[0];
            for (let o = 0; o < spec.orients.length; o++) {
                const offsets = QUAD_OFFSETS[spec.orients[o]];
                if (offsets && offsets.every(({dx, dy}) => tileClear(lx + dx, ly + dy))) {
                    orientation = spec.orients[o];
                    break;
                }
            }
            best = {x: lx, y: ly, orientation};
        }
        return best;
    }

    /* ====================== COMBAT HELPERS ====================== */

    fireRangedAction(creep) {
        if (!creep.hasActiveBodyparts(RANGED_ATTACK)) return;

        const hostiles = this.room.hostileCreeps.concat(this.room.hostileStructures || []);
        const inRange = [];
        for (const h of hostiles) {
            if (h instanceof Structure && (h.my || (h.owner && h.owner.username === MY_USERNAME))) continue;
            const r = creep.pos.getRangeTo(h);
            if (r <= 3) inRange.push({h, r});
        }
        if (!inRange.length) return;

        // rangedHeal and rangedAttack share the ranged-action intent slot — firing
        // both overwrites the heal. Close heal() is a separate slot and doesn't
        // conflict, so we only need to bail when healInRange queued rangedHeal.
        if (creep.hasActiveBodyparts(HEAL) && this.healInRangeWouldRangedHeal(creep)) return;

        const focus = Game.getObjectById(creep.memory.target);
        const focusHere = focus && focus.pos && focus.pos.roomName === creep.room.name
            && creep.pos.getRangeTo(focus) <= 3;

        // Expected mass-attack damage per RANGED_ATTACK part vs focused (10 per part if target in range)
        let expectedMass = 0;
        for (const {h, r} of inRange) {
            expectedMass += r <= 1 ? 10 : r === 2 ? 4 : 1;
        }

        // Packed squads stay on the leader's pick. Mass only when that pick is
        // in the blob and mass beats a focused 10-per-part hit.
        if (focusHere) {
            if (inRange.length >= 2 && expectedMass > 10) creep.rangedMassAttack();
            else creep.rangedAttack(focus);
            return;
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
            if (leader && (leader.memory.squadKiteTick === Game.time || leader.memory.squadMoveTick === Game.time)) return true;
            // Duo followers snake onto lastPos. An independent kite vector tears
            // the pair apart; the leader's solo step is the trail.
            if (leader && (leader.memory.squadMembers || []).length + 1 <= 2) return false;
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

        // Quad kite: step the 2×2 as one. Duos must not use shibSquadKite —
        // squadMove returns false if the follower has fatigue, then each creep
        // picks its own vector and the snake breaks.
        if (creep.memory.leader && (creep.memory.squadMembers || []).length > 1) {
            if (creep.shibSquadKite(2)) {
                creep.memory.squadKiteTick = Game.time;
                creep.memory._shibSquadMove = undefined;
                return true;
            }
            // Pathfinder failed. One shared step (or a hold) — never fall through
            // to per-creep vectors or the 2×2 tears apart.
            const dir = this.sharedKiteDirection(creep, meleeThreats);
            if (dir && creep.move(dir) === OK) {
                const members = (creep.memory.squadMembers || []).map(id => Game.getObjectById(id)).filter(Boolean);
                for (const m of members) {
                    if (m.pos.getRangeTo(creep) > 1) continue;
                    const next = m.pos.positionAtDirection(dir);
                    if (!next || !next.checkForImpassible(false, true)) m.move(dir);
                }
            }
            creep.memory.squadKiteTick = Game.time;
            creep.memory._shibSquadMove = undefined;
            return true;
        }

        const dir = this.sharedKiteDirection(creep, meleeThreats);
        if (!dir) return false;
        if (creep.move(dir) !== OK) return false;
        creep.memory._shibSquadMove = undefined;
        return true;
    }

    sharedKiteDirection(creep, meleeThreats) {
        let avgDx = 0, avgDy = 0;
        for (const t of meleeThreats) {
            avgDx += t.pos.x - creep.pos.x;
            avgDy += t.pos.y - creep.pos.y;
        }
        const stepX = avgDx > 0 ? -1 : avgDx < 0 ? 1 : 0;
        const stepY = avgDy > 0 ? -1 : avgDy < 0 ? 1 : 0;
        if (stepX === 0 && stepY === 0) return 0;
        const tx = creep.pos.x + stepX;
        const ty = creep.pos.y + stepY;
        if (tx < 1 || tx > 48 || ty < 1 || ty > 48) return 0;
        if (creep.room.getTerrain().get(tx, ty) === TERRAIN_MASK_WALL) return 0;
        if (new RoomPosition(tx, ty, creep.room.name).checkForImpassible(false, true)) return 0;
        return creep.pos.getDirectionTo(tx, ty) || 0;
    }

    handleRefillTrip(creep, squad) {
        if (this.room.hostileCreeps.length) return false;

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

        // Boosted + full: do not walk home just to die. Short squads still pull back.
        if (!undermanned && creep.memory.hasBoosted) return false;

        if (undermanned) {
            creep.memory.needsMoreSquadMembers = true;
            if (creep.ensureDenialStaging) creep.ensureDenialStaging();
            const staging = creep.memory.misc && creep.memory.misc.stagingRoom;
            const dest = creep.memory.destination;
            if (dest && creep.room.name === dest) {
                if (staging && staging !== dest) {
                    this.leaderTransit(new RoomPosition(25, 25, staging), {range: 22});
                    return true;
                }
                creep.moveToRoomExit(staging || creep.memory.colony);
                return true;
            }
            if (staging && creep.room.name !== staging) {
                this.leaderTransit(new RoomPosition(25, 25, staging), {range: 22});
                return true;
            }
            if (staging && creep.room.name === staging) {
                if (lowTTL && creep.memory.initialFormUp) creep.memory.initialFormUp = undefined;
                creep.idleFor(5);
                return true;
            }
        }

        const colony = creep.memory.colony;
        if (!colony) return false;

        if (creep.room.name !== colony) {
            this.leaderTransit(new RoomPosition(25, 25, colony), {range: 22});
            return true;
        }

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

        const hostileTowers = (this.room.towers || []).filter(t => {
            const o = t.safeOwnerName ? t.safeOwnerName() : undefined;
            return o && !FRIENDLIES.includes(o);
        });
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
        if (this.creep.ensureDenialStaging) this.creep.ensureDenialStaging();
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
            if (this.isQuad(this.creep)) return this.leadPackedQuad(this.creep);
            if (this.creep.handleMilitaryCreep()) return;
            if (this.creep.findDefensivePosition()) this.creep.idleFor(5);
        } else if (this.holdAtExit(this.creep, squad)) {
            return;
        } else if (!this.isCurrentPosViable(this.creep)) {
            const staging = this.findStaging(this.creep);
            if (staging) this.creep.shibMove(staging, {range: 0, forceSolo: true});
        }
    }
}

profiler.registerClass(RoleLongbowSquad, 'longbowSquad');
module.exports = RoleLongbowSquad;