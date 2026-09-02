/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Season 11: haul Thorium from the feeder room to a sector-center Reactor.
 */

const profiler = require('tools.profiler');
const {findReactors, thoriumType} = require('module.season');

class RoleThoriumHauler {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        if (this.carrying()) {
            this.deliver();
        } else {
            this.collect();
        }
    }

    carrying() {
        const t = thoriumType();
        return (this.creep.store[t] || 0) > 0;
    }

    housekeeping() {
        if (!this.creep.memory.destination) return this.creep.recycleCreep();
        this.creep.say('Th', true);
        if (this.carrying()) this.stepOffDecayTiles();
        const hops = Game.map.getRoomLinearDistance(this.room.name, this.creep.memory.destination) || 0;
        if (!this.carrying() && this.creep.ticksToLive < hops * 50 + 80) {
            return this.creep.recycleCreep();
        }
    }

    stepOffDecayTiles() {
        const structs = this.creep.pos.lookFor(LOOK_STRUCTURES);
        for (let i = 0; i < structs.length; i++) {
            const type = structs[i].structureType;
            if (type === STRUCTURE_ROAD || type === STRUCTURE_CONTAINER) {
                this.creep.move(Math.ceil(Math.random() * 8));
                return;
            }
        }
    }

    collect() {
        const t = thoriumType();
        const pickup = this.findPickup();
        if (pickup) {
            const result = pickup.store ? this.creep.withdraw(pickup, t) : this.creep.pickup(pickup);
            if (result === ERR_NOT_IN_RANGE) {
                this.creep.shibMove(pickup, {range: 1, offRoad: true});
            }
            return;
        }

        const feeder = (Memory.season && Memory.season.feederRoom) || this.creep.memory.colony;
        if (feeder && this.room.name !== feeder) {
            return this.creep.shibMove(new RoomPosition(25, 25, feeder), {range: 23});
        }
        this.creep.idleFor(5);
    }

    findPickup() {
        const t = thoriumType();
        const drops = this.room.droppedResources || [];
        for (let i = 0; i < drops.length; i++) {
            if (drops[i].resourceType === t && drops[i].amount > 0) return drops[i];
        }
        const tombs = this.room.tombstones || [];
        for (let i = 0; i < tombs.length; i++) {
            if (tombs[i].store && tombs[i].store[t]) return tombs[i];
        }
        const terminal = this.room.terminal;
        if (terminal && terminal.store[t]) return terminal;
        const storage = this.room.storage;
        if (storage && storage.store[t]) return storage;
        return null;
    }

    deliver() {
        const dest = this.creep.memory.destination;
        if (this.room.name !== dest) {
            return this.creep.shibMove(new RoomPosition(25, 25, dest), {range: 23, offRoad: true});
        }
        const reactors = findReactors(this.room);
        const reactor = reactors[0];
        if (!reactor) {
            this.creep.idleFor(5);
            return;
        }
        if (!reactor.my) {
            if (this.creep.pos.getRangeTo(reactor) > 3) {
                this.creep.shibMove(reactor, {range: 3, offRoad: true});
            } else {
                this.stepOffDecayTiles();
            }
            return;
        }
        const t = thoriumType();
        const free = reactor.store && reactor.store.getFreeCapacity(t);
        if (free === 0) {
            if (this.creep.pos.getRangeTo(reactor) > 2) this.creep.shibMove(reactor, {range: 2, offRoad: true});
            else this.stepOffDecayTiles();
            return;
        }
        const result = this.creep.transfer(reactor, t);
        if (result === ERR_NOT_IN_RANGE) {
            this.creep.shibMove(reactor, {range: 1, offRoad: true});
        } else if (result === ERR_FULL) {
            if (this.creep.pos.getRangeTo(reactor) > 2) this.creep.shibMove(reactor, {range: 2, offRoad: true});
            else this.stepOffDecayTiles();
        }
    }
}

profiler.registerClass(RoleThoriumHauler, 'ThoriumHauler');
module.exports = RoleThoriumHauler;
