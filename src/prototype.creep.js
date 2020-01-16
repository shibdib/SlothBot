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
            return 0;
        }
        this.say(_.sample([ICONS.wait23, ICONS.wait21, ICONS.wait19, ICONS.wait17, ICONS.wait13, ICONS.wait11, ICONS.wait7, ICONS.wait10, ICONS.wait3, ICONS.wait1]), true);
        if (this.pos.checkForRoad() && this.memory.role !== 'stationaryHarvester' && this.memory.role !== 'mineralHarvester' && this.memory.role !== 'remoteHarvester') {
            this.moveRandom();
        } else if (this.pos.getRangeTo(this.pos.findClosestByRange(FIND_MY_SPAWNS)) === 1) {
            this.moveRandom();
        }
        return this.memory.idle;
    },
    set: function (val) {
        if (!val && this.memory.idle) {
            delete(this.memory.idle);
        } else {
            this.memory.idle = val;
        }
    }
});

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

Creep.prototype.constructionWork = function () {
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
    let structures = _.filter(this.room.structures, (s) => s.hits < s.hitsMax);
    site = _.filter(structures, (s) => s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_RAMPART && s.hits < s.hitsMax);
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

Creep.prototype.locateEnergy = function () {
    let hauler = this.memory.role === 'hauler';
    // Fuel Trucks
    let fuelTrucks = _.filter(this.room.creeps, (c) => c.my && c.memory.role === 'fuelTruck' && c.store[RESOURCE_ENERGY]);
    if (fuelTrucks.length && this.memory.role !== 'fuelTruck') {
        this.memory.energyDestination = fuelTrucks[0].id;
        return true;
    }
    // Links
    let hubLink = Game.getObjectById(this.room.memory.hubLink);
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
    // Terminal
    let terminal = this.room.terminal;
    if (terminal && terminal.store[RESOURCE_ENERGY] > TERMINAL_ENERGY_BUFFER) {
        this.memory.energyDestination = terminal.id;
        return true;
    }
    // Storage
    let storage = this.room.storage;
    if (storage && storage.store[RESOURCE_ENERGY] >= ENERGY_AMOUNT * 0.25 || (storage.store[RESOURCE_ENERGY] && hauler)) {
        this.memory.energyDestination = storage.id;
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
        //Take straight from remoteHaulers/fuel truck at low level who have nowhere to drop
        let hauler = this.pos.findClosestByRange(_.filter(this.room.creeps, (c) => c.memory && (c.memory.role === 'remoteHauler' || c.memory.role === 'fuelTruck') && !c.memory.storageDestination && c.memory.idle
            && c.store[RESOURCE_ENERGY] >= (this.room.creeps.filter((c2) => c2.my && c2.memory.energyDestination === c.id && c2.id !== this.id).length + 1) * this.store.getCapacity()));
        if (hauler) {
            this.memory.energyDestination = hauler.id;
            return true;
        }
    }
    if (!this.memory.findEnergyCountdown) this.memory.findEnergyCountdown = 1; else this.memory.findEnergyCountdown += 1;
    return false;
};

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
    if (!this.memory.other.spawnsExtensions) {
        this.memory.other.spawnsExtensions = JSON.stringify(_.pluck(_.filter(this.room.structures, (s) => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && !s.pos.findInRange(FIND_MY_CREEPS, 1, {filter: (c) => c.memory.role === 'stationaryHarvester'}).length), 'id'));
        return;
    } else {
        let spawnsExtensions = [];
        let parsedID = JSON.parse(this.memory.other.spawnsExtensions);
        parsedID.forEach((s) => spawnsExtensions.push(Game.getObjectById(s)));
        if (spawnsExtensions.length) {
            let target = this.pos.findClosestByPath(_.filter(spawnsExtensions, (s) => s.energy < s.energyCapacity && !_.filter(this.room.creeps, (c) => c.my && c.memory.storageDestination === s.id).length));
            if (target) {
                this.memory.storageDestination = target.id;
                return true;
            }
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

Creep.prototype.goToHub = function (destination, idleTime = 10) {
    let hub = new RoomPosition(25, 25, destination);
    if (this.pos.getRangeTo(hub) <= 15) return this.idleFor(idleTime);
    return this.shibMove(hub, {range: 15})
};

Creep.prototype.idleFor = function (ticks = 0) {
    if (this.hits < this.hitsMax && this.getActiveBodyparts(HEAL)) return this.heal(this);
    if (ticks > 0) {
        this.idle = Game.time + ticks;
    } else {
        delete this.idle;
    }
};

Creep.prototype.towTruck = function () {
    // Clear broken trailers
    if (this.memory.trailer && !Game.getObjectById(this.memory.trailer)) this.memory.trailer = undefined;
    if (_.sum(this.store)) return false;
    if (!this.memory.trailer) {
        let needsTow = _.filter(this.room.creeps, (c) => c.my && c.memory.towDestination && !c.memory.towCreep);
        if (needsTow.length) {
            this.memory.trailer = this.pos.findClosestByRange(needsTow).id;
            Game.getObjectById(this.memory.trailer).memory.towCreep = this.id;
            return true;
        } else {
            return false;
        }
    } else {
        this.say('Towing!', true);
        if (this.fatigue) return true;
        let trailer = Game.getObjectById(this.memory.trailer);
        if (trailer) {
            if (!trailer.memory.towDestination || trailer.memory.towRange === trailer.pos.getRangeTo(Game.getObjectById(trailer.memory.towDestination))) {
                this.memory.trailer = undefined;
                trailer.memory._shibMove = undefined;
                trailer.memory.towCreep = undefined;
                trailer.memory.towDestination = undefined;
                trailer.memory.towToObject = undefined;
                trailer.memory.towRange = undefined;
                return false;
            }
            if (this.pull(trailer) === ERR_NOT_IN_RANGE) {
                trailer.memory._shibMove = undefined;
                this.shibMove(trailer);
                return true;
            } else {
                trailer.move(this);
                if (!Game.getObjectById(trailer.memory.towDestination) || this.pos.getRangeTo(Game.getObjectById(trailer.memory.towDestination)) === trailer.memory.towRange) {
                    this.move(this.pos.getDirectionTo(trailer));
                    this.memory.trailer = undefined;
                    trailer.memory._shibMove = undefined;
                    trailer.memory.towCreep = undefined;
                    trailer.memory.towDestination = undefined;
                    trailer.memory.towToObject = undefined;
                    trailer.memory.towRange = undefined;
                } else {
                    trailer.memory._shibMove = undefined;
                    this.shibMove(Game.getObjectById(trailer.memory.towDestination), {range: trailer.memory.towRange});
                }
                return true;
            }
        }
    }
};

Creep.prototype.portalCheck = function () {
    if (!this.pos.checkForPortal()) return false;
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
    let x = thisPos.x;
    let y = thisPos.y;
    if (x === 0 || y === 0 || x === 49 || y === 49) {
        if (x === 0 && y === 0) {
            return this.move(BOTTOM_RIGHT);
        }
        else if (x === 0 && y === 49) {
            return this.move(TOP_RIGHT);
        }
        else if (x === 49 && y === 0) {
            return this.move(BOTTOM_LEFT);
        }
        else if (x === 49 && y === 49) {
            return this.move(TOP_LEFT);
        }
        let pos;
        if (x === 49) {
            pos = positionAtDirection(thisPos, LEFT);
            if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                return this.move(LEFT)
            }
            pos = positionAtDirection(thisPos, TOP_LEFT);
            if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                return this.move(TOP_LEFT)
            }
            return this.move(BOTTOM_LEFT)
        }
        else if (x === 0) {
            pos = positionAtDirection(thisPos, RIGHT);
            if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                return this.move(RIGHT)
            }
            pos = positionAtDirection(thisPos, TOP_RIGHT);
            if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                return this.move(TOP_RIGHT)
            }
            return this.move(BOTTOM_RIGHT)
        }
        else if (y === 0) {
            pos = positionAtDirection(thisPos, BOTTOM);
            if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                return this.move(BOTTOM)
            }
            pos = positionAtDirection(thisPos, BOTTOM_RIGHT);
            if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                return this.move(BOTTOM_RIGHT)
            }
            return this.move(BOTTOM_LEFT)
        }
        else if (y === 49) {
            pos = positionAtDirection(thisPos, TOP);
            if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                return this.move(TOP)
            }
            pos = positionAtDirection(thisPos, TOP_RIGHT);
            if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                return this.move(TOP_RIGHT)
            }
            return this.move(TOP_LEFT)
        }
        return true;
    }
    return false;
};

Creep.prototype.renewalCheck = function (cutoff = 100, target = 1200, force = false) {
    if ((this.ticksToLive < cutoff || this.memory.renewing) && Game.rooms[this.memory.overlord].energyAvailable) {
        if (this.ticksToLive >= target) {
            delete this.memory.boostAttempt;
            delete this.memory.renewingTarget;
            return delete this.memory.renewing;
        }
        let spawn = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_SPAWN && (!s.spawning || force) && (!_.filter(this.room.creeps, (c) => c.memory && c.memory.renewingTarget === s.id && c.id !== this.id)[0] || force))[0];
        if (spawn) {
            switch (spawn.renewCreep(this)) {
                case OK:
                    if (this.store[RESOURCE_ENERGY] > 0 && !spawn.spawning) this.transfer(spawn, RESOURCE_ENERGY);
                    this.say(ICONS.renew);
                    this.memory.renewingTarget = spawn.id;
                    this.memory.renewing = true;
                    return true;
                case ERR_NOT_IN_RANGE:
                    this.memory.renewingTarget = spawn.id;
                    this.memory.renewing = true;
                    this.shibMove(spawn);
                    return true;
            }
        } else if (this.ticksToLive < 45) this.memory.recycle = true;
    }
    delete this.memory.renewing;
    return false;
};

Creep.prototype.tryToBoost = function (boosts, require = false) {
    if (this.memory.boostAttempt) return false;
    // Unboosting
    /**if (labs[0] && this.memory.boostAttempt && !this.memory.unboosted && this.ticksToLive <= 75) {
        switch (labs[0].unboostCreep(this)) {
            case OK:
                this.memory.unboosted = true;
                break;
            case ERR_NOT_IN_RANGE:
                this.say('Un-boosting');
                break;
            case ERR_NOT_FOUND:
                this.memory.unboosted = true;
        }
        this.shibMove(labs[0]);
        return true;
    }**/
    if (!this.memory.requestedBoosts) {
        let available = [];
        let boostNeeded;
        for (let key in boosts) {
            let boostInRoom;
            switch (boosts[key]) {
                case 'attack':
                    boostInRoom = getBoostAmount(this.room, RESOURCE_CATALYZED_UTRIUM_ACID);
                    boostNeeded = this.getActiveBodyparts(ATTACK) * 30;
                    if (!boostNeeded) continue;
                    this.memory.boostNeeded = boostNeeded;
                    if (boostInRoom >= boostNeeded) {
                        available.push(RESOURCE_CATALYZED_UTRIUM_ACID);
                    } else if (getBoostAmount(this.room, RESOURCE_UTRIUM_ACID) >= boostNeeded) {
                        available.push(RESOURCE_UTRIUM_ACID);
                    } else if (getBoostAmount(this.room, RESOURCE_UTRIUM_HYDRIDE) >= boostNeeded) {
                        available.push(RESOURCE_UTRIUM_HYDRIDE);
                    }
                    continue;
                case 'upgrade':
                    boostInRoom = getBoostAmount(this.room, RESOURCE_CATALYZED_GHODIUM_ACID);
                    boostNeeded = this.getActiveBodyparts(WORK) * 30;
                    if (!boostNeeded) continue;
                    this.memory.boostNeeded = boostNeeded;
                    if (boostInRoom >= boostNeeded) {
                        available.push(RESOURCE_CATALYZED_GHODIUM_ACID);
                    } else if (getBoostAmount(this.room, RESOURCE_GHODIUM_ACID) >= boostNeeded) {
                        available.push(RESOURCE_GHODIUM_ACID);
                    } else if (getBoostAmount(this.room, RESOURCE_GHODIUM_HYDRIDE) >= boostNeeded) {
                        available.push(RESOURCE_GHODIUM_HYDRIDE);
                    }
                    continue;
                case 'tough':
                    boostInRoom = getBoostAmount(this.room, RESOURCE_CATALYZED_GHODIUM_ALKALIDE);
                    boostNeeded = this.getActiveBodyparts(TOUGH) * 30;
                    if (!boostNeeded) continue;
                    this.memory.boostNeeded = boostNeeded;
                    if (boostInRoom >= boostNeeded) {
                        available.push(RESOURCE_CATALYZED_GHODIUM_ALKALIDE);
                    } else if (getBoostAmount(this.room, RESOURCE_GHODIUM_ALKALIDE) >= boostNeeded) {
                        available.push(RESOURCE_GHODIUM_ALKALIDE);
                    } else if (getBoostAmount(this.room, RESOURCE_GHODIUM_OXIDE) >= boostNeeded) {
                        available.push(RESOURCE_GHODIUM_OXIDE);
                    }
                    continue;
                case 'ranged':
                    boostInRoom = getBoostAmount(this.room, RESOURCE_CATALYZED_KEANIUM_ALKALIDE);
                    boostNeeded = this.getActiveBodyparts(RANGED_ATTACK) * 30;
                    if (!boostNeeded) continue;
                    this.memory.boostNeeded = boostNeeded;
                    if (boostInRoom >= boostNeeded) {
                        available.push(RESOURCE_CATALYZED_KEANIUM_ALKALIDE);
                    } else if (getBoostAmount(this.room, RESOURCE_KEANIUM_ALKALIDE) >= boostNeeded) {
                        available.push(RESOURCE_KEANIUM_ALKALIDE);
                    } else if (getBoostAmount(this.room, RESOURCE_KEANIUM_OXIDE) >= boostNeeded) {
                        available.push(RESOURCE_KEANIUM_OXIDE);
                    }
                    continue;
                case 'heal':
                    boostInRoom = getBoostAmount(this.room, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE);
                    boostNeeded = this.getActiveBodyparts(HEAL) * 30;
                    if (!boostNeeded) continue;
                    this.memory.boostNeeded = boostNeeded;
                    if (boostInRoom >= boostNeeded) {
                        available.push(RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE);
                    } else if (getBoostAmount(this.room, RESOURCE_LEMERGIUM_ALKALIDE) >= boostNeeded) {
                        available.push(RESOURCE_LEMERGIUM_ALKALIDE);
                    } else if (getBoostAmount(this.room, RESOURCE_LEMERGIUM_OXIDE) >= boostNeeded) {
                        available.push(RESOURCE_LEMERGIUM_OXIDE);
                    }
                    continue;
                case 'build':
                    boostInRoom = getBoostAmount(this.room, RESOURCE_CATALYZED_LEMERGIUM_ACID);
                    boostNeeded = this.getActiveBodyparts(WORK) * 30;
                    if (!boostNeeded) continue;
                    this.memory.boostNeeded = boostNeeded;
                    if (boostInRoom >= boostNeeded) {
                        available.push(RESOURCE_CATALYZED_LEMERGIUM_ACID);
                    } else if (getBoostAmount(this.room, RESOURCE_LEMERGIUM_ACID) >= boostNeeded) {
                        available.push(RESOURCE_LEMERGIUM_ACID);
                    } else if (getBoostAmount(this.room, RESOURCE_LEMERGIUM_HYDRIDE) >= boostNeeded) {
                        available.push(RESOURCE_LEMERGIUM_HYDRIDE);
                    }
                    continue;
                case 'move':
                    boostInRoom = getBoostAmount(this.room, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE);
                    boostNeeded = this.getActiveBodyparts(MOVE) * 30;
                    if (!boostNeeded) continue;
                    this.memory.boostNeeded = boostNeeded;
                    if (boostInRoom >= boostNeeded) {
                        available.push(RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE);
                    } else if (getBoostAmount(this.room, RESOURCE_ZYNTHIUM_ALKALIDE) >= boostNeeded) {
                        available.push(RESOURCE_ZYNTHIUM_ALKALIDE);
                    } else if (getBoostAmount(this.room, RESOURCE_ZYNTHIUM_OXIDE) >= boostNeeded) {
                        available.push(RESOURCE_ZYNTHIUM_OXIDE);
                    }
                    continue;
                case 'harvest':
                    boostInRoom = getBoostAmount(this.room, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE);
                    boostNeeded = this.getActiveBodyparts(WORK) * 30;
                    if (!boostNeeded) continue;
                    this.memory.boostNeeded = boostNeeded;
                    if (boostInRoom >= boostNeeded) {
                        available.push(RESOURCE_CATALYZED_UTRIUM_ALKALIDE);
                    } else if (getBoostAmount(this.room, RESOURCE_UTRIUM_ALKALIDE) >= boostNeeded) {
                        available.push(RESOURCE_UTRIUM_ALKALIDE);
                    } else if (getBoostAmount(this.room, RESOURCE_UTRIUM_OXIDE) >= boostNeeded) {
                        available.push(RESOURCE_UTRIUM_OXIDE);
                    }
                    continue;
                case 'dismantle':
                    boostInRoom = getBoostAmount(this.room, RESOURCE_CATALYZED_ZYNTHIUM_ACID);
                    boostNeeded = this.getActiveBodyparts(WORK) * 30;
                    if (!boostNeeded) continue;
                    this.memory.boostNeeded = boostNeeded;
                    if (boostInRoom >= boostNeeded) {
                        available.push(RESOURCE_CATALYZED_ZYNTHIUM_ACID);
                    } else if (getBoostAmount(this.room, RESOURCE_ZYNTHIUM_ACID) >= boostNeeded) {
                        available.push(RESOURCE_ZYNTHIUM_ACID);
                    } else if (getBoostAmount(this.room, RESOURCE_ZYNTHIUM_HYDRIDE) >= boostNeeded) {
                        available.push(RESOURCE_ZYNTHIUM_HYDRIDE);
                    }
            }
        }
        this.memory.requestedBoosts = available;
    } else {
        if (!require && (!this.memory.requestedBoosts.length || this.ticksToLive < 750)) {
            let lab = Game.getObjectById(this.memory.boostLab);
            if (lab) {
                lab.memory = undefined;
            }
            this.memory.requestedBoosts = undefined;
            this.memory.boostLab = undefined;
            this.memory.boostNeeded = undefined;
            return this.memory.boostAttempt = true;
        }
        for (let key in this.memory.requestedBoosts) {
            let boostInRoom = getBoostAmount(this.room, this.memory.requestedBoosts[key]);
            if (boostInRoom < this.memory.boostNeeded) {
                this.memory.requestedBoosts.shift();
                let lab = Game.getObjectById(this.memory.boostLab);
                if (lab) {
                    lab.memory = undefined;
                }
                this.memory.boostLab = undefined;
                this.memory.boostNeeded = undefined;
                continue;
            }
            if (!this.memory.boostLab) {
                let labs = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_LAB);
                let filledLab = _.filter(labs, (s) => s.mineralType === this.memory.requestedBoosts[key] && s.energy > 0)[0];
                let idleLab = _.filter(labs, (s) => s.energy > 0 && (!s.memory.creating || s.memory.creating === this.memory.requestedBoosts[key]))[0];
                if (filledLab) {
                    if (filledLab.memory.neededBoost && filledLab.memory.neededBoost !== this.memory.requestedBoosts[key]) return;
                    this.memory.boostLab = filledLab.id;
                    filledLab.memory.neededBoost = this.memory.requestedBoosts[key];
                    filledLab.memory.active = true;
                    filledLab.memory.requested = Game.time;
                } else if (idleLab) {
                    if (idleLab.memory.neededBoost && idleLab.memory.neededBoost !== this.memory.requestedBoosts[key]) return;
                    this.memory.boostLab = idleLab.id;
                    idleLab.memory.neededBoost = this.memory.requestedBoosts[key];
                    idleLab.memory.active = true;
                    idleLab.memory.requested = Game.time;
                } else {
                    return this.memory.boostAttempt = true;
                }
            }
            let lab = Game.getObjectById(this.memory.boostLab);
            if (!lab.memory || !lab.memory.neededBoost) {
                this.memory.requestedBoosts.shift();
                lab.memory = undefined;
                this.memory.boostLab = undefined;
                this.memory.boostNeeded = undefined;
                return;
            }
            if (lab && lab.pos.getRangeTo(this) > 1) {
                this.say(ICONS.boost);
                this.shibMove(lab);
                return true;
            }
            if (lab && lab.mineralType === lab.memory.neededBoost && lab.energy > 0 && (lab.mineralAmount >= this.memory.boostNeeded || lab.mineralAmount >= lab.mineralCapacity * 0.75)) {
                switch (lab.boostCreep(this)) {
                    case OK:
                        if (lab.memory.creating) lab.memory.neededBoost = undefined; else lab.memory = undefined;
                        this.memory.requestedBoosts.shift();
                        if (this.memory.requestedBoosts.length) {
                            this.memory.boostNeeded = this.memory.requestedBoosts[0];
                            lab.memory.neededBoost = this.memory.requestedBoosts[0];
                            lab.memory.active = true;
                            lab.memory.requested = Game.time;
                        }
                        this.say(ICONS.greenCheck);
                        return this.shibMove(lab);
                    case ERR_NOT_IN_RANGE:
                        this.say(ICONS.boost);
                        this.shibMove(lab);
                        return true;
                    case ERR_NOT_ENOUGH_RESOURCES:
                        this.say(ICONS.boost);
                        this.shibMove(lab);
                        return true;
                }
            } else {
                this.shibMove(lab);
            }
        }
        return true;
    }
};

Creep.prototype.recycleCreep = function () {
    let spawn = this.pos.findClosestByRange(FIND_MY_SPAWNS);
    if (!this.memory.overlord) this.memory.overlord = Memory.myRooms[0];
    if (!spawn) return this.shibMove(new RoomPosition(25, 25, this.memory.overlord), {range: 20});
    // Clear role to queue replacement if needed
    this.memory.role = undefined;
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
    if (!this.memory.fleeTo) this.memory.fleeTo = _.sample(_.filter(Memory.myRooms, (r) => r.name !== this.memory.overlord)).name;
};

function getBoostAmount(room, boost) {
    let boostInRoomStructures = _.sum(room.lookForAtArea(LOOK_STRUCTURES, 0, 0, 49, 49, true), (s) => {
        if (s['structure'] && s['structure'].store) {
            return s['structure'].store[boost] || 0;
        } else if (s['structure'] && s['structure'].mineralType === boost) {
            return s['structure'].mineralAmount || 0;
        } else {
            return 0;
        }
    });
    let boostInRoomCreeps = _.sum(room.lookForAtArea(LOOK_CREEPS, 0, 0, 49, 49, true), (s) => {
        if (s['creep'] && s['creep'].store) {
            return s['creep'].store[boost] || 0;
        } else {
            return 0;
        }
    });
    return boostInRoomCreeps + boostInRoomStructures;
}

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

/////////////////////////////////////////////
/// COMBAT STUFF/////////////////////////////
/////////////////////////////////////////////

// Get attack/heal power and account for boosts
Creep.prototype.abilityPower = function (ignoreTough = undefined) {
    let attackPower = 0;
    let healPower = 0;
    for (let part of this.body) {
        if (!part.hits) continue;
        if (part.boost) {
            if (part.type === ATTACK) {
                attackPower += ATTACK_POWER * BOOSTS[part.type][part.boost][part.type];
            } else if (part.type === RANGED_ATTACK) {
                attackPower += RANGED_ATTACK_POWER * BOOSTS[part.type][part.boost][part.type];
            } else if (part.type === HEAL) {
                healPower += HEAL_POWER * BOOSTS[part.type][part.boost][part.type];
            } else if (part.type === TOUGH && !ignoreTough && this.getActiveBodyparts(HEAL)) {
                healPower += HEAL_POWER * BOOSTS[part.type][part.boost][part.type];
            }
        } else {
            if (part.type === ATTACK) {
                attackPower += ATTACK_POWER;
            } else if (part.type === RANGED_ATTACK) {
                attackPower += RANGED_ATTACK_POWER;
            } else if (part.type === HEAL) {
                healPower += HEAL_POWER;
            }
        }
    }
    return {attack: attackPower, defense: healPower};
};

Creep.prototype.findClosestEnemy = function (barriers = false, ignoreBorder = false) {
    let enemy, filter;
    let worthwhileStructures = this.room.hostileStructures.length > 0;
    if (!this.room.hostileCreeps.length && !worthwhileStructures) return undefined;
    let barriersPresent = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART).length;
    let hostileRoom = this.room.controller && !this.room.controller.my && ((this.room.controller.owner && !_.includes(FRIENDLIES, this.room.controller.owner.username)) || (this.room.controller.reservation && !_.includes(FRIENDLIES, this.room.controller.reservation.username)));
    // Towers die first (No ramps)
    if (hostileRoom) {
        filter = {filter: (c) => c.structureType === STRUCTURE_TOWER && (!c.pos.checkForRampart() || c.pos.checkForRampart().hits < 50000) && c.isActive()};
        if (!barriersPresent) enemy = this.pos.findClosestByRange(this.room.structures, filter); else enemy = this.pos.findClosestByPath(this.room.structures, filter);
        if (enemy) {
            this.memory.target = enemy.id;
            return enemy;
        }
    }
    // Find armed creeps to kill (Outside Ramps)
    filter = {
        filter: (c) => ((c.getActiveBodyparts(ATTACK) >= 1 || c.getActiveBodyparts(RANGED_ATTACK) >= 1 || c.getActiveBodyparts(HEAL) >= 1) &&
            (ignoreBorder || (c.pos.x < 49 && c.pos.x > 0 && c.pos.y < 49 && c.pos.y > 0)) && (!c.pos.checkForRampart() || c.pos.checkForRampart().hits < 50000))
    };
    if (!barriersPresent) enemy = this.pos.findClosestByRange(this.room.hostileCreeps, filter); else enemy = this.pos.findClosestByPath(this.room.hostileCreeps, filter);
    if (enemy) {
        this.memory.target = enemy.id;
        return enemy;
    }
    // Kill spawns (No ramps)
    if (hostileRoom) {
        filter = {filter: (c) => c.structureType === STRUCTURE_SPAWN && (!c.pos.checkForRampart() || c.pos.checkForRampart().hits < 50000) && c.isActive()};
        if (!barriersPresent) enemy = this.pos.findClosestByRange(this.room.hostileStructures, filter); else enemy = this.pos.findClosestByPath(this.room.hostileStructures, filter);
        if (enemy) {
            this.memory.target = enemy.id;
            return enemy;
        }
    }
    // Find unarmed creeps (Outside Ramps)
    filter = {
        filter: (c) => (ignoreBorder || (c.pos.x < 49 && c.pos.x > 0 && c.pos.y < 49 && c.pos.y > 0) && (!c.pos.checkForRampart() || c.pos.checkForRampart().hits < 50000))
    };
    if (!barriersPresent) enemy = this.pos.findClosestByRange(this.room.hostileCreeps, filter); else enemy = this.pos.findClosestByPath(this.room.hostileCreeps, filter);
    if (enemy) {
        this.memory.target = enemy.id;
        return enemy;
    }
    // Towers/spawns die first (Ramps)
    if (hostileRoom) {
        filter = {filter: (c) => c.structureType === STRUCTURE_TOWER && c.isActive()};
        if (!barriersPresent) enemy = this.pos.findClosestByRange(this.room.structures, filter); else enemy = this.pos.findClosestByPath(this.room.structures, filter);
        if (enemy) {
            this.memory.target = enemy.id;
            return enemy;
        }
        filter = {filter: (c) => c.structureType === STRUCTURE_SPAWN && c.isActive()};
        if (!barriersPresent) enemy = this.pos.findClosestByRange(this.room.hostileStructures, filter); else enemy = this.pos.findClosestByPath(this.room.hostileStructures, filter);
        if (enemy) {
            this.memory.target = enemy.id;
            return enemy;
        }
    }
    // If friendly room leave other structures alone
    if (hostileRoom) {
        filter = {filter: (c) => c.structureType !== STRUCTURE_CONTROLLER && c.structureType !== STRUCTURE_ROAD && c.structureType !== STRUCTURE_WALL && c.structureType !== STRUCTURE_RAMPART && c.structureType !== STRUCTURE_CONTAINER && c.structureType !== STRUCTURE_POWER_BANK && c.structureType !== STRUCTURE_KEEPER_LAIR && c.structureType !== STRUCTURE_EXTRACTOR && c.structureType !== STRUCTURE_PORTAL};
        if (!barriersPresent) enemy = this.pos.findClosestByRange(this.room.structures, filter); else enemy = this.pos.findClosestByPath(this.room.structures, filter);
        if (enemy) {
            this.memory.target = enemy.id;
            return enemy;
        } else if (barriers && this.findClosestBarrier()) {
            enemy = this.findClosestBarrier();
            this.memory.target = enemy.id;
            return enemy;
        }
    }
    return false;
};

Creep.prototype.findClosestBarrier = function (walls = true) {
    let barriers;
    if (walls) {
        barriers = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART);
    } else {
        barriers = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_RAMPART);
    }
    let lowestInArea = _.sortBy(this.pos.findInRange(barriers, 6), 'hits')[0];
    if (lowestInArea && !PathFinder.search(this.pos, lowestInArea.pos).incomplete) return lowestInArea;
    return this.pos.findClosestByRange(barriers);
};

Creep.prototype.attackHostile = function (hostile) {
    delete this.memory.target;
    let moveTarget = hostile;
    let inRangeRampart = this.pos.findClosestByPath(this.room.structures, {filter: (r) => r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() && !r.pos.checkForConstructionSites() && (!r.pos.checkForCreep() || (r.pos.x === this.pos.x && r.pos.y === this.pos.y)) && r.my && r.pos.getRangeTo(hostile) <= 1});
    if (inRangeRampart) moveTarget = inRangeRampart;
    // If has a range part use it
    if (this.getActiveBodyparts(RANGED_ATTACK) && this.pos.getRangeTo(hostile) <= 3) this.rangedAttack(hostile);
    // Attack
    switch (this.attack(hostile)) {
        case OK:
            this.memory.lastRange = undefined;
            this.memory.kiteCount = undefined;
            this.shibMove(moveTarget, {ignoreCreeps: false, range: 0});
            return true;
        case ERR_NOT_IN_RANGE:
            if (this.getActiveBodyparts(HEAL) && this.hits < this.hitsMax) this.heal(this);
            let range = this.pos.getRangeTo(hostile);
            let lastRange = this.memory.lastRange || range;
            this.memory.lastRange = range;
            if (hostile instanceof Creep && Math.random() > 0.3 && range >= lastRange && range <= 4 && hostile.getActiveBodyparts(RANGED_ATTACK) && this.hits < this.hitsMax * 0.95) {
                this.memory.kiteCount = this.memory.kiteCount || 1;
                if (this.memory.kiteCount > 5 || this.hits < this.hitsMax * 0.5) {
                    this.fleeHome(true);
                } else {
                    this.shibKite(6);
                }
            } else {
                this.shibMove(moveTarget, {ignoreCreeps: false, range: 1});
            }
            return true;
    }
};

Creep.prototype.healMyCreeps = function () {
    let myCreeps = this.room.find(FIND_MY_CREEPS, {
        filter: function (object) {
            return object.hits < object.hitsMax;
        }
    });
    if (myCreeps.length > 0) {
        this.say(ICONS.hospital, true);
        this.shibMove(myCreeps[0]);
        if (this.pos.getRangeTo(myCreeps[0]) <= 1) {
            this.heal(myCreeps[0]);
        } else {
            this.rangedHeal(myCreeps[0]);
        }
        return true;
    }
    return false;
};

Creep.prototype.healInRange = function () {
    if (this.hits < this.hitsMax) return this.heal(this);
    let healCreeps = _.filter(this.room.creeps, (c) => (_.includes(FRIENDLIES, c.owner.username) || c.my) && c.hits < c.hitsMax && this.pos.getRangeTo(c) <= 3);
    if (healCreeps.length > 0) {
        if (this.pos.isNearTo(healCreeps[0])) return this.heal(healCreeps[0]); else return this.rangedHeal(healCreeps[0]);
    }
    return false;
};

Creep.prototype.healAllyCreeps = function () {
    let allyCreep = this.pos.findClosestByPath(_.filter(this.room.creeps, (c) => (_.includes(FRIENDLIES, c.owner.username) || c.my) && c.hits < c.hitsMax))
    if (allyCreep) {
        this.say(ICONS.hospital, true);
        this.shibMove(allyCreep);
        let range = this.pos.getRangeTo(allyCreep);
        if (range <= 1) {
            this.heal(allyCreep);
        } else if (range <= 3) {
            this.rangedHeal(allyCreep);
        }
        return true;
    }
    return false;
};

Creep.prototype.moveToHostileConstructionSites = function (creepCheck = false) {
    // No sites
    if (!this.room.constructionSites.length || (creepCheck && this.room.hostileCreeps.length)) return false;
    // Friendly room
    if (this.room.controller && ((this.room.controller.owner && _.includes(FRIENDLIES, this.room.controller.owner.username)) || (this.room.controller.reservation && _.includes(FRIENDLIES, this.room.controller.reservation.username)) || this.room.controller.safeMode)) return false;
    let constructionSite = this.pos.findClosestByRange(this.room.constructionSites, {filter: (s) => !s.pos.checkForRampart() && !_.includes(FRIENDLIES, s.owner.username) && !s.my && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER});
    if (constructionSite) {
        if (constructionSite.pos.x === this.pos.x && constructionSite.pos.y === this.pos.y) return this.moveRandom();
        this.shibMove(constructionSite, {range: 0, ignoreCreeps: false});
        return true;
    }
    return false;
};

Creep.prototype.handleMilitaryCreep = function (barrier = false, rampart = true, ignoreBorder = false, unArmedFirst = false) {
    // Safemode check
    if (this.room.user && this.room.user !== MY_USERNAME && this.room.controller && this.room.controller.safeMode) return false;
    // Set target
    let hostile = this.findClosestEnemy(barrier, ignoreBorder, unArmedFirst);
    if (hostile && hostile.pos.checkForRampart()) {
        hostile = hostile.pos.checkForRampart();
        this.memory.target = hostile.id;
    }
    // Flee home if you have no parts
    if ((!this.getActiveBodyparts(HEAL) || this.getActiveBodyparts(HEAL) === 1) && !this.getActiveBodyparts(ATTACK) && !this.getActiveBodyparts(RANGED_ATTACK)) return this.fleeHome(true);
    // If target fight
    if (hostile && hostile.pos.roomName === this.pos.roomName && (this.getActiveBodyparts(ATTACK) || this.getActiveBodyparts(RANGED_ATTACK))) {
        // Heal if needed
        if (!this.getActiveBodyparts(ATTACK) && this.getActiveBodyparts(HEAL) && this.hits < this.hitsMax) this.heal(this);
        // Fight from rampart
        if (rampart && this.fightRampart(hostile)) return true;
        // Melee attacker
        if (this.getActiveBodyparts(ATTACK) && this.attackHostile(hostile)) return true;
        // Ranged attacker
        return !!(this.getActiveBodyparts(RANGED_ATTACK) && this.fightRanged(hostile));
    } else if (_.filter(this.room.friendlyCreeps, (c) => c.hits < c.hitsMax).length && this.getActiveBodyparts(HEAL)) {
        if (this.healMyCreeps()) return true;
        if (this.healAllyCreeps()) return true;
    }
    // If no target or heals stomp sites
    return !!this.moveToHostileConstructionSites();
};

Creep.prototype.scorchedEarth = function () {
    // Safemode check
    if (this.room.user && this.room.user !== MY_USERNAME && this.room.controller && this.room.controller.safeMode) return false;
    // Friendly check
    if (this.room.user && _.includes(FRIENDLIES, this.room.user)) return false;
    // Set target
    let hostile = this.pos.findClosestByRange(_.filter(this.room.structures, (s) =>
        s.structureType !== STRUCTURE_POWER_BANK && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_KEEPER_LAIR));
    // If target fight
    if (hostile && hostile.pos.roomName === this.pos.roomName && (this.getActiveBodyparts(ATTACK) || this.getActiveBodyparts(RANGED_ATTACK))) {
        if (this.getActiveBodyparts(ATTACK)) {
            switch (this.attack(hostile)) {
                case OK:
                    break;
                case ERR_NOT_IN_RANGE:
                    if (this.getActiveBodyparts(RANGED_ATTACK)) this.rangedMassAttack();
                    this.shibMove(hostile);
            }
        } else if (this.getActiveBodyparts(RANGED_ATTACK)) {
            if (hostile.structureType !== STRUCTURE_ROAD && hostile.structureType !== STRUCTURE_WALL && hostile.structureType !== STRUCTURE_CONTAINER) this.rangedMassAttack(); else this.rangedAttack(hostile);
            let range = 0;
            if (hostile.pos.checkForImpassible()) range = 1;
            this.shibMove(hostile, {range: range});
        }
    } else {
        this.memory.scorchedTarget = undefined;
    }
};

Creep.prototype.waitRampart = function () {
    this.say('waitRampart');
    let creep = this;
    let structure = this.pos.findClosestByPath(this.room.structures, {
        filter: function (object) {
            if (object.structureType !== STRUCTURE_RAMPART || object.pos.lookFor(LOOK_CREEPS).length !== 0) {
                return false;
            }
            return creep.pos.getRangeTo(object) > 0;
        }
    });
    if (!structure) {
        this.moveRandom();
        return true;
    }
    this.shibMove(structure);
    return true;
};

Creep.prototype.fightRampart = function (hostile = undefined) {
    // Set target or used preset
    let target = hostile || this.findClosestEnemy(false, true);
    // If no targets or no body parts return
    if (!target || !target.pos || (!this.getActiveBodyparts(ATTACK) && !this.getActiveBodyparts(RANGED_ATTACK))) return false;
    // Rampart assignment
    let position;
    if (this.memory.assignedRampart) position = Game.getObjectById(this.memory.assignedRampart);
    // Find rampart
    if (!this.memory.assignedRampart || (Game.time % 3 === 0)) {
        delete this.memory.assignedRampart;
        let range = 1;
        if (this.getActiveBodyparts(RANGED_ATTACK)) range = 3;
        position = target.pos.findInRange(this.room.structures, range,
            {filter: (r) => r.my && r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() && !_.filter(this.room.creeps, (c) => c.memory && c.memory.assignedRampart === r.id && c.id !== this.id).length && (!r.pos.checkForCreep() || (r.pos.x === this.pos.x && r.pos.y === this.pos.y))})[0];
        if (!position) {
            position = target.pos.findClosestByPath(this.room.structures,
                {filter: (r) => r.my && r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() && !_.filter(this.room.creeps, (c) => c.memory && c.memory.assignedRampart === r.id && c.id !== this.id).length && (!r.pos.checkForCreep() || (r.pos.x === this.pos.x && r.pos.y === this.pos.y))});
        }
    }
    // If no rampart or rampart too far away return
    if (!position || position.pos.getRangeTo(target) > 25) return false;
    this.memory.assignedRampart = position.id;
    if (this.getActiveBodyparts(RANGED_ATTACK) && 1 < this.pos.getRangeTo(target) <= 3) {
        let targets = this.pos.findInRange(this.room.creeps, 3, {filter: (c) => _.includes(Memory._threatList, c.owner.username) || c.owner.username === 'Invader'});
        if (targets.length > 1) {
            this.rangedMassAttack();
        } else {
            this.rangedAttack(target);
        }
    }
    if (this.pos.getRangeTo(position) > 0) {
        this.shibMove(Game.getObjectById(this.memory.assignedRampart), {range: 0});
        return true;
    }
    if (this.pos.getRangeTo(target) <= 1 && this.getActiveBodyparts(ATTACK)) {
        this.attack(target)
    }
    return true;
};

Creep.prototype.flee = function (target, range = 6) {
    if (this.pos.getRangeTo(target) >= range) return;
    let direction = this.pos.getDirectionTo(target);
    direction = (direction + 3) % 8 + 1;
    let pos = this.pos.getAdjacentPosition(direction);
    let terrain = pos.lookFor(LOOK_TERRAIN)[0];
    if (terrain === 'wall') {
        direction = (Math.random() * 8) + 1;
    }
    this.move(direction);
    return true;
};

Creep.prototype.fightRanged = function (target) {
    let range = this.pos.getRangeTo(target);
    let lastRange = this.memory.lastRange || range;
    this.memory.lastRange = range;
    let targets = this.pos.findInRange(this.room.hostileCreeps, 3);
    let allies = this.pos.findInRange(this.room.friendlyCreeps, 4, {filter: (c) => !c.my});
    let partner = this.pos.findInRange(this.room.friendlyCreeps, 4, {filter: (c) => c.my && c.memory.role === 'longbow' && c.hits >= c.hitsMax * 0.5 && c.id !== this.id})[0];
    let moveTarget = target;
    let inRangeRampart = this.pos.findClosestByPath(this.room.structures, {filter: (r) => r.my && r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() && !r.pos.checkForConstructionSites() && (!r.pos.checkForCreep() || (r.pos.x === this.pos.x && r.pos.y === this.pos.y)) && r.my && r.pos.getRangeTo(target) <= 3});
    if (inRangeRampart) moveTarget = inRangeRampart;
    if (range <= 3) {
        let moveRange = 1;
        if (target instanceof Creep) {
            if ((targets.length > 1 || range === 1) && !allies.length) {
                this.say('BIG PEW!', true);
                this.rangedMassAttack();
            } else {
                this.say('PEW!', true);
                this.rangedAttack(target);
            }
            // Handle melee attackers
            if (target.getActiveBodyparts(ATTACK)) {
                moveRange = 3;
                if (range < 3 && !this.pos.checkForRampart() && this.abilityPower().defense < target.abilityPower().attack) {
                    this.say('PEW!', true);
                    this.rangedAttack(target);
                    return this.shibKite(3);
                }
            }
            if (inRangeRampart) {
                this.shibMove(inRangeRampart, {range: 0, ignoreCreeps: false});
            } else {
                if (!partner) {
                    this.shibMove(target, {range: moveRange, ignoreCreeps: false});
                } else {
                    if (this.getActiveBodyparts(HEAL) && this.pos.getRangeTo(partner) <= 1 && this.hits / this.hitsMax > partner.hits / partner.hitsMax) this.heal(partner);
                    this.shibMove(partner, {range: 0, ignoreCreeps: false});
                }
            }
        } else {
            this.say('PEW!', true);
            if (range === 1 && !allies.length) this.rangedMassAttack();
            if (range > 1) this.rangedAttack(target);
            this.shibMove(moveTarget, {
                range: 0,
                ignoreCreeps: false
            });
        }
        return true;
    } else {
        let opportunity = _.min(targets, 'hits');
        if (opportunity) this.rangedAttack(opportunity);
        if (targets.length > 1 && !allies.length) this.rangedMassAttack();
        // If closing range do not advance
        if (target instanceof Creep && target.getActiveBodyparts(ATTACK) && range === 4 && lastRange === 6) return true;
        // Otherwise move to attack
        let moveRange = 3;
        if (target instanceof Creep && !target.getActiveBodyparts(ATTACK)) moveRange = 1; else if (range >= lastRange) moveRange = 1;
        if (inRangeRampart) moveRange = 0;
        if (this.pos.findInRange(FIND_CREEPS, 1).length > 0) {
            this.shibMove(moveTarget, {ignoreCreeps: false, range: moveRange, ignoreRoads: true});
        } else {
            this.shibMove(moveTarget, {ignoreCreeps: false, range: moveRange, ignoreRoads: true});
        }
        return true;
    }
};

Creep.prototype.attackInRange = function () {
    if (!this.room.hostileCreeps.length || !this.getActiveBodyparts(RANGED_ATTACK)) return false;
    let hostile;
    let leader = Game.getObjectById(this.memory.leader);
    if (leader) hostile = Game.getObjectById(leader.memory.target) || Game.getObjectById(leader.memory.scorchedTarget) || this.findClosestEnemy(false);
    if (!hostile || hostile.pos.getRangeTo(this) > 3) hostile = this.findClosestEnemy(false);
    let range = this.pos.getRangeTo(hostile);
    let targets = this.pos.findInRange(this.room.creeps, 3, {filter: (c) => _.includes(Memory._threatList, c.owner.username) || c.owner.username === 'Invader'});
    let allies = this.pos.findInRange(this.room.creeps, 3, {filter: (c) => _.includes(FRIENDLIES, c.owner.username) && !c.my});
    if (range <= 3) {
        if (targets.length > 1 && !allies.length) {
            this.rangedMassAttack();
        } else {
            if (range <= 1 && !allies.length) this.rangedMassAttack();
            if (range > 1) this.rangedAttack(hostile);
        }
        return true;
    } else {
        let injured = _.min(this.pos.findInRange(_.filter(this.room.creeps, (c) => c.hits < c.hitsMax && _.includes(FRIENDLIES, c.owner.username)), 3), 'hits');
        if (injured && this.getActiveBodyparts(HEAL) && this.hits === this.hitsMax) {
            this.rangedHeal(injured);
        } else {
            let opportunity = _.min(_.filter(this.pos.findInRange(this.room.creeps, 3, {filter: (c) => _.includes(Memory._threatList, c.owner.username) || c.owner.username === 'Invader'})), 'hits');
            if (opportunity) this.rangedAttack(opportunity);
            if (targets.length > 1 && !allies.length) this.rangedMassAttack();
        }
    }
};

Creep.prototype.moveToStaging = function () {
    if (!this.memory.other || !this.memory.other.waitFor || this.memory.stagingComplete || this.memory.other.waitFor === 1 || this.ticksToLive <= 250 || !this.memory.destination) return false;
    // Recycle if operation canceled
    if (!Memory.destinations[this.memory.destination]) return this.memory.recycle = true;
    if (this.memory.stagingRoom === this.room.name) {
        if (this.findClosestEnemy()) return this.handleMilitaryCreep(false, true);
        this.shibMove(new RoomPosition(25, 25, this.memory.stagingRoom), {range: 7});
        let inPlace = _.filter(this.room.creeps, (creep) => creep.memory && creep.memory.destination === this.memory.destination);
        if (inPlace.length >= this.memory.other.waitFor || this.ticksToLive <= 250) {
            this.memory.stagingComplete = true;
            if (!Memory.destinations[this.memory.destination].lastWave || Memory.destinations[this.memory.destination].lastWave + 50 < Game.time) {
                let waves = Memory.destinations[this.memory.destination].waves || 0;
                Memory.destinations[this.memory.destination].waves = waves + 1;
                Memory.destinations[this.memory.destination].lastWave = Game.time;
            }
            return false;
        } else {
            if (this.pos.checkForRoad()) {
                this.moveRandom();
            }
            return true;
        }
    } else if (this.memory.stagingRoom) {
        this.shibMove(new RoomPosition(25, 25, this.memory.stagingRoom), {range: 6});
        return true;
    }
    let alreadyStaged = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.destination && creep.memory.stagingRoom)[0];
    if (alreadyStaged) {
        this.memory.stagingRoom = alreadyStaged.memory.stagingRoom;
        this.shibMove(alreadyStaged, {repathChance: 0.5});
        return true;
    } else {
        let route = this.shibRoute(this.memory.destination);
        let routeLength = route.length;
        if (routeLength <= 5) {
            this.memory.stagingRoom = this.memory.overlord;
            this.shibMove(new RoomPosition(25, 25, this.memory.stagingRoom), {range: 19});
            return true;
        }
        let stageHere = _.round(routeLength / 3);
        this.memory.stagingRoom = route[stageHere];
        this.shibMove(new RoomPosition(25, 25, this.memory.stagingRoom), {range: 19});
        return true;
    }
};

Creep.prototype.siege = function () {
    let healer = Game.getObjectById(this.memory.healer);
    if (this.room.name !== this.memory.destination) {
        if (healer && this.pos.roomName === healer.pos.roomName && this.pos.getRangeTo(healer) > 2) {
            return this.shibMove(healer, {ignoreCreeps: false});
        } else if (!this.memory.stagingComplete) {
            if (this.moveToStaging()) return;
        } else {
            return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 7});
        }
    }
    this.rangedMassAttack();
    if (this.room.controller && this.room.controller.safeMode) {
        let cache = Memory.destinations || {};
        let tick = Game.time;
        cache[Game.flags[name].pos.roomName] = {
            tick: tick,
            dDay: tick + this.room.controller.safeMode,
            type: 'pending',
        };
        Memory.destinations = cache;
        return this.memory.recycle = true;
    }
    let target;
    let alliedCreep = _.filter(this.room.creeps, (c) => !c.my && _.includes(FRIENDLIES, c.owner));
    let neighborEnemyCreep = this.pos.findInRange(_.filter(this.room.creeps, (c) => !c.my && !_.includes(FRIENDLIES, c.owner)), 1);
    if (neighborEnemyCreep.length && !neighborEnemyCreep[0].pos.checkForRampart()) {
        target = neighborEnemyCreep[0];
    }
    if (healer && (healer.fatigue > 0 || this.pos.getRangeTo(healer) > 1) && this.pos.x !== 48 && this.pos.x !== 1 && this.pos.y !== 48 && this.pos.y !== 1) return;
    if (!this.room.controller.owner || (this.room.controller.owner && !_.includes(FRIENDLIES, this.room.controller.owner.username))) {
        let targetFlags = _.filter(Game.flags, (f) => f.pos.roomName === this.pos.roomName && _.startsWith(f.name, 't') && f.pos.checkForAllStructure(true).length);
        if (targetFlags.length) {
            let flag = this.pos.findClosestByPath(targetFlags);
            if (flag) {
                target = flag.pos.checkForAllStructure()[0];
                this.memory.siegeTarget = target.id;
            }
        }
        let sharedTarget = _.filter(Game.creeps, (c) => c.memory && c.memory.siegeTarget && c.memory.destination === this.memory.destination)[0];
        if (sharedTarget) target = Game.getObjectById(sharedTarget.memory.siegeTarget);
        if (!target || !target) {
            target = this.pos.findClosestByPath(this.room.hostileStructures, {filter: (s) => (s.structureType === STRUCTURE_TOWER)});
            if (target) this.memory.siegeTarget = target.id;
        }
        if (!target || !target) {
            target = this.pos.findClosestByPath(this.room.hostileStructures, {filter: (s) => (s.structureType === STRUCTURE_SPAWN)});
            if (target) this.memory.siegeTarget = target.id;
        }
        if (!target || !target) {
            target = this.pos.findClosestByPath(this.room.hostileStructures, {filter: (s) => (s.structureType === STRUCTURE_EXTENSION)});
            if (target) this.memory.siegeTarget = target.id;
        }
        if (!target || !target) {
            target = this.pos.findClosestByPath(this.room.hostileStructures, {filter: (s) => (s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_LINK && s.structureType !== STRUCTURE_STORAGE && s.structureType !== STRUCTURE_TERMINAL && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_CONTROLLER)});
            if (target) this.memory.siegeTarget = target.id;
        }
        if (!target || !target) {
            target = this.findClosestBarrier();
        }
        if (!target) {
            let cache = Memory.destinations || {};
            cache[this.pos.roomName] = {
                tick: Game.time,
                type: 'hold',
                level: 1
            };
            Memory.destinations = cache;
            if (!this.pos.findInRange(alliedCreep, 3)[0] && this.getActiveBodyparts(RANGED_ATTACK) > 0) this.rangedMassAttack();
            this.moveToHostileConstructionSites();
        } else {
            switch (this.attack(target)) {
                case ERR_NOT_IN_RANGE:
                    if (!this.pos.findInRange(alliedCreep, 3)[0] && this.getActiveBodyparts(RANGED_ATTACK) > 0) this.rangedMassAttack();
                    this.heal(this);
                    this.shibMove(target, {ignoreCreeps: true, ignoreStructures: false});
                    this.room.visual.text(ICONS.noEntry, target.pos.x, target.pos.y, {
                        align: 'left',
                        opacity: 1
                    });
                    break;
                case ERR_NO_BODYPART:
                    if (!this.pos.findInRange(alliedCreep, 3)[0] && this.getActiveBodyparts(RANGED_ATTACK) > 0) this.rangedMassAttack();
                    this.heal(this);
                    this.shibMove(target, {ignoreCreeps: true});
                    break;
                case OK:
                    if (!this.pos.findInRange(alliedCreep, 3)[0] && this.getActiveBodyparts(RANGED_ATTACK) > 0) this.rangedMassAttack();
                    this.room.visual.text(ICONS.greenCheck, target.pos.x, target.pos.y, {
                        align: 'left',
                        opacity: 1
                    });
                    return true;

            }
        }
    }
};

Creep.prototype.siegeHeal = function () {
    if (!Game.getObjectById(this.memory.healTarget) || !this.memory.healTarget) {
        if (!Game.getObjectById(this.memory.healTarget)) delete this.memory.healTarget;
        let deconstructor = _.filter(Game.creeps, (c) => (c.memory.role === 'deconstructor' || c.memory.role === 'siegeEngine') && c.memory.destination === this.memory.destination && (!c.memory.healer || !Game.getObjectById(c.memory.healer)))[0];
        if (!deconstructor) deconstructor = _.filter(Game.creeps, (c) => (c.memory.role === 'deconstructor' || c.memory.role === 'siegeEngine') && c.memory.destination === this.memory.destination)[0];
        if (deconstructor) {
            this.memory.healTarget = deconstructor.id;
            deconstructor.memory.healer = this.id;
        } else {
            return this.moveToStaging();
        }
    } else {
        let deconstructor = Game.getObjectById(this.memory.healTarget);
        let moveRange = 0;
        let ignore = true;
        if (this.pos.x === 0 || this.pos.x === 49 || this.pos.y === 0 || this.pos.y === 49) {
            moveRange = 1;
            ignore = false;
        }
        if (this.room.name !== this.memory.destination) ignore = false;
        this.shibMove(deconstructor, {range: moveRange, ignoreCreeps: ignore});
        let range = this.pos.getRangeTo(deconstructor);
        if (this.hits === this.hitsMax) {
            if (range <= 1) {
                this.heal(deconstructor);
            } else if (range > 1) this.rangedHeal(deconstructor);
        } else {
            this.heal(this);
        }
    }
};

Creep.prototype.moveRandom = function () {
    let start = Math.ceil(Math.random() * 8);
    let direction = 0;
    for (let i = start; i < start + 8; i++) {
        direction = ((i - 1) % 8) + 1;
        let pos = this.pos.getAdjacentPosition(direction);
        if (pos.isExit() || pos.checkForWall() || pos.checkForObstacleStructure() || pos.checkForCreep()) {
            continue;
        }
        break;
    }
    this.move(direction);
};

PowerCreep.prototype.moveRandom = function (onPath) {
    let start = Math.ceil(Math.random() * 8);
    let direction = 0;
    for (let i = start; i < start + 8; i++) {
        direction = ((i - 1) % 8) + 1;
        let pos = this.pos.getAdjacentPosition(direction);
        if (pos.isExit()) {
            continue;
        }
        if (onPath && !pos.inPath()) {
            continue;
        }
        if (pos.checkForWall()) {
            continue;
        }
        if (pos.checkForObstacleStructure()) {
            continue;
        }
        break;
    }
    this.move(direction);
};

Creep.prototype.borderHump = function () {
    let damagedDrainer = _.min(_.filter(this.room.creeps, (creep) => creep.memory && creep.memory.role === 'drainer' && creep.id !== this.id && this.pos.getRangeTo(creep) <= 5 && creep.hits < creep.hitsMax), 'hits');
    if (this.hits < this.hitsMax * 0.9 && !this.getActiveBodyparts(TOUGH) && this.room.name === this.memory.destination) {
        this.memory.noDrain = 0;
        let exit = this.pos.findClosestByRange(FIND_EXIT);
        return this.shibMove(exit, {ignoreCreeps: false, range: 0});
    } else if (damagedDrainer.id) {
        this.memory.noDrain = 0;
        this.heal(damagedDrainer);
        this.shibMove(damagedDrainer, {range: 1})
    } else if (this.hits === this.hitsMax && this.room.name === this.memory.destination) {
        let noDrainCount = this.memory.noDrain || 0;
        this.memory.noDrain = noDrainCount + 1;
        // If room is not drainable mark as such and recycle
        if (this.memory.noDrain >= 15) {
            let cache = Memory.destinations || {};
            cache[this.room.name] = {
                tick: Game.time,
                type: 'attack',
                priority: 1,
            };
            Memory.destinations = cache;
            this.room.cacheRoomIntel(true);
            Memory.roomCache[this.room.name].noDrain = true;
            this.memory.recycle = true;
        }
        this.heal(this);
        this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 15})
    } else if (this.hits < this.hitsMax && this.room.name !== this.memory.destination) {
        this.heal(this);
    } else if (this.room.name !== this.memory.destination) return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 23});
};

Creep.prototype.fleeHome = function (force = false) {
    if (this.hits < this.hitsMax) force = true;
    if (this.memory.overlord === this.room.name && !this.memory.runCooldown) return false;
    if (!force && !this.memory.runCooldown && !Memory.roomCache[this.room.name].threatLevel && this.hits === this.hitsMax) return false;
    let cooldown = this.memory.runCooldown || Game.time + 100;
    this.memory.runCooldown = cooldown;
    if (this.room.name !== this.memory.overlord) {
        this.say('RUN!', true);
        this.memory.runCooldown = Game.time + 25;
        this.goToHub(this.memory.overlord, true);
    } else if (Game.time <= cooldown) {
        if (this.shibKite()) return;
        this.memory.runCooldown = cooldown;
        this.idleFor(cooldown - Game.time);
    } else {
        delete this.memory.runCooldown;
    }
    return true;
};

Creep.prototype.canIWin = function (range = 50) {
    if (!this.room.hostileCreeps.length || this.room.name === this.memory.overlord) return true;
    let hostilePower = 0;
    let healPower = 0;
    let meleeOnly = _.filter(this.room.hostileCreeps, (c) => c.getActiveBodyparts(RANGED_ATTACK) && this.pos.getRangeTo(c) <= range).length === 0;
    let armedHostiles = _.filter(this.room.hostileCreeps, (c) => (c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK)) && this.pos.getRangeTo(c) <= range);
    for (let i = 0; i < armedHostiles.length; i++) {
        if (armedHostiles[i].getActiveBodyparts(HEAL)) {
            hostilePower += armedHostiles[i].abilityPower().defense * 0.5;
            healPower += armedHostiles[i].abilityPower().defense;
        }
        hostilePower += armedHostiles[i].abilityPower().attack;
    }
    let alliedPower = 0;
    let armedFriendlies = _.filter(this.room.friendlyCreeps, (c) => c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK) && this.pos.getRangeTo(c) <= range);
    for (let i = 0; i < armedFriendlies.length; i++) {
        if (armedFriendlies[i].getActiveBodyparts(HEAL)) alliedPower += armedFriendlies[i].abilityPower().defense * 0.5;
        alliedPower += armedFriendlies[i].abilityPower().attack;
    }
    if (!Memory.roomCache[this.room.name]) this.room.cacheRoomIntel(true);
    Memory.roomCache[this.room.name].hostilePower = hostilePower;
    Memory.roomCache[this.room.name].friendlyPower = alliedPower;
    if (this.getActiveBodyparts(RANGED_ATTACK) && meleeOnly && alliedPower > healPower) return true;
    return !hostilePower || hostilePower * 1.1 <= alliedPower || this.pos.checkForRampart();
};

Creep.prototype.findDefensivePosition = function (target) {
    if (this.id === target.id && this.room.hostileCreeps.length) target = this.pos.findClosestByRange(this.room.hostileCreeps);
    if (target) {
        if (!this.memory.assignedRampart) {
            let bestRampart = target.pos.findClosestByPath(this.room.structures, {filter: (r) => r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() && !r.pos.checkForConstructionSites() && (r.pos.lookFor(LOOK_CREEPS).length === 0 || (r.pos.x === this.pos.x && r.pos.y === this.pos.y)) && r.my});
            if (bestRampart) {
                this.memory.assignedRampart = bestRampart.id;
                if (bestRampart.pos !== this.pos) {
                    this.shibMove(bestRampart, {range: 0});
                }
            }
        } else {
            this.shibMove(Game.getObjectById(this.memory.assignedRampart), {range: 0, ignorethiss: false});
        }
    }
}