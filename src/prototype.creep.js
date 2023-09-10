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
        if (this.memory.idle <= Game.time || (this.ticksToLive >= 1485 || this.hasActiveBodyparts(CLAIM)) || this.room.hostileCreeps.length) {
            delete this.idle;
            delete this.memory.idle;
            delete this.memory.idleSet;
            return 0;
        }
        // Handle flee if hostile is gone
        if (this.memory.runCooldown && this.memory.ranFrom && !INTEL[this.memory.ranFrom].numberOfHostiles) {
            delete this.idle;
            delete this.memory.idle;
            delete this.memory.ranFrom;
            delete this.memory.runCooldown;
            return 0;
        }
        if (!this.memory.idleSet) {
            if (this.memory.other.stationary) this.memory.idleSet = true;
            else if ((this.pos.checkForRoad() || this.pos.checkForContainer()) && !this.memory.military && this.memory.role !== 'stationaryHarvester' && this.memory.role !== 'mineralHarvester' && this.memory.role !== 'remoteHarvester') {
                return this.moveRandom();
            } else if (this.pos.getRangeTo(this.pos.findClosestByRange(FIND_SOURCES)) === 1 && this.memory.role !== 'stationaryHarvester' && this.memory.role !== 'mineralHarvester' && this.memory.role !== 'remoteHarvester') {
                return this.moveRandom();
            } else if (this.pos.getRangeTo(this.pos.findClosestByRange(FIND_EXIT)) <= 1) return this.shibMove(new RoomPosition(25, 25, this.room.name), {range: 15})
            else this.memory.idleSet = true;
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

Creep.prototype.idleFor = function (ticks = 0) {
    // No idling in SK rooms
    if (INTEL[this.room.name] && INTEL[this.room.name].sk) return false;
    if (this.hits < this.hitsMax && this.hasActiveBodyparts(HEAL)) return this.heal(this);
    if (ticks > 0) {
        this.idle = Game.time + ticks;
    } else {
        delete this.idle;
    }
};

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
 * Creep method optimizations "getActiveBodyparts"
 */
Creep.prototype.getActiveBodyparts = function (type) {
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
 * Fast check if bodypart exists
 */
Creep.prototype.hasActiveBodyparts = function (type) {
    for (let i = this.body.length; i-- > 0;) {
        if (this.body[i].hits > 0) {
            if (this.body[i].type === type) {
                return true;
            }
        } else break;
    }
    return false;
};

Creep.prototype.wrongRoom = function () {
    if (this.memory.overlord && this.pos.roomName !== this.memory.overlord) {
        this.shibMove(new RoomPosition(25, 25, this.memory.overlord), {range: 23});
        return true;
    }
};

Creep.prototype.renewalCheck = function (target = 1200, force = false) {
    if (!this.memory.other.spawnedLevel) this.memory.other.spawnedLevel = Game.rooms[this.memory.overlord].level;
    if (this.ticksToLive >= target) {
        delete this.memory.boostAttempt;
        delete this.memory.renewingTarget;
        return delete this.memory.renewing;
    }
    let spawn = _.filter(this.room.impassibleStructures, (s) => s.structureType === STRUCTURE_SPAWN && !s.spawning)[0];
    if (spawn) {
        switch (spawn.renewCreep(this)) {
            case OK:
                if (this.store[RESOURCE_ENERGY] > 0) this.transfer(spawn, RESOURCE_ENERGY);
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
    } else {
        delete this.memory.renewing;
        return false;
    }
};

Creep.prototype.findSource = function (ignoreOthers = false) {
    let source = _.find(this.room.sources, (s) => !_.find(Game.creeps, (c) => c.id !== this.id && c.memory.role === this.memory.role && c.memory.source === s.id));
    if (ignoreOthers) source = _.sample(this.room.sources);
    if (source) {
        this.memory.source = source.id;
        return source.id;
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
    if (this.hits < this.hitsMax) {
        this.goToHub();
        return true;
    }
    if (this.room.controller || (INTEL[this.room.name] && !INTEL[this.room.name].sk)) return false;
    // handle safe SK movement
    let range = 6;
    if (this.memory.destination && this.memory.destination === this.room.name) range = 8;
    let lair = this.pos.findClosestByRange(this.room.impassibleStructures, {filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR && s.ticksToSpawn <= 15 && s.pos.getRangeTo(this) < range});
    let SK = this.pos.findClosestByRange(this.room.creeps, {filter: (c) => c.owner.username === 'Source Keeper' && c.pos.getRangeTo(this) < range});
    if (lair || SK) {
        this.memory.fledSK = Game.time;
        if (SK) {
            this.shibKite(range + 2, SK);
            return true;
        } else if (lair) {
            this.shibKite(range + 2, lair);
            return true;
        }
        // Handle invader cores in sk
        if (_.filter(this.room.impassibleStructures, (s) => s.structureType === STRUCTURE_INVADER_CORE)[0]) {
            return this.suicide();
        }
    } else if (this.memory.fledSK) {
        if (this.memory.fledSK + 15 <= Game.time) this.memory.fledSK = undefined; else this.idleFor(16);
        return true;
    }
}

Creep.prototype.opportunisticRepair = function () {
    if (!this.hasActiveBodyparts(WORK)) return false;
    try {
        let object = _.filter(this.room.lookForAtArea(LOOK_STRUCTURES, this.pos.y - 3, this.pos.x - 3, this.pos.y + 3, this.pos.x + 3, true), (s) => [STRUCTURE_ROAD, STRUCTURE_RAMPART, STRUCTURE_WALL, STRUCTURE_CONTAINER].includes(s.structure.structureType) && s.structure.hits < s.structure.hitsMax * 0.75)
        if (object && object.length) {
            this.say("Repairman!", true)
            this.repair(_.sample(object).structure);
        }
    } catch (e) {
    }
};

Creep.prototype.opportunisticFill = function () {
    // Fill nearby energy structures as you pass
    if (!this.store[RESOURCE_ENERGY]) return false;
    try {
        let energyStructure = _.find(this.room.lookForAtArea(LOOK_STRUCTURES, this.pos.y - 1, this.pos.x - 1, this.pos.y + 1, this.pos.x + 1, true), (s) => [STRUCTURE_EXTENSION, STRUCTURE_SPAWN].includes(s.structure.structureType) && s.structure.store.getFreeCapacity(RESOURCE_ENERGY))
        if (energyStructure) {
            this.transfer(energyStructure.structure, RESOURCE_ENERGY)
            return true;
        } else {
            return false;
        }
    } catch (e) {
    }
}

Creep.prototype.withdrawResource = function (destination = undefined, resourceType = RESOURCE_ENERGY, amount = undefined) {
    if (destination) this.memory.energyDestination = destination.id;
    if (this.memory.energyDestination) {
        let energyItem = Game.getObjectById(this.memory.energyDestination);
        if (!energyItem) return this.memory.energyDestination = undefined;
        if (energyItem.pos.roomName !== this.room.name) return this.shibMove(energyItem);
        if (energyItem.store && energyItem.store[resourceType]) {
            switch (this.withdraw(energyItem, resourceType, amount)) {
                case ERR_INVALID_TARGET:
                    switch (this.pickup(energyItem)) {
                        case ERR_NOT_IN_RANGE:
                            this.shibMove(energyItem);
                            break;
                        default:
                            this.memory.energyDestination = undefined;
                            this.memory._shibMove = undefined;
                            break;
                        case ERR_INVALID_TARGET:
                            switch (energyItem.transfer(this, resourceType, amount)) {
                                case ERR_NOT_IN_RANGE:
                                    this.shibMove(energyItem);
                                    break;
                                default:
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
                default:
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
            delete this.memory._shibMove;
        }
    }
};

Creep.prototype.locateEnergy = function () {
    // Handle resources in allied rooms
    if (INTEL[this.room.name].owner && INTEL[this.room.name].owner !== MY_USERNAME) {
        //Dropped
        if (this.room.droppedEnergy.length) {
            let dropped = _.find(this.room.droppedEnergy, (r) => r.amount >= (this.room.creeps.filter((c) => c.my && c.memory.energyDestination === r.id && c.id !== this.id).length + 1) * (this.store.getFreeCapacity() * 0.5));
            if (dropped) {
                this.memory.energyDestination = dropped.id;
                return true;
            }
        }
        // Storage
        if (this.room.storage && this.room.storage.pos.checkForRampart(false) && this.room.storage.store[RESOURCE_ENERGY]) {
            this.memory.energyDestination = this.room.storage.id;
            return true;
        }
        // Terminal
        if (this.room.terminal && this.room.terminal.pos.checkForRampart(false) && this.room.terminal.store[RESOURCE_ENERGY] > TERMINAL_ENERGY_BUFFER) {
            this.memory.energyDestination = this.room.terminal.id;
            this.memory.findEnergyCountdown = undefined;
            return true;
        }
        // Container
        if (!this.room.storage || !this.room.storage.store[RESOURCE_ENERGY] || this.memory.role === 'shuttle') {
            let container = _.max(_.filter(this.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.pos.checkForRampart(true)
                && s.store[RESOURCE_ENERGY] > (this.room.creeps.filter((c) => c.my && c.memory.energyDestination === s.id && c.id !== this.id).length + 1) * (this.store.getFreeCapacity() * 0.5)), function (c) {
                return _.sum(c.store);
            });
            if (container.id) {
                this.memory.energyDestination = container.id;
                this.memory.findEnergyCountdown = undefined;
                return true;
            }
        }
    } else {
        // Take from remote haulers pre storage
        if (!this.room.storage && this.room.controller && this.room.controller.owner && this.memory.role !== 'hauler' && this.memory.role !== 'shuttle' && this.memory.role !== 'remoteHauler') {
            let hauler = _.find(this.room.myCreeps, (c) => c.memory.role === 'remoteHauler' && c.store[RESOURCE_ENERGY] && !c.memory.storageDestination && c.pos.getRangeTo(c.room.controller) <= 3);
            if (hauler) {
                this.memory.energyDestination = hauler.id;
                this.memory.findEnergyCountdown = undefined;
                return true;
            }
            // Fuel Trucks
            let fuelTruck = _.find(this.room.myCreeps, (c) => c.memory.role === 'fuelTruck' && c.memory.destination === c.room.name && c.store[RESOURCE_ENERGY]);
            if (fuelTruck && this.memory.role !== 'fuelTruck') {
                this.memory.energyDestination = fuelTruck.id;
                this.memory.findEnergyCountdown = undefined;
                return true;
            }
        }
        // Links
        let hubLink = Game.getObjectById(this.room.memory.hubLink);
        if (hubLink && hubLink.store[RESOURCE_ENERGY]) {
            this.memory.energyDestination = hubLink.id;
            this.memory.findEnergyCountdown = undefined;
            return true;
        }
        // Tombstone
        if (this.room.tombstones.length) {
            let tombstone = _.find(this.room.tombstones, (r) => r.pos.getRangeTo(this) <= 10 && r.store[RESOURCE_ENERGY]);
            if (tombstone) {
                this.memory.energyDestination = tombstone.id;
                this.memory.findEnergyCountdown = undefined;
                return true;
            }
        }
        // Ruin
        if (this.room.ruins.length) {
            let ruin = _.find(this.room.ruins, (r) => r.store[RESOURCE_ENERGY]);
            if (ruin) {
                this.memory.energyDestination = ruin.id;
                this.memory.findEnergyCountdown = undefined;
                return true;
            }
        }
        // Dismantle hostile
        if (this.hasActiveBodyparts(WORK)) {
            let hostileStructures = _.find(this.room.impassibleStructures, (s) => s.owner && !_.includes(FRIENDLIES, s.owner.username));
            if (hostileStructures) {
                switch (this.dismantle(hostileStructures)) {
                    case ERR_NOT_IN_RANGE:
                        this.shibMove(hostileStructures);
                }
                this.say('DISMANTLE', true);
                this.memory.findEnergyCountdown = undefined;
                return true;
            }
        }
        //Dropped
        if (this.room.droppedEnergy.length) {
            let dropped = _.find(this.room.droppedEnergy, (r) => r.amount >= (this.room.creeps.filter((c) => c.my && c.memory.energyDestination === r.id && c.id !== this.id).length + 1) * (this.store.getFreeCapacity() * 0.5));
            if (dropped) {
                this.memory.energyDestination = dropped.id;
                this.memory.findEnergyCountdown = undefined;
                return true;
            }
        }
        // Container
        if (this.memory.role === 'shuttle' || this.memory.role === 'remoteHauler' || ((!this.room.storage || !this.room.storage.store[RESOURCE_ENERGY]) && (!this.room.terminal || this.room.terminal.store[RESOURCE_ENERGY] < TERMINAL_ENERGY_BUFFER))) {
            let container
            container = _.max(_.filter(this.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && (this.room.memory.controllerContainer !== s.id || this.memory.findEnergyCountdown >= this.room.controller.level)
                && s.store[RESOURCE_ENERGY] > this.room.creeps.filter((c) => c.my && c.memory.energyDestination === s.id && c.id !== this.id).length * (this.store.getFreeCapacity() * 0.8)), function (c) {
                return _.sum(c.store);
            });
            if (container && container.id) {
                this.memory.energyDestination = container.id;
                this.memory.findEnergyCountdown = undefined;
                return true;
            }
        }
        if (this.memory.role !== 'shuttle') {
            // Storage
            if (this.room.storage && this.room.storage.store[RESOURCE_ENERGY]) {
                this.memory.energyDestination = this.room.storage.id;
                return true;
            }
            // Terminal
            if (this.room.terminal && this.room.terminal.store[RESOURCE_ENERGY] > TERMINAL_ENERGY_BUFFER) {
                this.memory.energyDestination = this.room.terminal.id;
                this.memory.findEnergyCountdown = undefined;
                return true;
            }
        }
        // Factory from batteries
        if (this.room.factory && (!this.room.factory.memory.producing || this.room.factory.memory.producing === RESOURCE_ENERGY) && this.room.factory.store[RESOURCE_ENERGY]) {
            this.memory.energyDestination = this.room.factory.id;
        }
        if (!this.memory.findEnergyCountdown && this.memory.role === 'hauler') this.memory.findEnergyCountdown = 1; else this.memory.findEnergyCountdown += 1;
        return false;
    }
};

Creep.prototype.haulerDelivery = function () {
    // If you have a destination, deliver
    if (this.memory.storageDestination) {
        let storageItem = Game.getObjectById(this.memory.storageDestination);
        if (!storageItem || !storageItem.store.getFreeCapacity(RESOURCE_ENERGY)) {
            delete this.memory._shibMove;
            return delete this.memory.storageDestination;
        }
        if (this.store.getUsedCapacity(RESOURCE_ENERGY) && !storageItem.store.getFreeCapacity(RESOURCE_ENERGY)) {
            delete this.memory.storageDestination;
            delete this.memory._shibMove;
        } else {
            for (const resourceType in this.store) {
                switch (this.transfer(storageItem, resourceType)) {
                    case OK:
                        delete this.memory.storageDestination;
                        delete this.memory._shibMove;
                        return true;
                    case ERR_NOT_IN_RANGE:
                        this.shibMove(storageItem);
                        return true;
                    default:
                        delete this.memory.storageDestination;
                        delete this.memory._shibMove;
                        break;
                }
            }
        }
        return false;
    }
    // If carrying minerals deposit in terminal or storage
    if (_.sum(this.store) > this.store[RESOURCE_ENERGY]) {
        if (this.room.terminal) this.memory.storageDestination = this.room.terminal.id; else if (this.room.storage) this.memory.storageDestination = this.room.storage.id;
        return true;
    }
    //Tower
    if (INTEL[this.room.name].threatLevel) {
        let tower = _.filter(this.room.impassibleStructures, (s) => s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] < TOWER_CAPACITY);
        if (tower.length) {
            this.memory.storageDestination = _.min(tower, function (t) {
                return t.store[RESOURCE_ENERGY];
            }).id;
            return true;
        }
    } else {
        let tower = _.filter(this.room.impassibleStructures, (s) => s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] < TOWER_CAPACITY * 0.5);
        if (tower.length) {
            this.memory.storageDestination = _.min(tower, function (t) {
                return t.store[RESOURCE_ENERGY];
            }).id;
            return true;
        }
    }
    // Spawns/Extensions
    let energyStructures;
    if (this.memory.energyStructures && this.memory.roomEnergyCap === this.room.energyCapacityAvailable) {
        energyStructures = JSON.parse(this.memory.energyStructures).map(id => Game.getObjectById(id))
    } else {
        energyStructures = _.filter(this.room.impassibleStructures, (s) => s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION && (!ROOM_HARVESTER_EXTENSIONS[s.room.name] || !ROOM_HARVESTER_EXTENSIONS[s.room.name].includes(s.id)));
        this.memory.energyStructures = JSON.stringify(_.map(energyStructures, 'id'));
        this.memory.roomEnergyCap = this.room.energyCapacityAvailable;
    }
    let hauler = this;
    let needyStructure = _.max(_.filter(energyStructures, (s) => s.store.getFreeCapacity(RESOURCE_ENERGY) && !_.find(this.room.myCreeps, (c) => c.memory.storageDestination === s.id && c.memory.role === this.memory.role)), function (s) {
        return hauler.pos.getRangeTo(s);
    });
    if (needyStructure && needyStructure.id) {
        this.memory.storageDestination = needyStructure.id;
        return true;
    }
    if (this.room.controller.level >= 6) {
        //Terminal low
        if (this.room.terminal && this.room.terminal.store[RESOURCE_ENERGY] < TERMINAL_ENERGY_BUFFER) {
            this.memory.storageDestination = this.room.terminal.id;
            return true;
        }
        //Labs
        let lab = _.find(this.room.impassibleStructures, (s) => s.structureType === STRUCTURE_LAB && s.store[RESOURCE_ENERGY] < LAB_ENERGY_CAPACITY);
        if (lab) {
            this.memory.storageDestination = lab.id;
            return true;
        }
        if (this.room.controller.level >= 8) {
            //Nuke
            let nuke = _.find(this.room.impassibleStructures, (s) => s.structureType === STRUCTURE_NUKER && s.store[RESOURCE_ENERGY] < NUKER_ENERGY_CAPACITY);
            if (nuke && this.room.energyState) {
                this.memory.storageDestination = nuke.id;
                return true;
            }
            //Power Spawn
            let power = _.find(this.room.impassibleStructures, (s) => s.structureType === STRUCTURE_POWER_SPAWN && s.store.getFreeCapacity(RESOURCE_ENERGY));
            if (power) {
                this.memory.storageDestination = power.id;
                return true;
            }
        }
    }
    //Terminal
    if (this.room.terminal && this.room.terminal.store.getFreeCapacity() && this.room.terminal.store.getUsedCapacity(RESOURCE_ENERGY) < TERMINAL_ENERGY_BUFFER * 2) {
        this.memory.storageDestination = this.room.terminal.id;
        if (this.memory.role === 'hauler') this.memory.cooldown = true;
        return true;
    }
    //Storage below buffer
    if (this.room.storage && this.room.storage.store.getFreeCapacity() && this.room.storage.store.getUsedCapacity(RESOURCE_ENERGY) < STORAGE_ENERGY_BUFFER) {
        this.memory.storageDestination = this.room.storage.id;
        if (this.memory.role === 'hauler') this.memory.cooldown = true;
        return true;
    }
    //Top off container if no controller link otherwise check for a hub link
    if (!this.room.memory.controllerLink || !this.room.memory.hubLink) {
        let controllerContainer = Game.getObjectById(this.room.memory.controllerContainer);
        if (controllerContainer && controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY)) {
            this.memory.storageDestination = controllerContainer.id;
            return true;
        }
    } else if (this.room.memory.hubLink) {
        let hubLink = Game.getObjectById(this.memory.hubLink);
        if (hubLink && hubLink.store.getFreeCapacity(RESOURCE_ENERGY)) {
            this.memory.storageDestination = hubLink.id;
            return true;
        }
    }
    //Storage fallback
    if (this.room.storage && this.room.storage.store.getFreeCapacity()) {
        this.memory.storageDestination = this.room.storage.id;
        if (this.memory.role === 'hauler') this.memory.cooldown = true;
        return true;
    }
};

Creep.prototype.constructionWork = function () {
    let structures = _.filter(this.room.structures, (s) => s.hits < s.hitsMax && !_.filter(this.room.myCreeps, (c) => c.memory.constructionSite === s.id).length);
    let mySites = _.filter(this.room.constructionSites, (s) => !s.owner || _.includes(FRIENDLIES, s.owner.username));
    let site = _.filter(mySites, (s) => s.structureType === STRUCTURE_TOWER);
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
    if (INTEL[this.room.name].threatLevel) {
        let hostileBarrier = _.min(_.filter(this.room.structures, (s) => [STRUCTURE_WALL, STRUCTURE_RAMPART].includes(s.structureType) && s.pos.findInRange(_.filter(s.room.hostileCreeps, (c) => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(WORK)), 5)[0]), 'hits');
        if (hostileBarrier.id) {
            this.memory.constructionSite = hostileBarrier.id;
            this.memory.task = 'repair';
            this.memory.targetHits = hostileBarrier.hits + 25000;
            return true;
        }
    }
    site = _.filter(mySites, (s) => s.structureType === STRUCTURE_SPAWN);
    if (site.length > 0) {
        site = _.max(site, 'progress');
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(mySites, (s) => s.structureType === STRUCTURE_EXTENSION);
    if (site.length > 0) {
        site = _.max(site, 'progress');
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(mySites, (s) => s.structureType === STRUCTURE_LINK);
    if (site.length > 0) {
        site = _.max(site, 'progress');
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(mySites, (s) => s.structureType === STRUCTURE_TERMINAL);
    if (site.length > 0) {
        site = _.max(site, 'progress');
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(mySites, (s) => s.structureType === STRUCTURE_STORAGE);
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
    site = _.filter(mySites, (s) => s.structureType === STRUCTURE_CONTAINER);
    if (site.length > 0) {
        site = _.max(site, 'progress');
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(mySites, (s) => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL);
    if (site.length) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(mySites, (s) => s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART);
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
    site = _.filter(mySites, (s) => s.structureType === STRUCTURE_WALL);
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

Creep.prototype.repairWork = function () {
    let structures = _.filter(this.room.structures, (s) => s.hits < s.hitsMax && !_.filter(this.room.myCreeps, (c) => c.memory.constructionSite === s.id).length);
    let site = _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 5000);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        this.memory.targetHits = 12500;
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
    site = _.filter(structures, (s) => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * 0.5);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        this.memory.targetHits = site.hitsMax * 0.65;
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
        construction.say(construction.hits + '/' + construction.hitsMax);
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
                return true;
        }
    } else {
        this.say('Build!', true);
        construction.say(construction.progress + '/' + construction.progressTotal);
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
                return true;
        }
    }
};

Creep.prototype.goToHub = function (destination = this.memory.overlord, idleTime = 10) {
    let hub = new RoomPosition(25, 25, destination);
    if (this.pos.getRangeTo(hub) <= 15) {
        this.idleFor(idleTime);
        return false;
    }
    this.shibMove(hub, {range: 10})
    return true;
};

Creep.prototype.towTruck = function () {
    // Clear broken trailers
    if (this.memory.trailer && !Game.getObjectById(this.memory.trailer)) this.memory.trailer = undefined;
    if (_.sum(this.store)) return false;
    if (!this.memory.trailer) {
        let needsTow = _.filter(this.room.myCreeps, (c) => c.memory.towDestination && !c.memory.towCreep);
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
            let towDestination;
            if (trailer.memory.towDestination && trailer.memory.towDestination.x) {
                towDestination = new RoomPosition(trailer.memory.towDestination.x, trailer.memory.towDestination.y, trailer.memory.towDestination.roomName);
            } else if (Game.getObjectById(trailer.memory.towDestination)) {
                towDestination = Game.getObjectById(trailer.memory.towDestination).pos;
            }
            // Handle case of desto being occupied
            if (trailer.memory.towOptions && trailer.memory.towOptions.range === 0 && this.pos.isNearTo(towDestination) && (trailer.hasActiveBodyparts(MOVE) || (towDestination.checkForCreep() && towDestination.checkForCreep().id !== this.id))) {
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
            }
        }
        return true;
    }
};

Creep.prototype.portalCheck = function () {
    if (this.room.controller || !this.pos.checkForPortal()) return false;
    this.memory.usedPortal = this.room.name;
    if (positionAtDirection(this.pos, LEFT) && !positionAtDirection(this.pos, LEFT).checkForPortal()) return this.move(LEFT);
    if (positionAtDirection(this.pos, RIGHT) && !positionAtDirection(this.pos, RIGHT).checkForPortal()) return this.move(RIGHT);
    if (positionAtDirection(this.pos, TOP) && !positionAtDirection(this.pos, TOP).checkForPortal()) return this.move(TOP);
    if (positionAtDirection(this.pos, BOTTOM) && !positionAtDirection(this.pos, BOTTOM).checkForPortal()) return this.move(BOTTOM);
    if (positionAtDirection(this.pos, BOTTOM_RIGHT) && !positionAtDirection(this.pos, BOTTOM_RIGHT).checkForPortal()) return this.move(BOTTOM_RIGHT);
    if (positionAtDirection(this.pos, BOTTOM_LEFT) && !positionAtDirection(this.pos, BOTTOM_LEFT).checkForPortal()) return this.move(BOTTOM_LEFT);
    if (positionAtDirection(this.pos, TOP_RIGHT) && !positionAtDirection(this.pos, TOP_RIGHT).checkForPortal()) return this.move(TOP_RIGHT);
    if (positionAtDirection(this.pos, TOP_LEFT) && !positionAtDirection(this.pos, TOP_LEFT).checkForPortal()) return this.move(TOP_LEFT);
};

Creep.prototype.borderCheck = function () {
    let x = this.pos.x;
    let y = this.pos.y;
    if (x === 0 || y === 0 || x === 49 || y === 49) {
        if (this.memory._shibMove && this.memory._shibMove.path && this.memory._shibMove.path.length) {
            let pathInfo = this.memory._shibMove;
            let origin = normalizePos(this);
            pathInfo.path = pathInfo.path.slice(1);
            let nextDirection = parseInt(pathInfo.path[0], 10);
            pathInfo.newPos = positionAtDirection(origin, nextDirection);
            switch (this.move(nextDirection)) {
                case OK:
                    pathInfo.pathPosTime = 0;
                    pathInfo.lastMoveTick = Game.time;
                    this.memory._shibMove = pathInfo;
                    return false;
            }
        } else if (x === 0 && y === 0) {
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
            pos = positionAtDirection(this.pos, LEFT);
            if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                this.move(LEFT)
            } else {
                pos = positionAtDirection(this.pos, TOP_LEFT);
                if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                    this.move(TOP_LEFT)
                } else this.move(BOTTOM_LEFT)
            }
        } else if (x === 0) {
            pos = positionAtDirection(this.pos, RIGHT);
            if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                return this.move(RIGHT)
            } else {
                pos = positionAtDirection(this.pos, TOP_RIGHT);
                if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                    this.move(TOP_RIGHT)
                } else this.move(BOTTOM_RIGHT)
            }
        } else if (y === 0) {
            pos = positionAtDirection(this.pos, BOTTOM);
            if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                this.move(BOTTOM)
            } else {
                pos = positionAtDirection(this.pos, BOTTOM_RIGHT);
                if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                    this.move(BOTTOM_RIGHT)
                } else this.move(BOTTOM_LEFT)
            }
        } else if (y === 49) {
            pos = positionAtDirection(this.pos, TOP);
            if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                this.move(TOP)
            } else {
                pos = positionAtDirection(this.pos, TOP_RIGHT);
                if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                    this.move(TOP_RIGHT)
                } else this.move(TOP_LEFT)
            }
        }
        return true;
    }
    return false;
};

Creep.prototype.tryToBoost = function (boosts, tier = undefined) {
    // If they age out or are boosted, don't try again
    if (this.memory.boostAttempt || this.ticksToLive < 1000) {
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
            for (let boost of BOOST_USE[boostType]) {
                if (boostNeeded && this.room.store(boost) >= boostNeeded) {
                    available[boost] = {
                        'boost': boost,
                        'amount': boostNeeded
                    };
                    break;
                }
            }
        }
        this.memory.boosts.requestedBoosts = available;
    } else if (_.size(this.memory.boosts.requestedBoosts)) {
        for (let requestedBoost of Object.keys(this.memory.boosts.requestedBoosts)) {
            let amountNeeded = this.memory.boosts.requestedBoosts[requestedBoost]['amount'];
            let boostNeeded = this.memory.boosts.requestedBoosts[requestedBoost]['boost'];
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
                let lab = _.find(this.room.impassibleStructures, (s) => s.structureType === STRUCTURE_LAB && s.store[RESOURCE_ENERGY] > 0 &&
                    (s.mineralType === boostNeeded || !s.memory.itemNeeded) && (!s.memory.neededBoost || s.memory.neededBoost === boostNeeded));
                if (lab) {
                    lab.memory.paused = true;
                    this.memory.boosts.boostLab = lab.id;
                    lab.memory.neededBoost = boostNeeded;
                    lab.memory.amount = amountNeeded;
                    lab.memory.requestor = this.id;
                    lab.memory.requested = Game.time;
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
                lab.say(lab.memory.neededBoost);
                if (!this.pos.isNearTo(lab)) {
                    this.say(ICONS.boost);
                    this.shibMove(lab);
                    return true;
                } else if (lab.mineralType === lab.memory.neededBoost && lab.store[RESOURCE_ENERGY] && lab.mineralAmount >= amountNeeded) {
                    switch (lab.boostCreep(this)) {
                        case OK:
                            this.memory.boosts.requestedBoosts = _.filter(this.memory.boosts.requestedBoosts, (b) => b['boost'] !== lab.memory.neededBoost);
                            lab.memory.neededBoost = undefined;
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
                        default:
                            this.memory.boosts.requestedBoosts = _.filter(this.memory.boosts.requestedBoosts, (b) => b['boost'] !== lab.memory.neededBoost);
                            lab.memory.neededBoost = undefined;
                            this.say('Error');
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
    if (!this.hasActiveBodyparts(MOVE)) return this.suicide();
    let spawn = this.pos.findClosestByRange(FIND_MY_SPAWNS);
    if (!spawn) {
        if (this.room.name !== this.memory.overlord) return this.shibMove(new RoomPosition(25, 25, this.memory.overlord), {range: 22})
        else return this.suicide();
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
    if (!this.memory.fleeTo) this.memory.fleeTo = _.sample(_.filter(MY_ROOMS, (r) => !r.nukes.length)).name;
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

