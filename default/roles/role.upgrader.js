/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleUpgrader {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.container = Game.getObjectById(this.room.memory.controllerContainer);
        if (!this.container) this.room.memory.controllerContainer = undefined;
        this.link = Game.getObjectById(this.room.memory.controllerLink);
        if (!this.link) this.room.memory.controllerLink = undefined;
        else if (!this.creep.memory.other.linkCheck) {
            if (this.container && !this.link.pos.isNearTo(this.container)) {
                this.link.destroy();
                this.room.memory.controllerLink = undefined;
            }
            this.creep.memory.other.linkCheck = true;
        }
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        if (this.creep.memory.other.noMove || !this.creep.hasActiveBodyparts(MOVE)) {
            this.stationaryUpgrading();
        } else {
            this.mobileUpgrading();
        }
    }

    housekeeping() {
        // Boost
        if (this.creep.tryToBoost(['upgrade'])) return true;
    }

    stationaryUpgrading() {
        if (!this.container) return this.creep.recycleCreep();
        this.creep.memory.other.stationary = true;
        this.creep.memory.other.noMove = true;
        // Handle getting in place
        if (!this.creep.memory.inPosition && this.container) {
            if (!this.link) {
                if (this.container.pos.checkForCreep() && this.creep.pos.isNearTo(this.container)) this.creep.memory.inPosition = true;
                else return this.creep.shibMove(this.container, {range: 0});
            } else {
                if (this.container.pos.checkForCreep() && (this.creep.pos.isNearTo(this.container) || this.creep.pos.isNearTo(this.link))) this.creep.memory.inPosition = true;
                else if (!this.container.pos.checkForCreep()) return this.creep.shibMove(this.container, {range: 0})
                else return this.creep.shibMove([this.container, this.link], {range: 1})
            }
        }
        switch (this.creep.upgradeController(Game.rooms[this.creep.memory.colony].controller)) {
            case OK:
                // Handle resource withdraw
                this.withdraw();
                return;
            case ERR_NOT_IN_RANGE:
                return this.creep.shibMove(Game.rooms[this.creep.memory.colony].controller, {range: 3});
            case ERR_NOT_ENOUGH_RESOURCES:
                // Handle resource withdraw
                this.withdraw();
        }
    }

    mobileUpgrading() {
        if (this.creep.store[RESOURCE_ENERGY]) {
            switch (this.creep.upgradeController(Game.rooms[this.creep.memory.colony].controller)) {
                case OK:
                    this.creep.memory.other.stationary = true;
                    return;
                case ERR_NOT_IN_RANGE:
                    this.creep.shibMove(this.room.controller, {range: 3});
                    return;
                case ERR_NOT_ENOUGH_RESOURCES:
                    // Handle resource withdraw
                    this.creep.memory.other.stationary = undefined;
                    this.withdraw();
            }
        } else if (this.creep.memory.energyDestination) {
            this.creep.memory.other.stationary = undefined;
            this.creep.withdrawResource();
        } else if (this.container && this.container.store[RESOURCE_ENERGY]) {
            this.creep.memory.other.stationary = undefined;
            this.creep.withdrawResource(this.container);
        } else if (!this.creep.locateEnergy()) {
            this.creep.memory.other.stationary = undefined;
            this.creep.idleFor(15);
        }
    }

    withdraw() {
        // Handle resource withdraw
        const nearbyUpgrader = this.creep.pos.lookForNearby(LOOK_CREEPS, true, 1).find(c => c && c.memory && c.id !== this.creep.id && c.memory.role === 'upgrader' && c.store[RESOURCE_ENERGY]);
        if (this.link && this.creep.pos.isNearTo(this.link) && this.link.store[RESOURCE_ENERGY]) {
            this.creep.withdrawResource(this.link);
        } else if (this.container && this.creep.pos.isNearTo(this.container) && this.container.store[RESOURCE_ENERGY]) {
            this.creep.withdrawResource(this.container);
        } else if (nearbyUpgrader && nearbyUpgrader.store[RESOURCE_ENERGY]) {
            this.creep.withdrawResource(nearbyUpgrader);
        }
    }
}

profiler.registerClass(RoleUpgrader, 'Upgrader');
module.exports = RoleUpgrader;
