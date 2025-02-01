/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("./tools.profiler");

class RoleRemoteHauler {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        if (this.creep.memory.hauling || this.creep.isFull) {
            this.deliverResource();
        } else {
            this.findResource();
        }
    }

    housekeeping() {
        // If unsafe return home
        if (this.creep.skSafety()) return true;
        // Attempt to generate safemodes
        if (safemodeGeneration(this.creep)) return true;
        // Icon
        this.creep.say(ICONS.haul2, true);
    }

    deliverResource() {
        if (!_.sum(this.creep.store)) {
            this.creep.memory.storageDestination = undefined;
            this.creep.memory.hauling = undefined;
            return;
        }
        // Sanity check for container and non energy
        if (_.sum(this.creep.store) > this.creep.store[RESOURCE_ENERGY] && this.creep.memory.storageDestination &&
            Game.getObjectById(this.creep.memory.storageDestination) instanceof StructureContainer) return this.creep.memory.storageDestination = undefined;
        this.creep.memory.energyDestination = undefined;
        this.creep.opportunisticRepair();
        this.creep.opportunisticFill();
        if (this.creep.memory.storageDestination) {
            let storageItem = Game.getObjectById(this.creep.memory.storageDestination);
            for (const resourceType in this.creep.store) {
                switch (this.creep.transfer(storageItem, resourceType)) {
                    case ERR_NOT_IN_RANGE:
                        this.creep.shibMove(storageItem);
                        return true;
                    default:
                        delete this.creep.memory.resourceDelivery;
                        delete this.creep.memory.storageDestination;
                        delete this.creep.memory._shibMove;
                        break;
                }
            }
        } else {
            dropOff(this.creep)
        }
    }

    findResource() {
        // If you have an energy destination, withdraw it
        if (this.creep.memory.energyDestination) {
            if (this.creep.withdrawResource()) {
                this.creep.memory.hauling = true;
                return true;
            }
        } else {
            // Find an available harvester with enough energy
            const harvester = Game.getObjectById(this.creep.memory.other.harvester);
            if (harvester) {
                if (harvester.memory.energyId) {
                    this.creep.memory.energyDestination = harvester.memory.energyId;
                    return this.creep.withdrawResource();
                } else {
                    const source = Game.getObjectById(this.creep.memory.other.source);
                    return this.creep.shibMove(source, {range: 4});
                }
            } else {
                this.creep.memory.other.harvester = undefined;
                const needyHarvester = _.find(Game.creeps, (c) => c.my && c.memory.role === 'remoteHarvester' &&
                    c.memory.other.source === this.creep.memory.other.source);
                if (needyHarvester) {
                    this.creep.memory.other.harvester = needyHarvester.id;
                } else {
                    this.creep.idleFor(10);
                }
            }
        }
    }
}

// Remote Hauler Drop Off
function dropOff(creep) {
    if (creep.memory.resourceDelivery) {
        if (creep.memory.resourceDelivery !== creep.room.name) creep.shibMove(new RoomPosition(25, 25, creep.memory.resourceDelivery), {range: 18});
        else {
            if (creep.room.terminal) creep.memory.storageDestination = creep.room.terminal.id;
            else if (creep.room.storage) creep.memory.storageDestination = creep.room.storage.id;
        }
        return;
    }
    let overlord = Game.rooms[creep.memory.overlord];
    // If carrying minerals deposit in terminal or storage
    if (_.sum(creep.store) > creep.store[RESOURCE_ENERGY]) {
        if (overlord.terminal) creep.memory.storageDestination = overlord.terminal.id;
        else if (overlord.storage) creep.memory.storageDestination = overlord.storage.id;
        else creep.memory.resourceDelivery = findClosestOwnedRoom(creep.room.name, false, 4);
    } else {
        //Controller
        let controllerContainer = Game.getObjectById(overlord.memory.controllerContainer);
        let lowTower = _.find(creep.room.impassibleStructures, (s) => s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] < TOWER_CAPACITY * 0.7 && !_.find(creep.room.myCreeps, (c) => c.memory.storageDestination === s.id));
        if (lowTower) {
            creep.memory.storageDestination = lowTower.id;
            return true;
        } else if (overlord.terminal && overlord.terminal.store.getFreeCapacity() > _.sum(creep.store) && overlord.terminal.store.getUsedCapacity(RESOURCE_ENERGY) < TERMINAL_ENERGY_BUFFER) {
            creep.memory.storageDestination = overlord.terminal.id;
            return true;
        } else if (overlord.level === overlord.controller.level && controllerContainer && Math.random() < (controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) / CONTAINER_CAPACITY)) {
            creep.memory.storageDestination = controllerContainer.id;
            return true;
        } else if (overlord.energyState && overlord.nuker && overlord.nuker.store.getFreeCapacity(RESOURCE_ENERGY)) {
            creep.memory.storageDestination = overlord.nuker.id;
            return true;
        } else if (overlord.energyState && controllerContainer && controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) > 100) {
            creep.memory.storageDestination = controllerContainer.id;
            return true;
        } else if (overlord.terminal && overlord.terminal.store.getFreeCapacity() > _.sum(creep.store) && overlord.terminal.store.getUsedCapacity(RESOURCE_ENERGY) < TERMINAL_ENERGY_BUFFER * 5) {
            creep.memory.storageDestination = overlord.terminal.id;
            return true;
        } else if (overlord.storage && overlord.storage.store.getFreeCapacity() > _.sum(creep.store)) {
            creep.memory.storageDestination = overlord.storage.id;
            return true;
        } else if (creep.haulerDelivery()) {
            return true;
        } else if (creep.pos.getRangeTo(Game.rooms[creep.memory.overlord].controller) > 2) {
            creep.shibMove(Game.rooms[creep.memory.overlord].controller, {range: 2});
        } else creep.idleFor(5)
    }
}

// Generate safemode
function safemodeGeneration(creep) {
    // Only run in your room and if we haven't checked yet
    if (creep.memory.safemodeCheck || creep.room.name !== creep.memory.overlord) return false;
    creep.memory.safemodeCheck = true;
    // Check if we can fit it or is it exists
    if (creep.store.getFreeCapacity() < SAFE_MODE_COST || creep.room.store(RESOURCE_GHODIUM) < SAFE_MODE_COST) return false;
    // Only do it if we have less than 2 safemodes
    if (!creep.room.controller.safeModeAvailable || creep.room.controller.safeModeAvailable < 2) {
        if (creep.store.getUsedCapacity(RESOURCE_GHODIUM) < SAFE_MODE_COST) {
            let ghodiumStorage = _.filter(creep.room.impassibleStructures, (s) => s.store && s.store[RESOURCE_GHODIUM])[0];
            if (ghodiumStorage) {
                switch (creep.transfer(ghodiumStorage, RESOURCE_GHODIUM)) {
                    case OK:
                        creep.memory.storageDestination = undefined;
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(ghodiumStorage);
                        break;
                    case ERR_FULL:
                    case ERR_NOT_ENOUGH_RESOURCES:
                        creep.memory._shibMove = undefined;
                        creep.memory.storageDestination = undefined;
                        break;
                }
            }
        } else {
            switch (creep.generateSafeMode(creep.room.controller)) {
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(creep.room.controller);
                    break;
            }
        }
        return true;
    }
}

profiler.registerClass(RoleRemoteHauler, 'RemoteHauler');
module.exports = RoleRemoteHauler;
