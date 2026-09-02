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
        if (!this.creep.memory.destination || this.room.name !== this.creep.memory.destination) {
            this.travel();
        } else {
            this.claim();
        }
    }

    housekeeping() {
        if (!this.creep.hasActiveBodyparts(CLAIM)) {
            this.creep.suicide();
            return true;
        }
        this.creep.say('Rx', true);
        if (!this.creep.memory.destination) {
            this.creep.recycleCreep();
            return true;
        }
        const hops = Game.map.getRoomLinearDistance(this.room.name, this.creep.memory.destination) || 0;
        if (this.creep.ticksToLive < hops * 50 + 30 && this.room.name !== this.creep.memory.destination) {
            this.creep.recycleCreep();
            return true;
        }
    }

    travel() {
        this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 23});
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
