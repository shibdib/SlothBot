/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const FactoryControl = require('module.factoryController');
const {getRoomKeepAmount, getOperationalProtectAmount, getRoomOperationalNeed} = require('termKeep');
const {isCoreRoom} = require('module.colonyProfile');

const BALANCE_MIN_TRANSFER = 100;
const STORAGE_ENERGY_RESERVE = 25000;
const BALANCE_KEEP_HYSTERESIS = 500;
const TERMINAL_ENERGY_TARGET = terminalEnergyTarget();
const TERMINAL_ENERGY_LOW = TERMINAL_ENERGY_TARGET - 10000;
const TERMINAL_ENERGY_HIGH = TERMINAL_ENERGY_TARGET + 10000;
const BATTERY_TERMINAL_SOFT_CAP = 2000;
const BATTERY_TRANSFER_MAX = 5000;
const ENERGY_TRANSFER_MAX = 15000;
const TERMINAL_EXPORT_CEILING = 5000;
const IDLE_TERMINAL_SLICE = 1000;
const STORAGE_HEADROOM = 100000;
const TERMINAL_HEADROOM = 40000;
const BALANCE_DIRECTION_COOLDOWN = 50;
// Hub labs hold 3000. Urgent refill below LOW; keep topping until TARGET so
// one 1000-carry trip does not stop the feed at a single load.
const LAB_HUB_INPUT_LOW = 1000;
const LAB_HUB_INPUT_TARGET = 2500;
const LAB_OUTPUT_DRAIN_MIN = 500;
const LAB_OUTPUT_ENERGY_REFILL = 400;


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

        // 6. Batch complete — immediately start the next job (hub B, output
        // drain, boost, factory) instead of a 5-tick nap.
        this.creep.memory.tasks = undefined;
        const next = this.findTask();
        if (next) {
            this.creep.memory.tasks = this.batchTasks(next);
            const pendingPickup = this.creep.memory.tasks.find(t => !t.pickedUp);
            if (pendingPickup && this.creep.store.getFreeCapacity() > 0) {
                return this.executePickup(pendingPickup);
            }
            return;
        }
        this.creep.idleFor(5);
    }

    // Task prioritizer - Returns {withdrawTarget, deliveryTarget, resource, amount}
    findTask() {
        const labs = this.room.labs;
        const labStructMem = this.room.memory._structureMemory;
        const factory = this.room.factory;
        const storage = this.room.storage;
        const terminal = this.room.terminal;
        const powerSpawn = this.room.powerSpawn;
        const nuker = this.room.nuker;
        // Prefer the warehouse with working headroom. Nullable when both are
        // packed. Every branch that uses storeTarget.id must guard for null.
        const storeTarget = this.pickStoreTarget(storage, terminal);

        // Priority order below is the real dispatch order (1 = highest).

        // 1. Combat — fill towers during attacks
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

        // 1b. Both stores packed — swap/export before lab busywork. Otherwise
        // a 0-space hub stays stuck feeding labs while K never reaches the terminal.
        if (storage && terminal
            && storage.store.getFreeCapacity() < BALANCE_MIN_TRANSFER
            && terminal.store.getFreeCapacity() < BALANCE_MIN_TRANSFER) {
            const stuck = this.findOverflowRelief(storage, terminal);
            if (stuck) return stuck;
        }

        // 2. Boost labs beat production, nuker, and cleanup. Pre-stage first,
        // then live requestors, then leftover neededBoost; energy with them.
        const emptyBoost = this.findBoostLabEmptyTask(labs, labStructMem, storeTarget);
        if (emptyBoost) return emptyBoost;
        const fillBoost = this.findBoostLabFillTask(labs, labStructMem, storage, terminal);
        if (fillBoost) return fillBoost;
        const energyBoost = this.findBoostLabEnergyTask(labs, labStructMem, storage, terminal);
        if (energyBoost) return energyBoost;

        // 2c. Stage boosts other rooms need into the terminal so the network can send.
        const networkBoost = this.findNetworkBoostExport(storage, terminal);
        if (networkBoost) return networkBoost;

        // 2e. Lab hub feed beats store balancing. Filling labs from a stuffed
        // warehouse frees space; balancing first can starve reactions.
        if (this.room.memory.producingBoost) {
            const productionTask = this.findLabProductionTask(labs, labStructMem, storage, terminal);
            if (productionTask) return productionTask;
            if (storeTarget) {
                const outputClog = this.findLabOutputClogTask(labs, labStructMem, storeTarget);
                if (outputClog) return outputClog;
            }
        }
        const resourceNeededLabs = labs.filter(s => {
            const mem = labStructMem && labStructMem[s.id];
            return mem && mem.itemNeeded
                && this.hubLabNeedsFill(s, mem.itemNeeded)
                && s.room.store(mem.itemNeeded, true);
        });
        const resourceNeededLab = _.min(resourceNeededLabs, s => s.store.getUsedCapacity(labStructMem[s.id].itemNeeded))
        if (resourceNeededLab && resourceNeededLab.id) {
            const resourceNeeded = labStructMem[resourceNeededLab.id].itemNeeded;
            const supplier = this.pickBestSupplier(resourceNeeded,
                this.getIdleLabSources(resourceNeeded, resourceNeededLab.id));
            if (supplier) return {
                withdrawTarget: supplier.id,
                deliveryTarget: resourceNeededLab.id,
                resource: resourceNeeded,
                amount: resourceNeededLab.store.getCapacity(resourceNeeded) - resourceNeededLab.store.getUsedCapacity(resourceNeeded)
            };
        }

        // 2d. Either store under headroom — drain/overflow before nuker/factory
        // pack the last free slot. Dual-zero swap stays at 1b.
        if (storage && terminal && this.needsBalanceSpace(storage, terminal)) {
            const spaceTask = this.findBalancingTask(storage, terminal);
            if (spaceTask) return spaceTask;
        }

        // 3. Ground cleanup — non-energy drops and tombstones
        if (storeTarget) {
            const drop = this.room.droppedResources.find(r => r.resourceType !== RESOURCE_ENERGY) || this.room.tombstones.find(t => t.store.getUsedCapacity() > 0);
            if (drop) {
                const res = drop.resourceType || Object.keys(drop.store).find(r => drop.store[r] > 0);
                return {withdrawTarget: drop.id, deliveryTarget: storeTarget.id, resource: res};
            }
        }

        // 4. Nuker ghodium
        if (nuker && ((storage && storage.store[RESOURCE_GHODIUM] > 0) || (terminal && terminal.store[RESOURCE_GHODIUM] > 0)) &&
            nuker.store.getFreeCapacity(RESOURCE_GHODIUM) > 0) {
            const ghodiumStore = storage && storage.store[RESOURCE_GHODIUM] ? storage.id : terminal.id;
            return {
                withdrawTarget: ghodiumStore,
                deliveryTarget: nuker.id,
                resource: RESOURCE_GHODIUM,
                amount: nuker.store.getFreeCapacity(RESOURCE_GHODIUM)
            };
        }

        // 5. Mineral container overfull (no free capacity)
        if (storeTarget) {
            const resourceContainer = this.room.containers.find(s => s.store.getUsedCapacity() > s.store.getUsedCapacity(RESOURCE_ENERGY) && !s.store.getFreeCapacity());
            if (resourceContainer) {
                const res = Object.keys(resourceContainer.store).find(r => r !== RESOURCE_ENERGY && resourceContainer.store[r] > 0);
                if (res) return {withdrawTarget: resourceContainer.id, deliveryTarget: storeTarget.id, resource: res};
            }
        }

        // 7. Lab empties — wrong mineral / output product that should not sit
        // `amount` is included so batchTasks can size the rest of an empty
        // batch against remaining carry. Runtime executePickup re-clamps to
        // the lab's actual store, so a stale amount degrades to a partial
        // pickup rather than an error.
        if (storeTarget) {
            const producingBoost = this.room.memory.producingBoost;
            const hubIds = this.getHubLabIds();
            for (const lab of labs) {
                if (!lab.mineralType) continue;
                const mem = labStructMem && labStructMem[lab.id];
                const itemNeeded = mem && mem.itemNeeded;
                const neededBoost = mem && mem.neededBoost;
                const outputClogged = producingBoost
                    && this.isLabOutputClogged(lab, producingBoost, hubIds, mem);
                if ((itemNeeded && lab.mineralType !== itemNeeded) ||
                    (neededBoost && lab.mineralType !== neededBoost) ||
                    outputClogged ||
                    (!itemNeeded && !neededBoost && (lab.mineralType !== producingBoost || lab.store[lab.mineralType] >= LAB_OUTPUT_DRAIN_MIN))) {
                    return {
                        withdrawTarget: lab.id,
                        deliveryTarget: storeTarget.id,
                        resource: lab.mineralType,
                        amount: lab.store[lab.mineralType]
                    };
                }
            }
        }

        // 8. Factory empties — residue not needed for current recipe
        if (factory && factory.store.getUsedCapacity() > 0) {
            for (const res in factory.store) {
                if (res === RESOURCE_BATTERY && FactoryControl.shouldContinueBatteryUnpack(this.room)) continue;
                if (factory.memory.producing && COMMODITIES[factory.memory.producing] && COMMODITIES[factory.memory.producing].components[res]) continue;
                if (factory.memory.producing === res && factory.store[res] < 5000) continue;
                const dumpTarget = this.pickFactoryClogTarget(res, storage, terminal);
                if (!dumpTarget) continue;
                return {withdrawTarget: factory.id, deliveryTarget: dumpTarget.id, resource: res};
            }
        }

        // 12. Nuker energy from spare stock. Beats factory unpack and power spawn
        // (continuous sinks) so a half-full nuker actually completes.
        if (nuker) {
            const nukerEnergyNeed = nuker.store.getFreeCapacity(RESOURCE_ENERGY);
            if (nukerEnergyNeed > 0 && (this.room.energyState || this.room.rawEnergy >= nukerEnergyNeed + 10000)) {
                const energySupplier = [storage, terminal].find(s => s && (s.store[RESOURCE_ENERGY] || 0) > 10000);
                if (energySupplier) {
                    return {
                        withdrawTarget: energySupplier.id,
                        deliveryTarget: nuker.id,
                        resource: RESOURCE_ENERGY,
                        amount: nukerEnergyNeed
                    };
                }
            }
        }

        // 13. Factory battery feed (unpack)
        if (factory && FactoryControl.shouldContinueBatteryUnpack(this.room)) {
            const batteryTask = this.findFactoryBatterySupply(factory, storage, terminal);
            if (batteryTask) return batteryTask;
        }

        // 14. Factory supply — recipe inputs
        if (factory && factory.memory.producing) {
            const commodity = COMMODITIES[factory.memory.producing];
            if (commodity) {
                const components = Object.entries(commodity.components).sort((a, b) => {
                    if (a[0] === RESOURCE_BATTERY) return -1;
                    if (b[0] === RESOURCE_BATTERY) return 1;
                    return 0;
                });
                for (const [component] of components) {
                    if (component === RESOURCE_BATTERY && !this.shouldFeedFactoryBatteries(factory)) continue;
                    const supplier = [storage, terminal].find(s => s && s.store[component] > 0);
                    if (!supplier) continue;
                    const amount = this.getFactorySupplyAmount(factory, component, supplier);
                    if (amount > 0) {
                        return {
                            withdrawTarget: supplier.id,
                            deliveryTarget: factory.id,
                            resource: component,
                            amount
                        };
                    }
                }
            }
        }

        // 15. Mineral container cleanup (has minerals, not necessarily full)
        if (storeTarget) {
            const resourceContainer = this.room.containers.find(s => s.store.getUsedCapacity() > s.store.getUsedCapacity(RESOURCE_ENERGY));
            if (resourceContainer) {
                const res = Object.keys(resourceContainer.store).find(r => r !== RESOURCE_ENERGY && resourceContainer.store[r] > 0);
                if (res) return {withdrawTarget: resourceContainer.id, deliveryTarget: storeTarget.id, resource: res};
            }
        }

        // 16. Power spawn energy / power
        if (powerSpawn && this.room.energyState) {
            if (powerSpawn.store.getFreeCapacity(RESOURCE_ENERGY) > 1000 && storage && storage.store[RESOURCE_ENERGY] > 10000) {
                return {
                    withdrawTarget: storage.id,
                    deliveryTarget: powerSpawn.id,
                    resource: RESOURCE_ENERGY,
                    amount: powerSpawn.store.getFreeCapacity(RESOURCE_ENERGY)
                };
            }
            if (powerSpawn.store.getFreeCapacity(RESOURCE_POWER) > 50 && storage && storage.store[RESOURCE_POWER] > 0) {
                return {
                    withdrawTarget: storage.id,
                    deliveryTarget: powerSpawn.id,
                    resource: RESOURCE_POWER,
                    amount: powerSpawn.store.getFreeCapacity(RESOURCE_POWER)
                };
            }
        }

        // 17. Routine storage/terminal balance (keep split, energy, export slices)
        const balancingTask = this.findBalancingTask(storage, terminal);
        if (balancingTask) return balancingTask;

        // 18. Lab energy refill for reaction labs (boost labs are filled in #2).
        // Labs hold 2000 energy (5 per reaction = 400 reactions of headroom).
        for (const lab of labs) {
            const mem = labStructMem && labStructMem[lab.id];
            if (mem && mem.neededBoost) continue;
            if (!(mem && mem.itemNeeded) && lab.store[RESOURCE_ENERGY] < LAB_OUTPUT_ENERGY_REFILL && storage && storage.store[RESOURCE_ENERGY] > 5000) {
                return {withdrawTarget: storage.id, deliveryTarget: lab.id, resource: RESOURCE_ENERGY};
            }
        }

        return null;
    }

    /**
     * Labs hold one mineral type. Energy is always fine; minerals only if empty or matching.
     */
    labCanAcceptResource(lab, resource) {
        if (!lab || !resource) return false;
        if (resource === RESOURCE_ENERGY) return true;
        return !lab.mineralType || lab.mineralType === resource;
    }

    hubLabNeedsFill(lab, resource, target = LAB_HUB_INPUT_TARGET) {
        if (!lab || !resource || !this.labCanAcceptResource(lab, resource)) return false;
        const used = lab.store.getUsedCapacity(resource) || 0;
        return used < target;
    }

    // Pick the structure that actually holds a useful amount, not the first
    // with a leftover nibble (storage:3 vs terminal:50k).
    pickBestSupplier(resource, extraSources = []) {
        const seen = new Set();
        const candidates = [];
        const consider = (s) => {
            if (!s || !s.id || seen.has(s.id) || !s.store) return;
            if ((s.store[resource] || 0) <= 0) return;
            seen.add(s.id);
            candidates.push(s);
        };
        consider(this.room.storage);
        consider(this.room.terminal);
        for (let i = 0; i < extraSources.length; i++) consider(extraSources[i]);
        if (!candidates.length) return null;
        let best = candidates[0];
        let bestAmt = best.store[resource] || 0;
        for (let i = 1; i < candidates.length; i++) {
            const amt = candidates[i].store[resource] || 0;
            if (amt > bestAmt) {
                best = candidates[i];
                bestAmt = amt;
            }
        }
        return best;
    }

    getIdleLabSources(resource, excludeId) {
        const labStructMem = this.room.memory._structureMemory;
        const extras = [];
        const labs = this.room.labs;
        for (let i = 0; i < labs.length; i++) {
            const s = labs[i];
            if (s.id === excludeId) continue;
            const mem = labStructMem && labStructMem[s.id];
            if (!mem || (mem.neededBoost !== resource && mem.itemNeeded !== resource)) extras.push(s);
        }
        const containers = this.room.containers;
        if (containers && containers.length) {
            for (let i = 0; i < containers.length; i++) extras.push(containers[i]);
        }
        return extras;
    }

    outputLabNeedsEnergy(lab) {
        if (!lab) return false;
        const hubIds = this.getHubLabIds();
        if (hubIds.has(lab.id)) return false;
        const mem = this.room.memory._structureMemory && this.room.memory._structureMemory[lab.id];
        if (mem && mem.itemNeeded) return false;
        const producingBoost = this.room.memory.producingBoost;
        if (mem && mem.paused && mem.neededBoost !== producingBoost) return false;
        if (mem && mem.neededBoost && mem.neededBoost !== producingBoost) return false;
        if (lab.mineralType && producingBoost && lab.mineralType !== producingBoost) return false;
        return (lab.store[RESOURCE_ENERGY] || 0) < LAB_OUTPUT_ENERGY_REFILL
            && lab.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
    }

    // 0 = pre-staged wave, 1 = creep at the lab, 2 = leftover neededBoost.
    boostRequestPriority(mem) {
        if (!mem || !mem.neededBoost) return 99;
        if (mem.preReservedFor && mem.preReservedFor.some(n => Game.creeps[n])) return 0;
        if (mem.requestors && mem.requestors.some(id => Game.getObjectById(id))) return 1;
        return 2;
    }

    boostEnergyTarget(lab, mem) {
        const cap = (lab.store.getCapacity && lab.store.getCapacity(RESOURCE_ENERGY)) || 2000;
        const mineralAmount = (mem && mem.amount) || 0;
        const parts = Math.ceil(mineralAmount / LAB_BOOST_MINERAL);
        return Math.min(cap, Math.max(parts * LAB_BOOST_ENERGY, 400));
    }

    findBoostLabEmptyTask(labs, labStructMem, storeTarget) {
        if (!storeTarget) return null;
        let best = null;
        let bestPri = 99;
        for (let i = 0; i < labs.length; i++) {
            const lab = labs[i];
            if (!lab.mineralType) continue;
            const mem = labStructMem && labStructMem[lab.id];
            if (!mem || !mem.neededBoost) continue;
            if (lab.mineralType === mem.neededBoost) continue;
            const pri = this.boostRequestPriority(mem);
            if (pri < bestPri) {
                bestPri = pri;
                best = lab;
            }
        }
        if (!best) return null;
        return {
            withdrawTarget: best.id,
            deliveryTarget: storeTarget.id,
            resource: best.mineralType,
            amount: best.store[best.mineralType]
        };
    }

    findBoostLabFillTask(labs, labStructMem, storage, terminal) {
        let best = null;
        let bestPri = 99;
        let bestShort = 0;
        for (let i = 0; i < labs.length; i++) {
            const lab = labs[i];
            const mem = labStructMem && labStructMem[lab.id];
            if (!mem || !mem.neededBoost) continue;
            if (!this.labCanAcceptResource(lab, mem.neededBoost)) continue;
            if (lab.store.getFreeCapacity(mem.neededBoost) <= 0) continue;
            const have = lab.store[mem.neededBoost] || 0;
            if (have >= mem.amount) continue;
            const pri = this.boostRequestPriority(mem);
            const short = mem.amount - have;
            if (pri < bestPri || (pri === bestPri && short > bestShort)) {
                best = lab;
                bestPri = pri;
                bestShort = short;
            }
        }
        if (!best) return null;
        const boostMem = labStructMem[best.id];
        const boostNeeded = boostMem.neededBoost;
        const supplier = this.pickBestSupplier(boostNeeded, this.getIdleLabSources(boostNeeded, best.id));
        if (!supplier) return null;
        return {
            withdrawTarget: supplier.id,
            deliveryTarget: best.id,
            resource: boostNeeded,
            amount: boostMem.amount - best.store.getUsedCapacity(boostNeeded)
        };
    }

    findBoostLabEnergyTask(labs, labStructMem, storage, terminal) {
        const supplier = this.pickBestSupplier(RESOURCE_ENERGY);
        if (!supplier) return null;
        let best = null;
        let bestPri = 99;
        for (let i = 0; i < labs.length; i++) {
            const lab = labs[i];
            const mem = labStructMem && labStructMem[lab.id];
            if (!mem || !mem.neededBoost) continue;
            if (lab.store.getFreeCapacity(RESOURCE_ENERGY) <= 0) continue;
            const need = this.boostEnergyTarget(lab, mem);
            const have = lab.store[RESOURCE_ENERGY] || 0;
            if (have >= need) continue;
            const pri = this.boostRequestPriority(mem);
            if (pri < bestPri) {
                bestPri = pri;
                best = lab;
            }
        }
        if (!best) return null;
        const mem = labStructMem[best.id];
        const need = this.boostEnergyTarget(best, mem);
        const have = best.store[RESOURCE_ENERGY] || 0;
        return {
            withdrawTarget: supplier.id,
            deliveryTarget: best.id,
            resource: RESOURCE_ENERGY,
            amount: Math.min(need - have, best.store.getFreeCapacity(RESOURCE_ENERGY), supplier.store[RESOURCE_ENERGY])
        };
    }

    hubNeedsLabFeed(resource) {
        const hubIds = this.getHubLabIds();
        const labStructMem = this.room.memory._structureMemory;
        for (const lab of this.room.labs) {
            if (!hubIds.has(lab.id)) continue;
            const mem = labStructMem && labStructMem[lab.id];
            if (mem && mem.itemNeeded === resource && this.hubLabNeedsFill(lab, resource)) {
                return true;
            }
        }
        return false;
    }

    blocksLabProductionBalance(resource, withdrawTarget) {
        const producingBoost = this.room.memory.producingBoost;
        if (!producingBoost || !withdrawTarget) return false;
        const components = BOOST_COMPONENTS[producingBoost];
        if (!components) return false;
        const protectedRes = components.includes(resource) || resource === producingBoost;
        if (!protectedRes || !this.hubNeedsLabFeed(resource)) return false;
        return withdrawTarget.structureType === STRUCTURE_STORAGE
            || withdrawTarget.structureType === STRUCTURE_TERMINAL;
    }

    isLabOutputClogged(lab, producingBoost, hubIds, mem) {
        if (!lab.mineralType || hubIds.has(lab.id)) return false;
        if (mem && (mem.itemNeeded || mem.neededBoost)) return false;
        if (lab.mineralType !== producingBoost) return false;
        const amount = lab.store[producingBoost] || 0;
        if (!amount) return false;
        return amount >= LAB_OUTPUT_DRAIN_MIN
            || lab.store.getFreeCapacity(producingBoost) < LAB_REACTION_MINERAL;
    }

    findLabOutputClogTask(labs, labStructMem, storeTarget) {
        const producingBoost = this.room.memory.producingBoost;
        const hubIds = this.getHubLabIds();
        let best = null;
        let bestFree = Infinity;
        let bestAmt = 0;
        for (const lab of labs) {
            const mem = labStructMem && labStructMem[lab.id];
            if (!this.isLabOutputClogged(lab, producingBoost, hubIds, mem)) continue;
            const free = lab.store.getFreeCapacity(producingBoost);
            const amt = lab.store[producingBoost] || 0;
            if (free < bestFree || (free === bestFree && amt > bestAmt)) {
                best = lab;
                bestFree = free;
                bestAmt = amt;
            }
        }
        if (!best) return null;
        return {
            withdrawTarget: best.id,
            deliveryTarget: storeTarget.id,
            resource: producingBoost,
            amount: best.store[producingBoost]
        };
    }

    getHubLabIds() {
        if (this._hubLabIds) return this._hubLabIds;
        // C4: plan.anchors.lab first.
        let hub = null;
        try {
            const res = require('planDoc').getLabHub(this.room);
            hub = res && res.hub;
        } catch (e) {
            hub = this.room.memory.labHub;
        }
        const ids = new Set();
        if (!hub || hub.x === undefined) {
            this._hubLabIds = ids;
            return ids;
        }
        for (const lab of this.room.labs) {
            if (lab.pos.x === hub.x && (lab.pos.y === hub.y || lab.pos.y === hub.y + 1)) ids.add(lab.id);
        }
        this._hubLabIds = ids;
        return ids;
    }

    findLabProductionTask(labs, labStructMem, storage, terminal) {
        const producingBoost = this.room.memory.producingBoost;
        const components = BOOST_COMPONENTS[producingBoost];
        if (!components) return null;

        const hubIds = this.getHubLabIds();
        const hubNeed = labs.filter(s => {
            const mem = labStructMem && labStructMem[s.id];
            return hubIds.has(s.id) && mem && mem.itemNeeded && components.includes(mem.itemNeeded)
                && this.hubLabNeedsFill(s, mem.itemNeeded)
                && this.room.store(mem.itemNeeded, true) > 0;
        });
        const hubUrgent = hubNeed.filter(s =>
            this.hubLabNeedsFill(s, labStructMem[s.id].itemNeeded, LAB_HUB_INPUT_LOW));
        const hubFill = this.makeHubFillTask(labStructMem, hubUrgent.length ? hubUrgent : null);
        if (hubFill) return hubFill;

        const energySupplier = this.pickBestSupplier(RESOURCE_ENERGY);
        if (energySupplier) {
            let outputLab = null;
            let lowestEnergy = Infinity;
            for (let i = 0; i < labs.length; i++) {
                const s = labs[i];
                if (!this.outputLabNeedsEnergy(s)) continue;
                const have = s.store[RESOURCE_ENERGY] || 0;
                if (have < lowestEnergy) {
                    lowestEnergy = have;
                    outputLab = s;
                }
            }
            if (outputLab) {
                return {
                    withdrawTarget: energySupplier.id,
                    deliveryTarget: outputLab.id,
                    resource: RESOURCE_ENERGY,
                    amount: Math.min(
                        outputLab.store.getFreeCapacity(RESOURCE_ENERGY),
                        energySupplier.store[RESOURCE_ENERGY]
                    )
                };
            }
        }

        return this.makeHubFillTask(labStructMem, hubNeed);
    }

    makeHubFillTask(labStructMem, hubNeed) {
        if (!hubNeed || !hubNeed.length) return null;
        const target = _.min(hubNeed, s => s.store.getUsedCapacity(labStructMem[s.id].itemNeeded));
        if (!target || !target.id) return null;
        const resourceNeeded = labStructMem[target.id].itemNeeded;
        const supplier = this.pickBestSupplier(resourceNeeded, this.getIdleLabSources(resourceNeeded, target.id));
        if (!supplier) return null;
        return {
            withdrawTarget: supplier.id,
            deliveryTarget: target.id,
            resource: resourceNeeded,
            amount: target.store.getCapacity(resourceNeeded) - target.store.getUsedCapacity(resourceNeeded)
        };
    }

    shouldFeedFactoryBatteries(factory) {
        return (factory.store[RESOURCE_BATTERY] || 0) < FactoryControl.FACTORY_BATTERY_MAX;
    }

    findFactoryBatterySupply(factory, storage, terminal) {
        if (!this.shouldFeedFactoryBatteries(factory)) return null;
        const batchCost = FactoryControl.batteryBatchCost();
        // Storage is the primary battery stockpile; terminal is the export reserve.
        const supplier = (storage && storage.store[RESOURCE_BATTERY] >= batchCost) ? storage
            : (terminal && terminal.store[RESOURCE_BATTERY] >= batchCost) ? terminal
                : null;
        if (!supplier) return null;
        const amount = this.getFactorySupplyAmount(factory, RESOURCE_BATTERY, supplier);
        if (amount < batchCost) return null;
        return {
            withdrawTarget: supplier.id,
            deliveryTarget: factory.id,
            resource: RESOURCE_BATTERY,
            amount
        };
    }

    getFactorySupplyAmount(factory, resource, supplier) {
        const creepFree = this.creep.store.getFreeCapacity(resource) || this.creep.store.getFreeCapacity();
        const available = supplier.store[resource] || 0;
        if (!creepFree || !available) return 0;

        if (resource === RESOURCE_BATTERY && (factory.memory.producing === RESOURCE_ENERGY
            || FactoryControl.shouldContinueBatteryUnpack(this.room))) {
            const batchCost = FactoryControl.batteryBatchCost();
            const outputRoom = COMMODITIES[RESOURCE_ENERGY]?.amount || 600;
            const loadCap = Math.min(
                factory.store.getFreeCapacity(RESOURCE_BATTERY),
                factory.store.getFreeCapacity() - outputRoom
            );
            if (loadCap < batchCost) return 0;
            return Math.min(creepFree, available, loadCap);
        }

        if (resource === RESOURCE_ENERGY && factory.memory.producing === RESOURCE_BATTERY) {
            const outputRoom = COMMODITIES[RESOURCE_BATTERY]?.amount || 50;
            const loadCap = Math.min(
                factory.store.getFreeCapacity(RESOURCE_ENERGY),
                factory.store.getFreeCapacity() - outputRoom
            );
            if (loadCap < FactoryControl.batteryPackCost()) return 0;
            const commodity = COMMODITIES[RESOURCE_BATTERY];
            const required = commodity?.components[RESOURCE_ENERGY] || 600;
            const inFactory = factory.store[RESOURCE_ENERGY] || 0;
            const target = required * 10;
            if (inFactory >= target) return 0;
            return Math.min(target - inFactory, available, creepFree, loadCap);
        }

        const commodity = factory.memory.producing && COMMODITIES[factory.memory.producing];
        const required = commodity?.components[resource];
        if (!required) return 0;
        const inFactory = factory.store[resource] || 0;
        const target = required * 10;
        if (inFactory >= target) return 0;
        let amount = Math.min(target - inFactory, available, creepFree, factory.store.getFreeCapacity());
        if (COMPRESSED_COMMODITIES.includes(factory.memory.producing)
            && resource !== RESOURCE_ENERGY && resource !== RESOURCE_BATTERY) {
            amount = Math.min(amount, FactoryControl.compressionWarehouseSpare(this.room, resource));
        }
        return amount;
    }

    getKeepAmount(resource) {
        return getRoomKeepAmount(this.room, resource);
    }

    getSellOrderTerminalTarget(resource) {
        let target = 0;
        for (const id in Game.market.orders) {
            const order = Game.market.orders[id];
            if (order.roomName !== this.room.name || order.type !== ORDER_SELL || order.resourceType !== resource) continue;
            target = Math.max(target, Math.min(order.remainingAmount, REACTION_AMOUNT));
        }
        return target;
    }

    getTerminalExportSlice(resource) {
        if (!resource || resource === RESOURCE_ENERGY) return 0;
        const keep = this.getKeepAmount(resource);
        if (resource === RESOURCE_BATTERY) return Math.max(keep, BATTERY_TERMINAL_SOFT_CAP);
        const warehouse = isCoreRoom(this.room);
        if (COMPRESSED_COMMODITIES.includes(resource) && !warehouse) return TERMINAL_EXPORT_CEILING;
        if (keep) return Math.min(keep, TERMINAL_EXPORT_CEILING);
        return warehouse ? TERMINAL_EXPORT_CEILING : IDLE_TERMINAL_SLICE;
    }

    getTerminalRetainFloor(resource) {
        const sell = this.getSellOrderTerminalTarget(resource);
        const localOp = getOperationalProtectAmount(this.room, resource);
        const slice = this.getTerminalExportSlice(resource);
        return Math.max(slice, localOp || 0, sell);
    }

    getStructureCapacity(structure) {
        if (!structure) return 0;
        if (structure.structureType === STRUCTURE_TERMINAL) return TERMINAL_CAPACITY;
        if (structure.structureType === STRUCTURE_STORAGE) return STORAGE_CAPACITY;
        return structure.store.getCapacity();
    }

    getHeadroom(structure) {
        if (!structure) return 0;
        if (structure.structureType === STRUCTURE_TERMINAL) return TERMINAL_HEADROOM;
        if (structure.structureType === STRUCTURE_STORAGE) return STORAGE_HEADROOM;
        return 0;
    }

    usableFree(structure, resource) {
        if (!structure || !structure.store) return 0;
        const free = resource ? structure.store.getFreeCapacity(resource) : structure.store.getFreeCapacity();
        return Math.max(0, free - this.getHeadroom(structure));
    }

    isStructureNearFull(structure) {
        if (!structure) return false;
        const headroom = this.getHeadroom(structure);
        if (!headroom) {
            const cap = this.getStructureCapacity(structure);
            return cap > 0 && structure.store.getFreeCapacity() < BALANCE_MIN_TRANSFER;
        }
        return structure.store.getFreeCapacity() <= headroom;
    }

    needsBalanceSpace(storage, terminal) {
        return this.isStructureNearFull(storage) || this.isStructureNearFull(terminal);
    }

    pickStoreTarget(storage, terminal) {
        const sFree = storage ? storage.store.getFreeCapacity() : 0;
        const tFree = terminal ? terminal.store.getFreeCapacity() : 0;
        if (storage && sFree > STORAGE_HEADROOM) return storage;
        if (terminal && tFree > TERMINAL_HEADROOM) return terminal;
        if (storage && sFree >= tFree && sFree >= BALANCE_MIN_TRANSFER) return storage;
        if (terminal && tFree >= BALANCE_MIN_TRANSFER) return terminal;
        return null;
    }

    getStorageRetainTarget(resource) {
        const keep = this.getKeepAmount(resource);
        const feedTarget = this.getStorageFeedTarget(resource);
        const warehouse = Math.max(0, keep - this.getTerminalExportSlice(resource));
        return Math.max(warehouse, feedTarget);
    }

    getTerminalDrainSurplus(terminal, resource, emergency = false) {
        const amount = terminal.store[resource] || 0;
        if (!amount) return 0;
        if (emergency) {
            const sell = this.getSellOrderTerminalTarget(resource);
            const op = getOperationalProtectAmount(this.room, resource) || 0;
            return Math.max(0, amount - Math.max(op, sell));
        }
        return this.getTerminalSurplus(terminal, resource);
    }

    getTerminalSurplus(structure, resource) {
        const sellTarget = this.getSellOrderTerminalTarget(resource);
        if (sellTarget) {
            return Math.max(0, (structure.store[resource] || 0) - sellTarget);
        }
        const floor = this.getTerminalRetainFloor(resource);
        if (!floor) {
            // No local keep — storage is the bulk target, but leave a small
            // terminal slice so hub/ally export can pull idle stock.
            return Math.max(0, (structure.store[resource] || 0) - TERMINAL_EXPORT_CEILING);
        }
        return (structure.store[resource] || 0) - floor;
    }

    getTerminalShortfall(structure, resource) {
        const sellTarget = this.getSellOrderTerminalTarget(resource);
        if (sellTarget) return 0;
        const floor = this.getTerminalRetainFloor(resource);
        if (!floor) return 0;
        return floor - BALANCE_KEEP_HYSTERESIS - (structure.store[resource] || 0);
    }

    findNetworkBoostExport(storage, terminal) {
        if (!storage || !terminal) return null;
        if (this.isStructureNearFull(terminal)) return null;
        const terminalFree = this.usableFree(terminal);
        if (terminalFree < BALANCE_MIN_TRANSFER) return null;
        if (typeof ALL_BOOSTS === 'undefined' || !ALL_BOOSTS.length) return null;

        let best = null;
        let bestWant = 0;
        const resources = Object.keys(storage.store);
        for (let i = 0; i < resources.length; i++) {
            const resource = resources[i];
            if (resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) continue;
            const labFeed = (typeof ALL_BOOSTS !== 'undefined' && ALL_BOOSTS.includes(resource))
                || BASE_MINERALS.includes(resource)
                || resource === RESOURCE_GHODIUM;
            if (!labFeed) continue;
            const inStorage = storage.store[resource] || 0;
            if (inStorage < BALANCE_MIN_TRANSFER) continue;
            const protect = getOperationalProtectAmount(this.room, resource);
            const spare = (this.room.store(resource) || 0) - protect;
            if (spare < BALANCE_MIN_TRANSFER) continue;

            let remoteNeed = 0;
            for (let r = 0; r < MY_ROOMS.length; r++) {
                const name = MY_ROOMS[r];
                if (name === this.room.name) continue;
                const dest = Game.rooms[name];
                if (!dest || !dest.terminal) continue;
                const need = getRoomOperationalNeed(dest, resource);
                if (!need) continue;
                const have = dest.store(resource) || 0;
                if (have < need) remoteNeed += need - have;
            }
            if (remoteNeed < BALANCE_MIN_TRANSFER) continue;
            const inTerminal = terminal.store[resource] || 0;
            if (inTerminal >= remoteNeed) continue;
            const want = Math.min(
                remoteNeed - inTerminal,
                spare,
                inStorage,
                TERMINAL_EXPORT_CEILING,
                terminalFree
            );
            if (want > bestWant) {
                bestWant = want;
                best = resource;
            }
        }
        if (!best || bestWant < BALANCE_MIN_TRANSFER) return null;
        return this.makeBalanceTask(storage, terminal, best, Math.min(bestWant, 5000));
    }

    getTerminalBatteryTarget() {
        return Math.max(this.getKeepAmount(RESOURCE_BATTERY), BATTERY_TERMINAL_SOFT_CAP);
    }

    getStorageBatteryFloor() {
        return Math.max(FactoryControl.BATTERY_FEED_STOCK, this.getStorageFeedTarget(RESOURCE_BATTERY) || 0);
    }

    pickFactoryClogTarget(resource, storage, terminal) {
        const preferred = this.pickStoreTarget(storage, terminal);
        if (preferred) return preferred;
        if (resource !== RESOURCE_BATTERY) return storage || terminal;
        const terminalBats = terminal?.store[RESOURCE_BATTERY] || 0;
        const cap = Math.max(this.getKeepAmount(RESOURCE_BATTERY) * 2, BATTERY_TERMINAL_SOFT_CAP);
        if (terminal && this.usableFree(terminal) > 0 && terminalBats < cap) return terminal;
        return storage || terminal;
    }

    getStorageFeedTarget(resource) {
        const factory = this.room.factory;
        if (factory && factory.memory.producing) {
            const commodity = COMMODITIES[factory.memory.producing];
            if (commodity && commodity.components[resource]) {
                let target = commodity.components[resource] * 10;
                if (COMPRESSED_COMMODITIES.includes(factory.memory.producing)
                    && resource !== RESOURCE_ENERGY && resource !== RESOURCE_BATTERY) {
                    target = Math.min(target, FactoryControl.compressionWarehouseSpare(this.room, resource));
                }
                return target;
            }
        }
        if (resource === RESOURCE_BATTERY && factory && FactoryControl.shouldContinueBatteryUnpack(this.room)) {
            return FactoryControl.BATTERY_FEED_STOCK;
        }
        if (resource === RESOURCE_ENERGY && FactoryControl.shouldContinueBatteryUnpack(this.room)) {
            return 5000;
        }
        return 0;
    }

    isStorageTerminalShuffle(withdrawTarget, deliveryTarget) {
        if (!withdrawTarget || !deliveryTarget) return false;
        const pair = [withdrawTarget.structureType, deliveryTarget.structureType];
        return (pair[0] === STRUCTURE_TERMINAL && pair[1] === STRUCTURE_STORAGE)
            || (pair[0] === STRUCTURE_STORAGE && pair[1] === STRUCTURE_TERMINAL);
    }

    isBalanceDirectionBlocked(resource, terminalToStorage) {
        const lock = this.room.memory._labTechBalance?.[resource];
        if (!lock || lock.tick + BALANCE_DIRECTION_COOLDOWN < Game.time) return false;
        return lock.terminalToStorage !== terminalToStorage;
    }

    setBalanceDirectionLock(resource, terminalToStorage) {
        if (!this.room.memory._labTechBalance) this.room.memory._labTechBalance = {};
        this.room.memory._labTechBalance[resource] = {terminalToStorage, tick: Game.time};
    }

    makeBalanceTask(withdrawTarget, deliveryTarget, resource, amount, options = {}) {
        if (!withdrawTarget || !deliveryTarget || amount < BALANCE_MIN_TRANSFER) return null;
        if (this.blocksLabProductionBalance(resource, withdrawTarget)) return null;
        const available = withdrawTarget.store[resource] || 0;
        const rawFree = deliveryTarget.store.getFreeCapacity(resource);
        if (!available) return null;
        // Swap pickups free the destination before delivery; dest can start full.
        if (rawFree <= 0 && !options.swap) return null;
        const respectHeadroom = !options.swap && !options.allowCongestedTerminal && !options.emergency;
        const free = options.swap ? amount
            : respectHeadroom ? Math.max(0, rawFree - this.getHeadroom(deliveryTarget)) : rawFree;
        amount = Math.min(amount, available, free);
        if (amount < BALANCE_MIN_TRANSFER) return null;

        if (this.isStorageTerminalShuffle(withdrawTarget, deliveryTarget)) {
            const storage = this.room.storage;
            const terminal = this.room.terminal;
            const terminalToStorage = withdrawTarget.structureType === STRUCTURE_TERMINAL;
            const storageCongested = storage && this.isStructureNearFull(storage);
            // Storage overflow must enter the terminal for export even when the
            // terminal is already "near full". Block storage→terminal only when
            // storage still has room (terminal should drain, not take more).
            const allowIntoTerminal = options.allowCongestedTerminal || options.swap || storageCongested;
            if (!terminalToStorage && terminal && this.isStructureNearFull(terminal) && !allowIntoTerminal) {
                return null;
            }
            // Overflow/swap must not wait out the 50-tick anti-churn lock — that
            // lock is what parked 776k K in storage after a terminal drain.
            if (!allowIntoTerminal && this.isBalanceDirectionBlocked(resource, terminalToStorage)) return null;
            this.setBalanceDirectionLock(resource, terminalToStorage);
        }

        return {withdrawTarget: withdrawTarget.id, deliveryTarget: deliveryTarget.id, resource, amount};
    }

    findFactoryStorageBalance(storage, terminal) {
        const factory = this.room.factory;
        if (!factory) return null;

        if (!factory.memory.producing) return null;

        const commodity = COMMODITIES[factory.memory.producing];
        if (!commodity) return null;

        const components = Object.keys(commodity.components).sort((a, b) => {
            if (a === RESOURCE_BATTERY) return -1;
            if (b === RESOURCE_BATTERY) return 1;
            if (a === RESOURCE_ENERGY) return 1;
            if (b === RESOURCE_ENERGY) return -1;
            return 0;
        });

        for (const resource of components) {
            if (resource === RESOURCE_BATTERY) continue;
            const feedTarget = this.getStorageFeedTarget(resource) || this.getKeepAmount(resource) * 0.25;
            if (!feedTarget) continue;
            const inStorage = storage.store[resource] || 0;
            if (inStorage >= feedTarget) continue;
            if (this.isStructureNearFull(storage)) continue;
            if ((terminal.store[resource] || 0) > 0) {
                return this.makeBalanceTask(terminal, storage, resource, feedTarget - inStorage);
            }
        }
        return null;
    }

    findEnergyStorageBalance(storage, terminal) {
        const terminalEnergy = terminal.store[RESOURCE_ENERGY] || 0;
        const storageEnergy = storage.store[RESOURCE_ENERGY] || 0;
        const storageFree = storage.store.getFreeCapacity(RESOURCE_ENERGY);
        const terminalFree = terminal.store.getFreeCapacity(RESOURCE_ENERGY);

        // Storage is the bulk warehouse. Any terminal energy above the export target
        // pulls into storage whenever storage has room — do not leave energy stranded
        // in the terminal so pressure/network dumps fire incorrectly.
        if (storageFree >= BALANCE_MIN_TRANSFER && terminalEnergy > TERMINAL_ENERGY_TARGET) {
            const storageTight = this.usableFree(storage) < BALANCE_MIN_TRANSFER;
            if (!(storageTight && !this.isStructureNearFull(terminal))) {
                const energyOpts = storageTight ? {emergency: true} : undefined;
                return this.makeBalanceTask(terminal, storage, RESOURCE_ENERGY,
                    Math.min(terminalEnergy - TERMINAL_ENERGY_TARGET, storageFree, ENERGY_TRANSFER_MAX), energyOpts);
            }
        }

        // Congestion relief: drain terminal toward storage, keeping export buffer.
        if (this.isStructureNearFull(terminal)
            && terminalEnergy > TERMINAL_ENERGY_BUFFER + BALANCE_MIN_TRANSFER) {
            if (storageFree > BALANCE_MIN_TRANSFER) {
                return this.makeBalanceTask(terminal, storage, RESOURCE_ENERGY,
                    Math.min(terminalEnergy - TERMINAL_ENERGY_BUFFER, storageFree, ENERGY_TRANSFER_MAX),
                    {emergency: true});
            }
        }

        // Congestion relief: top up terminal export reserve from storage surplus
        // only when storage itself is full (cannot hold more bulk).
        if (this.isStructureNearFull(storage) && !this.isStructureNearFull(terminal)
            && storageEnergy > STORAGE_ENERGY_RESERVE + ENERGY_TRANSFER_MAX && terminalEnergy < TERMINAL_ENERGY_LOW) {
            if (terminalFree > BALANCE_MIN_TRANSFER) {
                return this.makeBalanceTask(storage, terminal, RESOURCE_ENERGY,
                    Math.min(storageEnergy - STORAGE_ENERGY_RESERVE, terminalFree,
                        TERMINAL_ENERGY_TARGET - terminalEnergy, ENERGY_TRANSFER_MAX));
            }
        }

        // Maintain terminal export reserve from storage — only after storage has met its reserve
        // and storage is not the right place for more (has free capacity still OK for small reserve).
        if (!this.isStructureNearFull(terminal) && !this.isStructureNearFull(storage)
            && terminalEnergy < TERMINAL_ENERGY_LOW
            && storageEnergy > STORAGE_ENERGY_RESERVE + TERMINAL_ENERGY_TARGET) {
            return this.makeBalanceTask(storage, terminal, RESOURCE_ENERGY,
                Math.min(TERMINAL_ENERGY_TARGET - terminalEnergy, storageEnergy - STORAGE_ENERGY_RESERVE,
                    terminalFree, ENERGY_TRANSFER_MAX));
        }

        const terminalRetain = TERMINAL_ENERGY_BUFFER;
        const drainable = Math.max(0, terminalEnergy - terminalRetain);

        // Storage is primary: pull from terminal into storage when local reserve is low.
        if (drainable >= BALANCE_MIN_TRANSFER && storageFree >= BALANCE_MIN_TRANSFER) {
            if (storageEnergy < STORAGE_ENERGY_RESERVE) {
                return this.makeBalanceTask(terminal, storage, RESOURCE_ENERGY,
                    Math.min(drainable, STORAGE_ENERGY_RESERVE - storageEnergy, storageFree, ENERGY_TRANSFER_MAX));
            }

            if (FactoryControl.shouldContinueBatteryUnpack(this.room) && storageEnergy < 5000) {
                return this.makeBalanceTask(terminal, storage, RESOURCE_ENERGY,
                    Math.min(drainable, STORAGE_ENERGY_RESERVE - storageEnergy, storageFree, ENERGY_TRANSFER_MAX));
            }
        }

        // Consolidate terminal excess above the export ceiling into storage bulk.
        if (terminalEnergy > TERMINAL_ENERGY_HIGH && storageFree >= BALANCE_MIN_TRANSFER) {
            return this.makeBalanceTask(terminal, storage, RESOURCE_ENERGY,
                Math.min(terminalEnergy - TERMINAL_ENERGY_HIGH, storageFree, ENERGY_TRANSFER_MAX));
        }

        return null;
    }

    findBatteryStorageBalance(storage, terminal) {
        const terminalBats = terminal.store[RESOURCE_BATTERY] || 0;
        const storageBats = storage.store[RESOURCE_BATTERY] || 0;
        const terminalKeep = this.getKeepAmount(RESOURCE_BATTERY);
        const terminalTarget = this.getTerminalBatteryTarget();
        const storageFloor = this.getStorageBatteryFloor();
        const storageFree = storage.store.getFreeCapacity(RESOURCE_BATTERY);
        const terminalFree = terminal.store.getFreeCapacity(RESOURCE_BATTERY);

        // Top up terminal export reserve from storage surplus (storage stays primary).
        if (!this.isStructureNearFull(terminal) && !this.isStructureNearFull(storage)
            && terminalBats < terminalKeep
            && storageBats > storageFloor + BALANCE_KEEP_HYSTERESIS) {
            return this.makeBalanceTask(storage, terminal, RESOURCE_BATTERY,
                Math.min(terminalTarget - terminalBats, storageBats - storageFloor,
                    terminalFree, BATTERY_TRANSFER_MAX));
        }

        const terminalRetain = terminalKeep;
        const drainable = Math.max(0, terminalBats - terminalRetain);

        // Fill storage working stock from terminal when storage is below factory floor.
        if (drainable >= BALANCE_MIN_TRANSFER && storageBats < storageFloor && storageFree >= BALANCE_MIN_TRANSFER) {
            return this.makeBalanceTask(terminal, storage, RESOURCE_BATTERY,
                Math.min(drainable, storageFloor - storageBats, storageFree, BATTERY_TRANSFER_MAX));
        }

        // Consolidate terminal excess above export target into storage bulk.
        if (terminalBats > terminalTarget && storageFree >= BALANCE_MIN_TRANSFER) {
            return this.makeBalanceTask(terminal, storage, RESOURCE_BATTERY,
                Math.min(terminalBats - terminalTarget, storageFree, BATTERY_TRANSFER_MAX));
        }

        // Congestion relief: any drainable batteries when the export buffer is full.
        if (this.isStructureNearFull(terminal) && drainable >= BALANCE_MIN_TRANSFER
            && storageFree >= BALANCE_MIN_TRANSFER) {
            return this.makeBalanceTask(terminal, storage, RESOURCE_BATTERY,
                Math.min(drainable, storageFree, BATTERY_TRANSFER_MAX));
        }

        return null;
    }

    findSellOrderBalance(storage, terminal) {
        const terminalFree = terminal.store.getFreeCapacity();
        if (terminalFree < BALANCE_MIN_TRANSFER) return null;
        if (this.isStructureNearFull(terminal) && !this.isStructureNearFull(storage)) return null;

        for (const id in Game.market.orders) {
            const order = Game.market.orders[id];
            if (order.roomName !== this.room.name || order.type !== ORDER_SELL) continue;
            const res = order.resourceType;
            const sellTarget = this.getSellOrderTerminalTarget(res);
            if (!sellTarget) continue;
            const amountNeeded = sellTarget - (terminal.store[res] || 0);
            if (amountNeeded >= BALANCE_MIN_TRANSFER && (storage.store[res] || 0) > 0) {
                return this.makeBalanceTask(storage, terminal, res, Math.min(amountNeeded, 5000, terminalFree));
            }
        }
        return null;
    }

    findExcessTerminalToStorage(storage, terminal, emergency = false) {
        const storageFree = storage.store.getFreeCapacity();
        const terminalUrgent = this.isStructureNearFull(terminal);
        const urgent = emergency || terminalUrgent;
        if (!urgent && this.usableFree(storage) < BALANCE_MIN_TRANSFER) return null;
        if (urgent && storageFree < BALANCE_MIN_TRANSFER) return null;

        const resources = Object.keys(terminal.store)
            .filter(r => r !== RESOURCE_ENERGY)
            .sort((a, b) => (terminal.store[b] || 0) - (terminal.store[a] || 0));

        const destCap = urgent ? storageFree : this.usableFree(storage);
        for (const resource of resources) {
            const excess = this.getTerminalDrainSurplus(terminal, resource, urgent);
            if (excess < BALANCE_MIN_TRANSFER) continue;
            const task = this.makeBalanceTask(terminal, storage, resource, Math.min(excess, 5000, destCap),
                urgent ? {emergency: true} : undefined);
            if (task) return task;
        }
        return null;
    }

    pickStorageOverflowResource(storage) {
        const resources = Object.keys(storage.store)
            .filter(r => r !== RESOURCE_ENERGY && r !== RESOURCE_BATTERY)
            .sort((a, b) => (storage.store[b] || 0) - (storage.store[a] || 0));
        for (const resource of resources) {
            const inStorage = storage.store[resource] || 0;
            const retain = this.getStorageRetainTarget(resource) || 0;
            const excess = Math.max(0, inStorage - retain);
            if (excess >= BALANCE_MIN_TRANSFER) return {resource, excess};
        }
        return null;
    }

    findTerminalFeeEnergy(storage, terminal) {
        if (!this.isStructureNearFull(storage)) return null;
        const terminalEnergy = terminal.store[RESOURCE_ENERGY] || 0;
        const storageEnergy = storage.store[RESOURCE_ENERGY] || 0;
        const terminalFree = terminal.store.getFreeCapacity(RESOURCE_ENERGY);
        if (terminalEnergy >= TERMINAL_ENERGY_BUFFER) return null;
        if (storageEnergy < BALANCE_MIN_TRANSFER || terminalFree < BALANCE_MIN_TRANSFER) return null;
        return this.makeBalanceTask(storage, terminal, RESOURCE_ENERGY,
            Math.min(TERMINAL_ENERGY_BUFFER - terminalEnergy, storageEnergy, terminalFree, ENERGY_TRANSFER_MAX),
            {allowCongestedTerminal: true});
    }

    findEnergyRescueSwap(storage, terminal) {
        if (!this.isStructureNearFull(storage) || !this.isStructureNearFull(terminal)) return null;
        const terminalEnergy = terminal.store[RESOURCE_ENERGY] || 0;
        if (terminalEnergy >= TERMINAL_ENERGY_BUFFER) return null;

        const storageEnergy = storage.store[RESOURCE_ENERGY] || 0;
        if (storageEnergy < BALANCE_MIN_TRANSFER) return null;

        const creepCap = this.creep.store.getCapacity() || 0;
        const half = Math.floor(creepCap / 2);
        if (half < BALANCE_MIN_TRANSFER) return null;

        let mineral = null;
        let mineralAmt = 0;
        for (const resource of Object.keys(terminal.store)) {
            if (resource === RESOURCE_ENERGY) continue;
            const amt = terminal.store[resource] || 0;
            if (amt > mineralAmt) {
                mineral = resource;
                mineralAmt = amt;
            }
        }
        if (!mineral || mineralAmt < BALANCE_MIN_TRANSFER) return null;

        const amount = Math.min(
            TERMINAL_ENERGY_BUFFER - terminalEnergy,
            storageEnergy,
            mineralAmt,
            half,
            5000
        );
        if (amount < BALANCE_MIN_TRANSFER) return null;

        const task = this.makeBalanceTask(storage, terminal, RESOURCE_ENERGY, amount, {swap: true});
        if (!task) return null;
        task.swapReverse = {
            withdrawTarget: terminal.id,
            deliveryTarget: storage.id,
            resource: mineral,
            amount
        };
        return task;
    }

    findCongestionSwap(storage, terminal) {
        if (!this.isStructureNearFull(storage) || !this.isStructureNearFull(terminal)) return null;

        const creepCap = this.creep.store.getCapacity() || 0;
        const half = Math.floor(creepCap / 2);
        if (half < BALANCE_MIN_TRANSFER) return null;

        const overflow = this.pickStorageOverflowResource(storage);
        if (!overflow) return null;

        const terminalEnergy = terminal.store[RESOURCE_ENERGY] || 0;
        let reverseResource = null;
        let reverseAvail = 0;
        if (terminalEnergy > TERMINAL_ENERGY_BUFFER + BALANCE_MIN_TRANSFER) {
            reverseResource = RESOURCE_ENERGY;
            reverseAvail = terminalEnergy - TERMINAL_ENERGY_BUFFER;
        } else {
            for (const resource of Object.keys(terminal.store)) {
                if (resource === overflow.resource || resource === RESOURCE_ENERGY) continue;
                const amt = terminal.store[resource] || 0;
                if (amt > reverseAvail) {
                    reverseResource = resource;
                    reverseAvail = amt;
                }
            }
        }
        if (!reverseResource || reverseAvail < BALANCE_MIN_TRANSFER) return null;

        const amount = Math.min(overflow.excess, reverseAvail, half, 5000);
        if (amount < BALANCE_MIN_TRANSFER) return null;

        const task = this.makeBalanceTask(storage, terminal, overflow.resource, amount, {swap: true});
        if (!task) return null;
        task.swapReverse = {
            withdrawTarget: terminal.id,
            deliveryTarget: storage.id,
            resource: reverseResource,
            amount
        };
        return task;
    }

    findStorageOverflowToTerminal(storage, terminal) {
        const terminalFree = terminal.store.getFreeCapacity();
        if (terminalFree < BALANCE_MIN_TRANSFER) return null;

        const storageCongested = this.isStructureNearFull(storage);
        // Near-full terminal is fine when storage is the problem — any free
        // slot is an export slot for the warehouse pile.
        if (!storageCongested && this.isStructureNearFull(terminal)) return null;

        const resources = Object.keys(storage.store)
            .filter(r => r !== RESOURCE_ENERGY)
            .sort((a, b) => (storage.store[b] || 0) - (storage.store[a] || 0));

        for (const resource of resources) {
            if (resource === RESOURCE_BATTERY) {
                const batteryTask = this.findBatteryStorageBalance(storage, terminal);
                if (batteryTask && batteryTask.withdrawTarget === storage.id) return batteryTask;
                continue;
            }

            const inStorage = storage.store[resource] || 0;
            if (inStorage < BALANCE_MIN_TRANSFER) continue;

            // Normal: only move above storage retain target, capped by terminal export ceiling.
            // Storage full: ignore export ceiling so bulk piles (e.g. 776k K) can enter the
            // terminal for pressure sends / fire sales. Keep only the local keep floor in storage.
            const retain = this.getStorageRetainTarget(resource);
            if (!storageCongested && !retain && !this.getKeepAmount(resource)) continue;

            const excess = Math.max(0, inStorage - retain);
            if (excess < BALANCE_MIN_TRANSFER) continue;

            const inTerminal = terminal.store[resource] || 0;
            let maxToTerminal = terminalFree;
            if (!storageCongested) {
                const exportCeiling = Math.max(this.getTerminalRetainFloor(resource), TERMINAL_EXPORT_CEILING);
                if (inTerminal >= exportCeiling) continue;
                maxToTerminal = Math.min(maxToTerminal, exportCeiling - inTerminal);
            }

            const task = this.makeBalanceTask(storage, terminal, resource,
                Math.min(excess, 5000, maxToTerminal),
                storageCongested ? {allowCongestedTerminal: true} : undefined);
            if (task) return task;
        }
        return null;
    }

    findOverflowRelief(storage, terminal) {
        const terminalCongested = this.isStructureNearFull(terminal);
        const storageCongested = this.isStructureNearFull(storage);
        if (!terminalCongested && !storageCongested) return null;

        if (storageCongested) {
            const feeTask = this.findTerminalFeeEnergy(storage, terminal);
            if (feeTask) return feeTask;
            const fill = this.findStorageOverflowToTerminal(storage, terminal);
            if (fill) return fill;
        }

        if (terminalCongested && storageCongested) {
            const rescue = this.findEnergyRescueSwap(storage, terminal);
            if (rescue) return rescue;
            const swap = this.findCongestionSwap(storage, terminal);
            if (swap) return swap;
            const energyTask = this.findEnergyStorageBalance(storage, terminal);
            if (energyTask) return energyTask;
            return null;
        }

        if (terminalCongested) {
            const drain = this.findExcessTerminalToStorage(storage, terminal, true);
            if (drain) return drain;
            const energyTask = this.findEnergyStorageBalance(storage, terminal);
            if (energyTask && energyTask.withdrawTarget === terminal.id) return energyTask;
            return null;
        }

        const batteryTask = this.findBatteryStorageBalance(storage, terminal);
        if (batteryTask) return batteryTask;
        return this.findEnergyStorageBalance(storage, terminal);
    }

    findIdleExportToTerminal(storage, terminal) {
        if (!storage || !terminal) return null;
        if (this.isStructureNearFull(terminal) || this.isStructureNearFull(storage)) return null;
        const terminalFree = terminal.store.getFreeCapacity();
        if (terminalFree < BALANCE_MIN_TRANSFER) return null;

        const resources = Object.keys(storage.store)
            .filter(r => r !== RESOURCE_ENERGY && r !== RESOURCE_BATTERY)
            .sort((a, b) => (storage.store[b] || 0) - (storage.store[a] || 0));

        for (const resource of resources) {
            if (this.getKeepAmount(resource)) continue;
            const inStorage = storage.store[resource] || 0;
            if (inStorage < BALANCE_MIN_TRANSFER) continue;
            const inTerminal = terminal.store[resource] || 0;
            if (inTerminal >= TERMINAL_EXPORT_CEILING) continue;
            const amount = Math.min(
                inStorage,
                TERMINAL_EXPORT_CEILING - inTerminal,
                5000,
                terminalFree
            );
            if (amount < BALANCE_MIN_TRANSFER) continue;
            const task = this.makeBalanceTask(storage, terminal, resource, amount);
            if (task) return task;
        }
        return null;
    }

    findDeficitStorageToTerminal(storage, terminal) {
        const terminalFree = this.usableFree(terminal);
        if (terminalFree < 1000 || this.isStructureNearFull(storage)) return null;

        const candidates = [];
        for (const resource of Object.keys(storage.store)) {
            if (resource === RESOURCE_ENERGY) continue;
            const keep = this.getKeepAmount(resource);
            const isBoost = typeof ALL_BOOSTS !== 'undefined' && ALL_BOOSTS.includes(resource);
            if (!keep && !isBoost) continue;
            const deficit = this.getTerminalShortfall(terminal, resource);
            if (deficit < BALANCE_MIN_TRANSFER || !(storage.store[resource] > 0)) continue;
            candidates.push({resource, deficit, priority: deficit / (keep || TERMINAL_EXPORT_CEILING)});
        }
        candidates.sort((a, b) => b.priority - a.priority);

        for (const {resource, deficit} of candidates) {
            const task = this.makeBalanceTask(storage, terminal, resource, Math.min(deficit, 5000, terminalFree));
            if (task) return task;
        }
        return null;
    }

    findBalancingTask(storage, terminal) {
        if (!storage || !terminal) return null;

        const overflowTask = this.findOverflowRelief(storage, terminal);
        if (overflowTask) return overflowTask;

        const factoryTask = this.findFactoryStorageBalance(storage, terminal);
        if (factoryTask) return factoryTask;

        const terminalUrgent = this.isStructureNearFull(terminal);

        // Drain export overflow before topping terminal for sells or keep targets.
        const drainTask = this.findExcessTerminalToStorage(storage, terminal, terminalUrgent);
        if (drainTask) return drainTask;

        const energyTask = this.findEnergyStorageBalance(storage, terminal);
        if (energyTask) return energyTask;

        const batteryTask = this.findBatteryStorageBalance(storage, terminal);
        if (batteryTask) return batteryTask;

        const sellTask = this.findSellOrderBalance(storage, terminal);
        if (sellTask) return sellTask;

        const networkBoost = this.findNetworkBoostExport(storage, terminal);
        if (networkBoost) return networkBoost;

        const idleExport = this.findIdleExportToTerminal(storage, terminal);
        if (idleExport) return idleExport;

        return this.findDeficitStorageToTerminal(storage, terminal);
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
        if (primary.amount) primary.amount = Math.min(primary.amount, capacity);
        const primaryShare = Math.min(primary.amount || capacity, capacity);
        let remaining = capacity - primaryShare;

        if (primary.swapReverse && remaining >= BALANCE_MIN_TRANSFER) {
            const rev = primary.swapReverse;
            const take = Math.min(rev.amount, remaining);
            if (take >= BALANCE_MIN_TRANSFER) {
                tasks.push({
                    withdrawTarget: rev.withdrawTarget,
                    deliveryTarget: rev.deliveryTarget,
                    resource: rev.resource,
                    amount: take
                });
            }
            return tasks;
        }

        if (destination.structureType === STRUCTURE_LAB && source.store) {
            // Re-allocate the whole carry so a 2000-unit hub request does not
            // eat the load and skip the other hub mineral sitting in the same store.
            this.batchLabFills(tasks, source, capacity);
        } else if (remaining > 0 && source.structureType === STRUCTURE_LAB && destination.store) {
            this.batchLabEmpties(tasks, destination, remaining);
        }
        return tasks;
    }

    batchLabFills(tasks, source, capacity) {
        const primary = tasks[0];
        const usedDeliveries = new Set(tasks.map(t => t.deliveryTarget));
        const mineralExtras = [];
        const energyExtras = [];

        for (const lab of this.room.labs) {
            if (usedDeliveries.has(lab.id)) continue;
            const candidate = this.candidateLabFill(lab, source);
            if (!candidate || candidate.amount <= 0) continue;
            usedDeliveries.add(lab.id);
            if (candidate.resource === RESOURCE_ENERGY) energyExtras.push(candidate);
            else mineralExtras.push(candidate);
        }

        const primaryIsEnergy = primary.resource === RESOURCE_ENERGY;
        const first = primaryIsEnergy ? energyExtras : mineralExtras;
        const second = primaryIsEnergy ? mineralExtras : energyExtras;

        const primaryDest = Game.getObjectById(primary.deliveryTarget);
        const destMem = primaryDest && this.room.memory._structureMemory
            && this.room.memory._structureMemory[primaryDest.id];
        // Wave boost labs: fill one mineral to the pooled waitFor amount
        // before sprinkling leftover carry on the next boost. Hub inputs
        // still share the load so both reactions stay fed.
        const greedyBoost = !primaryIsEnergy && !!(destMem && destMem.neededBoost);

        this.allocateFillAmounts([primary, ...first], source, capacity, greedyBoost);
        for (const t of first) {
            if (t.amount > 0) tasks.push(t);
        }

        const used = tasks.reduce((sum, t) => sum + (t.amount || 0), 0);
        const leftover = capacity - used;
        if (leftover > 0 && second.length) {
            this.allocateFillAmounts(second, source, leftover);
            for (const t of second) {
                if (t.amount > 0) tasks.push(t);
            }
        }

        if (primary.amount <= 0 && tasks.length > 1) {
            const idx = tasks.indexOf(primary);
            if (idx >= 0) tasks.splice(idx, 1);
        }
    }

    allocateFillAmounts(candidates, source, capacity, greedy) {
        if (!candidates.length || capacity <= 0) return 0;
        for (const t of candidates) {
            const dest = Game.getObjectById(t.deliveryTarget);
            const destFree = dest && dest.store ? dest.store.getFreeCapacity(t.resource) : Infinity;
            t.amount = Math.min(t.amount == null ? destFree : t.amount, destFree);
            if (!(t.amount > 0)) t.amount = 0;
        }
        const live = candidates.filter(t => t.amount > 0);
        if (!live.length) return capacity;

        const needs = live.map(t => t.amount);
        const totalNeed = needs.reduce((sum, n) => sum + n, 0);
        if (totalNeed > capacity) {
            if (greedy) {
                let remaining = capacity;
                for (let i = 0; i < live.length; i++) {
                    const take = Math.min(needs[i], remaining);
                    live[i].amount = take;
                    remaining -= take;
                }
            } else {
                const n = live.length;
                const floorShare = Math.floor(capacity / n);
                const assigned = needs.map(need => Math.min(need, floorShare));
                let remaining = capacity - assigned.reduce((sum, a) => sum + a, 0);
                for (let i = 0; i < n && remaining > 0; i++) {
                    const more = Math.min(needs[i] - assigned[i], remaining);
                    assigned[i] += more;
                    remaining -= more;
                }
                for (let i = 0; i < n; i++) live[i].amount = assigned[i];
            }
        }

        if (source && source.store) {
            const taken = {};
            for (const t of live) {
                const avail = (source.store[t.resource] || 0) - (taken[t.resource] || 0);
                t.amount = Math.min(t.amount, Math.max(0, avail));
                taken[t.resource] = (taken[t.resource] || 0) + t.amount;
            }
        }

        for (const t of candidates) {
            if (!live.includes(t)) t.amount = 0;
        }
        return Math.max(0, capacity - live.reduce((sum, t) => sum + (t.amount || 0), 0));
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

    // Mirrors findTask lab empties: a lab holds a mineral it shouldn't,
    // either because it's been repurposed (boost/itemNeeded mismatch) or it's
    // accumulated stale product. Returns null when the lab's contents are
    // legitimate or empty.
    candidateLabEmpty(lab, destination) {
        if (!lab.mineralType) return null;
        const structMem = this.room.memory._structureMemory;
        const mem = structMem && structMem[lab.id];
        const itemNeeded = mem && mem.itemNeeded;
        const neededBoost = mem && mem.neededBoost;
        const producingBoost = this.room.memory.producingBoost;
        const hubIds = this.getHubLabIds();
        const outputClogged = producingBoost
            && this.isLabOutputClogged(lab, producingBoost, hubIds, mem);
        const wrongType = (itemNeeded && lab.mineralType !== itemNeeded) ||
            (neededBoost && lab.mineralType !== neededBoost) ||
            outputClogged ||
            (!itemNeeded && !neededBoost &&
                (lab.mineralType !== producingBoost || lab.store[lab.mineralType] >= LAB_OUTPUT_DRAIN_MIN));
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

    candidateLabFill(lab, source) {
        const structMem = this.room.memory._structureMemory;
        const mem = structMem && structMem[lab.id];
        // Boost reservation refill (mirrors findTask lab boost fill).
        if (mem && mem.neededBoost) {
            const res = mem.neededBoost;
            if (this.labCanAcceptResource(lab, res) &&
                lab.store.getFreeCapacity(res) > 0 &&
                lab.store[res] < mem.amount &&
                source.store[res] > 0) {
                return {
                    withdrawTarget: source.id,
                    deliveryTarget: lab.id,
                    resource: res,
                    amount: Math.min(mem.amount - lab.store.getUsedCapacity(res), source.store[res])
                };
            }
            if (source.store[RESOURCE_ENERGY] > 0) {
                const need = this.boostEnergyTarget(lab, mem);
                const have = lab.store[RESOURCE_ENERGY] || 0;
                if (have < need && lab.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                    return {
                        withdrawTarget: source.id,
                        deliveryTarget: lab.id,
                        resource: RESOURCE_ENERGY,
                        amount: Math.min(need - have, lab.store.getFreeCapacity(RESOURCE_ENERGY), source.store[RESOURCE_ENERGY])
                    };
                }
            }
            return null;
        }
        // Reaction input refill (mirrors findTask itemNeeded path).
        if (mem && mem.itemNeeded) {
            const res = mem.itemNeeded;
            if (this.hubLabNeedsFill(lab, res) && source.store[res] > 0) {
                return {
                    withdrawTarget: source.id,
                    deliveryTarget: lab.id,
                    resource: res,
                    amount: Math.min(lab.store.getCapacity(res) - lab.store.getUsedCapacity(res), source.store[res])
                };
            }
            return null;
        }
        // Output-lab energy from the same store (only leftover carry after minerals).
        if (source.store[RESOURCE_ENERGY] > 0 && this.outputLabNeedsEnergy(lab)) {
            return {
                withdrawTarget: source.id,
                deliveryTarget: lab.id,
                resource: RESOURCE_ENERGY,
                amount: Math.min(lab.store.getFreeCapacity(RESOURCE_ENERGY), source.store[RESOURCE_ENERGY])
            };
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
        if (!(amount > 0) && !(withdrawTarget instanceof Resource)) {
            this.creep.memory.tasks = this.creep.memory.tasks.filter(t => t !== task);
            return false;
        }
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
        const labBlocked = deliveryTarget
            && deliveryTarget.structureType === STRUCTURE_LAB
            && !this.labCanAcceptResource(deliveryTarget, task.resource);
        if (!deliveryTarget
            || labBlocked
            || (deliveryTarget.store && deliveryTarget.store.getFreeCapacity(task.resource) <= 0)) {
            // Destination is gone, full, or holds a different mineral — drop this
            // task and sort residual carry via fallback (usually storage/terminal).
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

        const labStructMem = this.room.memory._structureMemory;
        const deliveryTarget = this.room.labs.find(s => {
                const mem = labStructMem && labStructMem[s.id];
                return mem && mem.neededBoost === resource
                    && this.labCanAcceptResource(s, resource)
                    && s.store.getUsedCapacity(resource) < mem.amount;
            })
            || [this.room.storage, this.room.terminal].find(s => s && s.store.getFreeCapacity() >= BALANCE_MIN_TRANSFER
                && !(s.structureType === STRUCTURE_TERMINAL && this.isStructureNearFull(s)))
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
