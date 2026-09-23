/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Season 11: CLAIM a sector-center Reactor. Ownership can flip at any time.
 */

const profiler = require('tools.profiler');
const {findReactors, reactorPos, claimerNote, errName} = require('module.season');
const {findSectorCenterRoute} = require('pathRoute');

class RoleReactorClaimer {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        const dest = this.creep.memory.destination;
        if (!dest || this.room.name !== dest) {
            this.travel();
            if (this.creep.memory._claimAbort === dest && !this.freshAtHome()) {
                claimerNote(this.creep, 'abort', {msg: 'ttl abort'});
                this.creep.recycleCreep();
            }
        } else {
            this.claim();
        }
    }

    freshAtHome() {
        const ttl = this.creep.ticksToLive || 0;
        if (ttl < CREEP_CLAIM_LIFE_TIME - 80) return false;
        const home = this.creep.memory.colony;
        return this.room.name === home || !!(typeof MY_ROOMS !== 'undefined' && MY_ROOMS.includes(this.room.name));
    }

    housekeeping() {
        if (this.creep.spawning) return true;
        if (!this.creep.hasActiveBodyparts(CLAIM)) {
            claimerNote(this.creep, 'suicide', {msg: 'no CLAIM'});
            this.creep.suicide();
            return true;
        }
        this.creep.say('Rx', true);
        // Lethal range only. Range 7 kited them off the SK-ring corridor until
        // TTL died. Invader cores in those rooms must not suicide a claimer.
        if (this.creep.skSafety({keepMoving: true, noSuicide: true, range: 3})) {
            if (!this.creep.memory._rxKiteLog || this.creep.memory._rxKiteLog + 10 <= Game.time) {
                this.creep.memory._rxKiteLog = Game.time;
                claimerNote(this.creep, 'kite', {
                    threat: (this.room.invaderCore ? 'core ' : '') +
                        (this.creep.skThreatNear(this.creep.pos, 5, true)
                            ? 'sk' : 'lair')
                });
            }
            return true;
        }
        let dest = this.creep.memory.destination;
        if (!dest) {
            dest = Memory.season && Memory.season.targetReactor;
            if (dest) this.creep.memory.destination = dest;
        }
        if (!dest) {
            if (!this.freshAtHome()) {
                claimerNote(this.creep, 'recycle', {msg: 'no dest'});
                this.creep.recycleCreep();
            }
            return true;
        }
    }

    travel() {
        const dest = this.creep.memory.destination;
        const route = findSectorCenterRoute(this.room.name, dest);
        const key = route && route.join(',');
        if (key && this.creep.memory._rxRoute !== key) {
            this.creep.memory._rxRoute = key;
            claimerNote(this.creep, 'route', {msg: key, hops: route.length});
        }
        this.creep.shibMove(reactorPos(dest), {
            range: 23,
            shortest: true,
            route,
            fullRoute: route,
            claimRoute: route
        });
    }

    claim() {
        if (!this.creep.memory._rxArrived) {
            this.creep.memory._rxArrived = Game.time;
            claimerNote(this.creep, 'arrive', {
                fn: typeof this.creep.claimReactor === 'function'
            });
        }
        const reactors = findReactors(this.room);
        const reactor = reactors[0];
        if (!reactor) {
            const pos = reactorPos(this.room.name);
            if (!this.creep.memory._rxNoRxLog || this.creep.memory._rxNoRxLog + 25 <= Game.time) {
                this.creep.memory._rxNoRxLog = Game.time;
                claimerNote(this.creep, 'noReactor', {msg: 'find empty'});
            }
            if (this.creep.pos.getRangeTo(pos) > 1) this.creep.shibMove(pos, {range: 1});
            else this.creep.say('?Rx');
            return;
        }
        if (reactor.my) {
            if (!this.creep.memory._rxMineLog) {
                this.creep.memory._rxMineLog = Game.time;
                claimerNote(this.creep, 'claim', {code: 'already-mine', msg: 'already mine'});
            }
            if (this.creep.pos.getRangeTo(reactor) > 2) this.creep.shibMove(reactor, {range: 2});
            return;
        }
        if (typeof this.creep.claimReactor !== 'function') {
            if (!this.creep.memory._rxNoFnLog) {
                this.creep.memory._rxNoFnLog = Game.time;
                claimerNote(this.creep, 'noFn', {msg: 'claimReactor missing'});
            }
            this.creep.say('?Rx');
            if (this.creep.pos.getRangeTo(reactor) > 1) this.creep.shibMove(reactor, {range: 1});
            return;
        }
        const result = this.creep.claimReactor(reactor);
        if (result !== ERR_NOT_IN_RANGE) {
            if (this.creep.memory._rxClaimLog !== result) {
                this.creep.memory._rxClaimLog = result;
                claimerNote(this.creep, 'claim', {
                    code: errName(result),
                    msg: errName(result),
                    range: this.creep.pos.getRangeTo(reactor)
                });
            }
        }
        if (result === ERR_NOT_IN_RANGE || result !== OK) {
            if (this.creep.pos.getRangeTo(reactor) > 1) this.creep.shibMove(reactor, {range: 1});
        }
    }
}

profiler.registerClass(RoleReactorClaimer, 'ReactorClaimer');
module.exports = RoleReactorClaimer;
