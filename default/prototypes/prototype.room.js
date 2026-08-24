/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Refactored & Deep-Dived by Grok (xAI) - May 2026
 *
 * Version 2.0 - Major CPU + Intel Collection Improvements
 *
 * CPU Wins:
 * - Expensive areExitsReachable now runs only on ownership change or force (biggest win)
 * - Single-pass resource counting in getRoomResource
 * - Smarter caching for towerData, swampRoom, attack routes
 * - Reduced find/filter calls in invaderCheck and cacheRoomIntel
 * - Combined structure scans where possible
 *
 * Intel Collection Focus:
 * - Much lighter micro-updates
 * - Expensive pathfinding heavily throttled
 * - Remote source data only refreshed when needed
 * - Cleaner separation of light vs heavy intel
 */

'use strict';

const roomPlanner = require('module.roomPlanner');
const remoteMining = require('remoteMining');

function safeOwnerName(creep) {
    try {
        return creep.owner && creep.owner.username;
    } catch (e) {
        return undefined;
    }
}

function safeIsMy(creep) {
    try {
        return !!creep.my;
    } catch (e) {
        return false;
    }
}

function safeStructureOwner(structure) {
    if (!structure || !(structure instanceof OwnedStructure)) return undefined;
    try {
        return structure.owner && structure.owner.username;
    } catch (e) {
        return undefined;
    }
}

function safeStructureMy(structure) {
    if (!structure || !(structure instanceof OwnedStructure)) return false;
    try {
        return !!structure.my;
    } catch (e) {
        return false;
    }
}

function safeStructureIsActive(structure) {
    try {
        return structure.isActive();
    } catch (e) {
        return false;
    }
}

function armedTowers(room) {
    const list = room.towers || [];
    const out = [];
    for (let i = 0; i < list.length; i++) {
        const s = list[i];
        try {
            if (s.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST && safeStructureIsActive(s)) out.push(s);
        } catch (e) { /* inaccessible */
        }
    }
    return out;
}

let hubCache = {};
Object.defineProperty(Room.prototype, 'hub', {
    get: function () {
        // C4: plan.anchors.hub first, then legacy bunkerHub (getHub), else search.
        let xy = null;
        try {
            xy = require('planDoc').getHub(this);
        } catch (e) {
            xy = this.memory.bunkerHub;
        }
        if (!xy || typeof xy.x !== 'number' || typeof xy.y !== 'number') {
            return roomPlanner.findHub(this);
        }
        if (!this._hub) {
            const key = xy.x + ',' + xy.y;
            if (!hubCache[this.name] || hubCache[this.name] !== key) {
                hubCache[this.name] = key;
            }
            this._hub = new RoomPosition(xy.x, xy.y, this.name);
        } else if (this._hub.x !== xy.x || this._hub.y !== xy.y) {
            this._hub = new RoomPosition(xy.x, xy.y, this.name);
            hubCache[this.name] = xy.x + ',' + xy.y;
        }
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
        if (!this._sources) {
            if (!sourceCache[this.name]) sourceCache[this.name] = this.find(FIND_SOURCES).map(source => source.id);
            this._sources = sourceCache[this.name].map(id => Game.getObjectById(id));
        }
        return this._sources;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'deposits', {
    get: function () {
        if (!this._deposits) this._deposits = this.find(FIND_DEPOSITS);
        return this._deposits;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'nukes', {
    get: function () {
        if (!this._nukes) this._nukes = this.find(FIND_NUKES);
        return this._nukes;
    },
    enumerable: false,
    configurable: true
});

let mineralCache = {};
Object.defineProperty(Room.prototype, 'mineral', {
    get: function () {
        if (!this._mineral) {
            if (!mineralCache[this.name]) {
                const minerals = this.find(FIND_MINERALS);
                mineralCache[this.name] = minerals[0]?.id;
            }
            this._mineral = Game.getObjectById(mineralCache[this.name]);
        }
        return this._mineral;
    },
});

Object.defineProperty(Room.prototype, 'structures', {
    get: function () {
        if (!this._structures || this._structures_ts !== Game.time) {
            this._structures = global.roomStructuresFromGame
                ? global.roomStructuresFromGame(this)
                : this.find(FIND_STRUCTURES);
            this._structures_ts = Game.time;
        }
        return this._structures;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'barriers', {
    get: function () {
        if (!this._barriers || this._barriers_ts !== Game.time) {
            this._barriers = global.collectRoomBarriers
                ? global.collectRoomBarriers(this)
                : this.ramparts.concat(this.constructedWalls || []).filter(Boolean);
            this._barriers_ts = Game.time;
        }
        return this._barriers;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'downgraded', {
    get: function () {
        if (this._downgraded === undefined) {
            try {
                const structs = global.roomStructuresFromGame
                    ? global.roomStructuresFromGame(this)
                    : this.find(FIND_STRUCTURES);
                this._downgraded = structs.some(s => !safeStructureIsActive(s));
            } catch (e) {
                this._downgraded = true;
            }
        }
        return this._downgraded;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'impassibleStructures', {
    get: function () {
        if (!this._impassibleStructures || this._impassibleStructures_ts !== Game.time) {
            this._impassibleStructures = _.filter(this.structures, s => {
                if (OBSTACLE_OBJECT_TYPES.includes(s.structureType)) return true;
                if (s.structureType !== STRUCTURE_RAMPART) return false;
                const owner = safeStructureOwner(s);
                return !owner || !FRIENDLIES.includes(owner);
            });
            this._impassibleStructures_ts = Game.time;
        }
        return this._impassibleStructures;
    },
    enumerable: false,
    configurable: true
});

const ENERGY_STATE_CACHE = {};
const ENERGY_STATE_CACHE_TTL = 25;
Object.defineProperty(Room.prototype, 'energyState', {
    get: function () {
        if (this._spawnEnergyState !== undefined) return this._spawnEnergyState;
        if (this._energyStateTick === Game.time) return this._energyStateCached;

        const spawn = global.roomMySpawns
            ? global.roomMySpawns(this)[0]
            : _.find(this.spawns, s => safeStructureMy(s));
        if (!this.controller || !spawn) {
            this._energyStateTick = Game.time;
            this._energyStateCached = 2;
            return 2;
        }
        if (ENERGY_STATE_CACHE[this.name] && ENERGY_STATE_CACHE[this.name].tick + ENERGY_STATE_CACHE_TTL > Game.time) {
            this._energyStateTick = Game.time;
            this._energyStateCached = ENERGY_STATE_CACHE[this.name].state;
            return this._energyStateCached;
        }

        const batteryEquiv = Math.floor((this.store(RESOURCE_BATTERY) / 50) * 600 * 0.9);
        let energy = this.rawEnergy + batteryEquiv;
        const upgradeCost = this.level === 8 ? 500000 : constructionCost(this.controller.level + 1) - constructionCost(this.controller.level);
        const progressFraction = this.controller.progress / this.controller.progressTotal;
        let target = this.level === 8 ? 500000 : Math.max(this.level * 31250, Math.min(Math.round(upgradeCost * progressFraction) * 0.7, STORAGE_CAPACITY * 0.5));

        if (energy > target * 1.5 || (!this.storage && !this.terminal && this.level < 4)) this._energyState = 3;
        else if (energy >= target) this._energyState = 2;
        else if (energy > target * 0.5) this._energyState = 1;
        else this._energyState = 0;

        // Allies deliver to the market hub; the internal network moves stock from there.
        const isMarketHub = Memory._banker && Memory._banker.marketHub === this.name;
        if (isMarketHub && this.terminal && energy < target * 0.5 && ALLY_HELP_REQUESTS[MY_USERNAME]) {
            const bucket = ALLY_HELP_REQUESTS[MY_USERNAME].requests || (ALLY_HELP_REQUESTS[MY_USERNAME].requests = {});
            const requests = bucket.resource || (bucket.resource = []);
            const amount = Math.round((target * 1.2) - energy);
            const priority = 1 - (energy / target);
            const existing = requests.find(r => r.resourceType === RESOURCE_ENERGY && r.roomName === this.name);
            if (!existing) {
                requests.push({resourceType: RESOURCE_ENERGY, amount, priority, roomName: this.name, terminal: true});
            } else if (existing.amount !== amount || existing.priority !== priority || existing.terminal !== true) {
                existing.amount = amount;
                existing.priority = priority;
                existing.terminal = true;
            }
        } else if (ALLY_HELP_REQUESTS[MY_USERNAME] && ALLY_HELP_REQUESTS[MY_USERNAME].requests) {
            const requests = ALLY_HELP_REQUESTS[MY_USERNAME].requests.resource;
            if (requests && requests.length) {
                const idx = requests.findIndex(r => r.resourceType === RESOURCE_ENERGY && r.roomName === this.name);
                if (idx !== -1) requests.splice(idx, 1);
            }
        }

        ENERGY_STATE_CACHE[this.name] = {state: this._energyState, tick: Game.time};
        this._energyStateTick = Game.time;
        this._energyStateCached = this._energyState;
        return this._energyState;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'hostileStructures', {
    get: function () {
        if (!this._hostileStructures || this._hostileStructures_ts !== Game.time) {
            this._hostileStructures = _.filter(this.structures, s => {
                if ([STRUCTURE_CONTROLLER, STRUCTURE_KEEPER_LAIR, STRUCTURE_POWER_BANK, STRUCTURE_ROAD].includes(s.structureType)) return false;
                const owner = safeStructureOwner(s);
                if (!owner || safeStructureMy(s) || owner === MY_USERNAME) return false;
                return !FRIENDLIES.includes(owner);
            });
            this._hostileStructures_ts = Game.time;
        }
        return this._hostileStructures;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'droppedResources', {
    get: function () {
        if (!this._droppedResources) this._droppedResources = this.find(FIND_DROPPED_RESOURCES, {filter: r => r.resourceType !== RESOURCE_ENERGY});
        return this._droppedResources;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'droppedEnergy', {
    get: function () {
        if (!this._droppedEnergy) {
            const hostiles = this.hostileCreeps;
            if (hostiles.length) {
                this._droppedEnergy = this.find(FIND_DROPPED_RESOURCES, {filter: r => r.resourceType === RESOURCE_ENERGY && hostiles.every(h => r.pos.getRangeTo(h) > 3)});
            } else {
                this._droppedEnergy = this.find(FIND_DROPPED_RESOURCES, {filter: r => r.resourceType === RESOURCE_ENERGY});
            }
        }
        return this._droppedEnergy;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'creeps', {
    get: function () {
        if (!this._creeps) this._creeps = this.find(FIND_CREEPS);
        return this._creeps;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'myCreeps', {
    get: function () {
        if (!this._myCreeps) {
            this._myCreeps = this.creeps.filter(c => {
                try {
                    return c instanceof Creep && !!c.my;
                } catch (e) {
                    return false;
                }
            });
        }
        return this._myCreeps;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'powerCreeps', {
    get: function () {
        if (!this._powerCreeps) this._powerCreeps = this.find(FIND_POWER_CREEPS);
        return this._powerCreeps;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'hostileCreeps', {
    get: function () {
        if (!this._Hostilecreeps) {
            this._Hostilecreeps = _.filter(this.creeps, c => {
                const owner = safeOwnerName(c);
                return owner && !safeIsMy(c) && (!FRIENDLIES.includes(owner) || HOSTILES.includes(owner)) && owner !== 'Source Keeper';
            });
            this._Hostilecreeps = this._Hostilecreeps.concat(_.filter(this.powerCreeps, c => {
                const owner = safeOwnerName(c);
                return owner && !safeIsMy(c) && (!FRIENDLIES.includes(owner) || HOSTILES.includes(owner));
            }));
        }
        return this._Hostilecreeps;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'friendlyCreeps', {
    get: function () {
        if (!this._friendlyCreeps) {
            this._friendlyCreeps = _.filter(this.creeps, c => {
                const owner = safeOwnerName(c);
                return (owner && _.includes(FRIENDLIES, owner) || safeIsMy(c)) && (!owner || !_.includes(THREATS, owner));
            });
        }
        return this._friendlyCreeps;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'alliedCreeps', {
    get: function () {
        if (!this._alliedCreeps) {
            this._alliedCreeps = _.filter(this.creeps, c => {
                const owner = safeOwnerName(c);
                return owner && !safeIsMy(c) && _.includes(FRIENDLIES, owner) && !_.includes(THREATS, owner);
            });
        }
        return this._alliedCreeps;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'constructionSites', {
    get: function () {
        if (!this._constructionSites || this._constructionSites_ts !== Game.time) {
            this._constructionSites = global.roomConstructionSitesFromGame
                ? global.roomConstructionSitesFromGame(this)
                : this.find(FIND_CONSTRUCTION_SITES);
            this._constructionSites_ts = Game.time;
        }
        return this._constructionSites;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'tombstones', {
    get: function () {
        if (!this._tombstones) {
            const hostiles = this.hostileCreeps;
            this._tombstones = hostiles.length
                ? this.find(FIND_TOMBSTONES, {filter: r => hostiles.every(h => r.pos.getRangeTo(h) > 3)})
                : this.find(FIND_TOMBSTONES);
        }
        return this._tombstones;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'ruins', {
    get: function () {
        if (!this._ruins) {
            const hostiles = this.hostileCreeps;
            this._ruins = hostiles.length
                ? this.find(FIND_RUINS, {filter: r => hostiles.every(h => r.pos.getRangeTo(h) > 3)})
                : this.find(FIND_RUINS);
        }
        return this._ruins;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'level', {
    get: function () {
        if (this._level === undefined) this._level = getLevel(this);
        return this._level;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'energy', {
    get: function () {
        if (this._energyTick !== Game.time) {
            this._energyTick = Game.time;
            this._energy = this.store(RESOURCE_ENERGY, true) + ((this.store(RESOURCE_BATTERY) / 50) * 600);
        }
        return this._energy;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'rawEnergy', {
    get: function () {
        if (this._rawEnergyTick !== Game.time) {
            this._rawEnergyTick = Game.time;
            this._rawEnergy = this.store(RESOURCE_ENERGY, true);
        }
        return this._rawEnergy;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'energyIncome', {
    get: function () {
        // Authoritative net flow from stateManager (event log + spawn amortization). Falls
        // back to the raw tracker only until energyInfo has been populated.
        if (this._energyIncome === undefined) {
            const ei = this.memory.energyInfo;
            if (ei && typeof ei.spareIncome === 'number') {
                this._energyIncome = _.round(ei.spareIncome, 0);
            } else {
                const tracker = require('module.energyTracker');
                this._energyIncome = _.round(tracker.colonySnapshot(this.name).spareIncome, 0);
            }
        }
        return this._energyIncome;
    },
    enumerable: false,
    configurable: true
});

function ensureRoomResourceScan(room) {
    if (room._resourceScanTick === Game.time) return;
    room._resourceScanTick = Game.time;
    room._resourceStore = Object.create(null);
    room._resourceStoreUnused = Object.create(null);
    room._droppedResources = undefined;

    const add = (map, resource, amount) => {
        map[resource] = (map[resource] || 0) + amount;
    };

    for (const s of room.impassibleStructures) {
        if (!s.store) continue;
        const structType = s.structureType;
        const skipNormal = [STRUCTURE_NUKER, STRUCTURE_TOWER, STRUCTURE_SPAWN, STRUCTURE_EXTENSION].includes(structType);
        const countsUnused = [STRUCTURE_STORAGE, STRUCTURE_TERMINAL, STRUCTURE_CONTAINER, STRUCTURE_FACTORY].includes(structType);

        for (const resource in s.store) {
            const amount = s.store[resource];
            if (!amount) continue;
            if (!skipNormal) add(room._resourceStore, resource, amount);
            if (countsUnused) add(room._resourceStoreUnused, resource, amount);
        }
    }

    for (const c of room.myCreeps) {
        for (const resource in c.store) {
            const amount = c.store[resource];
            if (!amount) continue;
            add(room._resourceStore, resource, amount);
        }
    }

    for (const r of room.droppedResources) {
        add(room._resourceStore, r.resourceType, r.amount);
        add(room._resourceStoreUnused, r.resourceType, r.amount);
    }

    return room._resourceStore;
}

Room.prototype.store = function (resource, unused = false) {
    if (!resource) return undefined;
    ensureRoomResourceScan(this);
    return (unused ? this._resourceStoreUnused : this._resourceStore)[resource] || 0;
};

function clearPowerBankIntel(roomIntel) {
    if (!roomIntel.power && !roomIntel.powerAmount && !roomIntel.powerHits &&
        roomIntel.powerSpace == null && !roomIntel.powerMined &&
        roomIntel.powerX == null && roomIntel.powerY == null) {
        return false;
    }
    roomIntel.power = undefined;
    roomIntel.powerAmount = undefined;
    roomIntel.powerHits = undefined;
    roomIntel.powerSpace = undefined;
    roomIntel.powerMined = undefined;
    roomIntel.powerX = undefined;
    roomIntel.powerY = undefined;
    return true;
}

function isPowerBankMinedByOthers(room, powerBank) {
    const creeps = room.creeps;
    for (let i = 0; i < creeps.length; i++) {
        const c = creeps[i];
        if (!c || c.my) continue;
        if (!c.hasActiveBodyparts(ATTACK) && !c.hasActiveBodyparts(HEAL)) continue;
        if (c.pos.getRangeTo(powerBank) <= 1) return true;
    }
    return false;
}

function collectPowerBankIntel(room, roomIntel) {
    if (room._powerIntelTick === Game.time) return false;
    room._powerIntelTick = Game.time;

    if (room.sources.length > 0) return clearPowerBankIntel(roomIntel);

    const powerBank = room.structures.find(s => s.structureType === STRUCTURE_POWER_BANK);
    if (!powerBank) return clearPowerBankIntel(roomIntel);

    roomIntel.power = Game.time + powerBank.ticksToDecay;
    roomIntel.powerAmount = powerBank.power;
    roomIntel.powerHits = powerBank.hits;
    roomIntel.powerSpace = powerBank.pos.countOpenTerrainAround(false, true);
    roomIntel.powerX = powerBank.pos.x;
    roomIntel.powerY = powerBank.pos.y;
    // Others currently cracking it. Hits-below-full is stored separately so our
    // own mining does not look like a contest.
    roomIntel.powerMined = isPowerBankMinedByOthers(room, powerBank) || undefined;
    return true;
}

Room.prototype.cacheRoomIntel = function (force = false) {
    const currentTime = Game.time;
    if (!INTEL[this.name]) INTEL[this.name] = {name: this.name, shardName: Game.shard.name};
    const roomIntel = INTEL[this.name];
    roomIntel.lastObservation = currentTime;
    roomIntel.safemode = this.controller && this.controller.safeMode ? currentTime + this.controller.safeMode : undefined;

    // Power banks decay in 5k ticks and can be claimed by another player in
    // tens of ticks. Record them on every vision, not only the 150-tick light cadence.
    const powerIntelChanged = collectPowerBankIntel(this, roomIntel);

    const owned = !!(this.controller && this.controller.my);
    if (!force) {
        const lightDue = !roomIntel.microUpdate || roomIntel.microUpdate + 150 < currentTime;
        const heavyTTL = owned ? CREEP_LIFE_TIME : CREEP_LIFE_TIME * 5;
        const heavyDue = !roomIntel.cached || roomIntel.cached + heavyTTL < currentTime;
        if (!lightDue && !heavyDue) {
            INTEL[this.name] = roomIntel;
            if (powerIntelChanged && global.updateIntelIndex) {
                global.updateIntelIndex(this.name, roomIntel, roomIntel);
            }
            return;
        }
    }

    // SK rooms — lairs in vision, or sector layout (x/y % 10 === 4). Name-based detection must
    // stick: structure caches on some servers omit keeper lairs and were clearing sk, which let
    // remote harvesters spawn into SK rooms without an SKAttacker.
    // Owned rooms cannot be SK; skip the structure walk.
    const nameIsSk = !owned && global.isSourceKeeperRoomName && global.isSourceKeeperRoomName(this.name);
    const hasKeeperLairs = !owned && this.structures.some(s => s.structureType === STRUCTURE_KEEPER_LAIR);
    roomIntel.sk = hasKeeperLairs || nameIsSk;
    if (roomIntel.sk) {
        const seen = new Set();
        const points = [];
        const addPoint = (x, y) => {
            const key = x + ',' + y;
            if (seen.has(key)) return;
            seen.add(key);
            points.push({x, y});
        };
        for (const lair of this.structures.filter(s => s.structureType === STRUCTURE_KEEPER_LAIR)) addPoint(lair.pos.x, lair.pos.y);
        for (const src of this.sources) addPoint(src.pos.x, src.pos.y);
        if (this.mineral) addPoint(this.mineral.pos.x, this.mineral.pos.y);
        if (points.length) roomIntel.skDangerPoints = points;
    } else {
        delete roomIntel.skDangerPoints;
    }
    INTEL[this.name] = roomIntel;

    // === LIGHT UPDATE (every ~150 ticks) ===
    if (!roomIntel.microUpdate || roomIntel.microUpdate + 150 < currentTime) {
        const structures = this.structures;
        const deposits = this.sources.length === 0 ? this.find(FIND_DEPOSITS) : [];

        // Invader Core — collapse tick is attackable life; invuln is stored separately
        // so planners can refuse to launch while the core takes no damage.
        const invaderCore = structures.find(s => s.structureType === STRUCTURE_INVADER_CORE);
        if (invaderCore) {
            const effects = invaderCore.effects || [];
            const collapse = effects.find(e => e.effect === EFFECT_COLLAPSE_TIMER);
            const invuln = effects.find(e => e.effect === EFFECT_INVULNERABILITY);
            if (collapse) {
                roomIntel.invaderCore = Game.time + collapse.ticksRemaining;
                roomIntel.invaderCoreInvuln = undefined;
            } else if (invuln) {
                roomIntel.invaderCore = Game.time + 50000 + invuln.ticksRemaining;
                roomIntel.invaderCoreInvuln = Game.time + invuln.ticksRemaining;
            } else {
                roomIntel.invaderCore = Game.time + CREEP_LIFE_TIME;
                roomIntel.invaderCoreInvuln = undefined;
            }
        } else {
            roomIntel.invaderCore = undefined;
            roomIntel.invaderCoreInvuln = undefined;
        }

        // User / Controller
        roomIntel.user = this.user;
        if (this.controller) {
            const newOwner = this.controller.owner?.username;
            if (newOwner !== roomIntel.owner) roomIntel.ownerChanged = true;
            roomIntel.owner = newOwner;
            if (roomIntel.owner && !isFriendlyOwner(roomIntel.owner)) {
                const attack = determineBestAttackRoute(this);
                if (attack) {
                    roomIntel.attackDirection = attack;
                    roomIntel.attackDirectionOrigin = attackRouteOrigin(this.name);
                } else {
                    delete roomIntel.attackDirection;
                    delete roomIntel.attackDirectionOrigin;
                }
            } else {
                delete roomIntel.attackDirection;
                delete roomIntel.attackDirectionOrigin;
            }
            roomIntel.reservation = this.controller.reservation?.username;

            // Fast-changing strength signals — refreshed every light update (~150 ticks) so
            // MY_STRENGTH and enemy strength scores stay current as storage/terminal levels move.
            if (roomIntel.owner) {
                roomIntel.lastOwnedAt = currentTime;
                roomIntel.storageEnergy = this.storage?.store[RESOURCE_ENERGY] || undefined;
                roomIntel.terminalEnergy = this.terminal?.store[RESOURCE_ENERGY] || undefined;
                roomIntel.ticksToDowngrade = this.controller.ticksToDowngrade;
                roomIntel.controllerProgress = this.controller.progressTotal
                    ? Math.round((this.controller.progress / this.controller.progressTotal) * 100) / 100
                    : undefined;
            } else {
                delete roomIntel.lastOwnedAt;
                delete roomIntel.storageEnergy;
                delete roomIntel.terminalEnergy;
                delete roomIntel.ticksToDowngrade;
                delete roomIntel.controllerProgress;
            }

            if (roomIntel.ownerChanged) {
                roomIntel.obstacles = !areExitsReachable(this);
                roomIntel.ownerChanged = undefined;
            }
        }

        // Highway intel (power banks are collected on every vision above)
        if (this.sources.length === 0) {
            const commodityDeposit = _.max(deposits.filter(d => d.ticksToDecay >= 2000), d => d.ticksToDecay);
            roomIntel.commodity = commodityDeposit?.depositType;
            roomIntel.commodityCooldown = commodityDeposit?.lastCooldown;
            const portal = structures.find(s => s.structureType === STRUCTURE_PORTAL);
            roomIntel.portal = portal ? JSON.stringify({
                destination: portal.destination,
                ticks: portal.ticksToDecay
            }) : undefined;
        } else {
            roomIntel.commodity = undefined;
            roomIntel.commodityCooldown = undefined;
            roomIntel.portal = undefined;
        }

        // Armed hostiles
        roomIntel.armedHostile = this.hostileCreeps.length && this.hostileCreeps.some(c => c && (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK))) ? Game.time : undefined;
        if (roomIntel.owner && !isFriendlyOwner(roomIntel.owner)) {
            roomIntel.activeDefenders = !!roomIntel.armedHostile;
        }

        // SK towers
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
        } else if (roomIntel.owner && !isFriendlyOwner(roomIntel.owner)) {
            // Spawn and siege vs occupy key off INTEL.towers. Leaving this on
            // the heavy cadence left the count stale for a full creep life
            // after we knocked towers down. towerData grids stay heavy.
            const towers = armedTowers(this);
            if (towers.length) {
                purgeBadRoute(this.name);
                roomIntel.towers = towers.length;
            } else {
                roomIntel.towers = undefined;
                roomIntel.towerData = undefined;
            }
        }

        if (this.sources.length && !roomIntel.owner) {
            remoteMining.bootstrapRemoteRoomOnVision(this);
        }

        // Remote source data — register new sources or refresh stale distance scores.
        // Do NOT rescore every micro-intel tick merely because we appear in
        // ROOM_REMOTE_TARGETS — that re-PathFind'd every assigned remote ~every 150
        // ticks and stamped refreshRemotes on parents (spawn cascade).
        if (this.sources.length && roomIntel.remoteRoom) {
            const staleScores = Game.time - (roomIntel.activeRemote || 0) > 500;
            // Force scoring when bootstrap set remoteRoom but source data never landed
            // (path fail / incomplete first visit) so nearby remotes can still be claimed.
            const missingSourceData = !roomIntel.remoteSourceData || !roomIntel.remoteSourceData.length;
            const needsUpdate = staleScores || missingSourceData;
            if (needsUpdate) {
                let lowestScore = Infinity;
                let lowestRoom = roomIntel.remoteRoom[0];
                if (!roomIntel.remoteSourceData) roomIntel.remoteSourceData = [];

                for (const source of this.sources) {
                    lowestScore = Infinity;
                    for (const colony of roomIntel.remoteRoom) {
                        if (!MY_ROOMS.includes(colony)) continue;
                        const distance = calculateDistanceToHub(this, source, colony);
                        if (distance < lowestScore) {
                            lowestScore = distance;
                            lowestRoom = colony;
                        }
                    }
                    if (lowestScore < Infinity) {
                        updateRemoteSourceData(this, lowestRoom, source, lowestScore);
                        const existing = roomIntel.remoteSourceData.find(s => s.source === source.id);
                        if (existing) {
                            existing.colony = lowestRoom;
                            existing.score = lowestScore;
                        } else {
                            roomIntel.remoteSourceData.push({
                                colony: lowestRoom,
                                source: source.id,
                                score: lowestScore
                            });
                        }
                    }
                }
                // Only force colony remote refresh when we newly filled data or did a
                // stale recompute — not on every routine micro update.
                for (const colony of roomIntel.remoteRoom) {
                    if (INTEL[colony]) INTEL[colony].refreshRemotes = true;
                }
                roomIntel.activeRemote = Game.time;
            }
        }

        roomIntel.microUpdate = currentTime;
        const oldLight = INTEL[this.name];
        INTEL[this.name] = roomIntel;
        if (global.updateIntelIndex) global.updateIntelIndex(this.name, oldLight, roomIntel);
    }
    INTEL[this.name] = roomIntel;

    // === HEAVY UPDATE (forced, or by cadence) ===
    // My rooms refresh on CREEP_LIFE_TIME so rampart/spawn data stays fresh for MY_STRENGTH
    // and siege-defense decisions. Other players' rooms stay on the 5x cadence — they're
    // observed opportunistically and the heavy work (areExitsReachable) is expensive.
    const heavyTTL = this.controller?.my ? CREEP_LIFE_TIME : CREEP_LIFE_TIME * 5;
    if (!force && INTEL[this.name] && INTEL[this.name].cached + heavyTTL > currentTime) return;

    // On global reset the .cached values are old, so *every* owned room would do heavy work
    // (including expensive towerData 50x50 grids per tower + rampart sorts + hubChecks) on early ticks.
    // For first 2 ticks after reset do ONLY light updates (no heavy). Then spread remaining heavy over next ticks.
    if (!force) {
        const since = global.ticksSinceLastGlobalReset ? global.ticksSinceLastGlobalReset() : 99;
        if (since < 3 && this.controller && this.controller.my) {
            return;  // absolutely no heavy intel (towerData 50x50 grids, areExitsReachable PathFinders, rampart sorts, hubChecks) on first 2 ticks after reset -- light only is enough
        }
        const spreadTicks = global.POST_RESET_HEAVY_INTEL_SPREAD || 150;
        if (since < spreadTicks && this.controller && this.controller.my) {
            // One owned room per tick slot — never burst all rooms when the danger window ends.
            if (since < 6) return;
            const hash = (this.name.charCodeAt(1) || 0) + (this.name.charCodeAt(3) || 0);
            const slot = 6 + (hash % Math.max(1, spreadTicks - 6));
            if (since !== slot) return;
        }
        // Cap PathFinder / hubCheck / towerData bursts. Observer + colony can otherwise
        // stack several first-visit heavies on one tick (~10 CPU each).
        if (!consumeHeavyIntelSlot()) return;
    }

    roomIntel.cached = currentTime;
    roomIntel.sources = this.sources.length;

    // Expensive check — only on ownership change or force
    if (force || roomIntel.obstacles === undefined || roomIntel.ownerChanged) {
        roomIntel.obstacles = !areExitsReachable(this);
        roomIntel.ownerChanged = undefined;
    }

    if (roomIntel.swampRoom === undefined) roomIntel.swampRoom = swampRoom(this.name);

    // Minerals
    const mineral = this.mineral;
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
        roomIntel.owner = controller.owner?.username;
        roomIntel.reservation = controller.reservation?.username;
        roomIntel.safemode = controller.safeMode ? currentTime + controller.safeMode : undefined;

        // Attempt once (success or fail) and stamp hubCheckAt so a false
        // result cannot re-run findHub on every force/observe.
        if (!roomIntel.hubCheck && !roomIntel.hubCheckAt && !roomIntel.obstacles && roomIntel.sources === 2 && !this.hostileCreeps.length) {
            roomIntel.hubCheck = roomPlanner.hubCheck(this);
            roomIntel.hubCheckAt = currentTime;
        }

        // NCP signage
        if (controller.sign?.text) {
            const signText = controller.sign.text.toLowerCase();
            if (["overmind", "tooangel", "quorum", "ᴏᴠᴇʀᴍɪɴᴅ", "jln"].some(word => signText.includes(word))) {
                if (!Memory.ncpArray) Memory.ncpArray = [];
                Memory.ncpArray = _.uniq(Memory.ncpArray.concat([controller.sign.username]));
            }
        }

        // Towers
        const towers = armedTowers(this);
        if (towers.length) {
            purgeBadRoute(this.name);
            roomIntel.towers = towers.length;
            roomIntel.towerData = this.towerData(towers);
        } else {
            roomIntel.towers = undefined;
            roomIntel.towerData = undefined;
        }

        // Compact impact tile for unattended launches. Prefer a tower in the
        // densest cluster so splash can strip the bunker, not room-center.
        const impact = this.pickNukeImpact();
        if (impact) roomIntel.nukeTarget = {x: impact.x, y: impact.y};
        else delete roomIntel.nukeTarget;

        // Loot
        roomIntel.loot = !this.hostileCreeps.length && this.structures.some(s =>
            (s.structureType === STRUCTURE_STORAGE || s.structureType === STRUCTURE_TERMINAL) &&
            _.sum(s.store) > 0 &&
            !s.pos.checkForRampart()
        );

        // Heavier strength signals — counts and rampart sort. Light-update path handles
        // the fast-changing storage/terminal/controller fields.
        if (roomIntel.owner) {
            roomIntel.spawns = this.spawns.length || undefined;
            roomIntel.extensions = this.extensions.length || undefined;

            const rampartHits = this.ramparts.map(r => r.hits).sort((a, b) => a - b);
            if (rampartHits.length) {
                roomIntel.rampartMedHP = rampartHits[Math.floor(rampartHits.length / 2)];
                roomIntel.rampartMaxHP = rampartHits[rampartHits.length - 1];
            } else {
                roomIntel.rampartMedHP = undefined;
                roomIntel.rampartMaxHP = undefined;
            }
        } else {
            delete roomIntel.spawns;
            delete roomIntel.extensions;
            delete roomIntel.rampartMedHP;
            delete roomIntel.rampartMaxHP;
        }
    } else {
        delete roomIntel.level;
        delete roomIntel.attackDirection;
        delete roomIntel.attackDirectionOrigin;
        delete roomIntel.owner;
        delete roomIntel.reservation;
        delete roomIntel.safemode;
        delete roomIntel.hubCheck;
        delete roomIntel.hubCheckAt;
        delete roomIntel.nukeTarget;
        delete roomIntel.loot;
        delete roomIntel.lastOwnedAt;
        delete roomIntel.spawns;
        delete roomIntel.extensions;
        delete roomIntel.storageEnergy;
        delete roomIntel.terminalEnergy;
        delete roomIntel.ticksToDowngrade;
        delete roomIntel.controllerProgress;
        delete roomIntel.rampartMedHP;
        delete roomIntel.rampartMaxHP;
    }

    // Room type flags (sk + skDangerPoints are set at the top of cacheRoomIntel)
    roomIntel.isHighway = roomIntel.sources === 0;

    const oldHeavy = INTEL[this.name];
    INTEL[this.name] = roomIntel;
    if (global.updateIntelIndex) global.updateIntelIndex(this.name, oldHeavy, roomIntel);
};

const NUKE_IMPACT_WEIGHT = {
    [STRUCTURE_TOWER]: 10,
    [STRUCTURE_SPAWN]: 8,
    [STRUCTURE_STORAGE]: 6,
    [STRUCTURE_TERMINAL]: 6,
    [STRUCTURE_NUKER]: 6,
    [STRUCTURE_POWER_SPAWN]: 5,
    [STRUCTURE_FACTORY]: 5,
    [STRUCTURE_LAB]: 3,
};

function collectNukeValuedStructures(room) {
    const valued = [];
    const add = (item, type) => {
        if (!item) return;
        const list = Array.isArray(item) ? item : [item];
        const weight = NUKE_IMPACT_WEIGHT[type] || 1;
        for (const s of list) {
            if (s && s.pos) valued.push({pos: s.pos, weight});
        }
    };
    add(room.towers, STRUCTURE_TOWER);
    add(room.spawns, STRUCTURE_SPAWN);
    add(room.storage, STRUCTURE_STORAGE);
    add(room.terminal, STRUCTURE_TERMINAL);
    add(room.nuker, STRUCTURE_NUKER);
    add(room.powerSpawn, STRUCTURE_POWER_SPAWN);
    add(room.factory, STRUCTURE_FACTORY);
    add(room.labs, STRUCTURE_LAB);
    return valued;
}

Room.prototype.pickNukeImpact = function () {
    const valued = collectNukeValuedStructures(this);
    if (!valued.length) return this.controller ? this.controller.pos : undefined;
    let best = valued[0];
    let bestScore = -1;
    for (const cand of valued) {
        let score = cand.weight;
        for (const other of valued) {
            if (other === cand) continue;
            if (cand.pos.getRangeTo(other.pos) <= 2) score += other.weight;
        }
        if (score > bestScore) {
            bestScore = score;
            best = cand;
        }
    }
    return best.pos;
};

function swampRoom(roomName) {
    const terrain = Game.map.getRoomTerrain(roomName);
    let swampCount = 0, plainsCount = 0;
    for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
            const tile = terrain.get(x, y);
            if (tile === TERRAIN_MASK_SWAMP) swampCount++;
            else if (tile === 0) plainsCount++;
        }
    }
    return swampCount > plainsCount;
}

function calculateDistanceToHub(room, source, targetRoom) {
    return remoteMining.calculateRemoteSourceScore(room, source, targetRoom);
}

function updateRemoteSourceData(room, roomName, source, distance) {
    if (!remoteMining.isRemoteSourceScoreAcceptable(roomName, room.name, distance)) return;

    const remoteTargets = ROOM_REMOTE_TARGETS[roomName] || [];
    const existing = remoteTargets.find(s => s.source === source.id);
    if (existing) {
        existing.room = room.name;
        existing.score = distance;
    } else if (!remoteTargets.some(s => s.room === room.name)) {
        return;
    } else {
        remoteTargets.push({room: room.name, source: source.id, score: distance});
    }
    ROOM_REMOTE_TARGETS[roomName] = remoteTargets;

    const colonyRoom = Game.rooms[roomName];
    if (colonyRoom) remoteMining.pruneRoomRemoteTargets(roomName, colonyRoom);
}

const MAX_HEAVY_INTEL_PER_TICK = 1;

function consumeHeavyIntelSlot() {
    if (global._heavyIntelTick !== Game.time) {
        global._heavyIntelTick = Game.time;
        global._heavyIntelUsed = 0;
    }
    const cap = global.MAX_HEAVY_INTEL_PER_TICK || MAX_HEAVY_INTEL_PER_TICK;
    if (global._heavyIntelUsed >= cap) return false;
    global._heavyIntelUsed++;
    return true;
}

function areExitsReachable(room) {
    if (!room.controller) return true;
    const exits = Object.values(Game.map.describeExits(room.name) || {});
    if (!exits.length) return true;

    let costs = null;
    const roomCallback = function (roomName) {
        if (roomName !== room.name) return false;
        if (costs) return costs;
        costs = new PathFinder.CostMatrix();
        const structs = room.structures;
        for (let i = 0; i < structs.length; i++) {
            const s = structs[i];
            if (OBSTACLE_OBJECT_TYPES.includes(s.structureType) || s.structureType === STRUCTURE_RAMPART) {
                costs.set(s.pos.x, s.pos.y, Infinity);
            }
        }
        return costs;
    };

    const origin = room.controller.pos;
    for (let e = 0; e < exits.length; e++) {
        const exitDir = room.findExitTo(exits[e]);
        const exitPositions = room.find(exitDir);
        if (!exitPositions.length) continue;
        // Midpoint plus ends — one successful path means this edge is reachable.
        // Walking every exit tile was up to ~50 PathFinder searches per edge.
        const samples = [exitPositions[exitPositions.length >> 1]];
        if (exitPositions.length > 2) {
            samples.push(exitPositions[0], exitPositions[exitPositions.length - 1]);
        }
        let pathsFound = false;
        for (let i = 0; i < samples.length; i++) {
            const path = PathFinder.search(origin, {pos: samples[i], range: 0}, {
                maxOps: 2000,
                maxRooms: 1,
                plainCost: 1,
                swampCost: 1,
                roomCallback
            });
            if (!path.incomplete) {
                pathsFound = true;
                break;
            }
        }
        if (!pathsFound) return false;
    }
    return true;
}

function isFriendlyOwner(owner) {
    if (!owner) return true;
    if (owner === MY_USERNAME) return true;
    return typeof FRIENDLIES !== 'undefined' && FRIENDLIES.includes(owner);
}

// How many extra route hops past the closest staging neighbor we will accept
// for a better combat exit. 2 rooms is a flank; 3+ is walking around the target.
global.ATTACK_ROUTE_MAX_EXTRA_HOPS = 2;

function attackRouteHops(from, to) {
    if (!from || !to) return Infinity;
    if (from === to) return 0;
    try {
        const hops = require('pathRoute').routeDistance(from, to);
        if (hops < Infinity) return hops;
    } catch (e) { /* pathfinder not loaded yet */
    }
    return Game.map.getRoomLinearDistance(from, to);
}

function attackRouteOrigin(dest) {
    const op = (typeof Memory !== 'undefined' && Memory.targetRooms && Memory.targetRooms[dest])
        || (typeof Memory !== 'undefined' && Memory.auxiliaryTargets && Memory.auxiliaryTargets[dest]);
    if (op && op.assignedRoom) return op.assignedRoom;
    if (typeof findClosestOwnedRoom === 'function') return findClosestOwnedRoom(dest);
    return undefined;
}

function isViableStagingRoom(roomName) {
    const intel = INTEL[roomName];
    if (!intel) return true;
    if (intel.owner && !isFriendlyOwner(intel.owner)) return false;
    return true;
}

function stagingCost(roomName) {
    const intel = INTEL[roomName];
    if (!intel) return 50;
    let cost = 0;
    if (intel.sk) cost += 300;
    if (intel.towers) cost += 400;
    if (intel.threatLevel) cost += 80 * intel.threatLevel;
    return cost;
}

function inwardDelta(dir) {
    if (dir === TOP) return {dx: 0, dy: 1};
    if (dir === BOTTOM) return {dx: 0, dy: -1};
    if (dir === LEFT) return {dx: 1, dy: 0};
    return {dx: -1, dy: 0};
}

function exitTileDamage(pos, towers) {
    let dmg = 0;
    for (let i = 0; i < towers.length; i++) {
        dmg += TOWER_POWER_FROM_RANGE(pos.getRangeTo(towers[i]), TOWER_POWER_ATTACK);
    }
    return dmg;
}

function inwardBarrierHits(room, x, y, dir) {
    const {dx, dy} = inwardDelta(dir);
    let hits = 0;
    for (let step = 1; step <= 2; step++) {
        const tx = x + dx * step;
        const ty = y + dy * step;
        if (tx < 1 || tx > 48 || ty < 1 || ty > 48) continue;
        const structs = new RoomPosition(tx, ty, room.name).lookFor(LOOK_STRUCTURES);
        for (let i = 0; i < structs.length; i++) {
            const s = structs[i];
            if (s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART) continue;
            if (s.my || (s.structureType === STRUCTURE_RAMPART && s.isPublic)) continue;
            hits += s.hits || 0;
        }
    }
    return hits;
}

function scoreExitEdge(room, dir, towers) {
    const tiles = room.find(dir);
    if (!tiles.length) return null;
    const along = (dir === TOP || dir === BOTTOM) ? (t) => t.x : (t) => t.y;
    const open = [];
    for (let i = 0; i < tiles.length; i++) {
        const t = tiles[i];
        if (t.checkForObstacleStructure && t.checkForObstacleStructure()) continue;
        if (room.getTerrain().get(t.x, t.y) === TERRAIN_MASK_WALL) continue;
        open.push(t);
    }
    if (!open.length) return null;
    open.sort((a, b) => along(a) - along(b));

    const scorePair = (a, b) => {
        const towerDmg = Math.max(exitTileDamage(a, towers), b ? exitTileDamage(b, towers) : 0);
        let barrierHits = inwardBarrierHits(room, a.x, a.y, dir);
        if (b) barrierHits += inwardBarrierHits(room, b.x, b.y, dir);
        return {towerDmg, barrierHits, quadWidth: b ? 2 : 1};
    };

    let best = null;
    for (let i = 0; i < open.length - 1; i++) {
        if (along(open[i + 1]) - along(open[i]) !== 1) continue;
        const scored = scorePair(open[i], open[i + 1]);
        if (!best
            || scored.towerDmg < best.towerDmg
            || (scored.towerDmg === best.towerDmg && scored.barrierHits < best.barrierHits)) {
            best = scored;
        }
    }
    if (!best) best = scorePair(open[0], null);
    return best;
}

function determineBestAttackRoute(room, origin) {
    const exits = Game.map.describeExits(room.name);
    if (!exits) return undefined;

    const originRoom = origin || attackRouteOrigin(room.name);
    const towers = (room.towers || []).filter((t) => {
        try {
            return t.store && t.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST;
        } catch (e) {
            return false;
        }
    });

    const candidates = [];
    const dirs = [TOP, RIGHT, BOTTOM, LEFT];
    for (let i = 0; i < dirs.length; i++) {
        const dir = dirs[i];
        const staging = exits[dir];
        if (!staging || !isViableStagingRoom(staging)) continue;
        const geom = scoreExitEdge(room, dir, towers);
        if (!geom) continue;
        candidates.push({
            staging,
            hops: attackRouteHops(originRoom, staging),
            stagingCost: stagingCost(staging),
            towerDmg: geom.towerDmg,
            barrierHits: geom.barrierHits,
            quadWidth: geom.quadWidth
        });
    }
    if (!candidates.length) return undefined;

    let minHops = Infinity;
    for (let i = 0; i < candidates.length; i++) {
        if (candidates[i].hops < minHops) minHops = candidates[i].hops;
    }

    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const extra = (c.hops < Infinity && minHops < Infinity) ? c.hops - minHops : 0;
        if (extra > global.ATTACK_ROUTE_MAX_EXTRA_HOPS) continue;
        const score = c.towerDmg
            + c.barrierHits / 50000
            + extra * 400
            + (c.quadWidth >= 2 ? 0 : 2000)
            + c.stagingCost;
        if (score < bestScore) {
            bestScore = score;
            best = c;
        }
    }
    if (!best) {
        for (let i = 0; i < candidates.length; i++) {
            if (candidates[i].hops === minHops) return candidates[i].staging;
        }
        return candidates[0].staging;
    }
    return best.staging;
}

Room.prototype.determineBestAttackRoute = function (origin) {
    return determineBestAttackRoute(this, origin);
};

let invaderAlert = {};

Room.prototype.invaderCheck = function () {
    if (!INTEL[this.name]) return false;
    const roomData = INTEL[this.name];
    const previousCheck = roomData.lastInvaderCheck || Game.time;

    const cooldown = (roomData.numberOfHostiles || roomData.threatLevel) ? 3 : 15;
    if (roomData.lastInvaderCheck && roomData.lastInvaderCheck + cooldown > Game.time) return false;
    roomData.lastInvaderCheck = Game.time;

    const {hostileCreeps, friendlyCreeps} = this;

    if ((roomData.owner && roomData.owner !== MY_USERNAME) || (roomData.reservation && roomData.reservation !== MY_USERNAME) || findClosestOwnedRoom(this.name, true) > 2) {
        Object.assign(roomData, {
            numberOfHostiles: undefined, alertEmail: undefined, friendlyPower: undefined,
            hostilePower: undefined, requestingSupport: undefined, invaderTTL: undefined,
            roomHeat: undefined, threatLevel: undefined, hostileOwners: undefined
        });
        return false;
    }

    if (!hostileCreeps.length) {
        if (roomData.lastInvaderSighting) roomData.lastInvaderSighting = undefined;
        if (!roomData.roomHeat && !roomData.threatLevel) {
            if (roomData.tickDetected) roomData.tickDetected = undefined;
            const old1 = INTEL[this.name];
            INTEL[this.name] = roomData;
            if (global.updateIntelIndex) global.updateIntelIndex(this.name, old1, roomData);
            return false;
        }
        roomData.roomHeat = Math.min(roomData.roomHeat || 0, 1000);
        const waitOut = 5;
        let reduction = Math.ceil((Game.time - previousCheck) / 5) * friendlyCreeps.length + 1;
        if (roomData.lastPlayerSighting + 500 > Game.time) reduction *= 25;

        if (roomData.tickDetected + waitOut < Game.time || roomData.user !== MY_USERNAME) {
            roomData.threatLevel = undefined;
            roomData.roomHeat = Math.max((roomData.roomHeat || 0) - reduction, 0) || undefined;
            Object.assign(roomData, {
                numberOfHostiles: undefined, alertEmail: undefined, friendlyPower: undefined,
                hostilePower: undefined, requestingSupport: undefined, invaderTTL: undefined, hostileOwners: undefined
            });
        }
        const old2 = INTEL[this.name];
        INTEL[this.name] = roomData;
        if (global.updateIntelIndex) global.updateIntelIndex(this.name, old2, roomData);
        return false;
    }

    const hostileCombatPower = _.sum(hostileCreeps.filter(c => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)), 'combatPower') || 1;
    const alliedCombatPower = _.sum(friendlyCreeps.filter(c => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)), 'combatPower');

    roomData.hostilePower = hostileCombatPower;
    roomData.friendlyPower = alliedCombatPower;

    const armedInvaders = hostileCreeps.filter(c =>
        c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(HEAL) || c.getActiveBodyparts(WORK)
    );

    roomData.tickDetected = Game.time;
    roomData.numberOfHostiles = Math.max(roomData.numberOfHostiles || 0, hostileCreeps.length);

    const ownerArray = _.uniq(hostileCreeps.map(c => safeOwnerName(c)).filter(Boolean));

    if (armedInvaders.length) {
        roomData.invaderTTL = Math.max(...armedInvaders.map(c => c.ticksToLive)) + Game.time;
        roomData.lastInvaderSighting = Game.time;
        if (invaderAlert[this.name] + 25 < Game.time) {
            invaderAlert[this.name] = Game.time;
            log.a(`Invaders detected in ${roomLink(this.name)}. ${hostileCreeps.length} creeps. (Hostile/Friendly: ${hostileCombatPower}/${alliedCombatPower})`, 'RESPONSE COMMAND');
        }
    }

    const updateThreatLevel = () => {
        if (!armedInvaders.length) return 1;
        const boosted = armedInvaders.find(c => safeOwnerName(c) !== 'Invader' && c.body.find(b => b.type === HEAL && b.boost));
        const leadOwner = safeOwnerName(armedInvaders[0]);
        if (armedInvaders.length > 1 && (leadOwner !== 'Invader' || ownerArray.length > 1)) {
            roomData.lastPlayerSighting = Game.time;
            roomData.lastMajorAttack = Game.time;
            roomData.hostileOwners = ownerArray;
            return boosted ? 5 : 4;
        } else if (leadOwner !== 'Invader' && ownerArray.length === 1) {
            roomData.lastPlayerSighting = Game.time;
            roomData.hostileOwners = ownerArray;
            return 3;
        } else if (leadOwner === 'Invader' && ownerArray.length === 1) return 2;
        return 0;
    };

    roomData.threatLevel = updateThreatLevel();
    if (roomData.threatLevel >= 3) roomData.roomHeat = (roomData.roomHeat || 0) + _.sum(hostileCreeps, 'body.length') * 0.25;

    return roomData.threatLevel > 0;
};

Room.prototype.towerData = function (towers) {
    if (!towers || !towers.length) return {maxDamage: 0, position: undefined, average: 0};
    const terrain = Game.map.getRoomTerrain(this.name);
    let maxDamage = 0;
    let dangerousSpot;
    let operated = false;
    const damageTracker = [];

    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                const pos = new RoomPosition(x, y, this.name);
                let damage = 0;
                towers.forEach(t => {
                    const operateMult = getTowerOperateMultiplier(t);
                    if (operateMult > 1) operated = true;
                    damage += determineDamage(pos.getRangeTo(t)) * operateMult;
                });
                damageTracker.push(damage);
                if (damage > maxDamage) {
                    maxDamage = damage;
                    dangerousSpot = pos;
                }
            }
        }
    }

    const sorted = damageTracker.slice().sort((a, b) => a - b);
    const p85 = sorted[Math.floor(sorted.length * 0.85)];

    return {
        maxDamage,
        position: dangerousSpot ? {
            x: dangerousSpot.x,
            y: dangerousSpot.y,
            roomName: dangerousSpot.roomName
        } : undefined,
        average: p85,
        operated: operated
    };

    function determineDamage(range) {
        return TOWER_POWER_FROM_RANGE(range, TOWER_POWER_ATTACK);
    }

    function getTowerOperateMultiplier(tower) {
        if (!tower.effects || !tower.effects.length) return 1;
        const op = tower.effects.find(e => e.effect === PWR_OPERATE_TOWER);
        if (!op || !op.level) return 1;
        return 1 + (POWER_INFO[PWR_OPERATE_TOWER].effect[op.level - 1] / 100);
    }
};

/* Typed structure accessors — lazy per-tick index over this.structures (no ID round-trip). */
const multipleList = [STRUCTURE_SPAWN, STRUCTURE_EXTENSION, STRUCTURE_ROAD, STRUCTURE_WALL, STRUCTURE_RAMPART, STRUCTURE_KEEPER_LAIR, STRUCTURE_PORTAL, STRUCTURE_LINK, STRUCTURE_TOWER, STRUCTURE_LAB, STRUCTURE_CONTAINER, STRUCTURE_POWER_BANK];
const singleList = [STRUCTURE_OBSERVER, STRUCTURE_POWER_SPAWN, STRUCTURE_EXTRACTOR, STRUCTURE_NUKER, STRUCTURE_INVADER_CORE, STRUCTURE_FACTORY];

Room.prototype._ensureStructuresByType = function _ensureStructuresByType() {
    if (!this._structuresByType || this._structuresByType_ts !== Game.time) {
        this.structures;
        this._structuresByType = _.groupBy(this._structures, s => s.structureType);
        this._structuresByType_ts = Game.time;
    }
    return this._structuresByType;
};

Room.prototype._invalidateStructureCaches = function _invalidateStructureCaches() {
    this._structures = undefined;
    this._structures_ts = undefined;
    this._structuresByType = undefined;
    this._structuresByType_ts = undefined;
};

multipleList.forEach(function (type) {
    Object.defineProperty(Room.prototype, type + 's', {
        get: function () {
            return this._ensureStructuresByType()[type] || [];
        },
        set: function () {
        },
        enumerable: false,
        configurable: true,
    });
});

singleList.forEach(function (type) {
    Object.defineProperty(Room.prototype, type, {
        get: function () {
            const group = this._ensureStructuresByType()[type];
            return group ? group[0] : undefined;
        },
        set: function () {
        },
        enumerable: false,
        configurable: true,
    });
});