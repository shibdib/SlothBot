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
        if (this.housekeeping()) return;
        this.jobManager();
    }

    housekeeping() {
        this.creep.say(ICONS.reaction, true);
    }

    jobManager() {
        // Deliver
        if (_.sum(this.creep.store)) return this.deliverResource();
        // Get resource
        if (this.creep.memory.resourceNeeded) return this.getResource();
        // Deliver Boosts
        if (this.boostDelivery()) return;
        if (this.labEnergy()) return;
        // Empty labs with wrong materials
        if (this.cleanLab()) return;
        // Empty mineral harvester container
        if (this.mineralHauler()) return;
        // Handle dropped goodies
        if (this.droppedResources()) return;
        // Empty factories
        if (this.emptyFactory()) return;
        // Power Manager
        if (this.powerManager()) return;
        // Get factory orders
        if (this.factorySupplies()) return;
        // Handle terminal goods
        if (this.terminalControl()) return;
        // Handle storage goods
        if (this.storageControl()) return;
        // Check nuker for ghodium
        if (this.nukeSupplies()) return;
        // Get lab orders
        if (this.labSupplies()) return;
        // Empty labs
        if (this.emptyLab()) return;
        this.creep.idleFor(20);
    }

    getResource() {
        let storageSite;

        // Determine the storage site based on available resources
        if (!this.creep.memory.storageSite) {
            // If withdrawal source is already defined in memory
            if (this.creep.memory.withdrawFrom) {
                const withdrawFrom = Game.getObjectById(this.creep.memory.withdrawFrom);
                if (!withdrawFrom || !withdrawFrom.store[this.creep.memory.resourceNeeded]) {
                    this.creep.memory.withdrawFrom = undefined;  // Clear memory if resource is not available
                } else {
                    storageSite = withdrawFrom;
                }
            }

            // Check terminal, storage, factory, containers, and labs in order
            else if (this.room.terminal && this.room.terminal.store[this.creep.memory.resourceNeeded]) {
                storageSite = this.room.terminal;
            } else if (this.room.storage && this.room.storage.store[this.creep.memory.resourceNeeded]) {
                storageSite = this.room.storage;
            } else if (this.room.factory && this.room.factory.store[this.creep.memory.resourceNeeded] && this.creep.memory.deliverTo !== this.room.factory.id) {
                storageSite = this.room.factory;
            } else if (_.find(this.room.structures, (s) =>
                s.structureType === STRUCTURE_CONTAINER && s.store[this.creep.memory.resourceNeeded] && this.creep.memory.resourceNeeded !== RESOURCE_ENERGY)) {
                storageSite = _.find(this.room.structures, (s) =>
                    s.structureType === STRUCTURE_CONTAINER && s.store[this.creep.memory.resourceNeeded] && this.creep.memory.resourceNeeded !== RESOURCE_ENERGY);
            } else if (_.find(this.room.impassibleStructures, (s) =>
                s.structureType === STRUCTURE_LAB && s.mineralType === this.creep.memory.resourceNeeded &&
                s.mineralType !== s.memory.itemNeeded && s.mineralType !== s.memory.neededBoost)) {
                storageSite = _.max(_.filter(this.room.impassibleStructures, (s) =>
                    s.structureType === STRUCTURE_LAB && s.mineralType === this.creep.memory.resourceNeeded &&
                    s.mineralType !== s.memory.itemNeeded && s.mineralType !== s.memory.neededBoost), function (s) {
                    return s.store.getUsedCapacity()
                });
            }
        } else {
            // If storage site is already set in memory
            storageSite = Game.getObjectById(this.creep.memory.storageSite);
        }

        this.creep.say(this.creep.memory.resourceNeeded, true);  // Indicate which resource is needed

        let amount = this.creep.memory.amountNeeded || undefined;

        // Determine the amount to withdraw
        if (this.creep.memory.deliverTo) {
            const deliverTo = Game.getObjectById(this.creep.memory.deliverTo);
            if (deliverTo.amount) {
                amount = deliverTo.amount;
            }
        }
        if (amount > this.creep.store.getFreeCapacity()) {
            amount = this.creep.store.getFreeCapacity();  // Adjust if the creep doesn't have enough space
        }
        if (storageSite && amount > storageSite.store[this.creep.memory.resourceNeeded]) {
            amount = storageSite.store[this.creep.memory.resourceNeeded];  // Limit withdrawal to what's available
        }

        // If there's a valid storage site and resource, perform the withdrawal
        if (storageSite && storageSite.store[this.creep.memory.resourceNeeded]) {
            this.creep.memory.storageSite = storageSite.id;
            const result = this.creep.withdraw(storageSite, this.creep.memory.resourceNeeded, amount);
            if (result === OK) {
                // Clear memory after successful withdrawal
                this.creep.memory.resourceNeeded = undefined;
                this.creep.memory.amountNeeded = undefined;
                this.creep.memory.empty = undefined;
                this.creep.memory.withdrawFrom = undefined;
                this.creep.memory.storageSite = undefined;
                return true;
            } else if (result === ERR_NOT_IN_RANGE) {
                this.creep.shibMove(storageSite);  // Move to storage site if not in range
                return true;
            }
        } else {
            // Clear memory if no valid storage site is found
            this.creep.memory.storageSite = undefined;
            this.creep.memory.resourceNeeded = undefined;
            this.creep.memory.amountNeeded = undefined;
        }

        return false;
    }

    deliverResource() {
        if (!_.sum(this.creep.store)) return false;  // If the creep has no resources to deliver, return false

        const terminal = this.room.terminal || this.room.storage;
        let storeTarget;

        // If no specific delivery target or resource is set, determine where to deliver based on various conditions
        if (!this.creep.memory.storeTarget || !this.creep.memory.deliveryResource) {
            for (let resourceType in this.creep.store) {
                // Default store target to terminal
                storeTarget = this.room.terminal;

                // Find a nuke with free GHODIUM capacity
                const nuke = _.find(this.room.impassibleStructures, (s) => s.structureType === STRUCTURE_NUKER && s.store.getFreeCapacity(RESOURCE_GHODIUM));

                // Find a lab that requires a specific resource
                const lab = _.find(this.room.impassibleStructures, (s) => s.structureType === STRUCTURE_LAB &&
                    (!s.mineralType || s.mineralType === resourceType) &&
                    (s.memory.neededBoost === resourceType || s.memory.itemNeeded === resourceType) &&
                    s.store.getFreeCapacity(s.memory.itemNeeded));

                // If a delivery target is explicitly set in memory, prioritize it
                if (this.creep.memory.deliverTo) {
                    storeTarget = Game.getObjectById(this.creep.memory.deliverTo);
                }
                // Check if factory needs the resource
                else if (this.room.factory && this.room.factory.memory.producing && COMMODITIES[this.room.factory.memory.producing].components[resourceType]) {
                    storeTarget = this.room.factory;
                }
                // Prioritize lab or nuke if they need resources
                else if (lab) {
                    storeTarget = lab;
                } else if (nuke && this.creep.store[RESOURCE_GHODIUM]) {
                    storeTarget = nuke;
                } // Check if both terminal and storage are near full capacity
                else if ((this.room.terminal && _.sum(this.room.terminal.store) >= 0.98 * this.room.terminal.store.getCapacity()) &&
                    (this.room.storage && (_.sum(this.room.storage.store) >= 0.98 * this.room.storage.store.getCapacity()))) {
                    storeTarget = 'drop';  // Discard resources if both are full
                } else if (this.room.terminal && _.sum(this.room.terminal.store) >= 0.90 * this.room.terminal.store.getCapacity()) storeTarget = this.room.storage;
                else if (resourceType === RESOURCE_POWER) storeTarget = terminal;
                else if (resourceType === RESOURCE_ENERGY && terminal.store[resourceType] < TERMINAL_ENERGY_BUFFER) storeTarget = terminal;
                else if (resourceType === RESOURCE_ENERGY && !this.room.energyState) storeTarget = this.room.storage;
                else if (resourceType === RESOURCE_ENERGY) storeTarget = terminal;
                else if (BASE_MINERALS.includes(resourceType) && this.room.storage.store[resourceType] < REACTION_AMOUNT) storeTarget = this.room.storage;
                else if (COMPRESSED_COMMODITIES.includes(resourceType) && terminal.store[resourceType] >= 10000) storeTarget = this.room.storage;
                else if (ALL_COMMODITIES.includes(resourceType)) storeTarget = terminal;
                else if (LAB_PRIORITY.includes(resourceType) && this.room.storage.store[resourceType] < BOOST_AMOUNT(terminal.room) * 2) storeTarget = this.room.storage;
                else if (ALL_BOOSTS.includes(resourceType) && this.room.storage.store[resourceType] < BOOST_AMOUNT(terminal.room)) storeTarget = this.room.storage;
                else if (ALL_BOOSTS.includes(resourceType)) storeTarget = terminal;
                else if (!BASE_MINERALS.includes(resourceType) && !ALL_COMMODITIES.includes(resourceType) && this.room.storage.store[resourceType] < REACTION_AMOUNT) storeTarget = this.room.storage;

                // Handle resource drop if storage is full
                if (storeTarget === 'drop') {
                    this.creep.say('DISCARD', true);
                    for (let resourceType in this.creep.store) {
                        this.creep.drop(resourceType);  // Drop resources if no valid storage target
                    }
                    return;
                }

                // Set memory for store target and delivery resource
                if (storeTarget) {
                    this.creep.memory.storeTarget = storeTarget.id;
                    this.creep.memory.deliveryResource = resourceType;
                    break;
                }
            }
        }
        // If store target and resource are already set, transfer the resource
        else if (this.creep.memory.storeTarget && this.creep.memory.deliveryResource) {
            this.creep.say('DELIVER', true);
            let storeTarget = Game.getObjectById(this.creep.memory.storeTarget);

            switch (this.creep.transfer(storeTarget, this.creep.memory.deliveryResource)) {
                case OK:
                    // Clear memory after successful transfer
                    this.creep.memory.resourceNeeded = undefined;
                    this.creep.memory.deliverTo = undefined;
                    this.creep.memory.storeTarget = undefined;
                    this.creep.memory.deliveryResource = undefined;
                    return true;
                case ERR_NOT_IN_RANGE:
                    // Move creep to the store target if not in range
                    this.creep.shibMove(storeTarget);
                    return;
                default:
                    // If transfer fails, clear memory and drop the resource
                    this.creep.memory.resourceNeeded = undefined;
                    this.creep.memory.deliverTo = undefined;
                    this.creep.memory.storeTarget = undefined;
                    this.creep.memory.deliveryResource = undefined;
                    this.creep.drop(this.creep.memory.deliveryResource);
                    return true;
            }
        }
    }

    boostDelivery() {
        let lab = _.find(this.room.impassibleStructures, (s) => s.structureType === STRUCTURE_LAB && s.memory.neededBoost && s.store[s.memory.neededBoost] < s.memory.amount);
        if (lab) {
            if (this.room.store(lab.memory.neededBoost)) {
                if (lab.mineralType && lab.mineralType !== lab.memory.neededBoost) {
                    this.creep.memory.resourceNeeded = lab.mineralType;
                    this.creep.memory.withdrawFrom = lab.id;
                } else {
                    this.creep.memory.resourceNeeded = lab.memory.neededBoost;
                    this.creep.memory.amountNeeded = lab.memory.amount;
                    this.creep.memory.deliverTo = lab.id;
                }
                return true;
            } else {
                delete lab.memory;
            }
        }
    }

    labEnergy() {
        let lab = _.find(this.room.impassibleStructures, (s) => s.structureType === STRUCTURE_LAB && s.store.getFreeCapacity(RESOURCE_ENERGY));
        if (lab) {
            this.creep.memory.resourceNeeded = RESOURCE_ENERGY;
            this.creep.memory.amountNeeded = lab.store.getFreeCapacity(RESOURCE_ENERGY);
            this.creep.memory.deliverTo = lab.id;
            return true;
        }
    }

    droppedResources() {
        // Check if terminal and storage are near capacity
        if ((this.room.terminal && _.sum(this.room.terminal.store) >= 0.98 * this.room.terminal.store.getCapacity()) &&
            (this.room.storage && (_.sum(this.room.storage.store) >= 0.98 * this.room.storage.store.getCapacity()))) {
            return false;
        }

        // Find the first resource source: tombstone, ruin, or dropped resource
        let resource = this.room.find(FIND_TOMBSTONES, {filter: (r) => _.sum(r.store) > 0})[0] ||
            this.room.find(FIND_RUINS, {filter: (r) => _.sum(r.store) > 0})[0] ||
            this.room.find(FIND_DROPPED_RESOURCES)[0];

        if (resource) {
            // Handle resource transfer to storage if the creep is carrying anything
            if (_.sum(this.creep.store) > 0) {
                for (let resourceType in this.creep.store) {
                    switch (this.creep.transfer(this.room.storage, resourceType)) {
                        case OK:
                            return false;
                        case ERR_NOT_IN_RANGE:
                            this.creep.shibMove(this.room.storage);
                            return true;
                    }
                }
            }
            // Otherwise, handle resource withdrawal from the resource (tombstone, ruin, or dropped)
            else {
                let actionResult = ERR_NOT_IN_RANGE;
                if (resource.store) { // If it's a tombstone or ruin
                    for (let resourceType in resource.store) {
                        actionResult = this.creep.withdraw(resource, resourceType);
                        if (actionResult === OK) return true;
                        if (actionResult === ERR_NOT_IN_RANGE) {
                            this.creep.shibMove(resource);
                            return true;
                        }
                    }
                } else { // It's a dropped resource
                    actionResult = this.creep.pickup(resource);
                    if (actionResult === OK) return true;
                    if (actionResult === ERR_NOT_IN_RANGE) {
                        this.creep.shibMove(resource);
                        return true;
                    }
                }
            }
        }

        return false;
    }

    emptyFactory() {
        if ((this.room.terminal && _.sum(this.room.terminal.store) >= 0.98 * this.room.terminal.store.getCapacity()) &&
            (this.room.storage && (_.sum(this.room.storage.store) >= 0.98 * this.room.storage.store.getCapacity()))) {
            return false;
        }

        if (!this.room.factory) return false;

        const factory = this.room.factory;

        // If the factory is producing and has stored resources
        if (factory.memory.producing && factory.store.getUsedCapacity()) {
            for (let resource of Object.keys(factory.store)) {
                // Check if the resource is not part of the components needed for production
                if (!COMMODITIES[factory.memory.producing].components[resource]) {
                    this.creep.memory.resourceNeeded = resource;
                    this.creep.memory.withdrawFrom = factory.id;
                    this.creep.memory.empty = true;
                    return true;
                }
            }
        }

        // If the factory is not producing but has stored resources
        if (!factory.memory.producing && Object.keys(factory.store).length > 0) {
            this.creep.memory.resourceNeeded = Object.keys(factory.store)[0];
            this.creep.memory.withdrawFrom = factory.id;
            this.creep.memory.empty = true;
            return true;
        }
    }

    terminalControl() {
        if (!this.room.terminal) return false;
        const terminal = this.room.terminal;
        const storage = this.room.storage;

        // Handle a super full terminal
        if (_.sum(terminal.store) >= terminal.store.getCapacity() * 0.95) {
            // Identify the resource with the highest amount in the terminal
            this.creep.memory.resourceNeeded = Object.keys(terminal.store)
                .sort((a, b) => terminal.store[a] - terminal.store[b])
                .pop();
            this.creep.memory.storageSite = terminal.id;
            return true;
        }

        // Handle moving resources to storage if storage is not full
        if (_.sum(storage.store) < storage.store.getCapacity()) {
            // Sort resources by amount in the terminal
            const resources = Object.keys(terminal.store).sort((a, b) => terminal.store[a] - terminal.store[b]);

            for (const resourceType of resources) {
                let amountNeeded = 0;

                // Calculate the amount needed based on resource type and conditions
                if (_.sum(terminal.store) >= terminal.store.getCapacity() * 0.97) {
                    amountNeeded = this.creep.store.getFreeCapacity(resourceType); // Move resources to free up space
                } else if (_.includes(BASE_MINERALS, resourceType) && (storage.store[resourceType] || 0) < REACTION_AMOUNT) {
                    amountNeeded = REACTION_AMOUNT - (storage.store[resourceType] || 0);
                } else if (_.includes(ALL_BOOSTS, resourceType) && (storage.store[resourceType] || 0) < BOOST_AMOUNT(terminal.room)) {
                    amountNeeded = BOOST_AMOUNT(terminal.room) - (storage.store[resourceType] || 0);
                } else if (resourceType === RESOURCE_ENERGY &&
                    terminal.store[resourceType] > TERMINAL_ENERGY_BUFFER * 5 &&
                    !this.room.energyState) {
                    amountNeeded = terminal.store[resourceType] - TERMINAL_ENERGY_BUFFER;
                } else if (_.includes(COMPRESSED_COMMODITIES, resourceType) && terminal.store[resourceType] >= 10000) {
                    amountNeeded = terminal.store[resourceType] - 10000;
                }

                // Adjust amount based on creep's capacity and terminal availability
                amountNeeded = Math.min(amountNeeded, this.creep.store.getFreeCapacity(resourceType), terminal.store[resourceType]);

                // Execute transfer if the amount needed is significant
                if (amountNeeded >= 10) {
                    this.creep.memory.resourceNeeded = resourceType;
                    this.creep.memory.storageSite = terminal.id;
                    this.creep.memory.amountNeeded = amountNeeded;
                    return true;
                }
            }
        }

        return false; // No action needed
    }

    powerManager() {
        const powerSpawn = this.room.impassibleStructures.find((s) => s.structureType === STRUCTURE_POWER_SPAWN);
        if (!powerSpawn || !this.room.energyState) return false;
        if (powerSpawn.store.getFreeCapacity(RESOURCE_ENERGY) > POWER_SPAWN_ENERGY_CAPACITY * 0.5) {
            this.creep.memory.resourceNeeded = RESOURCE_ENERGY;
            this.creep.memory.amountNeeded = powerSpawn.store.getFreeCapacity(RESOURCE_ENERGY);
            this.creep.memory.deliverTo = powerSpawn.id;
            return true;
        } else if (this.room.store(RESOURCE_POWER) && powerSpawn.store.getFreeCapacity(RESOURCE_POWER)) {
            this.creep.memory.resourceNeeded = RESOURCE_POWER;
            this.creep.memory.amountNeeded = powerSpawn.store.getFreeCapacity(RESOURCE_POWER);
            this.creep.memory.deliverTo = powerSpawn.id;
            return true;
        }
    }

    mineralHauler() {
        // Find a container with resources besides energy
        const container = _.find(this.room.structures, (s) =>
            s.structureType === STRUCTURE_CONTAINER && _.sum(s.store) > s.store[RESOURCE_ENERGY]
        );

        if (container) {
            // Assign the first available resource in the container to the creep's memory
            const resourceType = Object.keys(container.store).find(r => container.store.getUsedCapacity(r) >= container.store.getCapacity() * 0.25 ||
                !this.room.mineral.mineralAmount || (r !== RESOURCE_ENERGY && !container.pos.isNearTo(this.room.mineral)));
            if (resourceType) {
                this.creep.memory.resourceNeeded = resourceType;
                this.creep.memory.withdrawFrom = container.id;
                return true;
            }
        }

        return false;
    }

    nukeSupplies() {
        // Find a nuker with available capacity for GHODIUM
        const nuke = this.room.impassibleStructures.find((s) =>
            s.structureType === STRUCTURE_NUKER &&
            s.store.getFreeCapacity(RESOURCE_GHODIUM) > 0
        );

        // Check if GHODIUM is available in storage or terminal
        if (nuke && (this.room.storage.store[RESOURCE_GHODIUM] || this.room.terminal.store[RESOURCE_GHODIUM])) {
            this.creep.memory.resourceNeeded = RESOURCE_GHODIUM;
            return true;
        }

        return false;
    }

    factorySupplies() {
        // Find a factory that is currently producing
        const needyFactory = this.room.impassibleStructures.find((s) =>
            s.structureType === STRUCTURE_FACTORY &&
            s.memory.producing
        );

        if (needyFactory) {
            // Get the components required for the current production
            const requiredComponents = COMMODITIES[needyFactory.memory.producing].components;

            for (const neededResource in requiredComponents) {
                const requiredAmount = requiredComponents[neededResource];
                const currentAmount = needyFactory.store[neededResource] || 0;

                // Check if more of the resource is needed and it exists in room storage/terminal
                if (currentAmount < requiredAmount && this.room.store(neededResource)) {
                    this.creep.memory.resourceNeeded = neededResource;
                    this.creep.memory.deliverTo = needyFactory.id;
                    return true;
                }
            }
        }

        return false;
    }

    labSupplies() {
        // Find a lab that needs a specific resource
        const needyLab = _.min(_.filter(this.room.impassibleStructures, (s) =>
            s.structureType === STRUCTURE_LAB &&
            s.memory.itemNeeded &&
            (!s.mineralType || s.mineralType === s.memory.itemNeeded) &&
            s.store.getUsedCapacity(s.memory.itemNeeded) < LAB_MINERAL_CAPACITY * 0.8 &&
            this.room.store(s.memory.itemNeeded, true)
        ), function (l) {
            return l.store.getUsedCapacity(l.memory.itemNeeded)
        });

        if (needyLab && needyLab.id) {
            // Assign the resource and delivery target to the creep's memory
            this.creep.memory.resourceNeeded = needyLab.memory.itemNeeded;
            this.creep.memory.deliverTo = needyLab.id;
            return true;
        }

        return false;
    }

    cleanLab() {
        // Check if both terminal and storage are near full capacity
        if ((this.room.terminal && _.sum(this.room.terminal.store) >= 0.98 * this.room.terminal.store.getCapacity()) &&
            (this.room.storage && (_.sum(this.room.storage.store) >= 0.98 * this.room.storage.store.getCapacity()))) {
            return false;
        }

        // Find a lab with a mineral that doesn't match its required or boost type
        const stockedLab = _.find(this.room.impassibleStructures, (s) =>
            s.structureType === STRUCTURE_LAB &&
            s.mineralType &&
            s.mineralType !== s.memory.itemNeeded &&
            s.mineralType !== s.memory.neededBoost &&
            s.mineralType !== s.room.memory.producingBoost
        );

        if (stockedLab) {
            // Assign the mineral type and lab ID to the creep's memory
            this.creep.memory.resourceNeeded = stockedLab.mineralType;
            this.creep.memory.withdrawFrom = stockedLab.id;
            return true;
        }

        return false;
    }

    emptyLab() {
        // Check if both terminal and storage are near full capacity
        if ((this.room.terminal && _.sum(this.room.terminal.store) >= 0.98 * this.room.terminal.store.getCapacity()) &&
            (this.room.storage && (_.sum(this.room.storage.store) >= 0.98 * this.room.storage.store.getCapacity()))) {
            return false;
        }

        // Find a lab with a mineral that doesn't match its required or boost type
        const stockedLab = _.find(this.room.impassibleStructures, (s) =>
            s.structureType === STRUCTURE_LAB &&
            s.mineralType &&
            s.mineralType !== s.memory.itemNeeded &&
            s.mineralType !== s.memory.neededBoost
        );

        if (stockedLab) {
            // Assign the mineral type and lab ID to the creep's memory
            this.creep.memory.resourceNeeded = stockedLab.mineralType;
            this.creep.memory.withdrawFrom = stockedLab.id;
            return true;
        }

        return false;
    }

    storageControl() {
        const {storage, terminal} = this.room;

        // If no storage return
        if (!storage) return false;

        // Check if the terminal has capacity to receive resources
        if (terminal && _.sum(terminal.store) >= terminal.store.getCapacity() * 0.9) return false;

        // Sort resources in storage by their quantities in descending order
        const resources = Object.keys(storage.store).sort((a, b) => storage.store[b] - storage.store[a]);

        for (const resourceType of resources) {
            let amountNeeded = 0;

            // Determine the amount needed for transfer
            if (_.includes(BASE_MINERALS, resourceType) && storage.store[resourceType] > REACTION_AMOUNT) {
                amountNeeded = storage.store[resourceType] - REACTION_AMOUNT;
            } else if (_.includes(ALL_BOOSTS, resourceType) && storage.store[resourceType] > BOOST_AMOUNT(terminal.room)) {
                amountNeeded = storage.store[resourceType] - BOOST_AMOUNT(terminal.room);
            } else if (resourceType === RESOURCE_ENERGY) {
                if (terminal.store[resourceType] < TERMINAL_ENERGY_BUFFER) {
                    amountNeeded = TERMINAL_ENERGY_BUFFER - terminal.store[resourceType];
                } else if (this.room.energyState && terminal.store[resourceType] < TERMINAL_ENERGY_BUFFER * 10) {
                    amountNeeded = storage.store[resourceType];
                }
            } else if (_.includes(COMPRESSED_COMMODITIES, resourceType) && terminal.store[resourceType] < 10000) {
                amountNeeded = 10000 - terminal.store[resourceType];
            } else if (resourceType === RESOURCE_POWER) {
                amountNeeded = Math.min(20000, storage.store[resourceType]);
            } else if (!_.includes(_.union(BASE_MINERALS, ALL_BOOSTS, [RESOURCE_ENERGY], COMPRESSED_COMMODITIES), resourceType)) {
                amountNeeded = storage.store[resourceType];
            }

            // Final adjustments to the transfer amount
            amountNeeded = Math.min(amountNeeded, this.creep.store.getFreeCapacity(resourceType), storage.store[resourceType]);

            if (amountNeeded >= 10) {
                // Assign task details to creep memory
                this.creep.memory.resourceNeeded = resourceType;
                this.creep.memory.storageSite = storage.id;
                this.creep.memory.amountNeeded = amountNeeded;
                this.creep.memory.storeTarget = terminal.id;
                this.creep.memory.deliveryResource = resourceType;
                return true;
            }
        }

        return false;
    }
}

profiler.registerClass(RoleLabTech, 'LabTech');
module.exports = RoleLabTech;
