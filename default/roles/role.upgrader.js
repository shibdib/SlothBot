/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleUpgrader {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.container = Game.getObjectById(this.room.memory.controllerContainer);
        this.link = Game.getObjectById(this.room.memory.controllerLink);
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        if (this.creep.memory.other.noMove || !this.creep.hasActiveBodyparts(MOVE) || this.link || this.container) {
            this.stationaryUpgrading();
        } else {
            this.mobileUpgrading();
        }
    }

    housekeeping() {
        // Boosting
        if (this.creep.tryToBoost()) return true;
        return false;
    }

    stationaryUpgrading() {
        if (!this.container && !this.link) {
            return this.creep.recycleCreep();
        }
        this.creep.memory.other.stationary = true;
        this.creep.memory.other.noMove = true;
        // Handle getting in place
        if (!this.creep.memory.inPosition) {
            if (!this.link && this.container) {
                if (this.creep.pos.isEqualTo(this.container.pos) || this.creep.pos.isNearTo(this.container)) this.creep.memory.inPosition = true;
                else return this.creep.shibMove(this.container, {range: 0});
            } else if (this.link && !this.container) {
                if (this.creep.pos.isNearTo(this.link)) this.creep.memory.inPosition = true;
                else return this.creep.shibMove(this.link, {range: 1})
            } else {
                if (this.creep.pos.isEqualTo(this.container.pos) || this.creep.pos.isNearTo(this.link)) this.creep.memory.inPosition = true;
                else if (!this.container.pos.checkForCreep()) return this.creep.shibMove(this.container, {range: 0})
                else return this.creep.shibMove([this.container, this.link], {range: 1})
            }
        }

        const result = this.creep.upgradeController(this.room.controller);
        if (result === OK) {
            this.withdraw();
        } else if (result === ERR_NOT_IN_RANGE) {
            this.creep.shibMove(this.room.controller, {range: 3});
        } else if (result === ERR_NOT_ENOUGH_RESOURCES) {
            this.withdraw();
        }
    }

    mobileUpgrading() {
        if (this.creep.store[RESOURCE_ENERGY] > 0) {
            const result = this.creep.upgradeController(this.room.controller);
            if (result === OK) {
                this.creep.memory.other.stationary = true;
            } else if (result === ERR_NOT_IN_RANGE) {
                this.creep.shibMove(this.room.controller, {range: 3});
            } else if (result === ERR_NOT_ENOUGH_RESOURCES) {
                this.creep.memory.other.stationary = undefined;
                this.withdraw();
            }
        } else if (this.creep.memory.energyDestination || this.creep.locateEnergy()) {
            this.creep.memory.other.stationary = undefined;
            this.creep.withdrawResource();
        } else if (this.container && this.container.store[RESOURCE_ENERGY] > 0) {
            this.creep.memory.other.stationary = undefined;
            this.creep.withdrawResource(this.container);
        } else {
            this.creep.memory.other.stationary = undefined;
            this.creep.idleFor(15);
        }
    }

    withdraw() {
        if (this.link && this.creep.pos.isNearTo(this.link) && this.link.store[RESOURCE_ENERGY] > 0) {
            return this.creep.withdraw(this.link, RESOURCE_ENERGY);
        } else if (this.container && this.creep.pos.isNearTo(this.container) && this.container.store[RESOURCE_ENERGY] > 0) {
            return this.creep.withdraw(this.container, RESOURCE_ENERGY);
        } else if (this.room.level < 4 && Game.time % 10 === 0) {
            const nearbyUpgrader = this.creep.pos.findInRange(this.room.myCreeps, 1, {filter: c => c.id !== this.creep.id && c.memory.role === 'upgrader' && c.store[RESOURCE_ENERGY] > 0})[0];
            if (nearbyUpgrader) {
                return nearbyUpgrader.transfer(this.creep, RESOURCE_ENERGY);
            }
        }
    }
}

profiler.registerClass(RoleUpgrader, 'Upgrader');
module.exports = RoleUpgrader;
