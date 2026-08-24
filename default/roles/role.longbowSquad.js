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
const {
    QUAD_FOLLOWER_OFFSETS: QUAD_OFFSETS,
    followerOffsets,
    formationRange,
    exitDirectionTo,
    wouldEnterDest
} = require("module.pathFinder");
const {recordSiegeWave} = require('hcTargets');
const stagingCache = {}; // creepId → {x, y, tick, roomName}
const musterCache = {}; // roomName → {x, y, tick}
const formupAssignCache = {tick: 0, claimed: {}}; // leaderId → {creepId → "x,y"} this tick
const STAGING_CACHE_TTL = 20;
const MUSTER_CACHE_TTL = 50;

function formupClaims(leaderId) {
    if (formupAssignCache.tick !== Game.time) {
        formupAssignCache.tick = Game.time;
        formupAssignCache.claimed = {};
    }
    if (!formupAssignCache.claimed[leaderId]) formupAssignCache.claimed[leaderId] = {};
    return formupAssignCache.claimed[leaderId];
}

function sweepFormupCaches() {
    if (Game.time % 50 !== 0) return;
    for (const id in stagingCache) {
        const c = stagingCache[id];
        if (!c || c.tick + STAGING_CACHE_TTL <= Game.time || !Game.getObjectById(id)) {
            delete stagingCache[id];
        }
    }
    for (const roomName in musterCache) {
        const c = musterCache[roomName];
        if (!c || c.tick + MUSTER_CACHE_TTL <= Game.time) delete musterCache[roomName];
    }
}

// Forming waves idle at least this far from every spawn so they do not occupy
// the spawn apron (creeps pop onto range-1 tiles).
const MUSTER_MIN_SPAWN_RANGE = 3;

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

// Uncommitted waitFor waves give up below this TTL (after renew fails):
// live >= 2 leaves as that size; a leftover solo recycles.
const FORMING_ABANDON_TTL = 600;

// No new body, and nothing queued/spawning, for this long: seal or recycle
// even if renew is still topping TTL. ~one 50-part spawn cycle plus slack;
// room queues wipe after 500 ticks without a spawn.
const FORMING_STALL_TICKS = 500;

// Assembled wave waiting on labs. LabTech already prioritizes wave fill;
// past this, commit whatever landed or recycle if nothing did.
const BOOST_WAIT_TICKS = 300;

// Top off forming bodies to this TTL before boosting. Boosting blocks renew,
// so 0.8 used to leave ~300 ticks on the table. 25 below cap so a fresh 1500
// spawn does not walk back for a single tick, and one 50-part renew (12 TTL)
// still overshoots the line.
const FORMING_RENEW_TARGET = CREEP_LIFE_TIME - 25;

// After commit, wait this long for stragglers to reach the leader before
// leaving the colony. Past that, go anyway so one stuck body cannot freeze
// the wave. They gather in place (labs), not back at the muster pad.
const DEPART_GATHER_TICKS = 20;

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
        if (this.creep.reserveWaveBoosts) this.creep.reserveWaveBoosts();
        if (this.shouldAttemptBoost() && this.creep.tryToBoost()) return true;
        if (this.shouldPreHeal(this.creep) && this.creep.hasActiveBodyparts(HEAL)) {
            this.creep.heal(this.creep);
        } else {
            this.creep.healInRange(this.room.hostileCreeps.length || this.room.hostileStructures.length);
        }
        return false;
    }

    shouldAttemptBoost() {
        const creep = this.creep;
        const waitFor = creep.memory.misc && creep.memory.misc.waitFor;
        if (!(waitFor > 1)) return true;
        if (creep.memory.boostAttempt) return true;
        if (this.isSquadCommitted(creep)) return false;
        // Boosting blocks renew. Labs fill during spawn via reserveWaveBoosts;
        // start boosting only once the wave is live so early bodies can top
        // off on leftover spawns instead of leaving 150+ ticks short.
        if (!this.waveAssembled(creep)) return false;
        if (creep.memory.hasBoosted) return true;
        if ((creep.ticksToLive || 0) <= FORMING_RENEW_TARGET) return false;
        if (creep.memory.needsRenewal) return false;
        return true;
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
        this.adoptDuoIfQuadRemnant(creep);

        if (creep.memory.operation === 'stronghold' && creep.pickStrongholdTarget) {
            const bunker = creep.pickStrongholdTarget();
            if (bunker) creep.memory.target = bunker.id;
            else if (creep.memory.target) creep.memory.target = undefined;
        } else if (this.room.hostileCreeps.length || this.room.hostileStructures.length) {
            const hostile = creep.findClosestEnemy(false, false);
            if (hostile) creep.memory.target = hostile.id;
            else if (creep.memory.target) creep.memory.target = undefined;
        }

        // Breach a border wall (exit, 1 tile, barriers) or widen a 1-tile hole
        // before firing, or mass-attack punches a gap the 2×2 still cannot fit.
        if (creep.memory.destination === creep.room.name) {
            if (this.entryInward(creep.pos)) {
                const barrier = this.pickBorderBreachTarget(creep, this.isQuad(creep) ? 2 : 1);
                if (!this.applyBreachTarget(creep, barrier) && creep.memory.quadWiden) {
                    creep.memory.quadWiden = undefined;
                }
            } else if (this.isQuad(creep) && this.isFormationPacked(fullSquad, creep)) {
                if (!this.pickQuadWidenTarget(creep, true) && creep.memory.quadPathBlocked) {
                    this.pickQuadWidenTarget(creep, false);
                }
            }
        }

        // Combat actions first — range-aware mass-vs-focused decision
        this.fireRangedAction(creep);

        this.updateOrientation(creep);

        const formingAtHome = !this.isSquadCommitted(creep)
            && (creep.memory.misc && creep.memory.misc.waitFor > 1)
            && this.inHomeColony(creep);

        // Tactical retreat (continuous health + DPS forecast) takes priority over renewal.
        // Do not yank an uncommitted waitFor wave off the spawn/pad for local hostiles.
        if (!formingAtHome && this.shouldRetreat(creep, fullSquad)) {
            this.retreatSquad(creep);
            return;
        }

        // Reactive melee kite — 1-tile backstep before formation pathing runs
        if (!formingAtHome && this.kiteFromMelee(creep)) return;

        // New waitFor waves stay in the colony until full, renewed, and boosted.
        if (this.holdForWave(creep, squad)) return;

        // Committed quad: don't walk out of the bunker until everyone is nearby.
        if (this.gatherBeforeDepart(creep, squad)) return;

        // Refill trip: head home when undermanned or running low on TTL (safe rooms only)
        if (this.handleRefillTrip(creep, squad)) return;

        if (this.squadRenewal(creep)) return true;

        // Hold the formation on the dest-facing exit until every live member is
        // in the blob, then slide in together. Without this the leader walks
        // in with whoever is adjacent.
        if (this.holdForSquadEntry(creep, squad)) return;

        const needsFormation = this.needsSquadFormation(creep);

        if (needsFormation) {
            const isReady = this.squadReadyToFight(creep, squad);

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
                if (this.snakeTerrainChoke(creep, squad)) return;
                if (creep.memory.quadWiden) return;
                // A fitting 2×2 here beats hugging the exit. holdAtExit used to
                // return true at range 1 of any exit and skip findStaging.
                const viable = this.isCurrentPosViable(creep);
                if (!(this.isQuad(creep) && viable)
                    && !this.holdAtExit(creep, squad) && !viable) {
                    const stagingTarget = this.findStaging(creep);
                    if (stagingTarget) creep.shibMove(stagingTarget, {range: 0, forceSolo: true});
                }
            }
        } else {
            // Safe transit — one move. denyRoom also paths, so skip it here
            // or the two shibMoves fight (last write wins, two PathFinders).
            this.clearQuadSnake(creep);
            creep.memory.waitingToAssemble = false;
            if (creep.memory.destination) {
                this.transitToOpTarget(creep);
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
            if (this.creep.ungroupFromSquad) this.creep.ungroupFromSquad();
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
        this.creep.memory.quadWiden = leader.memory.quadWiden || undefined;

        // Combat fires first so it isn't lost when kite/move return early
        if (this.room.hostileCreeps.length || this.room.hostileStructures.length) {
            this.fireRangedAction(this.creep);
        }

        const waitFor = this.creep.memory.misc && this.creep.memory.misc.waitFor;
        const formingAtHome = waitFor > 1 && !this.isSquadCommitted(this.creep) && this.inHomeColony(this.creep);

        // Leader already skips kite while forming at home; a quad follower
        // that kites here leaves the pad on the first invader.
        if (!formingAtHome && !leader.memory.quadSnake && this.kiteFromMelee(this.creep)) return;

        if (formingAtHome) {
            if (this.tryHomeRenew(this.creep)) return;
            this.goToMusterPad(this.creep);
            return;
        }

        // Leader already issued the coordinated step (including a dest hop).
        if (leader.memory.squadMoveTick === Game.time || leader.memory.squadKiteTick === Game.time) return;

        const dest = this.creep.memory.destination || leader.memory.destination;
        const grouped = (leader.memory.squadMembers || []).length >= 1;
        // Dest-facing exit: slot the formation, never snake/chase into dest.
        // That chase is 1-at-a-time entry.
        if (grouped && dest && this.creep.room.name !== dest && this.onDestFacingExit(this.creep, dest)) {
            if (leader.room.name === this.creep.room.name) {
                if ((leader.memory.squadMembers || []).length + 1 <= 2) {
                    if (!this.creep.pos.isNearTo(leader.pos)) {
                        this.creep.shibMove(leader, {range: 1, forceSolo: true});
                    }
                } else {
                    this.getInPosition(this.creep, leader);
                }
            } else {
                const dir = exitDirectionTo(this.creep.room.name, dest);
                const along = leader.pos.roomName === dest ? leader.pos : this.creep.pos;
                const spot = dir && this.alignExitSpot(this.creep, dir, along, leader);
                if (spot && (this.creep.pos.x !== spot.x || this.creep.pos.y !== spot.y)) {
                    this.creep.shibMove(spot, {range: 0, forceSolo: true});
                }
            }
            return;
        }

        // Duo movement: pure snake. Target the leader's previous tile (the one they
        // are vacating this tick) so we trail through 1-tile corridors, exit lines,
        // and tight terrain without any formation math. Falls back to a range-1
        // follow when we're catching up or when lastPos is in another room
        // (mid-transition — shibMove handles the cross-room routing).
        const squadSize = (leader.memory.squadMembers || []).length + 1;
        if (squadSize <= 2 || leader.memory.quadSnake) {
            // Leader already in dest: line up on this side of the exit and wait
            // for the coordinated hop. Chasing the leader is 1-at-a-time entry.
            if (dest && leader.room.name === dest && this.creep.room.name !== dest) {
                const dir = exitDirectionTo(this.creep.room.name, dest);
                if (dir) {
                    if (formationRange(this.creep.pos, leader.pos) <= 1) return;
                    const spot = this.alignExitSpot(this.creep, dir, leader.pos, leader);
                    if (spot && (this.creep.pos.x !== spot.x || this.creep.pos.y !== spot.y)) {
                        this.creep.shibMove(spot, {range: 0, forceSolo: true});
                    }
                    return;
                }
            }
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

        // Same predicate as the leader so unarmed hostiles don't pack followers
        // around a solo-transiting origin.
        if (this.needsSquadFormation(leader)) {
            this.getInPosition(this.creep, leader);
        } else {
            // Home gather: close on the leader (already at labs) instead of
            // walking back to the muster pad.
            if (this.inHomeColony(this.creep) && this.isSquadCommitted(this.creep)
                && leader.memory.gatherTick) {
                this.creep.shibMove(leader, {range: 1, forceSolo: true});
                return;
            }
            this.creep.shibMove(leader, {range: 2, forceSolo: true});
        }
    }

    handleSolo() {
        const creep = this.creep;
        const waitFor = (creep.memory.misc && creep.memory.misc.waitFor) || 0;
        const committed = this.isSquadCommitted(creep);

        // Waiting for a squad is not idle: chip a border wall in range, or any
        // hostile in RA range. idleFor skips the whole role (including this).
        if (waitFor > 1 && creep.memory.destination === creep.room.name && this.entryInward(creep.pos)) {
            this.applyBreachTarget(creep, this.pickBorderBreachTarget(creep, 1));
        }
        // Walls used as breach targets are not always in hostileStructures
        // (unowned / not in that filter). Fire off memory.target anyway.
        this.fireRangedAction(creep);

        if (waitFor > 1 && !committed) {
            if (this.cancelledDestAtHome(creep)) {
                creep.recycleCreep();
                return;
            }
            // Incomplete waitFor squad — do not walk into dest alone.
            if (creep.memory.destination && this.room.name === creep.memory.destination) {
                if (this.destHasLongbowPartner(creep)) {
                    if (!creep.handleMilitaryCreep()) creep.fleeHome();
                    return;
                }
                // Sit on the strip and shoot the wall rather than bouncing on
                // the exit (borderCheck vs moveToRoomExit).
                if (creep.memory.quadWiden) {
                    const t = Game.getObjectById(creep.memory.target);
                    if (t && t.pos && t.pos.roomName === creep.room.name && creep.pos.getRangeTo(t) > 3) {
                        creep.shibMove(t, {range: 3, forceSolo: true});
                    }
                    return;
                }
                const toward = creep.memory.colony;
                creep.moveToRoomExit(toward);
                return;
            }
            const colony = (creep.memory.misc && creep.memory.misc.formColony) || creep.memory.colony;
            if (colony && this.room.name !== colony) {
                creep.shibMove(new RoomPosition(25, 25, colony), {range: 22});
                return;
            }
            if (this.formingWaveStalled(creep) || (creep.ticksToLive || Infinity) < FORMING_ABANDON_TTL) {
                creep.recycleCreep();
                return;
            }
            if (this.tryHomeRenew(creep)) return;
            this.goToMusterPad(creep);
            return;
        }
        if (!creep.handleMilitaryCreep()) creep.fleeHome();
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
        // Never forceSolo into dest. That path is 1-at-a-time entry
        // (leader hops, each follower independently chases).
        const dest = this.creep.memory.destination;
        if (dest && target && target.roomName === dest && this.creep.room.name !== dest
            && exitDirectionTo(this.creep.room.name, dest)) {
            const pad = this.findStaging(this.creep);
            if (pad) {
                if (squadSize <= 2) return this.creep.shibMove(pad, Object.assign({
                    forceSolo: true,
                    range: 0
                }, options));
                return this.creep.shibSquadMovement(pad, {range: 0});
            }
            return false;
        }
        if (squadSize <= 2) {
            return this.creep.shibMove(target, Object.assign({forceSolo: true}, options));
        }
        if (!this.needsSquadFormation(this.creep)) {
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
            // Already the other half of a 2×2 on the exit — stay, the leader's
            // squad step will walk us across. Solo shibMove peels off the blob.
            if (formationRange(creep.pos, leader.pos) <= 1) return true;
            const dest = leader.memory.destination;
            const dir = dest && leader.room.name === dest
                ? exitDirectionTo(creep.room.name, dest) : 0;
            if (dir) {
                // Line up on this side of the dest exit; don't hop in alone.
                const spot = this.alignExitSpot(creep, dir, leader.pos, leader);
                if (spot && (creep.pos.x !== spot.x || creep.pos.y !== spot.y)) {
                    creep.shibMove(spot, {range: 0, forceSolo: true});
                }
                return true;
            }
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
                if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
                const pos = new RoomPosition(nx, ny, lp.roomName);
                // Same walkability as isCurrentPosViable — walls alone miss
                // constructed obstacles and the follower paths onto a blocked tile.
                if (pos.checkForImpassible(false, true)) continue;
                out.push(pos);
            }
            return out;
        };

        // Try the leader's current orientation; fall back to the facing with
        // the most walkable slots (e.g., leader cornered against a wall). Write
        // it back — otherwise squadMove keeps the empty facing and the packed
        // blob cannot step.
        const orientation = leader.memory.squadOrientation || 0;
        let slots = slotPositions(followerOffsets(orientation, squadSize));
        if (!slots.length) {
            let bestCount = 0;
            let chosen = orientation;
            for (let o = 0; o < 4; o++) {
                if (o === orientation || !QUAD_OFFSETS[o]) continue;
                const candidate = slotPositions(followerOffsets(o, squadSize));
                if (candidate.length > bestCount) {
                    bestCount = candidate.length;
                    slots = candidate;
                    chosen = o;
                }
            }
            if (bestCount && chosen !== orientation) {
                leader.memory.squadOrientation = chosen;
                if (leader.memory.pendingOrientationFlip) leader.memory.pendingOrientationFlip = undefined;
            }
        }
        if (!slots.length) return false;

        // Occupied: leader, other squad-mates, foreign creeps, and slots already
        // bound this tick. Same-tick claims stop three followers off the pad
        // from all charging offsets[0].
        const occupied = new Set();
        occupied.add(`${lp.x},${lp.y}`);
        for (const id of leader.memory.squadMembers || []) {
            if (id === creep.id) continue;
            const m = Game.getObjectById(id);
            if (m && m.pos.roomName === lp.roomName) occupied.add(`${m.pos.x},${m.pos.y}`);
        }
        for (let i = 0; i < slots.length; i++) {
            const s = slots[i];
            const occupant = s.checkForCreep();
            if (occupant && occupant.id !== creep.id) occupied.add(`${s.x},${s.y}`);
        }
        const claimed = formupClaims(leader.id);
        for (const id in claimed) {
            if (id !== creep.id) occupied.add(claimed[id]);
        }

        // Already on a valid slot? Stay and bind it so later followers skip it.
        for (let i = 0; i < slots.length; i++) {
            if (creep.pos.isEqualTo(slots[i])) {
                claimed[creep.id] = `${slots[i].x},${slots[i].y}`;
                return true;
            }
        }

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
            // Every slot is taken (squad-mate, claim, or foreign creep).
            if (!creep.pos.isNearTo(leader.pos)) {
                creep.shibMove(leader, {range: 1, forceSolo: true});
            }
            return false;
        }

        claimed[creep.id] = `${bestSlot.x},${bestSlot.y}`;

        // Range 1–2: one greedy step. shibMove costs squad-mates at 100 and
        // routes around the blob; a direct intent also lets the swap rule
        // resolve two followers exchanging tiles.
        const range = creep.pos.getRangeTo(bestSlot);
        if (range <= 2) {
            const dir = creep.pos.getDirectionTo(bestSlot);
            if (dir) {
                if (range === 1) {
                    const dest = leader.memory.destination;
                    if (dest && wouldEnterDest(creep.pos, dir, dest)) return false;
                    creep.move(dir);
                    return false;
                }
                const next = creep.pos.positionAtDirection(dir);
                if (next && next.roomName === creep.pos.roomName
                    && !occupied.has(`${next.x},${next.y}`)
                    && !next.checkForImpassible(false, true)) {
                    const occupant = next.checkForCreep();
                    if (!occupant || occupant.id === creep.id) {
                        creep.move(dir);
                        return false;
                    }
                }
            }
        }

        creep.shibMove(bestSlot, {range: 0, forceSolo: true});
        return false;
    }

    isCurrentPosViable(creep) {
        const squadSize = (creep.memory.squadMembers || []).length + 1;

        // Duos: snake-tail behaviour means any passable tile the leader stands on
        // is fine — the follower trails through 1-tile gaps. No footprint to check.
        if (squadSize <= 2) return true;

        // Mid dest hop: the 2×2 is supposed to straddle the exit. Don't flip
        // facing or hunt a new pad until everyone is off the dest-exit tile.
        if (this.squadSplitAcrossDest(creep) || this.squadOnDestExit(creep)) return true;

        const {x, y, roomName} = creep.pos;
        const terrain = creep.room.getTerrain();
        const slotOpen = (dx, dy) => {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx > 49 || ny < 0 || ny > 49) return false;
            if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) return false;
            return !new RoomPosition(nx, ny, roomName).checkForImpassible(false, true);
        };

        // Quad — current orientation must fit. If not, try the opposite orientation
        // and flip if it fits, so the squad doesn't abandon a viable corner just
        // because updateOrientation picked the wrong side.
        const orientation = creep.memory.squadOrientation || 0;
        const offsets = followerOffsets(orientation, squadSize);
        if (offsets.length && offsets.every(({dx, dy}) => slotOpen(dx, dy))) return true;

        for (let o = 0; o < 4; o++) {
            if (o === orientation || !QUAD_OFFSETS[o]) continue;
            const alt = followerOffsets(o, squadSize);
            if (alt.length && alt.every(({dx, dy}) => slotOpen(dx, dy))) {
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
        // Keep the 2×2 aligned while it straddles an exit or is still on dest-exit.
        // Edge-safe would flip to "followers inside this room" and yank the back
        // row off the hop before everyone is off the exit tile.
        if (this.squadSplitAcrossDest(creep) || this.squadOnDestExit(creep)) {
            if (creep.memory.pendingOrientationFlip) creep.memory.pendingOrientationFlip = undefined;
            return;
        }
        const edge = this.edgeSafeOrientation(x, y);
        const combat = this.combatOrientation(creep, x, y);

        // Dest-adjacent: lock the 2×2 so the leader is the dest-facing corner.
        // Interior combat/default (NW leader walking east) puts the dest-side
        // column on the exit a tick early and they hop in alone.
        const destDir = creep.memory.destination && creep.room.name !== creep.memory.destination
            ? exitDirectionTo(creep.room.name, creep.memory.destination) : 0;
        const destOrients = destDir ? this.destExitOrients(destDir) : [];
        if (destOrients.length) {
            const destFits = (o) => this.orientationFits(creep, o)
                && (edge === undefined || this.orientationAllowed(edge, o));
            if (destOrients.includes(current) && destFits(current)) {
                if (creep.memory.pendingOrientationFlip) creep.memory.pendingOrientationFlip = undefined;
                return;
            }
            const fit = destOrients.find(o => destFits(o));
            if (fit !== undefined) {
                if (fit !== current) creep.memory.squadOrientation = fit;
                if (creep.memory.pendingOrientationFlip) creep.memory.pendingOrientationFlip = undefined;
                return;
            }
        }

        if (edge !== undefined) {
            let next = current;
            if (crossedRoom && combat !== undefined && this.orientationAllowed(edge, combat)
                && this.orientationFits(creep, combat)) {
                next = combat;
            } else if (Array.isArray(edge)) {
                if (!edge.includes(current)) {
                    if (combat !== undefined && edge.includes(combat) && this.orientationFits(creep, combat)) {
                        next = combat;
                    } else {
                        next = edge.find(o => this.orientationFits(creep, o));
                        if (next === undefined) next = edge[0];
                    }
                }
            } else if (current !== edge) {
                next = edge;
            }
            if (next !== current) creep.memory.squadOrientation = next;
            if (creep.memory.pendingOrientationFlip) creep.memory.pendingOrientationFlip = undefined;
            return;
        }

        if (combat === undefined || !this.orientationFits(creep, combat)) {
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
        const squadSize = (creep.memory.squadMembers || []).length + 1;
        const offsets = followerOffsets(orient, squadSize);
        if (!offsets.length) return false;
        const {x, y, roomName} = creep.pos;
        const terrain = creep.room.getTerrain();
        for (let i = 0; i < offsets.length; i++) {
            const nx = x + offsets[i].dx;
            const ny = y + offsets[i].dy;
            if (nx < 0 || nx > 49 || ny < 0 || ny > 49) return false;
            if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) return false;
            if (new RoomPosition(nx, ny, roomName).checkForImpassible(false, true)) return false;
        }
        return true;
    }

    inHomeColony(creep) {
        const home = (creep.memory.misc && creep.memory.misc.formColony) || creep.memory.colony;
        return !!(home && creep.room.name === home);
    }

    // Pack only for armed hostiles, hostile structures, or dest approach.
    // Unarmed creeps used to form followers around a leader still forceSolo-ing.
    needsSquadFormation(creep) {
        if (!creep || !creep.room) return false;
        // Dest next door (including from home): followers must slot the 2×2
        // before the hop. Farther dests still leave home unpacked.
        if (this.nearDestination(creep)) return true;
        if (this.inHomeColony(creep)) return false;
        const room = creep.room;
        if (room.hostileStructures && room.hostileStructures.length) return true;
        const hostiles = room.hostileCreeps || [];
        for (let i = 0; i < hostiles.length; i++) {
            const c = hostiles[i];
            if (c && (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK))) return true;
        }
        return false;
    }

    nearDestination(leader) {
        if (!leader.memory.destination) return false;
        // Home packs only when a quad's dest shares an exit — otherwise a 2×2
        // pad in the bunker fights the economy. Dest next door IS the staging room.
        if (this.inHomeColony(leader)) {
            return this.isQuad(leader) && !!exitDirectionTo(leader.room.name, leader.memory.destination);
        }
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

    isSquadCommitted(creep) {
        return !!(creep.memory.initialFormUp || (creep.memory.misc && creep.memory.misc.sealed));
    }

    squadForWave(creep) {
        if (creep.memory.leader) return this.getSquad().concat(creep);
        const leader = Game.getObjectById(creep.memory.groupLeader);
        if (!leader) return [creep];
        const wave = [leader];
        for (const id of leader.memory.squadMembers || []) {
            const m = Game.getObjectById(id);
            if (m) wave.push(m);
        }
        return wave;
    }

    waveAssembled(creep, squad) {
        const waitFor = (creep.memory.misc && creep.memory.misc.waitFor) || 0;
        if (!(waitFor > 1)) return true;
        const wave = (squad && creep.memory.leader) ? squad.concat(creep) : this.squadForWave(creep);
        if (wave.length < waitFor) return false;
        for (let i = 0; i < wave.length; i++) {
            const c = wave[i];
            if (!c || c.spawning) return false;
            if (c.room.name !== creep.room.name) return false;
        }
        return true;
    }

    waveLiveAtHome(creep, squad) {
        const wave = (squad && creep.memory.leader) ? squad.concat(creep) : this.squadForWave(creep);
        let live = 0;
        for (let i = 0; i < wave.length; i++) {
            const c = wave[i];
            if (!c || c.spawning || c.room.name !== creep.room.name) continue;
            live++;
        }
        return live;
    }

    waveMemberBoostSettled(c) {
        if (!c) return false;
        if (c.memory.boosts) return false;
        if (c.memory.boostAttempt) return true;
        return !!(c.memory.hasBoosted && c.memory.hasBoosted.length);
    }

    waveBoosted(creep, squad) {
        const wave = (squad && creep.memory.leader) ? squad.concat(creep) : this.squadForWave(creep);
        if (!wave.length) return false;
        for (let i = 0; i < wave.length; i++) {
            if (!this.waveMemberBoostSettled(wave[i])) return false;
        }
        return true;
    }

    waveReadyToCommit(creep, squad) {
        const wave = (squad && creep.memory.leader) ? squad.concat(creep) : this.squadForWave(creep);
        if (!wave.length) return false;
        for (let i = 0; i < wave.length; i++) {
            const c = wave[i];
            if (!this.waveMemberBoostSettled(c)) return false;
            if (c.room.name !== creep.room.name) return false;
        }
        return true;
    }

    idleSpawnCount(room) {
        const spawns = (room && room.spawns) || [];
        let n = 0;
        for (let i = 0; i < spawns.length; i++) {
            try {
                if (spawns[i].my && !spawns[i].spawning) n++;
            } catch (e) { /* ignore */
            }
        }
        return n;
    }

    waveRenewCandidates(creep) {
        const wave = this.squadForWave(creep);
        const need = [];
        for (let i = 0; i < wave.length; i++) {
            const c = wave[i];
            if (!c || c.spawning) continue;
            if (c.memory.hasBoosted || c.memory.boostAttempt) continue;
            const ttl = c.ticksToLive || Infinity;
            if (ttl > FORMING_RENEW_TARGET && !c.memory.needsRenewal) continue;
            need.push(c);
        }
        need.sort((a, b) => {
            const dt = (a.ticksToLive || 0) - (b.ticksToLive || 0);
            if (dt) return dt;
            return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
        });
        return need;
    }

    waveNeedsRenew(creep) {
        return this.waveRenewCandidates(creep).length > 0;
    }

    tryHomeRenew(creep) {
        if (creep.memory.hasBoosted || creep.memory.boostAttempt) return false;
        const need = this.waveRenewCandidates(creep);
        if (!need.length || !need.some(c => c.id === creep.id)) {
            if (creep.memory.needsRenewal) creep.memory.needsRenewal = undefined;
            return false;
        }
        // Incomplete wave: only camp an idle spawn. Busy spawns are popping
        // the rest of the quad; sitting on the apron blocks the next body.
        if (!this.waveAssembled(creep)) {
            const slots = this.idleSpawnCount(creep.room);
            const allowed = slots > 0 ? need.slice(0, slots) : [];
            if (!allowed.some(c => c.id === creep.id)) {
                if (creep.memory.needsRenewal) creep.memory.needsRenewal = undefined;
                return false;
            }
        }
        return !!(creep.handleRenewing(FORMING_RENEW_TARGET));
    }

    renewWave(creep) {
        return this.tryHomeRenew(creep);
    }

    // Park between the spawn cluster and labs so the wave can renew or boost
    // in a few steps without camping the spawn apron.
    findBoostWaitPos(creep) {
        sweepFormupCaches();
        const room = creep.room;
        const cached = musterCache[room.name];
        if (cached && cached.tick + MUSTER_CACHE_TTL > Game.time) {
            const pos = new RoomPosition(cached.x, cached.y, room.name);
            if (!pos.checkForImpassible(false, true)) return pos;
        }

        const spawns = [];
        const roomSpawns = room.spawns || [];
        for (let i = 0; i < roomSpawns.length; i++) {
            try {
                if (roomSpawns[i].my) spawns.push(roomSpawns[i]);
            } catch (e) { /* ignore */ }
        }
        const labs = room.labs || [];

        const avg = (list) => {
            let x = 0;
            let y = 0;
            for (let i = 0; i < list.length; i++) {
                x += list[i].pos.x;
                y += list[i].pos.y;
            }
            return {x: x / list.length, y: y / list.length};
        };

        let spawnC;
        if (spawns.length) spawnC = avg(spawns);
        else if (room.storage) spawnC = {x: room.storage.pos.x, y: room.storage.pos.y};
        else spawnC = {x: 25, y: 25};

        let labC;
        if (labs.length) labC = avg(labs);
        else if (room.memory.labHub && room.memory.labHub.x !== undefined) {
            labC = {x: room.memory.labHub.x, y: room.memory.labHub.y};
        } else if (room.controller) {
            labC = {x: room.controller.pos.x, y: room.controller.pos.y};
        } else {
            labC = {x: 25, y: 25};
        }
        if (labC.x === spawnC.x && labC.y === spawnC.y) {
            labC = {x: spawnC.x, y: spawnC.y + 4};
        }

        // Slightly lab-biased midpoint so the search starts off the apron.
        const tx = spawnC.x + (labC.x - spawnC.x) * 0.55;
        const ty = spawnC.y + (labC.y - spawnC.y) * 0.55;
        const ix = Math.round(tx);
        const iy = Math.round(ty);

        const terrain = room.getTerrain();
        const cheby = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
        const spawnRange = (x, y) => {
            let min = Infinity;
            for (let i = 0; i < spawns.length; i++) {
                const d = cheby(x, y, spawns[i].pos.x, spawns[i].pos.y);
                if (d < min) min = d;
            }
            return min;
        };
        const labRange = (x, y) => {
            if (!labs.length) return cheby(x, y, labC.x, labC.y);
            let min = Infinity;
            for (let i = 0; i < labs.length; i++) {
                const d = cheby(x, y, labs[i].pos.x, labs[i].pos.y);
                if (d < min) min = d;
            }
            return min;
        };
        const walkable = (x, y) => {
            if (x < 2 || x > 47 || y < 2 || y > 47) return false;
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) return false;
            return !new RoomPosition(x, y, room.name).checkForImpassible(false, true);
        };

        let best = null;
        let bestScore = Infinity;
        for (let r = 0; r <= 10; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (r && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    const x = ix + dx;
                    const y = iy + dy;
                    if (!walkable(x, y)) continue;
                    const sr = spawns.length ? spawnRange(x, y) : 99;
                    if (sr < MUSTER_MIN_SPAWN_RANGE) continue;
                    const lr = labRange(x, y);
                    let score = cheby(x, y, tx, ty);
                    if (lr > 5) score += (lr - 5) * 3;
                    if (score < bestScore) {
                        bestScore = score;
                        best = new RoomPosition(x, y, room.name);
                    }
                }
            }
            if (best && bestScore < 8) break;
        }

        if (!best) {
            const dx = Math.sign(Math.round(labC.x - spawnC.x)) || 0;
            const dy = Math.sign(Math.round(labC.y - spawnC.y)) || 1;
            for (let dist = MUSTER_MIN_SPAWN_RANGE; dist <= 6 && !best; dist++) {
                const x = Math.round(spawnC.x + dx * dist);
                const y = Math.round(spawnC.y + dy * dist);
                if (walkable(x, y) && (!spawns.length || spawnRange(x, y) >= MUSTER_MIN_SPAWN_RANGE)) {
                    best = new RoomPosition(x, y, room.name);
                }
            }
        }

        if (best) musterCache[room.name] = {x: best.x, y: best.y, tick: Game.time};
        return best;
    }

    onSpawnApron(creep) {
        const spawns = creep.room.spawns || [];
        for (let i = 0; i < spawns.length; i++) {
            try {
                if (spawns[i].my && creep.pos.getRangeTo(spawns[i]) <= 1) return true;
            } catch (e) { /* ignore */ }
        }
        return false;
    }

    goToMusterPad(creep) {
        const pad = this.findBoostWaitPos(creep);
        if (!pad) return false;
        // Leader sits on the pad; everyone else fills the ring. Range 1 of a
        // range-3 pad can still be range 2 of a spawn, which is off the apron.
        const range = creep.memory.leader ? 0 : 1;
        if (!this.onSpawnApron(creep) && creep.pos.getRangeTo(pad) <= range) return true;
        creep.shibMove(pad, {range, forceSolo: true});
        return true;
    }

    commitSquad(creep, squad) {
        const waitFor = (creep.memory.misc && creep.memory.misc.waitFor) || ((squad && squad.length) + 1) || 1;
        const members = (squad && creep.memory.leader) ? squad.concat(creep) : this.squadForWave(creep);
        for (let i = 0; i < members.length; i++) {
            const c = members[i];
            if (!c) continue;
            if (c.clearBoostLabs) c.clearBoostLabs();
            if (!c.memory.misc) c.memory.misc = {};
            c.memory.misc.sealed = true;
            c.memory.misc.committedSize = waitFor;
            c.memory.misc.boostWaitTick = undefined;
            c.memory.initialFormUp = true;
        }
        const op = creep.memory.operation;
        if (op === 'roomDenial' || op === 'stronghold') recordSiegeWave(creep.memory.destination);
    }

    formingWaveMinTTL(creep, squad) {
        const members = (squad && creep.memory.leader) ? squad.concat(creep) : this.squadForWave(creep);
        let min = Infinity;
        for (let i = 0; i < members.length; i++) {
            const c = members[i];
            if (!c || c.spawning) continue;
            const t = c.ticksToLive || Infinity;
            if (t < min) min = t;
        }
        return min;
    }

    markFormingLive(creep, live) {
        if (!creep.memory.misc) creep.memory.misc = {};
        const misc = creep.memory.misc;
        if (misc.formLive !== live) {
            misc.formLive = live;
            misc.formLiveTick = Game.time;
        } else if (!misc.formLiveTick) {
            misc.formLiveTick = Game.time;
        }
    }

    formingWaveStalled(creep, squad) {
        const waitFor = (creep.memory.misc && creep.memory.misc.waitFor) || 0;
        if (!(waitFor > 1) || this.isSquadCommitted(creep)) return false;
        const wave = (squad && creep.memory.leader) ? squad.concat(creep) : this.squadForWave(creep);
        let live = 0;
        for (let i = 0; i < wave.length; i++) {
            if (wave[i] && !wave[i].spawning) live++;
        }
        if (live >= waitFor) return false;
        this.markFormingLive(creep, live);
        if (creep.waveStillIncoming && creep.waveStillIncoming()) return false;
        const since = creep.memory.misc.formLiveTick || Game.time;
        return Game.time - since >= FORMING_STALL_TICKS;
    }

    waveBoostStalled(creep, squad) {
        if (!this.waveAssembled(creep, squad) || this.isSquadCommitted(creep)) return false;
        if (!creep.memory.misc) creep.memory.misc = {};
        if (!creep.memory.misc.boostWaitTick) creep.memory.misc.boostWaitTick = Game.time;
        return Game.time - creep.memory.misc.boostWaitTick >= BOOST_WAIT_TICKS;
    }

    // Seal without committedSize so a replacement waitFor wave can still spawn
    // (same cap drop as adoptDuoIfQuadRemnant).
    sealWaveAtSize(creep, wave, size) {
        const members = wave && wave.length ? wave : this.squadForWave(creep);
        for (let i = 0; i < members.length; i++) {
            const c = members[i];
            if (!c) continue;
            if (c.clearBoostLabs) c.clearBoostLabs();
            if (!c.memory.misc) c.memory.misc = {};
            c.memory.misc.waitFor = size;
            c.memory.misc.sealed = true;
            c.memory.quadWiden = undefined;
            c.memory.quadPathBlocked = undefined;
            c.memory.quadSnake = undefined;
            c.memory.quadSnakeDir = undefined;
            c.memory._shibSquadMove = undefined;
        }
        const op = creep.memory.operation;
        if (op === 'roomDenial' || op === 'stronghold') recordSiegeWave(creep.memory.destination);
    }

    // TTL below FORMING_ABANDON_TTL after renew fails, or no new body and
    // nothing incoming for FORMING_STALL_TICKS: leave as the current pair/triple,
    // or recycle a leftover solo so it does not fill the cap.
    abandonIncompleteWave(creep, squad) {
        const waitFor = (creep.memory.misc && creep.memory.misc.waitFor) || 0;
        if (!(waitFor > 1) || this.isSquadCommitted(creep)) return false;
        const ttlFailed = this.formingWaveMinTTL(creep, squad) < FORMING_ABANDON_TTL;
        if (!ttlFailed && !this.formingWaveStalled(creep, squad)) return false;

        const wave = (squad && creep.memory.leader) ? squad.concat(creep) : this.squadForWave(creep);
        let live = 0;
        for (let i = 0; i < wave.length; i++) {
            if (wave[i] && !wave[i].spawning) live++;
        }
        if (live >= waitFor) return false;

        if (live >= 2) {
            this.sealWaveAtSize(creep, wave, live);
            return 'sealed';
        }
        creep.recycleCreep();
        return 'recycle';
    }

    destOpLive(dest) {
        return !!(dest && (Memory.targetRooms[dest] || Memory.auxiliaryTargets[dest]));
    }

    destSiegeLive(dest) {
        const op = dest && (Memory.targetRooms[dest] || Memory.auxiliaryTargets[dest]);
        return !!(op && (op.type === 'roomDenial' || op.type === 'stronghold'));
    }

    cancelledDestAtHome(creep) {
        const dest = creep.memory.destination;
        if (!dest || ['borderPatrol', 'guard', 'harass'].includes(creep.memory.operation)) return false;
        const siegeOp = creep.memory.operation === 'roomDenial' || creep.memory.operation === 'stronghold';
        if (siegeOp ? this.destSiegeLive(dest) : this.destOpLive(dest)) return false;
        const home = (creep.memory.misc && creep.memory.misc.formColony) || creep.memory.colony;
        return !!(home && creep.room.name === home);
    }

    recycleWave(creep, squad) {
        const wave = (squad && creep.memory.leader) ? squad.concat(creep) : this.squadForWave(creep);
        for (let i = 0; i < wave.length; i++) {
            if (wave[i] && wave[i].recycleCreep) wave[i].recycleCreep();
        }
    }

    // Stay in the spawn colony until waitFor bodies are live, topped off, and
    // boosted. Incomplete waves wait off the apron (or renew on leftover
    // spawns). Once assembled, renew then boost; gatherBeforeDepart then
    // holds stragglers on the leader before leaving.
    holdForWave(creep, squad) {
        if (this.cancelledDestAtHome(creep)) {
            this.recycleWave(creep, squad);
            return true;
        }
        const waitFor = (creep.memory.misc && creep.memory.misc.waitFor) || 0;
        if (!(waitFor > 1) || this.isSquadCommitted(creep)) return false;

        const colony = (creep.memory.misc && creep.memory.misc.formColony) || creep.memory.colony;
        if (colony && creep.room.name !== colony) {
            this.leaderTransit(new RoomPosition(25, 25, colony), {range: 22});
            return true;
        }

        if (!this.waveAssembled(creep, squad)) {
            if (creep.memory.misc && creep.memory.misc.boostWaitTick) {
                creep.memory.misc.boostWaitTick = undefined;
            }
            const abandoned = this.abandonIncompleteWave(creep, squad);
            if (abandoned === 'recycle') return true;
            if (abandoned === 'sealed') return false;
            if (this.renewWave(creep, squad)) return true;
            this.goToMusterPad(creep);
            return true;
        }

        if (this.waveNeedsRenew(creep)) {
            if (this.renewWave(creep, squad)) return true;
            return true;
        }

        if (!this.waveBoosted(creep, squad)) {
            if (this.waveBoostStalled(creep, squad)) {
                const wave = (squad && creep.memory.leader) ? squad.concat(creep) : this.squadForWave(creep);
                let anyBoosted = false;
                for (let i = 0; i < wave.length; i++) {
                    const c = wave[i];
                    if (!c) continue;
                    if (c.memory.hasBoosted && c.memory.hasBoosted.length) anyBoosted = true;
                    if (c.clearBoostLabs) c.clearBoostLabs();
                }
                if (!anyBoosted) {
                    this.recycleWave(creep, squad);
                    return true;
                }
            } else {
                // Already boosting or done: stay at the lab. Walking back to
                // the pad after the last boost is a round-trip off the exit path.
                if (!creep.memory.boosts && !creep.memory.boostAttempt && !creep.memory.hasBoosted) {
                    this.goToMusterPad(creep);
                }
                return true;
            }
        }

        if (!this.waveReadyToCommit(creep, squad)) return true;

        this.commitSquad(creep, squad);
        return false;
    }

    // After boost/commit, wait in place until the whole live squad is in this
    // room within range 3. Stops the leader walking out while two bodies are
    // still on the labs. One-shot (gatherDone) so a step that puts anyone >3
    // does not re-arm and bounce the wave back into the bunker.
    gatherBeforeDepart(creep, squad) {
        if (!this.isQuad(creep) || !this.inHomeColony(creep)) return false;
        if (!this.isSquadCommitted(creep)) return false;
        if (!creep.memory.misc) creep.memory.misc = {};
        if (creep.memory.misc.gatherDone) return false;
        const members = (squad && squad.length) ? squad.concat(creep) : this.squadForWave(creep);
        let spread = false;
        for (let i = 0; i < members.length; i++) {
            const m = members[i];
            if (!m || m.spawning || m.room.name !== creep.room.name || creep.pos.getRangeTo(m) > 3) {
                spread = true;
                break;
            }
        }
        if (!spread) {
            creep.memory.misc.gatherDone = true;
            if (creep.memory.gatherTick) creep.memory.gatherTick = undefined;
            return false;
        }
        if (!creep.memory.gatherTick) creep.memory.gatherTick = Game.time;
        if (Game.time - creep.memory.gatherTick >= DEPART_GATHER_TICKS) {
            creep.memory.misc.gatherDone = true;
            creep.memory.gatherTick = undefined;
            return false;
        }
        // Wait here. Followers path to the leader; pulling everyone back to
        // the muster pad after labs is a bunker-width detour off the exit.
        return true;
    }

    // Pair already in the fight (or a formed quad that bled to two). WaitFor 4
    // would park them for a 3rd/4th; they snake and shoot as a duo instead.
    canFightAsDuo(creep) {
        const live = (creep.memory.squadMembers || []).length + 1;
        if (live !== 2) return false;
        if (creep.memory.initialFormUp) return true;
        return !!(creep.memory.destination && creep.memory.destination === creep.room.name);
    }

    destHasLongbowPartner(creep) {
        const dest = creep.memory.destination;
        if (!dest || creep.room.name !== dest) return false;
        const sealed = !!(creep.memory.misc && creep.memory.misc.sealed);
        return this.room.myCreeps.some(c => {
            if (c.id === creep.id || c.spawning) return false;
            if (c.memory.destination !== dest) return false;
            if (!!(c.memory.misc && c.memory.misc.sealed) !== sealed) return false;
            const role = c.memory.role || '';
            const old = c.memory.oldRole || '';
            return role === 'longbowSquad' || role === 'longbow'
                || old === 'longbowSquad' || old === 'longbow';
        });
    }

    // Duos snake; they do not need a packed 2×2 before the leader will move.
    squadReadyToFight(creep, squad) {
        const inDest = !!(creep.memory.destination && creep.memory.destination === creep.room.name);
        if (inDest && !this.isQuad(creep)) {
            if ((squad && squad.length >= 1) || this.destHasLongbowPartner(creep)) return true;
            return false;
        }
        // Exit, 1 walkable, then walls: a 2×2 cannot pack on that strip, so
        // "wait for formation" never ends. Breach first, pack after the gap.
        // Quads still need the rest of the blob on the exit (or straddling it);
        // otherwise a solo leader on the dest strip walks in with 1-2 followers.
        if (inDest && this.entryInward(creep.pos)) {
            if (this.isQuad(creep)) {
                if (this.isFormationPacked((squad || this.getSquad()).concat(creep), creep)) return true;
            } else if ((squad && squad.length >= 1) || this.destHasLongbowPartner(creep)) {
                return true;
            }
        }
        if (!this.hasFullSquad(creep)) return false;
        if (!this.isQuad(creep)) return true;
        return this.isFormationPacked((squad || this.getSquad()).concat(creep), creep);
    }

    // A formed quad that bled to a pair still has waitFor 4, so refill/assemble
    // treat it as incomplete and park or walk home. Drop to duo, then seal so
    // replacements spawn and form a new quad instead of joining this pair
    // (the remnant usually times out before that quad arrives).
    adoptDuoIfQuadRemnant(creep) {
        const waitFor = (creep.memory.misc && creep.memory.misc.waitFor) || 0;
        if (waitFor <= 2) return false;
        if (!this.canFightAsDuo(creep)) return false;

        if (creep.clearBoostLabs) creep.clearBoostLabs();
        if (!creep.memory.misc) creep.memory.misc = {};
        creep.memory.misc.waitFor = 2;
        creep.memory.misc.sealed = true;
        creep.memory.quadWiden = undefined;
        creep.memory.quadPathBlocked = undefined;
        creep.memory.quadSnake = undefined;
        creep.memory.quadSnakeDir = undefined;
        creep.memory._shibSquadMove = undefined;
        const follower = Game.getObjectById(creep.memory.squadMembers[0]);
        if (follower) {
            if (follower.clearBoostLabs) follower.clearBoostLabs();
            if (!follower.memory.misc) follower.memory.misc = {};
            follower.memory.misc.waitFor = 2;
            follower.memory.misc.sealed = true;
            follower.memory.quadWiden = undefined;
            follower.memory._shibSquadMove = undefined;
        }
        return true;
    }

    // Fallback assemble point when the current tile cannot host the 2×2.
    // Dest or a threatened room: sit on the entry exit. Callers skip this
    // when isCurrentPosViable is already true.
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

    onDestFacingExit(creep, dest) {
        return this.posFacesDest(creep.pos, dest || creep.memory.destination);
    }

    posFacesDest(pos, dest) {
        if (!pos || !dest) return false;
        const dir = exitDirectionTo(pos.roomName, dest);
        if (!dir) return false;
        if (dir === TOP) return pos.y === 0;
        if (dir === BOTTOM) return pos.y === 49;
        if (dir === LEFT) return pos.x === 0;
        if (dir === RIGHT) return pos.x === 49;
        return false;
    }

    // Walkable dest-facing exit tiles for the 2-wide column/row aligned with
    // `along` (leader). Each follower takes a unique tile so they don't pile
    // onto the leader's column and bounce the hop.
    alignExitSpot(creep, dir, along, leader) {
        const roomName = creep.room.name;
        const terrain = creep.room.getTerrain();
        let x = along.x;
        let y = along.y;
        if (dir === RIGHT) x = 49;
        else if (dir === LEFT) x = 0;
        else if (dir === TOP) y = 0;
        else y = 49;
        const walkable = (tx, ty) => {
            if (tx < 0 || tx > 49 || ty < 0 || ty > 49) return false;
            if (terrain.get(tx, ty) === TERRAIN_MASK_WALL) return false;
            return !new RoomPosition(tx, ty, roomName).checkForImpassible(false, true);
        };

        const candidates = [];
        const add = (tx, ty) => {
            if (!walkable(tx, ty)) return;
            for (let i = 0; i < candidates.length; i++) {
                if (candidates[i].x === tx && candidates[i].y === ty) return;
            }
            candidates.push(new RoomPosition(tx, ty, roomName));
        };

        add(x, y);
        const squadSize = ((leader && leader.memory.squadMembers) || []).length + 1;
        if (squadSize > 2) {
            const orientation = (leader && leader.memory.squadOrientation) || 0;
            const offsets = QUAD_OFFSETS[orientation] || [];
            for (let i = 0; i < offsets.length; i++) {
                const {dx, dy} = offsets[i];
                if ((dir === RIGHT || dir === LEFT) && dx === 0) add(x, y + dy);
                else if ((dir === TOP || dir === BOTTOM) && dy === 0) add(x + dx, y);
            }
        }
        const alongX = dir === TOP || dir === BOTTOM;
        for (let d = 1; d <= 4; d++) {
            if (alongX) {
                add(x + d, y);
                add(x - d, y);
            } else {
                add(x, y + d);
                add(x, y - d);
            }
        }
        if (!candidates.length) return null;

        const occupied = new Set();
        if (leader) {
            for (const id of leader.memory.squadMembers || []) {
                if (id === creep.id) continue;
                const m = Game.getObjectById(id);
                if (m && m.pos.roomName === roomName) occupied.add(`${m.pos.x},${m.pos.y}`);
            }
        }
        for (let i = 0; i < candidates.length; i++) {
            const s = candidates[i];
            const occupant = s.checkForCreep();
            if (occupant && occupant.id !== creep.id) occupied.add(`${s.x},${s.y}`);
        }
        const claimed = formupClaims((leader && leader.id) || creep.id);
        for (const id in claimed) {
            if (id !== creep.id) occupied.add(claimed[id]);
        }

        const claim = (pos) => {
            claimed[creep.id] = `${pos.x},${pos.y}`;
            return pos;
        };

        // Soft-assign: already on the dest-facing column, stay.
        // Duos: only the matching exit tile so they fit a 1-wide dest hole.
        const coreCount = squadSize <= 2 ? Math.min(1, candidates.length) : Math.min(2, candidates.length);
        for (let i = 0; i < coreCount; i++) {
            if (creep.pos.isEqualTo(candidates[i])) return claim(creep.pos);
        }

        const pickUnoccupied = (from, to) => {
            let best = null;
            let bestDist = Infinity;
            for (let i = from; i < to; i++) {
                const s = candidates[i];
                if (occupied.has(`${s.x},${s.y}`)) continue;
                const d = creep.pos.getRangeTo(s);
                if (d < bestDist) {
                    bestDist = d;
                    best = s;
                }
            }
            return best;
        };

        const spot = pickUnoccupied(0, coreCount) || pickUnoccupied(coreCount, candidates.length);
        return spot ? claim(spot) : null;
    }

    // Dest-side tiles the front column/row would land on. Terrain always;
    // structures only with vision.
    destFrontOpen(dest, dir, lx, ly, orientation) {
        if (!dest) return false;
        const offsets = QUAD_OFFSETS[orientation] || [];
        const staging = [{x: lx, y: ly}];
        for (let i = 0; i < offsets.length; i++) {
            const {dx, dy} = offsets[i];
            if ((dir === RIGHT || dir === LEFT) && dx === 0) staging.push({x: lx, y: ly + dy});
            else if ((dir === TOP || dir === BOTTOM) && dy === 0) staging.push({x: lx + dx, y: ly});
        }
        if (staging.length < 2) return false;
        const terrain = Game.map.getRoomTerrain(dest);
        const destRoom = Game.rooms[dest];
        for (let i = 0; i < staging.length; i++) {
            let dx = staging[i].x;
            let dy = staging[i].y;
            if (dir === RIGHT) dx = 0;
            else if (dir === LEFT) dx = 49;
            else if (dir === TOP) dy = 49;
            else dy = 0;
            if (dx < 0 || dx > 49 || dy < 0 || dy > 49) return false;
            if (terrain.get(dx, dy) === TERRAIN_MASK_WALL) return false;
            if (destRoom && new RoomPosition(dx, dy, dest).checkForImpassible(false, true)) return false;
        }
        return true;
    }

    squadSplitAcrossDest(creep, dest) {
        dest = dest || creep.memory.destination;
        if (!dest) return false;
        const members = this.squadForWave(creep);
        let inDest = 0;
        let inOther = 0;
        for (let i = 0; i < members.length; i++) {
            if (!members[i]) continue;
            if (members[i].pos.roomName === dest) inDest++;
            else inOther++;
        }
        return inDest > 0 && inOther > 0;
    }

    inwardMoveDir(pos) {
        const inward = this.entryInward(pos);
        if (!inward) return 0;
        if (inward.dx === 1) return RIGHT;
        if (inward.dx === -1) return LEFT;
        if (inward.dy === 1) return BOTTOM;
        if (inward.dy === -1) return TOP;
        return 0;
    }

    shouldPreHeal(creep) {
        const dest = creep.memory.destination;
        if (!dest) return false;
        if (this.squadSplitAcrossDest(creep, dest)) return true;
        if (this.onDestFacingExit(creep, dest)) return true;
        const leader = creep.memory.leader ? creep : Game.getObjectById(creep.memory.groupLeader);
        if (leader && leader.id !== creep.id && this.onDestFacingExit(leader, dest)
            && formationRange(creep.pos, leader.pos) <= 1) return true;
        return false;
    }

    onRoomExitTile(pos) {
        return !!(pos && (pos.x === 0 || pos.x === 49 || pos.y === 0 || pos.y === 49));
    }

    squadOnDestExit(creep) {
        const dest = creep.memory.destination;
        if (!dest) return false;
        const members = this.squadForWave(creep);
        for (let i = 0; i < members.length; i++) {
            const m = members[i];
            if (m && m.pos.roomName === dest && this.onRoomExitTile(m.pos)) return true;
        }
        return false;
    }

    // Packed dest hop / inward slide. shibSquadStep refuses the step when the
    // next footprint does not fit, which is how we occupy "as much as fits":
    // full 2×2 off the exit, 2×2 still on dest-exit, or 2 dest-exit + 2 staging.
    stepFormationIntoDest(creep) {
        const dest = creep.memory.destination;
        if (!dest || !creep.shibSquadStep) return false;
        const dir = creep.room.name === dest
            ? this.inwardMoveDir(creep.pos)
            : exitDirectionTo(creep.room.name, dest);
        if (!dir) return false;
        return !!creep.shibSquadStep(dir);
    }

    // Packed on the dest-facing exit (or already straddling it): step the
    // formation across together. Unpacked: form dest-inward, then walk onto
    // that exit. Never path to dest 25,25 from here — that is 1-at-a-time entry.
    holdForSquadEntry(creep, squad) {
        const live = (creep.memory.squadMembers || []).length + 1;
        if (live < 2 || !creep.memory.destination) return false;
        if (creep.ensureDenialStaging) creep.ensureDenialStaging();
        const dest = creep.memory.destination;
        const inDest = creep.room.name === dest;
        const sharesExit = !!exitDirectionTo(creep.room.name, dest);
        const split = this.squadSplitAcrossDest(creep, dest);
        // Home that's not dest-adjacent: leave unpacked and pack in the next room.
        if (this.inHomeColony(creep) && !sharesExit && !split) return false;
        if (!inDest && !sharesExit && !split) return false;

        // Intel picked a staging neighbor. Do not hop in from a different
        // adjacent room just because the shortest path brushed dest's other face.
        const staging = creep.memory.misc && creep.memory.misc.stagingRoom;
        const stagingShares = !!(staging && staging !== dest && exitDirectionTo(staging, dest));
        if (!inDest && !split && stagingShares && creep.room.name !== staging) {
            this.leaderTransit(new RoomPosition(25, 25, staging), {range: 22});
            return true;
        }

        const fullSquad = (squad || this.getSquad()).concat(creep);
        const together = this.isFormationPacked(fullSquad, creep);
        const tired = !!(creep.fatigue || fullSquad.some(c => c && c.fatigue));

        if (split) {
            if (together) {
                if (this.stepFormationIntoDest(creep)) return true;
                if (tired) return true;
                // Next footprint does not fit (barriers 1 tile in). Hold this
                // occupancy — typically 2 on dest-exit, 2 still on staging — and fight.
                return false;
            }
            if (inDest) {
                // Wait on dest-exit for the back row. Wandering the interior
                // is how a solo cluster tried to re-form in dest.
                if (!this.onRoomExitTile(creep.pos)) {
                    creep.moveToRoomExit(staging);
                    return true;
                }
                return false;
            }
        }

        if (inDest) {
            if (together && this.squadOnDestExit(creep)) {
                if (this.stepFormationIntoDest(creep)) return true;
                if (tired) return true;
            }
            return false;
        }

        this.clearQuadSnake(creep);

        const exitSpot = this.findStaging(creep);
        const goToExit = () => {
            if (!exitSpot || (creep.pos.x === exitSpot.x && creep.pos.y === exitSpot.y)) return false;
            if (together && live > 2) this.leaderTransit(exitSpot, {range: 0});
            else creep.shibMove(exitSpot, {range: 0, forceSolo: true});
            return true;
        };

        if (!together) {
            // Dest-inward 2×2 fits here: wait for followers to slot instead of
            // dragging an unpacked blob onto the exit (front row leaks into dest).
            if (this.isQuad(creep)) {
                const destDir = exitDirectionTo(creep.room.name, dest);
                const destOrients = destDir ? this.destExitOrients(destDir) : [];
                const facing = creep.memory.squadOrientation || 0;
                if (destOrients.includes(facing) && this.orientationFits(creep, facing)
                    && !this.onSpawnApron(creep)) {
                    return true;
                }
            }
            goToExit();
            return true;
        }

        if (this.onDestFacingExit(creep, dest)) {
            if (this.stepFormationIntoDest(creep)) return true;
            if (tired) return true;
            // Hop failed and nobody is tired: another pad if we have one.
            // Stay on this exit rather than dest 25,25.
            if (goToExit()) return true;
            return true;
        }

        // Packed formation still in this room: walk onto the dest-facing pad.
        goToExit();
        return true;
    }

    // Packed 2×2: op bookkeeping only, then step the formation as one.
    leadPackedQuad(creep) {
        if (creep.memory.operation === 'stronghold') {
            creep.strongholdAttack({squadMove: true});
            if (creep.memory.operation !== 'stronghold') return;
        } else if (creep.memory.operation === 'roomDenial') {
            creep.denyRoom({squadMove: true});
            if (creep.memory.operation !== 'roomDenial') return;
        }

        if (creep.memory.destination && creep.room.name === creep.memory.destination) {
            if (this.squadSplitAcrossDest(creep) || this.squadOnDestExit(creep)) {
                if (this.stepFormationIntoDest(creep)) return;
                // Cannot slide further: fight from this occupancy (2 in dest on
                // the exit with the rest still on staging, or everyone in dest
                // with the back row still on dest-exit).
            }
            if (this.holdForQuadWiden(creep)) return;
            if (this.entryInward(creep.pos)) {
                const barrier = this.pickBorderBreachTarget(creep, this.isQuad(creep) ? 2 : 1);
                if (this.applyBreachTarget(creep, barrier)) {
                    const range = this.barrierApproachRange(barrier);
                    if (creep.pos.getRangeTo(barrier) > range) this.leaderTransit(barrier, {range});
                    return;
                }
            }

            let hostile;
            if (creep.memory.operation === 'stronghold' && creep.pickStrongholdTarget) {
                hostile = creep.pickStrongholdTarget();
            } else {
                hostile = Game.getObjectById(creep.memory.target) || creep.findClosestEnemy(false, false);
            }
            if (hostile) {
                creep.memory.target = hostile.id;
                const moved = this.advancePackedQuad(creep, hostile);
                if (moved === false) {
                    creep.memory.quadPathBlocked = true;
                    this.applyPathBlockedBreach(creep);
                } else if (moved) {
                    creep.memory.quadPathBlocked = undefined;
                }
                return;
            }
            if (creep.memory.operation === 'stronghold') return;
            if (creep.room.controller && creep.pos.getRangeTo(creep.room.controller) > 5) {
                const moved = this.leaderTransit(creep.room.controller, {range: 4});
                if (moved === false) {
                    creep.memory.quadPathBlocked = true;
                    this.applyPathBlockedBreach(creep);
                } else if (moved) {
                    creep.memory.quadPathBlocked = undefined;
                }
                return;
            }
            return;
        }

        if (creep.memory.destination) {
            return this.transitToOpTarget(creep);
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

    towerOperateMultiplier(tower) {
        if (!tower || !tower.effects || !tower.effects.length) return 1;
        let op;
        for (let i = 0; i < tower.effects.length; i++) {
            if (tower.effects[i].effect === PWR_OPERATE_TOWER) {
                op = tower.effects[i];
                break;
            }
        }
        if (!op || !op.level || !POWER_INFO[PWR_OPERATE_TOWER]) return 1;
        return 1 + (POWER_INFO[PWR_OPERATE_TOWER].effect[op.level - 1] / 100);
    }

    liveTowerDump(towers) {
        let dump = 0;
        for (let i = 0; i < towers.length; i++) {
            dump += TOWER_POWER_ATTACK * this.towerOperateMultiplier(towers[i]);
        }
        return dump;
    }

    canTankLiveTowers(creep) {
        const towers = this.liveHostileTowers();
        if (!towers.length) return true;
        const squad = this.getSquad().concat(creep);
        let hps = 0;
        for (let i = 0; i < squad.length; i++) {
            hps += abilityPower(squad[i].body).effectiveHeal;
        }
        return hps >= this.liveTowerDump(towers);
    }

    fallBackFromTowers(creep) {
        if (creep.ensureDenialStaging) creep.ensureDenialStaging();
        const staging = creep.memory.misc && creep.memory.misc.stagingRoom;
        if (staging && staging !== creep.room.name) {
            return this.leaderTransit(new RoomPosition(25, 25, staging), {range: 22});
        }
        return creep.moveToRoomExit(staging || creep.memory.colony);
    }

    // Range 3 on the target unless live towers would dump 600/tick into the 2×2.
    // Empty towers do not count. Too close without the heal budget → walk back out.
    // Cannot-tank used to orbit range 7 of the closest tower (outside RA 3), so
    // the squad never chipped a wall. Fall back to dest-exit and breach instead.
    advancePackedQuad(creep, hostile) {
        const towers = this.liveHostileTowers();
        if (towers.length && !this.canTankLiveTowers(creep)) {
            let closestRange = creep.pos.getRangeTo(towers[0]);
            for (let i = 1; i < towers.length; i++) {
                const r = creep.pos.getRangeTo(towers[i]);
                if (r < closestRange) closestRange = r;
            }
            const lethalRange = (typeof TOWER_OPTIMAL_RANGE === 'number') ? TOWER_OPTIMAL_RANGE : 5;
            if (closestRange <= lethalRange) return this.fallBackFromTowers(creep);

            const isTower = hostile.structureType === STRUCTURE_TOWER;
            if (creep.pos.getRangeTo(hostile) <= 3 && !isTower) return;

            const barrier = this.pickBorderBreachTarget(creep, this.isQuad(creep) ? 2 : 1);
            if (this.applyBreachTarget(creep, barrier)) {
                const range = this.barrierApproachRange(barrier);
                if (creep.pos.getRangeTo(barrier) > range) return this.leaderTransit(barrier, {range});
                return;
            }
            // Already outside full tower dump. Falling back to staging just so
            // holdForSquadEntry hops us in again wastes TTL. Hold and fire.
            return;
        }
        return this.leaderTransit(hostile, {range: this.barrierApproachRange(hostile)});
    }

    rampartOccupiedByMelee(rampart) {
        if (!rampart || !rampart.pos) return false;
        const creeps = rampart.pos.lookFor(LOOK_CREEPS);
        for (let i = 0; i < creeps.length; i++) {
            const c = creeps[i];
            if (c && !c.my && c.hasActiveBodyparts(ATTACK)) return true;
        }
        return false;
    }

    // Walls/empty ramparts: range 1 with the group. A melee defender on the
    // rampart keeps us at 3 so we do not walk into the ATTACK hit.
    barrierApproachRange(target) {
        if (!target) return 3;
        if (target.structureType === STRUCTURE_WALL) return 1;
        if (target.structureType === STRUCTURE_RAMPART) {
            return this.rampartOccupiedByMelee(target) ? 3 : 1;
        }
        if (target.pos && target.pos.checkForRampart) {
            const rampart = target.pos.checkForRampart();
            if (rampart && !rampart.my && !rampart.isPublic) {
                return this.rampartOccupiedByMelee(rampart) ? 3 : 1;
            }
        }
        return 3;
    }

    // Hostile wall/rampart on a tile, or null. Lower-hits structure first when
    // both sit on the same tile — that one dies sooner and we retarget the rest.
    hostileBarrierAt(pos) {
        const structs = pos.lookFor(LOOK_STRUCTURES);
        let best = null;
        for (let i = 0; i < structs.length; i++) {
            const s = structs[i];
            if (s.structureType === STRUCTURE_WALL) {
                if (s.my) continue;
            } else if (s.structureType === STRUCTURE_RAMPART) {
                if (s.my || s.isPublic) continue;
                try {
                    if (s.owner && FRIENDLIES.includes(s.owner.username)) continue;
                } catch (e) {
                }
            } else continue;
            if (!best || s.hits < best.hits) best = s;
        }
        return best;
    }

    // Terrain 1-wide: nothing to shoot, 2×2 cannot pack. Leader forceSolo-s
    // through; followers trail like a duo. Starts on the dest strip or a
    // puncture; continues until a 2×2 fits so a long choke is not a freeze.
    snakeTerrainChoke(creep, squad) {
        if (!this.isQuad(creep) || creep.room.name !== creep.memory.destination) {
            this.clearQuadSnake(creep);
            return false;
        }
        const full = (squad || this.getSquad()).concat(creep);
        if (this.isFormationPacked(full, creep) || this.isCurrentPosViable(creep)) {
            this.clearQuadSnake(creep);
            return false;
        }

        const inward = this.entryInward(creep.pos);
        if (inward && this.pickBorderBreachTarget(creep, 2)) {
            this.clearQuadSnake(creep);
            return false;
        }
        if (inward) creep.memory.quadSnakeDir = inward;

        const choke = inward || this.isTerrainChoke(creep);
        if (!creep.memory.quadSnake && !choke) return false;
        if (!creep.memory.quadSnakeDir) {
            const along = this.terrainChokeDir(creep);
            if (along) creep.memory.quadSnakeDir = along;
        }

        creep.memory.quadSnake = true;
        const dir = creep.memory.quadSnakeDir;
        if (dir) {
            const nx = creep.pos.x + dir.dx;
            const ny = creep.pos.y + dir.dy;
            if (nx >= 1 && nx <= 48 && ny >= 1 && ny <= 48) {
                const step = new RoomPosition(nx, ny, creep.room.name);
                if (!step.checkForImpassible(false, true)) {
                    const md = creep.pos.getDirectionTo(step);
                    if (md) creep.move(md);
                    else creep.shibMove(step, {range: 0, forceSolo: true});
                    return true;
                }
            }
        }
        creep.shibMove(new RoomPosition(25, 25, creep.room.name), {range: 10, forceSolo: true});
        return true;
    }

    isTerrainChoke(creep) {
        return this.isWallPuncture(creep.pos.x, creep.pos.y, creep.room, creep.room.getTerrain());
    }

    terrainChokeDir(creep) {
        const terrain = creep.room.getTerrain();
        const blocked = (tx, ty) => {
            if (tx < 0 || tx > 49 || ty < 0 || ty > 49) return true;
            if (terrain.get(tx, ty) === TERRAIN_MASK_WALL) return true;
            return !!this.hostileBarrierAt(new RoomPosition(tx, ty, creep.room.name));
        };
        const {x, y} = creep.pos;
        const ns = blocked(x, y - 1) && blocked(x, y + 1);
        const ew = blocked(x - 1, y) && blocked(x + 1, y);
        if (ns && !ew) return {dx: x < 25 ? 1 : -1, dy: 0};
        if (ew && !ns) return {dx: 0, dy: y < 25 ? 1 : -1};
        return {dx: x < 25 ? 1 : x > 25 ? -1 : 0, dy: y < 25 ? 1 : y > 25 ? -1 : 0};
    }

    clearQuadSnake(creep) {
        if (creep.memory.quadSnake) creep.memory.quadSnake = undefined;
        if (creep.memory.quadSnakeDir) creep.memory.quadSnakeDir = undefined;
    }

    // Just inside a dest exit: [exit][one walkable][barrier line].
    entryInward(pos) {
        if (pos.x <= 2) return {dx: 1, dy: 0};
        if (pos.x >= 47) return {dx: -1, dy: 0};
        if (pos.y <= 2) return {dx: 0, dy: 1};
        if (pos.y >= 47) return {dx: 0, dy: -1};
        return null;
    }

    applyBreachTarget(creep, barrier) {
        if (!barrier) return false;
        creep.memory.target = barrier.id;
        creep.memory.quadWiden = true;
        return true;
    }

    // Open a gap in a border wall. Duos need 1 tile; quads need 2 adjacent
    // tiles so the 2×2 can step off the strip into the room.
    pickBorderBreachTarget(creep, width) {
        const inward = this.entryInward(creep.pos);
        if (!inward) return null;
        const room = creep.room;
        const along = inward.dx !== 0 ? {dx: 0, dy: 1} : {dx: 1, dy: 0};
        const cx = creep.pos.x;
        const cy = creep.pos.y;
        let best = null;
        let bestScore = Infinity;

        for (let step = 1; step <= 2; step++) {
            const wx = cx + inward.dx * step;
            const wy = cy + inward.dy * step;
            let foundOnThisLine = false;
            for (let k = -4; k <= 4; k++) {
                const x = wx + along.dx * k;
                const y = wy + along.dy * k;
                if (x < 1 || x > 48 || y < 1 || y > 48) continue;
                const barrier = this.hostileBarrierAt(new RoomPosition(x, y, room.name));
                if (!barrier) continue;
                if (creep.pos.getRangeTo(barrier) > 3) continue;
                foundOnThisLine = true;
                let score = barrier.hits + Math.abs(k) * 1e5;
                if (width >= 2) {
                    const nx = x + along.dx;
                    const ny = y + along.dy;
                    let pairOpen = 0;
                    let pairHits = barrier.hits;
                    if (nx >= 1 && nx <= 48 && ny >= 1 && ny <= 48) {
                        const npos = new RoomPosition(nx, ny, room.name);
                        const nb = this.hostileBarrierAt(npos);
                        if (nb) pairHits += nb.hits;
                        else if (room.getTerrain().get(nx, ny) !== TERRAIN_MASK_WALL
                            && !npos.checkForImpassible(false, true)) {
                            pairOpen = 1;
                        }
                    }
                    score = (1 - pairOpen) * 1e12 + pairHits + Math.abs(k) * 1e5;
                }
                if (score < bestScore) {
                    bestScore = score;
                    best = barrier;
                }
            }
            if (foundOnThisLine) break;
        }
        return best;
    }

    applyPathBlockedBreach(creep) {
        if (this.isQuad(creep)) {
            this.pickQuadWidenTarget(creep, false);
            return;
        }
        const barrier = this.pickBorderBreachTarget(creep, 1) || this.closestBarrierInRange(creep, 3);
        this.applyBreachTarget(creep, barrier);
    }

    closestBarrierInRange(creep, range) {
        let best = null;
        let bestScore = Infinity;
        const room = creep.room;
        const {x, y} = creep.pos;
        for (let dx = -range; dx <= range; dx++) {
            for (let dy = -range; dy <= range; dy++) {
                const tx = x + dx;
                const ty = y + dy;
                if (tx < 1 || tx > 48 || ty < 1 || ty > 48) continue;
                const barrier = this.hostileBarrierAt(new RoomPosition(tx, ty, room.name));
                if (!barrier) continue;
                const cheb = Math.max(Math.abs(dx), Math.abs(dy));
                const score = cheb * 1e12 + barrier.hits;
                if (score < bestScore) {
                    bestScore = score;
                    best = barrier;
                }
            }
        }
        return best;
    }

    // Walkable tile in a 1-wide wall gap: both east-west or both north-south
    // neighbors are barriers/terrain. A 2-wide opening fails this, which is
    // when a packed 2×2 can step through.
    isWallPuncture(x, y, room, terrain) {
        const blocked = (tx, ty) => {
            if (tx < 0 || tx > 49 || ty < 0 || ty > 49) return true;
            if (terrain.get(tx, ty) === TERRAIN_MASK_WALL) return true;
            return !!this.hostileBarrierAt(new RoomPosition(tx, ty, room.name));
        };
        return (blocked(x, y - 1) && blocked(x, y + 1)) || (blocked(x - 1, y) && blocked(x + 1, y));
    }

    // Sit at range 1 of the barrier we're opening (3 if a melee defender is
    // on that rampart). Do not chase through the 1-tile hole — the 2×2 still
    // cannot follow.
    holdForQuadWiden(creep) {
        if (!creep.memory.quadWiden) return false;
        const gap = Game.getObjectById(creep.memory.target);
        if (!gap || !gap.hits) {
            creep.memory.quadWiden = undefined;
            return false;
        }
        const range = this.barrierApproachRange(gap);
        if (creep.pos.getRangeTo(gap) > range) this.leaderTransit(gap, {range});
        return true;
    }

    // Open a 2×2 in a punched outer wall. `partialOnly` keeps us on an existing
    // 1-tile hole (the stuck case). When transit fails with no hole, also start
    // a 2-wide breach instead of chipping a single tile.
    pickQuadWidenTarget(creep, partialOnly) {
        if (!this.isQuad(creep)) return false;
        const armedClose = this.room.hostileCreeps.some(c =>
            (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK))
            && creep.pos.getRangeTo(c) <= 3
            && !c.pos.checkForRampart());
        if (armedClose) {
            creep.memory.quadWiden = undefined;
            return false;
        }

        const room = creep.room;
        const terrain = room.getTerrain();
        const lx = creep.pos.x;
        const ly = creep.pos.y;
        const goal = Game.getObjectById(creep.memory.target) || room.controller;
        const minX = Math.max(1, lx - 4);
        const maxX = Math.min(47, lx + 4);
        const minY = Math.max(1, ly - 4);
        const maxY = Math.min(47, ly + 4);
        const squadTiles = new Set();
        squadTiles.add(lx + ',' + ly);
        for (const id of creep.memory.squadMembers || []) {
            const m = Game.getObjectById(id);
            if (m && m.pos.roomName === room.name) squadTiles.add(m.pos.x + ',' + m.pos.y);
        }

        let bestBarrier = null;
        let bestScore = Infinity;

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                const tiles = [
                    {x: x, y: y},
                    {x: x + 1, y: y},
                    {x: x, y: y + 1},
                    {x: x + 1, y: y + 1}
                ];
                let walkable = 0;
                let holeAwayFromUs = false;
                let blocked = false;
                const barriers = [];
                for (let i = 0; i < 4; i++) {
                    const t = tiles[i];
                    if (t.x > 48 || t.y > 48) {
                        blocked = true;
                        break;
                    }
                    if (terrain.get(t.x, t.y) === TERRAIN_MASK_WALL) {
                        blocked = true;
                        break;
                    }
                    const pos = new RoomPosition(t.x, t.y, room.name);
                    const barrier = this.hostileBarrierAt(pos);
                    if (barrier) barriers.push(barrier);
                    else if (!pos.checkForImpassible(false, true)) {
                        walkable++;
                        // A 1-wide punch has barriers on both opposite sides.
                        // Standing against a wall is not a puncture, and a
                        // 2-wide opening no longer is either — so we stop
                        // once the 2×2 can actually fit.
                        if (!squadTiles.has(t.x + ',' + t.y)
                            && this.isWallPuncture(t.x, t.y, room, terrain)) {
                            holeAwayFromUs = true;
                        }
                    } else {
                        blocked = true;
                        break;
                    }
                }
                if (blocked || !barriers.length) continue;
                if (partialOnly && (walkable < 1 || !holeAwayFromUs)) continue;

                let inShot = false;
                let weakest = barriers[0];
                let hits = 0;
                for (let i = 0; i < barriers.length; i++) {
                    hits += barriers[i].hits;
                    if (barriers[i].hits < weakest.hits) weakest = barriers[i];
                    if (creep.pos.getRangeTo(barriers[i]) <= 3) inShot = true;
                }
                if (!inShot && creep.pos.getRangeTo(new RoomPosition(x, y, room.name)) > 5) continue;

                let goalDist = 0;
                if (goal && goal.pos && goal.pos.roomName === room.name) {
                    goalDist = Math.abs(x + 0.5 - goal.pos.x) + Math.abs(y + 0.5 - goal.pos.y);
                }
                // Almost-open gaps first, then toward the goal, then cheaper walls.
                const score = (3 - walkable) * 1e12 + goalDist * 1e6 + hits;
                if (score < bestScore) {
                    bestScore = score;
                    bestBarrier = weakest;
                }
            }
        }

        if (!bestBarrier) {
            creep.memory.quadWiden = undefined;
            return false;
        }
        creep.memory.target = bestBarrier.id;
        creep.memory.quadWiden = true;
        return true;
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

        // Op cancelled or safemode-converted to remoteDenial: forming waves
        // recycle at home. destOpLive is still true after safemode.
        const dest = creep.memory.destination;
        const siegeOp = creep.memory.operation === 'roomDenial' || creep.memory.operation === 'stronghold';
        const destGone = dest && (siegeOp ? !this.destSiegeLive(dest) : !this.destOpLive(dest));
        if (destGone && !['borderPatrol', 'guard'].includes(creep.memory.operation)) {
            const home = (creep.memory.misc && creep.memory.misc.formColony) || creep.memory.colony;
            const atHome = !!(home && creep.room.name === home);
            if (!this.isSquadCommitted(creep) && atHome) return false;
            const liveType = dest && (Memory.targetRooms[dest] || Memory.auxiliaryTargets[dest]);
            const liveOp = liveType && liveType.type;
            creep.memory.operation = liveOp === 'remoteDenial' ? 'remoteDenial'
                : (HARASSMENT_OPERATIONS ? 'harass' : 'borderPatrol');
            if (!creep.memory.misc) creep.memory.misc = {};
            creep.memory.misc.waitFor = 0;
        }

        // Two in dest: attack. Waiting for waitFor 4 (or a missing boostAttempt
        // flag) is what parks a tanking pair on the exit for a 3rd.
        if (this.canFightAsDuo(creep)) return true;

        const squad = this.getSquad();
        if (squad.some(c => !c.memory.boostAttempt)) return false;

        const liveCount = (creep.memory.squadMembers || []).length;
        return creep.memory.misc.waitFor <= liveCount + 1;
    }

    isFormationPacked(creeps, leader) {
        const live = [];
        for (let i = 0; i < creeps.length; i++) {
            if (creeps[i]) live.push(creeps[i]);
        }
        // Duo leftover: hug the leader.
        if (live.length < 3) {
            for (let i = 0; i < live.length; i++) {
                if (live[i].id === leader.id) continue;
                if (formationRange(live[i].pos, leader.pos) > 1) return false;
            }
            return true;
        }
        // 3-creep remnant: both followers on the L (cardinal slots), not a
        // line. A hug-only check counted a column as packed and never L-formed.
        // 4-creep: all three slots, not just a 2×2 blob. Blob-only let a
        // leader-at-the-back 2×2 walk onto dest and leak the front row.
        const squadSize = live.length >= 4 ? 4 : 3;
        const offsets = followerOffsets(leader.memory.squadOrientation || 0, squadSize);
        if (offsets.length) {
            let onSlot = 0;
            for (let i = 0; i < live.length; i++) {
                if (live[i].id === leader.id) continue;
                if (this.onFormationSlot(live[i].pos, leader.pos, offsets)) onSlot++;
                else if (formationRange(live[i].pos, leader.pos) > 1) return false;
            }
            return onSlot >= offsets.length;
        }

        for (let i = 0; i < live.length; i++) {
            for (let j = i + 1; j < live.length; j++) {
                if (formationRange(live[i].pos, live[j].pos) > 1) return false;
            }
        }
        return true;
    }

    onFormationSlot(pos, leaderPos, offsets) {
        for (let i = 0; i < offsets.length; i++) {
            if (this.matchesFormationOffset(pos, leaderPos, offsets[i].dx, offsets[i].dy)) return true;
        }
        return false;
    }

    matchesFormationOffset(pos, leaderPos, dx, dy) {
        let x = leaderPos.x + dx;
        let y = leaderPos.y + dy;
        if (pos.roomName === leaderPos.roomName) return pos.x === x && pos.y === y;
        const exits = Game.map.describeExits(leaderPos.roomName);
        if (!exits) return false;
        let roomName;
        if (x < 0) {
            roomName = exits[LEFT];
            x = 49;
        } else if (x > 49) {
            roomName = exits[RIGHT];
            x = 0;
        }
        if (y < 0) {
            roomName = exits[TOP];
            y = 49;
        } else if (y > 49) {
            roomName = exits[BOTTOM];
            y = 0;
        }
        return roomName === pos.roomName && pos.x === x && pos.y === y;
    }

    findStaging(creep) {
        sweepFormupCaches();
        // Never search inside the dest — a clear 2×2 there is the bunker.
        // Interior packing at home fights the economy; dest-adjacent still uses
        // the dest-facing exit pad so the formation hops in together.
        const squadSize = (creep.memory.squadMembers || []).length + 1;
        if (creep.memory.destination && creep.room.name === creep.memory.destination) return null;

        const roomName = creep.room.name;
        const pos = creep.pos;
        const terrain = creep.room.getTerrain();
        const selfId = creep.id;

        const tileClear = (cx, cy, allowExit) => {
            const lo = allowExit ? 0 : 1;
            const hi = allowExit ? 49 : 48;
            if (cx < lo || cx > hi || cy < lo || cy > hi) return false;
            if (terrain.get(cx, cy) === TERRAIN_MASK_WALL) return false;
            return !new RoomPosition(cx, cy, roomName).checkForImpassible(false, true);
        };

        // Any of the four 2×2 facings. SE/NW-only missed a valid NE/SW pad
        // when the legacy leader corner was claimed.
        const footprintClear = (x, y, allowExit) => {
            if (!tileClear(x, y, allowExit)) return false;
            for (let o = 0; o < 4; o++) {
                const offsets = QUAD_OFFSETS[o];
                if (!offsets) continue;
                let ok = true;
                for (let i = 0; i < offsets.length; i++) {
                    if (!tileClear(x + offsets[i].dx, y + offsets[i].dy, allowExit)) {
                        ok = false;
                        break;
                    }
                }
                if (ok) return true;
            }
            return false;
        };
        const claimedByOther = (x, y) => {
            for (const id in stagingCache) {
                if (id === selfId) continue;
                const c = stagingCache[id];
                if (!c || c.roomName !== roomName || c.tick + STAGING_CACHE_TTL <= Game.time) continue;
                if (Math.abs(c.x - x) <= 1 && Math.abs(c.y - y) <= 1) return true;
            }
            return false;
        };

        const dest = creep.memory.destination;
        if (dest && dest !== roomName && exitDirectionTo(roomName, dest)) {
            const exitSpot = this.findExitStaging(creep, dest, claimedByOther, tileClear);
            if (exitSpot) {
                stagingCache[selfId] = {x: exitSpot.x, y: exitSpot.y, tick: Game.time, roomName};
                if (exitSpot.orientation !== undefined) creep.memory.squadOrientation = exitSpot.orientation;
                return new RoomPosition(exitSpot.x, exitSpot.y, roomName);
            }
        }

        // Duos only need the dest-facing tile. An interior 2×2 pad is quad-only.
        if (squadSize <= 2) return null;

        // Dest-adjacent exit pad is allowed at home; an interior 2×2 pad is not.
        if (this.inHomeColony(creep) && !this.room.hostileCreeps.length) return null;

        const cached = stagingCache[selfId];
        if (cached && cached.tick + STAGING_CACHE_TTL > Game.time && cached.roomName === roomName
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

    // Leader on the dest-facing corner: 0 NW / 1 SE / 2 NE / 3 SW.
    destExitOrients(dir) {
        if (dir === TOP) return [0, 2];
        if (dir === RIGHT) return [1, 2];
        if (dir === BOTTOM) return [1, 3];
        if (dir === LEFT) return [0, 3];
        return [];
    }

    destLandingWalkable(dest, dir, x, y) {
        if (!dest) return false;
        let dx = x;
        let dy = y;
        if (dir === RIGHT) dx = 0;
        else if (dir === LEFT) dx = 49;
        else if (dir === TOP) dy = 49;
        else dy = 0;
        if (dx < 0 || dx > 49 || dy < 0 || dy > 49) return false;
        const terrain = Game.map.getRoomTerrain(dest);
        if (terrain.get(dx, dy) === TERRAIN_MASK_WALL) return false;
        const destRoom = Game.rooms[dest];
        if (destRoom && new RoomPosition(dx, dy, dest).checkForImpassible(false, true)) return false;
        return true;
    }

    // Dest-facing pad. Quads: 2×2 extending inward so the next step is a packed
    // cross. Duos: a single dest-facing tile whose dest landing is open (1×1).
    findExitStaging(creep, dest, claimedByOther, tileClear) {
        const dir = creep.room.findExitTo(dest);
        if (!(dir > 0)) return null;
        const tiles = creep.room.find(dir);
        if (!tiles.length) return null;
        const squadSize = (creep.memory.squadMembers || []).length + 1;
        const orients = squadSize > 2 ? this.destExitOrients(dir) : [0];
        if (!orients.length) return null;

        let best = null;
        let bestScore = Infinity;

        if (squadSize <= 2) {
            for (let i = 0; i < tiles.length; i++) {
                const lx = tiles[i].x;
                const ly = tiles[i].y;
                if (lx < 0 || lx > 49 || ly < 0 || ly > 49) continue;
                if (claimedByOther(lx, ly) || !tileClear(lx, ly, true)) continue;
                const open = this.destLandingWalkable(dest, dir, lx, ly);
                const score = (open ? 0 : 10000) + creep.pos.getRangeTo(lx, ly);
                if (score >= bestScore) continue;
                bestScore = score;
                best = {x: lx, y: ly, orientation: 0};
            }
            return best;
        }

        for (let i = 0; i < tiles.length; i++) {
            const lx = tiles[i].x;
            const ly = tiles[i].y;
            if (lx < 0 || lx > 49 || ly < 0 || ly > 49) continue;
            if (claimedByOther(lx, ly) || !tileClear(lx, ly, true)) continue;
            for (let o = 0; o < orients.length; o++) {
                const candidate = orients[o];
                const offsets = QUAD_OFFSETS[candidate];
                if (!offsets || !offsets.every(({dx, dy}) => tileClear(lx + dx, ly + dy, true))) continue;
                const open = this.destFrontOpen(dest, dir, lx, ly, candidate);
                const d = creep.pos.getRangeTo(lx, ly);
                // Prefer a 2-wide dest landing, but still pack on our exit when
                // dest is walled — they hop onto the strip and breach in-formation.
                const score = (open ? 0 : 10000) + d;
                if (score >= bestScore) continue;
                bestScore = score;
                best = {x: lx, y: ly, orientation: candidate};
            }
        }
        if (best) return best;
        // No full 2×2 on the exit: still put the leader on a dest-facing tile
        // so holdForSquadEntry does not park a packed blob in the interior.
        for (let i = 0; i < tiles.length; i++) {
            const lx = tiles[i].x;
            const ly = tiles[i].y;
            if (lx < 0 || lx > 49 || ly < 0 || ly > 49) continue;
            if (claimedByOther(lx, ly) || !tileClear(lx, ly, true)) continue;
            const score = 20000 + creep.pos.getRangeTo(lx, ly);
            if (score >= bestScore) continue;
            bestScore = score;
            best = {x: lx, y: ly, orientation: orients[0]};
        }
        return best;
    }

    /* ====================== COMBAT HELPERS ====================== */

    fireRangedAction(creep) {
        if (!creep.hasActiveBodyparts(RANGED_ATTACK)) return;

        const focus = Game.getObjectById(creep.memory.target);
        const focusHere = focus && focus.pos && focus.pos.roomName === creep.room.name
            && creep.pos.getRangeTo(focus) <= 3;

        const hostiles = this.room.hostileCreeps.concat(this.room.hostileStructures || []);
        const inRange = [];
        for (const h of hostiles) {
            if (h instanceof Structure && (h.my || (h.owner && h.owner.username === MY_USERNAME))) continue;
            const r = creep.pos.getRangeTo(h);
            if (r <= 3) inRange.push({h, r});
        }
        // Breach walls are chosen via look, not hostileStructures. Still shoot.
        if (!inRange.length && !focusHere) return;

        // rangedHeal and rangedAttack share the ranged-action intent slot — firing
        // both overwrites the heal. Close heal() is a separate slot and doesn't
        // conflict, so we only need to bail when healInRange queued rangedHeal.
        // A picked breach target still gets the shot — that's why we're parked.
        if (creep.hasActiveBodyparts(HEAL) && !creep.memory.quadWiden && this.healInRangeWouldRangedHeal(creep)) return;

        // Expected mass-attack damage per RANGED_ATTACK part vs focused (10 per part if target in range)
        let expectedMass = 0;
        for (const {h, r} of inRange) {
            expectedMass += r <= 1 ? 10 : r === 2 ? 4 : 1;
        }

        // Packed squads stay on the leader's pick. Mass only when that pick is
        // in the blob and mass beats a focused 10-per-part hit. Widening a wall
        // gap must be focused — mass finishes the closest tile and leaves a
        // 1-wide hole the 2×2 cannot step through.
        if (focusHere) {
            if (creep.memory.quadWiden) creep.rangedAttack(focus);
            else if (inRange.length >= 2 && expectedMass > 10) creep.rangedMassAttack();
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
            if (dir && !wouldEnterDest(creep.pos, dir, creep.memory.destination) && creep.move(dir) === OK) {
                const members = (creep.memory.squadMembers || []).map(id => Game.getObjectById(id)).filter(Boolean);
                for (const m of members) {
                    if (m.pos.getRangeTo(creep) > 1) continue;
                    if (wouldEnterDest(m.pos, dir, creep.memory.destination)) continue;
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
        if (wouldEnterDest(creep.pos, dir, creep.memory.destination)) return false;
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
        // Committed waves never walk home for top-ups; a replacement group
        // forms in the colony instead.
        if (this.isSquadCommitted(creep)) return false;
        if (this.room.hostileCreeps.length) return false;

        const targetSize = creep.memory.misc?.waitFor || 1;
        const currentSize = squad.length + 1;
        // Formed quad remnant of two keeps fighting as a duo. Hostile creeps
        // already skip this trip; walls/towers do not, so a 2-of-4 pair would
        // otherwise walk out of dest the moment the last defender died.
        let undermanned = currentSize < targetSize;
        if (undermanned && currentSize >= 2 && (creep.memory.initialFormUp
            || (creep.memory.destination && creep.room.name === creep.memory.destination))) {
            undermanned = false;
        }

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

        const hostileTowers = this.liveHostileTowers();
        let towerDmg = 0;
        for (let i = 0; i < hostileTowers.length; i++) {
            const t = hostileTowers[i];
            const range = t.pos.getRangeTo(creep);
            const base = (typeof TOWER_POWER_FROM_RANGE === 'function')
                ? TOWER_POWER_FROM_RANGE(range, TOWER_POWER_ATTACK)
                : (range <= 5 ? 600 : range < 20 ? 600 - 450 * (range - 5) / 15 : 150);
            towerDmg += base * this.towerOperateMultiplier(t);
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
                this.creep.strongholdAttack();
                break;
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

    // Staging neighbor until staged; dest-adjacent hops the pad, never dest 25,25.
    transitToOpTarget(creep) {
        if (creep.ensureDenialStaging) creep.ensureDenialStaging();
        const dest = creep.memory.destination;
        if (!dest) return false;
        const transitTarget = (creep.memory.misc && creep.memory.misc.stagingRoom && !creep.memory.misc.staged)
            ? creep.memory.misc.stagingRoom
            : dest;
        const destDir = exitDirectionTo(creep.room.name, transitTarget);
        if (transitTarget === dest && destDir && creep.room.name !== dest) {
            if (this.onDestFacingExit(creep, dest)) {
                if (this.stepFormationIntoDest(creep)) return true;
                return true;
            }
            const pad = this.findStaging(creep);
            if (pad) return this.leaderTransit(pad, {range: 0});
            return true;
        }
        return this.leaderTransit(new RoomPosition(25, 25, transitTarget), {range: 22});
    }

    destinationManagement() {
        if (this.room.name !== this.creep.memory.destination) {
            return this.transitToOpTarget(this.creep);
        }

        // In destination room
        if (this.creep.memory.misc?.stagingRoom === this.room.name
            && this.room.name !== this.creep.memory.destination) {
            this.creep.memory.misc.staged = true;
            return;
        }

        const squad = this.getSquad();
        const isReady = this.squadReadyToFight(this.creep, squad);

        if (isReady) {
            if (this.isQuad(this.creep)) return this.leadPackedQuad(this.creep);
            if (this.creep.handleMilitaryCreep()) return;
            if (this.creep.findDefensivePosition()) this.creep.idleFor(5);
        } else {
            const viable = this.isCurrentPosViable(this.creep);
            if (this.isQuad(this.creep) && viable) return;
            if (this.holdAtExit(this.creep, squad)) return;
            if (!viable) {
                const staging = this.findStaging(this.creep);
                if (staging) this.creep.shibMove(staging, {range: 0, forceSolo: true});
            }
        }
    }
}

profiler.registerClass(RoleLongbowSquad, 'longbowSquad');
module.exports = RoleLongbowSquad;