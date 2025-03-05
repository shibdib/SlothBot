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
        const storeSum = _.sum(this.store);
        if (this.creep.isFull || storeSum) {
            this.deliverResource();
        } else if (this.memory.operation) {
            this.specialDuty();
        } else {
            this.findResource();
        }
    }

    housekeeping() {
        if (this.creep.skSafety()) return true;
        if (safemodeGeneration(this.creep)) return true;
        this.creep.say(ICONS.haul2, true);
        return false;
    }

    deliverResource() {
        const storeSum = _.sum(this.store);
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
        this.creep.opportunisticRepair();
        this.creep.opportunisticFill();

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
            harvester = _.find(Game.creeps,
                c => c.my &&
                    c.memory.role === 'remoteHarvester' &&
                    c.memory.other.source === this.memory.other.source
            );
            if (harvester) {
                if (harvester.memory.containerID) this.memory.containerID = harvester.memory.containerID;
                this.memory.other.harvester = harvester.id;
            } else {
                this.memory.other.harvester = undefined;
            }
        } else {
            if (this.randomLoot()) return true;
            this.memory.other.source = harvester.memory.other.source;
            if (harvester.memory.energyId) {
                this.memory.energyDestination = harvester.memory.energyId;
                return true;
            }
            const source = Game.getObjectById(this.memory.other.source);
            if (source && this.creep.shibMove(source, {range: 4})) return true;
        }

        const container = Game.getObjectById(this.memory.containerID);
        if (container && container.store[RESOURCE_ENERGY]) {
            this.memory.energyDestination = container.id;
            return true;
        }

        this.creep.idleFor(10);
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
        const creepReference = Game.getObjectById(this.memory.other.harvester) || this.creep;
        const containers = this.room.structures;
        const container = containers.length && containers.find(
            s => s.structureType === STRUCTURE_CONTAINER &&
                _.sum(s.store) > s.store[RESOURCE_ENERGY]
        );
        const droppedLoot = this.room.droppedResources;

        if (droppedLoot.length) {
            this.memory.energyDestination = droppedLoot[0].id;
            return true;
        }
        if (container) {
            this.memory.energyDestination = container.id;
            return true;
        }
        return false;
    }
}

function dropOff(creep) {
    const memory = creep.memory;
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

    const colony = Game.rooms[memory.colony];
    const storeSum = _.sum(creep.store);
    if (storeSum > creep.store[RESOURCE_ENERGY]) {
        if (colony.terminal) memory.storageDestination = colony.terminal.id;
        else if (colony.storage) memory.storageDestination = colony.storage.id;
        else memory.resourceDelivery = findClosestOwnedRoom(creep.room.name, false, 4);
        return;
    }

    const controllerContainer = Game.getObjectById(colony.memory.controllerContainer);
    const lowTower = _.find(creep.room.impassibleStructures,
        s => s.structureType === STRUCTURE_TOWER &&
            s.store[RESOURCE_ENERGY] < TOWER_CAPACITY * 0.7 &&
            !_.find(creep.room.myCreeps, c => c.memory.storageDestination === s.id)
    );

    if (lowTower) {
        memory.storageDestination = lowTower.id;
    } else if (!colony.terminal && !colony.memory.hubLink && controllerContainer && controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) &&
        Math.random() > controllerContainer.store[RESOURCE_ENERGY] / CONTAINER_CAPACITY) {
        memory.storageDestination = controllerContainer.id;
    } else if (colony.energyState && colony.nuker &&
        colony.nuker.store.getFreeCapacity(RESOURCE_ENERGY)) {
        memory.storageDestination = colony.nuker.id;
    } else if (colony.storage && !colony.energyState &&
        colony.storage.store.getFreeCapacity() > storeSum) {
        memory.storageDestination = colony.storage.id;
    } else if (colony.terminal && colony.terminal.store.getFreeCapacity() > storeSum &&
        colony.terminal.store[RESOURCE_ENERGY] < TERMINAL_ENERGY_BUFFER) {
        memory.storageDestination = colony.terminal.id;
    } else if (colony.energyState > 1 && controllerContainer && controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) &&
        Math.random() + 0.1 > controllerContainer.store[RESOURCE_ENERGY] / CONTAINER_CAPACITY) {
        memory.storageDestination = controllerContainer.id;
    } else if (colony.storage && colony.storage.store.getFreeCapacity() > storeSum) {
        memory.storageDestination = colony.storage.id;
    } else if (colony.level === colony.controller.level && controllerContainer && controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) &&
        Math.random() < (controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) / CONTAINER_CAPACITY)) {
        memory.storageDestination = controllerContainer.id;
    } else if (creep.haulerDelivery()) {
    } else creep.idleFor(5);
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