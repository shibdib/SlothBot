/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleStationaryHarvester {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        //if (this.creep.id ==='67c119bddaa16e04f1589692') this.creep.pathingDebug();
        if (!this.creep.memory.other.source) {
            this.findSource();
        } else {
            this.harvestSource();
        }
    }

    findSource() {
        if (!this.creep.findSource()) {
            let oldestHarvester = _.min(_.filter(this.room.creeps, (c) => c.memory && c.ticksToLive < 500 && c.memory.role === "stationaryHarvester"), "ticksToLive") ||
                _.find(this.room.creeps, (c) => c.memory && c.memory.role === "stationaryHarvester" && c.memory.other.reboot);
            if (!oldestHarvester || !oldestHarvester.id) return this.creep.suicide();
            else {
                this.creep.memory.other.source = oldestHarvester.memory.other.source;
                oldestHarvester.suicide();
            }
        }
    }

    harvestSource() {
        let source = Game.getObjectById(this.creep.memory.other.source);
        // If in place harvest
        if (this.creep.memory.onContainer) {
            let container = Game.getObjectById(source.memory.container);
            // Build container
            if (!container && this.creep.store[RESOURCE_ENERGY]) {
                source.memory.container = undefined;
                let dropped = this.creep.pos.lookFor(LOOK_RESOURCES)[0];
                let site = this.creep.pos.lookFor(LOOK_CONSTRUCTION_SITES)[0];
                if (site && dropped && dropped.amount >= 250) {
                    if (site) {
                        this.creep.build(site);
                        this.creep.pickup(dropped);
                    }
                    return;
                }
            }
            switch (this.creep.harvest(source)) {
                case ERR_NOT_IN_RANGE:
                    this.creep.memory.onContainer = undefined;
                    break;
                case ERR_NOT_ENOUGH_RESOURCES:
                    if (container && this.creep.store[RESOURCE_ENERGY]) {
                        this.creep.repair(container);
                    } else this.creep.idleFor(source.ticksToRegeneration + 1);
                    break;
                case OK:
                    // Set stationary so we don't get bumped
                    this.creep.memory.other.stationary = true;
                    // Check if the link is still good
                    if (!this.creep.memory.other.linkCheck && container && source.memory.link) {
                        const link = Game.getObjectById(source.memory.link);
                        if (!link || !link.pos.isNearTo(container) || !link.isActive()) {
                            if (link) link.destroy();
                            source.memory.link = undefined;
                        } else this.creep.memory.link = link.id;
                        this.creep.memory.other.linkCheck = true;
                    }
                    // If we have a link and container, empty the container of overflow
                    if (source.memory.link && container && container.store[RESOURCE_ENERGY]) this.creep.withdraw(container, RESOURCE_ENERGY);
                    // Every other tick check for deposit ability
                    if (isEven(Game.time)) {
                        if ((container && !container.store.getFreeCapacity(RESOURCE_ENERGY)) || this.creep.store[RESOURCE_ENERGY]) depositEnergy(this.creep);
                    }
                    break;
            }
        } else {
            let container = Game.getObjectById(source.memory.container) || _.find(source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1), (s) => s.structureType === STRUCTURE_CONTAINER);
            //Make sure you're on the container
            if (container) {
                if (this.creep.pos.getRangeTo(container)) {
                    return this.creep.shibMove(container, {range: 0});
                } else {
                    this.creep.memory.onContainer = true;
                }
            } else {
                if (this.creep.pos.getRangeTo(source) > 1) {
                    return this.creep.shibMove(source);
                } else {
                    this.creep.memory.onContainer = true;
                }
            }
        }
    }
}

// Rotate between link and container if we don't have a hub and controller link
function depositEnergy(creep) {
    let source = Game.getObjectById(creep.memory.other.source);
    let container = Game.getObjectById(source.memory.container);
    // Fill nearby
    if (extensionFiller(creep)) return;
    if (container && container.hits < container.hitsMax * 0.5) return creep.repair(container);
    if (source.memory.link && (creep.room.memory.hubLink || creep.room.memory.controllerLink)) {
        let link = Game.getObjectById(source.memory.link);
        if (link && link.store[RESOURCE_ENERGY] < LINK_CAPACITY) {
            creep.transfer(link, RESOURCE_ENERGY);
            creep.withdraw(container, RESOURCE_ENERGY);
        } else if (container && !container.store.getFreeCapacity(RESOURCE_ENERGY)) {
            if (container.hits < container.hitsMax) creep.repair(container); else if (creep.pos.checkForRampart()) creep.repair(creep.pos.checkForRampart());
        }
    } else if (container) {
        if (!container.store.getFreeCapacity(RESOURCE_ENERGY)) {
            if (container.hits < container.hitsMax) creep.repair(container);
        }
    } else {
        creep.memory.containerID = undefined;
        creep.memory.linkID = undefined;
    }
}

function extensionFiller(creep) {
    if (!ROOM_HARVESTER_EXTENSIONS[creep.room.name] || !creep.memory.extensionsFound) {
        creep.memory.extensionsFound = true;
        let container = Game.getObjectById(creep.memory.containerID) || creep;
        let extension = container.pos.findInRange(_.filter(creep.room.impassibleStructures, (s) => s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION), 1);
        let sourceExtensions = ROOM_HARVESTER_EXTENSIONS[creep.room.name] || [];
        ROOM_HARVESTER_EXTENSIONS[creep.room.name] = _.union(sourceExtensions, _.pluck(extension, 'id'));
        // Rampart check if near border or outside
        if (extension.length && creep.room.level >= 3) {
            let nearbyBunkerWall = _.find(container.pos.lookForNearby(LOOK_STRUCTURES, true, 3), (s) => (s.structure.structureType === STRUCTURE_RAMPART && !s.structure.pos.checkForObstacleStructure()) || s.structure.structureType === STRUCTURE_WALL);
            if (nearbyBunkerWall) {
                if (!container.pos.checkForRampart()) container.pos.createConstructionSite(STRUCTURE_RAMPART);
                for (let e of extension) {
                    if (!e.pos.checkForRampart()) {
                        e.pos.createConstructionSite(STRUCTURE_RAMPART);
                    }
                }
            }
        }
    } else {
        if (creep.opportunisticFill()) return true;
    }
}

profiler.registerClass(RoleStationaryHarvester, 'StationaryHarvester');
module.exports = RoleStationaryHarvester;
