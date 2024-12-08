/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("./tools.profiler");

class RoleCommodityMiner {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    // Placeholder for role-specific actions
    performRoleActions() {
        if (this.housekeeping()) return;
        if (this.room.name !== this.creep.memory.destination && !_.sum(this.creep.store)) {
            this.travelToDeposit();
        } else if (this.creep.memory.deposit && !this.creep.isFull) {
            this.harvest();
        } else if (_.sum(this.creep.store)) {
            this.returnResource();
        } else {
            this.findDeposit();
        }
    }

    housekeeping() {
        if (this.creep.tryToBoost(['harvest'])) return true;
        // Old age check
        if (this.creep.ticksToLive < 150) if (!_.sum(this.creep.store)) return this.creep.suicide(); else return this.creep.recycleCreep();
        // Make sure the operation is active
        if (!Memory.auxiliaryTargets[this.creep.memory.destination]) if (!_.sum(this.creep.store)) return this.creep.suicide(); else return this.creep.recycleCreep();
    }

    travelToDeposit() {
        return this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 22, offRoad: true});
    }

    harvest() {
        let deposit = Game.getObjectById(this.creep.memory.deposit);
        // Store space
        if (!Memory.auxiliaryTargets[this.creep.memory.destination].space) Memory.auxiliaryTargets[this.creep.memory.destination].space = deposit.pos.countOpenTerrainAround();
        // Clear the deposit if needed
        if (!deposit || (!deposit.depositType && !deposit.mineralAmount) || deposit.lastCooldown >= 25) return this.creep.memory.deposit = undefined;
        // Refresh the operation
        if (Memory.auxiliaryTargets[this.creep.memory.destination]) Memory.auxiliaryTargets[this.creep.memory.destination].tick = Game.time;
        switch (this.creep.harvest(deposit)) {
            case OK:
                this.creep.memory.other.noBump = true;
                break;
            case ERR_NOT_IN_RANGE:
                this.creep.shibMove(deposit);
                break;
            case ERR_NOT_ENOUGH_RESOURCES:
                this.creep.memory.deposit = undefined;
                break;
            case ERR_TIRED:
                if (this.creep.pos.isNearTo(deposit)) this.creep.idleFor(deposit.cooldown);
        }
    }

    returnResource() {
        this.creep.memory.other.noBump = undefined;
        this.creep.memory.closestRoom = this.creep.memory.closestRoom || findClosestOwnedRoom(this.room.name, false, 4);
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
        let deposit = _.find(this.room.deposits, (d) => !d.lastCooldown || d.lastCooldown < 25) || this.room.mineral;
        if (deposit && (deposit.depositType || deposit.mineralAmount)) {
            this.creep.memory.deposit = deposit.id;
        } else {
            INTEL[this.creep.memory.destination].commodity = undefined;
            Memory.auxiliaryTargets[this.creep.memory.destination] = undefined;
        }
    }
}

profiler.registerClass(RoleCommodityMiner, 'CommodityMiner');
module.exports = RoleCommodityMiner;
