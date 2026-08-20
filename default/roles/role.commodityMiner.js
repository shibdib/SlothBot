/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleCommodityMiner {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        if (!this.creep.memory.deposit && this.room.name !== this.creep.memory.destination && !_.sum(this.creep.store)) {
            this.travelToDeposit();
        } else if (this.creep.memory.deposit && !this.creep.isFull && this.creep.ticksToLive > this.creep.memory.tickCutoff) {
            this.harvest();
        } else if (_.sum(this.creep.store)) {
            this.creep.memory.deposit = undefined;
            this.returnResource();
        } else {
            this.findDeposit();
        }
    }

    housekeeping() {
        // Boosting
        if (this.creep.tryToBoost()) return true;

        // SK Safety - Throttled
        if ((this.room.memory.sk || (INTEL[this.room.name] && INTEL[this.room.name].sk)) && this.creep.skSafety()) return true;

        // Set dropoff
        this.creep.memory.closestRoom = this.creep.memory.closestRoom || findClosestOwnedRoom(this.room.name, false, 4) || this.creep.memory.colony;

        // Set tick cutoff
        if (!this.creep.memory.tickCutoff) this.creep.memory.tickCutoff = (Game.map.getRoomLinearDistance(this.creep.memory.closestRoom, this.creep.memory.destination) + 3) * 50;

        // Old age and work/carry part check
        if (this.creep.ticksToLive < this.creep.memory.tickCutoff || !this.creep.hasActiveBodyparts(WORK) || !this.creep.hasActiveBodyparts(CARRY)) {
            this.creep.recycleCreep();
            return true;
        }

        // Colony-local SK / sector-center mining does not use auxiliaryTargets.
        const localMineral = this.creep.memory.other && this.creep.memory.other.localMineral;
        if (!this.creep.memory.destination) {
            this.creep.recycleCreep();
            return true;
        }
        if (localMineral) {
            const colony = this.creep.memory.colony;
            const skRoom = this.creep.memory.other.skRoom || this.creep.memory.destination;
            const targets = colony && ROOM_REMOTE_TARGETS[colony];
            // Empty targets after a global reset are a cache miss, not a drop.
            if (targets && targets.length && !targets.some(s => s.room === skRoom)) {
                this.creep.recycleCreep();
                return true;
            }
        } else if (!Memory.auxiliaryTargets[this.creep.memory.destination]) {
            this.creep.recycleCreep();
            return true;
        }
    }

    travelToDeposit() {
        const destination = Game.getObjectById(this.creep.memory.deposit) || new RoomPosition(25, 25, this.creep.memory.destination);
        return this.creep.shibMove(destination, {range: 1});
    }

    harvest() {
        let deposit = Game.getObjectById(this.creep.memory.deposit);
        // Clear the deposit if needed
        if (!deposit || (!deposit.depositType && !deposit.mineralAmount)) return this.creep.memory.deposit = undefined;
        // Refresh the operation
        if (Memory.auxiliaryTargets[this.creep.memory.destination]) Memory.auxiliaryTargets[this.creep.memory.destination].tick = Game.time;
        switch (this.creep.harvest(deposit)) {
            case OK:
                if (!this.creep.memory.other) this.creep.memory.other = {};
                this.creep.memory.other.stationary = true;
                break;
            case ERR_NOT_IN_RANGE:
                this.creep.shibMove(deposit);
                break;
            case ERR_NOT_ENOUGH_RESOURCES:
                this.creep.memory.deposit = undefined;
                break;
            case ERR_NOT_FOUND:
                if (deposit.mineralType) {
                    const {tryCreateConstructionSite} = require('planUtils');
                    tryCreateConstructionSite(deposit.pos, STRUCTURE_EXTRACTOR);
                } else {
                    this.creep.memory.deposit = undefined;
                }
                break;
            case ERR_TIRED:
                if (this.creep.pos.isNearTo(deposit)) this.creep.idleFor(deposit.cooldown);
        }
    }

    returnResource() {
        if (this.creep.memory.other) this.creep.memory.other.stationary = undefined;
        this.creep.memory.closestRoom = this.creep.memory.closestRoom || findClosestOwnedRoom(this.room.name, false, 4) || this.creep.memory.colony;
        if (this.room.name !== this.creep.memory.closestRoom) {
            return this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.closestRoom), {range: 23});
        } else {
            let deliver = this.room.terminal || this.room.storage;
            if (deliver) {
                for (let resourceType in this.creep.store) {
                    switch (this.creep.transfer(deliver, resourceType)) {
                        case OK:
                            this.creep.memory.hauling = undefined;
                            break;
                        case ERR_NOT_IN_RANGE:
                            this.creep.shibMove(deliver);
                            break;
                    }
                }
            }
        }
    }

    findDeposit() {
        //Find Deposit
        let deposit = _.find(this.room.deposits, (d) => (d.depositType || d.mineralAmount));
        // If no deposits check for a mineral in rooms without a controller (SK / sector center).
        if (!deposit && this.room.mineral && this.room.mineral.mineralAmount && !this.room.controller) {
            deposit = this.room.mineral;
            if (deposit) {
                return this.creep.memory.deposit = deposit.id;
            }
        } else if (!deposit) {
            const localMineral = this.creep.memory.other && this.creep.memory.other.localMineral;
            if (!localMineral) {
                if (INTEL[this.creep.memory.destination]) INTEL[this.creep.memory.destination].commodity = undefined;
                Memory.auxiliaryTargets[this.creep.memory.destination] = undefined;
            }
            this.creep.recycleCreep();
            return this.creep.memory.deposit = undefined;
        } else {
            // Choose a random deposit
            return this.creep.memory.deposit = deposit.id;
        }
    }
}

profiler.registerClass(RoleCommodityMiner, 'CommodityMiner');
module.exports = RoleCommodityMiner;
