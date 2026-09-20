/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Season 11: CLAIM a sector-center Reactor. Ownership can flip at any time.
 */

const profiler = require('tools.profiler');
const {findReactors} = require('module.season');

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
        this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {
            range: 23,
            shortest: true
        });
    }

    claim() {
        const reactors = findReactors(this.room);
        const reactor = reactors[0];
        if (!reactor) {
            this.creep.idleFor(5);
            return;
        }
        if (reactor.my) {
            if (this.creep.pos.getRangeTo(reactor) > 2) this.creep.shibMove(reactor, {range: 2});
            return;
        }
        const claimFn = this.creep.claimReactor;
        if (typeof claimFn !== 'function') {
            this.creep.say('?Rx');
            return;
        }
        switch (this.creep.claimReactor(reactor)) {
            case ERR_NOT_IN_RANGE:
                this.creep.shibMove(reactor);
                break;
            case OK:
                break;
            default:
                if (this.creep.pos.getRangeTo(reactor) > 1) this.creep.shibMove(reactor);
        }
    }
}

profiler.registerClass(RoleReactorClaimer, 'ReactorClaimer');
module.exports = RoleReactorClaimer;
