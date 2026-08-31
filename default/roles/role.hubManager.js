/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * 0-MOVE bunker-center balancer. Spawns onto hub (0,0) and never walks.
 * Owns hub-link drain, adjacent spawns, storage↔terminal warehouse
 * (energy + minerals), and surplus nuker / power-spawn energy.
 */

const profiler = require('tools.profiler');
const {roomCanBurnSurplus} = require('spawnFlow');
const RoleLabTech = require('role.labTech');

class RoleHubManager {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (!this.creep.memory.other) this.creep.memory.other = {};
        this.creep.memory.other.stationary = true;
        this.creep.say(ICONS.haul, true);
        if (this.creep.store.getUsedCapacity() > 0) this.deliverCargo();
        else this.pickup();
    }

    spawnNeed() {
        return this.creep.pos.findInRange(FIND_MY_STRUCTURES, 1, {
            filter: s => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION)
                && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
    }

    surplusSink() {
        if (!roomCanBurnSurplus(this.room)) return null;
        const powerSpawn = this.room.powerSpawn;
        if (powerSpawn && this.creep.pos.isNearTo(powerSpawn)
            && powerSpawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            return powerSpawn;
        }
        const nuker = this.room.nuker;
        if (nuker && this.creep.pos.isNearTo(nuker)) {
            const need = nuker.store.getFreeCapacity(RESOURCE_ENERGY);
            if (need > 0 && this.room.rawEnergy >= need + 10000) return nuker;
        }
        return null;
    }

    warehouseTask() {
        const storage = this.room.storage;
        const terminal = this.room.terminal;
        if (!storage || !terminal) return null;
        const carry = this.creep.store.getCapacity() || 0;
        const proxy = Object.create(RoleLabTech.prototype);
        proxy.room = this.room;
        proxy.creep = {store: {getCapacity: () => carry}};
        const task = proxy.findBalancingTask(storage, terminal);
        if (!task) return null;
        task.amount = Math.min(task.amount || carry, carry);
        return task;
    }

    deliverCargo() {
        const task = this.creep.memory.warehouse;
        if (task && (this.creep.store[task.resource] || 0) > 0) {
            const dest = Game.getObjectById(task.deliveryTarget);
            if (dest && dest.store.getFreeCapacity(task.resource) > 0) {
                if (this.creep.transfer(dest, task.resource) === OK) {
                    this.creep.memory.warehouse = task.swapReverse || undefined;
                }
                return;
            }
            this.creep.memory.warehouse = undefined;
        }

        const mineral = Object.keys(this.creep.store).find(r => r !== RESOURCE_ENERGY && this.creep.store[r] > 0);
        if (mineral) {
            const storage = this.room.storage;
            const terminal = this.room.terminal;
            if (storage && storage.store.getFreeCapacity(mineral) > 0) {
                this.creep.transfer(storage, mineral);
                return;
            }
            if (terminal && terminal.store.getFreeCapacity(mineral) > 0) {
                this.creep.transfer(terminal, mineral);
            }
            return;
        }

        this.deliverEnergy();
    }

    deliverEnergy() {
        const spawnNeed = this.spawnNeed();
        if (spawnNeed.length) {
            this.creep.transfer(spawnNeed[0], RESOURCE_ENERGY);
            return;
        }

        const sink = this.surplusSink();
        if (sink) {
            this.creep.transfer(sink, RESOURCE_ENERGY);
            return;
        }

        const terminal = this.room.terminal;
        const storage = this.room.storage;
        const termE = terminal ? (terminal.store[RESOURCE_ENERGY] || 0) : 0;
        const termFree = terminal ? terminal.store.getFreeCapacity(RESOURCE_ENERGY) : 0;
        const termTarget = terminalEnergyTarget();
        if (terminal && termE < termTarget && termFree > 0) {
            this.creep.transfer(terminal, RESOURCE_ENERGY);
            return;
        }
        if (storage && storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            this.creep.transfer(storage, RESOURCE_ENERGY);
            return;
        }
        if (terminal && termFree > 0) this.creep.transfer(terminal, RESOURCE_ENERGY);
    }

    pickup() {
        const hubLink = Game.getObjectById(this.room.memory.hubLink);
        if (hubLink && (hubLink.store[RESOURCE_ENERGY] || 0) > 0) {
            this.creep.memory.warehouse = undefined;
            this.creep.withdraw(hubLink, RESOURCE_ENERGY);
            return;
        }

        const storage = this.room.storage;
        const terminal = this.room.terminal;
        const storageE = storage ? (storage.store[RESOURCE_ENERGY] || 0) : 0;
        const termE = terminal ? (terminal.store[RESOURCE_ENERGY] || 0) : 0;
        const pullEnergy = () => {
            if (storageE > 0) {
                this.creep.withdraw(storage, RESOURCE_ENERGY);
                return true;
            }
            if (terminal && termE > TERMINAL_ENERGY_BUFFER) {
                this.creep.withdraw(terminal, RESOURCE_ENERGY);
                return true;
            }
            return false;
        };

        if (this.spawnNeed().length && pullEnergy()) {
            this.creep.memory.warehouse = undefined;
            return;
        }

        let task = this.creep.memory.warehouse;
        if (task) {
            const src = Game.getObjectById(task.withdrawTarget);
            if (!src || !(src.store[task.resource] > 0)) {
                this.creep.memory.warehouse = undefined;
                task = null;
            }
        }
        if (!task) {
            task = this.warehouseTask();
            if (task) this.creep.memory.warehouse = task;
        }
        if (task) {
            const src = Game.getObjectById(task.withdrawTarget);
            if (src && src.store[task.resource] > 0) {
                this.creep.withdraw(src, task.resource, Math.min(task.amount, src.store[task.resource],
                    this.creep.store.getFreeCapacity()));
                return;
            }
            this.creep.memory.warehouse = undefined;
        }

        if (this.surplusSink() && pullEnergy()) return;
        this.creep.idleFor(3);
    }
}

profiler.registerClass(RoleHubManager, 'HubManager');
module.exports = RoleHubManager;
