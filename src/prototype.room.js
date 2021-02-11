/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by rober on 7/5/2017.
 */
'use strict';

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

Object.defineProperty(Room.prototype, 'sources', {
    get: function () {
        // If we dont have the value stored locally
        if (!this._sources) {
            this._sources = this.find(FIND_SOURCES);
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

Object.defineProperty(Room.prototype, 'mineral', {
    get: function () {
        // If we dont have the value stored locally
        if (!this._mineral) {
            this._mineral = this.find(FIND_MINERALS)[0];
        }
        // return the locally stored value
        return this._mineral;
    },
    enumerable: false,
    configurable: true
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

Object.defineProperty(Room.prototype, 'needyExtensions', {
    get: function () {
        if (!this._needyExtensions) {
            this._needyExtensions = _.filter(this.find(FIND_STRUCTURES), (s) => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && s.store.getFreeCapacity(RESOURCE_ENERGY) && !s.pos.isNearTo(_.filter(this.creeps, (c) => c.my && c.memory.role === 'stationaryHarvester')));
        }
        return this._needyExtensions;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'energyState', {
    get: function () {
        if (!this._energyState) {
            this._energyState = 0;
            if (this.energy >= ENERGY_AMOUNT * 3) {
                this._energyState = 3;
            } else if (this.energy >= ENERGY_AMOUNT * 2) {
                this._energyState = 2;
            } else if (this.energy >= ENERGY_AMOUNT * 0.9) {
                this._energyState = 1;
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
            this._hostileStructures = _.filter(this.structures, (s) => !s.my && s.owner && ![STRUCTURE_CONTROLLER, STRUCTURE_KEEPER_LAIR].includes(s.structureType) && !_.includes(FRIENDLIES, s.owner));
        }
        return this._hostileStructures;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'droppedResources', {
    get: function () {
        if (!this._droppedResources) {
            if (!this.hostileCreeps.length) {
                this._droppedResources = this.find(FIND_DROPPED_RESOURCES);
            } else {
                this._droppedResources = this.find(FIND_DROPPED_RESOURCES, {filter: (r) => r.pos.getRangeTo(r.pos.findClosestByRange(this.hostileCreeps)) > 3});
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
            if (!this.hostileCreeps.length) {
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
            if (!this.hostileCreeps.length) {
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
            if (!this.hostileCreeps.length) {
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

// Creates a room prototype that accepts RESOURCE_* Constants that gets you the total of that resource in a room.
// EXAMPLE USAGE - Game.rooms['W0S0'].store(RESOURCE_ENERGY);
Room.prototype.store = function (resource, unused = false) {
    if (!this._resourceStore || this._resourceStore.tick !== Game.time) {
        this._resourceStore = {};
        this._resourceStore.tick = Game.time;
    }
    if (!this._resourceStore[resource]) {
        this._resourceStore[resource] = getRoomResource(this, resource, unused);
    }
    return this._resourceStore[resource];
};

function getRoomResource(room, resource, unused = false) {
    if (!room || !resource) return undefined;
    let count = 0;
    if (!unused) {
        _.filter(room.structures, (s) => s.store && s.store.getUsedCapacity(resource) && s.structureType !== STRUCTURE_NUKER && s.structureType !== STRUCTURE_TOWER &&
            s.structureType !== STRUCTURE_SPAWN && s.structureType !== STRUCTURE_EXTENSION && s.structureType !== STRUCTURE_LAB).forEach((s) => count += s.store.getUsedCapacity(resource));
        _.filter(room.structures, (s) => resource !== RESOURCE_ENERGY && s.store && s.store.getUsedCapacity(resource) && s.structureType === STRUCTURE_LAB && resource !== s.memory.itemNeeded).forEach((s) => count += s.store.getUsedCapacity(resource));
    } else {
        _.filter(room.structures, (s) => s.store && s.store.getUsedCapacity(resource) && (s.structureType === STRUCTURE_STORAGE || s.structureType === STRUCTURE_TERMINAL || s.structureType === STRUCTURE_CONTAINER)).forEach((s) => count += s.store.getUsedCapacity(resource));
    }
    if (!unused || resource !== RESOURCE_ENERGY) _.filter(room.creeps, (c) => c.store[resource]).forEach((c) => count += c.store[resource]);
    _.filter(room.droppedResources, (r) => r.resourceType === resource).forEach((r) => count += r.amount);
    return count;
}

Room.prototype.cacheRoomIntel = function (force = false) {
    if (Memory.roomCache && !force && Memory.roomCache[this.name] && Memory.roomCache[this.name].cached + 1501 > Game.time) return;
    let room = Game.rooms[this.name];
    let nonCombats, mineral, sk, power, portal, user, level, owner, lastOperation, towers,
        reservation, commodity, safemode, hubCheck, spawnLocation, sourceRange, obstructions, seasonResource,
        seasonCollector, swarm, structures, towerCount, sourceRating;
    if (room) {
        if (Memory.roomCache[room.name]) lastOperation = Memory.roomCache[room.name].lastOperation;
        // Check for season resource
        if (Game.shard.name === 'shardSeason') {
            let container = room.find(FIND_SCORE_CONTAINERS)[0];
            let collector = room.find(FIND_SCORE_COLLECTORS)[0];
            if (container) seasonResource = Game.time + container.ticksToDecay;
            // If collector is reachable, mark as 1 else mark as 2
            if (collector) {
                if (collector.pos.countOpenTerrainAround() || collector.pos.findClosestByPath(FIND_EXIT)) seasonCollector = 1; else seasonCollector = 2;
            }
        }
        // Minerals
        if (room.mineral) mineral = room.mineral.mineralType;
        // Make NCP array
        let ncpArray = Memory.ncpArray || [];
        let cache = Memory.roomCache || {};
        let sources = room.sources;
        nonCombats = _.filter(room.creeps, (e) => (!e.getActiveBodyparts(ATTACK) && !e.getActiveBodyparts(RANGED_ATTACK) && (e.getActiveBodyparts(WORK) || e.getActiveBodyparts(CARRY))));
        let combatCreeps = _.filter(room.hostileCreeps, (e) => e.getActiveBodyparts(ATTACK) || e.getActiveBodyparts(RANGED_ATTACK));
        if (_.filter(room.structures, (e) => e.structureType === STRUCTURE_KEEPER_LAIR)[0]) sk = true;
        if (room.controller) {
            // Check if obstructed
            let adjacent = _.filter(Game.map.describeExits(room.name));
            for (let neighbor of adjacent) {
                if (!room.mineral.pos.findClosestByPath(Game.map.findExit(room.name, neighbor))) {
                    obstructions = true;
                    break;
                }
            }
            if (room.controller.safeMode) safemode = room.controller.safeMode + Game.time;
            if (room.controller.owner) {
                owner = room.controller.owner.username;
                user = room.controller.owner.username;
                // Signage NCP check
                if (room.controller.sign) {
                    let text = room.controller.sign.text.toLowerCase();
                    if (text.includes('overmind') || text.includes('tooangel') || text.includes('quorum') || text.includes('ᴏᴠᴇʀᴍɪɴᴅ') || text.includes('jln')) {
                        ncpArray.push(room.controller.sign.username);
                    } else if (_.includes(ncpArray, room.controller.sign.username)) {
                        _.remove(ncpArray, (u) => u === room.controller.sign.username);
                    }
                }
                let spawn = _.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN)[0];
                if (spawn) spawnLocation = JSON.stringify(spawn.pos);
                towers = _.filter(room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.energy > 10 && s.isActive());
                if (towers.length === 1 && !towers[0].pos.checkForRampart() && towers[0].pos.findClosestByPath(FIND_EXIT)) swarm = true;
            } else if (room.controller.reservation) {
                reservation = room.controller.reservation.username;
                user = room.controller.reservation.username;
            } else {
                if (room.controller.pos.countOpenTerrainAround()) {
                    let roomPlanner = require('module.roomPlanner');
                    if (sources.length === 2) {
                        hubCheck = roomPlanner.hubCheck(this);
                        sourceRange = 0;
                        for (let source of sources) {
                            sourceRange += source.pos.getRangeTo(_.filter(room.structures, (s) => s.structureType === STRUCTURE_CONTROLLER)[0]);
                        }
                    }
                }
            }
            level = room.controller.level || undefined;
        }
        // Store portal info
        portal = _.filter(room.structures, (e) => e.structureType === STRUCTURE_PORTAL);
        if (portal.length) {
            let portalArray = [];
            let destinationArray = [];
            for (let obj of portal) {
                if (obj.ticksToDecay && obj.ticksToDecay <= 500) continue;
                if (!_.includes(destinationArray, obj.destination)) destinationArray.push(obj.destination); else continue;
                let decayTick = obj.ticksToDecay + Game.time || 99999999999;
                portalArray.push({decayTick: decayTick, destination: obj.destination})
            }
            if (portalArray.length) portal = JSON.stringify(portalArray); else portal = undefined;
        } else {
            portal = undefined;
        }
        let deposit = _.filter(room.deposits, (d) => d.ticksToDecay >= 2000 && (!d.lastCooldown || d.lastCooldown <= 20))[0];
        // Deposit info
        if (deposit) {
            commodity = true;
        }
        // Store power info
        power = _.filter(room.structures, (e) => e && e.structureType === STRUCTURE_POWER_BANK && e.ticksToDecay > 1000);
        if (power.length && power[0].pos.countOpenTerrainAround() > 1) power = Game.time + power[0].ticksToDecay; else power = undefined;
        // Handle user check for unclaimed
        if (!user && nonCombats.length >= 2) {
            user = nonCombats[0].owner.username;
        }
        // Get closest
        let closestRange = this.findClosestOwnedRoom(true);
        // Handle rating sources for remotes
        if (closestRange <= 3 && sources.length) {
            sourceRating = {};
            for (let source of this.sources) {
                let closest = this.findClosestOwnedRoom();
                let goHome = Game.map.findExit(this.name, closest);
                let homeExit = this.find(goHome);
                let homeMiddle = _.round(homeExit.length / 2);
                let distanceToExit = source.pos.findPathTo(homeExit[homeMiddle]).length
                let roomRange = Game.map.findRoute(this.name, closest).length - 1;
                sourceRating[source.id] = distanceToExit + (roomRange * 50);
            }
        }
        let worthyStructures = _.filter(room.structures, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_KEEPER_LAIR && s.structureType !== STRUCTURE_EXTRACTOR);
        if (towers) towerCount = towers.length;
        if (worthyStructures) structures = worthyStructures.length
        cache[this.name] = cache[this.name] || {};
        cache[this.name] = {
            cached: Game.time,
            name: room.name,
            sources: sources.length,
            mineral: mineral,
            commodity: commodity,
            owner: owner,
            spawnLocation: spawnLocation,
            reservation: reservation,
            level: level,
            sk: sk,
            user: user,
            safemode: safemode,
            portal: portal,
            power: power,
            isHighway: !room.controller && !sk && !room.sources.length,
            closestRange: closestRange,
            closestRoom: this.findClosestOwnedRoom(),
            hubCheck: hubCheck,
            sourceRange: sourceRange,
            obstructions: obstructions,
            lastOperation: lastOperation,
            seasonResource: seasonResource,
            seasonCollector: seasonCollector,
            invaderCore: _.filter(room.structures, (s) => s.structureType === STRUCTURE_INVADER_CORE).length > 0,
            towers: towerCount,
            swarm: swarm,
            structures: structures,
            hostile: combatCreeps.length > 0 || towerCount,
            sourceRating: sourceRating
        };
        Memory.ncpArray = _.uniq(ncpArray);
        Memory.roomCache = cache;
    }
};

let invaderAlert = {};
Room.prototype.invaderCheck = function () {
    if (Memory.roomCache && Memory.roomCache[this.name] && Memory.roomCache[this.name].lastInvaderCheck + 5 > Game.time && !Memory.roomCache[this.name].threatLevel) return;
    if (!Memory.roomCache || !Memory.roomCache[this.name]) this.cacheRoomIntel();
    let previousCheck = Memory.roomCache[this.name].lastInvaderCheck || Game.time;
    Memory.roomCache[this.name].lastInvaderCheck = Game.time;
    let controllingEntity = Memory.roomCache[this.name].owner || Memory.roomCache[this.name].reservation;
    if (controllingEntity && controllingEntity !== MY_USERNAME) return false;
    // No hostile detected
    if (!this.hostileCreeps.length) {
        // Room heat is capped at 1000
        if (Memory.roomCache[this.name].roomHeat > 1000) Memory.roomCache[this.name].roomHeat = 1000;
        let waitOut = 15;
        if (Memory.roomCache[this.name].threatLevel > 3) waitOut = 50;
        // Clear if no waitOut or if not one of your rooms
        let friendlyArmed = _.filter(this.friendlyCreeps, (c) => c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK)).length || 1;
        let reduction = _.ceil((Game.time - previousCheck) / 5) * friendlyArmed;
        if (Memory.roomCache[this.name].lastPlayerSighting + 500 > Game.time) reduction *= 25;
        if (Memory.roomCache[this.name].tickDetected + waitOut < Game.time || Memory.roomCache[this.name].user !== MY_USERNAME) {
            Memory.roomCache[this.name].threatLevel = undefined;
            let roomHeat = (Memory.roomCache[this.name].roomHeat - reduction) || 0;
            if (roomHeat <= 0) {
                Memory.roomCache[this.name].roomHeat = undefined;
            } else {
                Memory.roomCache[this.name].roomHeat = roomHeat;
            }
            Memory.roomCache[this.name].numberOfHostiles = undefined;
            Memory.roomCache[this.name].alertEmail = undefined;
            Memory.roomCache[this.name].friendlyPower = undefined;
            Memory.roomCache[this.name].hostilePower = undefined;
            Memory.roomCache[this.name].requestingSupport = undefined;
            Memory.roomCache[this.name].invaderTTL = undefined;
        }
        return false;
    } else {
        let hostileCombatPower = 0;
        let armedHostiles = _.filter(this.hostileCreeps, (c) => c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK));
        for (let i = 0; i < armedHostiles.length; i++) {
            hostileCombatPower += armedHostiles[i].combatPower;
        }
        let alliedCombatPower = 0;
        let armedFriendlies = _.filter(this.friendlyCreeps, (c) => c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK));
        for (let i = 0; i < armedFriendlies.length; i++) {
            alliedCombatPower += armedFriendlies[i].combatPower;
        }
        Memory.roomCache[this.name].hostilePower = hostileCombatPower || 1;
        Memory.roomCache[this.name].friendlyPower = alliedCombatPower;
        let armedInvader = _.filter(this.hostileCreeps, (c) => c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK) || c.getActiveBodyparts(HEAL) || c.getActiveBodyparts(WORK) >= 4 || c.getActiveBodyparts(CLAIM));
        Memory.roomCache[this.name].tickDetected = Game.time;
        if (!Memory.roomCache[this.name].numberOfHostiles || Memory.roomCache[this.name].numberOfHostiles < this.hostileCreeps.length) {
            Memory.roomCache[this.name].numberOfHostiles = this.hostileCreeps.length || 1;
        }
        // Make owner array
        let ownerArray = [];
        this.hostileCreeps.forEach((c) => ownerArray.push(c.owner.username));
        ownerArray = _.uniq(ownerArray);
        // If Armed Invaders
        if (armedInvader.length) {
            Memory.roomCache[this.name].invaderTTL = _.max(armedInvader, 'ticksToLive').ticksToLive + Game.time;
            Memory.roomCache[this.name].lastInvaderSighting = Game.time;
            if (this.hostileCreeps[0].owner.username !== 'this.hostileCreeps') Memory.roomCache[this.name].lastPlayerSighting = Game.time;
            if (invaderAlert[this.name] + 25 < Game.time) {
                invaderAlert[this.name] = Game.time;
                log.a('Invaders detected in ' + roomLink(this.name) + '. ' + this.hostileCreeps.length +
                    ' creeps detected. (this.hostileCreeps/Friendly Power Present - ' + hostileCombatPower + '/' + alliedCombatPower + ')', 'RESPONSE COMMAND');
            }
        }
        // Determine threat level
        if (!armedInvader.length && (!this.controller || !this.controller.safeMode)) {
            Memory.roomCache[this.name].threatLevel = 0;
        } else if ((this.hostileCreeps.length === 1 && this.hostileCreeps[0].owner.username === 'Invader') || (this.controller && this.controller.safeMode)) {
            Memory.roomCache[this.name].threatLevel = 1;
        } else if (this.hostileCreeps.length > 1 && this.hostileCreeps[0].owner.username === 'Invader' && ownerArray.length === 1 && hostileCombatPower) {
            Memory.roomCache[this.name].threatLevel = 2;
        } else if (armedInvader.length === 1 && this.hostileCreeps[0].owner.username !== 'Invader' && hostileCombatPower) {
            Memory.roomCache[this.name].threatLevel = 3;
            let roomHeat = Memory.roomCache[this.name].roomHeat || 0;
            Memory.roomCache[this.name].roomHeat = roomHeat + (_.sum(this.hostileCreeps, 'body.length') * 0.25);
        } else if (armedInvader.length > 1 && (this.hostileCreeps[0].owner.username !== 'Invader' || ownerArray.length > 1) && hostileCombatPower) {
            Memory.roomCache[this.name].threatLevel = 4;
            let roomHeat = Memory.roomCache[this.name].roomHeat || 0;
            Memory.roomCache[this.name].roomHeat = roomHeat + (_.sum(this.hostileCreeps, 'body.length') * 0.25);
        }
        return Memory.roomCache[this.name].threatLevel > 0;
    }
};

let closestCache = {};
Room.prototype.findClosestOwnedRoom = function (range = false, minLevel = 1) {
    if (!closestCache.length || !closestCache[this.name] || closestCache[this.name].tick + 1000 < Game.time) {
        closestCache[this.name] = {};
        closestCache[this.name].tick = Game.time;
        let distance = 0;
        let closest;
        for (let key of Memory.myRooms) {
            let room = Game.rooms[key];
            if (!room || room.controller.level < minLevel) continue;
            // Handle absurd distances
            let path = Game.map.findRoute(key, this.name).length;
            if (path >= (CREEP_LIFE_TIME / 50)) {
                let currentRoom = this.name;
                let closestPortal = _.sortBy(_.filter(Memory.roomCache, (r) => r.portal), function (f) {
                    Game.map.getRoomLinearDistance(f.name, currentRoom)
                });
                let closest = closestPortal.length - 1;
                if (closestPortal[closest]) {
                    let portalDestination = JSON.parse(Memory.roomCache[closestPortal[closest].name].portal)[0].destination.roomName || JSON.parse(Memory.roomCache[closestPortal[closest].name].portal)[0].destination.room;
                    if (Memory.roomCache[portalDestination]) path = Game.map.getRoomLinearDistance(closestPortal[closest].name, currentRoom) + Memory.roomCache[portalDestination].closestRange;
                }
            }
            if (!path) continue;
            if (!distance) {
                distance = path;
                closest = room.name;
            } else if (path < distance) {
                distance = path;
                closest = room.name;
            }
        }
        if (!closest) closest = _.sample(Game.spawns).room.name;
        if (!distance) distance = Game.map.getRoomLinearDistance(this.name, closest);
        closestCache[this.name].closest = closest;
        closestCache[this.name].distance = distance;
        if (!range) return closest;
        return distance;
    } else {
        if (!range) return closestCache[this.name].closest;
        return closestCache[this.name].distance;
    }
};