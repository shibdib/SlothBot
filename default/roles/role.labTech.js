/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleLabTech {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        // 1. Cleanup Inventory - If we are carrying anything, we must have a destination
        if (this.creep.store.getUsedCapacity() > 0) {
            return this.executeDelivery();
        }

        // 2. Clear invalid tasks
        if (this.creep.memory.task) {
            const task = this.creep.memory.task;
            const withdrawTarget = Game.getObjectById(task.withdrawTarget);
            if (!withdrawTarget || !withdrawTarget.store || withdrawTarget.store[task.resource] <= 0) {
                this.creep.memory.task = undefined;
            }
        }

        // 3. Find a new task if idle
        if (!this.creep.memory.task) {
            this.creep.memory.task = this.findTask();
        }

        // 4. Execute current task
        if (this.creep.memory.task) {
            return this.executeTask();
        }

        // 5. If truly idle
        this.creep.idleFor(10);
    }

    // Task prioritizer - Returns {withdrawTarget, deliveryTarget, resource, amount}
    findTask() {
        const labs = this.room.labs;
        const factory = this.room.factory;
        const storage = this.room.storage;
        const terminal = this.room.terminal;
        const powerSpawn = this.room.powerSpawn;
        const nuker = this.room.nuker;
        const storeTarget = (storage && storage.store.getFreeCapacity() > 0) ? storage : terminal;

        // -- PRIORITY 0: COMBAT - Fill towers during attacks before anything else --
        if (this.room.memory.dangerousAttack) {
            const supplier = storage || terminal;
            if (supplier && supplier.store[RESOURCE_ENERGY] > 0) {
                const lowTower = this.room.towers.find(s => s.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
                if (lowTower) return {
                    withdrawTarget: supplier.id,
                    deliveryTarget: lowTower.id,
                    resource: RESOURCE_ENERGY,
                    amount: lowTower.store.getFreeCapacity(RESOURCE_ENERGY)
                };
            }
        }

        // -- PRIORITY 1: PRODUCTION CLOGS (Emptying Labs/Factory) --
        for (const lab of labs) {
            if (lab.mineralType) {
                // If it has something it shouldn't
                if ((lab.memory.itemNeeded && lab.mineralType !== lab.memory.itemNeeded) ||
                    (lab.memory.neededBoost && lab.mineralType !== lab.memory.neededBoost) ||
                    (!lab.memory.itemNeeded && !lab.memory.neededBoost && (lab.mineralType !== this.room.memory.producingBoost || lab.store[lab.mineralType] > 500))) {
                    return {
                        withdrawTarget: lab.id,
                        deliveryTarget: storeTarget.id,
                        resource: lab.mineralType
                    };
                }
            }
        }
        if (factory && factory.store.getUsedCapacity() > 0) {
            for (const res in factory.store) {
                if (factory.memory.producing && COMMODITIES[factory.memory.producing] && COMMODITIES[factory.memory.producing].components[res]) continue;
                if (factory.memory.producing === res && factory.store[res] < 5000) continue;
                return {withdrawTarget: factory.id, deliveryTarget: (terminal || storage).id, resource: res};
            }
        }

        // -- PRIORITY 7: CLEANUP (dropped resources, tombstones) --
        const drop = this.room.droppedResources.find(r => r.resourceType !== RESOURCE_ENERGY) || this.room.tombstones.find(t => t.store.getUsedCapacity() > 0);
        if (drop) {
            const res = drop.resourceType || Object.keys(drop.store).find(r => drop.store[r] > 0);
            return {withdrawTarget: drop.id, deliveryTarget: storeTarget.id, resource: res};
        }

        // -- PRIORITY 2: SUPPLY FACTORY (load production inputs) --
        if (factory && factory.memory.producing) {
            const commodity = COMMODITIES[factory.memory.producing];
            if (commodity) {
                for (const [component, required] of Object.entries(commodity.components)) {
                    const inFactory = factory.store[component] || 0;
                    const target = required * 10; // keep ~10 runs worth in the factory
                    if (inFactory >= target) continue;
                    const supplier = [storage, terminal].find(s => s && s.store[component] > 0);
                    if (supplier) return {
                        withdrawTarget: supplier.id,
                        deliveryTarget: factory.id,
                        resource: component,
                        amount: Math.min(target - inFactory, factory.store.getFreeCapacity())
                    };
                }
            }
        }

        // -- PRIORITY 3: SUPPLY MINERALS (Filling Labs with minerals/boosts only) --
        const boostNeededLab = labs.find(s => s.memory.neededBoost && s.store.getFreeCapacity(s.memory.neededBoost) > 0 && s.store[s.memory.neededBoost] < s.memory.amount);
        if (boostNeededLab) {
            const boostNeeded = boostNeededLab.memory.neededBoost;
            // Skip labs that are themselves collecting this boost — otherwise we'd churn between them.
            const labSources = labs.filter(s => s.id !== boostNeededLab.id && s.memory.neededBoost !== boostNeeded && s.memory.itemNeeded !== boostNeeded);
            const supplier = [storage, terminal, ...labSources, ...this.room.containers].find(s => s && s.store && s.store.getUsedCapacity(boostNeeded) > 0);
            if (supplier) return {
                withdrawTarget: supplier.id,
                deliveryTarget: boostNeededLab.id,
                resource: boostNeeded,
                amount: boostNeededLab.memory.amount - boostNeededLab.store.getUsedCapacity(boostNeeded)
            };
        }
        // Find the lab with the lowest store of itemNeeded
        const resourceNeededLabs = labs.filter(s => s.memory.itemNeeded && s.store.getUsedCapacity(s.memory.itemNeeded) < 1000 && s.room.store(s.memory.itemNeeded, true));
        const resourceNeededLab = _.min(resourceNeededLabs, s => s.store.getUsedCapacity(s.memory.itemNeeded))
        if (resourceNeededLab && resourceNeededLab.id) {
            const resourceNeeded = resourceNeededLab.memory.itemNeeded;
            const labSources = labs.filter(s => s.id !== resourceNeededLab.id && s.memory.neededBoost !== resourceNeeded && s.memory.itemNeeded !== resourceNeeded);
            const supplier = [storage, terminal, ...labSources, ...this.room.containers].find(s => s && s.store && s.store.getUsedCapacity(resourceNeeded) > 0);
            if (supplier) return {
                withdrawTarget: supplier.id,
                deliveryTarget: resourceNeededLab.id,
                resource: resourceNeeded,
                amount: resourceNeededLab.store.getCapacity(resourceNeeded) - resourceNeededLab.store.getUsedCapacity(resourceNeeded)
            };
        }

        // -- PRIORITY 3: MINERAL CONTAINER CLEANUP --
        const resourceContainer = this.room.containers.find(s => s.store.getUsedCapacity() > s.store.getUsedCapacity(RESOURCE_ENERGY));
        if (resourceContainer) {
            const res = Object.keys(resourceContainer.store).find(r => r !== RESOURCE_ENERGY && resourceContainer.store[r] > 0);
            if (res) return {withdrawTarget: resourceContainer.id, deliveryTarget: storeTarget.id, resource: res};
        }

        // -- PRIORITY 4: LOGISTICS (Power/Nuke) --
        if (powerSpawn && this.room.energyState) {
            if (powerSpawn.store.getFreeCapacity(RESOURCE_ENERGY) > 1000 && storage && storage.store[RESOURCE_ENERGY] > 10000) {
                return {withdrawTarget: storage.id, deliveryTarget: powerSpawn.id, resource: RESOURCE_ENERGY};
            }
            if (powerSpawn.store.getFreeCapacity(RESOURCE_POWER) > 50 && storage && storage.store[RESOURCE_POWER] > 0) {
                return {withdrawTarget: storage.id, deliveryTarget: powerSpawn.id, resource: RESOURCE_POWER};
            }
        }
        if (nuker && storage && storage.store[RESOURCE_GHODIUM] > 0 && nuker.store.getFreeCapacity(RESOURCE_GHODIUM) > 0) {
            return {withdrawTarget: storage.id, deliveryTarget: nuker.id, resource: RESOURCE_GHODIUM};
        }

        // -- PRIORITY 5: BALANCING STORAGE & TERMINAL --
        const balancingTask = this.findBalancingTask(storage, terminal);
        if (balancingTask) return balancingTask;

        // -- PRIORITY 6: LAB ENERGY REFILL --
        // Labs hold 2000 energy (5 per reaction = 400 reactions of headroom).
        // Only refill when nearly depleted so energy hauling doesn't crowd out everything else.
        for (const lab of labs) {
            if (!lab.memory.itemNeeded && lab.store[RESOURCE_ENERGY] < 400 && storage && storage.store[RESOURCE_ENERGY] > 5000) {
                return {withdrawTarget: storage.id, deliveryTarget: lab.id, resource: RESOURCE_ENERGY};
            }
        }

        return null;
    }

    findBalancingTask(storage, terminal) {
        if (!storage || !terminal) return null;

        const terminalFree = terminal.store.getFreeCapacity();
        const storageFree = storage.store.getFreeCapacity();
        const myOrders = Game.market.orders;

        // -- STORAGE -> TERMINAL (terminal is primary holder of distributable resources) --
        if (terminalFree > 5000) {
            // Ensure energy buffer for sending
            if (terminal.store[RESOURCE_ENERGY] < TERMINAL_ENERGY_BUFFER && storage.store[RESOURCE_ENERGY] > TERMINAL_ENERGY_BUFFER * 2) {
                return {
                    withdrawTarget: storage.id,
                    deliveryTarget: terminal.id,
                    resource: RESOURCE_ENERGY,
                    amount: TERMINAL_ENERGY_BUFFER - terminal.store[RESOURCE_ENERGY]
                };
            }

            // Sell orders: ensure terminal has what's needed
            for (const id in myOrders) {
                const order = myOrders[id];
                if (order.roomName !== this.room.name || order.type !== ORDER_SELL) continue;
                const res = order.resourceType;
                const amountNeeded = Math.min(order.remainingAmount, 10000) - (terminal.store[res] || 0);
                if (amountNeeded > 500 && storage.store[res] > 0) {
                    return {
                        withdrawTarget: storage.id,
                        deliveryTarget: terminal.id,
                        resource: res,
                        amount: Math.min(amountNeeded, storage.store[res], terminalFree)
                    };
                }
            }

            // Fill terminal from storage — terminal holds distributable resources first
            // base minerals target 2000 for inter-room distribution; everything else 1000
            for (const res of Object.keys(storage.store)) {
                if (res === RESOURCE_ENERGY) continue;
                const terminalHas = terminal.store[res] || 0;
                const target = BASE_MINERALS.includes(res) ? 2000 : 1000;
                if (terminalHas < target && storage.store[res] > 0) {
                    return {
                        withdrawTarget: storage.id,
                        deliveryTarget: terminal.id,
                        resource: res,
                        amount: Math.min(target - terminalHas, storage.store[res], terminalFree)
                    };
                }
            }
        }

        return null;
    }

    executeTask() {
        const task = this.creep.memory.task;
        const withdrawTarget = Game.getObjectById(task.withdrawTarget);
        const deliveryTarget = Game.getObjectById(task.deliveryTarget);

        if (!withdrawTarget || !deliveryTarget) {
            this.creep.memory.task = undefined;
            return false;
        }

        this.creep.say(task.resource.slice(0, 3));

        if (this.creep.pos.isNearTo(withdrawTarget)) {
            const amount = Math.min(task.amount || 999, this.creep.store.getFreeCapacity(), withdrawTarget.store ? withdrawTarget.store[task.resource] : 999);
            const result = withdrawTarget instanceof Resource ? this.creep.pickup(withdrawTarget) : this.creep.withdraw(withdrawTarget, task.resource, amount);
            if (result === OK) {
                // Same-tick move towards delivery if possible
                this.creep.shibMove(deliveryTarget);
            }
        } else {
            this.creep.shibMove(withdrawTarget);
        }
        return true;
    }

    executeDelivery() {
        const task = this.creep.memory.task;
        // Prefer delivering what the current task asked for; fall back to whatever we're carrying
        const resource = (task && this.creep.store[task.resource] > 0)
            ? task.resource
            : Object.keys(this.creep.store)[0];
        let deliveryTarget;

        if (task) {
            deliveryTarget = Game.getObjectById(task.deliveryTarget);
        }

        if (!deliveryTarget || (deliveryTarget.store && deliveryTarget.store.getFreeCapacity(resource) <= 0)) {
            deliveryTarget = this.room.labs.find(s => s.memory.neededBoost === resource && s.store.getUsedCapacity(resource) < s.memory.amount) || [this.room.storage, this.room.terminal].find(s => s && s.store.getFreeCapacity() > 0) || this.room.storage || this.room.terminal;
        }

        if (!deliveryTarget) {
            this.creep.drop(resource);
            return true;
        }

        if (this.creep.pos.isNearTo(deliveryTarget)) {
            if (this.creep.transfer(deliveryTarget, resource) === OK) {
                this.creep.memory.task = undefined;
            }
        } else {
            this.creep.shibMove(deliveryTarget);
        }
        return true;
    }
}

profiler.registerClass(RoleLabTech, 'LabTech');
module.exports = RoleLabTech;
