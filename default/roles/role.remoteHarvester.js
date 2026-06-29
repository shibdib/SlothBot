/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleRemoteHarvester {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        if (!this.creep.memory.other) this.creep.memory.other = {};
        this.source = this.resolveSource();
        this.refreshContainerTarget();
        this.performRoleActions();
    }

    resolveSource() {
        const other = this.creep.memory.other;
        if (!other) return undefined;

        let source = other.source ? Game.getObjectById(other.source) : undefined;
        if (source) {
            if (!this.creep.memory.destination) this.creep.memory.destination = source.pos.roomName;
            return source;
        }

        const colony = this.creep.memory.colony;
        const destination = this.creep.memory.destination;
        if (colony && destination && ROOM_REMOTE_TARGETS[colony]) {
            const match = _.find(ROOM_REMOTE_TARGETS[colony],
                s => s.room === destination && (!other.source || s.source === other.source));
            if (match) {
                other.source = match.source;
                source = Game.getObjectById(match.source);
                if (source) return source;
            }
        }
        return undefined;
    }

    refreshContainerTarget() {
        if (!this.source) {
            this.container = Game.getObjectById(this.creep.memory.containerID) || Game.getObjectById(this.creep.memory.containerSite);
            return;
        }
        const resolved = global.resolveSourceContainer(this.source, this.room);
        if (resolved) {
            this.container = resolved;
            this.creep.memory.containerID = resolved.id;
            delete this.creep.memory.containerSite;
            return;
        }
        const site = global.resolveSourceContainerSite(this.source);
        if (site) {
            this.container = site;
            this.creep.memory.containerSite = site.id;
            delete this.creep.memory.containerID;
            return;
        }
        this.container = Game.getObjectById(this.creep.memory.containerID) || Game.getObjectById(this.creep.memory.containerSite);
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
        if (Game.time % 50 === 0 && this.creep.memory.destination && INTEL[this.creep.memory.destination]) {
            const intel = INTEL[this.creep.memory.destination];
            const colony = Game.rooms[this.creep.memory.colony];
            const hostile = intel.level || (intel.reservation && intel.reservation !== MY_USERNAME && intel.reservation !== 'Invader');
            const blocked = intel.threatLevel > 1 || intel.roomHeat > 250 || intel.obstacles;
            const dropped = Memory.avoidRemotes && Memory.avoidRemotes.includes(this.creep.memory.destination);
            const destIsSk = intel.sk || (global.isSourceKeeperRoomName && global.isSourceKeeperRoomName(this.creep.memory.destination));
            const skUnsafe = destIsSk && (!SK_MINING || !colony || colony.level < SK_MINING_LEVEL);
            if (hostile || blocked || dropped || skUnsafe || !intel.sources) {
                if (hostile) this.room.cacheRoomIntel(true);
                return this.creep.recycleCreep();
            }
        }

        if (Game.time % 50 === 0 && this.creep.memory.other && this.creep.memory.other.source) {
            const sourceInfo = _.find(ROOM_REMOTE_TARGETS[this.creep.memory.colony], (s) => s.source === this.creep.memory.other.source);
            if (sourceInfo) updateHaulingRequired(this.creep, sourceInfo, true);
        }

        // Periodically check the container
        if (this.creep.memory.onContainer && this.container && !this.creep.pos.isEqualTo(this.container.pos)) {
            this.creep.memory.onContainer = undefined;
        }
        return false;
    }

    harvestSource() {
        if (!this.source) {
            this.source = this.resolveSource();
            if (this.source) return this.harvestSource();

            const dest = this.creep.memory.destination;
            if (!dest || typeof dest !== 'string') return this.creep.recycleCreep();

            if (this.creep.room.name !== dest) {
                return this.creep.shibMove(new RoomPosition(25, 25, dest), {range: 23});
            }
            this.creep.idleFor(5);
            return;
        }

        if (!this.container || Game.time % 5 === 0) this.refreshContainerTarget();

        // Move to or stay on container
        if (this.container && !this.creep.memory.onContainer) {
            if (!this.creep.pos.isEqualTo(this.container.pos)) {
                return this.creep.shibMove(this.container, {range: 0});
            }
            this.creep.memory.onContainer = true;
        } else if (!this.container && Game.time % 10 === 0) {
            harvestDepositContainer(this.source, this.creep);
            this.refreshContainerTarget();
        } else if (!this.creep.memory.onContainer && !this.creep.pos.isNearTo(this.source)) {
            return this.creep.shibMove(this.source);
        }

        // Handle container or construction site
        if (this.container && this.handleContainer()) {
            return;
        } else {
            this.handleDroppedResources();
        }

        // Harvest logic
        const result = this.creep.harvest(this.source);
        if (result === OK) {
            if (!this.creep.memory.other.haulingRequired) {
                const sourceInfo = _.find(ROOM_REMOTE_TARGETS[this.creep.memory.colony], (s) => s.source === this.creep.memory.other.source);
                if (sourceInfo) updateHaulingRequired(this.creep, sourceInfo);
            } else if (this.container && this.container.store && !this.container.store.getFreeCapacity(RESOURCE_ENERGY)) {
                this.creep.repair(this.container);
                this.creep.idleFor(10);
            }
        } else if (result === ERR_NOT_IN_RANGE) {
            this.creep.shibMove(this.source);
        } else if (result === ERR_NOT_ENOUGH_RESOURCES) {
            if (this.container && this.container.store) this.creep.repair(this.container);
            this.creep.idleFor(this.source.ticksToRegeneration + 1);
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

function routeHasRoads(colony, destination) {
    const route = Game.map.findRoute(colony, destination);
    return Array.isArray(route)
        && INTEL[colony] && INTEL[colony].roadsBuilt
        && route.every(step => INTEL[step.room] && INTEL[step.room].roadsBuilt);
}

function updateHaulingRequired(creep, sourceInfo, onlyIfChanged) {
    const roadsBuilt = routeHasRoads(creep.memory.colony, creep.memory.destination);
    const colony = Game.rooms[creep.memory.colony];
    const linkFed = !!(colony && colony.links && colony.links.length >= 2);
    if (onlyIfChanged && creep.memory.other.haulingRequired
        && creep.memory.other.haulingScore === sourceInfo.score
        && creep.memory.other.haulingRoads === roadsBuilt
        && creep.memory.other.haulingLinkFed === linkFed) {
        return;
    }
    const power = creep.getActiveBodyparts(WORK) * HARVEST_POWER;
    const destIntel = INTEL[creep.memory.destination];
    const reserved = destIntel && destIntel.reservation === MY_USERNAME;
    const isSk = destIntel && destIntel.sk;
    const sourceCap = isSk ? SOURCE_ENERGY_KEEPER_CAPACITY
        : (reserved ? SOURCE_ENERGY_CAPACITY : SOURCE_ENERGY_NEUTRAL_CAPACITY);
    const maxRate = sourceCap / ENERGY_REGEN_TIME;
    const actualRate = Math.min(power, maxRate);
    creep.memory.other.haulingScore = sourceInfo.score;
    creep.memory.other.haulingRoads = roadsBuilt;
    creep.memory.other.haulingLinkFed = linkFed;
    creep.memory.other.harvestRate = actualRate;
    // Total carry capacity (energy units) to clear one round-trip backlog. score ≈ one-way
    // path cost; round trip ≈ 2×score ticks of production at actualRate.
    const roundTripBuffer = roadsBuilt ? 1.25 : 1.4;
    const linkScale = linkFed ? 0.55 : 1;
    creep.memory.other.haulingRequired = actualRate * sourceInfo.score * 2 * roundTripBuffer * linkScale;
}

function harvestDepositContainer(source, creep) {
    const container = global.resolveSourceContainer(source, creep.room);
    if (container) {
        creep.memory.containerID = container.id;
        delete creep.memory.containerSite;
        return container.id;
    }

    const site = global.resolveSourceContainerSite(source);
    if (site) {
        creep.memory.containerSite = site.id;
        delete creep.memory.containerID;
        return site.id;
    }

    if (creep.memory.siteAttempt) return;

    const {findBestContainerPos, canPlaceConstructionSite, tryCreateConstructionSite} = require('planUtils');
    const buildPos = findBestContainerPos(source);
    if (!buildPos || buildPos.checkForConstructionSites() || buildPos.checkForImpassible()) return;

    if (creep.pos.isEqualTo(buildPos) && creep.pos.getRangeTo(source) === 1) {
        creep.memory.siteAttempt = true;
        if (canPlaceConstructionSite(creep.room)) tryCreateConstructionSite(buildPos, STRUCTURE_CONTAINER);
    } else if (creep.pos.checkForWall()) {
        findContainerSpot(creep.room, source.pos);
    }
}

function findContainerSpot(room, position) {
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (xOff !== 0 || yOff !== 0) {
                let pos = new RoomPosition(position.x + xOff, position.y + yOff, room.name);
                if (!pos.checkForImpassible() && !pos.checkForConstructionSites()) {
                    if (canPlaceConstructionSite(room)) tryCreateConstructionSite(pos, STRUCTURE_CONTAINER);
                    return;
                }
            }
        }
    }
}

profiler.registerClass(RoleRemoteHarvester, 'RemoteHarvester');
module.exports = RoleRemoteHarvester;