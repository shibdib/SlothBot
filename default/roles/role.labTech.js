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
        const labs = this.room.structures.filter(s => s.structureType === STRUCTURE_LAB);
        const factory = this.room.factory;
        const storage = this.room.storage;
        const terminal = this.room.terminal;
        const powerSpawn = this.room.structures.find(s => s.structureType === STRUCTURE_POWER_SPAWN);
        const nuker = this.room.structures.find(s => s.structureType === STRUCTURE_NUKER);

        // -- PRIORITY 1: PRODUCTION CLOGS (Emptying Labs/Factory) --
        for (const lab of labs) {
            if (lab.mineralType) {
                // If it has something it shouldn't
                if ((lab.memory.itemNeeded && lab.mineralType !== lab.memory.itemNeeded) ||
                    (lab.memory.neededBoost && lab.mineralType !== lab.memory.neededBoost) ||
                    (!lab.memory.itemNeeded && !lab.memory.neededBoost && (lab.mineralType !== this.room.memory.producingBoost || lab.store[lab.mineralType] > 500))) {
                    return {
                        withdrawTarget: lab.id,
                        deliveryTarget: (storage || terminal).id,
                        resource: lab.mineralType
                    };
                }
            }
        }
        if (factory && factory.store.getUsedCapacity() > 0) {
            for (const res in factory.store) {
                if (factory.memory.producing && COMMODITIES[factory.memory.producing].components[res]) continue;
                if (factory.memory.producing === res && factory.store[res] < 5000) continue;
                return {withdrawTarget: factory.id, deliveryTarget: (terminal || storage).id, resource: res};
            }
        }

        // -- PRIORITY 2: SUPPLY PRODUCTION (Filling Labs/Factory) --
        for (const lab of labs) {
            if (lab.memory.itemNeeded && lab.store.getUsedCapacity(lab.memory.itemNeeded) < 1000) {
                const res = lab.memory.itemNeeded;
                const supplier = [storage, terminal].find(s => s && s.store[res] > 0);
                if (supplier) return {
                    withdrawTarget: supplier.id,
                    deliveryTarget: lab.id,
                    resource: res,
                    amount: 1000 - lab.store.getUsedCapacity(res)
                };
            }
            if (lab.memory.neededBoost && lab.store.getUsedCapacity(lab.memory.neededBoost) < lab.memory.amount) {
                const res = lab.memory.neededBoost;
                const supplier = [storage, terminal].find(s => s && s.store[res] > 0);
                if (supplier) return {
                    withdrawTarget: supplier.id,
                    deliveryTarget: lab.id,
                    resource: res,
                    amount: lab.memory.amount - lab.store.getUsedCapacity(res)
                };
            }
            if (lab.store.getFreeCapacity(RESOURCE_ENERGY) > 500 && (storage && storage.store[RESOURCE_ENERGY] > 5000)) {
                return {withdrawTarget: storage.id, deliveryTarget: lab.id, resource: RESOURCE_ENERGY};
            }
        }

        // -- PRIORITY 3: LOGISTICS (Power/Nuke/Minerals) --
        if (powerSpawn && this.room.energyState) {
            if (powerSpawn.store.getFreeCapacity(RESOURCE_ENERGY) > 1000 && storage && storage.store[RESOURCE_ENERGY] > 10000) {
                return {withdrawTarget: storage.id, deliveryTarget: powerSpawn.id, resource: RESOURCE_ENERGY};
            }
            if (powerSpawn.store.getFreeCapacity(RESOURCE_POWER) > 50 && (storage && storage.store[RESOURCE_POWER] > 0)) {
                return {withdrawTarget: storage.id, deliveryTarget: powerSpawn.id, resource: RESOURCE_POWER};
            }
        }
        if (nuker && storage && storage.store[RESOURCE_GHODIUM] > 0 && nuker.store.getFreeCapacity(RESOURCE_GHODIUM) > 0) {
            return {withdrawTarget: storage.id, deliveryTarget: nuker.id, resource: RESOURCE_GHODIUM};
        }

        // -- PRIORITY 4: BALANCING STORAGE & TERMINAL --
        const balancingTask = this.findBalancingTask(storage, terminal);
        if (balancingTask) return balancingTask;

        // -- PRIORITY 5: CLEANUP --
        const container = this.room.structures.find(s => s.structureType === STRUCTURE_CONTAINER && s.store.getUsedCapacity() > s.store[RESOURCE_ENERGY]);
        if (container) {
            const res = Object.keys(container.store).find(r => r !== RESOURCE_ENERGY);
            return {withdrawTarget: container.id, deliveryTarget: (storage || terminal).id, resource: res};
        }

        const drop = this.room.droppedResources.find(r => r.resourceType !== RESOURCE_ENERGY) || this.room.tombstones.find(t => t.store.getUsedCapacity() > 0);
        if (drop) {
            const res = drop.resourceType || Object.keys(drop.store).find(r => drop.store[r] > 0);
            return {withdrawTarget: drop.id, deliveryTarget: (storage || terminal).id, resource: res};
        }

        return null;
    }

    findBalancingTask(storage, terminal) {
        if (!storage || !terminal) return null;

        // -- STORAGE -> TERMINAL --
        if (terminal.store.getFreeCapacity() > 5000) {
            // Energy
            if (terminal.store[RESOURCE_ENERGY] < TERMINAL_ENERGY_BUFFER && storage.store[RESOURCE_ENERGY] > TERMINAL_ENERGY_BUFFER * 2) {
                return {
                    withdrawTarget: storage.id,
                    deliveryTarget: terminal.id,
                    resource: RESOURCE_ENERGY,
                    amount: TERMINAL_ENERGY_BUFFER - terminal.store[RESOURCE_ENERGY]
                };
            }

            // Sell Orders
            const myOrders = Game.market.orders;
            for (const id in myOrders) {
                const order = myOrders[id];
                if (order.roomName === this.room.name && order.type === ORDER_SELL) {
                    const res = order.resourceType;
                    const amountNeeded = Math.min(order.remainingAmount, 10000) - terminal.store[res];
                    if (amountNeeded > 500 && storage.store[res] > 0) {
                        return {
                            withdrawTarget: storage.id,
                            deliveryTarget: terminal.id,
                            resource: res,
                            amount: Math.min(amountNeeded, storage.store[res])
                        };
                    }
                }
            }

            // Minerals for sharing (support other rooms)
            for (const res of BASE_MINERALS) {
                if (terminal.store[res] < 2000 && storage.store[res] > 5000) {
                    return {
                        withdrawTarget: storage.id,
                        deliveryTarget: terminal.id,
                        resource: res,
                        amount: 2000 - terminal.store[res]
                    };
                }
            }
        }

        // -- TERMINAL -> STORAGE --
        if (storage.store.getFreeCapacity() > 10000) {
            // Excess Energy
            if (terminal.store[RESOURCE_ENERGY] > TERMINAL_ENERGY_BUFFER * 2) {
                return {
                    withdrawTarget: terminal.id,
                    deliveryTarget: storage.id,
                    resource: RESOURCE_ENERGY,
                    amount: terminal.store[RESOURCE_ENERGY] - TERMINAL_ENERGY_BUFFER
                };
            }

            // Excess Minerals & Boosts
            for (const res of Object.keys(terminal.store)) {
                if (res === RESOURCE_ENERGY) continue;

                // If it's a boost and not for sale, move it to storage
                if (ALL_BOOSTS.includes(res)) {
                    const isForSale = _.some(Game.market.orders, o => o.roomName === this.room.name && o.type === ORDER_SELL && o.resourceType === res);
                    if (!isForSale && terminal.store[res] > 1000) {
                        return {withdrawTarget: terminal.id, deliveryTarget: storage.id, resource: res};
                    }
                    continue;
                }

                // If it's a base mineral and we have way too much in terminal
                if (BASE_MINERALS.includes(res) && terminal.store[res] > REACTION_AMOUNT * 1.5) {
                    return {
                        withdrawTarget: terminal.id,
                        deliveryTarget: storage.id,
                        resource: res,
                        amount: terminal.store[res] - REACTION_AMOUNT
                    };
                }

                // Commodities/Other
                if (!BASE_MINERALS.includes(res) && terminal.store[res] > 5000) {
                    const isForSale = _.some(Game.market.orders, o => o.roomName === this.room.name && o.type === ORDER_SELL && o.resourceType === res);
                    if (!isForSale) return {withdrawTarget: terminal.id, deliveryTarget: storage.id, resource: res};
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
        const resource = Object.keys(this.creep.store)[0];
        let deliveryTarget;

        if (this.creep.memory.task) {
            deliveryTarget = Game.getObjectById(this.creep.memory.task.deliveryTarget);
        }

        if (!deliveryTarget || (deliveryTarget.store && deliveryTarget.store.getFreeCapacity(resource) <= 0)) {
            deliveryTarget = this.room.storage || this.room.terminal;
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
