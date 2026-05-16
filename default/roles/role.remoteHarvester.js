/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

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
        // SK Safety - Throttled
        if ((this.room.memory.sk || (INTEL[this.room.name] && INTEL[this.room.name].sk)) && this.creep.skSafety()) {
            this.creep.memory.onContainer = undefined;
            return true;
        }

        // Throttled viability check - recycle if the remote is no longer assigned to this colony
        if (Game.time % 20 === 0 && this.creep.memory.destination && INTEL[this.creep.memory.destination]) {
            const intel = INTEL[this.creep.memory.destination];
            const colony = Game.rooms[this.creep.memory.colony];
            const hostile = intel.level || (intel.reservation && intel.reservation !== MY_USERNAME && intel.reservation !== 'Invader');
            const blocked = intel.threatLevel > 1 || intel.roomHeat > 250 || intel.obstacles;
            const dropped = Memory.avoidRemotes && Memory.avoidRemotes.includes(this.creep.memory.destination);
            const skUnsafe = intel.sk && (!SK_MINING || !colony || colony.level < SK_MINING_LEVEL);
            if (hostile || blocked || dropped || skUnsafe || !intel.sources) {
                if (hostile) this.room.cacheRoomIntel(true);
                return this.creep.recycleCreep();
            }
        }

        // Periodically check the container
        if (this.creep.memory.onContainer && this.container && !this.creep.pos.isEqualTo(this.container.pos)) {
            this.creep.memory.onContainer = undefined;
        }
        return false;
    }

    harvestSource() {
        const source = Game.getObjectById(this.creep.memory.other.source);
        if (!source) {
            // Move to a general area if source not found
            return this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 15});
        }

        // Move to or stay on container
        if (this.container && !this.creep.memory.onContainer) {
            if (!this.creep.pos.isEqualTo(this.container.pos)) {
                return this.creep.shibMove(this.container, {range: 0});
            }
            this.creep.memory.onContainer = true;
        } else if (!this.container && Game.time % 10 === 0) {
            harvestDepositContainer(source, this.creep);
        } else if (!this.creep.memory.onContainer && !this.creep.pos.isNearTo(source)) {
            return this.creep.shibMove(source);
        }

        // Handle container or construction site
        if (this.container && this.handleContainer()) {
            return;
        } else {
            this.handleDroppedResources();
        }

        // Harvest logic
        const result = this.creep.harvest(source);
        if (result === OK) {
            // Set harvest power if not set
            if (!this.creep.memory.other.haulingRequired) {
                const sourceInfo = _.find(ROOM_REMOTE_TARGETS[this.creep.memory.colony], (s) => s.source === this.creep.memory.other.source);
                // Defer until source is registered — guessing distance can spawn a wildly oversized hauler fleet
                if (sourceInfo) {
                    const power = this.creep.getActiveBodyparts(WORK) * HARVEST_POWER;
                    // Cap harvest rate to actual source regen so we don't over-size haulers
                    const reserved = INTEL[this.creep.memory.destination] && INTEL[this.creep.memory.destination].reservation === MY_USERNAME;
                    const maxRate = (reserved ? SOURCE_ENERGY_CAPACITY : SOURCE_ENERGY_NEUTRAL_CAPACITY) / ENERGY_REGEN_TIME;
                    const actualRate = Math.min(power, maxRate);
                    // score = pathCost/2 using plainCost=2. On roads (cost=1), score=0.5/tile but travel=1 tick/tile,
                    // so score underestimates road travel by 2x. Use 4.2x for road paths, 2.2x for plain paths.
                    // Match bodyGenerator's halfMove decision: every room on the route must have roads.
                    const route = Game.map.findRoute(this.creep.memory.colony, this.creep.memory.destination);
                    const roadsBuilt = Array.isArray(route)
                        && INTEL[this.creep.memory.colony] && INTEL[this.creep.memory.colony].roadsBuilt
                        && route.every(step => INTEL[step.room] && INTEL[step.room].roadsBuilt);
                    this.creep.memory.other.haulingRequired = actualRate * sourceInfo.score * (roadsBuilt ? 4.2 : 2.2);
                }
            }
        } else if (result === ERR_NOT_IN_RANGE) {
            this.creep.shibMove(source);
        } else if (result === ERR_NOT_ENOUGH_RESOURCES) {
            this.creep.idleFor(source.ticksToRegeneration + 1);
        }
    }

    handleContainer() {
        // Repair or manage container
        if (this.container.hits) {
            const containerStore = this.container.store.getUsedCapacity();
            if (this.creep.store[RESOURCE_ENERGY]) {
                if (this.container.hits < this.container.hitsMax * 0.5 || (this.container.hits < this.container.hitsMax && containerStore >= CONTAINER_CAPACITY * 0.95)) {
                    return this.creep.repair(this.container);
                }
            }
            this.creep.memory.energyAmount = containerStore;
            this.creep.memory.energyId = this.container.id;
        } else if (this.container.progressTotal) { // If it's a construction site
            const dropped = this.creep.pos.lookFor(LOOK_RESOURCES)[0];
            if (dropped && dropped.amount > 500 && !this.creep.store.getFreeCapacity()) {
                return this.creep.build(this.container);
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
}

function harvestDepositContainer(source, creep) {
    let container = source.pos.findClosestByRange(creep.room.containers, {filter: (s) => s.pos.getRangeTo(source) === 1});
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
