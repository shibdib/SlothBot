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

Room.prototype.cacheRoomIntel = function (force = false, creep = undefined) {
    if (!global.INTEL) global.INTEL = {};
    const cache = global.INTEL;
    const currentTime = Game.time;

    // Early exit if data is still valid
    if (!force && cache[this.name] && cache[this.name].cached + CREEP_LIFE_TIME > currentTime) return;

    const roomIntel = cache[this.name] || {
        cached: currentTime,
        name: this.name,
        shardName: Game.shard.name,
        sources: 0,
        obstacles: false,
        invaderCore: false
    };

    // Update cache timestamp
    roomIntel.cached = currentTime;

    // Basic room info
    roomIntel.sources = this.find(FIND_SOURCES).length;
    roomIntel.obstacles = canPathToAllNeighbors(this); // Assuming this method exists or is defined elsewhere
    roomIntel.invaderCore = !!this.find(FIND_STRUCTURES, {filter: {structureType: STRUCTURE_INVADER_CORE}}).length;

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
    if (controller) {
        roomIntel.level = controller.level;
        roomIntel.owner = controller.owner ? controller.owner.username : undefined;
        roomIntel.reservation = controller.reservation ? controller.reservation.username : undefined;
        roomIntel.safemode = controller.safeMode ? currentTime + controller.safeMode : undefined;

        // Hub check - only if necessary and no hostiles
        if (!roomIntel.obstacles && (!cache[this.name] || !cache[this.name].hubCheck) && !this.find(FIND_HOSTILE_CREEPS).length && roomIntel.sources === 2) {
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
        roomIntel.towers = this.find(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_TOWER &&
                s.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST &&
                s.isActive()
        }).length;
        roomIntel.nukeTarget = this.terminal ? this.terminal.pos.toString() : undefined;

        // Loot check
        roomIntel.loot = !this.find(FIND_HOSTILE_CREEPS).length && this.find(FIND_STRUCTURES, {
            filter: s => (s.structureType === STRUCTURE_STORAGE || s.structureType === STRUCTURE_TERMINAL) &&
                _.sum(s.store) > 0 &&
                !s.pos.lookFor(LOOK_STRUCTURES).some(structure => structure.structureType === STRUCTURE_RAMPART)
        }).length > 0;
    } else {
        // Clear controller-related data if no controller
        delete roomIntel.level;
        delete roomIntel.owner;
        delete roomIntel.reservation;
        delete roomIntel.safemode;
        delete roomIntel.hubCheck;
        delete roomIntel.towers;
        delete roomIntel.nukeTarget;
        delete roomIntel.loot;
    }

    // Special room type checks
    const structures = this.find(FIND_STRUCTURES);
    roomIntel.sk = structures.some(s => s.structureType === STRUCTURE_KEEPER_LAIR);
    const deposits = this.find(FIND_DEPOSITS);
    if (roomIntel.sources === 0 && deposits.some(d => d.ticksToDecay >= 2000 && (!d.lastCooldown || d.lastCooldown <= 20))) {
        roomIntel.isHighway = true;
        const commodityDeposit = deposits.find(d => d.ticksToDecay >= 2000 && (!d.lastCooldown || d.lastCooldown <= 20));
        roomIntel.commodity = commodityDeposit ? commodityDeposit.depositType : undefined;
    } else {
        delete roomIntel.isHighway;
        delete roomIntel.commodity;
    }

    // Update cache
    cache[this.name] = roomIntel;
};

/**
 * Checks if paths can be found from the room controller to all neighboring rooms.
 * @param {Room} room - The room to check from.
 * @return {boolean|undefined} - Returns true if paths to all neighbors exist, undefined otherwise.
 */
function canPathToAllNeighbors(room) {
    const controller = room.controller;
    if (!controller) {
        return undefined;
    }
    if (controller.owner && controller.owner.username === MY_USERNAME) {
        // If you want to handle owned rooms differently
        return true; // or another value if you want to skip owned rooms
    }

    const neighbors = Game.map.describeExits(room.name);
    const neighborPositions = Object.keys(neighbors).map(exit => neighbors[exit]);

    for (let neighbor of neighborPositions) {
        // Find the closest exit to the neighbor's center rather than assuming (25, 25)
        const exitDir = Game.map.findExit(room.name, neighbor);
        const exitPos = controller.pos.findClosestByPath(exitDir);

        if (!exitPos) {
            return undefined;
        }

        const path = PathFinder.search(
            controller.pos,
            {pos: exitPos, range: 1}, // Aim for the exit position itself
            {
                maxRooms: 2,
                plainCost: 2,
                swampCost: 10,
                roomCallback: function (roomName) {
                    let room = Game.rooms[roomName];
                    if (!room) return false;
                    let costs = new PathFinder.CostMatrix;

                    room.find(FIND_STRUCTURES).forEach(function (structure) {
                        if (OBSTACLE_OBJECT_TYPES.includes(structure.structureType)) {
                            costs.set(structure.pos.x, structure.pos.y, 255);
                        }
                    });

                    room.getTerrain().getRawBuffer().forEach((tile, i) => {
                        if (tile === TERRAIN_MASK_WALL) {
                            costs.set(i % 50, Math.floor(i / 50), 255);
                        }
                    });

                    return costs;
                }
            }
        );

        if (path.incomplete) {
            return undefined;
        }
    }

    return true;
}


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
    if (roomData.lastInvaderCheck + 15 > Game.time) return;

    roomData.lastInvaderCheck = Game.time;

    // If the room is owned/reserved by someone else or too far from your rooms, clear data
    if (
        (roomData.owner && roomData.owner !== MY_USERNAME) ||
        (roomData.reservation && roomData.reservation !== MY_USERNAME) ||
        findClosestOwnedRoom(this.name, true) > 2
    ) {
        // Reset the room data
        Object.assign(roomData, {
            numberOfHostiles: undefined,
            alertEmail: undefined,
            friendlyPower: undefined,
            hostilePower: undefined,
            requestingSupport: undefined,
            invaderTTL: undefined,
            roomHeat: undefined,
            threatLevel: undefined
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
                invaderTTL: undefined
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
        (creep) => creep.hasActiveBodyparts(ATTACK) || creep.hasActiveBodyparts(RANGED_ATTACK) || creep.hasActiveBodyparts(HEAL) || creep.getActiveBodyparts(WORK) >= 4
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
        if (armedInvaders[0].owner.username === 'Invader' && ownerArray.length === 1) return 2;
        if (armedInvaders[0].owner.username !== 'Invader' && ownerArray.length === 1) {
            roomData.lastPlayerSighting = Game.time;
            return 3;
        }
        if (armedInvaders.length > 1 && (armedInvaders[0].owner.username !== 'Invader' || ownerArray.length > 1)) {
            roomData.lastPlayerSighting = Game.time;
            return 4;
        }
        return 0;
    };

    roomData.threatLevel = updateThreatLevel();

    // Adjust room heat if needed
    if (roomData.threatLevel >= 3) {
        roomData.roomHeat = (roomData.roomHeat || 0) + _.sum(hostileCreeps, 'body.length') * 0.25;
    }

    return roomData.threatLevel > 0;
};