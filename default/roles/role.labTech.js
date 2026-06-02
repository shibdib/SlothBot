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
        // 1. Plan a task batch if we don't have one yet.
        if (!this.creep.memory.tasks) {
            const initial = this.findTask();
            if (!initial) {
                this.creep.idleFor(5);
                return;
            }
            this.creep.memory.tasks = this.batchTasks(initial);
        }

        // 2. Drop tasks whose source vanished (pre-pickup) or destination vanished.
        //    Picked-up tasks survive a missing source — the goods are already on us.
        this.creep.memory.tasks = this.creep.memory.tasks.filter(t => {
            if (!Game.getObjectById(t.deliveryTarget)) return false;
            if (t.pickedUp) return true;
            const wt = Game.getObjectById(t.withdrawTarget);
            return wt && (wt instanceof Resource || (wt.store && wt.store[t.resource] > 0));
        });
        if (!this.creep.memory.tasks.length) {
            this.creep.memory.tasks = undefined;
            return;
        }

        // 3. Pickup phase — any unpicked task while we still have free capacity.
        const pendingPickup = this.creep.memory.tasks.find(t => !t.pickedUp);
        if (pendingPickup && this.creep.store.getFreeCapacity() > 0) {
            return this.executePickup(pendingPickup);
        }

        // 4. Delivery phase — first picked-up task whose resource is on us.
        const pendingDelivery = this.creep.memory.tasks.find(t => t.pickedUp && this.creep.store[t.resource] > 0);
        if (pendingDelivery) {
            return this.executeDelivery(pendingDelivery);
        }

        // 5. Residual carry not tied to any active task — fall back.
        if (this.creep.store.getUsedCapacity() > 0) {
            return this.fallbackDelivery();
        }

        // 6. Batch complete.
        this.creep.memory.tasks = undefined;
        this.creep.idleFor(5);
    }

    // Task prioritizer - Returns {withdrawTarget, deliveryTarget, resource, amount}
    findTask() {
        const labs = this.room.labs;
        const factory = this.room.factory;
        const storage = this.room.storage;
        const terminal = this.room.terminal;
        const powerSpawn = this.room.powerSpawn;
        const nuker = this.room.nuker;
        // Prefer whichever of storage/terminal has free space; nullable when both
        // are full or missing. Every branch below that uses storeTarget.id must
        // guard for null — letting it through crashes the role mid-tick.
        let storeTarget = null;
        if (storage && storage.store.getFreeCapacity() > 0) storeTarget = storage;
        else if (terminal && terminal.store.getFreeCapacity() > 0) storeTarget = terminal;

        // -- PRIORITY 0: COMBAT - Fill towers during attacks before anything else --
        if (this.room.memory.dangerousAttack) {
            const supplier = storage || terminal;
            if (supplier && supplier.store[RESOURCE_ENERGY] > 0) {
                // Threshold of 500 (half a tower's worth of shots) avoids trivial
                // top-ups burning a whole haul on the last few units of energy.
                const lowTower = this.room.towers.find(s => s.store.getFreeCapacity(RESOURCE_ENERGY) >= 500);
                if (lowTower) return {
                    withdrawTarget: supplier.id,
                    deliveryTarget: lowTower.id,
                    resource: RESOURCE_ENERGY,
                    amount: lowTower.store.getFreeCapacity(RESOURCE_ENERGY)
                };
            }
        }

        // -- PRIORITY 1: MINERAL CONTAINER OVERFULL --
        if (storeTarget) {
            const resourceContainer = this.room.containers.find(s => s.store.getUsedCapacity() > s.store.getUsedCapacity(RESOURCE_ENERGY) && !s.store.getFreeCapacity());
            if (resourceContainer) {
                const res = Object.keys(resourceContainer.store).find(r => r !== RESOURCE_ENERGY && resourceContainer.store[r] > 0);
                if (res) return {withdrawTarget: resourceContainer.id, deliveryTarget: storeTarget.id, resource: res};
            }
        }

        // -- PRIORITY 1: PRODUCTION CLOGS (Emptying Labs/Factory) --
        // `amount` is included so batchTasks can size the rest of an empty
        // batch against remaining carry. Runtime executePickup re-clamps to
        // the lab's actual store, so a stale amount degrades to a partial
        // pickup rather than an error.
        if (storeTarget) {
            for (const lab of labs) {
                if (lab.mineralType) {
                    // If it has something it shouldn't
                    if ((lab.memory.itemNeeded && lab.mineralType !== lab.memory.itemNeeded) ||
                        (lab.memory.neededBoost && lab.mineralType !== lab.memory.neededBoost) ||
                        (!lab.memory.itemNeeded && !lab.memory.neededBoost && (lab.mineralType !== this.room.memory.producingBoost || lab.store[lab.mineralType] > 500))) {
                        return {
                            withdrawTarget: lab.id,
                            deliveryTarget: storeTarget.id,
                            resource: lab.mineralType,
                            amount: lab.store[lab.mineralType]
                        };
                    }
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

        // -- PRIORITY 7: CLEANUP (dropped resources, tombstones) --
        if (storeTarget) {
            const drop = this.room.droppedResources.find(r => r.resourceType !== RESOURCE_ENERGY) || this.room.tombstones.find(t => t.store.getUsedCapacity() > 0);
            if (drop) {
                const res = drop.resourceType || Object.keys(drop.store).find(r => drop.store[r] > 0);
                return {withdrawTarget: drop.id, deliveryTarget: storeTarget.id, resource: res};
            }
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

        // -- PRIORITY 3: MINERAL CONTAINER CLEANUP --
        if (storeTarget) {
            const resourceContainer = this.room.containers.find(s => s.store.getUsedCapacity() > s.store.getUsedCapacity(RESOURCE_ENERGY));
            if (resourceContainer) {
                const res = Object.keys(resourceContainer.store).find(r => r !== RESOURCE_ENERGY && resourceContainer.store[r] > 0);
                if (res) return {withdrawTarget: resourceContainer.id, deliveryTarget: storeTarget.id, resource: res};
            }
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

    // Chain compatible lab tasks to the primary so we make one trip for many
    // deliveries (fill case) or many pickups (empty case). Dispatch on the
    // primary's shape:
    //   - delivery to a lab → fill: same withdrawTarget supplies more labs
    //   - withdraw from a lab → empty: same deliveryTarget drains more labs
    // Anything else (factory loads, tower fills, balancing) stays single-task.
    batchTasks(primary) {
        const tasks = [primary];
        const source = Game.getObjectById(primary.withdrawTarget);
        const destination = Game.getObjectById(primary.deliveryTarget);
        if (!source || !destination) return tasks;

        const capacity = this.creep.store.getCapacity();
        const primaryShare = Math.min(primary.amount || capacity, capacity);
        let remaining = capacity - primaryShare;
        if (remaining <= 0) return tasks;

        if (destination.structureType === STRUCTURE_LAB && source.store) {
            this.batchLabFills(tasks, source, remaining);
        } else if (source.structureType === STRUCTURE_LAB && destination.store) {
            this.batchLabEmpties(tasks, destination, remaining);
        }
        return tasks;
    }

    batchLabFills(tasks, source, remaining) {
        const usedDeliveries = new Set(tasks.map(t => t.deliveryTarget));
        const usedResources = new Set(tasks.map(t => t.resource));

        for (const lab of this.room.labs) {
            if (usedDeliveries.has(lab.id)) continue;
            const candidate = this.candidateLabFill(lab, source, usedResources);
            if (!candidate || candidate.amount <= 0) continue;
            const take = Math.min(candidate.amount, remaining);
            if (take <= 0) continue;
            candidate.amount = take;
            tasks.push(candidate);
            usedDeliveries.add(lab.id);
            usedResources.add(candidate.resource);
            remaining -= take;
            if (remaining <= 0) break;
        }
    }

    batchLabEmpties(tasks, destination, remaining) {
        const usedSources = new Set(tasks.map(t => t.withdrawTarget));

        for (const lab of this.room.labs) {
            if (usedSources.has(lab.id)) continue;
            const candidate = this.candidateLabEmpty(lab, destination);
            if (!candidate || candidate.amount <= 0) continue;
            const take = Math.min(candidate.amount, remaining);
            if (take <= 0) continue;
            candidate.amount = take;
            tasks.push(candidate);
            usedSources.add(lab.id);
            remaining -= take;
            if (remaining <= 0) break;
        }
    }

    // Mirrors PRIORITY 1 in findTask: a lab holds a mineral it shouldn't,
    // either because it's been repurposed (boost/itemNeeded mismatch) or it's
    // accumulated stale product. Returns null when the lab's contents are
    // legitimate or empty.
    candidateLabEmpty(lab, destination) {
        if (!lab.mineralType) return null;
        const wrongType = (lab.memory.itemNeeded && lab.mineralType !== lab.memory.itemNeeded) ||
            (lab.memory.neededBoost && lab.mineralType !== lab.memory.neededBoost) ||
            (!lab.memory.itemNeeded && !lab.memory.neededBoost &&
                (lab.mineralType !== this.room.memory.producingBoost || lab.store[lab.mineralType] > 500));
        if (!wrongType) return null;
        const amount = lab.store[lab.mineralType];
        if (amount <= 0) return null;
        return {
            withdrawTarget: lab.id,
            deliveryTarget: destination.id,
            resource: lab.mineralType,
            amount
        };
    }

    candidateLabFill(lab, source, excludeResources) {
        // Boost reservation refill (mirrors PRIORITY 3 in findTask).
        if (lab.memory.neededBoost && !excludeResources.has(lab.memory.neededBoost)) {
            const res = lab.memory.neededBoost;
            if (lab.store.getFreeCapacity(res) > 0 &&
                lab.store[res] < lab.memory.amount &&
                source.store[res] > 0) {
                return {
                    withdrawTarget: source.id,
                    deliveryTarget: lab.id,
                    resource: res,
                    amount: Math.min(lab.memory.amount - lab.store.getUsedCapacity(res), source.store[res])
                };
            }
        }
        // Reaction input refill (mirrors the itemNeeded path in findTask).
        if (lab.memory.itemNeeded && !excludeResources.has(lab.memory.itemNeeded)) {
            const res = lab.memory.itemNeeded;
            if (lab.store.getUsedCapacity(res) < 1000 && source.store[res] > 0) {
                return {
                    withdrawTarget: source.id,
                    deliveryTarget: lab.id,
                    resource: res,
                    amount: Math.min(lab.store.getCapacity(res) - lab.store.getUsedCapacity(res), source.store[res])
                };
            }
        }
        return null;
    }

    executePickup(task) {
        const withdrawTarget = Game.getObjectById(task.withdrawTarget);
        if (!withdrawTarget) {
            // Source gone — drop just this task; carry on with the rest.
            this.creep.memory.tasks = this.creep.memory.tasks.filter(t => t !== task);
            return false;
        }

        this.creep.say(task.resource.slice(0, 3));

        if (!this.creep.pos.isNearTo(withdrawTarget)) {
            this.creep.shibMove(withdrawTarget);
            return true;
        }

        // Infinity (not 999) so a large-capacity labtech in a high-RCL room
        // can fill to its actual freeCapacity. Math.min picks the smallest of
        // the three operands, so the hard cap comes from creep capacity or
        // available source supply rather than a hardcoded number.
        const amount = Math.min(
            task.amount || Infinity,
            this.creep.store.getFreeCapacity(),
            withdrawTarget.store ? withdrawTarget.store[task.resource] : Infinity
        );
        const result = withdrawTarget instanceof Resource
            ? this.creep.pickup(withdrawTarget)
            : this.creep.withdraw(withdrawTarget, task.resource, amount);

        if (result === OK) {
            task.pickedUp = true;
            // Prefer ANY remaining pickup over starting deliveries — for fill
            // batches the next pickup is at the same source (no-op move), for
            // empty batches it's the next lab to drain. Only switch to delivery
            // once everything is loaded.
            const nextPickup = this.creep.memory.tasks.find(t => !t.pickedUp);
            if (nextPickup) {
                const target = Game.getObjectById(nextPickup.withdrawTarget);
                if (target) this.creep.shibMove(target);
            } else {
                const nextDelivery = this.creep.memory.tasks.find(t => t.pickedUp);
                if (nextDelivery) {
                    const target = Game.getObjectById(nextDelivery.deliveryTarget);
                    if (target) this.creep.shibMove(target);
                }
            }
        }
        return true;
    }

    executeDelivery(task) {
        const deliveryTarget = Game.getObjectById(task.deliveryTarget);
        if (!deliveryTarget || (deliveryTarget.store && deliveryTarget.store.getFreeCapacity(task.resource) <= 0)) {
            // Destination is gone or full — drop this task, sort out the
            // resource we're carrying via the generic fallback path.
            this.creep.memory.tasks = this.creep.memory.tasks.filter(t => t !== task);
            return this.fallbackDelivery();
        }

        this.creep.say(task.resource.slice(0, 3));

        if (!this.creep.pos.isNearTo(deliveryTarget)) {
            this.creep.shibMove(deliveryTarget);
            return true;
        }

        // Bound the transfer to this task's amount so two empty tasks sharing
        // the same resource don't have the first flush all of it, leaving the
        // second stranded with nothing to deliver.
        const transferAmount = Math.min(
            task.amount || Infinity,
            this.creep.store[task.resource]
        );
        if (this.creep.transfer(deliveryTarget, task.resource, transferAmount) === OK) {
            this.creep.memory.tasks = this.creep.memory.tasks.filter(t => t !== task);
            // Same-tick head toward next delivery in the batch.
            const next = this.creep.memory.tasks.find(t => t.pickedUp && this.creep.store[t.resource] > 0);
            if (next) {
                const target = Game.getObjectById(next.deliveryTarget);
                if (target) this.creep.shibMove(target);
            }
        }
        return true;
    }

    fallbackDelivery() {
        const resource = Object.keys(this.creep.store).find(r => this.creep.store[r] > 0);
        if (!resource) return false;

        const deliveryTarget = this.room.labs.find(s => s.memory.neededBoost === resource && s.store.getUsedCapacity(resource) < s.memory.amount)
            || [this.room.storage, this.room.terminal].find(s => s && s.store.getFreeCapacity() > 0)
            || this.room.storage || this.room.terminal;

        if (!deliveryTarget) {
            this.creep.drop(resource);
            return true;
        }

        if (this.creep.pos.isNearTo(deliveryTarget)) {
            this.creep.transfer(deliveryTarget, resource);
        } else {
            this.creep.shibMove(deliveryTarget);
        }
        return true;
    }
}

profiler.registerClass(RoleLabTech, 'LabTech');
module.exports = RoleLabTech;
