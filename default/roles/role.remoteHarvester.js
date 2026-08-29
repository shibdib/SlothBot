/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const {routeHasBuiltRoads} = require('bodyHelpers');
const {effectiveHaulScore, getMiningRouteRooms, hasSkAttackerOnSite, skGuardRoom} = require('remoteMining');
const {travelRouteHops} = require('pathRoute');
const {canPlaceConstructionSite, tryCreateConstructionSite, findBestContainerPos} = require('planUtils');

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

        // Don't sit on keepers while the SKAttacker is only queued, spawning, or dead.
        const dest = this.creep.memory.destination;
        const guard = dest && skGuardRoom(this.creep.memory.colony, dest);
        if (guard && !hasSkAttackerOnSite(guard)) {
            this.creep.memory.onContainer = undefined;
            if (this.creep.room.name === dest || this.creep.room.name === guard) {
                this.creep.fleeHome(true);
                return true;
            }
            this.creep.idleFor(10);
            return true;
        }

        // Recycle when this source was pruned from colony targets (grace in-transit creeps).
        // Empty targets after a global reset are a cache miss, not a drop.
        if (Game.time % 50 === 0 && this.creep.memory.colony && this.creep.memory.other && this.creep.memory.other.source) {
            const targets = ROOM_REMOTE_TARGETS[this.creep.memory.colony];
            const sourceId = this.creep.memory.other.source;
            const dest = this.creep.memory.destination;
            const stillAssigned = targets && targets.some(s => s.source === sourceId);
            if (targets && targets.length && !stillAssigned && (!dest || this.creep.room.name === dest)) {
                return this.creep.recycleCreep();
            }
        }

        // Throttled viability check - recycle if the remote is no longer assigned to this colony
        if (Game.time % 50 === 0 && this.creep.memory.destination && INTEL[this.creep.memory.destination]) {
            const intel = INTEL[this.creep.memory.destination];
            const colony = Game.rooms[this.creep.memory.colony];
            const hostile = intel.level || (intel.reservation && intel.reservation !== MY_USERNAME && intel.reservation !== 'Invader');
            const blocked = intel.threatLevel > 1 || intel.roomHeat > 250 || intel.obstacles;
            const dropped = Memory.avoidRemotes && Memory.avoidRemotes.includes(this.creep.memory.destination);
            const destIsSk = intel.sk || (global.isSourceKeeperRoomName && global.isSourceKeeperRoomName(this.creep.memory.destination));
            const destIsCenter = global.isSectorCenterRoomName && global.isSectorCenterRoomName(this.creep.memory.destination);
            const skUnsafe = (destIsSk || destIsCenter) && (!SK_MINING || !colony || colony.level < SK_MINING_LEVEL);
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
                const colony = this.creep.memory.colony;
                const route = colony ? getMiningRouteRooms(colony, dest) : [];
                return travelRouteHops(this.creep, dest, route, {range: 23});
            }
            this.creep.idleFor(5);
            return;
        }

        if (!this.container || Game.time % 5 === 0) this.refreshContainerTarget();

        if (!this.container) {
            harvestDepositContainer(this.source, this.creep);
            this.refreshContainerTarget();
        }

        if (this.container) {
            if (!this.moveToContainerSpot()) return;
        } else if (!this.creep.pos.isNearTo(this.source)) {
            return this.creep.shibMove(this.source);
        }

        // Build/repair consumes the work intent — do not harvest the same tick.
        if (this.container && this.handleContainer()) return;

        this.handleDroppedResources();

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
            if (!this.container || !this.container.progressTotal) {
                this.creep.idleFor(this.source.ticksToRegeneration + 1);
            }
        }
    }

    /**
     * Stand on the container/site. If a keeper is on the tile, work from range 1
     * instead of chasing the spot forever.
     */
    moveToContainerSpot() {
        if (this.creep.pos.isEqualTo(this.container.pos)) {
            this.creep.memory.onContainer = true;
            return true;
        }
        this.creep.memory.onContainer = undefined;
        const occupant = this.container.pos.checkForCreep();
        const blocked = occupant && occupant.id !== this.creep.id;
        if (blocked && this.creep.pos.isNearTo(this.container)) return true;
        this.creep.shibMove(this.container, {range: blocked ? 1 : 0});
        return false;
    }

    handleContainer() {
        if (this.container.hits) {
            const containerStore = this.container.store.getUsedCapacity();
            if (this.creep.store[RESOURCE_ENERGY]) {
                if (this.container.hits < this.container.hitsMax * 0.5
                    || (this.container.hits < this.container.hitsMax && containerStore >= CONTAINER_CAPACITY * 0.95)) {
                    this.creep.repair(this.container);
                    return true;
                }
            }
            this.creep.memory.energyAmount = containerStore;
            this.creep.memory.energyId = this.container.id;
            return false;
        }

        if (!this.container.progressTotal) return false;

        if (this.creep.store[RESOURCE_ENERGY]) {
            this.creep.build(this.container);
            return true;
        }
        const dropped = this.creep.pos.lookFor(LOOK_RESOURCES)[0];
        if (dropped && dropped.resourceType === RESOURCE_ENERGY) {
            this.creep.pickup(dropped);
            return true;
        }
        this.creep.memory.energyAmount = dropped ? dropped.amount : 0;
        this.creep.memory.energyId = dropped ? dropped.id : undefined;
        return false;
    }

    handleDroppedResources() {
        const dropped = this.creep.pos.lookFor(LOOK_RESOURCES)[0];
        if (dropped) {
            this.creep.memory.energyAmount = dropped.amount;
            this.creep.memory.energyId = dropped.id;
        }
    }
}

function updateHaulingRequired(creep, sourceInfo, onlyIfChanged) {
    const roadsBuilt = routeHasBuiltRoads(creep.memory.colony, creep.memory.destination);
    const colony = Game.rooms[creep.memory.colony];
    const linkFed = !!(colony && colony.links && colony.links.length >= 2);
    const haulScore = effectiveHaulScore(creep.memory.colony, creep.memory.destination, sourceInfo.score);
    const power = creep.getActiveBodyparts(WORK) * HARVEST_POWER;
    const destIntel = INTEL[creep.memory.destination];
    const reserved = destIntel && destIntel.reservation === MY_USERNAME;
    const willReserve = colony && colony.level >= 4;
    const keeperYield = (destIntel && destIntel.sk)
        || (global.isSectorCenterRoomName && global.isSectorCenterRoomName(creep.memory.destination));
    const sourceCap = keeperYield ? SOURCE_ENERGY_KEEPER_CAPACITY
        : (reserved || willReserve ? SOURCE_ENERGY_CAPACITY : SOURCE_ENERGY_NEUTRAL_CAPACITY);
    if (onlyIfChanged && creep.memory.other.haulingRequired
        && creep.memory.other.haulingScore === sourceInfo.score
        && creep.memory.other.haulingEffectiveScore === haulScore
        && creep.memory.other.haulingRoads === roadsBuilt
        && creep.memory.other.haulingLinkFed === linkFed
        && creep.memory.other.haulingSourceCap === sourceCap
        && creep.memory.other.haulingPower === power) {
        return;
    }
    const maxRate = sourceCap / ENERGY_REGEN_TIME;
    const actualRate = Math.min(power, maxRate);
    creep.memory.other.haulingScore = sourceInfo.score;
    creep.memory.other.haulingEffectiveScore = haulScore;
    creep.memory.other.haulingRoads = roadsBuilt;
    creep.memory.other.haulingLinkFed = linkFed;
    creep.memory.other.haulingSourceCap = sourceCap;
    creep.memory.other.haulingPower = power;
    creep.memory.other.harvestRate = actualRate;
    // Total carry capacity (energy units) to clear one round-trip backlog. score ≈ one-way
    // path cost; round trip ≈ 2×score ticks of production at actualRate.
    const roundTripBuffer = roadsBuilt ? 1.25 : 1.4;
    const linkScale = linkFed ? 0.55 : 1;
    creep.memory.other.haulingRequired = actualRate * haulScore * 2 * roundTripBuffer * linkScale;
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

    if (!canPlaceConstructionSite(creep.room)) return;

    const spots = containerCandidatePositions(source);
    for (let i = 0; i < spots.length; i++) {
        const buildPos = spots[i];
        if (buildPos.checkForWall() || buildPos.checkForObstacleStructure()) continue;
        const existing = buildPos.checkForConstructionSites();
        if (existing) {
            if (existing.structureType === STRUCTURE_CONTAINER) return;
            // Source container outranks a road site on the harvest tile.
            if (existing.structureType === STRUCTURE_ROAD && i === 0) {
                existing.remove();
            }
            continue;
        }
        if (tryCreateConstructionSite(buildPos, STRUCTURE_CONTAINER) === OK) return;
    }
}

function containerCandidatePositions(source) {
    const best = findBestContainerPos(source);
    const spots = [];
    const seen = new Set();
    const add = (pos) => {
        if (!pos) return;
        const key = pos.x + 'x' + pos.y;
        if (seen.has(key)) return;
        seen.add(key);
        spots.push(pos);
    };
    add(best);
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (!xOff && !yOff) continue;
            add(new RoomPosition(source.pos.x + xOff, source.pos.y + yOff, source.pos.roomName));
        }
    }
    return spots;
}

profiler.registerClass(RoleRemoteHarvester, 'RemoteHarvester');
module.exports = RoleRemoteHarvester;