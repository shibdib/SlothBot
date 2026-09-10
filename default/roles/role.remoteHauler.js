/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const {getRemoteHarvesterForSource} = require('spawnCounts');
const {
    getMiningRouteRooms,
    hasSkAttackerOnSite,
    skGuardRoom,
    remoteCombatBlocksMining,
    civilianShouldFlee
} = require('remoteMining');
const {travelRouteHops} = require('pathRoute');

class RoleRemoteHauler {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.store = creep.store; // Cache store reference
        this.memory = creep.memory; // Cache memory reference
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.combatFlee()) return;
        if (this.housekeeping()) return;
        if (shouldDeliver(this.creep)) {
            this.deliverResource();
        } else if (this.memory.operation) {
            this.specialDuty();
        } else {
            this.findResource();
        }
    }

    combatFlee() {
        if (!civilianShouldFlee(this.creep)) return false;
        this.creep.fleeHome(true);
        return true;
    }

    housekeeping() {
        if ((this.room.memory.sk || (INTEL[this.room.name] && INTEL[this.room.name].sk)) && this.creep.skSafety()) return true;
        const remoteRoom = this.memory.other && this.memory.other.remoteRoom;
        if (!this.store.getUsedCapacity()) {
            const guard = (this.memory.other && this.memory.other.skRoom)
                || (remoteRoom && skGuardRoom(this.memory.colony, remoteRoom));
            if (guard && !hasSkAttackerOnSite(guard)) {
                if (this.room.name !== this.memory.colony) {
                    this.creep.fleeHome(true);
                    return true;
                }
                return waitOffOwnedExit(this.creep);
            }
        }
        if (Game.time % 50 === 0 && safemodeGeneration(this.creep)) return true;
        // Recycle if the assigned remote is no longer viable (destination is the colony, not the remote).
        if (Game.time % 30 === 0 && remoteRoom && INTEL[remoteRoom]) {
            const intel = INTEL[remoteRoom];
            const hostile = intel.level || (intel.reservation && intel.reservation !== MY_USERNAME && intel.reservation !== 'Invader');
            const dropped = Memory.avoidRemotes && Memory.avoidRemotes.includes(remoteRoom);
            if (hostile || intel.obstacles || dropped) return this.creep.recycleCreep();
        }
        if (Game.time % 50 === 0 && this.memory.colony && this.memory.other && this.memory.other.source) {
            const targets = ROOM_REMOTE_TARGETS[this.memory.colony];
            const stillAssigned = targets && targets.some(s => s.source === this.memory.other.source);
            if (targets && targets.length && !stillAssigned && !this.store.getUsedCapacity()) {
                // Empty list is a cache miss. A short post-reset list is too —
                // vision re-papers one source before the rest are ingested.
                const postReset = global.isPostResetDangerWindow && global.isPostResetDangerWindow();
                if (!postReset && !getRemoteHarvesterForSource(this.memory.other.source)) {
                    return this.creep.recycleCreep();
                }
            }
        }
        if (!this.memory.exitLinkCheck && this.store.getUsedCapacity() > 0 && this.room.name === this.memory.colony) this.exitLinkCheck();
        if (this.store[RESOURCE_ENERGY]) repairRouteRoad(this.creep);
        this.creep.say(ICONS.haul2, true);
        return false;
    }

    deliverResource() {
        const storeSum = this.store.getUsedCapacity();
        if (!storeSum) {
            this.memory.storageDestination = undefined;
            return;
        }

        const colony = this.memory.colony;
        if (colony && this.room.name !== colony) {
            const remoteRoom = (this.memory.other && this.memory.other.remoteRoom) || this.room.name;
            const route = getMiningRouteRooms(colony, remoteRoom);
            return travelRouteHops(this.creep, colony, route, {range: 23});
        }

        // Early check for non-energy resources in container
        if (storeSum > this.store[RESOURCE_ENERGY] && this.memory.storageDestination) {
            const dest = Game.getObjectById(this.memory.storageDestination);
            if (dest instanceof StructureContainer) {
                this.memory.storageDestination = undefined;
            }
        }

        if (!Game.getObjectById(this.memory.energyDestination)) this.memory.energyDestination = undefined;

        const colonyRoom = Game.rooms[this.memory.colony] || this.room;
        if (this.memory.storageDestination) {
            const cached = Game.getObjectById(this.memory.storageDestination);
            if (!isRemoteDumpTarget(colonyRoom, cached, this.memory.exitLink)) {
                this.memory.storageDestination = undefined;
            }
        }
        if (!this.memory.storageDestination) dropOff(this.creep);
        let dest = Game.getObjectById(this.memory.storageDestination);
        if (dest && dumpTo(this.creep, dest)) return;
        if (!this.memory.storageDestination) dropOff(this.creep);
        dest = Game.getObjectById(this.memory.storageDestination);
        if (dest) dumpTo(this.creep, dest);
    }

    findResource() {
        const other = this.memory.other || (this.memory.other = {});
        const remoteRoom = other.remoteRoom;
        if (remoteRoom && this.room.name !== remoteRoom) {
            if (remoteCombatBlocksMining(remoteRoom)) {
                if (this.room.name === this.memory.colony) return waitOffOwnedExit(this.creep);
                this.creep.fleeHome(true);
                return true;
            }
            if (this.pickupColonyDroppedEnergy()) return true;
            const colony = this.memory.colony;
            const route = colony ? getMiningRouteRooms(colony, remoteRoom) : [];
            return travelRouteHops(this.creep, remoteRoom, route, {range: 20});
        }

        if (this.memory.energyDestination && this.creep.withdrawResource()) {
            return true;
        }

        const container = Game.getObjectById(this.memory.containerID);
        if (container && container.store) {
            if (container.store[RESOURCE_ENERGY]) {
                this.memory.energyDestination = container.id;
                return this.creep.withdrawResource();
            }
            if (this.creep.pos.getRangeTo(container) > 1) {
                return this.creep.shibMove(container, {range: 1});
            }
            const pile = energyPileAt(container.pos, this.room);
            if (pile) {
                this.memory.energyDestination = pile.id;
                return this.creep.withdrawResource();
            }
            return false;
        }

        let harvester = Game.getObjectById(other.harvester);
        if (!harvester || (harvester.memory.other && harvester.memory.other.source !== other.source)) {
            harvester = getRemoteHarvesterForSource(other.source);
            other.harvester = harvester ? harvester.id : undefined;
        }
        if (harvester) {
            if (harvester.memory.containerID) this.memory.containerID = harvester.memory.containerID;
            else if (harvester.memory.containerSite) this.memory.containerID = harvester.memory.containerSite;
            const fresh = Game.getObjectById(this.memory.containerID);
            if (fresh && fresh.store && fresh.store[RESOURCE_ENERGY]) {
                this.memory.energyDestination = fresh.id;
                return this.creep.withdrawResource();
            }
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

        if (other.source) {
            return moveToPickupPad(this.creep, other, harvester);
        }

        if (this.randomLoot()) {
            return this.creep.withdrawResource();
        }

        return false;
    }

    specialDuty() {
        if (this.memory.destination !== this.room.name) {
            const dest = this.memory.destination;
            const colony = this.memory.colony;
            const route = colony ? getMiningRouteRooms(colony, dest) : [];
            return travelRouteHops(this.creep, dest, route, {range: 23});
        }
        this.findResource();
        return this.memory.energyDestination && this.creep.withdrawResource();
    }

    // Empty in colony: only grab a large pile already underfoot / adjacent.
    pickupColonyDroppedEnergy() {
        if (this.room.name !== this.memory.colony) return false;
        if (this.memory.energyDestination && this.creep.withdrawResource()) return true;

        const piles = this.room.droppedEnergy;
        if (!piles || !piles.length) return false;

        const minAmount = 500;
        const pos = this.creep.pos;
        for (let i = 0; i < piles.length; i++) {
            const r = piles[i];
            if (r.amount < minAmount) continue;
            if (pos.getRangeTo(r) > 1) continue;
            this.memory.energyDestination = r.id;
            return this.creep.withdrawResource();
        }
        return false;
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
        const room = this.room;
        const pos = this.creep.pos;
        const storage = room.storage;
        const links = room.links || [];
        let best = null;
        let bestRange = 10;
        for (let i = 0; i < links.length; i++) {
            const l = links[i];
            if (!l || isHarvestDumpLink(room, l)) continue;
            const range = pos.getRangeTo(l);
            if (range > 9) continue;
            if (storage && range >= pos.getRangeTo(storage)) continue;
            if (range < bestRange) {
                bestRange = range;
                best = l;
            }
        }
        if (best) this.memory.exitLink = best.id;
    }
}

function isHarvestDumpLink(room, link) {
    if (!room || !link) return true;
    if (room.memory.hubLink && link.id === room.memory.hubLink) return true;
    if (room.memory.controllerLink && link.id === room.memory.controllerLink) return true;
    const sources = room.sources || [];
    for (let i = 0; i < sources.length; i++) {
        const mem = sources[i].memory;
        if (mem && mem.link === link.id) return true;
    }
    return false;
}

function shouldDeliver(creep) {
    const used = creep.store.getUsedCapacity();
    if (!used) return false;
    if (used > (creep.store[RESOURCE_ENERGY] || 0)) return true;
    if (creep.isFull) return true;
    const remoteRoom = creep.memory.other && creep.memory.other.remoteRoom;
    if (!remoteRoom || creep.room.name !== remoteRoom) return true;
    return ttlTooLowToWait(creep);
}

function ttlTooLowToWait(creep) {
    const ttl = creep.ticksToLive;
    if (!ttl || ttl === Infinity) return false;
    const colony = creep.memory.colony;
    const remote = creep.memory.other && creep.memory.other.remoteRoom;
    let hops = 1;
    if (colony && remote) {
        hops = Game.map.getRoomLinearDistance(colony, remote) || 1;
        const route = getMiningRouteRooms(colony, remote);
        if (route && route.length) hops = Math.max(hops, route.length);
    }
    return ttl < hops * 50 + 20;
}

function energyPileAt(pos, room) {
    if (!pos || !room) return null;
    const piles = room.droppedEnergy;
    if (!piles || !piles.length) return null;
    for (let i = 0; i < piles.length; i++) {
        const r = piles[i];
        if (r.amount > 0 && r.pos.x === pos.x && r.pos.y === pos.y) return r;
    }
    return null;
}

function moveToPickupPad(creep, other, harvester) {
    const container = Game.getObjectById(creep.memory.containerID);
    if (container) {
        if (creep.pos.getRangeTo(container) > 1) {
            creep.shibMove(container, {range: 1});
            return true;
        }
        return false;
    }
    if (harvester) {
        if (creep.pos.getRangeTo(harvester) > 1) {
            creep.shibMove(harvester, {range: 1});
            return true;
        }
        return false;
    }
    const source = other && other.source && Game.getObjectById(other.source);
    if (source) {
        if (creep.pos.getRangeTo(source) > 1) {
            creep.shibMove(source, {range: 1});
            return true;
        }
        return false;
    }
    return false;
}

function repairRouteRoad(creep) {
    if (!creep.hasActiveBodyparts(WORK) || !creep.store[RESOURCE_ENERGY]) return;
    const road = creep.pos.checkForRoad && creep.pos.checkForRoad();
    if (road && road.hits < road.hitsMax) creep.repair(road);
}

function isRemoteDumpTarget(colony, dest, exitLinkId) {
    if (!dest || !colony) return false;
    if (exitLinkId && dest.id === exitLinkId) return true;
    if (colony.storage && dest.id === colony.storage.id) return true;
    if (colony.terminal && dest.id === colony.terminal.id) return true;
    if (colony.protoStorage && dest.id === colony.protoStorage.id) return true;
    return false;
}

function dumpTo(creep, dest) {
    if (!dest || !dest.store) {
        delete creep.memory.storageDestination;
        return false;
    }
    if (dest.store.getFreeCapacity(RESOURCE_ENERGY) <= 0) {
        delete creep.memory.storageDestination;
        return false;
    }
    for (const resourceType in creep.store) {
        const result = creep.transfer(dest, resourceType);
        if (result === OK) {
            delete creep.memory.storageDestination;
            creep.clearShibMove();
            return true;
        }
        if (result === ERR_NOT_IN_RANGE) {
            creep.shibMove(dest);
            return true;
        }
        if (result === ERR_FULL) {
            delete creep.memory.storageDestination;
            return false;
        }
    }
    return false;
}

function waitOffOwnedExit(creep) {
    const {x, y} = creep.pos;
    if (x <= 2 || x >= 47 || y <= 2 || y >= 47) {
        const dest = creep.room.storage || creep.room.terminal
            || (creep.room.spawns && creep.room.spawns[0]);
        creep.shibMove(dest || new RoomPosition(25, 25, creep.room.name), {range: 15});
        return true;
    }
    return creep.idleFor(10);
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
        if (!link || isHarvestDumpLink(creep.room, link)) {
            memory.exitLink = undefined;
            memory.exitLinkCheck = undefined;
        } else if (link.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            creep.memory.linkWait = 0;
            return memory.storageDestination = creep.memory.exitLink;
        }
        // Full exit link: skip the wait and dump to storage this tick.
        creep.memory.linkWait = 0;
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

    if (memory.storageDestination) {
        const dest = Game.getObjectById(memory.storageDestination);
        if (isRemoteDumpTarget(colony, dest, memory.exitLink)
            && dest.store.getFreeCapacity(RESOURCE_ENERGY) > 0) return;
        memory.storageDestination = undefined;
    }

    if (colony.storage && colony.storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        memory.storageDestination = colony.storage.id;
    } else if (colony.terminal && colony.terminal.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        memory.storageDestination = colony.terminal.id;
    } else if (colony.protoStorage && colony.protoStorage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        memory.storageDestination = colony.protoStorage.id;
    } else {
        const dump = colony.storage || colony.terminal || colony.protoStorage;
        if (dump) creep.shibMove(dump, {range: 1});
    }
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
            const result = creep.withdraw(ghodiumStorage, RESOURCE_GHODIUM, SAFE_MODE_COST);
            if (result === ERR_NOT_IN_RANGE) {
                creep.shibMove(ghodiumStorage);
            } else if (result === OK || result === ERR_FULL || result === ERR_NOT_ENOUGH_RESOURCES) {
                memory.storageDestination = undefined;
                creep.clearShibMove();
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