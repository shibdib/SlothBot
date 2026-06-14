/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const {empireOpsPaused} = require('hcReadiness');

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
        // Recycle if the assigned remote is no longer viable (destination is the colony, not the remote).
        const remoteRoom = this.memory.other && this.memory.other.remoteRoom;
        if (Game.time % 30 === 0 && remoteRoom && INTEL[remoteRoom]) {
            const intel = INTEL[remoteRoom];
            const hostile = intel.level || (intel.reservation && intel.reservation !== MY_USERNAME && intel.reservation !== 'Invader');
            const blocked = intel.threatLevel > 1 || intel.roomHeat > 250 || intel.obstacles;
            const dropped = Memory.avoidRemotes && Memory.avoidRemotes.includes(remoteRoom);
            if (hostile || blocked || dropped || !intel.sources) return this.creep.recycleCreep();
        }
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

        if (!Game.getObjectById(this.memory.energyDestination)) this.memory.energyDestination = undefined;

        if (Game.time % 2 === 0) {
            const colony = Game.rooms[this.memory.colony];
            const colonyInfo = colony && colony.memory.energyInfo;
            const colonyTrend = (colonyInfo && colonyInfo.trend) || 0;
            if (colony && colony.energyState >= 2 && colonyTrend >= 0) {
                this.creep.opportunisticRepair();
            }
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

        // Resolve harvester from the cached id; if dead, fall back to a source-keyed lookup.
        // The source assignment is the source of truth — harvester ids are transient.
        let harvester = Game.getObjectById(this.memory.other.harvester);
        if (!harvester) {
            harvester = _.find(Game.creeps,
                c => c.my && c.memory.role === 'remoteHarvester' &&
                    c.memory.other.source === this.memory.other.source
            );
            this.memory.other.harvester = harvester ? harvester.id : undefined;
        }
        if (harvester) {
            if (harvester.memory.containerID) this.memory.containerID = harvester.memory.containerID;
            else if (harvester.memory.containerSite) this.memory.containerID = harvester.memory.containerSite;
        }

        const container = Game.getObjectById(this.memory.containerID);
        if (container && container.store) {
            this.memory.energyDestination = container.id;
            if (container.store[RESOURCE_ENERGY]) return this.creep.withdrawResource();
            return this.creep.shibMove(container, {range: 3});
        }

        const remoteRoom = this.memory.other.remoteRoom;
        if (remoteRoom && this.room.name !== remoteRoom) {
            return this.creep.shibMove(new RoomPosition(25, 25, remoteRoom), {range: 20});
        }

        if (harvester) {
            if (harvester.memory.energyId) {
                const resource = Game.getObjectById(harvester.memory.energyId);
                if (resource) {
                    this.memory.energyDestination = resource.id;
                    return this.creep.withdrawResource();
                }
            }
            if (harvester.store[RESOURCE_ENERGY] > 0) {
                this.memory.energyDestination = harvester.id;
                return this.creep.withdrawResource();
            }
        }

        if (this.randomLoot()) {
            return this.creep.withdrawResource();
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

        const containers = this.room.containers;
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
        const link = this.room.links.filter(s => ![s.room.memory.hubLink, s.room.memory.controllerLink].includes(s.id) &&
            s.pos.getRangeTo(this.creep) <= 9 && (!s.room.storage || s.pos.getRangeTo(this.creep) < s.room.storage.pos.getRangeTo(this.creep)));
        if (link.length) this.memory.exitLink = this.creep.pos.findClosestByPath(link).id;
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
        } else if (link && !link.store.getFreeCapacity(RESOURCE_ENERGY)) {
            if (link.pos.getRangeTo(creep) > 1) {
                creep.shibMove(link, {range: 1});
            } else {
                creep.idleFor(5);
            }
            return;
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

    const controllerContainer = global.resolveControllerContainer(colony);

    // Efficiently find towers needing energy
    const lowTower = colony.towers.find(s => s.store.getFreeCapacity(RESOURCE_ENERGY) > TOWER_CAPACITY * 0.4);

    if (lowTower) {
        memory.storageDestination = lowTower.id;
    } else if (!colony.terminal && colony.level < 8 && controllerContainer && controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
        Math.random() > controllerContainer.store[RESOURCE_ENERGY] / CONTAINER_CAPACITY) {
        memory.storageDestination = controllerContainer.id;
    } else if (colony.energyState && colony.level < 8 && controllerContainer && controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) &&
        Math.random() + 0.1 > controllerContainer.store[RESOURCE_ENERGY] / CONTAINER_CAPACITY) {
        memory.storageDestination = controllerContainer.id;
    } else if (!empireOpsPaused() && colony.nuker && colony.nuker.store.getFreeCapacity(RESOURCE_ENERGY) &&
        (colony.energyState >= 3 || colony.nuker.store[RESOURCE_GHODIUM] > 0)) {
        memory.storageDestination = colony.nuker.id;
    } else if (colony.storage && !colony.energyState &&
        colony.storage.store.getFreeCapacity(RESOURCE_ENERGY) > storeSum) {
        memory.storageDestination = colony.storage.id;
    } else if (colony.terminal && colony.terminal.store.getFreeCapacity(RESOURCE_ENERGY) > TERMINAL_CAPACITY * 0.1 &&
        colony.terminal.store.getFreeCapacity(RESOURCE_ENERGY) > storeSum) {
        memory.storageDestination = colony.terminal.id;
    } else if (colony.storage && colony.storage.store.getFreeCapacity(RESOURCE_ENERGY) > storeSum) {
        memory.storageDestination = colony.storage.id;
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