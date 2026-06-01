/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

// How long a creep can sit unpaired before we give up and recycle. Squad
// formation legitimately takes 100-200 ticks (spawn + walk), so the floor
// is well above that. Past it the partner is almost certainly never coming.
const SOLO_RECYCLE_AFTER = 300;

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
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c.my || c.spawning || c.memory.role !== 'siegeDuo' || c.memory.partner) continue;
        const dest = c.memory.destination;
        if (!dest) continue;
        if (!_siegeDuoPairs[dest]) _siegeDuoPairs[dest] = {attackers: [], healers: []};
        if (c.hasActiveBodyparts(ATTACK)) _siegeDuoPairs[dest].attackers.push(c);
        else if (c.hasActiveBodyparts(HEAL)) _siegeDuoPairs[dest].healers.push(c);
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
                }
            }
        }
    }

    handleLeader() {
        const partner = Game.getObjectById(this.creep.memory.partner);
        const isReady = this.hasFullSquad() && this.isPartnerNearby(partner, this.creep);

        if (isReady) {
            if (!this.creep.memory.initialFormUp) this.creep.memory.initialFormUp = true;
            if (this.creep.memory.operation) this.operationManagement(); else if (this.creep.memory.destination) this.destinationManagement();
            else this.creep.handleMilitaryCreep();
        } else {
            this.creep.findDefensivePosition();
        }
    }

    handleFollower() {
        const partner = Game.getObjectById(this.creep.memory.partner);
        if (!partner) {
            this.creep.memory.partner = undefined;
            return;
        }
        this.creep.shibMove(partner, {range: 0});
        if (partner.memory.idle) {
            this.creep.memory.idle = partner.memory.idle;
        }
    }

    handleSolo() {
        if (this.creep.handleMilitaryCreep()) return;
        if (!this.creep.memory.soloSince) this.creep.memory.soloSince = Game.time;
        if (Game.time - this.creep.memory.soloSince > SOLO_RECYCLE_AFTER) return this.creep.recycleCreep();
        if (this.creep.findDefensivePosition()) this.creep.idleFor(5);
    }

    operationManagement() {
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

    hasFullSquad() {
        if (this.creep.memory.initialFormUp) return true;
        const partner = Game.getObjectById(this.creep.memory.partner);
        return !!(partner && partner.memory.boostAttempt);
    }

    isPartnerNearby(partner, leader) {
        if (!partner || partner.pos.roomName !== leader.pos.roomName) return true;
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
