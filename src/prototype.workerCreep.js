/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

Creep.prototype.wrongRoom = function () {
    if (Game.time % 25 === 0 && this.memory.overlord && this.pos.roomName !== this.memory.overlord) {
        this.memory.recycle = true;
        return true;
    }
};

Creep.prototype.findSource = function (ignoreOthers = false) {
    let source = shuffle(this.room.sources);
    if (this.memory.role === 'stationaryHarvester') source = _.filter(this.room.sources, (s) => _.filter(Game.creeps, (c) => c.id !== this.id && c.memory.role === 'stationaryHarvester' && c.memory.source === s.id).length === 0);
    if (this.memory.role === 'remoteHarvester') source = _.filter(this.room.sources, (s) => _.filter(Game.creeps, (c) => c.id !== this.id && c.memory.role === 'remoteHarvester' && c.memory.source === s.id).length === 0);
    if (this.memory.role === 'SKHarvester') source = _.filter(this.room.sources, (s) => _.filter(Game.creeps, (c) => c.id !== this.id && c.memory.role === 'SKHarvester' && c.memory.source === s.id).length === 0);
    if (ignoreOthers) source = this.room.sources;
    if (source.length > 0) {
        this.memory.source = this.pos.findClosestByRange(source).id;
        return this.pos.findClosestByRange(source).id;
    }
    return false;
};

Creep.prototype.findMineral = function () {
    const mineral = this.room.mineral;
    if (mineral && !_.filter(Game.creeps, (c) => c.id !== this.id && c.memory.source === mineral.id).length) {
        this.memory.source = mineral.id;
        return mineral;
    }
};

Creep.prototype.findConstruction = function () {
    let construction = this.room.constructionSites;
    let site = _.filter(construction, (s) => s.structureType === STRUCTURE_TOWER);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(construction, (s) => s.structureType === STRUCTURE_SPAWN);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.hits < s.hitsMax * 0.3 && !_.filter(this.room.creeps, (c) => c.my && c.memory.constructionSite === s.id).length);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        this.memory.targetHits = site.hitsMax * 0.65;
        return true;
    }
    site = _.filter(construction, (s) => s.structureType === STRUCTURE_EXTENSION);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';

        return true;
    }
    site = _.filter(construction, (s) => s.structureType === STRUCTURE_TERMINAL);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(construction, (s) => s.structureType === STRUCTURE_STORAGE);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(construction, (s) => s.structureType === STRUCTURE_LINK);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 5000 && !_.filter(this.room.creeps, (c) => c.my && c.memory.constructionSite === s.id).length);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        this.memory.targetHits = 12500;
        return true;
    }
    site = _.filter(construction, (s) => s.structureType === STRUCTURE_CONTAINER);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(construction, (s) => s.structureType === STRUCTURE_RAMPART);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = shuffle(_.filter(construction, (s) => s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART));
    if (site.length > 0) {
        this.memory.constructionSite = site[0].id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(construction, (s) => s.structureType === STRUCTURE_WALL);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * 0.3 && !_.filter(this.room.creeps, (c) => c.my && c.memory.constructionSite === s.id).length);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        this.memory.targetHits = site.hitsMax * 0.65;
        return true;
    }
    this.memory.constructionSite = undefined;
    this.memory.task = undefined;
    return false;
};

Creep.prototype.findRepair = function (level) {
    let structures = _.filter(this.room.structures, (s) => s.hits < s.hitsMax);
    let site = _.filter(structures, (s) => s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_RAMPART && s.hits < s.hitsMax);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        return true;
    }
    site = _.filter(structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.hits < s.hitsMax * 0.3);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        this.memory.targetHits = site.hitsMax * 0.65;
        return true;
    }
    site = _.filter(structures, (s) => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * 0.3);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        this.memory.targetHits = site.hitsMax * 0.65;
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
    site = _.filter(structures, (s) => s.structureType === STRUCTURE_WALL && s.hits < 100000);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        this.memory.targetHits = 110000 * this.room.controller.level;
        return true;
    }
    site = _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 100000);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        this.memory.targetHits = 110000 * this.room.controller.level;
        return true;
    }
    this.memory.constructionSite = undefined;
    this.memory.task = undefined;
    return false;
};

Creep.prototype.containerBuilding = function () {
    let site = this.pos.findClosestByRange(this.room.constructionSites, {filter: (s) => s.structureType === STRUCTURE_CONTAINER});
    if (site) {
        if (this.pos.getRangeTo(site) <= 1) {
            return site.id;
        }
    }
};

Creep.prototype.harvestDepositContainer = function () {
    let container = this.pos.findClosestByRange(this.room.structures, {filter: (s) => s.structureType === STRUCTURE_CONTAINER});
    if (container) {
        if (this.pos.getRangeTo(container) <= 1) {
            return container.id;
        } else if (this.pos.getRangeTo(container) <= 3) {
            this.shibMove(container);
            return container.id;
        }
    } else {
        this.harvesterContainerBuild();
    }
};

Creep.prototype.harvesterContainerBuild = function () {
    if (this.memory.source && this.pos.getRangeTo(Game.getObjectById(this.memory.source)) <= 1) {
        if (Game.getObjectById(this.memory.source).pos.findInRange(FIND_CONSTRUCTION_SITES, 1).length) return;
        if (this.pos.createConstructionSite(STRUCTURE_CONTAINER) !== OK) {
            return;
        }
    }
};

Creep.prototype.withdrawResource = function (destination = undefined, amount = undefined) {
    if (destination) this.memory.energyDestination = destination.id;
    if (this.memory.energyDestination) {
        let energyItem = Game.getObjectById(this.memory.energyDestination);
        if (!energyItem) return this.memory.energyDestination = undefined;
        if ((energyItem.store && energyItem.store[RESOURCE_ENERGY] > 0) || (energyItem.energy && energyItem.energy > 0)) {
            if (amount && energyItem.store && energyItem.store[RESOURCE_ENERGY] < amount) amount = energyItem.store[RESOURCE_ENERGY];
            switch (this.withdraw(energyItem, RESOURCE_ENERGY, amount)) {
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
                            this.shibMove(energyItem, {range: 1});
                            break;
                        case ERR_FULL:
                            this.memory.energyDestination = undefined;
                            this.memory._shibMove = undefined;
                            break;
                        case ERR_INVALID_TARGET:
                            switch (energyItem.transfer(this, RESOURCE_ENERGY, amount)) {
                                case OK:
                                    this.memory.withdrawID = energyItem.id;
                                    this.memory.energyDestination = undefined;
                                    this.memory._shibMove = undefined;
                                    return true;
                                case ERR_NOT_IN_RANGE:
                                    this.shibMove(energyItem, {range: 1});
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
                    this.shibMove(energyItem, {range: 1});
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
        } else {
            delete this.memory.energyDestination;
        }
    }
};

Creep.prototype.findEnergy = function () {
    // Fuel Trucks
    let fuelTrucks = _.filter(this.room.creeps, (c) => c.my && c.memory.role === 'fuelTruck' && c.store[RESOURCE_ENERGY]);
    if (fuelTrucks.length) {
        this.memory.energyDestination = fuelTrucks[0].id;
        return true;
    }
    // Terminal
    let terminal = this.room.terminal;
    if (terminal && terminal.store[RESOURCE_ENERGY] > TERMINAL_ENERGY_BUFFER) {
        this.memory.energyDestination = terminal.id;
        return true;
    }
    // Storage
    let storage = this.room.storage;
    if (storage && storage.store[RESOURCE_ENERGY] >= ENERGY_AMOUNT * 0.25) {
        this.memory.energyDestination = storage.id;
        return true;
    }
    // Links
    /**let hubLink = Game.getObjectById(this.room.memory.hubLink);
    if (hubLink && hubLink.energy > 50 && !_.filter(this.room.creeps, (c) => c.my && c.memory.energyDestination === hubLink.id && c.id !== this.id).length) {
        this.memory.energyDestination = hubLink.id;
        return true;
    }**/
    //Dropped
    let dropped = this.pos.findClosestByRange(this.room.droppedEnergy, {filter: (r) => r.amount > (this.room.creeps.filter((c) => c.my && c.memory.energyDestination === r.id && c.id !== this.id).length + 1) * this.store.getCapacity()});
    if (dropped) {
        this.memory.energyDestination = dropped.id;
        return true;
    }
    // Tombstone
    let tombstone = this.pos.findClosestByRange(this.room.tombstones, {filter: (r) => r.store[RESOURCE_ENERGY] > (this.room.creeps.filter((c) => c.my && c.memory.energyDestination === r.id && c.id !== this.id).length + 1) * this.store.getCapacity()}) ||
        this.pos.findClosestByRange(this.room.ruins, {filter: (r) => r.store[RESOURCE_ENERGY] > (this.room.creeps.filter((c) => c.my && c.memory.energyDestination === r.id && c.id !== this.id).length + 1) * this.store.getCapacity()});
    if (tombstone) {
        this.memory.energyDestination = tombstone.id;
        return true;
    }
    // Links
    let hubLink = Game.getObjectById(this.room.memory.hubLink) || Game.getObjectById(_.sample(this.room.memory.hubLinks));
    if (hubLink && hubLink.energy) {
        this.memory.energyDestination = hubLink.id;
        this.memory.findEnergyCountdown = undefined;
        return true;
    }
    // Container
    let container = this.pos.findClosestByRange(FIND_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_CONTAINER && this.room.memory.controllerContainer !== s.id
            && s.store[RESOURCE_ENERGY] >= (this.room.creeps.filter((c) => c.my && c.memory.energyDestination === s.id && c.id !== this.id).length + 1) * this.store.getCapacity()
    });
    if (container) {
        this.memory.energyDestination = container.id;
        return true;
    }
    //Take straight from remoteHaulers/fuel truck at low level who have nowhere to drop
    let hauler = this.pos.findClosestByRange(_.filter(this.room.creeps, (c) => c.memory && (c.memory.role === 'remoteHauler' || c.memory.role === 'fuelTruck') && !c.memory.storageDestination && c.memory.idle
        && c.store[RESOURCE_ENERGY] >= (this.room.creeps.filter((c2) => c2.my && c2.memory.energyDestination === c.id && c2.id !== this.id).length + 1) * this.store.getCapacity()));
    if (hauler) {
        this.memory.energyDestination = hauler.id;
        return true;
    }
    return false;
};

Creep.prototype.getEnergy = function (hauler = false) {
    // Links
    let hubLink = Game.getObjectById(this.room.memory.hubLink) || Game.getObjectById(_.sample(this.room.memory.hubLinks));
    if (hubLink && hubLink.energy && ((hubLink.energy && hauler) || hubLink.energy >= (this.room.creeps.filter((c) => c.my && c.memory.energyDestination === hubLink.id && c.id !== this.id).length + 1) * (this.store.getCapacity() * 0.5))) {
        this.memory.energyDestination = hubLink.id;
        this.memory.findEnergyCountdown = undefined;
        return true;
    }
    // Tombstone
    let tombstone = this.pos.findClosestByRange(this.room.tombstones, {filter: (r) => r.pos.getRangeTo(this) <= 10 && r.store[RESOURCE_ENERGY] > (this.room.creeps.filter((c) => c.my && c.memory.energyDestination === r.id && c.id !== this.id).length + 1) * this.store.getCapacity()}) ||
        this.pos.findClosestByRange(this.room.ruins, {filter: (r) => r.store[RESOURCE_ENERGY] > (this.room.creeps.filter((c) => c.my && c.memory.energyDestination === r.id && c.id !== this.id).length + 1) * this.store.getCapacity()});
    if (tombstone) {
        this.memory.energyDestination = tombstone.id;
        return true;
    }
    // Extra Full Terminal
    let terminal = this.room.terminal;
    if (terminal && terminal.store[RESOURCE_ENERGY] >= TERMINAL_ENERGY_BUFFER * 1.2) {
        this.memory.energyDestination = terminal.id;
        this.memory.findEnergyCountdown = undefined;
        return true;
    }
    // Storage
    let storage = this.room.storage;
    if (storage && (storage.store[RESOURCE_ENERGY] >= ENERGY_AMOUNT * 0.25 || (storage.store[RESOURCE_ENERGY] && hauler))) {
        this.memory.energyDestination = storage.id;
        this.memory.findEnergyCountdown = undefined;
        return true;
    }
    if (this.memory.role !== 'hauler' || this.room.controller.level < 5 || (this.memory.findEnergyCountdown >= this.room.controller.level)) {
        // Container
        let container = this.pos.findClosestByRange(this.room.structures, {
            filter: (s) => s.structureType === STRUCTURE_CONTAINER && this.room.memory.controllerContainer !== s.id
                && s.store[RESOURCE_ENERGY] > (this.room.creeps.filter((c) => c.my && c.memory.energyDestination === s.id && c.id !== this.id).length + 1) * this.store.getCapacity()
        });
        if (container) {
            this.memory.energyDestination = container.id;
            this.memory.findEnergyCountdown = undefined;
            return true;
        }
        //Dropped
        let dropped = this.pos.findClosestByRange(this.room.droppedEnergy, {filter: (r) => r.amount >= this.store.getCapacity() * 0.8});
        if (dropped) {
            this.memory.energyDestination = dropped.id;
            this.memory.findEnergyCountdown = undefined;
            return true;
        }
        //Links
        let links = this.pos.findClosestByRange(this.room.structures, {
            filter: (s) => s.structureType === STRUCTURE_LINK && this.room.memory.controllerLink !== s.id
                && s.energy >= (this.room.creeps.filter((c) => c.my && c.memory.energyDestination === s.id && c.id !== this.id).length + 1) * this.store.getCapacity()
        });
        if (links) {
            this.memory.energyDestination = links.id;
            this.memory.findEnergyCountdown = undefined;
            return true;
        }
    }
    if (!this.memory.findEnergyCountdown) this.memory.findEnergyCountdown = 1; else this.memory.findEnergyCountdown += 1;
    return false;
};

// Hauler essential storage
Creep.prototype.haulerDelivery = function () {
    //Tower
    if (Memory.roomCache[this.room.name].responseNeeded) {
        let tower = this.pos.findClosestByRange(this.room.structures, {
            filter: (s) => s.structureType === STRUCTURE_TOWER && s.energy < s.energyCapacity * 0.85 &&
                _.sum(_.filter(this.room.creeps, (c) => c.my && c.memory.storageDestination === s.id), 'store[RESOURCE_ENERGY]') < s.energyCapacity - s.energy
        });
        if (tower) {
            this.memory.storageDestination = tower.id;
            return true;
        }
    } else {
        let tower = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.energy < s.energyCapacity * 0.15 &&
            _.sum(_.filter(this.room.creeps, (c) => c.my && c.memory.storageDestination === s.id), 'store[RESOURCE_ENERGY]') < s.energyCapacity - s.energy)[0];
        if (tower) {
            this.memory.storageDestination = tower.id;
            return true;
        }
    }
    // Spawns/Extensions
    if (!this.memory.spawnsExtension) {
        this.memory.spawnsExtension = JSON.stringify(_.pluck(_.filter(this.room.structures, (s) => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && !s.pos.findInRange(FIND_MY_CREEPS, 1, {filter: (c) => c.memory.role === 'stationaryHarvester'}).length), 'id'));
        return;
    } else {
        let spawnsExtensions = [];
        let parsedID = JSON.parse(this.memory.spawnsExtension);
        parsedID.forEach((s) => spawnsExtensions.push(Game.getObjectById(s)));
        let target = this.pos.findClosestByPath(_.filter(spawnsExtensions, (s) => s.energy < s.energyCapacity && !_.filter(this.room.creeps, (c) => c.my && c.memory.storageDestination === s.id).length));
        if (target) {
            this.memory.storageDestination = target.id;
            return true;
        }
    }
    let terminal = this.room.terminal;
    let storage = this.room.storage;
    if (this.room.controller.level >= 6) {
        //Terminal low
        if (terminal && this.memory.withdrawID !== terminal.id && terminal.my && terminal.store[RESOURCE_ENERGY] < TERMINAL_ENERGY_BUFFER) {
            this.memory.storageDestination = terminal.id;
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
            if (nuke) {
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
    let tower = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.energy < s.energyCapacity * 0.9 &&
        _.sum(_.filter(this.room.creeps, (c) => c.my && c.memory.storageDestination === s.id), 'store[RESOURCE_ENERGY]') < s.energyCapacity - s.energy)[0];
    if (tower) {
        let fullTower = _.filter(this.room.structures, (s) => s.my && s.structureType === STRUCTURE_TOWER && s.energy >= s.energyCapacity * 0.9 &&
            _.sum(_.filter(this.room.creeps, (c) => c.my && c.memory.storageDestination === s.id), 'store[RESOURCE_ENERGY]') < s.energyCapacity - s.energy)[0];
        if (!fullTower) {
            this.memory.storageDestination = tower.id;
            return true;
        }
    }
    //Storage
    if (storage && this.memory.withdrawID !== storage.id && storage.my && storage.store[RESOURCE_ENERGY] < ENERGY_AMOUNT * 0.5) {
        this.memory.storageDestination = storage.id;
        return true;
    }
    //Terminal
    if (terminal && this.memory.withdrawID !== terminal.id) {
        this.memory.storageDestination = terminal.id;
        return true;
    }
    //Controller
    let controllerContainer = Game.getObjectById(this.room.memory.controllerContainer);
    if (controllerContainer) {
        this.memory.storageDestination = controllerContainer.id;
        return true;
    }
    return false;
};

Creep.prototype.builderFunction = function () {
    let construction = Game.getObjectById(this.memory.constructionSite);
    if (!construction || construction === null) {
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

/**
 * Globally patch creep actions to log error codes.
 ['attack', 'attackController', 'build', 'claimController', 'dismantle', 'drop',
 'generateSafeMode', 'harvest', 'heal', 'move', 'moveByPath', 'moveTo', 'pickup',
 'rangedAttack', 'rangedHeal', 'rangedMassAttack', 'repair', 'reserveController',
 'signController', 'suicide', 'transfer', 'upgradeController', 'withdraw'].forEach(function (method) {
    let original = Creep.prototype[method];
    // Magic
    Creep.prototype[method] = function () {
        let status = original.apply(this, arguments);
        if (typeof status === 'number' && status < 0 && status !== -9) {
            console.log(`Creep ${this.name} action ${method} failed with status ${status} at ${this.pos}`);
        }
        return status;
    }
});
 */
