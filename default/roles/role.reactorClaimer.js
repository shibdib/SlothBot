/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Season 11: CLAIM a sector-center Reactor. Ownership can flip at any time.
 */

const profiler = require('tools.profiler');
const {findReactors, reactorPos} = require('module.season');

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
            this.creep.suicide();
            return true;
        }
        this.creep.say('Rx', true);
        // Lethal range only. Range 7 kited them off the SK-ring corridor until
        // TTL died. Invader cores in those rooms must not suicide a claimer.
        if (this.creep.skSafety({keepMoving: true, noSuicide: true, range: 3})) return true;
        let dest = this.creep.memory.destination;
        if (!dest) {
            dest = Memory.season && Memory.season.targetReactor;
            if (dest) this.creep.memory.destination = dest;
        }
        if (!dest) {
            if (!this.freshAtHome()) this.creep.recycleCreep();
            return true;
        }
    }

    travel() {
        const dest = this.creep.memory.destination;
        this.creep.shibMove(reactorPos(dest), {range: 23, shortest: true});
    }

    claim() {
        const reactors = findReactors(this.room);
        const reactor = reactors[0];
        if (!reactor) {
            const pos = reactorPos(this.room.name);
            if (this.creep.pos.getRangeTo(pos) > 1) this.creep.shibMove(pos, {range: 1});
            else this.creep.say('?Rx');
            return;
        }
        if (reactor.my) {
            if (this.creep.pos.getRangeTo(reactor) > 2) this.creep.shibMove(reactor, {range: 2});
            return;
        }
        if (typeof this.creep.claimReactor !== 'function') {
            this.creep.say('?Rx');
            if (this.creep.pos.getRangeTo(reactor) > 1) this.creep.shibMove(reactor, {range: 1});
            return;
        }
        switch (this.creep.claimReactor(reactor)) {
            case ERR_NOT_IN_RANGE:
                this.creep.shibMove(reactor, {range: 1});
                break;
            case OK:
                break;
            default:
                if (this.creep.pos.getRangeTo(reactor) > 1) this.creep.shibMove(reactor, {range: 1});
        }
    }
}

profiler.registerClass(RoleReactorClaimer, 'ReactorClaimer');
module.exports = RoleReactorClaimer;
