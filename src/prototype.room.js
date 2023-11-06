/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */
'use strict';

const roomPlanner = require('module.roomPlanner');

let hubCache = {};
Object.defineProperty(Room.prototype, 'hub', {
    get: function () {
        if (!this.memory.bunkerHub || !this.memory.bunkerHub.x || !this.memory.bunkerHub.y) return;
        if (!this._hub) {
            if (!hubCache[this.name]) {
                hubCache[this.name] = JSON.stringify({x: this.memory.bunkerHub.x, y: this.memory.bunkerHub.y});
            }
            let hubInfo = JSON.parse(hubCache[this.name]);
            this._hub = new RoomPosition(hubInfo.x, hubInfo.y, this.name);
        }
        // return the locally stored value
        return this._hub;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'constructionSites', {
    get: function () {
        if (!this._constructionSites) {
            this._constructionSites = _.filter(Game.constructionSites, (s) => s.pos.roomName === this.name);
        }
        return this._constructionSites;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'user', {
    get: function () {
        if (!this._user) {
            if (!this.controller) this._user = undefined;
            else if (this.controller.owner) this._user = this.controller.owner.username;
            else if (this.controller.reservation) this._user = this.controller.reservation.username;
            else this._user = undefined;
        }
        return this._user;
    },
    enumerable: false,
    configurable: true
});

let sourceCache = {};
Object.defineProperty(Room.prototype, 'sources', {
    get: function () {
        // If we dont have the value stored locally
        if (!this._sources) {
            // If we dont have the value stored in memory
            if (!sourceCache[this.name]) {
                // Find the sources and store their id's in memory
                sourceCache[this.name] = this.find(FIND_SOURCES).map(source => source.id);
            }
            // Get the source objects from the id's in memory and store them locally
            this._sources = sourceCache[this.name].map(id => Game.getObjectById(id));
        }
        // return the locally stored value
        return this._sources;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'deposits', {
    get: function () {
        // If we dont have the value stored locally
        if (!this._deposits) {
            this._deposits = this.find(FIND_DEPOSITS);
        }
        // return the locally stored value
        return this._deposits;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'nukes', {
    get: function () {
        // If we dont have the value stored locally
        if (!this._nukes) {
            this._nukes = this.find(FIND_NUKES);
        }
        // return the locally stored value
        return this._nukes;
    },
    enumerable: false,
    configurable: true
});

let mineralCache = {};
Object.defineProperty(Room.prototype, 'mineral', {
    get: function () {
        // If we dont have the value stored locally
        if (!this._mineral) {
            if (!mineralCache[this.name]) {
                if (this.find(FIND_MINERALS)[0]) {
                    if (Game.shard.name === 'shardSeason' && RESOURCE_THORIUM) {
                        mineralCache[this.name] = _.find(this.find(FIND_MINERALS), (m) => m.resourceType !== RESOURCE_THORIUM).id;
                    } else {
                        mineralCache[this.name] = this.find(FIND_MINERALS)[0].id;
                    }
                } else {
                    mineralCache[this.name] = undefined;
                }
            }
            // Get the source objects from the id's in memory and store them locally
            this._mineral = Game.getObjectById(mineralCache[this.name]);
        }
        // return the locally stored value
        return this._mineral;
    },
});

Object.defineProperty(Room.prototype, 'structures', {
    get: function () {
        if (!this._structures) {
            this._structures = this.find(FIND_STRUCTURES);
        }
        return this._structures;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'impassibleStructures', {
    get: function () {
        if (!this._impassibleStructures) {
            this._impassibleStructures = _.filter(this.structures, (s) => OBSTACLE_OBJECT_TYPES.includes(s.structureType));
        }
        return this._impassibleStructures;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'energyState', {
    get: function () {
        if (!this._energyState) {
            if (this.energy >= STORAGE_CAPACITY * 0.5) {
                this._energyState = 3;
            } else if (this.energy >= STORAGE_CAPACITY * 0.2) {
                this._energyState = 2;
            } else if (this.energy >= STORAGE_CAPACITY * 0.05 || (!this.storage && !this.terminal)) {
                this._energyState = 1;
            } else {
                this._energyState = 0;
            }
        }
        return this._energyState;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'hostileStructures', {
    get: function () {
        if (!this._hostileStructures) {
            this._hostileStructures = _.filter(this.structures, (s) => !s.my && s.owner && ![STRUCTURE_CONTROLLER, STRUCTURE_KEEPER_LAIR, STRUCTURE_POWER_BANK, STRUCTURE_ROAD].includes(s.structureType) && !_.includes(FRIENDLIES, s.owner.username));
        }
        return this._hostileStructures;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'droppedResources', {
    get: function () {
        if (!this._droppedResources) {
            if (!this._droppedResources) {
                this._droppedResources = this.find(FIND_DROPPED_RESOURCES, {filter: (r) => r.resourceType !== RESOURCE_ENERGY});
            } else {
                this._droppedResources = this.find(FIND_DROPPED_RESOURCES, {filter: (r) => r.resourceType !== RESOURCE_ENERGY && r.pos.getRangeTo(r.pos.findClosestByRange(this.hostileCreeps)) > 3});
            }
        }
        return this._droppedResources;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'droppedEnergy', {
    get: function () {
        if (!this._droppedEnergy) {
            if (!this._droppedEnergy) {
                this._droppedEnergy = this.find(FIND_DROPPED_RESOURCES, {filter: (r) => r.resourceType === RESOURCE_ENERGY});
            } else {
                this._droppedEnergy = this.find(FIND_DROPPED_RESOURCES, {filter: (r) => r.resourceType === RESOURCE_ENERGY && r.pos.getRangeTo(r.pos.findClosestByRange(this.hostileCreeps)) > 3});
            }
        }
        return this._droppedEnergy;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'creeps', {
    get: function () {
        if (!this._creeps) {
            this._creeps = this.find(FIND_CREEPS);
        }
        return this._creeps;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'myCreeps', {
    get: function () {
        if (!this._myCreeps) {
            this._myCreeps = this.find(FIND_CREEPS).filter((c) => c.my);
        }
        return this._myCreeps;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'powerCreeps', {
    get: function () {
        if (!this._powerCreeps) {
            this._powerCreeps = this.find(FIND_POWER_CREEPS);
        }
        return this._powerCreeps;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'hostileCreeps', {
    get: function () {
        if (!this._Hostilecreeps) {
            this._Hostilecreeps = _.filter(this.creeps, (c) => !c.my && !_.includes(FRIENDLIES, c.owner.username) && c.owner.username !== 'Source Keeper');
            this._Hostilecreeps.concat(_.filter(this.powerCreeps, (c) => !c.my && !_.includes(FRIENDLIES, c.owner.username)));
        }
        return this._Hostilecreeps;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'friendlyCreeps', {
    get: function () {
        if (!this._friendlyCreeps) {
            this._friendlyCreeps = _.filter(this.creeps, (c) => (_.includes(FRIENDLIES, c.owner.username) || c.my) && !_.includes(Memory._threats, c.owner.username));
        }
        return this._friendlyCreeps;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'alliedCreeps', {
    get: function () {
        if (!this._alliedCreeps) {
            this._alliedCreeps = _.filter(this.creeps, (c) => !c.my && _.includes(FRIENDLIES, c.owner.username) && !_.includes(Memory._threats, c.owner.username));
        }
        return this._alliedCreeps;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'constructionSites', {
    get: function () {
        if (!this._constructionSites) {
            this._constructionSites = this.find(FIND_CONSTRUCTION_SITES);
        }
        return this._constructionSites;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'tombstones', {
    get: function () {
        if (!this._tombstones) {
            if (!this._tombstones) {
                this._tombstones = this.find(FIND_TOMBSTONES);
            } else {
                this._tombstones = this.find(FIND_TOMBSTONES, {filter: (r) => r.pos.getRangeTo(r.pos.findClosestByRange(this.hostileCreeps)) > 3});
            }
        }
        return this._tombstones;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'ruins', {
    get: function () {
        if (!this._ruins) {
            if (!this._ruins) {
                this._ruins = this.find(FIND_RUINS);
            } else {
                this._ruins = this.find(FIND_RUINS, {filter: (r) => r.pos.getRangeTo(r.pos.findClosestByRange(this.hostileCreeps)) > 3});
            }
        }
        return this._ruins;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'level', {
    get: function () {
        if (!this._level) {
            this._level = getLevel(this);
        }
        return this._level;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'nuker', {
    get: function () {
        if (!this._nuker) {
            this._nuker = _.find(this.impassibleStructures, (s) => s.structureType === STRUCTURE_NUKER && s.isActive());
        }
        return this._nuker;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'energy', {
    get: function () {
        if (!this._energy) {
            this._energy = getRoomResource(this, RESOURCE_ENERGY, true) + (getRoomResource(this, RESOURCE_BATTERY, true) * 10);
        }
        return this._energy;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'energyIncome', {
    get: function () {
        if (!this._energyIncome && ROOM_ENERGY_INCOME_ARRAY[this.name]) {
            this._energyIncome = _.round(average(ROOM_ENERGY_INCOME_ARRAY[this.name]), 0);
        } else if (!ROOM_ENERGY_INCOME_ARRAY[this.name]) {
            this._energyIncome = 0;
        }
        return this._energyIncome;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'factory', {
    get: function () {
        if (!this._factory) {
            this._factory = _.filter(this.structures, (s) => s.structureType === STRUCTURE_FACTORY && s.isActive())[0];
        }
        return this._factory;
    },
    enumerable: false,
    configurable: true
});

/**
 * Get room resource
 * @param resource
 * @param unused
 * @returns {*}
 */
Room.prototype.store = function (resource, unused = false) {
    if (!this._resourceStore) this._resourceStore = {};
    if (!this._resourceStore[resource]) {
        this._resourceStore[resource] = getRoomResource(this, resource, unused);
    }
    return this._resourceStore[resource];
};

function getRoomResource(room, resource, unused = false) {
    if (!room || !resource) return undefined;
    let count = 0;
    if (!unused) {
        _.filter(room.impassibleStructures, (s) => s.store && s.store.getUsedCapacity(resource) && s.structureType !== STRUCTURE_NUKER && s.structureType !== STRUCTURE_TOWER &&
            s.structureType !== STRUCTURE_SPAWN && s.structureType !== STRUCTURE_EXTENSION && s.structureType !== STRUCTURE_LAB).forEach((s) => count += s.store.getUsedCapacity(resource));
        _.filter(room.impassibleStructures, (s) => resource !== RESOURCE_ENERGY && s.store && s.store.getUsedCapacity(resource) && s.structureType === STRUCTURE_LAB && resource !== s.memory.itemNeeded).forEach((s) => count += s.store.getUsedCapacity(resource));
    } else {
        _.filter(room.impassibleStructures, (s) => s.store && s.store.getUsedCapacity(resource) && (s.structureType === STRUCTURE_STORAGE || s.structureType === STRUCTURE_TERMINAL || s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_FACTORY)).forEach((s) => count += s.store.getUsedCapacity(resource));
    }
    if (!unused || resource !== RESOURCE_ENERGY) _.filter(room.myCreeps, (c) => c.store[resource]).forEach((c) => count += c.store[resource]);
    _.filter(room.droppedResources, (r) => r.resourceType === resource).forEach((r) => count += r.amount);
    return count;
}

/**
 * Cache room intel
 * @param force
 * @param creep
 */
Room.prototype.cacheRoomIntel = function (force = false, creep = undefined) {
    if (!INTEL) global.INTEL = {};
    let cache = INTEL;
    if (!force && INTEL[this.name] && INTEL[this.name].cached + CREEP_LIFE_TIME > Game.time) return;
    let mineral, sk, power, portal, level, owner, lastOperation, towers, reservation, safemode,
        mineralAmount, hubCheck, isHighway, user, loot, commodity, obstacles, nukeTarget;
    // Store things that don't change
    if (INTEL[this.name]) {
        lastOperation = INTEL[this.name].lastOperation;
        sk = INTEL[this.name].sk;
        if (Math.random() > 0.2 && !force) hubCheck = INTEL[this.name].hubCheck;
    }
    // Minerals
    if (this.mineral) {
        mineral = this.mineral.mineralType;
        mineralAmount = this.mineral.mineralAmount;
    }
    // Make NCP array
    let ncpArray = Memory.ncpArray || [];
    let combatCreeps = _.find(this.hostileCreeps, (e) => e.hasActiveBodyparts(ATTACK) || e.hasActiveBodyparts(RANGED_ATTACK));
    if (this.controller) {
        // Check for obstacles
        if (!this.controller.pos.findClosestByPath(FIND_EXIT) || _.find(this.impassibleStructures, (s) => !s.pos.findClosestByPath(FIND_EXIT))) obstacles = true;
        if (this.controller.safeMode) safemode = this.controller.safeMode + Game.time;
        if (this.controller.owner) {
            owner = this.controller.owner.username;
            // Signage NCP check
            if (this.controller.sign) {
                let text = this.controller.sign.text.toLowerCase();
                if (text.includes('overmind') || text.includes('tooangel') || text.includes('quorum') || text.includes('ᴏᴠᴇʀᴍɪɴᴅ') || text.includes('jln')) {
                    ncpArray.push(this.controller.sign.username);
                } else if (_.includes(ncpArray, this.controller.sign.username)) {
                    _.remove(ncpArray, (u) => u === this.controller.sign.username);
                }
            }
            towers = _.filter(this.structures, (s) => s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST && s.isActive()).length;
            // Handle nuke targets
            if (this.terminal) {
                nukeTarget = this.terminal.pos.posToString();
            }
        } else if (this.controller.reservation) {
            reservation = this.controller.reservation.username;
        } else if (!obstacles && !hubCheck && !this.hostileCreeps.length && this.sources.length === 2) {
            hubCheck = roomPlanner.hubCheck(this);
        }
        level = this.controller.level || undefined;
        // Check for loot
        if (!obstacles) {
            let lootTarget = _.filter(this.structures, (s) => (s.structureType === STRUCTURE_STORAGE || s.structureType === STRUCTURE_TERMINAL) && _.sum(s.store) > 0 && !s.pos.checkForRampart(true)).length > 0;
            if (lootTarget && !this.hostileCreeps.length) loot = true;
        }
        // Invader Core
        if (_.filter(this.structures, (s) => s.structureType === STRUCTURE_INVADER_CORE).length > 0) {
            towers = _.filter(this.structures, (s) => s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST && s.isActive()).length;
        }
    } else if (!sk && this.sources.length && _.find(this.structures, (e) => e.structureType === STRUCTURE_KEEPER_LAIR)) {
        sk = true;
    } else if (!sk && !this.sources.length) {
        // Get commodity info
        if (this.deposits.length && _.find(this.deposits, (d) => d.ticksToDecay >= 2000 && (!d.lastCooldown || d.lastCooldown <= 20))) {
            commodity = _.find(this.deposits, (d) => d.ticksToDecay >= 2000 && (!d.lastCooldown || d.lastCooldown <= 20)).depositType;
        }
        isHighway = true;
    }
    // Set a user is we have no owner or reservation
    if (!owner && !reservation && (this.hostileCreeps.length || this.alliedCreeps.length)) {
        if (this.alliedCreeps.length) user = this.alliedCreeps[0].owner.username; else if (this.hostileCreeps.length) user = this.hostileCreeps[0].owner.username;
    }
    // Store portal info
    portal = _.find(this.structures, (e) => e.structureType === STRUCTURE_PORTAL && !e.destination.shard);
    if (portal) {
        portal = portal.destination.roomName;
    } else {
        portal = undefined;
    }
    // Store power info
    power = _.find(this.structures, (e) => e && e.structureType === STRUCTURE_POWER_BANK && e.ticksToDecay > 1000);
    if (power) power = Game.time + power.ticksToDecay; else power = undefined;
    cache[this.name] = cache[this.name] || {};
    cache[this.name] = {
        cached: Game.time,
        name: this.name,
        shardName: Game.shard.name,
        sources: this.sources.length,
        mineral: mineral,
        mineralAmount: mineralAmount,
        commodity: commodity,
        owner: owner,
        hubCheck: hubCheck,
        reservation: reservation,
        level: level,
        sk: sk,
        user: owner || reservation || user,
        safemode: safemode,
        portal: portal,
        power: power,
        isHighway: isHighway,
        lastOperation: lastOperation,
        invaderCore: _.filter(this.structures, (e) => e.structureType === STRUCTURE_INVADER_CORE).length > 0,
        towers: towers,
        hostile: combatCreeps !== undefined || (towers && !FRIENDLIES.includes(owner)),
        status: roomStatus(this.name),
        loot: loot,
        obstacles: obstacles,
        nukeTarget: nukeTarget
    };
    Memory.ncpArray = _.uniq(ncpArray);
    global.INTEL = cache;
};

let invaderAlert = {};
/**
 * Check for invaders
 * @returns {boolean}
 */
Room.prototype.invaderCheck = function () {
    if (!INTEL || !INTEL[this.name]) return false;
    if (INTEL[this.name].lastInvaderCheck + 15 > Game.time) return;
    let previousCheck = INTEL[this.name].lastInvaderCheck || Game.time;
    INTEL[this.name].lastInvaderCheck = Game.time;
    // If owned/reserved by someone else or if it's far from our rooms clear the info and return
    if ((INTEL[this.name].owner && INTEL[this.name].owner !== MY_USERNAME) || (INTEL[this.name].reservation && INTEL[this.name].reservation !== MY_USERNAME) || findClosestOwnedRoom(this.name, true) > 2) {
        INTEL[this.name].numberOfHostiles = undefined;
        INTEL[this.name].alertEmail = undefined;
        INTEL[this.name].friendlyPower = undefined;
        INTEL[this.name].hostilePower = undefined;
        INTEL[this.name].requestingSupport = undefined;
        INTEL[this.name].invaderTTL = undefined;
        INTEL[this.name].roomHeat = undefined;
        INTEL[this.name].threatLevel = undefined;
        return false;
    }
    // No hostile detected
    if (!this.hostileCreeps.length) {
        INTEL[this.name].lastInvaderSighting = undefined;
        if (!INTEL[this.name].roomHeat && !INTEL[this.name].threatLevel) return false;
        // Room heat is capped at 1000
        if (INTEL[this.name].roomHeat > 1000) INTEL[this.name].roomHeat = 1000;
        let waitOut = 5;
        // Clear if no waitOut or if not one of your rooms
        let reduction = _.ceil((Game.time - previousCheck) / 5) * (this.friendlyCreeps.length) + 1;
        if (INTEL[this.name].lastPlayerSighting + 500 > Game.time) reduction *= 25;
        if (INTEL[this.name].tickDetected + waitOut < Game.time || INTEL[this.name].user !== MY_USERNAME) {
            INTEL[this.name].threatLevel = undefined;
            let roomHeat = (INTEL[this.name].roomHeat - reduction) || 0;
            if (roomHeat <= 0) {
                INTEL[this.name].roomHeat = undefined;
            } else {
                INTEL[this.name].roomHeat = roomHeat;
            }
            INTEL[this.name].numberOfHostiles = undefined;
            INTEL[this.name].alertEmail = undefined;
            INTEL[this.name].friendlyPower = undefined;
            INTEL[this.name].hostilePower = undefined;
            INTEL[this.name].requestingSupport = undefined;
            INTEL[this.name].invaderTTL = undefined;
        }
        return false;
    } else {
        let hostileCombatPower = 0;
        let armedHostiles = _.filter(this.hostileCreeps, (c) => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK));
        for (let i = 0; i < armedHostiles.length; i++) {
            hostileCombatPower += armedHostiles[i].combatPower;
        }
        let alliedCombatPower = 0;
        let armedFriendlies = _.filter(this.friendlyCreeps, (c) => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK));
        for (let i = 0; i < armedFriendlies.length; i++) {
            alliedCombatPower += armedFriendlies[i].combatPower;
        }
        INTEL[this.name].hostilePower = hostileCombatPower || 1;
        INTEL[this.name].friendlyPower = alliedCombatPower;
        let armedInvader = _.filter(this.hostileCreeps, (c) => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(HEAL) || c.getActiveBodyparts(WORK) >= 4);
        INTEL[this.name].tickDetected = Game.time;
        if (!INTEL[this.name].numberOfHostiles || INTEL[this.name].numberOfHostiles < this.hostileCreeps.length) {
            INTEL[this.name].numberOfHostiles = this.hostileCreeps.length || 1;
        }
        // Make owner array
        let ownerArray = [];
        this.hostileCreeps.forEach((c) => ownerArray.push(c.owner.username));
        ownerArray = _.uniq(ownerArray);
        // If Armed Invaders
        if (armedInvader.length) {
            INTEL[this.name].invaderTTL = _.max(armedInvader, 'ticksToLive').ticksToLive + Game.time;
            INTEL[this.name].lastInvaderSighting = Game.time;
            if (invaderAlert[this.name] + 25 < Game.time) {
                invaderAlert[this.name] = Game.time;
                log.a('Invaders detected in ' + roomLink(this.name) + '. ' + this.hostileCreeps.length +
                    ' creeps detected. (this.hostileCreeps/Friendly Power Present - ' + hostileCombatPower + '/' + alliedCombatPower + ')', 'RESPONSE COMMAND');
            }
        }
        // Determine threat level
        if (this.hostileCreeps.length && !armedInvader.length) {
            INTEL[this.name].threatLevel = 1;
        } else if (armedInvader.length && this.hostileCreeps[0].owner.username === 'Invader' && ownerArray.length === 1) {
            INTEL[this.name].threatLevel = 2;
        } else if (armedInvader.length && this.hostileCreeps[0].owner.username !== 'Invader' && ownerArray.length === 1) {
            INTEL[this.name].lastPlayerSighting = Game.time;
            INTEL[this.name].threatLevel = 3;
            let roomHeat = INTEL[this.name].roomHeat || 0;
            INTEL[this.name].roomHeat = roomHeat + (_.sum(this.hostileCreeps, 'body.length') * 0.25);
        } else if (armedInvader.length > 1 && (this.hostileCreeps[0].owner.username !== 'Invader' || ownerArray.length > 1)) {
            INTEL[this.name].lastPlayerSighting = Game.time;
            INTEL[this.name].threatLevel = 4;
            let roomHeat = INTEL[this.name].roomHeat || 0;
            INTEL[this.name].roomHeat = roomHeat + (_.sum(this.hostileCreeps, 'body.length') * 0.25);
        }
        return INTEL[this.name].threatLevel > 0;
    }
};