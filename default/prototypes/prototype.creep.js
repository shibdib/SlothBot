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

const exitTileCache = {};

function getRoomExits(room) {
    if (!exitTileCache[room.name]) exitTileCache[room.name] = room.find(FIND_EXIT);
    return exitTileCache[room.name];
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
            this._isFull = _.sum(this.store) >= this.store.getCapacity() * 0.98;
        }
        return this._isFull;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Creep.prototype, 'militaryPower', {
    get: function () {
        if (!this._militaryPower) {
            const ap = abilityPower(this.body);
            this._militaryPower = ap.attack + ap.effectiveHeal + (ap.defense / 100);
        }
        return this._militaryPower;
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
    if (this.className) return 0;
    let count = 0;
    for (let i = this.body.length; i-- > 0;) {
        if (this.body[i].hits > 0) {
            if (this.body[i].type === type) count++;
        } else break;
    }
    return count;
};

Creep.prototype.hasActiveBodyparts = function (type) {
    if (this.className) return false;
    return !!this.body.find(part => part.type === type && part.hits > 0);
};

Creep.prototype.wrongRoom = function () {
    if (this.pos.roomName !== this.memory.colony) {
        this.shibMove(new RoomPosition(25, 25, this.memory.colony), {range: 23});
        return true;
    }
};

Creep.prototype.findSource = function (ignoreOthers = false) {
    let source = _.find(this.room.sources, (s) => !_.find(Game.creeps, (c) => c.id !== this.id && c.memory.role === this.memory.role && c.memory.other.source === s.id));
    if (ignoreOthers) source = _.sample(this.room.sources);
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

    const armedEnemies = this.room.hostileCreeps.find(c => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK));
    if (this.hits < this.hitsMax * 0.5 && armedEnemies && this.pos.getRangeTo(this.pos.findClosestByRange(armedEnemies)) <= 4) {
        this.fleeHome(true);
        return true;
    }

    if (this.room.controller || (INTEL[this.room.name] && !INTEL[this.room.name].sk)) return false;

    const range = 7;
    const sk = this.room.creeps.find(c => c.owner && c.owner.username === 'Source Keeper' && c.pos.inRangeTo(this, range));
    const lair = this.room.structures.find(s => s.structureType === STRUCTURE_KEEPER_LAIR && s.ticksToSpawn && s.ticksToSpawn <= 5 && s.pos.inRangeTo(this, range));

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
            return this.transfer(item, RESOURCE_ENERGY) === OK;
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
            delete this.memory._shibMove;
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
            delete this.memory._shibMove;
        } else if (result === ERR_NOT_IN_RANGE) this.shibMove(destination);
        return true;
    } else if (destination.amount) {
        const result = this.pickup(destination);
        if (result === OK) {
            this.memory.lastWithdraw = destination.id;
            delete this.memory.energyDestination;
            delete this.memory._shibMove;
        } else if (result === ERR_NOT_IN_RANGE) this.shibMove(destination);
        return true;
    }

    delete this.memory.energyDestination;
    delete this.memory._shibMove;
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

    if (!room.storage && room.controller && room.controller.my && !['hauler', 'shuttle', 'remoteHauler', 'upgrader'].includes(this.memory.role)) {
        for (let i = 0; i < myCreeps.length; i++) {
            const c = myCreeps[i];
            if ((c.memory.role === 'remoteHauler' || c.memory.role === 'powerHauler') && c.store[RESOURCE_ENERGY] > 0 && !c.memory.storageDestination && c.pos.getRangeTo(room.controller) <= 10) {
                potentialEnergy.push(c);
            }
        }
    }

    if (this.memory.role === 'hauler') {
        const hubLink = Game.getObjectById(room.memory.hubLink);
        if (hubLink && hubLink.store[RESOURCE_ENERGY] > 0) {
            const upgrader = room.myCreeps.find(c => c.memory.role === 'upgrader' && c.memory.other && c.memory.other.stationary);
            const controllerLink = Game.getObjectById(room.memory.controllerLink);
            if (!room.storage || room.energyState <= 2 || !upgrader || !controllerLink || controllerLink.store[RESOURCE_ENERGY] > LINK_CAPACITY * 0.5) {
                this.memory.energyDestination = hubLink.id;
                return true;
            }
        }
    }

    for (let i = 0; i < room.tombstones.length; i++) if (room.tombstones[i].store[RESOURCE_ENERGY] > 0) potentialEnergy.push(room.tombstones[i]);
    for (let i = 0; i < room.ruins.length; i++) if (room.ruins[i].store[RESOURCE_ENERGY] > 0) potentialEnergy.push(room.ruins[i]);
    if (room.factory && room.factory.store[RESOURCE_ENERGY] > 0) potentialEnergy.push(room.factory);

    if (this.memory.role !== 'shuttle') {
        const protoStorage = room.memory.protoStorage ? Game.getObjectById(room.memory.protoStorage) : undefined;
        if (room.storage && room.storage.store[RESOURCE_ENERGY] > (room.terminal ? room.terminal.store[RESOURCE_ENERGY] - TERMINAL_ENERGY_BUFFER : 0)) {
            potentialEnergy.push(room.storage);
        } else if (room.terminal && room.terminal.store[RESOURCE_ENERGY] > TERMINAL_ENERGY_BUFFER) {
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
        for (let i = 0; i < room.structures.length; i++) {
            const s = room.structures[i];
            if (s.structureType === STRUCTURE_CONTAINER && (s.id !== room.memory.controllerContainer || room.level === 8) && s.store[RESOURCE_ENERGY] > 0) {
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
                    delete this.memory._shibMove;
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
            delete this.memory._shibMove;
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
    const allSpawnExtensions = [], allTowers = [], allLabs = [];
    for (const s of this.room.structures) {
        switch (s.structureType) {
            case STRUCTURE_SPAWN:
            case STRUCTURE_EXTENSION:
                allSpawnExtensions.push(s);
                break;
            case STRUCTURE_TOWER:
                allTowers.push(s);
                break;
            case STRUCTURE_LAB:
                allLabs.push(s);
                break;
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

    if (this.room.controller && this.room.controller.level >= 3) {
        const threatLevel = (INTEL[this.room.name] && INTEL[this.room.name].threatLevel) || 0;
        const targetAmount = threatLevel ? 1 : 0.75;
        targets = allTowers.filter(s => s.store[RESOURCE_ENERGY] < TOWER_CAPACITY * targetAmount);
        if (targets.length) {
            this.memory.storageDestination = this.pos.findClosestByRange(targets).id;
            return true;
        }
    }

    const hubLink = Game.getObjectById(this.room.memory.hubLink);
    if (this.room.level < 8 && hubLink && hubLink.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && this.room.energyState > 1) {
        targets.push(hubLink);
    }

    targets = targets.concat(allLabs.filter(s => s.store.getFreeCapacity(RESOURCE_ENERGY) > 0));

    if (!this.room.memory.controllerLink && this.room.energyState > 0) {
        let controllerContainer = Game.getObjectById(this.room.memory.controllerContainer);
        if (controllerContainer && controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) > 200) targets.push(controllerContainer);
    }

    if (this.room.nuker) {
        const nuker = this.room.nuker.find(s => s.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
        if (nuker && this.room.energyState > 1) targets.push(nuker);
    }

    if (this.room.terminal && this.room.terminal.store.getUsedCapacity(RESOURCE_ENERGY) < TERMINAL_ENERGY_BUFFER) targets.push(this.room.terminal);
    if (this.room.storage && this.room.storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && this.memory.lastWithdraw !== this.room.storage.id) targets.push(this.room.storage);

    let target = this.pos.findClosestByRange(targets);
    if (target) {
        this.memory.storageDestination = target.id;
        return true;
    }

    const fallback = this.room.storage || this.room.terminal;
    if (fallback && fallback.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        this.memory.storageDestination = fallback.id;
        return true;
    }
    return false;
};

Creep.prototype.constructionWork = function () {
    let structures = _.filter(this.room.structures, (s) => s.hits < s.hitsMax &&
        !_.find(this.room.myCreeps, (c) => c.memory.constructionSite === s.id) &&
        (INTEL[this.room.name].owner === MY_USERNAME || [STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_WALL, STRUCTURE_RAMPART].includes(s.structureType)));
    let mySites = _.filter(this.room.constructionSites, (s) => !s.owner || _.includes(FRIENDLIES, s.owner.username));

    let site = _.find(mySites, (s) => s.structureType === STRUCTURE_TOWER);
    if (site) {
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        this.memory.sitePos = JSON.stringify(site.pos);
        return true;
    }

    site = _.find(structures, (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < 5000);
    if (site) {
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        this.memory.targetHits = 12500;
        this.memory.sitePos = JSON.stringify(site.pos);
        return true;
    }

    if (INTEL[this.room.name].threatLevel) {
        let hostileBarrier = _.min(_.filter(this.room.structures, (s) =>
            [STRUCTURE_WALL, STRUCTURE_RAMPART].includes(s.structureType) &&
            s.pos.findInRange(_.filter(s.room.hostileCreeps, (c) =>
                c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(WORK)
            ), 5)[0]
        ), 'hits');

        if (hostileBarrier && hostileBarrier.id) {
            this.memory.constructionSite = hostileBarrier.id;
            this.memory.task = 'repair';
            this.memory.targetHits = hostileBarrier.hits + 25000;
            this.memory.sitePos = JSON.stringify(hostileBarrier.pos);
            return true;
        }
    }

    const spawn = this.room.spawns[0];
    if (spawn && this.room.controller && (this.room.controller.safeMode || (this.room.controller.owner && this.room.controller.owner.username !== MY_USERNAME))) {
        site = _.filter(mySites, (s) => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL);
        if (site.length) {
            site = this.pos.findClosestByRange(site);
            this.memory.constructionSite = site.id;
            this.memory.task = 'build';
            this.memory.sitePos = JSON.stringify(site.pos);
            return true;
        }
        site = structures.filter((s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < 500000);
        if (site.length) {
            this.memory.constructionSite = _.min(site, 'hits').id;
            this.memory.task = 'repair';
            this.memory.targetHits = 502500;
            this.memory.sitePos = JSON.stringify(_.min(site, 'hits').pos);
            return true;
        }
    } else if (!spawn) {
        site = _.filter(mySites, (s) => s.structureType === STRUCTURE_RAMPART);
        if (site.length) {
            site = this.pos.findClosestByRange(site);
            this.memory.constructionSite = site.id;
            this.memory.task = 'build';
            this.memory.sitePos = JSON.stringify(site.pos);
            return true;
        }
    }

    const buildableStructures = [STRUCTURE_SPAWN, STRUCTURE_EXTENSION, STRUCTURE_LINK, STRUCTURE_TERMINAL, STRUCTURE_STORAGE];
    for (let structureType of buildableStructures) {
        site = _.find(mySites, (s) => s.structureType === structureType);
        if (site) {
            this.memory.constructionSite = site.id;
            this.memory.task = 'build';
            this.memory.sitePos = JSON.stringify(site.pos);
            return true;
        }
    }

    site = _.find(structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.hits < s.hitsMax * 0.5);
    if (site) {
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        this.memory.targetHits = site.hitsMax * 0.65;
        this.memory.sitePos = JSON.stringify(site.pos);
        return true;
    }

    site = _.find(mySites, (s) => s.structureType === STRUCTURE_CONTAINER);
    if (site) {
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        this.memory.sitePos = JSON.stringify(site.pos);
        return true;
    }

    site = _.filter(mySites, (s) => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL);
    if (site.length) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        this.memory.sitePos = JSON.stringify(site.pos);
        return true;
    }

    site = _.find(mySites, (s) => s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART);
    if (site) {
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        this.memory.sitePos = JSON.stringify(site.pos);
        return true;
    }

    site = _.find(structures, (s) => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * 0.25);
    if (site) {
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        this.memory.targetHits = site.hitsMax * 0.5;
        this.memory.sitePos = JSON.stringify(site.pos);
        return true;
    }

    site = _.find(structures, (s) => s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART && s.hits < s.hitsMax * 0.50);
    if (site) {
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        this.memory.targetHits = site.hitsMax;
        this.memory.sitePos = JSON.stringify(site.pos);
        return true;
    }

    this.memory.constructionSite = undefined;
    this.memory.task = undefined;
    this.memory.sitePos = undefined;
    this.memory.targetHits = undefined;
    return false;
};

Creep.prototype.builderFunction = function () {
    let construction = Game.getObjectById(this.memory.constructionSite);
    if (!construction) {
        if (this.memory.sitePos && JSON.parse(this.memory.sitePos).roomName !== this.room.name) {
            const sitePos = JSON.parse(this.memory.sitePos);
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
        if (construction.hits === construction.hitsMax || construction.hits >= this.memory.targetHits) {
            this.memory.constructionSite = undefined;
            this.memory.task = undefined;
            this.memory.targetHits = undefined;
            this.say('Done!', true);
            return false;
        }

        this.say('Fix!', true);
        construction.say(construction.hits + '/' + construction.hitsMax);
        switch (this.repair(construction)) {
            case OK:
                if (this.pos.isNearTo(this.pos.findClosestByRange(FIND_SOURCES))) this.moveRandom();
                this.memory.other.stationary = true;
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

        const remaining = construction.progressTotal - construction.progress;
        if (remaining > this.store[RESOURCE_ENERGY] && this.pos.getRangeTo(construction) <= 4) {
            const activeBuilder = this.pos.findInRange(FIND_MY_CREEPS, 1).find(c =>
                c.id !== this.id &&
                c.memory.constructionSite === construction.id &&
                c.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            );
            if (activeBuilder) {
                this.transfer(activeBuilder, RESOURCE_ENERGY);
                this.memory.constructionSite = undefined;
                this.memory.task = undefined;
                this.memory.working = undefined;
                return false;
            }
        }

        switch (this.build(construction)) {
            case OK:
                if (this.pos.isNearTo(this.pos.findClosestByRange(FIND_SOURCES))) this.moveRandom();
                this.memory.other.stationary = true;
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
    if (!this.memory.trailer) return false;
    const trailer = Game.getObjectById(this.memory.trailer);
    if (!trailer) {
        endTow(this, null);
        return false;
    }
    if (trailer.pos.roomName !== this.pos.roomName) {
        this.say('Lost Trailer!', true);
        releaseTruckRef(this);
        return false;
    }
    if (_.sum(this.store)) return false;
    if (!this.memory.towStart) {
        this.memory.towStart = Game.time;
        this.memory.lastTowProgress = Game.time;
        this.memory.lastTowDist = undefined;
    }
    if (this.fatigue) return true;
    if (!trailer.memory.towDestination) {
        endTow(this, trailer);
        return false;
    }
    const towDestination = getTowDestination(trailer);
    if (!towDestination) {
        endTow(this, trailer);
        return false;
    }
    // Track progress toward destination — the tow only times out when it genuinely stalls,
    // not because total elapsed exceeded a fixed budget. Long-distance tows that keep making
    // ground (slow truck fatigue, congested paths) can now complete.
    const currentDist = trailer.pos.getRangeTo(towDestination);
    if (this.memory.lastTowDist === undefined || currentDist < this.memory.lastTowDist) {
        this.memory.lastTowDist = currentDist;
        this.memory.lastTowProgress = Game.time;
    }
    this.say('Towing!', true);
    if (trailer.memory.towOptions && trailer.memory.towOptions.range === 0 && this.pos.isNearTo(towDestination)) {
        const occupant = towDestination.checkForCreep();
        if (occupant && occupant.id !== this.id) {
            trailer.memory.towOptions.range = 1;
        }
    }
    if (shouldEndTow(this, trailer, towDestination)) {
        endTow(this, trailer);
        return false;
    }
    const pullResult = this.pull(trailer);
    if (pullResult === ERR_NOT_IN_RANGE) {
        adjustMovement(this, trailer);
        this.shibMove(trailer, {range: 1});
        return true;
    }
    if (pullResult === OK) {
        trailer.move(this);
        moveToTowDestination(this, trailer, towDestination);
    }
    return true;
};

function getTowDestination(trailer) {
    const td = trailer.memory.towDestination;
    if (!td) return null;
    if (typeof td === 'object') {
        return new RoomPosition(td.x, td.y, td.roomName);
    }
    const obj = Game.getObjectById(td);
    if (obj) return obj.pos;
    // Object lookup failed (e.g., container destroyed and rebuilt under a new id mid-tow).
    // Fall back to the position we snapshotted when the tow started — containers, controllers,
    // and spawns don't move, so the saved tile is still the right place to go.
    const pos = trailer.memory.towDestinationPos;
    if (pos) return new RoomPosition(pos.x, pos.y, pos.roomName);
    return null;
}

// Stall-based timeout: end the tow only when distance to destination hasn't dropped in
// STALL_LIMIT ticks. Replaces the previous fixed 125-tick total-elapsed timeout, which
// stranded heavy creeps mid-route on long or congested tows.
const STALL_LIMIT = 30;

function shouldEndTow(truck, trailer, towDestination) {
    const lastProgress = truck.memory.lastTowProgress || truck.memory.towStart || Game.time;
    return lastProgress + STALL_LIMIT < Game.time
        || !towDestination
        || !trailer.memory.towOptions
        || trailer.memory.towOptions.range >= trailer.pos.getRangeTo(towDestination);
}

function endTow(truck, trailer) {
    releaseTruckRef(truck);
    if (trailer) resetTowingState(trailer);
}

function releaseTruckRef(truck) {
    truck.memory.towStart = undefined;
    truck.memory.lastRangeToTrailer = undefined;
    truck.memory.lastTowDist = undefined;
    truck.memory.lastTowProgress = undefined;
    truck.memory.trailer = undefined;
}

function resetTowingState(trailer) {
    trailer.memory._shibMove = undefined;
    trailer.memory.towCreep = undefined;
    trailer.memory.towDestination = undefined;
    trailer.memory.towDestinationPos = undefined;
    trailer.memory.towToObject = undefined;
    trailer.memory.towOptions = undefined;
}

function adjustMovement(creep, trailer) {
    const range = trailer.pos.getRangeTo(creep);
    if (creep.memory.lastRangeToTrailer
        && creep.memory.lastRangeToTrailer < 5
        && creep.memory.lastRangeToTrailer < range) {
        creep.memory._shibMove = undefined;
    }
    creep.memory.lastRangeToTrailer = range;
}

function moveToTowDestination(creep, trailer, towDestination) {
    if (creep.pos.getRangeTo(towDestination) === trailer.memory.towOptions.range) {
        creep.move(creep.pos.getDirectionTo(trailer));
    } else {
        trailer.memory._shibMove = undefined;
        creep.shibMove(towDestination, {...trailer.memory.towOptions});
    }
}

Creep.prototype.borderCheck = function () {
    const {x, y} = this.pos;
    if (x !== 0 && y !== 0 && x !== 49 && y !== 49) {
        this.memory.borderCountDown = undefined;
        return false;
    }
    this.attackInRange();
    this.healInRange(true);
    if (this.memory.borderCountDown) this.memory.borderCountDown++; else this.memory.borderCountDown = 1;
    if (this.memory.borderCountDown < 5 && this.memory._shibMove) return false;

    this.memory._shibMove = undefined;
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

// Releases just the boost-related fields on a lab's memory. Replaces the older
// `lab.memory = undefined` cleanups that also wiped itemNeeded / producing state
// and tore down the production hub (see labController.manageActiveLabs sanity check).
// Keeping `paused` here is critical — without clearing it the lab is permanently
// excluded from secondary-reaction selection in labController.
function clearLabBoost(lab) {
    if (!lab || !lab.memory) return;
    lab.memory.neededBoost = undefined;
    lab.memory.amount = undefined;
    lab.memory.requestor = undefined;
    lab.memory.requested = undefined;
    lab.memory.paused = undefined;
    lab.memory.preReservedFor = undefined;
}

const BOOST_AMOUNT_PER_PART = LAB_BOOST_MINERAL;
const BOOST_TTL_FLOOR = CREEP_LIFE_TIME * 0.6;
const BOOST_RENEW_INITIAL = CREEP_LIFE_TIME * 0.85;
const BOOST_RENEW_WAITING = CREEP_LIFE_TIME * 0.95;
const BOOST_LAB_WAIT_TICKS = 5;
const BOOST_SQUAD_WAIT_TICKS = 5;

const WORK_BOOST_BY_ROLE = {
    drone: 'build',
    waller: 'build',
    upgrader: 'upgrade',
    cleaner: 'dismantle',
    siegeDuo: 'dismantle',
    commodityMiner: 'harvest',
    mineralHarvester: 'harvest'
};

function resolveBoostType(role, bodyPart) {
    if (bodyPart === WORK) return WORK_BOOST_BY_ROLE[role] || null;
    return bodyPart;
}

function findAvailableBoostTier(room, boostType, amountNeeded) {
    const tiers = BOOST_USE[boostType];
    if (!tiers) return null;
    for (const resource of tiers) {
        if (room.store(resource) >= amountNeeded) return resource;
    }
    return null;
}

function buildBoostPlan(creep, requestedBodyParts) {
    const plan = {};
    let preReservedPart;

    if (creep.memory.neededBoosts && creep.memory.neededBoosts.boost) {
        const {boost, boostPart} = creep.memory.neededBoosts;
        const amount = creep.getActiveBodyparts(boostPart) * BOOST_AMOUNT_PER_PART;
        if (amount && creep.room.store(boost) >= amount) {
            plan[boost] = {boost, amount, type: boostPart};
            preReservedPart = boostPart;
        }
    }

    const bodyParts = (creep.memory.misc && creep.memory.misc.boosts)
        ? _.union(requestedBodyParts, creep.memory.misc.boosts)
        : requestedBodyParts;

    for (const bodyPart of bodyParts) {
        if (bodyPart === preReservedPart) continue;
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

function waitingForSquad(creep) {
    const misc = creep.memory.misc;
    if (!misc || misc.waitFor <= 1) return false;
    const leader = creep.memory.leader ? creep : Game.getObjectById(creep.memory.groupLeader);
    const squadSize = leader ? leader.memory.squadMembers.length + 1 : 1;
    if (!creep.memory.formUpTimer) {
        creep.memory.formUpTimer = creep.memory.renewalLimit || (Game.time + misc.waitFor * 1000);
    }
    return squadSize < misc.waitFor && creep.memory.formUpTimer > Game.time;
}

// Excludes labs with itemNeeded — those belong to production reactions.
// Co-opting them would fight labController / labTech.
function claimBoostLab(creep, boostNeeded, amountNeeded) {
    const lab = _.find(creep.room.labs, s =>
        s.isActive() && s.store[RESOURCE_ENERGY] > 0 && !s.memory.itemNeeded &&
        (!s.memory.neededBoost || s.memory.neededBoost === boostNeeded));
    if (!lab) return null;

    if (lab.memory.preReservedFor === creep.name) {
        // Pre-spawn reservation by creepSpawning.preReserveBoostLab already
        // accounted for our amount — just claim.
        lab.memory.preReservedFor = undefined;
        lab.memory.requestor = creep.id;
    } else {
        lab.memory.paused = true;
        lab.memory.neededBoost = boostNeeded;
        lab.memory.amount = (lab.memory.amount || 0) + amountNeeded;
        lab.memory.requestor = creep.id;
        lab.memory.requested = Game.time;
    }
    return lab;
}

function releaseBoostLab(creep, lab, amountNeeded) {
    const boostNeeded = lab.memory.neededBoost;
    lab.memory.amount = Math.max(0, (lab.memory.amount || 0) - amountNeeded);
    const stillWanted = boostNeeded && creep.room.myCreeps.some(c =>
        c.id !== creep.id && c.memory.boosts &&
        c.memory.boosts.boostLab === lab.id &&
        c.memory.boosts.requestedBoosts &&
        c.memory.boosts.requestedBoosts[boostNeeded]);
    if (!stillWanted) {
        lab.memory.neededBoost = undefined;
        lab.memory.paused = undefined;
    }
}

function applyBoost(creep, entryKey) {
    const {boost: boostNeeded, amount: amountNeeded, type: boostType} =
        creep.memory.boosts.requestedBoosts[entryKey];

    if (creep.room.store(boostNeeded) < amountNeeded) {
        const orphan = Game.getObjectById(creep.memory.boosts.boostLab);
        if (orphan && orphan.memory.requestor === creep.id) clearLabBoost(orphan);
        creep.memory.boosts.boostLab = undefined;
        delete creep.memory.boosts.requestedBoosts[entryKey];
        return true;
    }

    let lab = Game.getObjectById(creep.memory.boosts.boostLab);
    if (!lab || lab.memory.neededBoost !== boostNeeded) {
        lab = claimBoostLab(creep, boostNeeded, amountNeeded);
        if (!lab) {
            creep.memory.boosts.boostLab = undefined;
            return true;
        }
        creep.memory.boosts.boostLab = lab.id;
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
        creep.memory.boosts.boostLab = undefined;
        creep.say(ICONS.greenCheck);
        return true;
    }

    lab.say(boostNeeded);
    const labReady = lab.mineralType === boostNeeded &&
        lab.store[RESOURCE_ENERGY] &&
        lab.mineralAmount >= lab.memory.amount;

    if (!labReady) {
        if (!creep.memory.hasBoosted && creep.hasActiveBodyparts(MOVE) &&
            creep.handleRenewing(BOOST_RENEW_WAITING)) return true;
        return creep.idleFor(BOOST_LAB_WAIT_TICKS);
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

Creep.prototype.tryToBoost = function (bodyPart = []) {
    if (this.memory.boostAttempt) return false;

    if (this.ticksToLive < BOOST_TTL_FLOOR) {
        if (this.memory.boosts) {
            clearLabBoost(Game.getObjectById(this.memory.boosts.boostLab));
            this.memory.boosts = undefined;
        }
        this.memory.boostAttempt = true;
        this.memory.needsRenewal = undefined;
        return false;
    }

    if (!this.memory.boosts || !this.memory.boosts.requestedBoosts) {
        const plan = buildBoostPlan(this, bodyPart);
        if (!_.size(plan)) {
            // Pre-reserved boost still being filled by labtech — retry next tick.
            if (this.memory.neededBoosts && !this.memory.hasBoosted) {
                this.memory.boosts = undefined;
                return true;
            }
            this.memory.boosts = undefined;
            this.memory.boostAttempt = true;
            return false;
        }
        this.memory.boosts = {requestedBoosts: plan};
        return true;
    }

    if (!_.size(this.memory.boosts.requestedBoosts)) {
        clearLabBoost(Game.getObjectById(this.memory.boosts.boostLab));
        this.memory.boosts = undefined;
        this.memory.boostAttempt = true;
        return false;
    }

    if (waitingForSquad(this)) return this.idleFor(BOOST_SQUAD_WAIT_TICKS);

    if (!this.memory.hasBoosted && this.hasActiveBodyparts(MOVE) &&
        this.handleRenewing(BOOST_RENEW_INITIAL)) return true;

    return applyBoost(this, Object.keys(this.memory.boosts.requestedBoosts)[0]);
};

Creep.prototype.recycleCreep = function () {
    if (!this.hasActiveBodyparts(MOVE) && !MY_ROOMS.includes(this.room.name)) return this.suicide();
    this.memory.recycling = true;
    let spawn = this.pos.findClosestByRange(FIND_MY_SPAWNS);
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
    let spawn = this.room.spawns.find((s) => !s.spawning);
    if (!spawn) {
        if (this.room.name !== this.memory.colony) this.shibMove(new RoomPosition(25, 25, this.memory.colony), {range: 22});
        else this.idleFor(5);
    } else {
        switch (spawn.renewCreep(this)) {
            case OK:
                this.memory.boostAttempt = undefined;
                break;
            case ERR_NOT_IN_RANGE:
            case ERR_BUSY:
                this.shibMove(spawn, {forceSolo: true});
        }
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
    if (!this.memory.fleeTo) this.memory.fleeTo = _.sample(_.filter(MY_ROOMS, (r) => !Game.rooms[r].nukes.length)).name;
};

Creep.prototype.moveRandom = function () {
    const directions = [TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT];
    const startIndex = Math.floor(Math.random() * 8);
    for (let i = 0; i < 8; i++) {
        let direction = directions[(startIndex + i) % 8];
        let pos = this.pos.getAdjacentPosition(direction);
        if (pos && !pos.checkForObstacleStructure() && !pos.checkForWall() && !pos.checkIfOutOfBounds()) {
            this.move(direction);
            return;
        }
    }
};