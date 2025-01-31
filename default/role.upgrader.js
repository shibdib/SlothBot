/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("./tools.profiler");

class RoleUpgrader {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.container = Game.getObjectById(this.room.memory.controllerContainer);
        if (!this.container) this.room.memory.controllerContainer = undefined;
        this.link = Game.getObjectById(this.room.memory.controllerLink);
        if (!this.link) this.room.memory.controllerLink = undefined;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        if (this.creep.memory.other.stationary ||
            (_.filter(this.creep.body, (p) => p.type !== MOVE && p.type !== CARRY).length > _.filter(this.creep.body, (p) => p.type === MOVE).length)) {
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
        this.creep.memory.other.stationary = true;
        // Handle getting in place
        if (!this.creep.memory.inPosition && this.container) {
            if (this.container.pos.checkForCreep() && this.creep.pos.isNearTo(this.container)) this.creep.memory.inPosition = true;
            else return this.creep.shibMove(this.container, {range: 0});
        }
        switch (this.creep.upgradeController(Game.rooms[this.creep.memory.overlord].controller)) {
            case OK:
                // Handle resource withdraw
                this.withdraw();
                return;
            case ERR_NOT_IN_RANGE:
                return this.creep.shibMove(Game.rooms[this.creep.memory.overlord].controller, {range: 3});
            case ERR_NOT_ENOUGH_RESOURCES:
                // Handle resource withdraw
                this.withdraw();
        }
    }

    mobileUpgrading() {
        if (this.creep.isFull) this.creep.memory.working = true;
        if (!this.creep.store[RESOURCE_ENERGY]) delete this.creep.memory.working;
        if (this.creep.memory.working) {
            switch (this.creep.upgradeController(Game.rooms[this.creep.memory.overlord].controller)) {
                case OK:
                    this.creep.memory.other.stationary = true;
                    return;
                case ERR_NOT_IN_RANGE:
                    this.creep.shibMove(this.room.controller, {range: 3});
                    return;
                case ERR_NOT_ENOUGH_RESOURCES:
                    // Handle resource withdraw
                    this.withdraw();
            }
        } else if (this.creep.memory.energyDestination) {
            this.creep.memory.other.stationary = undefined;
            this.creep.withdrawResource();
        } else if (this.container && this.container.store[RESOURCE_ENERGY]) {
            this.creep.withdrawResource(this.container);
        } else if (!this.creep.locateEnergy()) {
            this.creep.idleFor(15);
        }
    }

    withdraw() {
        // Handle resource withdraw
        if (this.link && this.link.store[RESOURCE_ENERGY]) {
            this.creep.withdrawResource(this.link);
        } else if (this.container && this.container.store[RESOURCE_ENERGY]) {
            this.creep.withdrawResource(this.container);
        }
    }
}

profiler.registerClass(RoleUpgrader, 'Upgrader');
module.exports = RoleUpgrader;
