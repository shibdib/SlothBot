/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const {towerFillFloor, closestTowerUnder, lowestTowerUnder, TOWER_FILL_URGENT} = require('spawnFlow');

class RoleShuttle {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        this.housekeeping();
        if (this.creep.store[RESOURCE_ENERGY]) {
            this.hauling();
        } else {
            this.pickup();
        }
    }

    housekeeping() {
        this.creep.say(ICONS.haul, true);
        if (Game.time % 5 === 0) this.creep.opportunisticFill();
    }

    hauling() {
        // If we're somehow outside of the colony room, path back in
        if (this.room.name !== this.creep.memory.colony) {
            return this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.colony), {range: 23});
        }

        // Half-empty (or any gap while under attack) beats the controller pad.
        if (this.deliverTower(this.roomUnderTowerThreat() ? towerFillFloor(this.room) : TOWER_FILL_URGENT)) return;

        // Pre-RCL8: empty storage is energyState 0 (below the stockpile target),
        // not famine. Keep feeding the upgrader or the controller stalls.
        const rcl = (this.room.controller && this.room.controller.level) || this.room.level || 0;
        if (this.room.storage && (rcl < 8 || this.room.energyState)) {
            const controllerContainer = Game.getObjectById(this.room.memory.controllerContainer)
                || (global.resolveControllerContainer && global.resolveControllerContainer(this.room));
            if (controllerContainer && controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) > CONTAINER_CAPACITY * 0.5) {
                const result = this.creep.transfer(controllerContainer, RESOURCE_ENERGY);
                if (result === OK || result === ERR_NOT_IN_RANGE) {
                    if (result === ERR_NOT_IN_RANGE) this.creep.shibMove(controllerContainer);
                    return;
                }
            }
        }

        // Near-full towers still beat a storage dump.
        if (!this.roomUnderTowerThreat() && this.deliverTower(towerFillFloor(this.room))) return;

        // Otherwise use the storage
        const protoStorage = this.creep.room.memory.protoStorage ? Game.getObjectById(this.creep.room.memory.protoStorage) : undefined;
        if (this.creep.room.storage || protoStorage) {
            const storeTarget = this.creep.room.storage || protoStorage;
            for (const resourceType in this.creep.store) {
                const result = this.creep.transfer(storeTarget, resourceType);
                if (result === OK) {
                    break;
                } else if (result === ERR_NOT_IN_RANGE) {
                    this.creep.shibMove(storeTarget);
                    break;
                }
            }
        } else {
            if (!this.creep.haulerDelivery()) {
                this.creep.idleFor(this.creep.room.level);
            }
        }
    }

    resolveAssignedContainer() {
        if (!this.creep.memory.assignment) return undefined;
        const source = Game.getObjectById(this.creep.memory.assignment);
        if (!source) return undefined;
        if (source.memory.container) return Game.getObjectById(source.memory.container);
        return global.resolveSourceContainer(source, this.room);
    }

    findContainerOverflowDrop(container) {
        if (!container) return undefined;
        let best;
        const track = (resource) => {
            if (!resource || resource.resourceType !== RESOURCE_ENERGY || resource.amount <= 0) return;
            if (!best || resource.amount > best.amount) best = resource;
        };

        for (const resource of container.pos.lookFor(LOOK_RESOURCES)) track(resource);

        if (!container.store.getFreeCapacity(RESOURCE_ENERGY)) {
            for (const resource of this.room.droppedEnergy) {
                if (resource.pos.getRangeTo(container.pos) <= 1) track(resource);
            }
        }

        return best;
    }

    roomUnderTowerThreat() {
        if (this.room.memory && this.room.memory.dangerousAttack) return true;
        return !!(typeof INTEL !== 'undefined' && INTEL[this.room.name] && INTEL[this.room.name].threatLevel);
    }

    deliverTower(floor) {
        if (!(this.creep.store[RESOURCE_ENERGY] > 0) || !this.room.controller || !this.room.controller.my) return false;
        const tower = closestTowerUnder(this.creep.pos, this.room, floor);
        if (!tower) return false;
        const result = this.creep.transfer(tower, RESOURCE_ENERGY);
        if (result === ERR_NOT_IN_RANGE) this.creep.shibMove(tower);
        return result === OK || result === ERR_NOT_IN_RANGE;
    }

    pickup() {
        if (this.creep.memory.energyDestination) {
            return this.creep.withdrawResource();
        }

        // Attack, or a tower under half: pull storage instead of waiting on the source pad.
        if (shuttleShouldRefillTowers(this.room)) {
            const result = this.creep.withdraw(this.room.storage, RESOURCE_ENERGY);
            if (result === ERR_NOT_IN_RANGE) this.creep.shibMove(this.room.storage);
            return;
        }

        const container = this.resolveAssignedContainer();
        const overflow = this.findContainerOverflowDrop(container);
        if (overflow) {
            this.creep.memory.energyDestination = overflow.id;
            this.creep.withdrawResource();
            return;
        }

        if (container && container.store[RESOURCE_ENERGY] > 0) {
            this.creep.memory.energyDestination = container.id;
            this.creep.withdrawResource();
            return;
        }
        if (this.creep.locateEnergy()) {
            this.creep.withdrawResource();
        } else {
            this.creep.idleFor(this.creep.room.level);
        }
    }
}

function shuttleShouldRefillTowers(room) {
    if (!room || !room.storage || !(room.storage.store[RESOURCE_ENERGY] > 0)) return false;
    const attack = (room.memory && room.memory.dangerousAttack)
        || (typeof INTEL !== 'undefined' && INTEL[room.name] && INTEL[room.name].threatLevel);
    const floor = attack ? towerFillFloor(room) : TOWER_FILL_URGENT;
    return !!lowestTowerUnder(room, floor);
}

profiler.registerClass(RoleShuttle, 'Shuttle');
module.exports = RoleShuttle;