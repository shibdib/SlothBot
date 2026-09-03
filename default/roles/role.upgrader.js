/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");


function resolveControllerLink(room) {
    const obj = Game.getObjectById(room.memory.controllerLink);
    if (obj && obj.structureType === STRUCTURE_LINK && obj.store) return obj;
    return null;
}

class RoleUpgrader {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.container = global.resolveControllerContainer(this.room);
        this.link = resolveControllerLink(this.room);
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        const canStation = !!(this.link || this.container);
        if (canStation && (this.creep.memory.other.noMove || !this.creep.hasActiveBodyparts(MOVE))) {
            this.stationaryUpgrading();
        } else if (!canStation && !this.creep.hasActiveBodyparts(MOVE)) {
            // 0-MOVE body spawned against a stale container/link. Recycle so
            // a mobile replacement can dump energy.
            this.creep.recycleCreep();
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
        if (!this.creep.memory.inPosition || Game.time % 100 === 0) {
            if (!this.link && this.container) {
                if (this.creep.pos.isEqualTo(this.container.pos) || this.creep.pos.isNearTo(this.container)) this.creep.memory.inPosition = true;
                else return this.creep.shibMove(this.container, {range: 0});
            } else if (this.link && !this.container) {
                const targetPos = this.findLinkUpgradePosition();
                if (targetPos && this.creep.pos.isEqualTo(targetPos)) this.creep.memory.inPosition = true;
                else if (targetPos) return this.creep.shibMove(targetPos, {range: 0});
                else if (this.creep.pos.isNearTo(this.link) && this.creep.pos.getRangeTo(this.room.controller) <= 3) this.creep.memory.inPosition = true;
                else return this.creep.shibMove(this.link, {range: 1});
            } else if (this.container && this.link) {
                if (this.creep.pos.isEqualTo(this.container.pos) || this.creep.pos.isNearTo(this.link)) this.creep.memory.inPosition = true;
                else if (!this.container.pos.checkForCreep()) return this.creep.shibMove(this.container, {range: 0});
                else return this.creep.shibMove([this.container, this.link], {range: 1});
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
        } else if (this.container && this.container.store && this.container.store[RESOURCE_ENERGY] > 0) {
            this.creep.memory.other.stationary = undefined;
            this.creep.withdrawResource(this.container);
        } else {
            this.creep.memory.other.stationary = undefined;
            this.creep.idleFor(5);
        }
    }

    findLinkUpgradePosition() {
        const cached = this.creep.memory.linkUpgradePos;
        if (cached) {
            const pos = new RoomPosition(cached.x, cached.y, cached.roomName);
            if (pos.isNearTo(this.link) && pos.getRangeTo(this.room.controller) <= 3) return pos;
            this.creep.memory.linkUpgradePos = undefined;
        }
        const taken = {};
        for (const c of this.room.myCreeps) {
            if (c.id !== this.creep.id && c.memory.role === 'upgrader' && c.memory.linkUpgradePos) {
                const p = c.memory.linkUpgradePos;
                taken[`${p.x}_${p.y}`] = true;
            }
        }
        let fallback;
        for (let xOff = -1; xOff <= 1; xOff++) {
            for (let yOff = -1; yOff <= 1; yOff++) {
                if (xOff === 0 && yOff === 0) continue;
                const x = this.link.pos.x + xOff;
                const y = this.link.pos.y + yOff;
                if (x < 1 || x > 48 || y < 1 || y > 48) continue;
                const pos = new RoomPosition(x, y, this.link.pos.roomName);
                if (pos.checkForWall() || pos.checkForObstacleStructure()) continue;
                if (pos.getRangeTo(this.room.controller) > 3) continue;
                if (taken[`${x}_${y}`]) {
                    if (!fallback) fallback = pos;
                    continue;
                }
                this.creep.memory.linkUpgradePos = {x: pos.x, y: pos.y, roomName: pos.roomName};
                return pos;
            }
        }
        return fallback;
    }

    withdraw() {
        if (this.link && this.link.store && this.creep.pos.isNearTo(this.link) && this.link.store[RESOURCE_ENERGY] > 0) {
            return this.creep.withdraw(this.link, RESOURCE_ENERGY);
        } else if (this.container && this.container.store && this.creep.pos.isNearTo(this.container) && this.container.store[RESOURCE_ENERGY] > 0) {
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