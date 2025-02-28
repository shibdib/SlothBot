/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */
'use strict';

Object.defineProperty(Creep.prototype, "idle", {
    configurable: true,
    get: function () {
        if (this.memory.idle === undefined) return 0;
        if (this.memory.idle <= Game.time || (this.ticksToLive >= 1485 || this.hasActiveBodyparts(CLAIM))
            || this.room.hostileCreeps.length || (INTEL[this.room.name] && INTEL[this.room.name].threatLevel)) {
            delete this.idle;
            delete this.memory.idle;
            delete this.memory.idleSet;
            return 0;
        }
        // Handle flee if hostile is gone
        if (this.memory.runCooldown && this.memory.ranFrom && INTEL[this.memory.ranFrom] && !INTEL[this.memory.ranFrom].numberOfHostiles) {
            delete this.idle;
            delete this.memory.idle;
            delete this.memory.ranFrom;
            delete this.memory.runCooldown;
            return 0;
        }
        if (!this.memory.idleSet) {
            const militaryCreep = this.hasActiveBodyparts(ATTACK) || this.hasActiveBodyparts(RANGED_ATTACK);
            if ((militaryCreep && this.pos.checkForRampart()) || !this.hasActiveBodyparts(MOVE)) {
                this.memory.idleSet = true;
            } else if (this.pos.getRangeTo(this.pos.findClosestByRange(this.room.find(FIND_EXIT))) < 8) {
                const middleOfRoom = new RoomPosition(25, 25, this.room.name);
                this.shibMove(middleOfRoom, {range: 10});
                return true;
            } else if (!this.memory.role.includes("Harvester") && (this.pos.checkForRoad() || this.pos.checkForContainer() || this.pos.lookForNearby(LOOK_SOURCES, true, 2)[0])) {
                return this.moveRandom();
            } else this.memory.idleSet = true;
        }
        this.say(_.sample([ICONS.wait23, ICONS.wait21, ICONS.wait19, ICONS.wait17, ICONS.wait13, ICONS.wait11, ICONS.wait7, ICONS.wait10, ICONS.wait3, ICONS.wait1]), true);
        return this.memory.idle;
    },
    set: function (val) {
        if (!val && this.memory.idle) {
            delete (this.memory.idle);
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

Object.defineProperty(Creep.prototype, 'combatPower', {
    get: function () {
        if (!this._combatPower) {
            let power = 0;
            if (this.hasActiveBodyparts(HEAL)) power += this.abilityPower().heal;
            if (this.hasActiveBodyparts(ATTACK) || this.hasActiveBodyparts(RANGED_ATTACK)) power += this.abilityPower().attack;
            this._combatPower = power;
        }
        return this._combatPower;
    },
    enumerable: false,
    configurable: true
});

/**
 * Idle for a set number of ticks
 * @param ticks
 * @returns {*|boolean}
 */
Creep.prototype.idleFor = function (ticks = 0) {
    if (this.hits < this.hitsMax && this.hasActiveBodyparts(HEAL)) return this.heal(this);
    if (ticks > 0) {
        this.idle = Game.time + ticks;
    } else {
        delete this.idle;
    }
    return true;
};

/**
 * Fast get bodyparts
 * @param type
 * @returns {number}
 */
Creep.prototype.getActiveBodyparts = function (type) {
    if (this.className) return 0;
    let count = 0;
    for (let i = this.body.length; i-- > 0;) {
        if (this.body[i].hits > 0) {
            if (this.body[i].type === type) {
                count++;
            }
        } else break;
    }
    return count;
};

/**
 * Fast check for bodyparts
 * @param type
 * @returns {boolean}
 */
Creep.prototype.hasActiveBodyparts = function (type) {
    if (this.className) return false;
    return !!this.body.find(part => part.type === type && part.hits > 0);
};

/**
 * Check if creep is not in its assigned room
 * @returns {boolean}
 */
Creep.prototype.wrongRoom = function () {
    if (this.pos.roomName !== this.memory.colony) {
        this.shibMove(new RoomPosition(25, 25, this.memory.colony), {range: 23});
        return true;
    }
};

/**
 * Find a source
 * @param ignoreOthers
 * @returns {*|boolean}
 */
Creep.prototype.findSource = function (ignoreOthers = false) {
    let source = _.find(this.room.sources, (s) => !_.find(Game.creeps, (c) => c.id !== this.id && c.memory.role === this.memory.role && c.memory.other.source === s.id));
    if (ignoreOthers) source = _.sample(this.room.sources);
    if (source) {
        this.memory.other.source = source.id;
        return source.id;
    }
    return false;
};

/**
 * Handle SK damage
 * @returns {boolean}
 */
Creep.prototype.skSafety = function () {
    if (this.memory.destination && this.memory.destination !== this.room.name) return false;
    // Check if creep is damaged or if there are armed enemies nearby
    const armedEnemies = this.room.hostileCreeps.find(c => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK));
    if (this.hits < this.hitsMax || armedEnemies) {
        this.fleeHome(true);
        return true;
    }

    // Exit if there's a controller or no SK threat
    if (this.room.controller || (INTEL[this.room.name] && !INTEL[this.room.name].sk)) return false;

    const range = 4;
    const skFilter = (c) => c.owner.username === 'Source Keeper' && c.pos.inRangeTo(this, range);
    const lairFilter = (s) => s.structureType === STRUCTURE_KEEPER_LAIR && s.ticksToSpawn && s.ticksToSpawn <= 3 && s.pos.inRangeTo(this, range);

    // Look for threats more efficiently
    const sk = this.room.creeps.find(skFilter);
    const lair = this.room.structures.find(lairFilter);

    if (sk || lair) {
        // Kite away from the threat
        this.shibKite(range + 2, sk || lair);
        this.memory.fledSK = Game.time;
        return true;
    } else if (this.memory.fledSK) {
        // Check if it's time to stop idling
        if (this.memory.fledSK + 5 <= Game.time) {
            delete this.memory.fledSK;
        } else {
            // Set idle state correctly
            this.idleFor(10);
            return true;
        }
    }

    // Handle invader cores
    if (this.room.impassibleStructures.some(s => s.structureType === STRUCTURE_INVADER_CORE)) {
        return this.suicide() === OK;
    }

    return false;
};

/**
 * Opportunistic repair
 * @returns {boolean}
 */
Creep.prototype.opportunisticRepair = function () {
    if (!this.hasActiveBodyparts(WORK) || !this.store[RESOURCE_ENERGY]) return false;
    try {
        const structure = this.pos.checkForAllStructure(true);
        if (structure && structure.hits < structure.hitsMax) {
            this.say("Repairman!", true)
            this.repair(structure);
        }
    } catch (e) {
    }
};

/**
 * Opportunistic fill extensions and spawns
 * @returns {boolean}
 */
Creep.prototype.opportunisticFill = function () {
    if (!this.store[RESOURCE_ENERGY] || !this.room.level) return false;

    // Look for structures in a 3x3 area around the creep
    let nearbyStructures, nearbyCreeps, nearbyItems;
    try {
        nearbyStructures = this.room.lookForAtArea(LOOK_STRUCTURES, this.pos.y - 1, this.pos.x - 1, this.pos.y + 1, this.pos.x + 1, true);
        nearbyCreeps = this.room.lookForAtArea(LOOK_CREEPS, this.pos.y - 1, this.pos.x - 1, this.pos.y + 1, this.pos.x + 1, true);
        nearbyItems = nearbyStructures.concat(nearbyCreeps);
    } catch (e) {
        return false;
    }
    for (let item of nearbyItems) {
        if (item.type === LOOK_STRUCTURES) {
            if ([STRUCTURE_EXTENSION, STRUCTURE_SPAWN].includes(item.structure.structureType) &&
                item.structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                return this.transfer(item.structure, RESOURCE_ENERGY) === OK;
            }
        } else if (item.type === LOOK_CREEPS && item.creep.my && ['upgrader', 'drone'].includes(item.creep.memory.role) && item.creep.store.getFreeCapacity(RESOURCE_ENERGY)) {
            return this.transfer(item, RESOURCE_ENERGY) === OK;
        }
    }
    return false;
};

/**
 * Handle withdrawing from a structure
 * @param {Structure|Resource} destination - The structure or resource to withdraw from
 * @param {string} resourceType - The type of resource to withdraw, defaults to RESOURCE_ENERGY
 * @param {number} amount - The amount to withdraw, if undefined, withdraw all available
 * @returns {boolean} - Returns true if successful, false otherwise
 */
Creep.prototype.withdrawResource = function (destination = undefined, resourceType = RESOURCE_ENERGY, amount = undefined) {
    if (!destination) {
        destination = Game.getObjectById(this.memory.energyDestination);
    } else {
        this.memory.energyDestination = destination.id;
    }

    if (!destination) {
        this.memory.energyDestination = undefined;
        return false;
    }

    if (destination.resourceType && destination.resourceType !== resourceType) {
        resourceType = destination.resourceType;
    } else if (destination.store && !destination.store[resourceType]) {
        resourceType = Object.keys(destination.store)[0];
        if (!resourceType) {
            delete this.memory.energyDestination;
            return false;
        }
    }

    if (!destination) {
        this.memory.energyDestination = undefined;
        return false;
    }

    // Handle taking from creeps
    if (destination instanceof Creep) {
        let result = destination.transfer(this, resourceType, amount);
        if (result === OK) {
            this.memory.lastWithdraw = destination.id;
            delete this.memory.energyDestination;
            delete this.memory._shibMove;
            return true;
        } else if (result === ERR_NOT_IN_RANGE) {
            return this.shibMove(destination);
        }
    }

    // Handling resources with 'store'
    if (destination.store && destination.store[resourceType]) {
        let result = this.withdraw(destination, resourceType, amount);
        if (result === OK) {
            this.memory.lastWithdraw = destination.id;
            delete this.memory.energyDestination;
            delete this.memory._shibMove;
        } else if (result === ERR_NOT_IN_RANGE) {
            this.shibMove(destination);
        }
        return true;
    }
    // Handling resources without 'store' (like dropped energy)
    else if (destination.amount) {
        let result = this.pickup(destination);
        if (result === OK) {
            this.memory.lastWithdraw = destination.id;
            delete this.memory.energyDestination;
            delete this.memory._shibMove;
        } else if (result === ERR_NOT_IN_RANGE) {
            this.shibMove(destination);
        }
        return true;
    }

    // If we've reached here, something went wrong or the destination is invalid
    delete this.memory.energyDestination;
    delete this.memory._shibMove;
    return false;
};

/**
 * Locate energy in a room
 * @param {Room} room - The room to search for energy, defaults to the creep's current room
 * @returns {boolean} - Returns true if energy location was found, false otherwise
 */
Creep.prototype.locateEnergy = function (room = this.room) {
    // Cache values that are used repeatedly
    const freeCapacity = this.store.getFreeCapacity();
    const myCreeps = room.myCreeps;
    let potentialEnergy = [];

    const myCreepsFilter = (destinationId) => myCreeps.filter(c => c.memory.energyDestination === destinationId && c.id !== this.id).length;

    // Simplified check for allied rooms
    const isAlliedRoom = INTEL[room.name] && INTEL[room.name].owner && INTEL[room.name].owner !== MY_USERNAME;

    if (isAlliedRoom) {
        // Check for dropped energy first as it's often the quickest pick-up
        potentialEnergy = potentialEnergy.concat(room.droppedEnergy.filter(r => r.amount >= (myCreepsFilter(r.id) + 1) * (freeCapacity * 0.5)));

        // Then check storage and terminal if accessible
        if (room.storage && !room.storage.pos.checkForRampart(true) && room.storage.store[RESOURCE_ENERGY]) {
            potentialEnergy.push(room.storage);
        }
        if (room.terminal && !room.terminal.pos.checkForRampart(true) && room.terminal.store[RESOURCE_ENERGY] > TERMINAL_ENERGY_BUFFER) {
            potentialEnergy.push(room.terminal);
        }
        if (potentialEnergy.length) {
            const closest = this.pos.findClosestByRange(potentialEnergy);
            if (closest && closest.id) {
                this.memory.energyDestination = closest.id;
                return true;
            }
        } else {
            return false;
        }
    } else {
        // Handle remote haulers pre-storage
        if (!room.storage && room.controller && room.controller.owner && !['hauler', 'shuttle', 'remoteHauler'].includes(this.memory.role)) {
            potentialEnergy = potentialEnergy.concat(myCreeps.find(c => c.memory.role === 'remoteHauler' && c.store[RESOURCE_ENERGY] && !c.memory.storageDestination && c.pos.getRangeTo(c.room.controller) <= 3));
        }

        // Haulers prioritze the hub link
        if (this.memory.role === 'hauler') {
            const hubLink = Game.getObjectById(room.memory.hubLink);
            if (hubLink && hubLink.store[RESOURCE_ENERGY]) {
                this.memory.energyDestination = hubLink.id;
                return true;
            }
        }

        // Check for tombstones, ruins, factory, links, and storage in order of priority
        potentialEnergy = potentialEnergy.concat(room.tombstones.filter(r => r.store[RESOURCE_ENERGY]));

        // Ruins
        potentialEnergy = potentialEnergy.concat(room.ruins.filter(r => r.store[RESOURCE_ENERGY]));

        if (room.factory && (!room.factory.memory.producing || room.factory.memory.producing === RESOURCE_ENERGY) && room.factory.store[RESOURCE_ENERGY]) {
            potentialEnergy.push(room.factory);
        }

        // Check terminal and storage if not a shuttle
        if (this.memory.role !== 'shuttle') {
            const hubLink = Game.getObjectById(room.memory.hubLink);
            if (hubLink && hubLink.store[RESOURCE_ENERGY]) {
                potentialEnergy.push(hubLink);
            }
            // Storage and terminal, take from whichever has more energy
            if (room.storage && room.storage.store[RESOURCE_ENERGY] > (room.terminal ? room.terminal.store[RESOURCE_ENERGY] : 0)) {
                potentialEnergy.push(room.storage);
            } else if (room.terminal && room.terminal.store[RESOURCE_ENERGY] > TERMINAL_ENERGY_BUFFER) {
                potentialEnergy.push(room.terminal);
            }
        }

        // Dropped Energy
        const filterPenalty = this.memory.role === 'drone' ? 2 : 1;
        potentialEnergy = potentialEnergy.concat(room.droppedEnergy.filter(r => r.amount >= (myCreepsFilter(r.id) + filterPenalty) * (freeCapacity * 0.5)));

        // Container handling for specific roles or in rooms without storage
        if (['shuttle', 'remoteHauler'].includes(this.memory.role) || !room.controller || !room.controller.owner || !room.storage) {
            potentialEnergy = potentialEnergy.concat(room.structures.filter(s => s.structureType === STRUCTURE_CONTAINER &&
                s.id !== room.memory.controllerContainer && s.store[RESOURCE_ENERGY]
                && (!myCreepsFilter(s.id) || s.store[RESOURCE_ENERGY] > (myCreepsFilter(s.id) + 1) * (freeCapacity * 0.5))));
        }

        // Find closest energy source
        if (potentialEnergy.length) {
            const closest = this.pos.findClosestByRange(potentialEnergy);
            if (closest && closest.id) {
                this.memory.energyDestination = closest.id;
                return true;
            }
        }
    }

    return false;
};

/**
 * Handle energy delivery
 * @returns {boolean}
 */
Creep.prototype.haulerDelivery = function () {
    // Clear destination if invalid or full
    if (this.memory.storageDestination) {
        let storageItem = Game.getObjectById(this.memory.storageDestination);
        if (!storageItem || storageItem.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
            delete this.memory.storageDestination;
            delete this.memory._shibMove;
            return false;
        }

        // Transfer all resources to the destination
        for (let resourceType in this.store) {
            let result = this.transfer(storageItem, resourceType);
            if (result === OK) {
                delete this.memory.storageDestination;
                delete this.memory._shibMove;
                return true;
            } else if (result === ERR_NOT_IN_RANGE) {
                this.shibMove(storageItem);
                return true;
            }
        }
    }

    // Check for minerals or non-energy resources
    if (Object.keys(this.store).some(resource => resource !== RESOURCE_ENERGY)) {
        let target = this.room.terminal || this.room.storage;
        if (target) {
            this.memory.storageDestination = target.id;
            return true;
        }
    }

    // Prioritize structures by urgency:
    let targets = [];

    // Towers if below emergency threshold
    if (this.room.controller && this.room.controller.level >= 3) {
        let threatLevel = this.room.memory.threatLevel || 0;
        let energyThreshold = threatLevel ? TOWER_CAPACITY : TOWER_CAPACITY * ((this.room.energyAvailable / this.room.energyCapacityAvailable) * 0.5);
        targets = targets.concat(this.room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] < energyThreshold
        }));
        if (targets.length) {
            this.memory.storageDestination = this.pos.findClosestByRange(targets).id;
            return true;
        } else {
            targets = targets.concat(this.room.find(FIND_MY_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] < TOWER_CAPACITY
            }));
        }
    }

    // Spawns and Extensions
    targets = targets.concat(this.room.find(FIND_MY_STRUCTURES, {
        filter: s => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    }));

    // Labs
    targets = targets.concat(this.room.find(FIND_MY_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_LAB && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    }));

    // Controller Container if below threshold and hub link conditions met
    if (!this.room.memory.controllerLink && this.room.energyState && this.room.energyAvailable === this.room.energyCapacityAvailable) {
        let controllerContainer = Game.getObjectById(this.room.memory.controllerContainer);
        if (controllerContainer && controllerContainer.store.getUsedCapacity() < CONTAINER_CAPACITY * 0.7) {
            let hubLink = Game.getObjectById(this.room.memory.hubLink);
            if (!hubLink || hubLink.store.getFreeCapacity(RESOURCE_ENERGY) > LINK_CAPACITY * 0.5) {
                targets.push(controllerContainer);
            }
        }
    }

    // Nuker
    const nuker = this.room.impassibleStructures.find((s) => s.structureType === STRUCTURE_NUKER && s.store.getFreeCapacity(RESOURCE_ENERGY));
    if (!targets.length && nuker && this.room.energyState) {
        targets.push(nuker);
    }

    // Terminal
    const terminalAmount = !!this.room.energyState ? TERMINAL_ENERGY_BUFFER * 10 : TERMINAL_ENERGY_BUFFER;
    if (!targets.length && this.room.terminal && this.room.storage.store.getUsedCapacity(RESOURCE_ENERGY) < terminalAmount) {
        targets.push(this.room.terminal);
    }

    // Storage
    if (!targets.length && this.room.storage && this.room.storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        // Check if we pulled from this and idle for a bit if so
        if (this.memory.lastWithdraw === this.room.storage.id && !this.memory.storageCooldown) {
            this.memory.storageCooldown = true;
            return false;
        } else {
            targets.push(this.room.storage);
        }
    }

    // Find closest target
    let target = this.pos.findClosestByRange(targets);
    if (target) {
        this.memory.storageCooldown = undefined;
        this.memory.storageDestination = target.id;
        return true;
    }

    return false;
};

/**
 * Find construction/repair work
 * @returns {boolean}
 */
Creep.prototype.constructionWork = function () {
    // Find structures that need repair and are not being worked on by another creep
    let structures = _.filter(this.room.structures, (s) => s.hits < s.hitsMax &&
        !_.find(this.room.myCreeps, (c) => c.memory.constructionSite === s.id) &&
        (INTEL[this.room.name].owner === MY_USERNAME || [STRUCTURE_ROAD, STRUCTURE_CONTAINER].includes(s.structureType)));
    let mySites = _.filter(this.room.constructionSites, (s) => !s.owner || _.includes(FRIENDLIES, s.owner.username));

    // Priority 1: Repair/Build Tower
    let site = _.find(mySites, (s) => s.structureType === STRUCTURE_TOWER);
    if (site) {
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        this.memory.sitePos = JSON.stringify(site.pos);
        return true;
    }

    // Priority 2: Repair Rampart below 5000 hits
    site = _.find(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 5000);
    if (site) {
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        this.memory.targetHits = 12500;
        this.memory.sitePos = JSON.stringify(site.pos);
        return true;
    }

    // Priority 3: Repair hostile barrier (if any)
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

    // Priority 4: Build or repair Spawn, Extensions, Links, Terminals, Storage, Containers
    const buildableStructures = [
        STRUCTURE_SPAWN,
        STRUCTURE_EXTENSION,
        STRUCTURE_LINK,
        STRUCTURE_TERMINAL,
        STRUCTURE_STORAGE
    ];

    for (let structureType of buildableStructures) {
        site = _.find(mySites, (s) => s.structureType === structureType);
        if (site) {
            this.memory.constructionSite = site.id;
            this.memory.task = 'build';
            this.memory.sitePos = JSON.stringify(site.pos);
            return true;
        }
    }

    // Priority 5: Repair Containers below 50% hits
    site = _.find(structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.hits < s.hitsMax * 0.5);
    if (site) {
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        this.memory.targetHits = site.hitsMax * 0.65;
        this.memory.sitePos = JSON.stringify(site.pos);
        return true;
    }

    // Priority 6: Build Containers
    site = _.find(mySites, (s) => s.structureType === STRUCTURE_CONTAINER);
    if (site) {
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        this.memory.sitePos = JSON.stringify(site.pos);
        return true;
    }

    // Priority 7: Repair Roads below 50% hits
    site = _.find(structures, (s) => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * 0.5);
    if (site) {
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        this.memory.targetHits = site.hitsMax * 0.65;
        this.memory.sitePos = JSON.stringify(site.pos);
        return true;
    }

    // Priority 8: Build Ramparts/Walls
    site = _.filter(mySites, (s) => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL);
    if (site.length) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        this.memory.sitePos = JSON.stringify(site.pos);
        return true;
    }

    // Priority 9: Build any other structures if the room has energy
    site = _.find(mySites, (s) => s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART && (!s.room.storage || (s.room.energy * 0.9 > s.progressTotal - s.progress)));
    if (site) {
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        this.memory.sitePos = JSON.stringify(site.pos);
        return true;
    }

    // Priority 10: Repair other structures
    site = _.find(structures, (s) => s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_RAMPART && s.hits < s.hitsMax);
    if (site) {
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        this.memory.targetHits = site.hitsMax;
        this.memory.sitePos = JSON.stringify(site.pos);
        return true;
    }

    // No construction/repair work found
    this.memory.constructionSite = undefined;
    this.memory.task = undefined;
    this.memory.sitePos = undefined;
    this.memory.targetHits = undefined;
    return false;
};

/**
 * Handle construction/repair work
 * @returns {boolean}
 */
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

    // Initialize task if not set
    if (!this.memory.task) this.memory.task = 'build';

    if (this.memory.task === 'repair') {
        // If the construction is repaired or up to the target hits, stop the task
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
                this.memory.constructionSite = undefined;
                this.memory.task = undefined;
                break;
            case ERR_INVALID_TARGET:
                if (construction instanceof ConstructionSite) construction.remove();
                this.memory.constructionSite = undefined;
                this.memory.task = undefined;
                break;
            case ERR_NOT_ENOUGH_ENERGY:
                this.memory.other.stationary = undefined;
                this.memory.working = undefined;
                return true;
        }
    } else { // Building task
        this.say('Build!', true);
        construction.say(construction.progress + '/' + construction.progressTotal);
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
                this.memory.constructionSite = undefined;
                this.memory.task = undefined;
                break;
            case ERR_INVALID_TARGET:
                if (construction.pos.checkForCreep()) {
                    let blockingCreep = construction.pos.checkForCreep();
                    blockingCreep.moveRandom();
                }
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

/**
 * Go to the hub
 * @param destination
 * @param idleTime
 * @returns {boolean}
 */
Creep.prototype.goToHub = function (destination = this.memory.colony, idleTime = 10) {
    let hub = new RoomPosition(25, 25, destination);
    if (this.pos.getRangeTo(hub) <= 15) {
        this.idleFor(idleTime);
        return false;
    }
    this.shibMove(hub, {range: 10})
    return true;
};

/**
 * Handle towing
 * @returns {undefined|boolean}
 */
Creep.prototype.towTruck = function () {
    // If no assigned trailer, return
    if (!this.memory.trailer) return false;
    const trailer = Game.getObjectById(this.memory.trailer);

    // Clear broken trailers
    if (!trailer) {
        this.memory.towStart = undefined;
        return this.memory.trailer = undefined;
    }

    // Handle trailer in another room
    if (trailer.pos.roomName !== this.pos.roomName) {
        this.say('Lost Trailer!', true);
        this.memory.towStart = undefined;
        resetTowingState(trailer);
        return this.memory.trailer = undefined;
    }

    // Return early if the creep is carrying anything
    if (_.sum(this.store)) return false;

    // Set tow start
    if (!this.memory.towStart) this.memory.towStart = Game.time;

    // Handle fatigue
    if (this.fatigue) return true;

    // Handle trailer with no tow destination
    if (!trailer.memory.towDestination) {
        this.memory.trailer = undefined;
        return false;
    }

    let towDestination = getTowDestination(trailer);
    if (!towDestination) {
        this.memory.towStart = undefined;
        resetTowingState(trailer);
        return this.memory.trailer = undefined;
    }

    this.say('Towing!', true);
    // Handle occupied destination
    if (towDestination && trailer.memory.towOptions && trailer.memory.towOptions.range === 0 && this.pos.isNearTo(towDestination) && towDestination.checkForCreep() && towDestination.checkForCreep().id !== this.id) {
        trailer.memory.towOptions.range = 1;
    }

    // Handle towing timeout or reaching destination
    if (shouldTimeout(this.memory.towStart, trailer, towDestination)) {
        resetTowingState(trailer);
        this.memory.towStart = undefined;
        this.memory.trailer = undefined;
        return false;
    }

    // Move trailer
    if (this.pull(trailer) === ERR_NOT_IN_RANGE) {
        adjustMovement(this, trailer);
        this.shibMove(trailer, {range: 1});
        return true;
    } else {
        trailer.move(this);
        moveToTowDestination(this, trailer, towDestination);
    }

    return true;
};

function getTowDestination(trailer) {
    let towDestination;
    if (trailer.memory.towDestination && trailer.memory.towDestination.x) {
        towDestination = new RoomPosition(trailer.memory.towDestination.x, trailer.memory.towDestination.y, trailer.memory.towDestination.roomName);
    } else if (Game.getObjectById(trailer.memory.towDestination)) {
        towDestination = Game.getObjectById(trailer.memory.towDestination).pos;
    }
    return towDestination;
}

function shouldTimeout(towStart, trailer, towDestination) {
    return towStart + 125 < Game.time || !towDestination || !trailer.memory.towOptions || trailer.memory.towOptions.range >= trailer.pos.getRangeTo(towDestination);
}

function resetTowingState(trailer) {
    trailer.memory._shibMove = undefined;
    trailer.memory.towCreep = undefined;
    trailer.memory.towDestination = undefined;
    trailer.memory.towToObject = undefined;
    trailer.memory.towOptions = undefined;
}

function adjustMovement(creep, trailer) {
    if (creep.memory.lastRangeToTrailer && creep.memory.lastRangeToTrailer < 5 && creep.memory.lastRangeToTrailer < trailer.pos.getRangeTo(creep)) {
        creep.memory._shibMove = undefined;
    }
    creep.memory.lastRangeToTrailer = trailer.pos.getRangeTo(creep);
}

function moveToTowDestination(creep, trailer, towDestination) {
    if (!towDestination || creep.pos.getRangeTo(towDestination) === trailer.memory.towOptions.range) {
        creep.move(creep.pos.getDirectionTo(trailer));
    } else {
        trailer.memory._shibMove = undefined;
        if (!trailer.pos.isNearTo(creep)) {
            creep.memory._shibMove = undefined;
        }
        creep.shibMove(towDestination, trailer.memory.towOptions);
    }
}

/**
 * Handle border movement
 * @returns {boolean}
 */
Creep.prototype.borderCheck = function () {
    const {x, y} = this.pos;
    // If the creep is at the border (x = 0, y = 0, x = 49, or y = 49)
    if (x === 0 || y === 0 || x === 49 || y === 49) {
        // Still do combat
        this.attackInRange();
        this.healInRange(true);
        // Continue following path if available
        if (this.memory._shibMove && this.memory._shibMove.path) {
            const pathInfo = this.memory._shibMove;
            const nextDirection = pathInfo.path[0];
            const nextPos = this.pos.positionAtDirection(nextDirection);
            if (nextPos && !nextPos.checkForImpassible()) {
                pathInfo.newPos = nextPos;
                if (this.move(nextDirection) === OK) {
                    pathInfo.path = pathInfo.path.slice(1);
                    pathInfo.pathPosTime = 0;
                    pathInfo.lastMoveTick = Game.time;
                    this.memory._shibMove = pathInfo;
                    return true;
                }
            } else {
                this.memory._shibMove = undefined;
            }
        }
        // Handle corners directly
        if (x === 0 && y === 0) {
            this.move(BOTTOM_RIGHT);
        } else if (x === 0 && y === 49) {
            this.move(TOP_RIGHT);
        } else if (x === 49 && y === 0) {
            this.move(BOTTOM_LEFT);
        } else if (x === 49 && y === 49) {
            this.move(TOP_LEFT);
        } else {
            // Try to move to a road if available
            const road = findRoadNearCreep(this);
            if (road) {
                this.move(this.pos.getDirectionTo(road));
            } else {
                // Movement options based on border position
                let options = [];

                if (x === 49) {
                    options = [LEFT, TOP_LEFT, BOTTOM_LEFT];
                } else if (x === 0) {
                    options = [RIGHT, TOP_RIGHT, BOTTOM_RIGHT];
                } else if (y === 0) {
                    options = [BOTTOM, BOTTOM_LEFT, BOTTOM_RIGHT];
                } else if (y === 49) {
                    options = [TOP, TOP_LEFT, TOP_RIGHT];
                }
                // Use random movement from the options
                this.move(_.sample(options));
            }
        }
        this.memory.moveBlocked = Game.time;
    }
};

// Helper function to find a road near the creep
function findRoadNearCreep(creep) {
    return _.find(creep.room.structures, (s) => s.structureType === STRUCTURE_ROAD && s.pos.isNearTo(creep) && !s.pos.checkForImpassible());
}


/**
 * Handle creep boosting
 * @param bodyPart
 * @param tier
 * @returns {boolean}
 */
Creep.prototype.tryToBoost = function (bodyPart = [], tier = undefined) {
    // If they age out or are boosted, don't try again
    if (this.memory.boostAttempt) {
        if (!this.memory.boostAttempt && this.memory.boosts) {
            let lab = Game.getObjectById(this.memory.boosts.boostLab);
            if (lab) lab.memory = undefined;
            this.memory.boosts = undefined;
        }
        this.memory.boostAttempt = true;
        return false;
    }
    if (!this.memory.boosts) this.memory.boosts = {};
    // Figure out what boosts to get, try to use the most powerful
    if (!this.memory.boosts.requestedBoosts) {
        let available = {};
        let boostNeeded, handledAlready;
        if (this.memory.neededBoosts) {
            if (this.room.store(this.memory.neededBoosts.boost) >= this.getActiveBodyparts(this.memory.neededBoosts.boostPart) * 30) {
                available[this.memory.neededBoosts.boost] = {
                    'boost': this.memory.neededBoosts.boost,
                    'amount': this.getActiveBodyparts(this.memory.neededBoosts.boostPart) * 30
                };
                handledAlready = this.memory.neededBoosts.boostPart;
            }
        }
        for (let boostType of bodyPart) {
            if (handledAlready === boostType) continue;
            switch (boostType) {
                case 'attack':
                    boostNeeded = this.getActiveBodyparts(ATTACK) * 30;
                    break;
                case 'ranged_attack':
                    boostNeeded = this.getActiveBodyparts(RANGED_ATTACK) * 30;
                    break;
                case 'tough':
                    boostNeeded = this.getActiveBodyparts(TOUGH) * 30;
                    break;
                case 'heal':
                    boostNeeded = this.getActiveBodyparts(HEAL) * 30;
                    break;
                case 'carry':
                    boostNeeded = this.getActiveBodyparts(CARRY) * 30;
                    break;
                case 'move':
                    boostNeeded = this.getActiveBodyparts(MOVE) * 30;
                    break;
                case 'work':
                    if (this.memory.role === 'drone') boostType = 'build';
                    if (this.memory.role === 'cleaner' || this.memory.role === 'siegeDuo') boostType = 'dismantle';
                    boostNeeded = this.getActiveBodyparts(WORK) * 30;
                    break;
            }
            try {
                for (let boost of BOOST_USE[boostType]) {
                    if (boostNeeded && this.room.store(boost) >= boostNeeded) {
                        available[boost] = {
                            'boost': boost,
                            'amount': boostNeeded,
                            'type': boostType
                        };
                        break;
                    }
                }
            } catch (e) {
                this.memory.boostAttempt = true;
                log.e("Boost failure for " + this.name);
                log.e("Boost Failed: " + e);
                return false;
            }
        }
        this.memory.boosts.requestedBoosts = available;
    } else if (_.size(this.memory.boosts.requestedBoosts)) {
        // Handle if this creep is in a squad and needs to renew first
        if (!this.memory.boosts.boostLab && !this.memory.hasBoosted && this.handleRenewing(CREEP_LIFE_TIME * 0.95)) return this.handleRenewing(CREEP_LIFE_TIME * 0.95);
        if (this.memory.misc && this.memory.misc.waitFor > 1) {
            let leader = this.memory.leader ? this : Game.getObjectById(this.memory.groupLeader);
            const squadSize = leader ? leader.memory.squadMembers.length + 1 : 1;
            if (squadSize < this.memory.misc.waitFor) return this.idleFor(5);
        }
        for (let requestedBoost of Object.keys(this.memory.boosts.requestedBoosts)) {
            let amountNeeded = this.memory.boosts.requestedBoosts[requestedBoost]['amount'];
            let boostNeeded = this.memory.boosts.requestedBoosts[requestedBoost]['boost'];
            let boostType = this.memory.boosts.requestedBoosts[requestedBoost]['type'];
            // 0 check
            if (!amountNeeded) return false;
            // Check if boost is low, if so restart
            if (this.room.store(boostNeeded) < amountNeeded) {
                let lab = Game.getObjectById(this.memory.boosts.boostLab);
                if (lab) lab.memory = undefined;
                this.memory.boosts = undefined;
                return true;
            }
            // Find a lab to boost the creep if none exist, idle.
            if (!this.memory.boosts.boostLab || !Game.getObjectById(this.memory.boosts.boostLab).memory.neededBoost) {
                let lab = _.find(this.room.impassibleStructures, (s) => s.structureType === STRUCTURE_LAB && s.active() && s.store[RESOURCE_ENERGY] > 0 &&
                    (s.mineralType === boostNeeded || !s.memory.itemNeeded) && (!s.memory.neededBoost || s.memory.neededBoost === boostNeeded));
                if (lab) {
                    lab.memory.paused = true;
                    this.memory.boosts.boostLab = lab.id;
                    lab.memory.neededBoost = boostNeeded;
                    if (!lab.memory.amount) lab.memory.amount = amountNeeded; else lab.memory.amount += amountNeeded;
                    lab.memory.requestor = this.id;
                    lab.memory.requested = Game.time;
                } else {
                    if (Game.getObjectById(this.memory.boosts.boostLab)) {
                        Game.getObjectById(this.memory.boosts.boostLab).memory = undefined;
                    }
                    if (!this.ticksToLive < CREEP_LIFE_TIME * 0.5) {
                        this.memory.boosts = undefined;
                        return this.memory.boostAttempt = true;
                    } else return true;
                }
            }
            let lab = Game.getObjectById(this.memory.boosts.boostLab);
            if (lab) {
                this.say(1)
                // Verify the body parts are boosted
                const targetParts = this.body.find((p) => p.type === boostType && !p.boost);
                if (!targetParts && this.memory.hasBoosted && this.memory.hasBoosted.includes(lab.memory.neededBoost)) {
                    this.memory.boosts.requestedBoosts = _.filter(this.memory.boosts.requestedBoosts, (b) => b['boost'] !== lab.memory.neededBoost);
                    lab.memory.amount -= amountNeeded;
                    // Check if other creeps have this lab queued up for this boost
                    const otherCreeps = this.room.creeps.find(c => c.id !== this.id && c.memory.boosts && c.memory.boosts.boostLab === lab.id && c.memory.boosts.requestedBoosts[lab.memory.neededBoost]);
                    if (!otherCreeps) lab.memory.neededBoost = undefined;
                    this.say(ICONS.greenCheck);
                    return true;
                } else {
                    this.say(12)
                    lab.say(lab.memory.neededBoost);
                    if (lab.mineralType === lab.memory.neededBoost && lab.store[RESOURCE_ENERGY] && lab.mineralAmount >= lab.memory.amount) {
                        switch (lab.boostCreep(this)) {
                            case OK:
                                if (!this.memory.hasBoosted) this.memory.hasBoosted = [lab.memory.neededBoost]; else this.memory.hasBoosted.push(lab.memory.neededBoost);
                                this.say(ICONS.testFinished);
                                return true;
                            case ERR_NOT_ENOUGH_RESOURCES:
                            case ERR_NOT_IN_RANGE:
                                this.say(ICONS.boost);
                                this.shibMove(lab, {forceSolo: true});
                                return true;
                            default:
                                this.say('Error');
                                return true;
                        }
                    } else {
                        if (this.room.store(boostNeeded) < lab.memory.amount) {
                            let lab = Game.getObjectById(this.memory.boosts.boostLab);
                            if (lab) lab.memory = undefined;
                            this.memory.boosts = undefined;
                            return true;
                        }
                        if (!this.memory.hasBoosted && this.handleRenewing(CREEP_LIFE_TIME * 0.95)) return this.handleRenewing(CREEP_LIFE_TIME * 0.95);
                    }
                }
            }
        }
    } else {
        if (Game.getObjectById(this.memory.boosts.boostLab)) {
            Game.getObjectById(this.memory.boosts.boostLab).memory = undefined;
        }
        this.memory.boosts = undefined;
        if (!this.memory.neededBoosts || this.memory.hasBoosted) return this.memory.boostAttempt = true; else return true;
    }
    return true;
};

/**
 * Handle creep recycling
 * @returns {*|void}
 */
Creep.prototype.recycleCreep = function () {
    // If no moves, suicide
    if (!this.hasActiveBodyparts(MOVE) && !MY_ROOMS.includes(this.room.name)) return this.suicide();
    this.memory.recycling = true;
    let spawn = this.pos.findClosestByRange(FIND_MY_SPAWNS);
    if (!spawn) {
        if (this.room.name !== this.memory.colony) {
            this.shibMove(new RoomPosition(25, 25, this.memory.colony), {range: 22})
            return true;
        } else {
            console.log(this.name)
            return this.suicide();
        }
    }
    if (this.store.getUsedCapacity()) {
        let deliver = this.room.terminal || this.room.storage;
        if (deliver) {
            for (let resourceType in this.store) {
                switch (this.transfer(deliver, resourceType)) {
                    case ERR_NOT_IN_RANGE:
                        this.shibMove(deliver);
                }
            }
            return;
        }
    }
    // Clear role to queue replacement if needed
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

/**
 * Handle creep renewing
 * @returns {boolean}
 */
Creep.prototype.handleRenewing = function (targetTicks) {
    if (this.ticksToLive > targetTicks || this.memory.hasBoosted) {
        this.memory.needsRenewal = undefined;
        return false;
    }
    this.memory.needsRenewal = true;
    let spawn = this.room.impassibleStructures.find((s) => s.my && s.structureType === STRUCTURE_SPAWN && !s.spawning);
    if (!spawn) {
        if (this.room.name !== this.memory.colony) {
            this.shibMove(new RoomPosition(25, 25, this.memory.colony), {range: 22})
        } else {
            this.idleFor(5);
        }
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

/**
 * Handle fleeing a nuke
 * @returns {boolean}
 */
Creep.prototype.fleeNukeRoom = function () {
    this.say('NUKE!', true);
    if (this.memory.fleeNukeTime <= Game.time) {
        this.memory.fleeNukeTime = undefined;
        this.memory.fleeNukeRoom = undefined;
        return false;
    }
    if (this.memory.fleeTo && this.room.name !== this.memory.fleeTo) this.shibMove(new RoomPosition(25, 25, this.memory.fleeTo), {range: 23}); else if (this.room.name !== this.memory.fleeTo) this.idleFor(this.memory.fleeNukeTime - Game.time);
    if (!this.memory.fleeTo) this.memory.fleeTo = _.sample(_.filter(MY_ROOMS, (r) => !Game.rooms[r].nukes.length)).name;
};

/**
 * Move in a random direction while avoiding obstacles
 */
Creep.prototype.moveRandom = function () {
    // Predefined directions array (avoid creating this on each call)
    const directions = [TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT];

    // Try each direction in random order using a random start index
    const startIndex = Math.floor(Math.random() * 8);

    for (let i = 0; i < 8; i++) {
        let direction = directions[(startIndex + i) % 8];
        let pos = this.pos.getAdjacentPosition(direction);

        // Only move if valid position and no obstacles (no need to check exit, wall, structure, or creep each time)
        if (pos && !pos.checkForObstacleStructure() && !pos.checkForWall()) {
            this.move(direction);
            return; // Move and exit the function immediately
        }
    }
};


