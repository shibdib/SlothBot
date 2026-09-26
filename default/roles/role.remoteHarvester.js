/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const {routeHasBuiltRoads} = require('bodyHelpers');
const {
    effectiveHaulScore,
    getMiningRouteRooms,
    skGuardRoom,
    skGuardBlocksWork,
    remoteCombatBlocksMining,
    civilianShouldFlee
} = require('remoteMining');
const {travelRouteHops} = require('pathRoute');
const {
    findBestContainerPos,
    ensureSourceContainerSite,
} = require('planUtils');

class RoleRemoteHarvester {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        if (!this.creep.memory.other) this.creep.memory.other = {};
        this.source = this.resolveSource();
        const dest = this.creep.memory.destination;
        const skGuarded = dest && skGuardRoom(this.creep.memory.colony, dest);
        // Site completion and SK rooms need a live object, not a 50-tick stale id.
        if (this.creep.memory.onContainer && Game.time % 50 !== 0
            && !this.creep.memory.containerSite && !skGuarded) {
            this.container = Game.getObjectById(this.creep.memory.containerID)
                || Game.getObjectById(this.creep.memory.containerSite);
        } else {
            this.refreshContainerTarget();
        }
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
        if (!colony || !destination || !ROOM_REMOTE_TARGETS[colony]) return undefined;

        const inDest = this.creep.room.name === destination;
        const targets = ROOM_REMOTE_TARGETS[colony];
        const tryBind = (sourceId) => {
            if (!sourceId) return undefined;
            const obj = Game.getObjectById(sourceId);
            if (!obj) return undefined;
            other.source = sourceId;
            return obj;
        };

        if (!inDest) {
            if (other.source) return tryBind(other.source);
            const match = _.find(targets, s => s.room === destination);
            return match ? tryBind(match.source) : undefined;
        }

        // In dest a stale id is not coming back. Rebind to a live assigned source.
        if (other.source) {
            const preferred = tryBind(other.source);
            if (preferred) return preferred;
        }
        for (let i = 0; i < targets.length; i++) {
            const s = targets[i];
            if (s.room !== destination) continue;
            const obj = tryBind(s.source);
            if (obj) return obj;
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
        if (this.combatFlee()) return;
        if (this.stationaryHarvest()) return;
        if (this.housekeeping()) return;
        this.harvestSource();
    }

    combatFlee() {
        if (!civilianShouldFlee(this.creep)) return false;
        this.creep.memory.onContainer = undefined;
        this.creep.fleeHome(true);
        return true;
    }

    isSkRoom() {
        return !!(this.room.memory.sk || (INTEL[this.room.name] && INTEL[this.room.name].sk));
    }

    /**
     * On-container in a non-SK room: harvest/repair only. Full housekeeping every 50 ticks.
     */
    stationaryHarvest() {
        if (!this.creep.memory.onContainer || !this.source) return false;
        if (this.isSkRoom()) return false;
        // Sector-center harvest sits behind an SK. Recheck the guard every tick
        // so an invader wave in the SK room pauses this room too.
        const dest = this.creep.memory.destination;
        if (dest && skGuardRoom(this.creep.memory.colony, dest)) return false;
        // A construction site has no hits. onContainer used to stay set and
        // this shortcut harvested for 49 ticks between build attempts.
        if (!this.container || !this.container.hits) {
            this.creep.memory.onContainer = undefined;
            return false;
        }
        if (Game.time % 50 === 0) return false;
        if (!this.creep.pos.isEqualTo(this.container.pos)) {
            this.creep.memory.onContainer = undefined;
            return false;
        }
        if (this.handleContainer()) return true;
        const result = this.creep.harvest(this.source);
        if (result === ERR_NOT_IN_RANGE) {
            this.creep.memory.onContainer = undefined;
        } else if (result === ERR_NOT_ENOUGH_RESOURCES) {
            this.onSourceEmpty();
        }
        return true;
    }

    housekeeping() {
        // SK Safety - Throttled
        if (this.isSkRoom() && this.creep.skSafety()) {
            this.creep.memory.onContainer = undefined;
            return true;
        }

        // Don't sit on keepers while the SKAttacker is queued, spawning, traveling, or dead.
        const dest = this.creep.memory.destination;
        if (dest && skGuardBlocksWork(this.creep.memory.colony, dest)) {
            this.creep.memory.onContainer = undefined;
            if (this.creep.room.name === this.creep.memory.colony) {
                this.creep.idleFor(10);
                return true;
            }
            this.creep.fleeHome(true);
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
                if (!(global.isPostResetDangerWindow && global.isPostResetDangerWindow())) {
                    return this.creep.recycleCreep();
                }
            }
        }

        // Throttled viability check - recycle if the remote is no longer assigned to this colony
        if (Game.time % 50 === 0 && this.creep.memory.destination && INTEL[this.creep.memory.destination]) {
            const intel = INTEL[this.creep.memory.destination];
            const colony = Game.rooms[this.creep.memory.colony];
            const hostile = intel.level || (intel.reservation && intel.reservation !== MY_USERNAME && intel.reservation !== 'Invader');
            const dropped = Memory.avoidRemotes && Memory.avoidRemotes.includes(this.creep.memory.destination);
            const destIsSk = intel.sk || (global.isSourceKeeperRoomName && global.isSourceKeeperRoomName(this.creep.memory.destination));
            const destIsCenter = global.isSectorCenterRoomName && global.isSectorCenterRoomName(this.creep.memory.destination);
            const skUnsafe = (destIsSk || destIsCenter) && (!SK_MINING || !colony || colony.level < SK_MINING_LEVEL);
            // Transient combat is not a recycle: stay assigned, flee only in range.
            if (hostile || intel.obstacles || dropped || skUnsafe || !intel.sources) {
                if (hostile) this.room.cacheRoomIntel(true);
                return this.creep.recycleCreep();
            }
        }

        if (this.creep.memory.other && this.creep.memory.other.source) {
            const needInit = !this.creep.memory.other.haulingRequired;
            if (needInit || Game.time % 50 === 0) {
                const sourceInfo = _.find(ROOM_REMOTE_TARGETS[this.creep.memory.colony], (s) => s.source === this.creep.memory.other.source);
                if (sourceInfo) updateHaulingRequired(this.creep, sourceInfo, !needInit);
            }
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
                if (remoteCombatBlocksMining(dest)) {
                    if (this.creep.room.name === this.creep.memory.colony) {
                        this.creep.idleFor(10);
                        return;
                    }
                    this.creep.fleeHome(true);
                    return;
                }
                const colony = this.creep.memory.colony;
                const route = colony ? getMiningRouteRooms(colony, dest) : [];
                return travelRouteHops(this.creep, dest, route, {range: 23});
            }
            // Assigned sources are visible in dest. Stale id / empty claim: recycle.
            return this.creep.recycleCreep();
        }

        if (!this.container || Game.time % 5 === 0) this.refreshContainerTarget();

        const built = this.container && this.container.hits;
        if (!built) {
            return this.harvestThenBuildPad();
        }

        if (!this.moveToContainerSpot()) return;

        // Build/repair consumes the work intent — do not harvest the same tick.
        if (this.handleContainer()) return;

        this.handleDroppedResources();

        const result = this.creep.harvest(this.source);
        if (result === OK) {
            if (!this.creep.memory.other.haulingRequired) {
                const sourceInfo = _.find(ROOM_REMOTE_TARGETS[this.creep.memory.colony], (s) => s.source === this.creep.memory.other.source);
                if (sourceInfo) updateHaulingRequired(this.creep, sourceInfo);
            }
        } else if (result === ERR_NOT_IN_RANGE) {
            this.creep.shibMove(this.source);
        } else if (result === ERR_NOT_ENOUGH_RESOURCES) {
            this.onSourceEmpty();
        }
    }

    /**
     * Stand on the container/site. Occupied tile: stay at range 1 and harvest.
     * Transfer into the pad if a friendly is sitting on it (does not consume WORK).
     */
    moveToContainerSpot() {
        if (this.creep.pos.isEqualTo(this.container.pos)) {
            this.creep.memory.onContainer = true;
            return true;
        }
        this.creep.memory.onContainer = undefined;
        const occupant = this.container.pos.checkForCreep();
        const blocked = occupant && occupant.id !== this.creep.id;
        if (!blocked) {
            this.creep.shibMove(this.container, {range: 0});
            return false;
        }
        if (!this.creep.pos.isNearTo(this.container)) {
            this.creep.shibMove(this.container, {range: 1});
            return false;
        }
        if (occupant.my && this.creep.store[RESOURCE_ENERGY] && this.container.store
            && this.container.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            this.creep.transfer(this.container, RESOURCE_ENERGY);
        }
        return true;
    }

    onSourceEmpty() {
        const container = this.container;
        if (container && container.hits && container.hits < this.container.hitsMax) {
            if (this.creep.store[RESOURCE_ENERGY]) this.creep.repair(container);
            return;
        }
        if (!container || !container.progressTotal) {
            const dest = this.creep.memory.destination;
            // idle skips the role (and skSafety / combatFlee) until it expires.
            if (this.isSkRoom() || (dest && skGuardRoom(this.creep.memory.colony, dest))) return;
            const regen = this.source && this.source.ticksToRegeneration;
            this.creep.idleFor(Math.max(1, Math.min(5, regen || 1)));
        }
    }

    handleContainer() {
        if (this.container.hits) {
            const store = this.container.store;
            const containerStore = store ? store.getUsedCapacity() : 0;
            const damaged = this.container.hits < this.container.hitsMax;
            const sourceEmpty = !this.source || !this.source.energy;
            const full = store && !store.getFreeCapacity(RESOURCE_ENERGY);
            const carry = this.creep.store[RESOURCE_ENERGY];
            if (damaged && (sourceEmpty || full)) {
                if (carry) {
                    this.creep.repair(this.container);
                    return true;
                }
                if (sourceEmpty && store && store[RESOURCE_ENERGY]) {
                    this.creep.withdraw(this.container, RESOURCE_ENERGY);
                    return true;
                }
            }
            this.creep.memory.energyAmount = containerStore;
            this.creep.memory.energyId = this.container.id;
            // Full pad: leave energy in the source instead of dropping, unless
            // we still need one harvest tick to load carry for repair.
            if (full && !sourceEmpty && (carry || !damaged)) {
                this.handleDroppedResources();
                return true;
            }
            return false;
        }

        return false;
    }

    harvestThenBuildPad() {
        if (!this.container) {
            ensureSourceContainerSite(this.source, this.room);
            this.refreshContainerTarget();
        }
        const padPos = (this.container && this.container.pos) || findBestContainerPos(this.source);
        if (padPos) {
            if (!this.creep.pos.isEqualTo(padPos)) {
                this.creep.memory.onContainer = undefined;
                const occupant = padPos.checkForCreep && padPos.checkForCreep();
                if (occupant && occupant.id !== this.creep.id) {
                    if (!this.creep.pos.isNearTo(padPos)) {
                        return this.creep.shibMove(padPos, {range: 1});
                    }
                } else {
                    return this.creep.shibMove(padPos, {range: 0});
                }
            } else if (this.container && this.container.hits) {
                this.creep.memory.onContainer = true;
            } else {
                this.creep.memory.onContainer = undefined;
            }
        } else if (!this.creep.pos.isNearTo(this.source)) {
            return this.creep.shibMove(this.source);
        }

        const site = this.container && this.container.progressTotal && !this.container.hits
            ? this.container : null;
        if (site && this.creep.store[RESOURCE_ENERGY]) {
            this.creep.build(site);
            return;
        }

        this.handleDroppedResources();

        const result = this.creep.harvest(this.source);
        if (result === OK) {
            if (!this.creep.memory.other.haulingRequired) {
                const sourceInfo = _.find(ROOM_REMOTE_TARGETS[this.creep.memory.colony], (s) => s.source === this.creep.memory.other.source);
                if (sourceInfo) updateHaulingRequired(this.creep, sourceInfo);
            }
        } else if (result === ERR_NOT_IN_RANGE) {
            this.creep.shibMove(this.source);
        } else if (result === ERR_NOT_ENOUGH_RESOURCES) {
            this.onSourceEmpty();
        }
    }

    handleDroppedResources() {
        // Stamp only. Pickup would consume the harvest intent on a 1-CARRY body.
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
        && creep.memory.other.haulingLinkFed === undefined
        && creep.memory.other.haulingScore === sourceInfo.score
        && creep.memory.other.haulingEffectiveScore === haulScore
        && creep.memory.other.haulingRoads === roadsBuilt
        && creep.memory.other.haulingSourceCap === sourceCap
        && creep.memory.other.haulingPower === power) {
        return;
    }
    const maxRate = sourceCap / ENERGY_REGEN_TIME;
    const actualRate = Math.min(power, maxRate);
    creep.memory.other.haulingScore = sourceInfo.score;
    creep.memory.other.haulingEffectiveScore = haulScore;
    creep.memory.other.haulingRoads = roadsBuilt;
    creep.memory.other.haulingSourceCap = sourceCap;
    creep.memory.other.haulingPower = power;
    creep.memory.other.harvestRate = actualRate;
    delete creep.memory.other.haulingLinkFed;
    // Total carry capacity (energy units) to clear one round-trip backlog. score ≈ one-way
    // path cost; round trip ≈ 2×score ticks of production at actualRate.
    // Hub+controller links do not shrink remote haul; exit-link dumps are opportunistic.
    let roundTripBuffer = roadsBuilt ? 1.25 : 1.4;
    if (keeperYield) roundTripBuffer += 0.15;
    creep.memory.other.haulingRequired = actualRate * haulScore * 2 * roundTripBuffer;
}

profiler.registerClass(RoleRemoteHarvester, 'RemoteHarvester');
module.exports = RoleRemoteHarvester;