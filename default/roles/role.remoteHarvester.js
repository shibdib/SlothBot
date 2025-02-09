/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("./tools.profiler");

class RoleRemoteHarvester {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.container = Game.getObjectById(this.creep.memory.containerID) || Game.getObjectById(this.creep.memory.containerSite);
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        this.harvestSource();
    }

    housekeeping() {
        // SK Safety
        if (this.creep.skSafety()) {
            this.creep.memory.onContainer = undefined;
            return true;
        }
        // Handle room reservation/ownership
        if (this.room.controller && (this.room.controller.reservation && this.room.controller.reservation.username !== MY_USERNAME)) {
            this.room.cacheRoomIntel(true);
            return this.creep.suicide();
        }
        // Periodically check the container
        if (this.creep.memory.onContainer && this.container && Math.random() > 0.9 && this.creep.pos.getRangeTo(this.container)) {
            this.creep.memory.onContainer = undefined;
        }
    }

    harvestSource() {
        const source = Game.getObjectById(this.creep.memory.other.source);
        if (!source) {
            // Move to a general area if source not found
            return this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 15});
        }

        // Move to or stay on container
        if (this.container && !this.creep.memory.onContainer) {
            if (this.creep.pos.getRangeTo(this.container)) {
                return this.creep.shibMove(this.container, {range: 0});
            }
            this.creep.memory.onContainer = true;
        } else if (!this.container) {
            harvestDepositContainer(Game.getObjectById(this.creep.memory.other.source), this.creep);
        } else if (!this.creep.memory.onContainer && !this.creep.pos.isNearTo(source)) {
            return this.creep.shibMove(source);
        }

        // Harvest logic
        switch (this.creep.harvest(source)) {
            case ERR_NOT_IN_RANGE:
                return this.creep.shibMove(source);
            case ERR_NOT_ENOUGH_RESOURCES:
                return this.creep.idleFor(source.ticksToRegeneration + 1);
            case OK:
                // Set harvest power if not set
                if (!this.creep.memory.other.harvestPower) {
                    this.creep.memory.other.harvestPower = this.creep.getActiveBodyparts(WORK) * HARVEST_POWER;
                }
                // Handle container or construction site
                if (this.container) {
                    this.handleContainer();
                } else {
                    this.handleDroppedResources();
                }
                break;
        }
    }

    handleContainer() {
        // Repair or manage container status
        if (this.container.hits) {
            if (this.creep.store[RESOURCE_ENERGY] && this.container.hits < this.container.hitsMax * 0.5) {
                return this.creep.repair(this.container);
            }
            const containerStore = _.sum(this.container.store);
            if (containerStore >= CONTAINER_CAPACITY * 0.75 && this.container.hits < this.container.hitsMax) {
                return this.creep.repair(this.container);
            } else if (containerStore >= CONTAINER_CAPACITY * 0.8) {
                this.handleHaulerCheck();
            } else if (Game.rooms[this.creep.memory.colony].memory.additionalRemoteHaulingNeeded < Game.time) {
                Game.rooms[this.creep.memory.colony].memory.additionalRemoteHaulingNeeded = undefined;
            }
            this.creep.memory.energyAmount = containerStore;
            this.creep.memory.energyId = this.container.id;
        } else if (this.container.progressTotal) { // If it's a construction site
            const dropped = this.creep.pos.lookFor(LOOK_RESOURCES)[0];
            if (dropped && dropped.amount > 500 && !this.creep.store.getFreeCapacity()) {
                this.creep.build(this.container);
            }
            this.creep.memory.energyAmount = dropped ? dropped.amount : 0;
            this.creep.memory.energyId = dropped ? dropped.id : undefined;
        }
    }

    handleDroppedResources() {
        const dropped = this.creep.pos.lookFor(LOOK_RESOURCES)[0];
        if (dropped) {
            this.creep.memory.energyAmount = dropped.amount;
            this.creep.memory.energyId = dropped.id;
        }
    }

    handleHaulerCheck() {
        if (this.creep.memory.other.hauler) {
            const hauler = _.find(Game.creeps, (c) => c.my && c.memory.other.harvester === this.creep.id);
            if (!hauler) this.creep.memory.other.hauler = undefined;
        }
        Game.rooms[this.creep.memory.colony].memory.additionalRemoteHaulingNeeded = Game.time + 500;
        this.creep.idleFor(20);
    }
}

function harvestDepositContainer(source, creep) {
    let container = source.pos.findClosestByRange(creep.room.structures, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.pos.getRangeTo(source) === 1});
    if (container) {
        creep.memory.containerID = container.id;
        return container.id;
    } else {
        let site = source.pos.findInRange(creep.room.constructionSites, 3, {filter: (s) => s.structureType === STRUCTURE_CONTAINER})[0];
        if (!creep.memory.siteAttempt && !site && creep.pos.getRangeTo(source) === 1 && !creep.pos.checkForWall()) {
            creep.memory.siteAttempt = true;
            creep.pos.createConstructionSite(STRUCTURE_CONTAINER);
        } else if (!site && creep.pos.checkForWall()) {
            findContainerSpot(creep.room, source.pos);
        } else if (site && site.pos.getRangeTo(source) === 1) {
            creep.memory.containerSite = site.id;
        }
    }
}

function findContainerSpot(room, position) {
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (xOff !== 0 || yOff !== 0) {
                let pos = new RoomPosition(position.x + xOff, position.y + yOff, room.name);
                if (!pos.checkForImpassible()) pos.createConstructionSite(STRUCTURE_CONTAINER);
            }
        }
    }
}

profiler.registerClass(RoleRemoteHarvester, 'RemoteHarvester');
module.exports = RoleRemoteHarvester;
