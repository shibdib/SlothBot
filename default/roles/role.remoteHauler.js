/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleRemoteHauler {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.store = creep.store; // Cache store reference
        this.memory = creep.memory; // Cache memory reference
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        if (this.store.getUsedCapacity() > 0) {
            this.deliverResource();
        } else if (this.memory.operation) {
            this.specialDuty();
        } else {
            this.findResource();
        }
    }

    housekeeping() {
        if ((this.room.memory.sk || (INTEL[this.room.name] && INTEL[this.room.name].sk)) && this.creep.skSafety()) return true;
        if (Game.time % 50 === 0 && safemodeGeneration(this.creep)) return true;
        if (!this.memory.exitLinkCheck && this.store.getUsedCapacity() > 0 && this.room.name === this.memory.colony) this.exitLinkCheck();
        this.creep.say(ICONS.haul2, true);
        return false;
    }

    deliverResource() {
        const storeSum = this.store.getUsedCapacity();
        if (!storeSum) {
            this.memory.storageDestination = undefined;
            return;
        }

        // Early check for non-energy resources in container
        if (storeSum > this.store[RESOURCE_ENERGY] && this.memory.storageDestination) {
            const dest = Game.getObjectById(this.memory.storageDestination);
            if (dest instanceof StructureContainer) {
                this.memory.storageDestination = undefined;
            }
        }

        this.memory.energyDestination = undefined;
        if (Game.time % 2 === 0) {
            this.creep.opportunisticRepair();
            this.creep.opportunisticFill();
        }

        const storageId = this.memory.storageDestination;
        if (storageId) {
            this.creep.haulerDelivery()
        } else {
            dropOff(this.creep);
        }
    }

    findResource() {
        if (this.memory.energyDestination) {
            return this.creep.withdrawResource();
        }

        let harvester = Game.getObjectById(this.memory.other.harvester);
        if (!harvester) {
            // Try finding harvester in current room first (efficient)
            harvester = _.find(this.room.myCreeps,
                c => c.memory.role === 'remoteHarvester' &&
                    c.memory.other.source === this.memory.other.source
            );
            // If not in room, do global search (expensive)
            if (!harvester) {
                harvester = _.find(Game.creeps,
                    c => c.my &&
                        c.memory.role === 'remoteHarvester' &&
                        c.memory.other.source === this.memory.other.source
                );
            }

            if (harvester) {
                if (harvester.memory.containerID) this.memory.containerID = harvester.memory.containerID;
                this.memory.other.harvester = harvester.id;
            } else {
                this.memory.other.harvester = undefined;
                if (!this.memory.other.harvestSearch) this.memory.other.harvestSearch = 1; else this.memory.other.harvestSearch++;
                if (this.memory.other.harvestSearch > 15) return this.creep.recycleCreep();
            }
        } else if (harvester) {
            if (Game.time % 3 === 0 && this.randomLoot()) return true;
            this.memory.other.source = harvester.memory.other.source;
            if (harvester.memory.energyId) {
                this.memory.energyDestination = harvester.memory.energyId;
                return true;
            }
            const source = Game.getObjectById(this.memory.other.source);
            if (source && this.creep.shibMove(source, {range: 3})) return true;
        }

        const container = Game.getObjectById(this.memory.containerID);
        if (container && container.store[RESOURCE_ENERGY] > 0) {
            this.memory.energyDestination = container.id;
            return true;
        }

        this.creep.idleFor(5);
        return false;
    }

    specialDuty() {
        if (this.memory.destination !== this.room.name) {
            return this.creep.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 23});
        }
        this.findResource();
        return this.memory.energyDestination && this.creep.withdrawResource();
    }

    randomLoot() {
        if (this.room.name === this.memory.colony) return false;

        // Use cached prototype properties
        const droppedLoot = this.room.droppedResources;
        const droppedEnergy = this.room.droppedEnergy;
        
        if (droppedLoot.length) {
            this.memory.energyDestination = droppedLoot[0].id;
            return true;
        }
        if (droppedEnergy.length && droppedEnergy[0].amount > 100) {
            this.memory.energyDestination = droppedEnergy[0].id;
            return true;
        }

        const containers = this.room.structures.filter(s => s.structureType === STRUCTURE_CONTAINER);
        const container = containers.find(
            s => s.store.getUsedCapacity() > s.store[RESOURCE_ENERGY]
        );
        if (container) {
            this.memory.energyDestination = container.id;
            return true;
        }
        return false;
    }

    exitLinkCheck() {
        this.memory.exitLinkCheck = true;
        const link = this.room.structures.find(s => s.structureType === STRUCTURE_LINK && ![s.room.memory.hubLink, s.room.memory.controllerLink].includes(s.id) &&
            s.pos.getRangeTo(this.creep) <= 9 && (!s.room.storage || s.pos.getRangeTo(this.creep) < s.room.storage.pos.getRangeTo(this.creep)));
        if (link) this.memory.exitLink = link.id;
    }
}

function dropOff(creep) {
    const memory = creep.memory;
    const storeSum = creep.store.getUsedCapacity();
    if (memory.resourceDelivery) {
        if (memory.resourceDelivery !== creep.room.name) {
            creep.shibMove(new RoomPosition(25, 25, memory.resourceDelivery), {range: 18});
        } else if (creep.room.terminal) {
            memory.storageDestination = creep.room.terminal.id;
        } else if (creep.room.storage) {
            memory.storageDestination = creep.room.storage.id;
        }
        return;
    }

    if (creep.memory.exitLink) {
        const link = Game.getObjectById(creep.memory.exitLink);
        if (link && link.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            return memory.storageDestination = creep.memory.exitLink;
        } else if (!link) {
            memory.exitLink = undefined;
        }
    }

    const colony = Game.rooms[memory.colony];
    if (!colony) return;

    // Check for protoStorage
    if (colony.memory.protoStorage) colony.protoStorage = Game.getObjectById(colony.memory.protoStorage);

    if (storeSum > creep.store[RESOURCE_ENERGY]) {
        if (colony.terminal) memory.storageDestination = colony.terminal.id;
        else if (colony.storage) memory.storageDestination = colony.storage.id;
        else memory.resourceDelivery = findClosestOwnedRoom(creep.room.name, false, 4);
        return;
    }

    // Use a cached target if valid
    if (memory.storageDestination) {
        const dest = Game.getObjectById(memory.storageDestination);
        if (dest && dest.store.getFreeCapacity(RESOURCE_ENERGY) > 0) return;
        memory.storageDestination = undefined;
    }

    // Only search for new target occasionally or if we don't have one
    if (memory.storageDestination) return;

    const controllerContainer = Game.getObjectById(colony.memory.controllerContainer);

    // Efficiently find towers needing energy
    const lowTower = colony.structures.find(
        s => s.structureType === STRUCTURE_TOWER &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > TOWER_CAPACITY * 0.4
    );

    if (lowTower) {
        memory.storageDestination = lowTower.id;
    } else if (!colony.terminal && !colony.memory.hubLink && controllerContainer && controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
        Math.random() > controllerContainer.store[RESOURCE_ENERGY] / CONTAINER_CAPACITY) {
        memory.storageDestination = controllerContainer.id;
    } else if (colony.energyState && controllerContainer && controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) &&
        Math.random() + 0.1 > controllerContainer.store[RESOURCE_ENERGY] / CONTAINER_CAPACITY) {
        memory.storageDestination = controllerContainer.id;
    } else if (colony.energyState && colony.nuker &&
        colony.nuker.store.getFreeCapacity(RESOURCE_ENERGY)) {
        memory.storageDestination = colony.nuker.id;
    } else if (colony.storage && !colony.energyState &&
        colony.storage.store.getFreeCapacity(RESOURCE_ENERGY) > storeSum) {
        memory.storageDestination = colony.storage.id;
    } else if (colony.terminal && colony.terminal.store.getFreeCapacity(RESOURCE_ENERGY) > TERMINAL_CAPACITY * 0.1 &&
        colony.terminal.store.getFreeCapacity(RESOURCE_ENERGY) > storeSum) {
        memory.storageDestination = colony.terminal.id;
    } else if (colony.storage && colony.storage.store.getFreeCapacity(RESOURCE_ENERGY) > storeSum) {
        memory.storageDestination = colony.storage.id;
    } else if (colony.level === colony.controller.level && controllerContainer && controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
        Math.random() < (controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) / CONTAINER_CAPACITY)) {
        memory.storageDestination = controllerContainer.id;
    } else if (colony.protoStorage && colony.protoStorage.store.getFreeCapacity(RESOURCE_ENERGY) > storeSum) {
        memory.storageDestination = colony.protoStorage.id;
    } else if (creep.haulerDelivery()) {
    } else if (creep.pos.getRangeTo(colony.controller) <= 5) creep.idleFor(5);
    else creep.shibMove(colony.controller);
}

function safemodeGeneration(creep) {
    const memory = creep.memory;
    if (memory.safemodeCheck || creep.room.name !== memory.colony) return false;
    memory.safemodeCheck = true;

    if (creep.store.getFreeCapacity() < SAFE_MODE_COST ||
        creep.room.store(RESOURCE_GHODIUM) < SAFE_MODE_COST ||
        creep.room.controller.safeModeAvailable >= 2) {
        return false;
    }

    if (creep.store[RESOURCE_GHODIUM] < SAFE_MODE_COST) {
        const ghodiumStorage = _.find(creep.room.impassibleStructures,
            s => s.store && s.store[RESOURCE_GHODIUM]);
        if (ghodiumStorage) {
            const result = creep.transfer(ghodiumStorage, RESOURCE_GHODIUM);
            if (result === ERR_NOT_IN_RANGE) {
                creep.shibMove(ghodiumStorage);
            } else if (result === OK || result === ERR_FULL || result === ERR_NOT_ENOUGH_RESOURCES) {
                memory.storageDestination = undefined;
                memory._shibMove = undefined;
            }
            return true;
        }
    } else {
        const result = creep.generateSafeMode(creep.room.controller);
        if (result === ERR_NOT_IN_RANGE) {
            creep.shibMove(creep.room.controller);
            return true;
        }
        return result === OK;
    }
    return false;
}

profiler.registerClass(RoleRemoteHauler, 'RemoteHauler');
module.exports = RoleRemoteHauler;