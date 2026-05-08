/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */
'use strict';

const roomPlanner = require('module.roomPlanner');

let hubCache = {};
Object.defineProperty(Room.prototype, 'hub', {
    get: function () {
        if (!this.memory.bunkerHub || !this.memory.bunkerHub.x || !this.memory.bunkerHub.y) return roomPlanner.findHub(this);
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

Object.defineProperty(Room.prototype, 'downgraded', {
    get: function () {
        if (!this._downgraded) {
            this._downgraded = this.find(FIND_STRUCTURES).some((s) => !s.isActive());
        }
        return this._downgraded;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'impassibleStructures', {
    get: function () {
        if (!this._impassibleStructures) {
            this._impassibleStructures = _.filter(this.structures, (s) => OBSTACLE_OBJECT_TYPES.includes(s.structureType) ||
                (s.structureType === STRUCTURE_RAMPART && (!s.owner || !FRIENDLIES.includes(s.owner.username))));
        }
        return this._impassibleStructures;
    },
    enumerable: false,
    configurable: true
});

const ENERGY_STATE_CACHE = {};
Object.defineProperty(Room.prototype, 'energyState', {
    get: function () {
        if (!this.controller) return 2;
        if (ENERGY_STATE_CACHE[this.name] && ENERGY_STATE_CACHE[this.name].tick + 50 > Game.time) return ENERGY_STATE_CACHE[this.name].state;
        let energy = this.rawEnergy;
        const upgradeCost = this.level === 8 ? 250000 : constructionCost(this.controller.level + 1) - constructionCost(this.controller.level);
        let target = this.level === 8 ? 250000 : upgradeCost * (this.controller.progress / this.controller.progressTotal);
        // Scale the target based on how close we are to leveling
        target = Math.max(Math.min(Math.round(target * ((this.controller.progress / this.controller.progressTotal) + 0.1)), STORAGE_CAPACITY * 0.5), this.level * 10000, STORAGE_CAPACITY * 0.7);
        // Target is doubled if we have hostiles
        if (HOSTILES.length > 0) target *= 2;
        if (energy > target * 2 || (!this.storage && !this.terminal && this.controller.level < 4)) {
            this._energyState = 3;
        } else if (energy >= target) {
            this._energyState = 2;
        } else if (energy > target * 0.5) {
            this._energyState = 1;
        } else {
            this._energyState = 0;
        }
        // Handle energy requests
        const requests = ALLY_HELP_REQUESTS[MY_USERNAME] ? ALLY_HELP_REQUESTS[MY_USERNAME].requests : {};
        if (this.terminal && energy < target && ALLY_HELP_REQUESTS[MY_USERNAME]) {
            let resourceRequests = requests.resource ? requests.resource : [];
            if (resourceRequests) {
                resourceRequests = resourceRequests.filter((r) => (r.resourceType !== RESOURCE_ENERGY && r.roomName === this.name) || r.roomName !== this.name);
                resourceRequests.push({
                    resourceType: RESOURCE_ENERGY,
                    amount: (target * 1.2) - energy,
                    priority: 1 - (energy / target),
                    roomName: this.name
                });
                ALLY_HELP_REQUESTS[MY_USERNAME].requests.resource = resourceRequests;
            }
        } else if (ALLY_HELP_REQUESTS[MY_USERNAME]) {
            const resourceRequests = requests.resource ? requests.resource : [];
            const request = resourceRequests.find((r) => r.resourceType === RESOURCE_ENERGY && r.roomName === this.name);
            if (request) {
                resourceRequests.splice(resourceRequests.indexOf(request), 1);
                ALLY_HELP_REQUESTS[MY_USERNAME].requests.resource = resourceRequests;
            }
        }
        ENERGY_STATE_CACHE[this.name] = {state: this._energyState, tick: Game.time};
        return this._energyState;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'hostileStructures', {
    get: function () {
        if (!this._hostileStructures) {
            this._hostileStructures = _.filter(this.structures, (s) => !s.my && s.owner &&
                ![STRUCTURE_CONTROLLER, STRUCTURE_KEEPER_LAIR, STRUCTURE_POWER_BANK, STRUCTURE_ROAD].includes(s.structureType)
                && (!s.owner || !FRIENDLIES.includes(s.owner.username)));
        }
        return this._hostileStructures;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'droppedResources', {
    get: function () {
        if (!this._droppedResources) {
            this._droppedResources = this.find(FIND_DROPPED_RESOURCES, {filter: (r) => r.resourceType !== RESOURCE_ENERGY});
        }
        return this._droppedResources;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'droppedEnergy', {
    get: function () {
        if (!this._droppedEnergy) {
            if (this.hostileCreeps.length) {
                this._droppedEnergy = this.find(FIND_DROPPED_RESOURCES, {filter: (r) => r.resourceType === RESOURCE_ENERGY && r.pos.getRangeTo(r.pos.findClosestByRange(this.hostileCreeps)) > 3});
            } else {
                this._droppedEnergy = this.find(FIND_DROPPED_RESOURCES, {filter: (r) => r.resourceType === RESOURCE_ENERGY});
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
            this._Hostilecreeps = _.filter(this.creeps, (c) => !c.my && (!FRIENDLIES.includes(c.owner.username) || HOSTILES.includes(c.owner.username)) && c.owner.username !== 'Source Keeper');
            this._Hostilecreeps = this._Hostilecreeps.concat(_.filter(this.powerCreeps, (c) => !c.my && (!FRIENDLIES.includes(c.owner.username) || HOSTILES.includes(c.owner.username))));
        }
        return this._Hostilecreeps;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'friendlyCreeps', {
    get: function () {
        if (!this._friendlyCreeps) {
            this._friendlyCreeps = _.filter(this.creeps, (c) => (_.includes(FRIENDLIES, c.owner.username) || c.my) && !_.includes(THREATS, c.owner.username));
        }
        return this._friendlyCreeps;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'alliedCreeps', {
    get: function () {
        if (!this._alliedCreeps) {
            this._alliedCreeps = _.filter(this.creeps, (c) => !c.my && _.includes(FRIENDLIES, c.owner.username) && !_.includes(THREATS, c.owner.username));
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
            if (this.hostileCreeps.length) {
                this._tombstones = this.find(FIND_TOMBSTONES, {filter: (r) => r.pos.getRangeTo(r.pos.findClosestByRange(this.hostileCreeps)) > 3});
            } else {
                this._tombstones = this.find(FIND_TOMBSTONES);
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
            this._energy = this.store(RESOURCE_ENERGY, true) + ((this.store(RESOURCE_BATTERY) / 50) * 600);
        }
        return this._energy;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'rawEnergy', {
    get: function () {
        if (!this._rawEnergy) {
            this._rawEnergy = this.store(RESOURCE_ENERGY, true);
        }
        return this._rawEnergy;
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

    // Instead of filtering the massive impassibleStructures array multiple times, we iterate once
    for (const s of room.impassibleStructures) {
        if (!s.store) continue;
        const used = s.store.getUsedCapacity(resource);
        if (used === 0) continue;

        if (!unused) {
            if (s.structureType !== STRUCTURE_NUKER && s.structureType !== STRUCTURE_TOWER && s.structureType !== STRUCTURE_SPAWN && s.structureType !== STRUCTURE_EXTENSION) {
                count += used;
            }
        } else {
            if (s.structureType === STRUCTURE_STORAGE || s.structureType === STRUCTURE_TERMINAL || s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_FACTORY) {
                count += used;
            }
        }
    }

    if (!unused || resource !== RESOURCE_ENERGY) {
        for (const c of room.myCreeps) {
            if (c.store[resource]) count += c.store[resource];
        }
    }

    for (const r of room.droppedResources) {
        if (r.resourceType === resource) count += r.amount;
    }

    return count;
}

Room.prototype.cacheRoomIntel = function (force = false, creep = undefined) {
    const currentTime = Game.time;

    const roomIntel = INTEL[this.name] || {
        name: this.name,
        shardName: Game.shard.name
    };
    roomIntel.lastObservation = currentTime;

    if (!roomIntel.microUpdate || roomIntel.microUpdate + 150 < currentTime) {
        const structures = this.find(FIND_STRUCTURES);
        const deposits = this.find(FIND_DEPOSITS);
        // Check for invader core
        const invaderCore = structures.find(s => s.structureType === STRUCTURE_INVADER_CORE);
        if (invaderCore) {
            const ticks = invaderCore.effects.find(e => e.effect === EFFECT_COLLAPSE_TIMER) ? Game.time + invaderCore.effects.find(e => e.effect === EFFECT_COLLAPSE_TIMER).ticksRemaining :
                invaderCore.effects.find(e => e.effect === EFFECT_INVULNERABILITY) ? Game.time + 50000 + invaderCore.effects.find(e => e.effect === EFFECT_INVULNERABILITY).ticksRemaining : undefined;
            roomIntel.invaderCore = ticks;
        } else {
            roomIntel.invaderCore = undefined;
        }
        // Update user and controller information
        roomIntel.user = this.user;
        if (this.controller) {
            const newOwner = this.controller.owner ? this.controller.owner.username : undefined;
            if (newOwner !== roomIntel.owner) roomIntel.ownerChanged = true; // triggers areExitsReachable re-run
            roomIntel.owner = newOwner;
            if (roomIntel.owner) {
                roomIntel.attackDirection = determineBestAttackRoute(this);
            }
            roomIntel.reservation = this.controller.reservation ? this.controller.reservation.username : undefined;
        }
        // Check for highway-related intel
        if (this.sources.length === 0) {
            // Commodities
            const commodityDeposit = deposits.find(d => d.ticksToDecay >= 2000);
            roomIntel.commodity = commodityDeposit ? commodityDeposit.depositType : undefined;
            roomIntel.commodityCooldown = commodityDeposit ? commodityDeposit.lastCooldown : undefined;
            // Power
            const powerBank = structures.find(s => s.structureType === STRUCTURE_POWER_BANK);
            roomIntel.power = powerBank ? Game.time + powerBank.ticksToDecay : undefined;
            // Portals
            const portal = structures.find(s => s.structureType === STRUCTURE_PORTAL);
            roomIntel.portal = portal ? JSON.stringify({
                destination: portal.destination,
                ticks: portal.ticksToDecay
            }) : undefined;
        }
        // Check for hostile creeps with attack capabilities
        roomIntel.armedHostile = this.hostileCreeps.length > 0 && _.some(this.hostileCreeps, c =>
            c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)
        ) ? Game.time : undefined;
        // Check for towers in SK rooms
        if (roomIntel.sk) {
            const towers = structures.filter(s => s.structureType === STRUCTURE_TOWER);
            if (towers.length) {
                purgeBadRoute(this.name);
                roomIntel.towers = towers.length;
                roomIntel.towerData = this.towerData(towers);
            } else {
                roomIntel.towers = undefined;
                roomIntel.towerData = undefined;
            }
        }

        // Get remote source data for the highest level room declaring this a remote
        if (this.sources.length && roomIntel.remoteRoom && (!ROOM_REMOTE_TARGETS[roomIntel.remoteRoom] || !ROOM_REMOTE_TARGETS[roomIntel.remoteRoom].find(s => s.room === this.name))) {
            let lowestScore;
            let lowestRoom = roomIntel.remoteRoom[0];
            for (const source of this.sources) {
                for (const room of roomIntel.remoteRoom) {
                    if (!MY_ROOMS.includes(room)) continue;
                    let distanceToExit = calculateDistanceToHub(this, source, room);
                    if (!lowestScore || distanceToExit < lowestScore) {
                        lowestScore = distanceToExit;
                        lowestRoom = room;
                    }
                }
                if (lowestScore) updateRemoteSourceData(this, lowestRoom, source, lowestScore);
            }
            if (INTEL[roomIntel.remoteRoom]) INTEL[roomIntel.remoteRoom].refreshRemotes = true;
            roomIntel.activeRemote = Game.time;
        }

        // Update micro update timestamp and cache
        roomIntel.microUpdate = currentTime;
        INTEL[this.name] = roomIntel;
    }

    // Early exit if data is still valid
    if (!force && INTEL[this.name] && INTEL[this.name].cached + (CREEP_LIFE_TIME * 5) > currentTime) return INTEL[this.name] = roomIntel;

    // Update cache timestamp
    roomIntel.cached = currentTime;

    // Basic room info
    roomIntel.sources = this.sources.length;
    // areExitsReachable is expensive (20-40 PathFinder searches); only run when unknown or ownership changed
    if (roomIntel.obstacles === undefined || roomIntel.ownerChanged) {
        roomIntel.obstacles = !areExitsReachable(this);
        roomIntel.ownerChanged = undefined;
    }
    // Terrain never changes — compute once and cache permanently
    if (roomIntel.swampRoom === undefined) roomIntel.swampRoom = swampRoom(this.name);

    // Minerals
    const mineral = this.find(FIND_MINERALS)[0];
    if (mineral) {
        roomIntel.mineral = mineral.mineralType;
        roomIntel.mineralAmount = mineral.mineralAmount;
    } else {
        delete roomIntel.mineral;
        delete roomIntel.mineralAmount;
    }

    // Controller data
    const controller = this.controller;
    roomIntel.user = this.user;
    if (controller) {
        roomIntel.level = controller.level;
        roomIntel.owner = controller.owner ? controller.owner.username : undefined;
        roomIntel.reservation = controller.reservation ? controller.reservation.username : undefined;
        roomIntel.safemode = controller.safeMode ? currentTime + controller.safeMode : undefined;

        // Hub check is expensive — only run once per room (result is structural, doesn't change)
        if (!roomIntel.hubCheck && !roomIntel.obstacles && roomIntel.sources === 2 && !this.find(FIND_HOSTILE_CREEPS).length) {
            roomIntel.hubCheck = roomPlanner.hubCheck(this);
        }

        // NCP signage
        if (controller.sign && controller.sign.text) {
            const signText = controller.sign.text.toLowerCase();
            if (["overmind", "tooangel", "quorum", "ᴏᴠᴇʀᴍɪɴᴅ", "jln"].some(word => signText.includes(word))) {
                if (!Memory.ncpArray) Memory.ncpArray = [];
                Memory.ncpArray = _.uniq(Memory.ncpArray.concat([controller.sign.username]));
            }
        }

        // Tower and terminal checks
        const towers = this.structures.filter((s) => s.structureType === STRUCTURE_TOWER &&
            s.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST &&
            s.isActive())
        if (towers.length) {
            purgeBadRoute(this.name);
            roomIntel.towers = towers.length;
            roomIntel.towerData = this.towerData(towers);
            roomIntel.nukeTarget = this.terminal ? this.terminal.pos.toString() : this.storage ? this.storage.pos.toString() : undefined;
        } else {
            roomIntel.towers = undefined;
            roomIntel.towerData = undefined;
        }

        // Loot check
        roomIntel.loot = !this.hostileCreeps.length && this.structures.some(
            s => (s.structureType === STRUCTURE_STORAGE || s.structureType === STRUCTURE_TERMINAL) &&
                _.sum(s.store) > 0 &&
                !s.pos.lookFor(LOOK_STRUCTURES).some(structure => structure.structureType === STRUCTURE_RAMPART)
        );
    } else {
        // Clear controller-related data if no controller
        delete roomIntel.level;
        delete roomIntel.attackDirection;
        delete roomIntel.owner;
        delete roomIntel.reservation;
        delete roomIntel.safemode;
        delete roomIntel.hubCheck;
        delete roomIntel.nukeTarget;
        delete roomIntel.loot;
    }

    // Special room type checks
    roomIntel.sk = this.structures.some(s => s.structureType === STRUCTURE_KEEPER_LAIR);
    roomIntel.isHighway = roomIntel.sources === 0;
    if (roomIntel.sources !== 0) {
        delete roomIntel.isHighway;
        delete roomIntel.commodity;
        delete roomIntel.power;
    }

    // Update cache
    INTEL[this.name] = roomIntel;

    function swampRoom(roomName) {
        const terrain = Game.map.getRoomTerrain(roomName);
        let swampCount = 0;
        let plainsCount = 0;
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                const tile = terrain.get(x, y);
                if (tile === TERRAIN_MASK_SWAMP) {
                    swampCount++;
                } else if (tile === 0) {
                    plainsCount++;
                }
            }
        }
        return swampCount > plainsCount;
    }

    function calculateDistanceToHub(room, source, targetRoom) {
        if (!Game.rooms[targetRoom] || !Game.rooms[targetRoom].memory) return Infinity;
        const storage = Game.rooms[targetRoom] ? Game.rooms[targetRoom].storage : undefined;
        const target = storage ? storage : Game.rooms[targetRoom].memory.bunkerHub ?
            new RoomPosition(Game.rooms[targetRoom].memory.bunkerHub.x, Game.rooms[targetRoom].memory.bunkerHub.y, targetRoom) : new RoomPosition(25, 25, targetRoom);
        // Use path cost normalised by plainCost (2) to get plain-tile-equivalent ticks,
        // so swamp tiles (cost 10 → 5 ticks each) are priced correctly for half-move haulers
        const pathResult = source.pos.shibMove(target);
        return Math.ceil(pathResult.cost / 2);
    }

    function updateRemoteSourceData(room, roomName, source, distance) {
        const remoteTargets = ROOM_REMOTE_TARGETS[roomName] || [];
        if (!remoteTargets.find(s => s.source === source.id)) {
            remoteTargets.push({
                room: room.name,
                source: source.id,
                score: distance
            });
        }
        ROOM_REMOTE_TARGETS[roomName] = remoteTargets;
    }

    function areExitsReachable(room) {
        if (!room.controller) {
            return true;
        }
        const exits = Object.values(Game.map.describeExits(room.name));
        for (let exitRoom of exits) {
            const exitPositions = room.find(room.findExitTo(exitRoom));
            if (exitPositions.length === 0) continue;
            let pathsFound = false;
            for (let exitPos of exitPositions) {
                const path = PathFinder.search(
                    room.controller.pos,
                    {pos: exitPos, range: 0},
                    {
                        maxOps: 5000,
                        plainCost: 1,
                        swampCost: 1,
                        roomCallback: function (roomName) {
                            let room = Game.rooms[roomName];
                            if (!room) return false;
                            let costs = new PathFinder.CostMatrix;
                            room.find(FIND_STRUCTURES).forEach(function (s) {
                                if (_.union(OBSTACLE_OBJECT_TYPES, [STRUCTURE_RAMPART]).includes(s.structureType)) {
                                    costs.set(s.pos.x, s.pos.y, Infinity);
                                }
                            });
                            room.find(FIND_CREEPS).forEach(function (c) {
                                costs.set(c.pos.x, c.pos.y, 0);
                            });
                            return costs;
                        }
                    }
                );
                if (!path.incomplete) {
                    pathsFound = true;
                    break;
                }
            }
            if (!pathsFound) {
                return false;
            }
        }
        return true;
    }

    function determineBestAttackRoute(room) {
        const barriers = room.structures.filter(s => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL);
        if (!barriers.length) return undefined;
        const roomExits = Object.values(Game.map.describeExits(room.name));
        const viableExits = roomExits.filter(exit => !INTEL[exit] || !INTEL[exit].owner || INTEL[exit].owner === MY_USERNAME);
        if (viableExits.length > 0) {
            let bestExit = room.findExitTo(viableExits[0]);
            let lowestBarrierCount = 0;
            for (const exit of viableExits) {
                const exitDirection = room.findExitTo(exit);
                const exitTiles = room.find(exitDirection);
                exitTiles.filter((t) => t.getRangeTo(t.findClosestByRange(barriers)) > 2);
                if (!exitTiles.length) continue;
                const exitTile = exitTiles[0];
                const attackRoute = room.findPath(room.controller.pos, exitTile, {
                    ignoreCreeps: true,
                    ignoreDestructibleStructures: true,
                    ignoreRoads: true
                });
                let barrierCount = 0;
                attackRoute.forEach(tile => {
                    tile = new RoomPosition(tile.x, tile.y, room.name);
                    if (tile.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL)) {
                        barrierCount += 1;
                    }
                })
                if (barrierCount <= lowestBarrierCount) {
                    lowestBarrierCount = barrierCount;
                    bestExit = Game.map.describeExits(room.name)[exitDirection];
                }
            }
            return bestExit;
        }
    }
};


let invaderAlert = {};

/**
 * Check for invaders
 * @returns {boolean}
 */
Room.prototype.invaderCheck = function () {
    if (!INTEL[this.name]) return false;

    const roomData = INTEL[this.name];
    const {hostileCreeps, friendlyCreeps} = this;
    const previousCheck = roomData.lastInvaderCheck || Game.time;

    // If invader check is recent, return early
    const cooldown = !!this.hostileCreeps.length ? 3 : 15;
    if (roomData.lastInvaderCheck + cooldown > Game.time) return false;

    roomData.lastInvaderCheck = Game.time;

    // If the room is owned/reserved by someone else or too far from your rooms, clear data
    if ((roomData.owner && roomData.owner !== MY_USERNAME) || (roomData.reservation && roomData.reservation !== MY_USERNAME)
        || findClosestOwnedRoom(this.name, true) > 2) {
        // Reset the room data
        Object.assign(roomData, {
            numberOfHostiles: undefined,
            alertEmail: undefined,
            friendlyPower: undefined,
            hostilePower: undefined,
            requestingSupport: undefined,
            invaderTTL: undefined,
            roomHeat: undefined,
            threatLevel: undefined,
            hostileOwners: undefined
        });
        return false;
    }

    // No hostile creeps detected
    if (!hostileCreeps.length) {
        roomData.lastInvaderSighting = undefined;
        if (!roomData.roomHeat && !roomData.threatLevel) return false;

        // Cap room heat at 1000
        roomData.roomHeat = Math.min(roomData.roomHeat, 1000);

        const waitOut = 5;
        let reduction = _.ceil((Game.time - previousCheck) / 5) * friendlyCreeps.length + 1;
        if (roomData.lastPlayerSighting + 500 > Game.time) reduction *= 25;

        if (roomData.tickDetected + waitOut < Game.time || roomData.user !== MY_USERNAME) {
            roomData.threatLevel = undefined;
            roomData.roomHeat = Math.max(roomData.roomHeat - reduction, 0) || undefined;

            // Clear other fields
            Object.assign(roomData, {
                numberOfHostiles: undefined,
                alertEmail: undefined,
                friendlyPower: undefined,
                hostilePower: undefined,
                requestingSupport: undefined,
                invaderTTL: undefined,
                hostileOwners: undefined
            });
        }
        return false;
    }

    // Calculate combat powers
    const hostileCombatPower = _.sum(
        _.filter(hostileCreeps, (creep) => creep.hasActiveBodyparts(ATTACK) || creep.hasActiveBodyparts(RANGED_ATTACK)),
        'combatPower'
    );

    const alliedCombatPower = _.sum(
        _.filter(friendlyCreeps, (creep) => creep.hasActiveBodyparts(ATTACK) || creep.hasActiveBodyparts(RANGED_ATTACK)),
        'combatPower'
    );

    roomData.hostilePower = hostileCombatPower || 1;
    roomData.friendlyPower = alliedCombatPower;

    const armedInvaders = _.filter(
        hostileCreeps,
        (creep) => creep.hasActiveBodyparts(ATTACK) || creep.hasActiveBodyparts(RANGED_ATTACK) || creep.hasActiveBodyparts(HEAL) || creep.getActiveBodyparts(WORK)
    );

    roomData.tickDetected = Game.time;

    // Update hostiles count
    roomData.numberOfHostiles = Math.max(roomData.numberOfHostiles || 0, hostileCreeps.length);

    // Record hostile owners
    const ownerArray = _.uniq(hostileCreeps.map((creep) => creep.owner.username));

    // Handle armed invaders
    if (armedInvaders.length) {
        roomData.invaderTTL = Math.max(...armedInvaders.map((creep) => creep.ticksToLive)) + Game.time;
        roomData.lastInvaderSighting = Game.time;

        if (invaderAlert[this.name] + 25 < Game.time) {
            invaderAlert[this.name] = Game.time;
            log.a(
                `Invaders detected in ${roomLink(this.name)}. ${hostileCreeps.length} creeps detected. (Hostile/Friendly Power: ${hostileCombatPower}/${alliedCombatPower})`,
                'RESPONSE COMMAND'
            );
        }
    }

    // Determine threat level
    const updateThreatLevel = () => {
        if (!armedInvaders.length) return 1;
        const boosted = armedInvaders.find((c) => c.owner.username !== 'Invader' && c.body.find((b) => b.type === HEAL && b.boost));
        if (armedInvaders.length > 1 && (armedInvaders[0].owner.username !== 'Invader' || ownerArray.length > 1)) {
            roomData.lastPlayerSighting = Game.time;
            roomData.lastMajorAttack = Game.time;
            roomData.hostileOwners = ownerArray;
            return boosted ? 5 : 4;
        } else if (armedInvaders[0].owner.username !== 'Invader' && ownerArray.length === 1) {
            roomData.lastPlayerSighting = Game.time;
            roomData.hostileOwners = ownerArray;
            return 3;
        } else if (armedInvaders[0].owner.username === 'Invader' && ownerArray.length === 1) return 2;
        else return 0;
    };

    roomData.threatLevel = updateThreatLevel();

    // Adjust room heat if needed
    if (roomData.threatLevel >= 3) {
        roomData.roomHeat = (roomData.roomHeat || 0) + _.sum(hostileCreeps, 'body.length') * 0.25;
    }

    return roomData.threatLevel > 0;
};

Room.prototype.towerData = function (towers) {
    if (!towers || !towers.length) return {maxDamage: 0, position: undefined, average: 0};
    const terrain = Game.map.getRoomTerrain(this.name);
    let maxDamage = 0;
    let dangerousSpot;
    const damageTracker = [];
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                const pos = new RoomPosition(x, y, this.name);
                let damage = 0;
                towers.forEach(t => damage += determineDamage(pos.getRangeTo(t)));
                damageTracker.push(damage);
                if (damage > maxDamage) {
                    maxDamage = damage;
                    dangerousSpot = pos;
                }
            }
        }
    }

    const sorted = damageTracker.slice().sort((a, b) => a - b);
    const p75 = sorted[Math.floor(sorted.length * 0.75)];

    return {
        maxDamage,
        position: dangerousSpot ? {
            x: dangerousSpot.x,
            y: dangerousSpot.y,
            roomName: dangerousSpot.roomName
        } : undefined,
        average: p75
    };

    function determineDamage(range) {
        return TOWER_POWER_FROM_RANGE(range, TOWER_POWER_ATTACK);
    }
}

Room.prototype.boostCheck = function (body = undefined, parts = undefined, tier = undefined, partCount = 1) {
    // Handle bodys
    if (body && body.includes(ATTACK) && !checkBoostType(this, ATTACK, tier)) return false;
    if (body && body.includes(HEAL) && !checkBoostType(this, HEAL, tier)) return false;
    //if (body && body.includes(RANGED_ATTACK) && !checkBoostType(this, RANGED_ATTACK, tier)) return false;
    // Part lookup
    return !(parts && !checkBoostType(this, parts, tier));


    function checkBoostType(room, part, tier = undefined) {
        const needed = 30 * (body && body.length ? body.filter((p) => p === part).length : partCount);
        if (body && body.length && tier === undefined) {
            for (const boost of BOOST_USE[part]) {
                if (room.store(boost) >= needed) return true;
            }
            return false;
        }
        return room.store(BOOST_USE[part][tier]) >= needed;
    }
}