/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

// How long a creep can sit unpaired before we give up and recycle. Squad
// formation legitimately takes 100-200 ticks (spawn + walk), so the floor
// is well above that. Past it the partner is almost certainly never coming.
const SOLO_RECYCLE_AFTER = 300;

const RETREAT_CRITICAL_PER_CREEP = 0.25;
const RETREAT_RECOVERY_THRESHOLD = 0.8;

// Per-tick cache of unpaired siegeDuo creeps grouped by destination, so each
// creep's pair-search is an O(1) lookup instead of a full Game.creeps scan.
// Rebuilt once per tick; in-tick pairings still re-check `memory.partner`
// because two creeps could read the cache and race for the same candidate.
let _pairCacheTick = -1;
let _siegeDuoPairs = {};

function getSiegeDuoPairsByDestination() {
    if (_pairCacheTick === Game.time) return _siegeDuoPairs;
    _pairCacheTick = Game.time;
    _siegeDuoPairs = {};
    const acc = (c) => {
        if (!c.my || c.spawning || c.memory.role !== 'siegeDuo' || c.memory.partner) return;
        const dest = c.memory.destination;
        if (!dest) return;
        if (!_siegeDuoPairs[dest]) _siegeDuoPairs[dest] = {attackers: [], healers: []};
        if (c.hasActiveBodyparts(ATTACK)) _siegeDuoPairs[dest].attackers.push(c);
        else if (c.hasActiveBodyparts(HEAL)) _siegeDuoPairs[dest].healers.push(c);
    };
    const military = global.world && global.world.militaryCreeps;
    if (military) {
        for (let i = 0; i < military.length; i++) acc(military[i]);
    } else {
        for (const name in Game.creeps) acc(Game.creeps[name]);
    }
    return _siegeDuoPairs;
}

class RoleSiegeDuo {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        if (!this.creep.memory.partner) return this.handleSolo();
        // Paired — clear any solo-timer carried over from the unpaired window.
        this.creep.memory.soloSince = undefined;
        if (this.creep.memory.leader) return this.handleLeader();
        return this.handleFollower();
    }

    housekeeping() {
        // Boosting
        if (this.creep.tryToBoost()) return true;
        // Blinky mode — attackers have no HEAL parts, skip the call entirely.
        if (this.creep.hasActiveBodyparts(HEAL)) {
            if (this.room.hostileCreeps.length || this.room.hostileStructures.length) {
                this.creep.healInRange(true);
            } else {
                this.creep.healInRange();
            }
        }
        // Clear stale partner ref (counterpart died).
        if (!Game.getObjectById(this.creep.memory.partner)) {
            this.creep.memory.leader = undefined;
            this.creep.memory.partner = undefined;
        }
        // Bidirectional pairing — either side initiates. Whichever role this
        // creep is, look up the opposite role for the same destination via
        // the per-tick cache. The `!c.memory.partner` recheck handles the
        // case where another creep already grabbed the candidate this tick.
        if (!this.creep.memory.partner && this.creep.memory.destination) {
            const pairs = getSiegeDuoPairsByDestination()[this.creep.memory.destination];
            if (pairs) {
                const isAttacker = this.creep.hasActiveBodyparts(ATTACK);
                const pool = isAttacker ? pairs.healers : pairs.attackers;
                const candidate = pool.find(c => c.id !== this.creep.id && !c.memory.partner);
                if (candidate) {
                    const leader = isAttacker ? this.creep : candidate;
                    const follower = isAttacker ? candidate : this.creep;
                    leader.memory.leader = true;
                    leader.memory.partner = follower.id;
                    follower.memory.partner = leader.id;
                    follower.memory.leader = undefined;
                    if (leader.memory.operation) follower.memory.operation = leader.memory.operation;
                    // Keep destination in sync — path failures can wipe one side's dest
                    // while operation remains set, which crashes RoomPosition in ops.
                    if (leader.memory.destination && !follower.memory.destination) {
                        follower.memory.destination = leader.memory.destination;
                    } else if (follower.memory.destination && !leader.memory.destination) {
                        leader.memory.destination = follower.memory.destination;
                    }
                }
            }
        }
    }

    handleLeader() {
        const partner = Game.getObjectById(this.creep.memory.partner);
        if (!partner) return;

        if (this.shouldRetreat([this.creep, partner])) {
            this.creep.fleeHome(true);
            return;
        }
        if (this.duoRenewal(partner)) return;

        const isReady = this.hasFullSquad(partner) && this.isPartnerNearby(partner, this.creep);

        if (isReady) {
            this.creep.memory.waitingToAssemble = undefined;
            if (!this.creep.memory.initialFormUp) this.creep.memory.initialFormUp = true;
            if (this.creep.memory.operation) this.operationManagement();
            else if (this.creep.memory.destination) this.destinationManagement();
            else this.creep.handleMilitaryCreep();
        } else {
            this.creep.memory.waitingToAssemble = true;
            this.creep.findDefensivePosition();
        }
    }

    handleFollower() {
        const partner = Game.getObjectById(this.creep.memory.partner);
        if (!partner) {
            this.creep.memory.partner = undefined;
            return;
        }
        if (partner.memory.operation) this.creep.memory.operation = partner.memory.operation;
        if (partner.memory.destination && this.creep.memory.destination !== partner.memory.destination) {
            this.creep.memory.destination = partner.memory.destination;
        }
        if (partner.memory.waitingToAssemble) this.creep.memory.waitingToAssemble = true;
        else this.creep.memory.waitingToAssemble = undefined;
        this.creep.shibMove(partner, {range: 0});
        if (this.creep.pos.isNearTo(partner) && partner.memory.idle) {
            this.creep.memory.idle = partner.memory.idle;
        }
    }

    handleSolo() {
        if (!this.creep.memory.soloSince) this.creep.memory.soloSince = Game.time;
        if (Game.time - this.creep.memory.soloSince > SOLO_RECYCLE_AFTER) return this.creep.recycleCreep();
        if (this.creep.findDefensivePosition()) this.creep.idleFor(5);
    }

    operationManagement() {
        // Operation handlers construct RoomPosition from destination; bail if missing.
        if (!this.creep.memory.destination) {
            const partner = Game.getObjectById(this.creep.memory.partner);
            if (partner && partner.memory.destination) {
                this.creep.memory.destination = partner.memory.destination;
            } else {
                return this.destinationManagement();
            }
        }
        switch (this.creep.memory.operation) {
            case 'stronghold':
                this.creep.strongholdAttack();
                break;
            case 'roomDenial':
                this.creep.denyRoom();
                break;
        }
    }

    destinationManagement() {
        if (!this.creep.memory.destination) {
            if (this.creep.handleMilitaryCreep()) return;
            if (this.creep.findDefensivePosition()) this.creep.idleFor(5);
            return;
        }
        if (this.room.name !== this.creep.memory.destination) {
            return this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 22});
        } else {
            // If we can't get to the controller or sources, clear a path
            if (!this.creep.scorchedEarth()) {
                this.room.cacheRoomIntel(true);
                this.creep.recycleCreep();
            }
        }
    }

    duoRenewal(partner) {
        if (this.creep.memory.initialFormUp || this.creep.room.level < 7) return false;
        if (this.room.hostileCreeps.length || this.room.hostileStructures.length) return false;
        if (!this.creep.memory.hasBoosted && !this.creep.memory.boostAttempt &&
            this.creep.handleRenewing(CREEP_LIFE_TIME * 0.8)) return true;
        if (partner && !partner.memory.hasBoosted && !partner.memory.boostAttempt &&
            partner.handleRenewing(CREEP_LIFE_TIME * 0.8)) return true;
        return false;
    }

    shouldRetreat(duo) {
        const creep = this.creep;
        let totalHits = 0;
        let totalHitsMax = 0;
        let criticalMember = false;
        for (const c of duo) {
            if (!c) continue;
            totalHits += c.hits;
            totalHitsMax += c.hitsMax;
            if (c.hits / c.hitsMax < RETREAT_CRITICAL_PER_CREEP) criticalMember = true;
        }
        const duoHealth = totalHitsMax ? totalHits / totalHitsMax : 1;

        if (creep.memory.retreating) {
            if (duoHealth >= RETREAT_RECOVERY_THRESHOLD && !criticalMember) {
                creep.memory.retreating = undefined;
                return false;
            }
            return true;
        }

        if (criticalMember || duoHealth < 0.45) {
            creep.memory.retreating = true;
            return true;
        }
        return false;
    }

    hasFullSquad(partner) {
        if (this.creep.memory.initialFormUp) return true;
        partner = partner || Game.getObjectById(this.creep.memory.partner);
        if (!partner) return false;
        return !!(this.creep.memory.boostAttempt && partner.memory.boostAttempt);
    }

    isPartnerNearby(partner, leader) {
        if (!partner) return false;
        if (partner.pos.roomName !== leader.pos.roomName) {
            const safeTransit = !leader.room.hostileCreeps.length && !leader.room.hostileStructures.length &&
                !partner.room.hostileCreeps.length && !partner.room.hostileStructures.length &&
                !this.nearDestination(leader);
            return safeTransit;
        }
        // Safe territory and not yet near the target — don't force adjacency.
        if (!partner.room.hostileCreeps.length && !partner.room.hostileStructures.length && !this.nearDestination(leader)) return true;
        // Partner straddling a room border (mid-transition) — treat as ready.
        if (partner.pos.checkIfOutOfBounds()) return true;
        return partner.pos.isNearTo(leader.pos);
    }

    nearDestination(leader) {
        if (!leader.memory.destination) return false;
        return Game.map.getRoomLinearDistance(leader.room.name, leader.memory.destination) <= 1;
    }
}

profiler.registerClass(RoleSiegeDuo, 'siegeDuo');
module.exports = RoleSiegeDuo;