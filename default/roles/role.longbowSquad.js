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
    posAfterMove,
    offsetPos,
    wouldEnterDest,
    tileBlocked,
    inlandOffExit,
    onExitTile
} = require("module.pathFinder");
const {isBumperCandidate, yieldOccupant} = require("pathTraffic");
const {recordSiegeWave} = require('hcTargets');

const stagingCache = {}; // creepId → {x, y, tick, roomName}
const musterCache = {}; // roomName → {x, y, tick}
const formupAssignCache = {tick: 0, claimed: {}}; // leaderId → {creepId → "x,y"} this tick
const formupSlideCache = {tick: 0, byLeader: {}}; // leaderId → slide plan this tick
const destHopClaim = {tick: 0, claimed: {}}; // dest:x:y this tick so two bodies don't hop the same 1-wide tile
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

function formupSlideFor(leaderId) {
    if (formupSlideCache.tick !== Game.time) {
        formupSlideCache.tick = Game.time;
        formupSlideCache.byLeader = {};
    }
    return formupSlideCache.byLeader[leaderId];
}

function setFormupSlide(leaderId, slide) {
    if (formupSlideCache.tick !== Game.time) {
        formupSlideCache.tick = Game.time;
        formupSlideCache.byLeader = {};
    }
    formupSlideCache.byLeader[leaderId] = slide;
}

function claimDestLanding(dest, x, y) {
    if (destHopClaim.tick !== Game.time) {
        destHopClaim.tick = Game.time;
        destHopClaim.claimed = {};
    }
    const key = dest + ':' + x + ':' + y;
    if (destHopClaim.claimed[key]) return false;
    destHopClaim.claimed[key] = true;
    return true;
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

// Recycle an incomplete wave below this TTL (only if nothing is still incoming).
const FORMING_ABANDON_TTL = 600;

// Incomplete wave with nothing queued/spawning/walking in: recycle after this.
const FORMING_STALL_TICKS = 500;

// Assembled wave waiting on labs. Past this, commit if required boosts landed
// or recycle a siege that never got HEAL/TOUGH.
const BOOST_WAIT_TICKS = 300;

// Top off forming bodies to this TTL before boosting. Boosting blocks renew.
// 25 below cap so a fresh 1500 spawn does not walk back for a single tick.
const FORMING_RENEW_TARGET = CREEP_LIFE_TIME - 25;

// After commit, wait this long for stragglers to reach the leader before
// leaving the colony. Past that, go anyway so one stuck body cannot freeze
// the wave. They gather in place (labs), not back at the muster pad.
const DEPART_GATHER_TICKS = 50;

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
        if (this.shouldAttemptBoost() && this.creep.tryToBoost()) {
            // Solos stay in boost. Uncommitted waitFor still has to run
            // holdForWave so bind/commit/abort can fire while bodies sit at labs.
            if (!(waitFor > 1) || this.isSquadCommitted(this.creep)) return true;
        }
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
        if (creep.memory.hasBoosted) return true;
        // Fresh bodies can still renew after the rest of the wave pops. Boosting
        // now would lock that out. If TTL is already low and no spawn is free,
        // fall through and boost.
        if (!this.waveAssembled(creep) && (creep.ticksToLive || 0) > FORMING_RENEW_TARGET) return false;
        if ((creep.ticksToLive || 0) <= FORMING_RENEW_TARGET && this.renewWave(creep)) return false;
        if (creep.memory.needsRenewal) creep.memory.needsRenewal = undefined;
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
        if (creep.memory.quadSnake && this.isFormationPacked(fullSquad, creep)
            && this.isCurrentPosViable(creep)
            && !this.squadSplitAcrossDest(creep) && !this.squadOnDestExit(creep)) {
            this.clearQuadSnake(creep);
        }

        // Committed waitFor remnant with no living members: dest 25,25 is a solo hop.
        // Uncommitted empty leaders must fall through to holdForWave (bind/abort).
        const waitFor = (creep.memory.misc && creep.memory.misc.waitFor) || 0;
        if (waitFor > 1 && !squad.length && creep.memory.destination !== creep.room.name
            && this.isSquadCommitted(creep)) {
            creep.fleeHome(true);
            return;
        }

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
        // Once a formation-sized hole exists and we can tank, stop pinning the
        // fire target to leftover wall so dest combat can walk through.
        if (creep.memory.destination === creep.room.name) {
            if (this.entryInward(creep.pos)) {
                const needBreach = !this.canTankLiveTowers(creep) || !this.hasOpenFormationGap(creep);
                if (needBreach) {
                    const barrier = this.pickBorderBreachTarget(creep, this.isQuad(creep) ? 2 : 1);
                    if (!this.applyBreachTarget(creep, barrier) && creep.memory.quadWiden) {
                        creep.memory.quadWiden = undefined;
                    }
                } else if (creep.memory.quadWiden) {
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

        const forming = !this.isSquadCommitted(creep)
            && (creep.memory.misc && creep.memory.misc.waitFor > 1);
        const lockingEntry = this.lockingDestEntry(creep);

        // Uncommitted waitFor (including the walk back to formColony) must
        // reach holdForWave. Kite/retreat on that walk peeled them off bind.
        if (!forming && !lockingEntry && this.shouldRetreat(creep, fullSquad)) {
            this.retreatSquad(creep);
            return;
        }

        if (!forming && !lockingEntry && this.kiteFromMelee(creep)) return;

        // New waitFor waves stay in the colony until full, renewed, and boosted.
        if (this.holdForWave(creep)) return;

        // Committed quad: don't walk out of the bunker until everyone is nearby.
        if (this.gatherBeforeDepart(creep)) return;

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
                // In dest an unpacked quad lost the hop. Do not walk back onto
                // dest-exit while anyone is still entering — that occupies the
                // landings the back row needs. Stay inland (or on dest-exit if
                // we never left it) and keep sliding.
                if (creep.memory.destination === creep.room.name && this.isQuad(creep)) {
                    if (this.squadSplitAcrossDest(creep) || this.squadOnDestExit(creep)) return;
                    const staging = creep.memory.misc && creep.memory.misc.stagingRoom;
                    if (!this.onRoomExitTile(creep.pos)) creep.moveToRoomExit(staging);
                    return;
                }
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
            const waitFor = this.creep.memory.misc && this.creep.memory.misc.waitFor;
            // bindWaveHere owns membership for uncommitted waitFor waves.
            if (!(waitFor > 1) || this.isSquadCommitted(this.creep)) {
                if (!leader.memory.squadMembers) leader.memory.squadMembers = [];
                if (!leader.memory.squadMembers.includes(this.creep.id)) {
                    leader.memory.squadMembers.push(this.creep.id);
                }
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
        const forming = waitFor > 1 && !this.isSquadCommitted(this.creep);

        // Uncommitted waitFor (home or walking in) must reach holdForWave.
        if (!forming && !this.lockingDestEntry(leader) && !this.lockingDestEntry(this.creep)
            && !leader.memory.quadSnake && this.kiteFromMelee(this.creep)) return;

        if (waitFor > 1 && !this.isSquadCommitted(this.creep)) {
            if (this.holdForWave(this.creep)) return;
        }

        // Leader already issued the coordinated step (including a dest hop).
        if (leader.memory.squadMoveTick === Game.time || leader.memory.squadKiteTick === Game.time) return;

        const dest = this.creep.memory.destination || leader.memory.destination;
        const grouped = (leader.memory.squadMembers || []).length >= 1;
        const squadSize = (leader.memory.squadMembers || []).length + 1;
        // Dest landing is a portal. Sitting here teleports back. Formation
        // movement should already have stepped us; this is tick-order fallback.
        if (dest && this.creep.room.name === dest && this.onRoomExitTile(this.creep.pos)) {
            const inland = inlandOffExit(this.creep.pos);
            if (inland && !this.creep.fatigue) {
                const next = posAfterMove(this.creep.pos, inland);
                if (next && next.roomName === dest && !onExitTile(next)
                    && !next.checkForImpassible(false, true)) {
                    this.creep.move(inland);
                }
            }
            return;
        }
        // Duo/snake on dest-facing staging: step inland so we don't hop alone.
        // Packed quads stay in the blob — squadMove walks the 2×2 through.
        if (grouped && dest && this.creep.room.name !== dest && this.onDestFacingExit(this.creep, dest)
            && (squadSize <= 2 || leader.memory.quadSnake
                || formationRange(this.creep.pos, leader.pos) > 2)) {
            const off = exitDirectionTo(this.creep.room.name, dest);
            const inland = off === RIGHT ? LEFT : off === LEFT ? RIGHT : off === TOP ? BOTTOM : TOP;
            if (inland && !this.creep.fatigue) {
                const next = posAfterMove(this.creep.pos, inland);
                if (next && next.roomName === this.creep.room.name
                    && !next.checkForImpassible(false, true)) {
                    this.creep.move(inland);
                    return;
                }
            }
            if (formationRange(this.creep.pos, leader.pos) <= 2) {
                if ((leader.memory.squadMembers || []).length + 1 > 2) {
                    this.getInPosition(this.creep, leader);
                }
                return;
            }
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
        if (squadSize <= 2 || leader.memory.quadSnake) {
            // Leader already in dest: line up on this side of the exit and wait
            // for the coordinated hop. Chasing the leader is 1-at-a-time entry
            // unless quadSnake — then the 2×2 cannot fit and we trail the hole.
            if (dest && leader.room.name === dest && this.creep.room.name !== dest) {
                const dir = exitDirectionTo(this.creep.room.name, dest);
                if (dir) {
                    if (leader.memory.quadSnake || this.onDestFacingExit(this.creep, dest)) {
                        if (this.canHopIntoDest(this.creep, dest)) this.creep.move(dir);
                        else if (!this.onDestFacingExit(this.creep, dest)) {
                            const spot = this.alignExitSpot(this.creep, dir, leader.pos, leader);
                            if (spot && (this.creep.pos.x !== spot.x || this.creep.pos.y !== spot.y)) {
                                this.creep.shibMove(spot, {range: 0, forceSolo: true});
                            }
                        }
                        return;
                    }
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
            if (this.holdForWave(creep)) return;
            // Grouped or committed this tick — gather runs from handleLeader
            // next tick. Walking now is a solo hop out of the bunker.
            if (this.isSquadCommitted(creep) || creep.memory.grouped || creep.memory.leader) return;
        }
        // Committed remnant, no squad: do not hop dest alone.
        if (waitFor > 1 && committed && creep.memory.destination !== creep.room.name) {
            creep.fleeHome(true);
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
        // Duos snake; forceSolo into dest is 1-at-a-time. Packed quads walk
        // dest the same way they walk any other room.
        if (squadSize <= 2 && dest && target && target.roomName === dest && this.creep.room.name !== dest
            && exitDirectionTo(this.creep.room.name, dest)) {
            const pad = this.findStaging(this.creep);
            if (pad) {
                return this.creep.shibMove(pad, Object.assign({
                    forceSolo: true,
                    range: 0
                }, options));
            }
            return false;
        }
        if (squadSize <= 2) {
            return this.creep.shibMove(target, Object.assign({forceSolo: true}, options));
        }

        const soloOpts = Object.assign({forceSolo: true}, options);
        const range = options.range != null ? options.range : 1;
        const inRange = !!(target && target.roomName === this.creep.pos.roomName
            && this.creep.pos.getRangeTo(target) <= range);

        if (this.creep.memory.quadSnake) {
            if (this.isCurrentPosViable(this.creep)
                && !this.squadSplitAcrossRooms(this.creep)
                && !this.squadOnAnyExit(this.creep)) {
                const full = this.getSquad().concat(this.creep);
                if (this.isFormationPacked(full, this.creep)) this.clearQuadSnake(this.creep);
                else return false;
            } else {
                return this.creep.shibMove(target, soloOpts);
            }
        }

        // Safe room: short path. Dest-adjacent hops stay packed — walking
        // onto the dest-facing exit is a teleport, not a normal tile.
        const destAdj = !!(dest && exitDirectionTo(this.creep.room.name, dest));
        if (!destAdj && (!this.roomHasSquadThreats(this.creep.room) || !this.needsSquadFormation(this.creep))) {
            if (inRange) return false;
            this.creep.memory.quadSnake = true;
            return this.creep.shibMove(target, soloOpts);
        }

        const moved = this.creep.shibSquadMovement(target, options);
        if (moved) return moved;
        if (this.creep.fatigue) return false;
        const ids = this.creep.memory.squadMembers || [];
        for (let i = 0; i < ids.length; i++) {
            const m = Game.getObjectById(ids[i]);
            if (m && m.fatigue) return false;
        }
        if (inRange) return false;
        if (this.creep.memory._shibSquadMove && this.creep.memory._shibSquadMove.path
            && this.creep.memory._shibSquadMove.path.length) return false;
        this.creep.memory.quadSnake = true;
        return this.creep.shibMove(target, soloOpts);
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
    // Exception: a follower boxed in by the blob + terrain cannot reach the
    // empty slot. An on-slot mate adjacent to both slides into the empty, and
    // the boxed creep takes the vacated tile.
    getInPosition(creep, leader) {
        if (!leader || !creep) return false;
        if (leader.room.name !== creep.room.name) {
            // Straddling the portal. Do not shibMove toward the other room —
            // that sits on the exit and bounces. Leader squad step walks us.
            if (formationRange(creep.pos, leader.pos) <= 2) return true;
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
                const pos = offsetPos(lp, dx, dy);
                if (!pos || tileBlocked(pos, true)) continue;
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
        occupied.add(`${lp.x},${lp.y},${lp.roomName}`);
        for (const id of leader.memory.squadMembers || []) {
            if (id === creep.id) continue;
            const m = Game.getObjectById(id);
            if (m) occupied.add(`${m.pos.x},${m.pos.y},${m.pos.roomName}`);
        }
        for (let i = 0; i < slots.length; i++) {
            const s = slots[i];
            const occupant = s.checkForCreep();
            if (occupant && occupant.id !== creep.id) {
                const mate = occupant.id === leader.id
                    || occupant.memory.groupLeader === leader.id
                    || (leader.memory.squadMembers || []).includes(occupant.id);
                if (mate || !isBumperCandidate(occupant)) occupied.add(`${s.x},${s.y},${s.roomName}`);
            }
        }
        const claimed = formupClaims(leader.id);
        for (const id in claimed) {
            if (id !== creep.id) occupied.add(claimed[id]);
        }

        const staleSlide = leader.memory.formupSlide;
        if (staleSlide && staleSlide.tick < Game.time - 1) leader.memory.formupSlide = undefined;

        // Honor a slide before the on-slot stay, otherwise the mate already in
        // formation never leaves the tile the boxed-in follower needs.
        if (this.executeFormupSlide(creep, leader, claimed)) return false;

        // Already on a valid slot? Stay and bind it so later followers skip it.
        for (let i = 0; i < slots.length; i++) {
            if (creep.pos.x === slots[i].x && creep.pos.y === slots[i].y
                && creep.pos.roomName === slots[i].roomName) {
                claimed[creep.id] = `${slots[i].x},${slots[i].y},${slots[i].roomName}`;
                return true;
            }
        }

        let bestSlot = null;
        let bestDist = Infinity;
        for (const s of slots) {
            if (s.roomName !== creep.pos.roomName) continue;
            if (occupied.has(`${s.x},${s.y},${s.roomName}`)) continue;
            const d = creep.pos.getRangeTo(s);
            if (d < bestDist) {
                bestDist = d;
                bestSlot = s;
            }
        }

        if (!bestSlot) {
            // Packed across an exit: wrapped slots are in the other room.
            // Stay rather than shibMove, which peels off the 2×2.
            if (formationRange(creep.pos, leader.pos) <= 1) return true;
            if (!creep.pos.isNearTo(leader.pos)) {
                creep.shibMove(leader, {range: 1, forceSolo: true});
            }
            return false;
        }

        // Boxed behind the blob: an on-slot mate slides into the empty slot
        // and this creep takes the vacated tile. Do this before claiming the
        // far empty so the swap isn't fighting shibMove around the 2×2.
        const range = creep.pos.getRangeTo(bestSlot);
        if (range > 1 && this.requestFormupSlide(creep, leader, slots, claimed, bestSlot)) {
            return false;
        }

        claimed[creep.id] = `${bestSlot.x},${bestSlot.y},${bestSlot.roomName}`;

        // Range 1–2: one greedy step. shibMove costs squad-mates at 100 and
        // routes around the blob; a direct intent also lets the swap rule
        // resolve two followers exchanging tiles.
        if (range <= 2) {
            const dir = creep.pos.getDirectionTo(bestSlot);
            if (dir) {
                if (range === 1) {
                    const dest = leader.memory.destination;
                    if (dest && wouldEnterDest(creep.pos, dir, dest)) return false;
                    const occupant = bestSlot.checkForCreep();
                    if (occupant && occupant.id !== creep.id && occupant.id !== leader.id) {
                        if (!yieldOccupant(occupant, bestSlot)) return false;
                    }
                    creep.move(dir);
                    return false;
                }
                const next = creep.pos.positionAtDirection(dir);
                if (next && next.roomName === creep.pos.roomName
                    && !occupied.has(`${next.x},${next.y},${next.roomName}`)
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

    // On-slot mate adjacent to both the boxed-in follower and the empty slot.
    // Sliding that mate into the empty (and this creep into the vacated tile)
    // packs the 2×2 when walls block walking around the blob. Leader stays put
    // — moving them translates every slot.
    findFormupSlider(creep, leader, slots, emptySlot) {
        for (const id of leader.memory.squadMembers || []) {
            if (id === creep.id) continue;
            const mate = Game.getObjectById(id);
            if (!mate || mate.spawning || mate.fatigue) continue;
            if (mate.pos.roomName !== creep.pos.roomName) continue;
            if (creep.pos.getRangeTo(mate) !== 1) continue;
            if (mate.pos.getRangeTo(emptySlot) !== 1) continue;
            if (mate.pos.isEqualTo(emptySlot)) continue;
            let onSlot = false;
            for (let i = 0; i < slots.length; i++) {
                if (mate.pos.isEqualTo(slots[i])) {
                    onSlot = true;
                    break;
                }
            }
            if (onSlot) return mate;
        }
        return null;
    }

    requestFormupSlide(creep, leader, slots, claimed, emptySlot) {
        const existing = formupSlideFor(leader.id) || leader.memory.formupSlide;
        if (existing && existing.tick >= Game.time - 1 && existing.stuckId !== creep.id) {
            return false;
        }
        if (existing && existing.stuckId === creep.id && existing.tick >= Game.time - 1) {
            return this.executeFormupSlide(creep, leader, claimed);
        }

        const slider = this.findFormupSlider(creep, leader, slots, emptySlot);
        if (!slider) return false;

        const slideDir = slider.pos.getDirectionTo(emptySlot);
        const takeDir = creep.pos.getDirectionTo(slider.pos);
        if (!slideDir || !takeDir) return false;

        const dest = leader.memory.destination;
        if (dest && (wouldEnterDest(slider.pos, slideDir, dest) || wouldEnterDest(creep.pos, takeDir, dest))) {
            return false;
        }

        const slide = {
            sliderId: slider.id,
            stuckId: creep.id,
            emptyX: emptySlot.x,
            emptyY: emptySlot.y,
            vacateX: slider.pos.x,
            vacateY: slider.pos.y,
            roomName: slider.pos.roomName,
            tick: Game.time
        };
        setFormupSlide(leader.id, slide);
        leader.memory.formupSlide = slide;
        slider.move(slideDir);
        creep.move(takeDir);
        claimed[creep.id] = `${slide.vacateX},${slide.vacateY}`;
        claimed[slider.id] = `${slide.emptyX},${slide.emptyY}`;
        return true;
    }

    executeFormupSlide(creep, leader, claimed) {
        let slide = formupSlideFor(leader.id);
        if (!slide && leader.memory.formupSlide && leader.memory.formupSlide.tick >= Game.time - 1) {
            slide = leader.memory.formupSlide;
            setFormupSlide(leader.id, slide);
        }
        if (!slide) return false;
        if (slide.sliderId !== creep.id && slide.stuckId !== creep.id) return false;

        const dest = leader.memory.destination;
        const roomName = slide.roomName || creep.pos.roomName;
        if (creep.id === slide.sliderId) {
            if (creep.pos.roomName !== roomName
                || creep.pos.x !== slide.vacateX || creep.pos.y !== slide.vacateY) {
                if (slide.tick < Game.time) leader.memory.formupSlide = undefined;
                return false;
            }
            const empty = new RoomPosition(slide.emptyX, slide.emptyY, roomName);
            if (empty.checkForImpassible(false, true)) {
                leader.memory.formupSlide = undefined;
                return false;
            }
            const occupant = empty.checkForCreep();
            if (occupant && occupant.id !== creep.id && occupant.id !== slide.stuckId) {
                leader.memory.formupSlide = undefined;
                return false;
            }
            const dir = creep.pos.getDirectionTo(empty);
            if (!dir || (dest && wouldEnterDest(creep.pos, dir, dest))) return false;
            creep.move(dir);
            claimed[creep.id] = `${slide.emptyX},${slide.emptyY}`;
            return true;
        }

        if (creep.pos.roomName !== roomName) return false;
        const vacate = new RoomPosition(slide.vacateX, slide.vacateY, roomName);
        if (creep.pos.getRangeTo(vacate) !== 1) return false;
        const dir = creep.pos.getDirectionTo(vacate);
        if (!dir || (dest && wouldEnterDest(creep.pos, dir, dest))) return false;
        creep.move(dir);
        claimed[creep.id] = `${slide.vacateX},${slide.vacateY}`;
        return true;
    }

    isCurrentPosViable(creep) {
        const squadSize = (creep.memory.squadMembers || []).length + 1;

        // Duos: snake-tail behaviour means any passable tile the leader stands on
        // is fine — the follower trails through 1-tile gaps. No footprint to check.
        if (squadSize <= 2) return true;

        // Mid room hop: the 2×2 is supposed to straddle the exit. Don't flip
        // facing or hunt a new pad until everyone is off the exit tile.
        if (this.squadSplitAcrossRooms(creep) || this.squadOnAnyExit(creep)) return true;

        const slotOpen = (dx, dy) => {
            const slot = offsetPos(creep.pos, dx, dy);
            return !!(slot && !tileBlocked(slot, true));
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
        const fullSquad = this.squadForWave(creep);
        const packed = this.isFormationPacked(fullSquad, creep);
        // Packed 2×2 keeps its facing through a room hop. edge-safe / dest-front
        // rotation at the border is the shuffle that breaks the blob.
        if (packed && (this.squadSplitAcrossRooms(creep) || this.squadOnAnyExit(creep)
            || this.edgeSafeOrientation(x, y) !== undefined)) {
            if (creep.memory.pendingOrientationFlip) creep.memory.pendingOrientationFlip = undefined;
            return;
        }
        const edge = this.edgeSafeOrientation(x, y);
        const combat = this.combatOrientation(creep, x, y);

        // Unpacked dest-adjacent: form with the leader on the dest-facing corner.
        const destDir = creep.memory.destination && creep.room.name !== creep.memory.destination
            ? exitDirectionTo(creep.room.name, creep.memory.destination) : 0;
        const destOrients = destDir ? this.destExitOrients(destDir) : [];
        if (!packed && destOrients.length) {
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
        for (let i = 0; i < offsets.length; i++) {
            const slot = offsetPos(creep.pos, offsets[i].dx, offsets[i].dy);
            if (!slot || tileBlocked(slot, true)) return false;
        }
        return true;
    }

    inHomeColony(creep) {
        const home = (creep.memory.misc && creep.memory.misc.formColony) || creep.memory.colony;
        return !!(home && creep.room.name === home);
    }

    roomHasSquadThreats(room) {
        if (!room) return false;
        if (room.hostileStructures && room.hostileStructures.length) return true;
        const hostiles = room.hostileCreeps || [];
        for (let i = 0; i < hostiles.length; i++) {
            const c = hostiles[i];
            if (c && (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK))) return true;
        }
        return false;
    }

    // Pack for dest-adjacent hops and for rooms with armed threats.
    // Safe rooms take the short 1-wide instead of a long 2×2 detour.
    needsSquadFormation(creep) {
        if (!creep || !creep.room) return false;
        const dest = creep.memory.destination;
        if (this.inHomeColony(creep)) {
            return this.isQuad(creep) && !!(dest && exitDirectionTo(creep.room.name, dest));
        }
        if (dest && (exitDirectionTo(creep.room.name, dest)
            || (creep.memory.misc && creep.memory.misc.stagingRoom === creep.room.name))) {
            return true;
        }
        return this.roomHasSquadThreats(creep.room);
    }

    approachHops(from, to) {
        if (!from || !to) return Infinity;
        if (from === to) return 0;
        try {
            const hops = require('pathRoute').routeDistance(from, to);
            if (hops < Infinity) return hops;
        } catch (e) { /* pathfinder not loaded yet */
        }
        return Game.map.getRoomLinearDistance(from, to);
    }

    nearDestination(leader) {
        if (!leader.memory.destination) return false;
        // Home packs only when a quad's dest shares an exit — otherwise a 2×2
        // pad in the bunker fights the economy. Dest next door IS the staging room.
        if (this.inHomeColony(leader)) {
            return this.isQuad(leader) && !!exitDirectionTo(leader.room.name, leader.memory.destination);
        }
        const dest = leader.memory.destination;
        const staging = leader.memory.misc && leader.memory.misc.stagingRoom;
        if (staging && leader.room.name === staging) return true;
        if (exitDirectionTo(leader.room.name, dest)) return true;
        // Quads pack two route hops out so the last hop is a 2×2. Linear
        // distance packed in SK rooms 2 tiles away that were 6 hops on road.
        const limit = this.isQuad(leader) ? 2 : 1;
        return this.approachHops(leader.room.name, dest) <= limit;
    }

    // Dest-facing pad or mid 2×2 slide across dest. Kite/retreat on the pad
    // peels the blob and someone hops alone. A packed quad elsewhere in
    // staging still kites — locking the whole dest-adjacent room ate melee.
    lockingDestEntry(creep) {
        if (!creep || !creep.memory) return false;
        const dest = creep.memory.destination;
        if (!dest) return false;
        if (this.squadSplitAcrossDest(creep, dest)) return true;
        if (this.squadOnDestExit(creep)) return true;
        if (creep.room.name === dest) return false;
        if (!exitDirectionTo(creep.room.name, dest)) return false;
        return this.onDestFacingExit(creep, dest);
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

    waveAssembled(creep) {
        const waitFor = (creep.memory.misc && creep.memory.misc.waitFor) || 0;
        if (!(waitFor > 1)) return true;
        return this.sameWaveLiveInRoom(creep).length >= waitFor;
    }

    waveMemberBoostSettled(c) {
        if (!c) return false;
        const pending = c.memory.boosts && c.memory.boosts.requestedBoosts;
        if (pending && Object.keys(pending).length) return false;
        if (c.memory.boostAttempt) return true;
        const op = c.memory && c.memory.operation;
        // Siege: required HEAL/TOUGH on the body is enough. Optional RA/MOVE
        // stay in tryToBoost only while a lab is actually ready.
        if (op === 'roomDenial' || op === 'stronghold') return this.memberHasRequiredSiegeBoosts(c);
        if (c.memory.boosts) return false;
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

    memberHasRequiredSiegeBoosts(c) {
        if (c && c.hasRequiredSiegeBoosts) return c.hasRequiredSiegeBoosts();
        if (!c || !c.memory) return false;
        return !c.memory.neededBoosts;
    }

    isSameWaveMate(creep, c) {
        if (!c || !c.my || !c.memory || c.spawning || c.memory.recycling) return false;
        if ((c.memory.destination || '') !== (creep.memory.destination || '')) return false;
        if ((c.memory.operation || '') !== (creep.memory.operation || '')) return false;
        if (c.memory.initialFormUp || (c.memory.misc && c.memory.misc.sealed)) return false;
        const waitFor = (creep.memory.misc && creep.memory.misc.waitFor) || 0;
        if (((c.memory.misc && c.memory.misc.waitFor) || 0) !== waitFor) return false;
        const role = c.memory.role || '';
        const old = c.memory.oldRole || '';
        return role === 'longbowSquad' || role === 'longbow'
            || old === 'longbowSquad' || old === 'longbow';
    }

    sameWaveLive(creep) {
        const mates = [];
        for (const name in Game.creeps) {
            const c = Game.creeps[name];
            if (this.isSameWaveMate(creep, c)) mates.push(c);
        }
        return mates;
    }

    sameWaveLiveInRoom(creep) {
        const mates = [];
        const creeps = creep.room.myCreeps || [];
        for (let i = 0; i < creeps.length; i++) {
            if (this.isSameWaveMate(creep, creeps[i])) mates.push(creeps[i]);
        }
        return mates;
    }

    // Bind these bodies into one squad. Lowest name leads so every body
    // picks the same winner this tick. Membership is capped by the caller.
    forceWaveGroup(mates) {
        if (!mates || mates.length < 2) return false;
        const sorted = mates.slice().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        const leader = sorted[0];
        if (!leader.memory.oldRole) leader.memory.oldRole = leader.memory.role;
        leader.memory.role = 'longbowSquad';
        leader.memory.leader = true;
        leader.memory.grouped = true;
        leader.memory.squadMembers = [];
        for (let i = 1; i < sorted.length; i++) {
            const c = sorted[i];
            if (!c.memory.oldRole) c.memory.oldRole = c.memory.role;
            c.memory.role = 'longbowSquad';
            c.memory.grouped = true;
            c.memory.leader = undefined;
            c.memory.squadMembers = undefined;
            c.memory.groupLeader = leader.id;
            c.memory.squadListed = leader.id;
            leader.memory.squadMembers.push(c.id);
        }
        this.squad = null;
        return true;
    }

    waveHasRequiredSiegeBoosts(creep, squad) {
        const wave = (squad && creep.memory.leader) ? squad.concat(creep) : this.squadForWave(creep);
        if (!wave.length) return false;
        for (let i = 0; i < wave.length; i++) {
            if (!this.memberHasRequiredSiegeBoosts(wave[i])) return false;
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
        // Only camp an idle spawn. Busy spawns are popping the rest of the
        // quad, or the wave is assembled and needs to boost — sitting on the
        // apron used to block both.
        const slots = this.idleSpawnCount(creep.room);
        if (!slots) {
            if (creep.memory.needsRenewal) creep.memory.needsRenewal = undefined;
            return false;
        }
        if (!this.waveAssembled(creep)) {
            const allowed = need.slice(0, slots);
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

    formingGiveUp(creep) {
        const waitFor = (creep.memory.misc && creep.memory.misc.waitFor) || 0;
        if (!(waitFor > 1) || this.isSquadCommitted(creep)) return false;
        if (creep.waveStillIncoming && creep.waveStillIncoming()) return false;
        const live = this.sameWaveLiveInRoom(creep).length;
        if (live >= waitFor) return false;
        if ((creep.ticksToLive || Infinity) < FORMING_ABANDON_TTL) return true;
        this.markFormingLive(creep, live);
        const since = (creep.memory.misc && creep.memory.misc.formLiveTick) || Game.time;
        return Game.time - since >= FORMING_STALL_TICKS;
    }

    waveBoostStalled(creep) {
        if (!this.waveAssembled(creep) || this.isSquadCommitted(creep)) return false;
        if (!creep.memory.misc) creep.memory.misc = {};
        if (!creep.memory.misc.boostWaitTick) creep.memory.misc.boostWaitTick = Game.time;
        return Game.time - creep.memory.misc.boostWaitTick >= BOOST_WAIT_TICKS;
    }

    // Room-mates are the wave. Bind up to waitFor; recycle extras. Never shrink
    // waitFor — a 3-body close-out is a recycle, not a success.
    bindWaveHere(creep) {
        const waitFor = (creep.memory.misc && creep.memory.misc.waitFor) || 0;
        const mates = this.sameWaveLiveInRoom(creep);
        if (mates.length < 2) return mates;
        const cap = waitFor > 1 ? waitFor : mates.length;
        const sorted = mates.slice().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        const keep = sorted.slice(0, cap);
        const extras = sorted.slice(keep.length);
        this.forceWaveGroup(keep);
        for (let i = 0; i < extras.length; i++) {
            const extra = extras[i];
            if (!extra) continue;
            if (extra.ungroupFromSquad) extra.ungroupFromSquad();
            if (extra.recycleCreep) extra.recycleCreep();
        }
        return keep;
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

    recycleWave(creep) {
        const wave = this.sameWaveLive(creep);
        for (let i = 0; i < wave.length; i++) {
            if (wave[i] && wave[i].recycleCreep) wave[i].recycleCreep();
        }
    }

    // Spawn N, bind them at formColony, boost, leave together.
    // Incomplete waves recycle; they never shrink waitFor and walk out short.
    holdForWave(creep) {
        const waitFor = (creep.memory.misc && creep.memory.misc.waitFor) || 0;
        if (!(waitFor > 1) || this.isSquadCommitted(creep)) return false;
        if (this.cancelledDestAtHome(creep)) {
            this.recycleWave(creep);
            return true;
        }

        const colony = (creep.memory.misc && creep.memory.misc.formColony) || creep.memory.colony;
        const assembled = this.waveAssembled(creep);
        const abort = this.formingGiveUp(creep);

        if (colony && creep.room.name !== colony) {
            if (abort) {
                this.recycleWave(creep);
                return true;
            }
            if (creep.memory.leader) {
                this.leaderTransit(new RoomPosition(25, 25, colony), {range: 22});
            } else {
                creep.shibMove(new RoomPosition(25, 25, colony), {range: 22});
            }
            return true;
        }

        this.bindWaveHere(creep);

        if (abort) {
            this.recycleWave(creep);
            return true;
        }

        if (!assembled) {
            if (creep.memory.misc && creep.memory.misc.boostWaitTick) {
                creep.memory.misc.boostWaitTick = undefined;
            }
            if (this.renewWave(creep)) return true;
            if (!creep.memory.boosts && !creep.memory.hasBoosted) {
                this.goToMusterPad(creep);
            }
            return true;
        }

        return this.finishFormingWave(creep);
    }

    finishFormingWave(creep) {
        const mates = this.sameWaveLiveInRoom(creep);
        if (mates.length < 2) {
            creep.recycleCreep();
            return true;
        }
        // Followers stay put; only the leader commits the wave.
        if (!creep.memory.leader) return true;

        const siegeOp = creep.memory.operation === 'roomDenial' || creep.memory.operation === 'stronghold';
        const requiredReady = !siegeOp || this.waveHasRequiredSiegeBoosts(creep);
        const ttlFailed = (creep.ticksToLive || Infinity) < FORMING_ABANDON_TTL;

        if (!requiredReady) {
            if (this.waveNeedsRenew(creep) && !ttlFailed && this.renewWave(creep)) return true;
            if (!this.waveBoostStalled(creep) && !ttlFailed) {
                if (!creep.memory.boosts && !creep.memory.boostAttempt && !creep.memory.hasBoosted) {
                    this.goToMusterPad(creep);
                }
                return true;
            }
            this.recycleWave(creep);
            return true;
        }

        if (this.waveBoosted(creep) || this.waveBoostStalled(creep) || ttlFailed) {
            this.commitSquad(creep);
            return false;
        }
        if (this.waveNeedsRenew(creep) && !ttlFailed && this.renewWave(creep)) return true;
        if (!creep.memory.boosts && !creep.memory.boostAttempt && !creep.memory.hasBoosted) {
            this.goToMusterPad(creep);
        }
        return true;
    }

    // After boost/commit, wait in place until the whole live squad is in this
    // room within range 3. Stops the leader walking out while two bodies are
    // still on the labs. One-shot (gatherDone) so a step that puts anyone >3
    // does not re-arm and bounce the wave back into the bunker.
    gatherBeforeDepart(creep) {
        if (!this.isQuad(creep) || !this.inHomeColony(creep)) return false;
        if (!this.isSquadCommitted(creep)) return false;
        if (!creep.memory.misc) creep.memory.misc = {};
        if (creep.memory.misc.gatherDone) return false;
        // Live list — the handleLeader squad snapshot is from before bindWaveHere.
        const members = this.squadForWave(creep);
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

        // Soft-assign: already on the dest-facing column, stay — unless the
        // matching dest landing is occupied (front row already in dest). Staying
        // on those two tiles is how the back row never entered.
        const dest = (leader && leader.memory.destination) || creep.memory.destination;
        const leaderInDest = !!(leader && dest && leader.pos.roomName === dest);
        const landingOk = (pos) => !leaderInDest || this.destLandingFree(dest, dir, pos.x, pos.y);
        const coreCount = squadSize <= 2 ? Math.min(1, candidates.length) : Math.min(2, candidates.length);
        for (let i = 0; i < coreCount; i++) {
            if (creep.pos.isEqualTo(candidates[i]) && landingOk(creep.pos)) return claim(creep.pos);
        }

        const pickUnoccupied = (from, to, requireLanding) => {
            let best = null;
            let bestDist = Infinity;
            for (let i = from; i < to; i++) {
                const s = candidates[i];
                if (occupied.has(`${s.x},${s.y}`)) continue;
                if (requireLanding && !landingOk(s)) continue;
                const d = creep.pos.getRangeTo(s);
                if (d < bestDist) {
                    bestDist = d;
                    best = s;
                }
            }
            return best;
        };

        const spot = pickUnoccupied(0, coreCount, true)
            || pickUnoccupied(coreCount, candidates.length, true)
            || pickUnoccupied(0, candidates.length, false);
        return spot ? claim(spot) : null;
    }

    destLandingFree(dest, dir, sx, sy) {
        if (!dest || !dir) return true;
        const land = this.destLandingCoords(dir, sx, sy);
        if (land.x < 0 || land.x > 49 || land.y < 0 || land.y > 49) return false;
        if (!this.destTileWalkable(dest, land.x, land.y, true)) return false;
        const destRoom = Game.rooms[dest];
        if (!destRoom) return true;
        return !new RoomPosition(land.x, land.y, dest).checkForImpassible(false, false);
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

    squadSplitAcrossRooms(creep) {
        const members = this.squadForWave(creep);
        let room = null;
        for (let i = 0; i < members.length; i++) {
            if (!members[i]) continue;
            if (!room) room = members[i].pos.roomName;
            else if (members[i].pos.roomName !== room) return true;
        }
        return false;
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
        // Once in dest, healInRange picks wounded squadmates. Forcing heal(self)
        // here left the front row topping themselves while the back row entered.
        if (creep.pos.roomName === dest) return false;
        if (this.onDestFacingExit(creep, dest)) return true;
        if (this.squadSplitAcrossDest(creep, dest)) return true;
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

    squadOnAnyExit(creep) {
        const members = this.squadForWave(creep);
        for (let i = 0; i < members.length; i++) {
            if (members[i] && this.onRoomExitTile(members[i].pos)) return true;
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
        // Dest structures need vision; dest terrain does not. RCL7 has no
        // observers — hop terrain-open landings. Hidden ramparts fail the
        // move and we stay packed (chip once a scout/gap gives vision).
        return !!creep.shibSquadStep(dir);
    }

    // Dest-exit column inland: both front-row bodies leave dest-exit so the
    // back row can hop, then the packed 2×2 steps off dest-exit together.
    stepOffDestExit(creep) {
        if (this.stepFormationIntoDest(creep)) return true;
        const dest = creep.memory.destination;
        if (!dest || creep.room.name !== dest) return false;
        const inward = this.inwardMoveDir(creep.pos);
        if (!inward) return false;
        const wave = this.squadForWave(creep);
        let moved = false;
        for (let i = 0; i < wave.length; i++) {
            const c = wave[i];
            if (!c || c.fatigue || c.pos.roomName !== dest) continue;
            if (!this.onRoomExitTile(c.pos)) continue;
            const next = posAfterMove(c.pos, inward);
            if (!next || next.roomName !== dest || next.checkForImpassible(false, false)) continue;
            if (c.move(inward) === OK) moved = true;
        }
        return moved;
    }

    // Wait for the rest of a live waitFor-4 before hopping. Two on the pad
    // while two are still a room back must not enter as a hug-duo.
    quadPresentForEntry(creep, squad) {
        if (!this.isQuad(creep)) return true;
        const dest = creep.memory.destination;
        const waitFor = (creep.memory.misc && creep.memory.misc.waitFor) || 0;
        const wave = (squad && creep.memory.leader) ? squad.concat(creep) : this.squadForWave(creep);
        let live = 0;
        let present = 0;
        for (let i = 0; i < wave.length; i++) {
            const c = wave[i];
            if (!c) continue;
            live++;
            if (c.room.name === creep.room.name || (dest && c.room.name === dest)) present++;
        }
        const need = waitFor >= 4 ? 4 : 3;
        if (live >= need && present < need) return false;
        return present >= 3;
    }

    // Dest-edge landings of the 2×2 front column/row. Used for tower scoring
    // and destFrontOpen.
    destFrontLandings(dest, dir, lx, ly, orientation) {
        const out = [];
        const add = (sx, sy) => {
            let dx = sx;
            let dy = sy;
            if (dir === RIGHT) dx = 0;
            else if (dir === LEFT) dx = 49;
            else if (dir === TOP) dy = 49;
            else dy = 0;
            if (dx < 0 || dx > 49 || dy < 0 || dy > 49) return;
            out.push({x: dx, y: dy});
        };
        add(lx, ly);
        const offsets = QUAD_OFFSETS[orientation] || [];
        for (let i = 0; i < offsets.length; i++) {
            const {dx, dy} = offsets[i];
            if ((dir === RIGHT || dir === LEFT) && dx === 0) add(lx, ly + dy);
            else if ((dir === TOP || dir === BOTTOM) && dy === 0) add(lx + dx, ly);
        }
        return out;
    }

    exitPadTowerDmg(dest, dir, lx, ly, orientation) {
        const destRoom = Game.rooms[dest];
        if (!destRoom) return 0;
        const towers = (destRoom.towers || []).filter((t) => {
            try {
                return t.store && t.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST;
            } catch (e) {
                return false;
            }
        });
        if (!towers.length) return 0;
        const landings = this.destFrontLandings(dest, dir, lx, ly, orientation);
        let worst = 0;
        for (let i = 0; i < landings.length; i++) {
            const pos = new RoomPosition(landings[i].x, landings[i].y, dest);
            let dmg = 0;
            for (let t = 0; t < towers.length; t++) {
                const range = pos.getRangeTo(towers[t]);
                dmg += (typeof TOWER_POWER_FROM_RANGE === 'function')
                    ? TOWER_POWER_FROM_RANGE(range, TOWER_POWER_ATTACK)
                    : (range <= 5 ? 600 : range < 20 ? 600 - 450 * (range - 5) / 15 : 150);
            }
            if (dmg > worst) worst = dmg;
        }
        return worst;
    }

    chipDestEntry(creep, dest) {
        const destRoom = Game.rooms[dest];
        if (!destRoom) return false;
        const inDest = creep.room.name === dest;
        const dir = inDest ? this.inwardMoveDir(creep.pos) : exitDirectionTo(creep.room.name, dest);
        if (!dir) return false;
        let x = creep.pos.x;
        let y = creep.pos.y;
        if (!inDest) {
            if (dir === RIGHT) x = 0;
            else if (dir === LEFT) x = 49;
            else if (dir === TOP) y = 49;
            else y = 0;
        }
        const inward = dir === RIGHT ? {dx: 1, dy: 0} : dir === LEFT ? {dx: -1, dy: 0}
            : dir === TOP ? {dx: 0, dy: -1} : {dx: 0, dy: 1};
        const along = inward.dx !== 0 ? {dx: 0, dy: 1} : {dx: 1, dy: 0};
        let best = null;
        let bestHits = Infinity;
        for (let step = 1; step <= 2; step++) {
            for (let k = -1; k <= 1; k++) {
                const tx = x + inward.dx * step + along.dx * k;
                const ty = y + inward.dy * step + along.dy * k;
                if (tx < 1 || tx > 48 || ty < 1 || ty > 48) continue;
                const barrier = this.hostileBarrierAt(new RoomPosition(tx, ty, dest));
                if (!barrier || creep.pos.getRangeTo(barrier) > 3) continue;
                if (barrier.hits < bestHits) {
                    bestHits = barrier.hits;
                    best = barrier;
                }
            }
        }
        return this.applyBreachTarget(creep, best);
    }

    // Unpacked / incomplete waves stay off dest portals. A packed quad walks
    // rooms with shibSquadMovement — same as any other 2×2 step.
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
        if (!inDest && !split && stagingShares && creep.room.name !== staging
            && !this.onDestFacingExit(creep, dest)) {
            this.leaderTransit(new RoomPosition(25, 25, staging), {range: 22});
            return true;
        }

        const fullSquad = (squad || this.getSquad()).concat(creep);
        const together = this.isFormationPacked(fullSquad, creep);
        const quad = this.isQuad(creep);

        if (quad && together && !creep.memory.quadSnake && this.quadPresentForEntry(creep, squad)) {
            return false;
        }

        if (inDest) {
            if (this.squadOnDestExit(creep) || split) {
                if (this.stepOffDestExit(creep)) return true;
                this.chipDestEntry(creep, dest);
                return true;
            }
            return false;
        }

        // 2-wide dest face: packed hop. Keep quadSnake on a 1-wide hole so
        // the next tick still snakes instead of waiting for a 2×2 that cannot fit.
        const destDir = exitDirectionTo(creep.room.name, dest);
        if (!creep.memory.quadSnake
            || (destDir && this.onDestFacingExit(creep, dest)
                && this.destFrontOpen(dest, destDir, creep.pos.x, creep.pos.y, creep.memory.squadOrientation || 0))) {
            this.clearQuadSnake(creep);
        }

        const exitSpot = this.findStaging(creep);
        const goToExit = () => {
            if (!exitSpot || (creep.pos.x === exitSpot.x && creep.pos.y === exitSpot.y)) return false;
            if (quad && together) this.leaderTransit(exitSpot, {range: 0});
            else creep.shibMove(exitSpot, {range: 0, forceSolo: true});
            return true;
        };

        if (!together) {
            // Dest-inward 2×2 fits here: wait for followers to slot instead of
            // dragging an unpacked blob onto the exit (front row leaks into dest).
            if (quad && !creep.memory.quadSnake) {
                const destOrients = destDir ? this.destExitOrients(destDir) : [];
                const facing = creep.memory.squadOrientation || 0;
                if (destOrients.includes(facing) && this.orientationFits(creep, facing)
                    && !this.onSpawnApron(creep)) {
                    return true;
                }
                if (this.onDestFacingExit(creep, dest)) {
                    const fit = destOrients.find(o => this.orientationFits(creep, o));
                    if (fit !== undefined && !this.onSpawnApron(creep)) {
                        if (fit !== facing) creep.memory.squadOrientation = fit;
                        return true;
                    }
                }
            }
            if (quad && (creep.memory.quadSnake || this.onDestFacingExit(creep, dest))
                && this.snakeIntoDest(creep)) return true;
            goToExit();
            return true;
        }

        if (!this.quadPresentForEntry(creep, squad)) {
            goToExit();
            return true;
        }

        if (quad && destDir
            && !this.destFrontOpen(dest, destDir, creep.pos.x, creep.pos.y, creep.memory.squadOrientation || 0)
            && this.snakeIntoDest(creep)) return true;
        if (!this.onDestFacingExit(creep, dest) && goToExit()) return true;
        this.chipDestEntry(creep, dest);
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
            if (this.squadOnDestExit(creep) || this.squadSplitAcrossDest(creep)) {
                if (this.stepOffDestExit(creep)) return;
            }
            if (this.holdForQuadWiden(creep)) return;

            const canTank = this.canTankLiveTowers(creep);
            const width = this.isQuad(creep) ? 2 : 1;
            // Until a 2-wide (quad) / 1-wide (duo) hole exists, keep the border
            // wall as the target even if a creep is closer. Cannot-tank never
            // closes to range 1 under live towers.
            if (!canTank || !this.hasOpenFormationGap(creep)) {
                const barrier = this.pickBorderBreachTarget(creep, width)
                    || this.closestBarrierInRange(creep, 3);
                if (this.applyBreachTarget(creep, barrier)) {
                    const range = this.siegeCloseRange(creep, barrier);
                    if (creep.pos.getRangeTo(barrier) > range) this.leaderTransit(barrier, {range});
                    return;
                }
                if (!canTank) return;
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

    // Packed dest combat stays in dest. Cannot-tank used to path to staging
    // (range-7 tower kite) then hop back in, bouncing forever. Chip at RA 3
    // instead. Can-tank closes to barrierApproachRange. Never chase a creep
    // off the strip when we cannot tank and there is no wall in range.
    advancePackedQuad(creep, hostile) {
        if (!this.canTankLiveTowers(creep)) {
            const barrier = this.pickBorderBreachTarget(creep, this.isQuad(creep) ? 2 : 1)
                || this.closestBarrierInRange(creep, 3);
            if (this.applyBreachTarget(creep, barrier)) {
                const chipRange = this.siegeCloseRange(creep, barrier);
                if (creep.pos.getRangeTo(barrier) > chipRange) {
                    return this.leaderTransit(barrier, {range: chipRange});
                }
                return;
            }
            return;
        }
        const range = this.siegeCloseRange(creep, hostile);
        return this.leaderTransit(hostile, {range});
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

    // Can-tank: walk to barrierApproachRange (1 on empty walls). Cannot-tank:
    // stay at RA 3 so live towers dump at reduced range, but still chip.
    siegeCloseRange(creep, target) {
        const close = this.barrierApproachRange(target);
        if (this.canTankLiveTowers(creep)) return close;
        return Math.max(3, close);
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
        if (!this.isQuad(creep)) {
            this.clearQuadSnake(creep);
            return false;
        }
        const full = (squad || this.getSquad()).concat(creep);
        // isCurrentPosViable is true mid dest-exit hop so we don't flip facing.
        // Treating that as "done snaking" parked the leader on a 1-wide dest-exit.
        if (this.isFormationPacked(full, creep)
            || (this.isCurrentPosViable(creep) && !this.squadSplitAcrossDest(creep)
                && !this.squadOnDestExit(creep))) {
            this.clearQuadSnake(creep);
            return false;
        }

        const inward = this.entryInward(creep.pos);
        if (inward && this.pickBorderBreachTarget(creep, 2)) {
            // Followers still on staging need the flag to hop the 1-wide once
            // this dest-exit tile is free. Clearing it parked them on the pad.
            if (!this.squadSplitAcrossDest(creep)) this.clearQuadSnake(creep);
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
        // Whole squad in dest: walk the choke. Split: dest 25,25 is a solo run.
        if (this.squadSplitAcrossDest(creep)) return true;
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

    // True once dest-inward 1–2 steps have a formation-sized hole (quad: 2
    // adjacent walkable tiles; duo: 1). Interior of dest is already open.
    hasOpenFormationGap(creep) {
        const inward = this.entryInward(creep.pos);
        if (!inward) return true;
        const room = creep.room;
        const terrain = room.getTerrain();
        const along = inward.dx !== 0 ? {dx: 0, dy: 1} : {dx: 1, dy: 0};
        const width = this.isQuad(creep) ? 2 : 1;
        const cx = creep.pos.x;
        const cy = creep.pos.y;
        const walkable = (x, y) => {
            if (x < 1 || x > 48 || y < 1 || y > 48) return false;
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) return false;
            const pos = new RoomPosition(x, y, room.name);
            if (this.hostileBarrierAt(pos)) return false;
            return !pos.checkForImpassible(false, true);
        };
        for (let step = 1; step <= 2; step++) {
            const wx = cx + inward.dx * step;
            const wy = cy + inward.dy * step;
            for (let k = -4; k <= 4; k++) {
                const x = wx + along.dx * k;
                const y = wy + along.dy * k;
                if (!walkable(x, y)) continue;
                if (width < 2) return true;
                if (walkable(x + along.dx, y + along.dy)) return true;
            }
        }
        return false;
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

    // Sit at siegeCloseRange of the barrier we're opening. Do not chase
    // through a 1-tile hole — the 2×2 still cannot follow.
    holdForQuadWiden(creep) {
        if (!creep.memory.quadWiden) return false;
        const gap = Game.getObjectById(creep.memory.target);
        if (!gap || !gap.hits) {
            creep.memory.quadWiden = undefined;
            return false;
        }
        // Hole is wide enough and we can tank: stop chipping leftover wall
        // and let dest combat walk the formation through.
        if (this.canTankLiveTowers(creep) && this.hasOpenFormationGap(creep)) {
            creep.memory.quadWiden = undefined;
            return false;
        }
        const range = this.siegeCloseRange(creep, gap);
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
        this.clearQuadSnake(creep);
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
        // Mid room hop: exact slots can miss after a room wrap. Adjacency is
        // enough to finish the slide instead of sitting 2-in / 2-out forever.
        if (this.squadSplitAcrossRooms(leader) || this.squadOnAnyExit(leader)) {
            for (let i = 0; i < live.length; i++) {
                if (live[i].id === leader.id) continue;
                if (formationRange(live[i].pos, leader.pos) > 2) return false;
            }
            return live.length >= 3;
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
        const slot = offsetPos(leaderPos, dx, dy);
        return !!(slot && pos.roomName === slot.roomName && pos.x === slot.x && pos.y === slot.y);
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
            // Dest-adjacent: never spiral an interior 2×2 away from the attack
            // face. Wait on a dest-inward pad; holdForSquadEntry holds until it fits.
            if (squadSize > 2) return null;
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
        return this.destTileWalkable(dest, dx, dy, true);
    }

    destTileWalkable(dest, x, y, ignoreCreep) {
        if (x < 0 || x > 49 || y < 0 || y > 49) return false;
        const terrain = Game.map.getRoomTerrain(dest);
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) return false;
        const destRoom = Game.rooms[dest];
        if (destRoom && new RoomPosition(x, y, dest).checkForImpassible(false, ignoreCreep)) return false;
        return true;
    }

    destFrontOpenCount(dest, dir, lx, ly, orientation) {
        const landings = this.destFrontLandings(dest, dir, lx, ly, orientation);
        let n = 0;
        for (let i = 0; i < landings.length; i++) {
            if (this.destTileWalkable(dest, landings[i].x, landings[i].y, true)) n++;
        }
        return n;
    }

    destLandingCoords(dir, x, y) {
        let dx = x;
        let dy = y;
        if (dir === RIGHT) dx = 0;
        else if (dir === LEFT) dx = 49;
        else if (dir === TOP) dy = 49;
        else dy = 0;
        return {x: dx, y: dy};
    }

    // Terrain/structure-open dest landing, not occupied, not already claimed
    // this tick. Used to snake a quad through a 1-wide dest hole.
    canHopIntoDest(creep, dest) {
        dest = dest || creep.memory.destination;
        const dir = exitDirectionTo(creep.room.name, dest);
        if (!dir || !this.onDestFacingExit(creep, dest)) return 0;
        if (!this.destLandingWalkable(dest, dir, creep.pos.x, creep.pos.y)) return 0;
        const land = this.destLandingCoords(dir, creep.pos.x, creep.pos.y);
        if (land.x < 0 || land.x > 49 || land.y < 0 || land.y > 49) return 0;
        const destRoom = Game.rooms[dest];
        if (destRoom && new RoomPosition(land.x, land.y, dest).checkForImpassible(false, false)) return 0;
        if (!claimDestLanding(dest, land.x, land.y)) return 0;
        return dir;
    }

    // Leader-only dest-ward step when the 2×2 cannot occupy the next footprint.
    snakeIntoDest(creep) {
        const dest = creep.memory.destination;
        const dir = exitDirectionTo(creep.room.name, dest);
        if (!dir) return false;
        if (this.onDestFacingExit(creep, dest)) {
            const hop = this.canHopIntoDest(creep, dest);
            if (!hop) return false;
            creep.memory.quadSnake = true;
            return creep.move(hop) === OK;
        }
        const next = posAfterMove(creep.pos, dir);
        if (!next || next.roomName !== creep.room.name) return false;
        if (next.checkForImpassible(false, false)) return false;
        if (!this.destLandingWalkable(dest, dir, next.x, next.y)) return false;
        creep.memory.quadSnake = true;
        return creep.move(dir) === OK;
    }

    // Dest-facing pad. Quads: inland 2×2 so the next formation step crosses.
    // On-exit pads teleport at tick end and cannot host a 2×2. Duos: a single
    // dest-facing tile whose dest landing is open (1×1).
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
                const towerDmg = this.exitPadTowerDmg(dest, dir, lx, ly, 0);
                const score = (open ? 0 : 10000) + towerDmg * 10 + creep.pos.getRangeTo(lx, ly);
                if (score >= bestScore) continue;
                bestScore = score;
                best = {x: lx, y: ly, orientation: 0};
            }
            return best;
        }

        const inward = dir === RIGHT ? {dx: -1, dy: 0} : dir === LEFT ? {dx: 1, dy: 0}
            : dir === TOP ? {dx: 0, dy: 1} : {dx: 0, dy: -1};

        const consider = (lx, ly, candidate, offExit) => {
            if (lx < 0 || lx > 49 || ly < 0 || ly > 49) return;
            if (claimedByOther(lx, ly) || !tileClear(lx, ly, true)) return;
            const offsets = QUAD_OFFSETS[candidate];
            if (!offsets || !offsets.every(({dx, dy}) => tileClear(lx + dx, ly + dy, true))) return;
            const leaderOpen = this.destLandingWalkable(dest, dir, lx, ly);
            const width = this.destFrontOpenCount(dest, dir, lx, ly, candidate);
            const towerDmg = this.exitPadTowerDmg(dest, dir, lx, ly, candidate);
            const d = creep.pos.getRangeTo(lx, ly);
            // Prefer 2-wide dest landing, then a 1-wide hole the leader can
            // snake, then lower tower dump, then on-exit over one-tile-inward.
            const openScore = (leaderOpen && width >= 2) ? 0 : (leaderOpen && width >= 1) ? 50000 : 100000;
            // On-exit pad teleports at tick end. Prefer one tile inland.
            const score = openScore + towerDmg * 10 + d + (offExit ? 0 : 400);
            if (score >= bestScore) return;
            bestScore = score;
            best = {x: lx, y: ly, orientation: candidate};
        };

        for (let i = 0; i < tiles.length; i++) {
            const lx = tiles[i].x;
            const ly = tiles[i].y;
            for (let o = 0; o < orients.length; o++) {
                consider(lx + inward.dx, ly + inward.dy, orients[o], true);
            }
        }
        return best;
    }

    /* ====================== COMBAT HELPERS ====================== */

    fireRangedAction(creep) {
        if (!creep.hasActiveBodyparts(RANGED_ATTACK)) return;

        const focus = Game.getObjectById(creep.memory.target);
        const dest = creep.memory.destination;
        const focusHere = focus && focus.pos && creep.pos.getRangeTo(focus) <= 3
            && (focus.pos.roomName === creep.room.name || (dest && focus.pos.roomName === dest));

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

    // Staging neighbor until staged. Packed quads path dest as a 2×2; duos/unpacked
    // still walk the dest-facing pad so they do not hop 1-at-a-time.
    transitToOpTarget(creep) {
        if (creep.ensureDenialStaging) creep.ensureDenialStaging();
        const dest = creep.memory.destination;
        if (!dest) return false;
        const staging = creep.memory.misc && creep.memory.misc.stagingRoom;
        const destAdjacent = !!exitDirectionTo(creep.room.name, dest);
        // Dest-adjacent on the wrong face: walk around to the tunnel staging
        // unless we are already committed on dest-facing tiles.
        if (staging && staging !== dest && destAdjacent && creep.room.name !== staging
            && !this.onDestFacingExit(creep, dest)) {
            return this.leaderTransit(new RoomPosition(25, 25, staging), {range: 22});
        }
        // Packed quad: dest is just another room. Walk the 2×2 there.
        if (this.isQuad(creep) && dest !== creep.room.name && !creep.memory.quadSnake) {
            const together = this.isFormationPacked(this.getSquad().concat(creep), creep);
            if (together && this.quadPresentForEntry(creep)) {
                return this.leaderTransit(new RoomPosition(25, 25, dest), {range: 22});
            }
        }
        if (staging && staging !== dest && creep.room.name === staging) {
            if (this.onDestFacingExit(creep, dest)) {
                if (this.stepFormationIntoDest(creep)) return true;
                return true;
            }
            const pad = this.findStaging(creep);
            if (pad) return this.leaderTransit(pad, {range: 0});
            return this.leaderTransit(new RoomPosition(25, 25, dest), {range: 22});
        }
        // Dest-adjacent is already the neighbor — pathing to a different
        // staging room is the exit-stuck walk around dest.
        const transitTarget = (!destAdjacent && staging && !creep.memory.misc.staged) ? staging : dest;
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

        const squad = this.getSquad();
        const isReady = this.squadReadyToFight(this.creep, squad);

        if (isReady) {
            if (this.isQuad(this.creep)) return this.leadPackedQuad(this.creep);
            if (this.creep.handleMilitaryCreep()) return;
            if (this.creep.findDefensivePosition()) this.creep.idleFor(5);
        } else {
            if (this.squadSplitAcrossDest(this.creep) || this.squadOnDestExit(this.creep)) return;
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