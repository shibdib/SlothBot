/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Refactored & Deep-Dived by Grok (xAI) - May 2026
 *
 * Version 2.0 - Major CPU + Logic Improvements
 *
 * CPU Wins:
 * - Per-tick caches in locateEnergy / haulerDelivery (biggest win)
 * - Combined structure filters into single passes
 * - Reduced findClosestByRange calls
 * - Streamlined idle / borderCheck / constructionWork
 * - Faster random movement + early exits everywhere
 *
 * Logic Wins:
 * - More robust towing and renewal handling
 * - Better hauler group assignment caching
 * - Cleaner boost logic with early failure
 * - Improved edge-case handling (nukes, borders, stuck states)
 */

'use strict';

const {empireOpsPaused} = require('hcReadiness');
const {runTowTruck} = require('pathTow');
const {clearShibMove, getShibMove} = require('pathUtils');
const {isOptionalSiegeBoost} = require('bodySiegeBoosts');

const exitTileCache = {};

function factoryUnpackingEnergy(room) {
    const factory = room.factory;
    return factory && (factory.memory.producing === RESOURCE_ENERGY || !factory.memory.producing) && factory.store[RESOURCE_ENERGY] > 0;
}

function getRoomExits(room) {
    if (!exitTileCache[room.name]) exitTileCache[room.name] = room.find(FIND_EXIT);
    return exitTileCache[room.name];
}

const REMOTE_REPAIRABLE = new Set([STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_WALL, STRUCTURE_RAMPART]);
const PRIORITY_BUILD_TYPES = [
    STRUCTURE_SPAWN, STRUCTURE_EXTENSION, STRUCTURE_STORAGE, STRUCTURE_CONTAINER,
    STRUCTURE_LINK, STRUCTURE_TERMINAL, STRUCTURE_LAB, STRUCTURE_FACTORY, STRUCTURE_POWER_SPAWN,
];

function constructionSiteOwner(site) {
    if (site.safeOwnerName) return site.safeOwnerName();
    try {
        return site.owner && site.owner.username;
    } catch (e) {
        return undefined;
    }
}

function isFriendlyConstructionSite(site) {
    const owner = constructionSiteOwner(site);
    return !owner || _.includes(FRIENDLIES, owner);
}

function getClaimedConstructionIds(room) {
    const claimed = new Set();
    for (const c of room.myCreeps) {
        if (c.memory.constructionSite) claimed.add(c.memory.constructionSite);
    }
    return claimed;
}

function collectConstructionBuckets(room) {
    const byType = {};
    const roads = [];
    const barriers = [];
    let misc = [];
    for (const s of room.constructionSites) {
        if (!isFriendlyConstructionSite(s)) continue;
        (byType[s.structureType] = byType[s.structureType] || []).push(s);
        if (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) barriers.push(s);
        else if (s.structureType === STRUCTURE_ROAD) roads.push(s);
    }
    for (const t in byType) {
        if (t !== STRUCTURE_WALL && t !== STRUCTURE_RAMPART && t !== STRUCTURE_ROAD) {
            misc = misc.concat(byType[t]);
        }
    }
    return {byType, misc, roads, barriers};
}

let repairCapTick = -1;
const repairCapCache = Object.create(null);

function wallRepairCap(room, structure) {
    if (repairCapTick !== Game.time) {
        repairCapTick = Game.time;
        for (const key in repairCapCache) delete repairCapCache[key];
    }
    let entry = repairCapCache[room.name];
    if (!entry) {
        const rcl = room.level;
        let targetLimit = 100000;
        if (rcl >= 8) targetLimit = 10000000;
        else if (rcl >= 6) targetLimit = 5000000;
        if (room.energyState === 1) targetLimit = Math.min(targetLimit, 200000);
        entry = {
            targetLimit,
            quadTrap: new Set((room.memory.quadTrapWalls || []).map(p => `${p.x},${p.y}`)),
        };
        repairCapCache[room.name] = entry;
    }
    if (structure && entry.quadTrap.has(`${structure.pos.x},${structure.pos.y}`)) {
        return Math.min(entry.targetLimit, 20000);
    }
    return entry.targetLimit;
}

function collectStructureDamage(room, claimedIds, ownedByMe) {
    const walls = [];
    const ramparts = [];
    const containers = [];
    const roads = [];
    const other = [];
    const allBarriers = [];
    const barriers = room.barriers || [];
    for (const s of barriers) {
        allBarriers.push(s);
        if (claimedIds.has(s.id)) continue;
        if (s.structureType === STRUCTURE_WALL) {
            if (s.hits < wallRepairCap(room, s)) walls.push(s);
        } else if (s.structureType === STRUCTURE_RAMPART && s.hits < s.hitsMax) {
            ramparts.push(s);
        }
    }
    const addDamaged = (list, dest) => {
        for (const s of list) {
            if (claimedIds.has(s.id) || s.hits >= s.hitsMax) continue;
            dest.push(s);
        }
    };
    addDamaged(room.containers, containers);
    addDamaged(room.roads, roads);
    if (ownedByMe) {
        const extras = (room.spawns || []).concat(room.extensions || [], room.towers || [], room.labs || [], room.links || []);
        if (room.storage) extras.push(room.storage);
        if (room.terminal) extras.push(room.terminal);
        addDamaged(extras, other);
    }
    return {walls, ramparts, containers, roads, other, allBarriers};
}

let constructionScanTick = -1;
const constructionScanCache = Object.create(null);

function getConstructionScan(room) {
    if (constructionScanTick !== Game.time) {
        constructionScanTick = Game.time;
        for (const key in constructionScanCache) delete constructionScanCache[key];
    }
    if (constructionScanCache[room.name]) return constructionScanCache[room.name];
    const intel = INTEL[room.name];
    const ownedByMe = !!(intel && intel.owner === MY_USERNAME);
    const claimedIds = getClaimedConstructionIds(room);
    constructionScanCache[room.name] = {
        intel,
        ownedByMe,
        claimedIds,
        damage: collectStructureDamage(room, claimedIds, ownedByMe),
        sites: collectConstructionBuckets(room),
    };
    return constructionScanCache[room.name];
}

function weakestByHitsRatio(structures) {
    return structures.length ? _.min(structures, s => s.hits / s.hitsMax) : null;
}

function weakestBarrierNearHostiles(barriers, hostiles) {
    let weakest = null;
    for (const s of barriers) {
        if (!s.pos.findInRange(hostiles, 5).length) continue;
        if (!weakest || s.hits < weakest.hits) weakest = s;
    }
    return weakest;
}

function clearConstructionMemory(creep) {
    creep.memory.constructionSite = undefined;
    creep.memory.task = undefined;
    creep.memory.sitePos = undefined;
    creep.memory.targetHits = undefined;
}

function isNearRoomSource(creep) {
    const sources = creep.room.sources;
    for (let i = 0; i < sources.length; i++) {
        if (creep.pos.isNearTo(sources[i])) return true;
    }
    return false;
}

Object.defineProperty(Creep.prototype, "idle", {
    configurable: true,
    get: function () {
        if (this.memory.idle === undefined) return 0;

        const now = Game.time;
        if (this.memory.idle <= now ||
            (this.ticksToLive >= 1485 || this.hasActiveBodyparts(CLAIM)) ||
            this.room.hostileCreeps.length ||
            (INTEL[this.room.name] && INTEL[this.room.name].threatLevel)) {
            delete this.memory.idle;
            delete this.memory.idleSet;
            return 0;
        }

        if (this.memory.runCooldown && this.memory.ranFrom && INTEL[this.memory.ranFrom] && !INTEL[this.memory.ranFrom].numberOfHostiles) {
            delete this.memory.idle;
            delete this.memory.ranFrom;
            delete this.memory.runCooldown;
            return 0;
        }

        if (!this.memory.idleSet) {
            const militaryCreep = this.hasActiveBodyparts(ATTACK) || this.hasActiveBodyparts(RANGED_ATTACK);
            if ((militaryCreep && this.pos.checkForRampart()) || !this.hasActiveBodyparts(MOVE)) {
                this.memory.idleSet = true;
            } else if (!this.memory.role.includes("Harvester") && (this.pos.checkForRoad() || this.pos.checkForContainer() || this.pos.lookForNearby(LOOK_SOURCES, true, 2)[0])) {
                return this.moveRandom();
            } else {
                this.memory.idleSet = true;
            }
        }

        this.say(_.sample([ICONS.wait23, ICONS.wait21, ICONS.wait19, ICONS.wait17, ICONS.wait13, ICONS.wait11, ICONS.wait7, ICONS.wait10, ICONS.wait3, ICONS.wait1]), true);
        return this.memory.idle;
    },
    set: function (val) {
        if (!val && this.memory.idle) {
            delete this.memory.idle;
        } else {
            this.memory.idle = val;
        }
    }
});

Object.defineProperty(Creep.prototype, 'isFull', {
    get: function () {
        if (!this._isFull) {
            this._isFull = this.store.getUsedCapacity() >= this.store.getCapacity() * 0.98;
        }
        return this._isFull;
    },
    enumerable: false,
    configurable: true
});

Creep.prototype.idleFor = function (ticks = 0) {
    if (this.hits < this.hitsMax && this.hasActiveBodyparts(HEAL)) return this.heal(this);
    if (ticks > 0) {
        this.idle = Game.time + ticks;
    } else {
        delete this.memory.idle;
        delete this.memory.idleSet;
    }
    return true;
};

Creep.prototype.getActiveBodyparts = function (type) {
    if (this.className || !this.body) return 0;
    let count = 0;
    for (let i = this.body.length; i-- > 0;) {
        if (this.body[i].hits > 0) {
            if (this.body[i].type === type) count++;
        } else break;
    }
    return count;
};

Creep.prototype.hasActiveBodyparts = function (type) {
    if (this.className || !this.body) return false;
    for (let i = this.body.length; i-- > 0;) {
        if (this.body[i].hits > 0) {
            if (this.body[i].type === type) return true;
        } else break;
    }
    return false;
};

Creep.prototype.wrongRoom = function () {
    if (this.pos.roomName !== this.memory.colony) {
        this.shibMove(new RoomPosition(25, 25, this.memory.colony), {range: 23});
        return true;
    }
};

Creep.prototype.findSource = function (ignoreOthers = false) {
    if (!this.memory.other) this.memory.other = {};
    const sources = this.room.sources;
    let source;
    if (ignoreOthers) {
        source = _.sample(sources);
    } else {
        const claimed = new Set();
        const role = this.memory.role;
        for (const creep of this.room.myCreeps) {
            if (creep.id === this.id || creep.memory.role !== role) continue;
            const sid = creep.memory.other && creep.memory.other.source;
            if (sid) claimed.add(sid);
        }
        source = sources.find(s => !claimed.has(s.id));
    }
    if (source) {
        this.memory.other.source = source.id;
        return source.id;
    }
    return false;
};

Creep.prototype.skSafety = function () {
    if (this.room.controller) {
        if (this.room.controller.safeMode) return false;
        if (this.room.controller.owner && FRIENDLIES.includes(this.room.controller.owner.username) && this.room.towers[0]) return false;
    }

    const armedEnemy = this.room.hostileCreeps.find(c => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK));
    if (this.hits < this.hitsMax * 0.5 && armedEnemy && this.pos.getRangeTo(armedEnemy) <= 4) {
        this.fleeHome(true);
        return true;
    }

    const intel = INTEL[this.room.name];
    const isSkRoom = !!(intel?.sk || this.room.keeperLairs.length ||
        (global.isSourceKeeperRoomName && global.isSourceKeeperRoomName(this.room.name)));
    if (!isSkRoom && (this.room.controller || intel)) return false;

    const range = 7;
    const room = this.room;
    if (room._skCreepsTick !== Game.time) {
        room._skCreeps = room.creeps.filter(c => c.owner && c.owner.username === 'Source Keeper');
        room._skCreepsTick = Game.time;
    }
    const sk = room._skCreeps.find(c => c.pos.inRangeTo(this, range));
    const lair = room.keeperLairs.find(s => s.ticksToSpawn && s.ticksToSpawn <= 5 && s.pos.inRangeTo(this, range));

    if (sk || lair) {
        this.shibKite(range + 2, sk || lair);
        this.memory.fledSK = Game.time;
        return true;
    } else if (this.memory.fledSK) {
        if (this.memory.fledSK + 5 <= Game.time) {
            delete this.memory.fledSK;
        } else {
            this.idleFor(10);
            return true;
        }
    }

    if (this.room.invaderCore) return this.suicide() === OK;
    return false;
};

Creep.prototype.opportunisticRepair = function () {
    if (!this.hasActiveBodyparts(WORK) || !this.store[RESOURCE_ENERGY]) return false;
    try {
        const structure = this.pos.checkForAllStructure(true);
        if (structure && structure.hits < structure.hitsMax) {
            this.say("Repairman!", true);
            this.repair(structure);
        }
    } catch (e) {
    }
};

Creep.prototype.opportunisticFill = function () {
    if (!this.store[RESOURCE_ENERGY] || !this.room.level) return false;
    let nearbyItems;
    try {
        nearbyItems = this.room.lookAtArea(this.pos.y - 1, this.pos.x - 1, this.pos.y + 1, this.pos.x + 1, true);
    } catch (e) {
        return false;
    }

    for (let item of nearbyItems) {
        if (item.type === LOOK_STRUCTURES && [STRUCTURE_EXTENSION, STRUCTURE_SPAWN].includes(item.structure.structureType) && item.structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            return this.transfer(item.structure, RESOURCE_ENERGY) === OK;
        }
        if (item.type === LOOK_CREEPS && item.creep.my && ['upgrader', 'drone'].includes(item.creep.memory.role) && item.creep.store.getFreeCapacity(RESOURCE_ENERGY)) {
            return this.transfer(item.creep, RESOURCE_ENERGY) === OK;
        }
    }
    return false;
};

Creep.prototype.withdrawResource = function (destination = undefined, resourceType = RESOURCE_ENERGY, amount = undefined) {
    if (!destination) destination = Game.getObjectById(this.memory.energyDestination);
    else this.memory.energyDestination = destination.id;

    if (!destination) {
        this.memory.energyDestination = undefined;
        return false;
    }

    if (destination.resourceType && destination.resourceType !== resourceType) resourceType = destination.resourceType;
    else if (destination.store && !destination.store[resourceType]) {
        delete this.memory.energyDestination;
        return false;
    }

    if (destination instanceof Creep) {
        const result = destination.transfer(this, resourceType, amount);
        if (result === OK) {
            this.memory.lastWithdraw = destination.id;
            delete this.memory.energyDestination;
            clearShibMove(this);
            return true;
        } else if (result === ERR_NOT_IN_RANGE) {
            return this.shibMove(destination);
        }
    }

    if (destination.store && destination.store[resourceType]) {
        const result = this.withdraw(destination, resourceType, amount);
        if (result === OK) {
            this.memory.lastWithdraw = destination.id;
            delete this.memory.energyDestination;
            clearShibMove(this);
        } else if (result === ERR_NOT_IN_RANGE) this.shibMove(destination);
        return true;
    } else if (destination.amount) {
        const result = this.pickup(destination);
        if (result === OK) {
            this.memory.lastWithdraw = destination.id;
            delete this.memory.energyDestination;
            clearShibMove(this);
        } else if (result === ERR_NOT_IN_RANGE) this.shibMove(destination);
        return true;
    }

    delete this.memory.energyDestination;
    clearShibMove(this);
    return false;
};

Creep.prototype.locateEnergy = function (room = this.room) {
    if (this.memory.energyDestination) {
        const dest = Game.getObjectById(this.memory.energyDestination);
        if (dest && (dest.amount || (dest.store && dest.store.getUsedCapacity(RESOURCE_ENERGY) > 0))) return true;
        delete this.memory.energyDestination;
    }

    const freeCapacity = this.store.getFreeCapacity();
    const myCreeps = room.myCreeps;
    let potentialEnergy = [];

    let targetCounts = {};
    for (let i = 0; i < myCreeps.length; i++) {
        const c = myCreeps[i];
        if (c.id !== this.id && c.memory.energyDestination) {
            targetCounts[c.memory.energyDestination] = (targetCounts[c.memory.energyDestination] || 0) + 1;
        }
    }
    const myCreepsFilter = (destinationId) => targetCounts[destinationId] || 0;

    const isAlliedRoom = room.controller && room.controller.owner && !room.controller.my;

    if (isAlliedRoom) {
        if (room.controller.safeMode) return false;
        for (let i = 0; i < room.droppedEnergy.length; i++) {
            const r = room.droppedEnergy[i];
            if (r.amount >= (myCreepsFilter(r.id) + 1) * (freeCapacity * 0.5)) potentialEnergy.push(r);
        }
        if (room.storage && !room.storage.pos.checkForRampart(true) && room.storage.store[RESOURCE_ENERGY] > 0) potentialEnergy.push(room.storage);
        if (room.terminal && !room.terminal.pos.checkForRampart(true) && room.terminal.store[RESOURCE_ENERGY] > TERMINAL_ENERGY_BUFFER) potentialEnergy.push(room.terminal);

        const closest = this.pos.findClosestByRange(potentialEnergy);
        if (closest) {
            this.memory.energyDestination = closest.id;
            return true;
        }
        return false;
    }

    // Handle hostile storages and terminals. Empty them then destroy if empty.
    const hostileStorages = room.hostileStructures.filter(s => s.structureType === STRUCTURE_STORAGE || s.structureType === STRUCTURE_TERMINAL);
    if (hostileStorages.length) {
        for (let i = 0; i < hostileStorages.length; i++) {
            const s = hostileStorages[i];
            if (s.store[RESOURCE_ENERGY] > 0) {
                const result = this.withdraw(s, RESOURCE_ENERGY);
                if (result === OK) {
                    delete this.memory.energyDestination;
                    return true;
                } else if (result === ERR_NOT_IN_RANGE) {
                    this.shibMove(s);
                }
            } else {
                s.destroy();
            }
        }
    }

    if (!room.storage && room.controller && room.controller.my && !['hauler', 'shuttle', 'remoteHauler', 'upgrader'].includes(this.memory.role)) {
        for (let i = 0; i < myCreeps.length; i++) {
            const c = myCreeps[i];
            if ((c.memory.role === 'remoteHauler' || c.memory.role === 'powerHauler') && c.store[RESOURCE_ENERGY] > 0 && !c.memory.storageDestination && c.pos.getRangeTo(room.controller) <= 10) {
                potentialEnergy.push(c);
            }
        }
    }

    if (this.memory.role === 'hauler') {
        if (factoryUnpackingEnergy(room)) {
            this.memory.energyDestination = room.factory.id;
            return true;
        }
        const hubLink = Game.getObjectById(room.memory.hubLink);
        if (hubLink && hubLink.store[RESOURCE_ENERGY] > 0) {
            const upgrader = room.myCreeps.find(c => c.memory.role === 'upgrader' && c.memory.other && c.memory.other.stationary);
            const controllerLink = Game.getObjectById(room.memory.controllerLink);
            const controllerEnergy = controllerLink ? controllerLink.store[RESOURCE_ENERGY] : 0;
            const hubEnergy = hubLink.store[RESOURCE_ENERGY];
            let preferHub = !room.storage || room.energyState <= 2 || !upgrader || !controllerLink ||
                controllerEnergy > LINK_CAPACITY * 0.5;
            if (!preferHub && room.energyState >= 3) {
                const controllerNeedsFeed = controllerEnergy < LINK_CAPACITY * 0.25;
                const hubHasSurplus = hubEnergy >= LINK_CAPACITY * 0.85;
                preferHub = hubHasSurplus || !controllerNeedsFeed;
            }
            if (preferHub) {
                this.memory.energyDestination = hubLink.id;
                return true;
            }
        }
    }

    for (let i = 0; i < room.tombstones.length; i++) if (room.tombstones[i].store[RESOURCE_ENERGY] > 0) potentialEnergy.push(room.tombstones[i]);
    for (let i = 0; i < room.ruins.length; i++) if (room.ruins[i].store[RESOURCE_ENERGY] > 0) potentialEnergy.push(room.ruins[i]);
    if (factoryUnpackingEnergy(room)) potentialEnergy.push(room.factory);

    if (this.memory.role !== 'shuttle') {
        const protoStorage = room.memory.protoStorage ? Game.getObjectById(room.memory.protoStorage) : undefined;
        const storageEnergy = room.storage ? (room.storage.store[RESOURCE_ENERGY] || 0) : 0;
        const terminalEnergy = room.terminal ? (room.terminal.store[RESOURCE_ENERGY] || 0) : 0;
        // storageEnergy > 0 is required: `0 > terminalEnergy - BUFFER` is true whenever the terminal is below the buffer.
        if (storageEnergy > 0 && storageEnergy > (room.terminal ? terminalEnergy - TERMINAL_ENERGY_BUFFER : 0)) {
            potentialEnergy.push(room.storage);
        } else if (terminalEnergy > TERMINAL_ENERGY_BUFFER) {
            potentialEnergy.push(room.terminal);
        } else if (protoStorage && protoStorage.store[RESOURCE_ENERGY] > 0) {
            potentialEnergy.push(protoStorage);
        }
    }

    const filterPenalty = this.memory.role === 'drone' ? 2 : 1;
    for (let i = 0; i < room.droppedEnergy.length; i++) {
        const r = room.droppedEnergy[i];
        if (r.amount >= (myCreepsFilter(r.id) + filterPenalty) * (freeCapacity * 0.25)) potentialEnergy.push(r);
    }

    if (['shuttle', 'remoteHauler', 'drone'].includes(this.memory.role) || !room.storage || room.myCreeps.length < 4) {
        const ctrlContainer = global.resolveControllerContainer(room);
        const containers = room.containers;
        for (let i = 0; i < containers.length; i++) {
            const s = containers[i];
            if ((s.id !== (ctrlContainer && ctrlContainer.id) || room.level === 8) && s.store[RESOURCE_ENERGY] > 0) {
                if (!myCreepsFilter(s.id) || s.store[RESOURCE_ENERGY] > (myCreepsFilter(s.id) + 1) * (freeCapacity * 0.5)) {
                    potentialEnergy.push(s);
                }
            }
        }
    }

    if (room.energyState === 0) {
        potentialEnergy = potentialEnergy.concat(room.links.filter(s => s.store[RESOURCE_ENERGY] > 0));
    }

    if (potentialEnergy.length) {
        const closest = this.pos.findClosestByRange(potentialEnergy);
        if (closest) {
            this.memory.energyDestination = closest.id;
            return true;
        }
    }
    return false;
};

Creep.prototype.haulerDelivery = function () {
    if (this.memory.storageDestination) {
        let storageItem = Game.getObjectById(this.memory.storageDestination);
        if (storageItem && storageItem.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            for (let resourceType in this.store) {
                let result = this.transfer(storageItem, resourceType);
                if (result === OK) {
                    delete this.memory.storageDestination;
                    clearShibMove(this);
                    return true;
                } else if (result === ERR_NOT_IN_RANGE) {
                    this.shibMove(storageItem);
                    return true;
                } else if (result === ERR_FULL) {
                    delete this.memory.storageDestination;
                }
            }
        } else {
            delete this.memory.storageDestination;
            clearShibMove(this);
        }
    }

    if (this.store.getUsedCapacity() > this.store[RESOURCE_ENERGY]) {
        let target = this.room.terminal || this.room.storage;
        if (target) {
            this.memory.storageDestination = target.id;
            return true;
        }
    }

    let targets = [];
    const allSpawnExtensions = (this.room.spawns || []).concat(this.room.extensions || []);
    const allTowers = this.room.towers || [];
    const allLabs = this.room.labs || [];

    if (this.room.controller && this.room.controller.level >= 3) {
        const threatLevel = (INTEL[this.room.name] && INTEL[this.room.name].threatLevel) || 0;
        const targetAmount = threatLevel ? 1 : 0.75;
        targets = allTowers.filter(s => s.store[RESOURCE_ENERGY] < TOWER_CAPACITY * targetAmount);
        if (targets.length) {
            this.memory.storageDestination = this.pos.findClosestByRange(targets).id;
            return true;
        }
    }

    targets = allSpawnExtensions.filter(s => s.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
    if (targets.length) {
        const roomHaulers = this.room.myCreeps.filter(c => c.memory.role === 'hauler' && !c.spawning);
        if (roomHaulers.length >= 2) {
            if (this.memory.haulerGroup === undefined) {
                const otherGroups = new Set(roomHaulers.filter(c => c.name !== this.name && c.memory.haulerGroup !== undefined).map(c => c.memory.haulerGroup));
                if (otherGroups.size === 0) {
                    const sorted = [...roomHaulers].sort((a, b) => a.name.localeCompare(b.name));
                    this.memory.haulerGroup = sorted.findIndex(c => c.name === this.name) === 0 ? 0 : 1;
                } else {
                    this.memory.haulerGroup = otherGroups.has(0) ? 1 : 0;
                }
            }
            if (!this.room.memory.extensionGroups || this.room.memory.extensionGroupLevel !== this.room.level) {
                const hub = this.room.hub;
                if (hub) {
                    const allExt = allSpawnExtensions.filter(s => s.structureType === STRUCTURE_EXTENSION);
                    this.room.memory.extensionGroups = [
                        allExt.filter(e => e.pos.x < hub.x).map(e => e.id),
                        allExt.filter(e => e.pos.x >= hub.x).map(e => e.id)
                    ];
                    this.room.memory.extensionGroupLevel = this.room.level;
                }
            }
            if (this.room.memory.extensionGroups && this.memory.haulerGroup !== undefined) {
                const myExtensionIds = new Set(this.room.memory.extensionGroups[this.memory.haulerGroup]);
                const grouped = targets.filter(s => s.structureType === STRUCTURE_SPAWN || myExtensionIds.has(s.id));
                if (grouped.length) targets = grouped;
            }
        } else {
            delete this.memory.haulerGroup;
        }
        this.memory.storageDestination = _.max(targets, s => this.pos.getRangeTo(s)).id;
        return true;
    }

    const hubLink = Game.getObjectById(this.room.memory.hubLink);
    const controllerLink = Game.getObjectById(this.room.memory.controllerLink);
    if (this.room.level < 8 && hubLink && controllerLink && hubLink.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && this.room.energyState > 1) {
        targets.push(hubLink);
    }

    const haulerEnergyInfo = this.room.memory.energyInfo;
    const haulerTrend = (haulerEnergyInfo && haulerEnergyInfo.trend) || 0;
    const haulerFlowOk = this.room.energyState >= 2 && haulerTrend >= 0;
    if (haulerFlowOk) {
        const labStructMem = this.room.memory._structureMemory;
        const producingBoost = this.room.memory.producingBoost;
        targets = targets.concat(allLabs.filter(s => {
            if (s.store.getFreeCapacity(RESOURCE_ENERGY) <= 0) return false;
            if (producingBoost) return true;
            const mem = labStructMem && labStructMem[s.id];
            return mem && (mem.itemNeeded || mem.neededBoost);
        }));
    }

    if (!this.room.memory.controllerLink && this.room.energyState > 0) {
        const controllerContainer = global.resolveControllerContainer(this.room);
        if (controllerContainer && controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) > 200) targets.push(controllerContainer);
    }

    if (this.room.nuker && !empireOpsPaused() && this.room.energyState >= 3 &&
        this.room.nuker.store.getFreeCapacity(RESOURCE_ENERGY)) {
        targets.push(this.room.nuker);
    }

    if (this.room.terminal && this.room.terminal.store.getFreeCapacity() > this.store[RESOURCE_ENERGY] && this.room.terminal.store.getUsedCapacity(RESOURCE_ENERGY) < terminalEnergyTarget()) targets.push(this.room.terminal);
    if (this.room.storage && this.room.storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && this.memory.lastWithdraw !== this.room.storage.id) targets.push(this.room.storage);

    let target = this.pos.findClosestByRange(targets);
    if (target) {
        this.memory.storageDestination = target.id;
        return true;
    }

    // Fill controller container if the room has energy to spare and the container is empty
    if (this.room.energyState) {
        const controllerContainer = Game.getObjectById(this.room.memory.controllerContainer)
        if (controllerContainer && !controllerContainer.store.getUsedCapacity(RESOURCE_ENERGY)) {
            this.memory.storageDestination = controllerContainer.id;
            return true;
        }
    }

    const fallback = this.room.storage || this.room.terminal;
    if (fallback && fallback.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        this.memory.storageDestination = fallback.id;
        return true;
    }
    return false;
};

Creep.prototype.constructionWork = function (scope) {
    const barriersOnly = scope === 'barriers';
    const roadsOnly = scope === 'roads';
    const room = this.room;
    const scan = getConstructionScan(room);
    const intel = scan.intel;
    const claimedIds = scan.claimedIds;
    const damage = scan.damage;
    const sites = scan.sites;
    const available = (list) => list.filter(s => !claimedIds.has(s.id));

    const assign = (site, task, targetHits) => {
        this.memory.constructionSite = site.id;
        this.memory.task = task;
        this.memory.sitePos = {x: site.pos.x, y: site.pos.y, roomName: site.pos.roomName};
        if (targetHits !== undefined) this.memory.targetHits = targetHits;
        claimedIds.add(site.id);
        return true;
    };
    const build = (site) => assign(site, 'build');
    const repair = (site, targetHits) => assign(site, 'repair', targetHits);
    const buildClosest = (list) => {
        const open = available(list);
        return open.length && build(this.pos.findClosestByRange(open));
    };
    let site;

    const pickCombatBarriers = () => {
        let site = available(damage.walls).find(s => s.hits < 5000) || available(damage.ramparts).find(s => s.hits < 5000);
        if (site) return repair(site, 12500);
        if (intel && intel.threatLevel && (!this.room.controller || !this.room.controller.safeMode)) {
            const dangerous = room.hostileCreeps.filter(c =>
                c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(WORK));
            const near = dangerous.length && weakestBarrierNearHostiles(damage.allBarriers, dangerous);
            if (near) return repair(near, near.hits + 25000);
        }
        return false;
    };

    const pickUnsafeRampartWork = () => {
        const rampartSites = sites.byType[STRUCTURE_RAMPART];
        if (rampartSites && rampartSites.length) return buildClosest(rampartSites);
        const unsafeRamparts = available(damage.ramparts).filter(s => s.hits < SAFE_RAMPART_HITS);
        if (unsafeRamparts.length) {
            const target = _.min(unsafeRamparts, 'hits');
            return repair(target, SAFE_RAMPART_HITS);
        }
        return false;
    };

    const wallBarrierSites = () => sites.barriers.filter(s => s.structureType === STRUCTURE_WALL);

    if (roadsOnly) {
        if (sites.roads.length) return buildClosest(sites.roads);
        site = weakestByHitsRatio(available(damage.roads).filter(s => s.hits < s.hitsMax * 0.5));
        if (site) return repair(site, site.hitsMax * 0.8);
        site = weakestByHitsRatio(available(damage.roads).filter(s => s.hits < s.hitsMax * 0.75));
        if (site) return repair(site, site.hitsMax * 0.75);
        clearConstructionMemory(this);
        return false;
    }

    if (barriersOnly) {
        const combat = pickCombatBarriers();
        if (combat) return combat;

        const unsafeRampart = pickUnsafeRampartWork();
        if (unsafeRampart) return unsafeRampart;

        const spawn = room.spawns[0];
        if (spawn && room.controller && (room.controller.safeMode || (room.controller.owner && room.controller.owner.username !== MY_USERNAME))) {
            const walls = wallBarrierSites();
            if (walls.length) return buildClosest(walls);
            const lowBarriers = available(damage.walls.concat(damage.ramparts.filter(s => s.hits >= SAFE_RAMPART_HITS))).filter(s => s.hits < 500000);
            if (lowBarriers.length) return repair(_.min(lowBarriers, 'hits'), 502500);
        } else if (!spawn) {
            const ramparts = sites.byType[STRUCTURE_RAMPART];
            if (ramparts) return buildClosest(ramparts);
        }

        const trend = (room.memory.energyInfo && room.memory.energyInfo.trend) || 0;
        if (room.energyState >= 2 || (room.energyState === 1 && trend >= 0)) {
            const walls = wallBarrierSites();
            if (walls.length) return buildClosest(walls);
            const repairPool = available(damage.walls.concat(damage.ramparts.filter(s => s.hits >= SAFE_RAMPART_HITS)));
            site = repairPool.length ? _.min(repairPool, 'hits') : null;
            if (site) {
                const targetHits = site.structureType === STRUCTURE_WALL
                    ? Math.min(site.hits + 50000, RAMPART_HITS_MAX[room.level] || 300000000)
                    : site.hitsMax;
                return repair(site, targetHits);
            }
        }

        clearConstructionMemory(this);
        return false;
    }

    if (intel && intel.threatLevel) {
        const combat = pickCombatBarriers();
        if (combat) return combat;
        if (sites.barriers.length) return buildClosest(sites.barriers);
    }

    const towers = sites.byType[STRUCTURE_TOWER];
    if (towers) return build(towers[0]);

    for (const type of PRIORITY_BUILD_TYPES) {
        const list = sites.byType[type];
        if (list && list.length) return build(list[0]);
    }

    site = available(damage.containers).find(s => s.hits < s.hitsMax * 0.5);
    if (site) return repair(site, site.hitsMax * 0.65);

    site = weakestByHitsRatio(available(damage.roads).filter(s => s.hits < s.hitsMax * 0.5));
    if (site) return repair(site, site.hitsMax * 0.8);

    if (room.energyState >= 1) {
        if (sites.misc.length) return buildClosest(sites.misc);
        if (sites.roads.length) return buildClosest(sites.roads);
        site = weakestByHitsRatio(available(damage.roads).filter(s => s.hits < s.hitsMax * 0.75));
        if (site) return repair(site, site.hitsMax * 0.75);
        site = weakestByHitsRatio(available(damage.containers).filter(s => s.hits < s.hitsMax * 0.75));
        if (site) return repair(site, site.hitsMax * 0.75);
        site = available(damage.containers)[0] || available(damage.roads)[0] || available(damage.other)[0];
        if (site) return repair(site, site.hitsMax);
    }

    clearConstructionMemory(this);
    return false;
};

Creep.prototype.builderFunction = function () {
    let construction = Game.getObjectById(this.memory.constructionSite);
    if (!construction) {
        let sitePos = this.memory.sitePos;
        if (typeof sitePos === 'string') {
            try {
                sitePos = JSON.parse(sitePos);
            } catch (e) {
                sitePos = undefined;
            }
        }
        if (sitePos && sitePos.roomName && sitePos.roomName !== this.room.name) {
            this.shibMove(new RoomPosition(sitePos.x, sitePos.y, sitePos.roomName), {range: 1});
            return true;
        }
        this.memory.constructionSite = undefined;
        this.memory.task = undefined;
        this.memory.siteRoom = undefined;
        this.memory.targetHits = undefined;
        return false;
    }

    if (!this.memory.task) this.memory.task = 'build';

    if (this.memory.task === 'repair') {
        const isWall = construction.structureType === STRUCTURE_WALL;
        const repairTarget = this.memory.targetHits !== undefined
            ? this.memory.targetHits
            : (isWall ? wallRepairCap(this.room, construction) : construction.hitsMax);
        const done = isWall
            ? construction.hits >= repairTarget
            : (construction.hits === construction.hitsMax || construction.hits >= repairTarget);
        if (done) {
            clearConstructionMemory(this);
            return false;
        }

        this.say('Fix!', true);
        construction.say(construction.hits + '/' + construction.hitsMax);
        switch (this.repair(construction)) {
            case OK:
                if (isNearRoomSource(this)) this.moveRandom();
                return true;
            case ERR_NOT_IN_RANGE:
                this.memory.other.stationary = undefined;
                this.shibMove(construction, {range: 3});
                return true;
            case ERR_RCL_NOT_ENOUGH:
            case ERR_INVALID_TARGET:
                this.memory.constructionSite = undefined;
                this.memory.task = undefined;
                break;
            case ERR_NOT_ENOUGH_ENERGY:
                this.memory.other.stationary = undefined;
                this.memory.working = undefined;
                return true;
        }
    } else {
        this.say('Build!', true);
        construction.say(construction.progress + '/' + construction.progressTotal);
        switch (this.build(construction)) {
            case OK:
                if (isNearRoomSource(this)) this.moveRandom();
                return true;
            case ERR_NOT_IN_RANGE:
                this.memory.other.stationary = undefined;
                this.shibMove(construction, {range: 3});
                return true;
            case ERR_RCL_NOT_ENOUGH:
            case ERR_INVALID_TARGET:
                this.memory.constructionSite = undefined;
                this.memory.task = undefined;
                break;
            case ERR_NOT_ENOUGH_ENERGY:
                this.memory.other.stationary = undefined;
                this.memory.working = undefined;
                return true;
        }
    }
    return false;
};

Creep.prototype.goToHub = function (destination = this.memory.colony, idleTime = 10) {
    let hub = new RoomPosition(25, 25, destination);
    if (this.pos.getRangeTo(hub) <= 15) {
        this.idleFor(idleTime);
        return false;
    }
    this.shibMove(hub, {range: 10});
    return true;
};

Creep.prototype.towTruck = function () {
    return runTowTruck(this);
};

Creep.prototype.borderCheck = function () {
    const {x, y} = this.pos;
    if (x !== 0 && y !== 0 && x !== 49 && y !== 49) {
        this.memory.borderCountDown = undefined;
        return false;
    }
    this.attackInRange();
    this.healInRange(true);
    if (this.memory.borderCountDown) this.memory.borderCountDown++; else this.memory.borderCountDown = 1;
    if (this.memory.borderCountDown < 5 && getShibMove(this)) return false;

    clearShibMove(this);
    this.memory.moveBlocked = Game.time;

    if (x === 0 && y === 0) this.move(BOTTOM_RIGHT);
    else if (x === 0 && y === 49) this.move(TOP_RIGHT);
    else if (x === 49 && y === 0) this.move(BOTTOM_LEFT);
    else if (x === 49 && y === 49) this.move(TOP_LEFT);
    else {
        const road = findRoadNearCreep(this);
        if (road) this.move(this.pos.getDirectionTo(road));
        else {
            let options;
            if (x === 49) options = [LEFT, TOP_LEFT, BOTTOM_LEFT];
            else if (x === 0) options = [RIGHT, TOP_RIGHT, BOTTOM_RIGHT];
            else if (y === 0) options = [BOTTOM, BOTTOM_LEFT, BOTTOM_RIGHT];
            else options = [TOP, TOP_LEFT, TOP_RIGHT];
            this.move(_.sample(options));
        }
    }
    return true;
};

function findRoadNearCreep(creep) {
    return _.find(creep.room.roads, (s) => s.pos.isNearTo(creep) && !s.pos.checkForImpassible());
}

const BOOST_AMOUNT_PER_PART = LAB_BOOST_MINERAL;
const BOOST_TTL_FLOOR = CREEP_LIFE_TIME * 0.6;
const BOOST_RENEW_INITIAL = CREEP_LIFE_TIME * 0.85;
const BOOST_RENEW_WAITING = CREEP_LIFE_TIME * 0.95;
const SOLO_BOOST_WAIT_TICKS = 300;

// Shared with module.creepSpawning.preReserveBoostLab.
global.WORK_BOOST_BY_ROLE = {
    drone: 'build',
    waller: 'build',
    upgrader: 'upgrade',
    cleaner: 'dismantle',
    siegeDuo: 'dismantle',
    commodityMiner: 'harvest',
    mineralHarvester: 'harvest'
};

global.resolveBoostType = function (role, bodyPart) {
    if (bodyPart === WORK) return WORK_BOOST_BY_ROLE[role] || null;
    return bodyPart;
};

global.findAvailableBoostTier = function (room, boostType, amountNeeded) {
    const tiers = BOOST_USE[boostType];
    if (!tiers) return null;
    for (const resource of tiers) {
        if (room.store(resource) >= amountNeeded) return resource;
    }
    return null;
};

function buildBoostPlan(creep, requestedBodyParts) {
    const plan = {};
    const preReservedParts = new Set();
    const nb = creep.memory.neededBoosts;

    if (nb && nb.boost) {
        const amount = creep.getActiveBodyparts(nb.boostPart) * BOOST_AMOUNT_PER_PART;
        if (amount && creep.room.store(nb.boost) >= amount) {
            plan[nb.boost] = {boost: nb.boost, amount, type: nb.boostPart};
            preReservedParts.add(nb.boostPart);
        }
    }
    if (nb && nb.toughBoost) {
        const amount = creep.getActiveBodyparts(TOUGH) * BOOST_AMOUNT_PER_PART;
        if (amount && creep.room.store(nb.toughBoost) >= amount) {
            plan[nb.toughBoost] = {boost: nb.toughBoost, amount, type: TOUGH};
            preReservedParts.add(TOUGH);
        }
    }
    if (nb && nb.moveBoost) {
        const amount = creep.getActiveBodyparts(MOVE) * BOOST_AMOUNT_PER_PART;
        if (amount && creep.room.store(nb.moveBoost) >= amount) {
            plan[nb.moveBoost] = {boost: nb.moveBoost, amount, type: MOVE};
            preReservedParts.add(MOVE);
        }
    }

    const bodyParts = (creep.memory.misc && creep.memory.misc.boosts)
        ? _.union(requestedBodyParts, creep.memory.misc.boosts)
        : requestedBodyParts;

    for (const bodyPart of bodyParts) {
        if (preReservedParts.has(bodyPart)) continue;
        const unboosted = creep.body.filter(p => p.type === bodyPart && !p.boost);
        if (!unboosted.length) continue;

        const boostType = resolveBoostType(creep.memory.role, bodyPart);
        if (!boostType) continue;

        const amount = unboosted.length * BOOST_AMOUNT_PER_PART;
        const resource = findAvailableBoostTier(creep.room, boostType, amount);
        if (resource) plan[resource] = {boost: resource, amount, type: boostType};
    }
    return plan;
}

function expectedBoostParts(creep) {
    const parts = [];
    const add = (part) => {
        if (part && !parts.includes(part)) parts.push(part);
    };
    const nb = creep.memory.neededBoosts;
    if (nb && nb.boost && nb.boostPart && !isOptionalSiegeBoost(nb.boostPart)) add(nb.boostPart);
    if (nb && nb.toughBoost) add(TOUGH);
    // MOVE is optional for sieges. Pinning it on neededBoosts used to make
    // planCoversExpectedBoosts fail while HEAL/TOUGH were already in labs,
    // so the wave never started boosting and recycled at home.
    const extra = creep.memory.misc && creep.memory.misc.boosts;
    if (extra) {
        for (let i = 0; i < extra.length; i++) {
            const part = extra[i];
            // RA/MOVE on the wishlist are opportunistic; neededBoosts pins the required set.
            if (isOptionalSiegeBoost(part)) continue;
            add(part);
        }
    }
    return parts;
}

function planCoversExpectedBoosts(creep, plan) {
    const covered = new Set();
    for (const key in plan) {
        const t = plan[key] && plan[key].type;
        if (t) covered.add(t);
    }
    const expected = expectedBoostParts(creep);
    for (let i = 0; i < expected.length; i++) {
        const part = expected[i];
        let hasUnboosted = false;
        for (let b = 0; b < creep.body.length; b++) {
            if (creep.body[b].type === part && !creep.body[b].boost) {
                hasUnboosted = true;
                break;
            }
        }
        if (!hasUnboosted) continue;
        const boostType = resolveBoostType(creep.memory.role, part) || part;
        if (!covered.has(part) && !covered.has(boostType)) return false;
    }
    return true;
}

function isWaitForWave(creep) {
    return !!(creep.memory.misc && creep.memory.misc.waitFor > 1);
}

function isSiegeBoostOp(creep) {
    const op = creep && creep.memory && creep.memory.operation;
    return op === 'roomDenial' || op === 'stronghold';
}

function creepHasRequiredSiegeBoosts(c) {
    if (!c || !c.memory) return false;
    const nb = c.memory.neededBoosts;
    if (!nb) return true;
    const boosted = c.memory.hasBoosted || [];
    const covered = (part, resource) => {
        if (resource && boosted.includes(resource)) return true;
        if (!part || !c.body) return !resource;
        for (let i = 0; i < c.body.length; i++) {
            if (c.body[i].type === part && c.body[i].boost) return true;
        }
        return false;
    };
    if (nb.boost && !isOptionalSiegeBoost(nb.boostPart) && !covered(nb.boostPart, nb.boost)) return false;
    if (nb.toughBoost && !covered(TOUGH, nb.toughBoost)) return false;
    return true;
}

Creep.prototype.hasRequiredSiegeBoosts = function () {
    return creepHasRequiredSiegeBoosts(this);
};

function labMineralCap(lab, resource) {
    if (lab && lab.store && lab.store.getCapacity) {
        const cap = lab.store.getCapacity(resource);
        if (cap) return cap;
    }
    return typeof LAB_MINERAL_CAPACITY !== 'undefined' ? LAB_MINERAL_CAPACITY : 3000;
}

function waveBoostMates(creep) {
    const dest = creep.memory.destination;
    const op = creep.memory.operation;
    const formColony = (creep.memory.misc && creep.memory.misc.formColony) || creep.memory.colony;
    const names = [];
    let boosted = 0;
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c.my || !c.memory) continue;
        if (c.memory.destination !== dest || c.memory.operation !== op) continue;
        const theirColony = (c.memory.misc && c.memory.misc.formColony) || c.memory.colony;
        if (formColony && theirColony && formColony !== theirColony) continue;
        const role = c.memory.role || '';
        const old = c.memory.oldRole || '';
        if (role !== 'longbowSquad' && role !== 'longbow'
            && old !== 'longbowSquad' && old !== 'longbow') continue;
        if (c.memory.misc && c.memory.misc.sealed) continue;
        if (c.memory.boostAttempt) boosted++;
        else names.push(c.name);
    }
    return {names, boosted};
}

function waveRemainingForBoost(creep, resource) {
    if (!isWaitForWave(creep)) return 1;
    const waitFor = creep.memory.misc.waitFor;
    const {names, boosted} = waveBoostMates(creep);
    let already = 0;
    for (let i = 0; i < names.length; i++) {
        const c = Game.creeps[names[i]];
        if (c && c.memory.hasBoosted && c.memory.hasBoosted.includes(resource)) already++;
    }
    return Math.max(1, waitFor - boosted - already);
}

function wavePooledAmount(creep, perBody, resource) {
    if (!isWaitForWave(creep)) return perBody;
    return perBody * waveRemainingForBoost(creep, resource);
}

// One lab per boost resource. Hub labs (itemNeeded) stay on production.
// Shared with spawnBuild.preReserveBoostLab so spawn, wave staging, and live
// claims all land on the same lab for a given mineral.
global.pickBoostLab = function (room, boostNeeded, excludeIds) {
    if (!room || !boostNeeded) return null;
    const structMem = room.memory._structureMemory;
    const labs = room.labs || [];
    let matchBoost = null;
    let matchBoostQty = -1;
    let matchMineral = null;
    let empty = null;
    let any = null;
    for (let i = 0; i < labs.length; i++) {
        const s = labs[i];
        if (!s || !s.isActive()) continue;
        if (excludeIds && excludeIds.has(s.id)) continue;
        const mem = structMem && structMem[s.id];
        if (mem && mem.itemNeeded) continue;
        if (mem && mem.neededBoost && mem.neededBoost !== boostNeeded) continue;
        if (mem && mem.neededBoost === boostNeeded) {
            const qty = s.store[boostNeeded] || 0;
            if (!matchBoost || qty > matchBoostQty) {
                matchBoost = s;
                matchBoostQty = qty;
            }
            continue;
        }
        if (!matchMineral && s.mineralType === boostNeeded) matchMineral = s;
        else if (!empty && !s.mineralType) empty = s;
        else if (!any) any = s;
    }
    return matchBoost || matchMineral || empty || any || null;
};

function bindBoostLab(lab, boostNeeded, amountNeeded, names) {
    if (!lab) return null;
    const mem = lab.memory;
    mem.paused = true;
    mem.neededBoost = boostNeeded;
    const cap = labMineralCap(lab, boostNeeded);
    mem.amount = Math.min(cap, Math.max(mem.amount || 0, amountNeeded || 0));
    mem.requested = Game.time;
    if (names && names.length) {
        const merged = mem.preReservedFor ? mem.preReservedFor.slice() : [];
        for (let i = 0; i < names.length; i++) {
            const n = names[i];
            if (n && !merged.includes(n)) merged.push(n);
        }
        if (merged.length) mem.preReservedFor = merged;
    }
    return lab;
}

// Excludes labs with itemNeeded — those belong to production reactions.
// Co-opting them would fight labController / labTech. `excludeIds` lets the
// caller skip labs it has already claimed for other boosts in the same plan.
function claimBoostLab(creep, boostNeeded, amountNeeded, excludeIds) {
    const lab = pickBoostLab(creep.room, boostNeeded, excludeIds);
    if (!lab) return null;

    const mem = lab.memory;
    if (isWaitForWave(creep)) {
        // Pooled waitFor total — never add a per-creep share on top, and never
        // drop this creep from preReservedFor on claim. Squadmates (including
        // ones still in the spawn) have to find this same lab.
        bindBoostLab(lab, boostNeeded, wavePooledAmount(creep, amountNeeded, boostNeeded), [creep.name]);
    } else {
        const preIdx = mem.preReservedFor ? mem.preReservedFor.indexOf(creep.name) : -1;
        mem.paused = true;
        mem.neededBoost = boostNeeded;
        if (preIdx < 0) {
            mem.amount = (mem.amount || 0) + amountNeeded;
        }
        mem.requested = Game.time;
    }

    mem.requestors = mem.requestors || [];
    if (!mem.requestors.includes(creep.id)) mem.requestors.push(creep.id);
    mem.requested = Game.time;
    return lab;
}

function releaseBoostLab(creep, lab, amountNeeded) {
    if (!lab) return;
    const structMem = lab.room.memory._structureMemory;
    const mem = structMem && structMem[lab.id];
    if (!mem) return;
    mem.amount = Math.max(0, (mem.amount || 0) - amountNeeded);

    if (mem.requestors) {
        mem.requestors = mem.requestors.filter(id => id !== creep.id);
        if (!mem.requestors.length) mem.requestors = undefined;
    }
    if (mem.preReservedFor) {
        mem.preReservedFor = mem.preReservedFor.filter(n => n !== creep.name);
        if (!mem.preReservedFor.length) mem.preReservedFor = undefined;
    }

    // Wipe boost config only when no live or pre-reserved owner remains.
    // Keeping `paused` is critical — without clearing it the lab is permanently
    // excluded from secondary-reaction selection in labController.
    // A waitFor wave may still have unspawned bodies; keep the pooled amount
    // so labTech does not drain the lab and the next body can join it.
    if (!mem.requestors && !mem.preReservedFor) {
        if ((mem.amount || 0) > 0 && mem.neededBoost) {
            mem.paused = true;
            return;
        }
        mem.neededBoost = undefined;
        mem.amount = undefined;
        mem.paused = undefined;
        mem.requested = undefined;
    }
}

function dropBoostReservations(creep) {
    const seen = new Set();
    const visit = (room) => {
        if (!room || seen.has(room.name)) return;
        seen.add(room.name);
        const labs = room.labs || [];
        for (let i = 0; i < labs.length; i++) {
            releaseBoostLab(creep, labs[i], 0);
        }
    };
    visit(creep.room);
    const home = (creep.memory.misc && creep.memory.misc.formColony) || creep.memory.colony;
    if (home && Game.rooms[home]) visit(Game.rooms[home]);
}

function boostEnergyNeeded(amountNeeded) {
    const parts = Math.max(1, Math.ceil((amountNeeded || 0) / LAB_BOOST_MINERAL));
    return parts * LAB_BOOST_ENERGY;
}

function labReadyForBoost(lab, boostNeeded, amountNeeded) {
    if (!lab || lab.mineralType !== boostNeeded) return false;
    if ((lab.store[RESOURCE_ENERGY] || 0) < boostEnergyNeeded(amountNeeded)) return false;
    return lab.mineralAmount >= amountNeeded;
}

function getEntryLab(creep, entryKey, boostNeeded) {
    const labs = creep.memory.boosts.labs;
    if (!labs) return null;
    const lab = Game.getObjectById(labs[entryKey]);
    // The lab is "ours" only when it's still configured for our boost AND it
    // still lists us as a requestor. If labController.cleanLabs wiped it and
    // someone else re-claimed for a different boost, we silently drop the
    // stale id rather than tampering with another creep's reservation.
    const mem = lab && lab.room.memory._structureMemory && lab.room.memory._structureMemory[lab.id];
    if (!lab || !mem || mem.neededBoost !== boostNeeded ||
        !(mem.requestors && mem.requestors.includes(creep.id))) {
        delete labs[entryKey];
        return null;
    }
    return lab;
}

// Returns the entry key the creep should act on this tick. Preference:
//   1. an entry whose boost is already in hasBoosted — release ASAP so
//      labtech stops refilling the now-empty reservation,
//   2. a ready lab no squadmate picked this tick (4 boosts × 4 bodies in parallel),
//   3. waitFor waves: a ready lab another mate is already on (dump that type
//      for the whole quad instead of camping an empty lab),
//   4. waitFor waves: spread across claimed-but-empty labs so each body waits
//      in range of a different boost,
//   5. a claimed but not-ready lab (solos wait in place for labtech),
//   6. a ready lab another creep already took (solo last resort),
//   7. an unclaimed entry.
// Without this, a non-ready first entry would block ready later ones —
// killing the whole point of parallel claims.
let boostLabTick = -1;
let boostLabsTaken = new Set();

function pickActiveEntry(creep) {
    if (boostLabTick !== Game.time) {
        boostLabTick = Game.time;
        boostLabsTaken = new Set();
    }

    const requested = creep.memory.boosts.requestedBoosts;
    const boosted = creep.memory.hasBoosted;
    if (boosted && boosted.length) {
        for (const key of Object.keys(requested)) {
            if (boosted.includes(requested[key].boost)) return key;
        }
    }
    const readyFree = [];
    const readyTaken = [];
    const claimed = [];
    let firstClaimed = null;
    let firstUnclaimed = null;
    for (const key of Object.keys(requested)) {
        const {boost, amount} = requested[key];
        const lab = getEntryLab(creep, key, boost);
        if (labReadyForBoost(lab, boost, amount)) {
            if (boostLabsTaken.has(lab.id)) readyTaken.push(key);
            else readyFree.push(key);
            continue;
        }
        if (lab) {
            claimed.push(key);
            if (!firstClaimed) firstClaimed = key;
        }
        if (!lab && !firstUnclaimed) firstUnclaimed = key;
    }
    let pick;
    if (isWaitForWave(creep)) {
        if (readyFree.length) pick = readyFree[0];
        else if (readyTaken.length) pick = readyTaken[0];
        else if (claimed.length) {
            let h = 0;
            const n = creep.name;
            for (let i = 0; i < n.length; i++) h = (h + n.charCodeAt(i)) | 0;
            pick = claimed[((h % claimed.length) + claimed.length) % claimed.length];
        } else pick = firstUnclaimed || Object.keys(requested)[0];
    } else {
        pick = readyFree[0] || firstClaimed || readyTaken[0] || firstUnclaimed || Object.keys(requested)[0];
    }
    const labs = creep.memory.boosts && creep.memory.boosts.labs;
    const pickedLab = pick && labs && Game.getObjectById(labs[pick]);
    if (pickedLab) boostLabsTaken.add(pickedLab.id);
    return pick;
}

function applyBoost(creep, entryKey) {
    const {boost: boostNeeded, amount: amountNeeded, type: boostType} =
        creep.memory.boosts.requestedBoosts[entryKey];

    if (creep.room.store(boostNeeded) < amountNeeded) {
        if (isWaitForWave(creep)) return false;
        const orphan = getEntryLab(creep, entryKey, boostNeeded);
        if (orphan) releaseBoostLab(creep, orphan, amountNeeded);
        if (creep.memory.boosts.labs) delete creep.memory.boosts.labs[entryKey];
        delete creep.memory.boosts.requestedBoosts[entryKey];
        return true;
    }

    let lab = getEntryLab(creep, entryKey, boostNeeded);
    if (!lab) {
        const reserved = new Set(creep.memory.boosts.labs ? Object.values(creep.memory.boosts.labs) : []);
        lab = claimBoostLab(creep, boostNeeded, amountNeeded, reserved);
        if (!lab) {
            return !isWaitForWave(creep);
        }
        (creep.memory.boosts.labs = creep.memory.boosts.labs || {})[entryKey] = lab.id;
    }

    const unboostedPart = creep.body.find(p => p.type === boostType && !p.boost);
    const alreadyBoosted = creep.memory.hasBoosted && creep.memory.hasBoosted.includes(boostNeeded);
    // Attribution: only mark this lab done if it's the one that actually boosted us.
    // Otherwise a creep with the same body part boosted by another lab would
    // decrement this lab's reservation and starve still-waiting creeps.
    const boostedFromHere = creep.memory.boostedFromLab && creep.memory.boostedFromLab[lab.id] === boostNeeded;

    if (!unboostedPart && alreadyBoosted && boostedFromHere) {
        releaseBoostLab(creep, lab, amountNeeded);
        delete creep.memory.boosts.requestedBoosts[entryKey];
        if (creep.memory.boosts.labs) delete creep.memory.boosts.labs[entryKey];
        creep.say(ICONS.greenCheck);
        return true;
    }

    lab.say(boostNeeded);
    // Per-creep readiness — boost as soon as OUR share of mineral AND energy
    // is in the lab, not the pooled total.
    const labReady = labReadyForBoost(lab, boostNeeded, amountNeeded);

    if (!labReady) {
        const waitFor = creep.memory.misc && creep.memory.misc.waitFor;
        if (!(waitFor > 1) && !creep.memory.hasBoosted && creep.hasActiveBodyparts(MOVE) &&
            creep.handleRenewing(BOOST_RENEW_WAITING)) return true;
        if (!creep.pos.isNearTo(lab)) {
            creep.say(ICONS.boost);
            return creep.shibMove(lab, {forceSolo: true});
        }
        return true;
    }

    switch (lab.boostCreep(creep)) {
        case OK:
            (creep.memory.hasBoosted = creep.memory.hasBoosted || []).push(boostNeeded);
            (creep.memory.boostedFromLab = creep.memory.boostedFromLab || {})[lab.id] = boostNeeded;
            creep.say(ICONS.testFinished);
            return true;
        case ERR_NOT_IN_RANGE:
        case ERR_NOT_ENOUGH_RESOURCES:
            creep.say(ICONS.boost);
            creep.shibMove(lab, {forceSolo: true});
            return true;
        default:
            creep.say('Error');
            return true;
    }
}

// Walks every still-pending entry, releases each claimed lab, then marks the
// creep as done attempting. Use for any terminal exit (TTL too low, all
// boosts applied, plan failed) — never silently abandon a reservation since
// labtech will keep hauling mineral until the lab times out.
function releaseAllBoostLabs(creep) {
    if (creep.memory.boosts) {
        const labs = creep.memory.boosts.labs || {};
        const requested = creep.memory.boosts.requestedBoosts || {};
        for (const entryKey of Object.keys(labs)) {
            const lab = Game.getObjectById(labs[entryKey]);
            if (!lab) continue;
            const amount = requested[entryKey] ? requested[entryKey].amount : 0;
            releaseBoostLab(creep, lab, amount);
        }
        creep.memory.boosts = undefined;
    }
    dropBoostReservations(creep);
}

function finishBoosting(creep) {
    releaseAllBoostLabs(creep);
    creep.memory.boostAttempt = true;
}

function bodyPartCount(creep, part) {
    let n = 0;
    for (let i = 0; i < creep.body.length; i++) {
        if (creep.body[i].type === part) n++;
    }
    return n;
}

function resourceForBoostPart(creep, bodyPart, preferred) {
    if (preferred) return preferred;
    const boostType = resolveBoostType(creep.memory.role, bodyPart) || bodyPart;
    const tiers = BOOST_USE[boostType];
    const boosted = creep.memory.hasBoosted;
    if (boosted && tiers) {
        for (let i = 0; i < boosted.length; i++) {
            if (tiers.includes(boosted[i])) return boosted[i];
        }
    }
    const amount = bodyPartCount(creep, bodyPart) * BOOST_AMOUNT_PER_PART;
    return findAvailableBoostTier(creep.room, boostType, amount);
}

// Full-body plan (including already-boosted parts) so a boosted mate still
// stages the same labs for the rest of the waitFor wave.
function buildWaveBoostPlan(creep) {
    const plan = {};
    const reservedParts = new Set();
    const nb = creep.memory.neededBoosts;
    const add = (resource, part) => {
        if (!resource || !part) return;
        const amount = bodyPartCount(creep, part) * BOOST_AMOUNT_PER_PART;
        if (!amount) return;
        plan[resource] = {boost: resource, amount, type: part};
        reservedParts.add(part);
    };
    if (nb && nb.boost && nb.boostPart) add(nb.boost, nb.boostPart);
    if (nb && nb.toughBoost) add(nb.toughBoost, TOUGH);
    if (nb && nb.moveBoost) add(nb.moveBoost, MOVE);
    const extra = creep.memory.misc && creep.memory.misc.boosts;
    if (extra) {
        for (let i = 0; i < extra.length; i++) {
            const part = extra[i];
            if (reservedParts.has(part)) continue;
            add(resourceForBoostPart(creep, part), part);
        }
    }
    return plan;
}

function ensureWaveBoostLab(creep, boostNeeded, amountNeeded, names, excludeIds) {
    const lab = pickBoostLab(creep.room, boostNeeded, excludeIds);
    if (!lab) return null;
    return bindBoostLab(lab, boostNeeded, amountNeeded, names);
}

// True when another same-wave body is spawning, still queued, or walking in
// to formColony (assignment steal). Do not seal a 3-body pad while the 4th
// is on the highway.
Creep.prototype.waveStillIncoming = function () {
    const waitFor = this.memory.misc && this.memory.misc.waitFor;
    if (!(waitFor > 1)) return false;
    const dest = this.memory.destination || '';
    const op = this.memory.operation || '';
    const home = (this.memory.misc && this.memory.misc.formColony) || this.memory.colony;

    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c.my || !c.memory || c.id === this.id) continue;
        if ((c.memory.destination || '') !== dest) continue;
        if ((c.memory.operation || '') !== op) continue;
        if (c.memory.initialFormUp || (c.memory.misc && c.memory.misc.sealed)) continue;
        if (((c.memory.misc && c.memory.misc.waitFor) || 0) !== waitFor) continue;
        const role = c.memory.role || '';
        const old = c.memory.oldRole || '';
        if (role !== 'longbowSquad' && role !== 'longbow'
            && old !== 'longbowSquad' && old !== 'longbow') continue;
        if (c.spawning) return true;
        const theirHome = (c.memory.misc && c.memory.misc.formColony) || c.memory.colony;
        if (home && theirHome === home && c.room.name !== home) return true;
    }

    if (typeof CREEP_QUEUES === 'undefined' || !CREEP_QUEUES) return false;
    for (const roomKey in CREEP_QUEUES) {
        const cache = CREEP_QUEUES[roomKey];
        if (!cache) continue;
        for (const k in cache) {
            const e = cache[k];
            if (!e) continue;
            if ((e.destination || '') !== dest) continue;
            if ((e.operation || '') !== op) continue;
            if (!e.misc || e.misc.waitFor !== waitFor) continue;
            const r = e.role || '';
            if (r !== 'longbowSquad' && r !== 'longbow') continue;
            return true;
        }
    }
    return false;
};

// Claim labs for the full waitFor wave as soon as the first body is alive so
// labTech can haul during the remaining spawn/renew, not after the last pop.
// Keep running after this body has boosted — a boosted leader still stages
// one lab per boost at the remaining-wave amount for mates still spawning.
Creep.prototype.reserveWaveBoosts = function () {
    const waitFor = this.memory.misc && this.memory.misc.waitFor;
    if (!(waitFor > 1)) return;
    if (this.memory.misc && this.memory.misc.sealed) return;
    const home = (this.memory.misc && this.memory.misc.formColony) || this.memory.colony;
    if (home && this.room.name !== home) return;
    if (!this.room.labs || !this.room.labs.length) return;

    const {names} = waveBoostMates(this);
    if (!names.length) return;

    const plan = buildWaveBoostPlan(this);
    if (!_.size(plan)) return;

    const exclude = new Set();
    for (const resource of Object.keys(plan)) {
        const total = plan[resource].amount * waveRemainingForBoost(this, resource);
        const lab = ensureWaveBoostLab(this, resource, total, names, exclude);
        if (lab) exclude.add(lab.id);
    }
};

Creep.prototype.tryToBoost = function (bodyPart = []) {
    if (this.memory.boostAttempt) return false;

    if (this.ticksToLive < BOOST_TTL_FLOOR) {
        finishBoosting(this);
        this.memory.needsRenewal = undefined;
        return false;
    }

    if (!this.memory.boosts) {
        const plan = buildBoostPlan(this, bodyPart);
        if (!_.size(plan)) {
            if (this.memory.neededBoosts && !this.memory.hasBoosted) {
                if (isWaitForWave(this)) return false;
                if (!this.memory.boostWaitTick) this.memory.boostWaitTick = Game.time;
                if (Game.time - this.memory.boostWaitTick < SOLO_BOOST_WAIT_TICKS) return true;
                if (isSiegeBoostOp(this)) {
                    this.recycleCreep();
                    return true;
                }
                finishBoosting(this);
                return false;
            }
            finishBoosting(this);
            return false;
        }
        if (isWaitForWave(this) && !planCoversExpectedBoosts(this, plan)) {
            // Remaining minerals are not in room.store. Leave with what landed
            // if required siege HEAL/TOUGH (or any boosts on non-siege) are on
            // the body; otherwise keep waiting so holdForWave can stall-recycle.
            if (this.memory.hasBoosted && this.memory.hasBoosted.length
                && (!isSiegeBoostOp(this) || creepHasRequiredSiegeBoosts(this))) {
                finishBoosting(this);
                return false;
            }
            return false;
        }
        // Claim a lab for every plan entry upfront so labtech sees the full
        // workload in one tick and can fill all reserved labs in parallel.
        // Entries that can't claim now (no free labs) fall back to per-tick
        // claim attempts inside applyBoost.
        const labs = {};
        const reserved = new Set();
        for (const resource of Object.keys(plan)) {
            const lab = claimBoostLab(this, resource, plan[resource].amount, reserved);
            if (lab) {
                labs[resource] = lab.id;
                reserved.add(lab.id);
            }
        }
        this.memory.boosts = {requestedBoosts: plan, labs};
        if (isWaitForWave(this) && !Object.keys(labs).length) return false;
        return true;
    }

    if (!_.size(this.memory.boosts.requestedBoosts)) {
        if (isWaitForWave(this) && !planCoversExpectedBoosts(this, {})) {
            if (isSiegeBoostOp(this) && !creepHasRequiredSiegeBoosts(this)) {
                this.memory.boosts = undefined;
                return false;
            }
            finishBoosting(this);
            return false;
        }
        finishBoosting(this);
        return false;
    }

    const waitFor = this.memory.misc && this.memory.misc.waitFor;
    if (!(waitFor > 1) && !this.memory.hasBoosted && this.hasActiveBodyparts(MOVE) &&
        this.handleRenewing(BOOST_RENEW_INITIAL)) return true;

    return applyBoost(this, pickActiveEntry(this));
};

Creep.prototype.releaseBoostLabs = function () {
    releaseAllBoostLabs(this);
};

Creep.prototype.clearBoostLabs = function () {
    finishBoosting(this);
};

Creep.prototype.recycleCreep = function () {
    this.clearBoostLabs();
    if (!this.hasActiveBodyparts(MOVE) && !MY_ROOMS.includes(this.room.name)) return this.suicide();
    this.memory.recycling = true;
    // Clear claim-TTL abort so pathing home is not blocked by applyClaimRouting.
    delete this.memory._claimAbort;
    const allSpawns = this.room.spawns || [];
    const spawns = [];
    for (let i = 0; i < allSpawns.length; i++) {
        try {
            if (allSpawns[i].my) spawns.push(allSpawns[i]);
        } catch (e) { /* ignore */
        }
    }
    let spawn = spawns.length ? this.pos.findClosestByRange(spawns) : null;
    if (!spawn) {
        if (this.memory.colony && this.room.name !== this.memory.colony) {
            this.shibMove(new RoomPosition(25, 25, this.memory.colony), {range: 22});
            return true;
        } else return this.suicide();
    }
    if (this.store.getUsedCapacity()) {
        let deliver = this.room.terminal || this.room.storage;
        if (deliver) {
            for (let resourceType in this.store) {
                if (this.transfer(deliver, resourceType) === ERR_NOT_IN_RANGE) this.shibMove(deliver);
            }
            return;
        }
    }
    switch (spawn.recycleCreep(this)) {
        case OK:
            log.d('Creep - ' + this.name + ' successfully recycled in ' + this.room.name, 'RECYCLING:');
            break;
        case ERR_NOT_IN_RANGE:
        case ERR_BUSY:
            this.shibMove(spawn);
    }
    return true;
};

Creep.prototype.handleRenewing = function (targetTicks) {
    if (this.ticksToLive > targetTicks || this.memory.hasBoosted || this.memory.renewalLimit < Game.time) {
        this.memory.needsRenewal = undefined;
        return false;
    }
    if (!this.memory.renewalLimit) this.memory.renewalLimit = Game.time + 2000;
    this.memory.needsRenewal = true;
    const mine = [];
    const all = this.room.spawns || [];
    for (let i = 0; i < all.length; i++) {
        try {
            if (all[i].my) mine.push(all[i]);
        } catch (e) { /* ignore */
        }
    }
    if (!mine.length) {
        if (this.memory.colony && this.room.name !== this.memory.colony) {
            this.shibMove(new RoomPosition(25, 25, this.memory.colony), {range: 22});
        }
        return true;
    }
    const idle = mine.filter(s => !s.spawning);
    const spawn = (idle.length ? this.pos.findClosestByRange(idle) : this.pos.findClosestByRange(mine)) || mine[0];
    if (spawn.spawning) {
        if (!this.pos.isNearTo(spawn)) this.shibMove(spawn, {range: 1, forceSolo: true});
        return true;
    }
    switch (spawn.renewCreep(this)) {
        case OK:
            this.memory.boostAttempt = undefined;
            break;
        case ERR_NOT_IN_RANGE:
        case ERR_BUSY:
            this.shibMove(spawn, {range: 1, forceSolo: true});
            break;
        case ERR_NOT_ENOUGH_ENERGY:
            this.memory.needsRenewal = undefined;
            return false;
        default:
            this.memory.needsRenewal = undefined;
            return false;
    }
    return true;
};

Creep.prototype.fleeNukeRoom = function () {
    this.say('NUKE!', true);
    if (this.memory.fleeNukeTime <= Game.time) {
        this.memory.fleeNukeTime = undefined;
        this.memory.fleeNukeRoom = undefined;
        return false;
    }
    if (this.memory.fleeTo && this.room.name !== this.memory.fleeTo) this.shibMove(new RoomPosition(25, 25, this.memory.fleeTo), {range: 23});
    else if (this.room.name !== this.memory.fleeTo) this.idleFor(this.memory.fleeNukeTime - Game.time);
    if (!this.memory.fleeTo) {
        const safe = MY_ROOMS.filter(r => {
            const room = Game.rooms[r];
            return room && !room.nukes.length;
        });
        if (safe.length) this.memory.fleeTo = _.sample(safe);
    }
};

Creep.prototype.moveRandom = function () {
    const directions = [TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT];
    const startIndex = Math.floor(Math.random() * 8);
    for (let i = 0; i < 8; i++) {
        let direction = directions[(startIndex + i) % 8];
        let pos = this.pos.getAdjacentPosition(direction);
        if (!pos || pos.checkForWall() || pos.checkForObstacleStructure() || pos.checkIfOutOfBounds()) continue;
        if (pos.isExit && pos.isExit()) continue;
        const occupant = pos.checkForCreep();
        if (occupant && occupant.id !== this.id) continue;
        this.move(direction);
        return true;
    }
    return false;
};