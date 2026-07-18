/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const {empireOpsPaused} = require('hcReadiness');
const FactoryControl = require('module.factoryController');
const {getRoomKeepAmount} = require('termInventory');

const BALANCE_MIN_TRANSFER = 100;
const STORAGE_ENERGY_RESERVE = 25000;
const BALANCE_KEEP_HYSTERESIS = 500;
const TERMINAL_ENERGY_TARGET = terminalEnergyTarget();
const TERMINAL_ENERGY_LOW = TERMINAL_ENERGY_TARGET - 10000;
const TERMINAL_ENERGY_HIGH = TERMINAL_ENERGY_TARGET + 10000;
const BATTERY_TERMINAL_SOFT_CAP = 2000;
const BATTERY_TRANSFER_MAX = 5000;
const ENERGY_TRANSFER_MAX = 15000;
const STRUCTURE_MAX_FILL_RATIO = 0.9;
const TERMINAL_EXPORT_CEILING = 5000;
const BALANCE_DIRECTION_COOLDOWN = 50;
const LAB_HUB_INPUT_TARGET = 1000;
const LAB_OUTPUT_DRAIN_MIN = 100;


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
        const labStructMem = this.room.memory._structureMemory;
        const factory = this.room.factory;
        const storage = this.room.storage;
        const terminal = this.room.terminal;
        const powerSpawn = this.room.powerSpawn;
        const nuker = this.room.nuker;
        // Prefer whichever of storage/terminal has free space; nullable when both
        // are full or missing. Every branch below that uses storeTarget.id must
        // guard for null — letting it through crashes the role mid-tick.
        let storeTarget = null;
        if (storage && storage.store.getFreeCapacity() >= BALANCE_MIN_TRANSFER) storeTarget = storage;
        else if (terminal && terminal.store.getFreeCapacity() >= BALANCE_MIN_TRANSFER && !this.isTerminalNearFull(terminal)) storeTarget = terminal;

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

        // -- PRIORITY 1: MINERAL CONTAINER OVERFULL --
        if (storeTarget) {
            const resourceContainer = this.room.containers.find(s => s.store.getUsedCapacity() > s.store.getUsedCapacity(RESOURCE_ENERGY) && !s.store.getFreeCapacity());
            if (resourceContainer) {
                const res = Object.keys(resourceContainer.store).find(r => r !== RESOURCE_ENERGY && resourceContainer.store[r] > 0);
                if (res) return {withdrawTarget: resourceContainer.id, deliveryTarget: storeTarget.id, resource: res};
            }
        }

        // -- PRIORITY 0.5: ACTIVE LAB REACTIONS (hub inputs + output energy) --
        if (this.room.memory.producingBoost) {
            const productionTask = this.findLabProductionTask(labs, labStructMem, storage, terminal);
            if (productionTask) return productionTask;
            if (storeTarget) {
                const outputClog = this.findLabOutputClogTask(labs, labStructMem, storeTarget);
                if (outputClog) return outputClog;
            }
        }

        // -- PRIORITY 1: PRODUCTION CLOGS (Emptying Labs/Factory) --
        // `amount` is included so batchTasks can size the rest of an empty
        // batch against remaining carry. Runtime executePickup re-clamps to
        // the lab's actual store, so a stale amount degrades to a partial
        // pickup rather than an error.
        if (storeTarget) {
            const producingBoost = this.room.memory.producingBoost;
            for (const lab of labs) {
                if (!lab.mineralType) continue;
                const mem = labStructMem && labStructMem[lab.id];
                const itemNeeded = mem && mem.itemNeeded;
                const neededBoost = mem && mem.neededBoost;
                // If it has something it shouldn't
                const hubIds = this.getHubLabIds();
                const memRef = labStructMem && labStructMem[lab.id];
                const outputClogged = producingBoost
                    && this.isLabOutputClogged(lab, producingBoost, hubIds, memRef);
                if ((itemNeeded && lab.mineralType !== itemNeeded) ||
                    (neededBoost && lab.mineralType !== neededBoost) ||
                    outputClogged ||
                    (!itemNeeded && !neededBoost && (lab.mineralType !== producingBoost || lab.store[lab.mineralType] > 500))) {
                    return {
                        withdrawTarget: lab.id,
                        deliveryTarget: storeTarget.id,
                        resource: lab.mineralType,
                        amount: lab.store[lab.mineralType]
                    };
                }
            }
        }
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

        // -- PRIORITY 3: SUPPLY MINERALS (Filling Labs with minerals/boosts only) --
        const boostNeededLab = labs.find(s => {
            const mem = labStructMem && labStructMem[s.id];
            if (!mem || !mem.neededBoost) return false;
            return s.store.getFreeCapacity(mem.neededBoost) > 0 && s.store[mem.neededBoost] < mem.amount;
        });
        if (boostNeededLab) {
            const boostMem = labStructMem[boostNeededLab.id];
            const boostNeeded = boostMem.neededBoost;
            // Skip labs that are themselves collecting this boost — otherwise we'd churn between them.
            const labSources = labs.filter(s => {
                if (s.id === boostNeededLab.id) return false;
                const mem = labStructMem && labStructMem[s.id];
                return !mem || (mem.neededBoost !== boostNeeded && mem.itemNeeded !== boostNeeded);
            });
            const supplier = [storage, terminal, ...labSources, ...this.room.containers].find(s => s && s.store && s.store.getUsedCapacity(boostNeeded) > 0);
            if (supplier) return {
                withdrawTarget: supplier.id,
                deliveryTarget: boostNeededLab.id,
                resource: boostNeeded,
                amount: boostMem.amount - boostNeededLab.store.getUsedCapacity(boostNeeded)
            };
        }
        // Find the lab with the lowest store of itemNeeded
        const resourceNeededLabs = labs.filter(s => {
            const mem = labStructMem && labStructMem[s.id];
            return mem && mem.itemNeeded && s.store.getUsedCapacity(mem.itemNeeded) < 1000 && s.room.store(mem.itemNeeded, true);
        });
        const resourceNeededLab = _.min(resourceNeededLabs, s => s.store.getUsedCapacity(labStructMem[s.id].itemNeeded))
        if (resourceNeededLab && resourceNeededLab.id) {
            const resourceNeeded = labStructMem[resourceNeededLab.id].itemNeeded;
            const labSources = labs.filter(s => {
                if (s.id === resourceNeededLab.id) return false;
                const mem = labStructMem && labStructMem[s.id];
                return !mem || (mem.neededBoost !== resourceNeeded && mem.itemNeeded !== resourceNeeded);
            });
            const supplier = [storage, terminal, ...labSources, ...this.room.containers].find(s => s && s.store && s.store.getUsedCapacity(resourceNeeded) > 0);
            if (supplier) return {
                withdrawTarget: supplier.id,
                deliveryTarget: resourceNeededLab.id,
                resource: resourceNeeded,
                amount: resourceNeededLab.store.getCapacity(resourceNeeded) - resourceNeededLab.store.getUsedCapacity(resourceNeeded)
            };
        }

        // -- PRIORITY 1: URGENT BALANCING STORAGE & TERMINAL --
        let balancingTask = this.findBalancingTask(storage, terminal, 1000);
        if (balancingTask) return balancingTask;

        // -- PRIORITY 1: FACTORY BATTERY FEED (full loads, leave room for unpack output) --
        if (factory && FactoryControl.shouldContinueBatteryUnpack(this.room)) {
            const batteryTask = this.findFactoryBatterySupply(factory, storage, terminal);
            if (batteryTask) return batteryTask;
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

        // -- PRIORITY 5: BALANCING STORAGE & TERMINAL --
        balancingTask = this.findBalancingTask(storage, terminal);
        if (balancingTask) return balancingTask;

        // -- PRIORITY 6: LAB ENERGY REFILL --
        // Labs hold 2000 energy (5 per reaction = 400 reactions of headroom).
        // Only refill when nearly depleted so energy hauling doesn't crowd out everything else.
        for (const lab of labs) {
            const mem = labStructMem && labStructMem[lab.id];
            if (!(mem && mem.itemNeeded) && lab.store[RESOURCE_ENERGY] < 400 && storage && storage.store[RESOURCE_ENERGY] > 5000) {
                return {withdrawTarget: storage.id, deliveryTarget: lab.id, resource: RESOURCE_ENERGY};
            }
        }

        return null;
    }

    hubNeedsLabFeed(resource) {
        const hubIds = this.getHubLabIds();
        const labStructMem = this.room.memory._structureMemory;
        for (const lab of this.room.labs) {
            if (!hubIds.has(lab.id)) continue;
            const mem = labStructMem && labStructMem[lab.id];
            if (mem && mem.itemNeeded === resource
                && lab.store.getUsedCapacity(resource) < LAB_HUB_INPUT_TARGET) {
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
        for (const lab of labs) {
            const mem = labStructMem && labStructMem[lab.id];
            if (!this.isLabOutputClogged(lab, producingBoost, hubIds, mem)) continue;
            return {
                withdrawTarget: lab.id,
                deliveryTarget: storeTarget.id,
                resource: producingBoost,
                amount: lab.store[producingBoost]
            };
        }
        return null;
    }

    getHubLabIds() {
        const hub = this.room.memory.labHub;
        if (!hub || hub.x === undefined) return new Set();
        const ids = new Set();
        for (const lab of this.room.labs) {
            if (lab.pos.x === hub.x && (lab.pos.y === hub.y || lab.pos.y === hub.y + 1)) ids.add(lab.id);
        }
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
                && s.store.getUsedCapacity(mem.itemNeeded) < LAB_HUB_INPUT_TARGET
                && this.room.store(mem.itemNeeded, true) > 0;
        });
        if (hubNeed.length) {
            const target = _.min(hubNeed, s => s.store.getUsedCapacity(labStructMem[s.id].itemNeeded));
            const resourceNeeded = labStructMem[target.id].itemNeeded;
            const labSources = labs.filter(s => {
                if (s.id === target.id) return false;
                const mem = labStructMem && labStructMem[s.id];
                return !mem || (mem.neededBoost !== resourceNeeded && mem.itemNeeded !== resourceNeeded);
            });
            const supplier = [storage, terminal, ...labSources, ...this.room.containers]
                .find(s => s && s.store && s.store.getUsedCapacity(resourceNeeded) > 0);
            if (supplier) {
                return {
                    withdrawTarget: supplier.id,
                    deliveryTarget: target.id,
                    resource: resourceNeeded,
                    amount: target.store.getCapacity(resourceNeeded) - target.store.getUsedCapacity(resourceNeeded)
                };
            }
        }

        const energySupplier = storage && storage.store[RESOURCE_ENERGY] > 0 ? storage
            : terminal && terminal.store[RESOURCE_ENERGY] > 0 ? terminal : null;
        if (energySupplier) {
            const outputLab = labs.find(s => {
                if (hubIds.has(s.id)) return false;
                const mem = labStructMem && labStructMem[s.id];
                if (mem && mem.itemNeeded) return false;
                if (mem && mem.paused && mem.neededBoost !== producingBoost) return false;
                if (mem && mem.neededBoost && mem.neededBoost !== producingBoost) return false;
                if (s.mineralType && s.mineralType !== producingBoost) return false;
                return s.store[RESOURCE_ENERGY] < LAB_REACTION_ENERGY;
            });
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

        return null;
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
        return Math.min(target - inFactory, available, creepFree, factory.store.getFreeCapacity());
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

    getTerminalRetainFloor(resource) {
        const keep = this.getKeepAmount(resource);
        if (!keep) return 0;
        return Math.max(keep + BALANCE_KEEP_HYSTERESIS, this.getSellOrderTerminalTarget(resource));
    }

    getStructureCapacity(structure) {
        if (!structure) return 0;
        if (structure.structureType === STRUCTURE_TERMINAL) return TERMINAL_CAPACITY;
        if (structure.structureType === STRUCTURE_STORAGE) return STORAGE_CAPACITY;
        return structure.store.getCapacity();
    }

    isStructureNearFull(structure) {
        if (!structure) return false;
        const cap = this.getStructureCapacity(structure);
        return cap > 0 && structure.store.getFreeCapacity() <= cap * (1 - STRUCTURE_MAX_FILL_RATIO);
    }

    isTerminalNearFull(terminal) {
        return this.isStructureNearFull(terminal);
    }

    isStorageNearFull(storage) {
        return this.isStructureNearFull(storage);
    }

    blocksTerminalInbound(terminal) {
        return this.isTerminalNearFull(terminal);
    }

    isStructureCongested(structure) {
        return this.isStructureNearFull(structure);
    }

    getStorageRetainTarget(resource) {
        const keep = this.getKeepAmount(resource);
        const feedTarget = this.getStorageFeedTarget(resource);
        return Math.max(keep, feedTarget, keep ? keep * 1.5 : 0);
    }

    getTerminalDrainSurplus(terminal, resource, emergency = false) {
        const amount = terminal.store[resource] || 0;
        if (!amount) return 0;
        if (emergency) {
            const keep = this.getKeepAmount(resource);
            return keep ? Math.max(0, amount - keep) : amount;
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
            // No local keep — terminal is export overflow; storage is the bulk target.
            return structure.store[resource] || 0;
        }
        return (structure.store[resource] || 0) - floor;
    }

    getTerminalShortfall(structure, resource) {
        const keep = this.getKeepAmount(resource);
        if (!keep) return 0;
        const sellTarget = this.getSellOrderTerminalTarget(resource);
        if (sellTarget) return 0;
        return keep - BALANCE_KEEP_HYSTERESIS - (structure.store[resource] || 0);
    }

    allowsBatteryStorageTerminalTransfer() {
        return true;
    }

    getTerminalBatteryTarget() {
        return Math.max(this.getKeepAmount(RESOURCE_BATTERY), BATTERY_TERMINAL_SOFT_CAP);
    }

    getStorageBatteryFloor() {
        return Math.max(FactoryControl.BATTERY_FEED_STOCK, this.getStorageFeedTarget(RESOURCE_BATTERY) || 0);
    }

    pickFactoryClogTarget(resource, storage, terminal) {
        if (storage && storage.store.getFreeCapacity() >= BALANCE_MIN_TRANSFER) return storage;
        if (this.blocksTerminalInbound(terminal)) return storage || null;
        if (resource !== RESOURCE_BATTERY) return terminal || storage;
        const terminalBats = terminal?.store[RESOURCE_BATTERY] || 0;
        const cap = Math.max(this.getKeepAmount(RESOURCE_BATTERY) * 2, BATTERY_TERMINAL_SOFT_CAP);
        if (terminal && terminal.store.getFreeCapacity(RESOURCE_BATTERY) > 0 && terminalBats < cap) return terminal;
        return storage || terminal;
    }

    getStorageFeedTarget(resource) {
        const factory = this.room.factory;
        if (factory && factory.memory.producing) {
            const commodity = COMMODITIES[factory.memory.producing];
            if (commodity && commodity.components[resource]) {
                return commodity.components[resource] * 10;
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

    makeBalanceTask(withdrawTarget, deliveryTarget, resource, amount) {
        if (!withdrawTarget || !deliveryTarget || amount < BALANCE_MIN_TRANSFER) return null;
        if (this.blocksLabProductionBalance(resource, withdrawTarget)) return null;
        const available = withdrawTarget.store[resource] || 0;
        const free = deliveryTarget.store.getFreeCapacity(resource);
        if (!available || free <= 0) return null;
        amount = Math.min(amount, available, free);
        if (amount < BALANCE_MIN_TRANSFER) return null;

        if (this.isStorageTerminalShuffle(withdrawTarget, deliveryTarget)) {
            const storage = this.room.storage;
            const terminal = this.room.terminal;
            const terminalToStorage = withdrawTarget.structureType === STRUCTURE_TERMINAL;
            // When terminal is near capacity, only drain terminal → storage.
            if (storage && terminal && !terminalToStorage && this.blocksTerminalInbound(terminal)) {
                return null;
            }
            // When both are tight, only relieve terminal → storage (never add to a full terminal).
            if (storage && terminal && this.isStructureCongested(storage) && this.isStructureCongested(terminal)
                && !terminalToStorage) {
                return null;
            }
            if (this.isBalanceDirectionBlocked(resource, terminalToStorage)) return null;
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
            if (this.isStructureCongested(storage)) continue;
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

        // Congestion relief: drain terminal toward storage, keeping export buffer.
        if ((this.isStructureCongested(terminal) || this.isTerminalNearFull(terminal))
            && terminalEnergy > TERMINAL_ENERGY_BUFFER + BALANCE_MIN_TRANSFER) {
            if (storageFree > BALANCE_MIN_TRANSFER) {
                const retain = this.isTerminalNearFull(terminal) ? TERMINAL_ENERGY_BUFFER : TERMINAL_ENERGY_LOW;
                return this.makeBalanceTask(terminal, storage, RESOURCE_ENERGY,
                    Math.min(terminalEnergy - retain, storageFree, ENERGY_TRANSFER_MAX));
            }
        }

        // Congestion relief: top up terminal export reserve from storage surplus.
        if (this.isStructureCongested(storage) && !this.blocksTerminalInbound(terminal)
            && storageEnergy > STORAGE_ENERGY_RESERVE + ENERGY_TRANSFER_MAX && terminalEnergy < TERMINAL_ENERGY_LOW) {
            if (terminalFree > BALANCE_MIN_TRANSFER) {
                return this.makeBalanceTask(storage, terminal, RESOURCE_ENERGY,
                    Math.min(storageEnergy - STORAGE_ENERGY_RESERVE, terminalFree,
                        TERMINAL_ENERGY_TARGET - terminalEnergy, ENERGY_TRANSFER_MAX));
            }
        }

        // Maintain terminal export reserve from storage — only after storage has met its reserve.
        if (!this.blocksTerminalInbound(terminal) && !this.isStructureCongested(storage)
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
        if (!this.allowsBatteryStorageTerminalTransfer()) return null;

        const terminalBats = terminal.store[RESOURCE_BATTERY] || 0;
        const storageBats = storage.store[RESOURCE_BATTERY] || 0;
        const terminalKeep = this.getKeepAmount(RESOURCE_BATTERY);
        const terminalTarget = this.getTerminalBatteryTarget();
        const storageFloor = this.getStorageBatteryFloor();
        const storageFree = storage.store.getFreeCapacity(RESOURCE_BATTERY);
        const terminalFree = terminal.store.getFreeCapacity(RESOURCE_BATTERY);

        // Top up terminal export reserve from storage surplus (storage stays primary).
        if (!this.blocksTerminalInbound(terminal) && !this.isStructureCongested(storage)
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
        if (this.isStructureCongested(terminal) && drainable >= BALANCE_MIN_TRANSFER
            && storageFree >= BALANCE_MIN_TRANSFER) {
            return this.makeBalanceTask(terminal, storage, RESOURCE_BATTERY,
                Math.min(drainable, storageFree, BATTERY_TRANSFER_MAX));
        }

        return null;
    }

    findSellOrderBalance(storage, terminal) {
        const terminalFree = terminal.store.getFreeCapacity();
        if (terminalFree < 1000 || this.blocksTerminalInbound(terminal)) return null;

        for (const id in Game.market.orders) {
            const order = Game.market.orders[id];
            if (order.roomName !== this.room.name || order.type !== ORDER_SELL) continue;
            const res = order.resourceType;
            if (res === RESOURCE_BATTERY && !this.allowsBatteryStorageTerminalTransfer()) continue;
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
        const terminalUrgent = this.isTerminalNearFull(terminal);
        const urgent = emergency || terminalUrgent;
        if (!urgent && storageFree < 1000) return null;
        if (urgent && storageFree < BALANCE_MIN_TRANSFER) return null;

        const resources = Object.keys(terminal.store)
            .filter(r => r !== RESOURCE_ENERGY)
            .sort((a, b) => (terminal.store[b] || 0) - (terminal.store[a] || 0));

        for (const resource of resources) {
            if (resource === RESOURCE_BATTERY && !this.allowsBatteryStorageTerminalTransfer()) continue;
            const excess = this.getTerminalDrainSurplus(terminal, resource, urgent);
            if (excess < BALANCE_MIN_TRANSFER) continue;
            const task = this.makeBalanceTask(terminal, storage, resource, Math.min(excess, 5000, storageFree));
            if (task) return task;
        }
        return null;
    }

    findStorageOverflowToTerminal(storage, terminal) {
        const terminalFree = terminal.store.getFreeCapacity();
        if (terminalFree < BALANCE_MIN_TRANSFER || this.blocksTerminalInbound(terminal)) return null;

        const storageCongested = this.isStorageNearFull(storage);
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
            // Storage full: ignore export ceiling so bulk piles (e.g. 440k UH) can enter the
            // terminal for pressure sends / fire sales. Keep only the local keep floor in storage.
            const retain = storageCongested
                ? (this.getKeepAmount(resource) || 0)
                : this.getStorageRetainTarget(resource);
            if (!storageCongested && !retain) continue;

            const excess = Math.max(0, inStorage - retain);
            if (excess < BALANCE_MIN_TRANSFER) continue;

            const inTerminal = terminal.store[resource] || 0;
            let maxToTerminal = terminalFree;
            if (!storageCongested) {
                const exportCeiling = this.getTerminalRetainFloor(resource) + TERMINAL_EXPORT_CEILING;
                if (inTerminal >= exportCeiling) continue;
                maxToTerminal = Math.min(maxToTerminal, exportCeiling - inTerminal);
            }

            const task = this.makeBalanceTask(storage, terminal, resource,
                Math.min(excess, 5000, maxToTerminal));
            if (task) return task;
        }
        return null;
    }

    findOverflowRelief(storage, terminal) {
        const terminalCongested = this.isStructureCongested(terminal) || this.isTerminalNearFull(terminal);
        const storageCongested = this.isStructureCongested(storage);
        if (!terminalCongested && !storageCongested) return null;

        // Both full: do NOT push terminal → storage (nowhere to go). Feed is useless too.
        // Leave stock in terminal for market/pressure evacuation; only try energy reshape.
        if (terminalCongested && storageCongested) {
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

        // Storage full / congested, terminal has space: push largest surplus into terminal for export.
        const fill = this.findStorageOverflowToTerminal(storage, terminal);
        if (fill) return fill;
        const batteryTask = this.findBatteryStorageBalance(storage, terminal);
        if (batteryTask) return batteryTask;
        return this.findEnergyStorageBalance(storage, terminal);
    }

    findDeficitStorageToTerminal(storage, terminal) {
        const terminalFree = terminal.store.getFreeCapacity();
        if (terminalFree < 1000 || this.blocksTerminalInbound(terminal) || this.isStructureCongested(storage)) return null;

        const candidates = [];
        for (const resource of Object.keys(storage.store)) {
            if (resource === RESOURCE_ENERGY) continue;
            if (resource === RESOURCE_BATTERY && !this.allowsBatteryStorageTerminalTransfer()) continue;
            const keep = this.getKeepAmount(resource);
            if (!keep) continue;
            const deficit = this.getTerminalShortfall(terminal, resource);
            if (deficit < BALANCE_MIN_TRANSFER || !(storage.store[resource] > 0)) continue;
            candidates.push({resource, deficit, priority: deficit / keep});
        }
        candidates.sort((a, b) => b.priority - a.priority);

        for (const {resource, deficit} of candidates) {
            const task = this.makeBalanceTask(storage, terminal, resource, Math.min(deficit, 5000, terminalFree));
            if (task) return task;
        }
        return null;
    }

    findBalancingTask(storage, terminal, congestionTrigger = Infinity) {
        if (!storage || !terminal) return null;

        const overflowTask = this.findOverflowRelief(storage, terminal);
        if (overflowTask) return overflowTask;

        const factoryTask = this.findFactoryStorageBalance(storage, terminal);
        if (factoryTask) return factoryTask;

        const terminalUrgent = this.isTerminalNearFull(terminal);
        const needsRoutineBalance = congestionTrigger >= Infinity
            || this.isStructureCongested(storage)
            || this.isStructureCongested(terminal)
            || terminalUrgent
            || (storage.store.getFreeCapacity() <= congestionTrigger
                && terminal.store.getFreeCapacity() <= congestionTrigger);

        // Drain export overflow before topping terminal for sells or keep targets.
        if (needsRoutineBalance || terminalUrgent) {
            const drainTask = this.findExcessTerminalToStorage(storage, terminal, terminalUrgent);
            if (drainTask) return drainTask;
        }

        const energyTask = this.findEnergyStorageBalance(storage, terminal);
        if (energyTask) return energyTask;

        const batteryTask = this.findBatteryStorageBalance(storage, terminal);
        if (batteryTask) return batteryTask;

        const sellTask = this.findSellOrderBalance(storage, terminal);
        if (sellTask) return sellTask;

        if (!needsRoutineBalance) return null;

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
                (lab.mineralType !== producingBoost || lab.store[lab.mineralType] > 500));
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
        const structMem = this.room.memory._structureMemory;
        const mem = structMem && structMem[lab.id];
        if (!mem) return null;
        // Boost reservation refill (mirrors PRIORITY 3 in findTask).
        if (mem.neededBoost && !excludeResources.has(mem.neededBoost)) {
            const res = mem.neededBoost;
            if (lab.store.getFreeCapacity(res) > 0 &&
                lab.store[res] < mem.amount &&
                source.store[res] > 0) {
                return {
                    withdrawTarget: source.id,
                    deliveryTarget: lab.id,
                    resource: res,
                    amount: Math.min(mem.amount - lab.store.getUsedCapacity(res), source.store[res])
                };
            }
        }
        // Reaction input refill (mirrors the itemNeeded path in findTask).
        if (mem.itemNeeded && !excludeResources.has(mem.itemNeeded)) {
            const res = mem.itemNeeded;
            if (lab.store.getUsedCapacity(res) < LAB_HUB_INPUT_TARGET && source.store[res] > 0) {
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

        const labStructMem = this.room.memory._structureMemory;
        const deliveryTarget = this.room.labs.find(s => {
                const mem = labStructMem && labStructMem[s.id];
                return mem && mem.neededBoost === resource && s.store.getUsedCapacity(resource) < mem.amount;
            })
            || [this.room.storage, this.room.terminal].find(s => s && s.store.getFreeCapacity() >= BALANCE_MIN_TRANSFER
                && !(s.structureType === STRUCTURE_TERMINAL && this.blocksTerminalInbound(s)))
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
