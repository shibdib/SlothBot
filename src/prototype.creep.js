/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */
'use strict';

Object.defineProperty(Creep.prototype, "idle", {
    configurable: true,
    get: function () {
        if (this.memory.idle === undefined) return 0;
        if (this.memory.idle <= Game.time || (this.ticksToLive >= 1485 || this.getActiveBodyparts(CLAIM))) {
            delete this.idle;
            delete this.memory.idle;
            return 0;
        }
        // Handle flee if hostile is gone
        if (this.memory.runCooldown && this.memory.ranFrom && !Memory.roomCache[this.memory.ranFrom].numberOfHostiles) {
            delete this.idle;
            delete this.memory.idle;
            delete this.memory.ranFrom;
            delete this.memory.runCooldown;
            return 0;
        }
        this.say(_.sample([ICONS.wait23, ICONS.wait21, ICONS.wait19, ICONS.wait17, ICONS.wait13, ICONS.wait11, ICONS.wait7, ICONS.wait10, ICONS.wait3, ICONS.wait1]), true);
        if ((this.pos.checkForRoad() || this.pos.checkForContainer()) && this.memory.role !== 'stationaryHarvester' && this.memory.role !== 'mineralHarvester' && this.memory.role !== 'remoteHarvester') {
            this.moveRandom();
        } else if (this.pos.getRangeTo(this.pos.findClosestByRange(FIND_MY_SPAWNS)) === 1) {
            this.moveRandom();
        } else if (!this.pos.checkForRampart() && this.pos.getRangeTo(this.pos.findClosestByRange(FIND_EXIT)) <= 1) {
            this.moveRandom();
        }
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

Creep.prototype.idleFor = function (ticks = 0) {
    if (this.hits < this.hitsMax && this.getActiveBodyparts(HEAL)) return this.heal(this);
    if (ticks > 0) {
        this.idle = Game.time + ticks;
    } else {
        delete this.idle;
    }
};

Object.defineProperty(Creep.prototype, 'isFull', {
    get: function () {
        if (!this._isFull) {
            this._isFull = _.sum(this.store) >= this.store.getCapacity() * 0.85 || (_.sum(this.store) && this.ticksToLive < 25);
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
            if (this.getActiveBodyparts(HEAL)) power += this.abilityPower().defense;
            if (this.getActiveBodyparts(ATTACK) || this.getActiveBodyparts(RANGED_ATTACK)) power += this.abilityPower().attack;
            this._combatPower = power;
        }
        return this._combatPower;
    },
    enumerable: false,
    configurable: true
});

Creep.prototype.repairRoad = function () {
    if (!this.getActiveBodyparts(WORK)) return false;
    let road = this.pos.checkForRoad();
    if (road && road.hits < road.hitsMax * 0.6) {
        this.repair(road);
    }
};

Creep.prototype.wrongRoom = function () {
    if (this.memory.overlord && this.pos.roomName !== this.memory.overlord) {
        this.shibMove(new RoomPosition(25, 25, this.memory.overlord), {range: 23});
        return true;
    }
};

Creep.prototype.findSource = function (ignoreOthers = false) {
    let source = shuffle(this.room.sources);
    if (this.memory.role === 'stationaryHarvester') source = _.filter(this.room.sources, (s) => _.filter(Game.creeps, (c) => c.id !== this.id && c.memory.role === 'stationaryHarvester' && c.memory.source === s.id).length === 0);
    if (this.memory.role === 'remoteHarvester') source = _.filter(this.room.sources, (s) => _.filter(Game.creeps, (c) => c.id !== this.id && c.memory.role === 'remoteHarvester' && c.memory.source === s.id).length === 0);
    if (ignoreOthers) source = this.room.sources;
    if (source.length > 0) {
        if (this.pos.findClosestByPath(source)) {
            this.memory.source = this.pos.findClosestByRange(source).id;
            return this.pos.findClosestByRange(source).id;
        }
    }
    return false;
};

Creep.prototype.findMineral = function () {
    const mineral = this.room.mineral;
    if (mineral) {
        this.memory.source = mineral.id;
        return mineral;
    }
};

Creep.prototype.skSafety = function () {
    if (Memory.roomCache[this.room.name] && !Memory.roomCache[this.room.name].sk) return false;
    // handle safe SK movement
    let range = 4;
    if (this.memory.destination && this.memory.destination === this.room.name) range = 8;
    let lair = this.pos.findInRange(this.room.structures, range, {filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR})[0];
    if (lair) {
        let SK = this.pos.findInRange(this.room.creeps, range, {filter: (c) => c.owner.username === 'Source Keeper'})[0];
        if (SK) {
            this.shibKite(6);
            return true;
        } else if (lair.ticksToSpawn <= 20) {
            this.shibMove(this.pos.findClosestByRange(Game.map.findExit(this.room.name, this.memory.overlord)), {range: 2});
            return true;
        }
        // Handle invader cores in sk
        if (_.filter(this.room.structures, (s) => s.structureType === STRUCTURE_INVADER_CORE)[0]) {
            this.room.cacheRoomIntel(true);
            return this.memory.recycle = true;
        }
    }
}

Creep.prototype.withdrawResource = function (destination = undefined, resourceType = RESOURCE_ENERGY, amount = undefined) {
    if (destination) this.memory.energyDestination = destination.id;
    if (amount && amount < 0) return this.memory.hauling = true;
    if (this.memory.energyDestination) {
        let energyItem = Game.getObjectById(this.memory.energyDestination);
        if (!energyItem) return this.memory.energyDestination = undefined;
        if (energyItem.pos.roomName !== this.room.name) return this.shibMove(energyItem);
        if (_.sum(energyItem.store)) {
            switch (this.withdraw(energyItem, resourceType, amount)) {
                case OK:
                    this.memory.withdrawID = energyItem.id;
                    this.memory.energyDestination = undefined;
                    this.memory._shibMove = undefined;
                    return true;
                case ERR_INVALID_TARGET:
                    switch (this.pickup(energyItem)) {
                        case OK:
                            this.memory.withdrawID = energyItem.id;
                            this.memory.energyDestination = undefined;
                            this.memory._shibMove = undefined;
                            break;
                        case ERR_NOT_IN_RANGE:
                            this.shibMove(energyItem);
                            break;
                        case ERR_FULL:
                            this.memory.energyDestination = undefined;
                            this.memory._shibMove = undefined;
                            break;
                        case ERR_INVALID_TARGET:
                            switch (energyItem.transfer(this, resourceType, amount)) {
                                case OK:
                                    this.memory.withdrawID = energyItem.id;
                                    this.memory.energyDestination = undefined;
                                    this.memory._shibMove = undefined;
                                    return true;
                                case ERR_NOT_IN_RANGE:
                                    this.shibMove(energyItem);
                                    break;
                                case ERR_FULL:
                                    this.memory.energyDestination = undefined;
                                    this.memory._shibMove = undefined;
                                    break;
                            }
                            break;
                    }
                    break;
                case ERR_NOT_IN_RANGE:
                    this.shibMove(energyItem);
                    break;
                case ERR_NOT_ENOUGH_RESOURCES:
                    this.memory.energyDestination = undefined;
                    this.memory._shibMove = undefined;
                    break;
                case ERR_FULL:
                    this.memory.energyDestination = undefined;
                    this.memory._shibMove = undefined;
                    break;
                case ERR_INVALID_ARGS:
                    this.memory.energyDestination = undefined;
                    this.memory._shibMove = undefined;
                    break;
            }
        } else if (energyItem.amount) {
            switch (this.pickup(energyItem)) {
                case OK:
                    this.memory.withdrawID = energyItem.id;
                    this.memory.energyDestination = undefined;
                    this.memory._shibMove = undefined;
                    break;
                case ERR_NOT_IN_RANGE:
                    this.shibMove(energyItem);
                    break;
            }
        } else {
            delete this.memory.energyDestination;
        }
    }
};

Creep.prototype.locateEnergy = function () {
    // Fuel Trucks
    let fuelTrucks = _.filter(this.room.creeps, (c) => c.my && c.memory.role === 'fuelTruck' && c.memory.destination === c.room.name && c.store[RESOURCE_ENERGY]);
    if (fuelTrucks.length && this.memory.role !== 'fuelTruck') {
        this.memory.energyDestination = fuelTrucks[0].id;
        return true;
    }
    // Take from remote haulers pre storage
    if (!this.room.storage && (this.memory.role === 'drone' || this.memory.role === 'upgrader')) {
        let haulers = _.filter(this.room.creeps, (c) => c.my && c.memory.role === 'remoteHauler' && c.store[RESOURCE_ENERGY] && c.memory.storageDestination === 'con');
        if (haulers.length) {
            this.memory.energyDestination = this.pos.findClosestByRange(haulers).id;
            return true;
        }
    }
    //Dropped
    if (this.room.droppedEnergy.length) {
        let dropped = this.pos.findClosestByRange(this.room.droppedEnergy, {filter: (r) => r.amount >= (this.room.creeps.filter((c) => c.my && c.memory.energyDestination === r.id && c.id !== this.id).length + 1) * this.store.getFreeCapacity()});
        if (dropped) {
            this.memory.energyDestination = dropped.id;
            this.memory.findEnergyCountdown = undefined;
            return true;
        }
    }
    // Tombstone
    if (this.room.tombstones.length) {
        let tombstone = this.pos.findClosestByRange(this.room.tombstones, {filter: (r) => r.pos.getRangeTo(this) <= 10 && r.store[RESOURCE_ENERGY]});
        if (tombstone) {
            this.memory.energyDestination = tombstone.id;
            return true;
        }
    }
    // Ruin
    if (this.room.ruins.length) {
        let ruin = this.pos.findClosestByRange(this.room.ruins, {filter: (r) => r.store[RESOURCE_ENERGY]});
        if (ruin) {
            this.memory.energyDestination = ruin.id;
            return true;
        }
    }
    // Extra Full Container
    let fullContainer = this.pos.findClosestByRange(this.room.structures, {
        filter: (s) => s.structureType === STRUCTURE_CONTAINER && this.room.memory.controllerContainer !== s.id && s.store[RESOURCE_ENERGY] > CONTAINER_CAPACITY * 0.75 &&
            !this.room.creeps.filter((c) => c.my && c.memory.energyDestination === s.id && c.id !== this.id).length
    });
    if (fullContainer) {
        this.memory.energyDestination = fullContainer.id;
        this.memory.findEnergyCountdown = undefined;
        return true;
    }
    // Links
    let hubLink = Game.getObjectById(this.room.memory.hubLink);
    if (hubLink && hubLink.energy && (hubLink.energy >= (this.room.creeps.filter((c) => c.my && c.memory.energyDestination === hubLink.id && c.id !== this.id).length + 1) * (this.store.getFreeCapacity() * 0.5))) {
        this.memory.energyDestination = hubLink.id;
        this.memory.findEnergyCountdown = undefined;
        return true;
    }
    // Container
    let container = this.pos.findClosestByRange(this.room.structures, {
        filter: (s) => s.structureType === STRUCTURE_CONTAINER && (this.room.memory.controllerContainer !== s.id || this.memory.findEnergyCountdown >= this.room.controller.level)
            && s.store[RESOURCE_ENERGY] > (this.room.creeps.filter((c) => c.my && c.memory.energyDestination === s.id && c.id !== this.id).length + 1) * (this.store.getFreeCapacity() * 0.5)
    });
    if (container) {
        this.memory.energyDestination = container.id;
        this.memory.findEnergyCountdown = undefined;
        return true;
    }
    // Storage
    if (this.room.storage && this.room.storage.store[RESOURCE_ENERGY]) {
        this.memory.energyDestination = this.room.storage.id;
        return true;
    }
    //Links
    let links = this.pos.findClosestByRange(this.room.structures, {
        filter: (s) => s.structureType === STRUCTURE_LINK && this.room.memory.controllerLink !== s.id
            && s.energy >= (this.room.creeps.filter((c) => c.my && c.memory.energyDestination === s.id && c.id !== this.id).length + 1) * (this.store.getFreeCapacity() * 0.5)
    });
    if (links) {
        this.memory.energyDestination = links.id;
        this.memory.findEnergyCountdown = undefined;
        return true;
    }
    //Take straight from remoteHaulers/fuel truck at low level who have nowhere to drop
    if (this.room.controller && this.room.controller.level < 3) {
        let hauler = this.pos.findClosestByRange(_.filter(this.room.creeps, (c) => c.memory && (c.memory.role === 'remoteHauler' || c.memory.role === 'fuelTruck') && !c.memory.storageDestination && c.memory.idle
            && c.store[RESOURCE_ENERGY] >= (this.room.creeps.filter((c2) => c2.my && c2.memory.energyDestination === c.id && c2.id !== this.id).length + 1) * (this.store.getFreeCapacity() * 0.5)));
        if (hauler) {
            this.memory.energyDestination = hauler.id;
            return true;
        }
    }
    // Terminal
    if (this.room.terminal && this.room.terminal.store[RESOURCE_ENERGY] > TERMINAL_ENERGY_BUFFER && this.memory.role !== 'filler') {
        this.memory.energyDestination = this.room.terminal.id;
        return true;
    }
    if (!this.memory.findEnergyCountdown && this.memory.role === 'hauler') this.memory.findEnergyCountdown = 1; else this.memory.findEnergyCountdown += 1;
    return false;
};

Creep.prototype.opportunisticFill = function () {
    if (!this.store[RESOURCE_ENERGY] || Math.random() < 0.02) return false;
    // Fill nearby energy structures as you pass
    let energyStructures = _.filter(this.pos.findInRangeStructures(this.room.structures, 1, [STRUCTURE_EXTENSION, STRUCTURE_SPAWN]), (s) => s.store.getFreeCapacity(RESOURCE_ENERGY));
    if (energyStructures.length) {
        this.transfer(_.sample(energyStructures), RESOURCE_ENERGY)
        return true;
    } else {
        return false;
    }
}

Creep.prototype.haulerDelivery = function () {
    // If you have a destination, deliver
    if (this.memory.storageDestination) {
        // If carrying minerals deposit in terminal or storage
        if (_.sum(this.store) > this.store[RESOURCE_ENERGY]) {
            if (this.room.terminal) this.memory.storageDestination = this.room.terminal.id; else if (this.room.storage) this.memory.storageDestination = this.room.storage.id;
        }
        let storageItem = Game.getObjectById(this.memory.storageDestination);
        if (!storageItem) return delete this.memory.storageDestination;
        if (!storageItem.store.getFreeCapacity(RESOURCE_ENERGY)) {
            delete this.memory.storageDestination;
            delete this.memory._shibMove;
        } else {
            for (const resourceType in this.store) {
                switch (this.transfer(storageItem, resourceType)) {
                    case OK:
                        delete this.memory.storageDestination;
                        return true;
                    case ERR_NOT_IN_RANGE:
                        if (Math.random() > 0.98) {
                            delete this.memory.storageDestination;
                            delete this.memory._shibMove;
                            break;
                        } else {
                            this.shibMove(storageItem);
                            return true;
                        }
                    case ERR_FULL || ERR_INVALID_TARGET:
                        delete this.memory.storageDestination;
                        delete this.memory._shibMove;
                        break;
                }
            }
        }
    }
    //Tower
    if (Memory.roomCache[this.room.name].threatLevel) {
        let tower = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.energy < s.energyCapacity * 0.85)[0];
        if (tower) {
            this.memory.storageDestination = tower.id;
            return true;
        }
    } else {
        let tower = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.energy < s.energyCapacity * 0.2)[0];
        if (tower) {
            this.memory.storageDestination = tower.id;
            return true;
        }
    }
    // Spawns/Extensions
    let target = _.filter(this.room.structures, (s) => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && (!s.room.memory.sourceExtensions || !_.includes(s.id, s.room.memory.sourceExtensions))
        && s.store.getFreeCapacity(RESOURCE_ENERGY) && _.sum(_.filter(this.room.creeps, (c) => c.my && c.memory.storageDestination === s.id), 'store[RESOURCE_ENERGY]') < s.store.getFreeCapacity(RESOURCE_ENERGY));
    if (target.length) {
        this.memory.storageDestination = this.pos.findClosestByRange(target).id;
        return true;
    }
    let controllerContainer = Game.getObjectById(this.room.memory.controllerContainer);
    if (this.room.controller.level >= 6) {
        //Terminal low
        if (this.room.terminal && this.memory.withdrawID !== this.room.terminal.id && this.room.terminal.store[RESOURCE_ENERGY] < TERMINAL_ENERGY_BUFFER) {
            this.memory.storageDestination = this.room.terminal.id;
            return true;
        }
        //Labs
        let lab = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.energy < s.energyCapacity &&
            _.sum(_.filter(this.room.creeps, (c) => c.my && c.memory.storageDestination === s.id), 'store[RESOURCE_ENERGY]') < s.energyCapacity - s.energy)[0];
        if (lab) {
            this.memory.storageDestination = lab.id;
            return true;
        }
        if (this.room.controller.level >= 8) {
            //Nuke
            let nuke = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_NUKER && s.energy < s.energyCapacity)[0];
            if (nuke && this.room.energy >= ENERGY_AMOUNT * 0.5) {
                this.memory.storageDestination = nuke.id;
                return true;
            }
            //Power Spawn
            let power = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_POWER_SPAWN && s.energy < s.energyCapacity)[0];
            if (power) {
                this.memory.storageDestination = power.id;
                return true;
            }
        }
    }
    //Top off towers
    let tower = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.energy < s.energyCapacity * 0.9)[0];
    if (tower) {
        this.memory.storageDestination = tower.id;
        return true;
    }
    //Controller
    if ((!this.room.storage || this.room.storage.store[RESOURCE_ENERGY]) && controllerContainer && (!controllerContainer.store[RESOURCE_ENERGY] || controllerContainer.store[RESOURCE_ENERGY] < controllerContainer.store.getCapacity() * 0.5)) {
        this.memory.storageDestination = controllerContainer.id;
        return true;
    }
    // Top off container
    if (controllerContainer && controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) > CONTAINER_CAPACITY * 0.5) {
        this.memory.storageDestination = controllerContainer.id;
        return true;
    }
    //Storage
    if (this.room.storage && _.sum(this.room.storage.store) < this.room.storage.store.getCapacity()) {
        this.memory.storageDestination = this.room.storage.id;
        if (this.memory.role === 'hauler') this.memory.cooldown = true;
        return true;
    }
};

Creep.prototype.constructionWork = function () {
    let structures = _.filter(this.room.structures, (s) => s.hits < s.hitsMax && !_.filter(this.room.creeps, (c) => c.my && c.memory.constructionSite === s.id).length);
    let site = _.filter(this.room.constructionSites, (s) => s.structureType === STRUCTURE_TOWER);
    if (site.length > 0) {
        site = _.max(site, 'progress');
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 5000);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        this.memory.targetHits = 12500;
        return true;
    }
    site = _.filter(this.room.constructionSites, (s) => s.structureType === STRUCTURE_SPAWN);
    if (site.length > 0) {
        site = _.max(site, 'progress');
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(this.room.constructionSites, (s) => s.structureType === STRUCTURE_RAMPART || STRUCTURE_WALL);
    if (site.length) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(this.room.constructionSites, (s) => s.structureType === STRUCTURE_EXTENSION);
    if (site.length > 0) {
        site = _.max(site, 'progress');
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';

        return true;
    }
    site = _.filter(this.room.constructionSites, (s) => s.structureType === STRUCTURE_TERMINAL);
    if (site.length > 0) {
        site = _.max(site, 'progress');
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(this.room.constructionSites, (s) => s.structureType === STRUCTURE_STORAGE);
    if (site.length > 0) {
        site = _.max(site, 'progress');
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(this.room.constructionSites, (s) => s.structureType === STRUCTURE_LINK);
    if (site.length > 0) {
        site = _.max(site, 'progress');
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.hits < s.hitsMax * 0.5);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        this.memory.targetHits = site.hitsMax * 0.65;
        return true;
    }
    site = _.filter(this.room.constructionSites, (s) => s.structureType === STRUCTURE_CONTAINER);
    if (site.length > 0) {
        site = _.max(site, 'progress');
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(this.room.constructionSites, (s) => s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(structures, (s) => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * 0.5);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        this.memory.targetHits = site.hitsMax * 0.65;
        return true;
    }
    site = _.filter(this.room.constructionSites, (s) => s.structureType === STRUCTURE_WALL);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(structures, (s) => s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_RAMPART && s.hits < s.hitsMax);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        return true;
    }
    site = _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 10000);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        this.memory.targetHits = 12500;
        return true;
    }
    this.memory.constructionSite = undefined;
    this.memory.task = undefined;
    return false;
};

Creep.prototype.builderFunction = function () {
    let construction = Game.getObjectById(this.memory.constructionSite);
    if (!construction || (construction.pos.roomName !== this.pos.roomName)) {
        this.memory.constructionSite = undefined;
        this.memory.task = undefined;
        return;
    }
    if (!this.memory.task) this.memory.task = 'build';
    if (this.memory.task === 'repair') {
        if (construction.hits === construction.hitsMax || construction.hits >= this.memory.targetHits) {
            this.memory.constructionSite = undefined;
            this.memory.task = undefined;
            this.memory.targetHits = undefined;
            this.say('Done!', true);
            return;
        }
        this.say('Fix!', true);
        switch (this.repair(construction)) {
            case OK:
                return true;
            case ERR_NOT_IN_RANGE:
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
                this.memory.working = undefined;
                break;
        }
    } else {
        this.say('Build!', true);
        this.memory.needExpediter = construction.progressTotal - construction.progress > 500;
        switch (this.build(construction)) {
            case OK:
                return true;
            case ERR_NOT_IN_RANGE:
                this.shibMove(construction, {range: 3});
                return true;
            case ERR_RCL_NOT_ENOUGH:
                this.memory.constructionSite = undefined;
                this.memory.task = undefined;
                break;
            case ERR_INVALID_TARGET:
                if (construction.pos.checkForCreep()) construction.pos.checkForCreep().moveRandom();
                this.memory.constructionSite = undefined;
                this.memory.task = undefined;
                break;
            case ERR_NOT_ENOUGH_ENERGY:
                this.memory.working = undefined;
                break;
        }
    }
};

Creep.prototype.goToHub = function (destination = this.memory.overlord, idleTime = 10) {
    let hub = new RoomPosition(25, 25, destination);
    if (this.pos.getRangeTo(hub) <= 15) {
        this.idleFor(idleTime);
        return false;
    }
    this.shibMove(hub, {range: 15})
    return true;
};

Creep.prototype.towTruck = function () {
    // Clear broken trailers
    if (this.memory.trailer && !Game.getObjectById(this.memory.trailer)) this.memory.trailer = undefined;
    if (_.sum(this.store)) return false;
    if (!this.memory.trailer) {
        let needsTow = _.filter(this.room.creeps, (c) => c.my && c.memory.towDestination && !c.memory.towCreep);
        if (needsTow.length) {
            // Set start and assign a trailer
            this.memory.towStart = Game.time;
            this.memory.trailer = this.pos.findClosestByRange(needsTow).id;
            Game.getObjectById(this.memory.trailer).memory.towCreep = this.id;
            this.memory._shibMove = undefined;
            return true;
        } else {
            return false;
        }
    } else {
        if (this.fatigue) return true;
        let trailer = Game.getObjectById(this.memory.trailer);
        if (trailer) {
            if (!trailer.memory.towDestination) return this.memory.trailer = undefined;
            this.say('Towing!', true);
            if (trailer.pos.isExit() && trailer.pos.isNearTo(this)) {
                this.pull(trailer);
                trailer.move(this);
                return this.moveRandom();
            }
            let towDestination;
            if (trailer.memory.towDestination && trailer.memory.towDestination.x) {
                towDestination = new RoomPosition(trailer.memory.towDestination.x, trailer.memory.towDestination.y, trailer.memory.towDestination.roomName);
            } else if (Game.getObjectById(trailer.memory.towDestination)) {
                towDestination = Game.getObjectById(trailer.memory.towDestination).pos;
            }
            // Handle case of desto being occupied
            if (trailer.memory.towOptions && trailer.memory.towOptions.range === 0 && this.pos.isNearTo(towDestination) && towDestination.checkForCreep() && towDestination.checkForCreep().id !== this.id) {
                trailer.memory.towOptions.range = 1;
            }
            // Handle towing timeout
            if (this.memory.towStart + 125 < Game.time || !towDestination || trailer.memory.towOptions.range >= trailer.pos.getRangeTo(towDestination)) {
                this.memory.towStart = undefined;
                this.memory.trailer = undefined;
                trailer.memory._shibMove = undefined;
                trailer.memory.towCreep = undefined;
                trailer.memory.towDestination = undefined;
                trailer.memory.towToObject = undefined;
                trailer.memory.towOptions = undefined;
                return false;
            } else
                // Move trailer
            if (this.pull(trailer) === ERR_NOT_IN_RANGE) {
                if (!this.memory.lastRangeToTrailer) this.memory.lastRangeToTrailer = trailer.pos.getRangeTo(this);
                else if (this.memory.lastRangeToTrailer < trailer.pos.getRangeTo(this)) this.memory._shibMove = undefined;
                this.shibMove(trailer);
                return true;
            } else {
                trailer.move(this);
                if (!towDestination || this.pos.getRangeTo(towDestination) === trailer.memory.towOptions.range) {
                    this.move(this.pos.getDirectionTo(trailer));
                } else {
                    trailer.memory._shibMove = undefined;
                    if (!trailer.pos.isNearTo(this)) return this.memory._shibMove = undefined;
                    this.shibMove(towDestination, trailer.memory.towOptions);
                }
                return true;
            }
        }
    }
};

Creep.prototype.portalCheck = function () {
    if (!this.pos.checkForPortal()) return false;
    this.memory.usedPortal = this.room.name;
    if (!positionAtDirection(this.pos, LEFT).checkForPortal()) return this.move(LEFT);
    if (!positionAtDirection(this.pos, RIGHT).checkForPortal()) return this.move(RIGHT);
    if (!positionAtDirection(this.pos, TOP).checkForPortal()) return this.move(TOP);
    if (!positionAtDirection(this.pos, BOTTOM).checkForPortal()) return this.move(BOTTOM);
    if (!positionAtDirection(this.pos, BOTTOM_RIGHT).checkForPortal()) return this.move(BOTTOM_RIGHT);
    if (!positionAtDirection(this.pos, BOTTOM_LEFT).checkForPortal()) return this.move(BOTTOM_LEFT);
    if (!positionAtDirection(this.pos, TOP_RIGHT).checkForPortal()) return this.move(TOP_RIGHT);
    if (!positionAtDirection(this.pos, TOP_LEFT).checkForPortal()) return this.move(TOP_LEFT);
};

Creep.prototype.borderCheck = function () {
    let thisPos = this.pos;
    this.attackInRange();
    this.healInRange();
    let trailer = Game.getObjectById(this.memory.trailer);
    if (trailer) {
        this.pull(trailer);
        trailer.move(this);
    }
    let x = thisPos.x;
    let y = thisPos.y;
    if (x === 0 || y === 0 || x === 49 || y === 49) {
        let pathInfo = this.memory._shibMove;
        if (pathInfo && pathInfo.path) {
            let origin = normalizePos(this);
            if (pathInfo.newPos && pathInfo.newPos.x === this.pos.x && pathInfo.newPos.y === this.pos.y && pathInfo.newPos.roomName === this.pos.roomName) pathInfo.path = pathInfo.path.slice(1);
            if (pathInfo.pathPos === this.pos.x + '.' + this.pos.y + '.' + this.pos.roomName) {
                pathInfo.pathPosTime++;
            } else {
                pathInfo.pathPos = this.pos.x + '.' + this.pos.y + '.' + this.pos.roomName;
                pathInfo.pathPosTime = 0;
            }
            let nextDirection = parseInt(pathInfo.path[0], 10);
            pathInfo.newPos = positionAtDirection(origin, nextDirection);
            if (nextDirection && pathInfo.newPos && !positionAtDirection(origin, nextDirection).checkForImpassible()) {
                switch (this.move(nextDirection)) {
                    case OK:
                        pathInfo.pathPosTime = 0;
                        break;
                    case ERR_TIRED:
                        break;
                    case ERR_NO_BODYPART:
                        break;
                    case ERR_BUSY:
                        creep.idleFor(10);
                        break;
                }
                this.memory._shibMove = pathInfo;
                return;
            } else {
                delete pathInfo.path;
            }
        }
        if (x === 0 && y === 0) {
            this.move(BOTTOM_RIGHT);
        } else if (x === 0 && y === 49) {
            this.move(TOP_RIGHT);
        } else if (x === 49 && y === 0) {
            this.move(BOTTOM_LEFT);
        } else if (x === 49 && y === 49) {
            this.move(TOP_LEFT);
        }
        let pos;
        let road = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_ROAD && s.pos.isNearTo(this))[0];
        if (road) {
            this.move(this.pos.getDirectionTo(road));
        } else if (x === 49) {
            pos = positionAtDirection(thisPos, LEFT);
            if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                this.move(LEFT)
            } else {
                pos = positionAtDirection(thisPos, TOP_LEFT);
                if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                    this.move(TOP_LEFT)
                } else this.move(BOTTOM_LEFT)
            }
        } else if (x === 0) {
            pos = positionAtDirection(thisPos, RIGHT);
            if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                return this.move(RIGHT)
            } else {
                pos = positionAtDirection(thisPos, TOP_RIGHT);
                if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                    this.move(TOP_RIGHT)
                } else this.move(BOTTOM_RIGHT)
            }
        } else if (y === 0) {
            pos = positionAtDirection(thisPos, BOTTOM);
            if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                this.move(BOTTOM)
            } else {
                pos = positionAtDirection(thisPos, BOTTOM_RIGHT);
                if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                    this.move(BOTTOM_RIGHT)
                } else this.move(BOTTOM_LEFT)
            }
        } else if (y === 49) {
            pos = positionAtDirection(thisPos, TOP);
            if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                this.move(TOP)
            } else {
                pos = positionAtDirection(thisPos, TOP_RIGHT);
                if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                    this.move(TOP_RIGHT)
                } else this.move(TOP_LEFT)
            }
        }
        return true;
    }
    return false;
};

Creep.prototype.tryToBoost = function (boosts) {
    if (this.memory.boostAttempt) return false;
    if (!this.memory.boosts) this.memory.boosts = {};
    // Figure out what boosts to get, try to use the most powerful
    if (!this.memory.boosts.requestedBoosts) {
        let available = {};
        let boostNeeded;
        for (let boostType of boosts) {
            switch (boostType) {
                case 'attack':
                    boostNeeded = this.getActiveBodyparts(ATTACK) * 30;
                    break;
                case 'ranged':
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
                case 'upgrade':
                case 'build':
                case 'harvest':
                case 'dismantle':
                    boostNeeded = this.getActiveBodyparts(WORK) * 30;
                    break;
            }
            let count = 0;
            for (let boost of BOOST_USE[boostType]) {
                if (this.room.store(boost) >= boostNeeded) {
                    available[boost] = {
                        'boost': boost,
                        'amount': boostNeeded
                    };
                    break;
                } else if (count === 2 && this.room.store(boost) >= boostNeeded * 0.5 && boostNeeded * 0.5 >= 30) {
                    available[boost] = {
                        'boost': boost,
                        'amount': boostNeeded * 0.5
                    };
                    break;
                }
                count++;
            }
        }
        this.memory.boosts.requestedBoosts = available;
    } else if (_.size(this.memory.boosts.requestedBoosts)) {
        for (let requestedBoost of Object.keys(this.memory.boosts.requestedBoosts)) {
            // Check if boost is low, if so restart
            let boostInRoom = this.room.store(requestedBoost);
            if (boostInRoom < this.memory.boosts.requestedBoosts[requestedBoost]['amount']) {
                let lab = Game.getObjectById(this.memory.boosts.boostLab);
                if (lab) lab.memory = undefined;
                this.memory.boosts = undefined;
                return true;
            }
            // Find a lab to boost the creep if none exist, idle.
            if (!this.memory.boosts.boostLab || !Game.getObjectById(this.memory.boosts.boostLab).memory.neededBoost) {
                let lab = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.energy > 0 &&
                    (s.mineralType === requestedBoost || !s.memory.creating) &&
                    (!s.memory.neededBoost || s.memory.neededBoost === requestedBoost))[0];
                if (lab) {
                    this.memory.boosts.boostLab = lab.id;
                    lab.memory.neededBoost = requestedBoost;
                    lab.memory.amount = this.memory.boosts.requestedBoosts[requestedBoost]['amount'];
                    lab.memory.active = true;
                    lab.memory.requestor = this.id;
                    lab.memory.requested = Game.time;
                } else if (!this.memory.boosts.labTimeout || this.memory.boosts.labTimeout < 10) {
                    if (!this.memory.boosts.labTimeout) this.memory.boosts.labTimeout = 1; else this.memory.boosts.labTimeout += 1;
                    this.idleFor(5);
                    return true;
                } else {
                    if (Game.getObjectById(this.memory.boosts.boostLab)) {
                        Game.getObjectById(this.memory.boosts.boostLab).memory = undefined;
                    }
                    this.memory.boosts = undefined;
                    return this.memory.boostAttempt = true;
                }
            }
            let lab = Game.getObjectById(this.memory.boosts.boostLab);
            if (lab) {
                if (!this.pos.isNearTo(lab)) {
                    this.say(ICONS.boost);
                    this.shibMove(lab);
                    return true;
                } else if (lab.mineralType === lab.memory.neededBoost && lab.energy && lab.mineralAmount >= this.memory.boosts.requestedBoosts[requestedBoost]['amount']) {
                    switch (lab.boostCreep(this)) {
                        case OK:
                            if (lab.memory.creating) lab.memory.neededBoost = undefined; else lab.memory = undefined;
                            this.memory.boosts.requestedBoosts = _.filter(this.memory.boosts.requestedBoosts, (b) => b['boost'] !== requestedBoost);
                            this.say(ICONS.greenCheck);
                            return true;
                        case ERR_NOT_IN_RANGE:
                            this.say(ICONS.boost);
                            this.shibMove(lab);
                            return true;
                        case ERR_NOT_ENOUGH_RESOURCES:
                            this.say('Waiting...');
                            //this.idleFor(5);
                            return true;
                    }
                }
            }
        }
    } else {
        if (Game.getObjectById(this.memory.boosts.boostLab)) {
            Game.getObjectById(this.memory.boosts.boostLab).memory = undefined;
        }
        this.memory.boosts = undefined;
        return this.memory.boostAttempt = true;
    }
    return true;
};

Creep.prototype.recycleCreep = function () {
    // If no moves, suicide
    if (!this.getActiveBodyparts(MOVE)) return this.suicide();
    this.healInRange();
    this.attackInRange();
    let spawn = this.pos.findClosestByRange(FIND_MY_SPAWNS);
    if (!spawn) {
        this.memory.closestRoom = this.memory.closestRoom || this.room.findClosestOwnedRoom();
        return this.shibMove(new RoomPosition(25, 25, this.memory.closestRoom), {range: 23});
    }
    if (this.store.getUsedCapacity()) {
        let deliver = this.room.terminal || this.room.storage || _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.store.getFreeCapacity());
        if (deliver) {
            for (let resourceType in this.store) {
                switch (this.transfer(deliver, resourceType)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        this.shibMove(deliver);
                        return;
                }
            }
        }
    }
    // Clear role to queue replacement if needed
    switch (spawn.recycleCreep(this)) {
        case OK:
            log.a('Creep - ' + this.name + ' successfully recycled in ' + this.room.name, 'RECYCLING:');
            break;
        case ERR_NOT_IN_RANGE:
            return this.shibMove(spawn);
        case ERR_BUSY:
            this.suicide();
    }
};

Creep.prototype.fleeNukeRoom = function () {
    this.say('NUKE!', true);
    if (this.memory.fleeNukeTime <= Game.time) {
        this.memory.fleeNukeTime = undefined;
        this.memory.fleeNukeRoom = undefined;
        return false;
    }
    if (this.memory.fleeTo && this.room.name !== this.memory.fleeTo) this.shibMove(new RoomPosition(25, 25, this.memory.fleeTo), {range: 23}); else if (this.room.name !== this.memory.fleeTo) this.idleFor(this.memory.fleeNukeTime - Game.time);
    if (!this.memory.fleeTo) this.memory.fleeTo = _.sample(_.filter(Memory.myRooms, (r) => !r.nukes.length)).name;
};

Creep.prototype.moveRandom = function () {
    let start = Math.ceil(Math.random() * 8);
    let direction = 0;
    for (let i = start; i < start + 8; i++) {
        direction = ((i - 1) % 8) + 1;
        let pos = this.pos.getAdjacentPosition(direction);
        if (!pos || pos.isExit() || pos.checkForWall() || pos.checkForObstacleStructure() || pos.checkForCreep()) {
            continue;
        }
        break;
    }
    this.move(direction);
};

//FUNCTIONS
function positionAtDirection(origin, direction) {
    let offsetX = [0, 0, 1, 1, 1, 0, -1, -1, -1];
    let offsetY = [0, -1, -1, 0, 1, 1, 1, 0, -1];
    let x = origin.x + offsetX[direction];
    let y = origin.y + offsetY[direction];
    if (x > 49 || x < 0 || y > 49 || y < 0 || !x || !y) {
        return;
    }
    return new RoomPosition(x, y, origin.roomName);
}

function normalizePos(destination) {
    if (!(destination instanceof RoomPosition)) {
        if (destination) {
            return destination.pos;
        } else {
            return;
        }
    }
    return destination;
}

