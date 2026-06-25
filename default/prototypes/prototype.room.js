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

let hubCache = {};
Object.defineProperty(Room.prototype, 'hub', {
    get: function () {
        if (!this.memory.bunkerHub || !this.memory.bunkerHub.x || !this.memory.bunkerHub.y) return roomPlanner.findHub(this);
        if (!this._hub) {
            if (!hubCache[this.name]) hubCache[this.name] = JSON.stringify({
                x: this.memory.bunkerHub.x,
                y: this.memory.bunkerHub.y
            });
            let hubInfo = JSON.parse(hubCache[this.name]);
            this._hub = new RoomPosition(hubInfo.x, hubInfo.y, this.name);
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
        const spawn = global.roomMySpawns
            ? global.roomMySpawns(this)[0]
            : _.find(this.spawns, s => safeStructureMy(s));
        if (!this.controller || !spawn) return 2;
        if (ENERGY_STATE_CACHE[this.name] && ENERGY_STATE_CACHE[this.name].tick + ENERGY_STATE_CACHE_TTL > Game.time) return ENERGY_STATE_CACHE[this.name].state;

        const batteryEquiv = Math.floor((this.store(RESOURCE_BATTERY) / 50) * 600 * 0.9);
        let energy = this.rawEnergy + batteryEquiv;
        const upgradeCost = this.level === 8 ? 500000 : constructionCost(this.controller.level + 1) - constructionCost(this.controller.level);
        const progressFraction = this.controller.progress / this.controller.progressTotal;
        let target = this.level === 8 ? 500000 : Math.max(this.level * 31250, Math.min(Math.round(upgradeCost * progressFraction) * 0.7, STORAGE_CAPACITY * 0.5));

        if (energy > target * 1.5 || (!this.storage && !this.terminal && this.level < 4)) this._energyState = 3;
        else if (energy >= target) this._energyState = 2;
        else if (energy > target * 0.5) this._energyState = 1;
        else this._energyState = 0;

        // Ally energy requests
        if (this.terminal && energy < target && ALLY_HELP_REQUESTS[MY_USERNAME]) {
            let requests = ALLY_HELP_REQUESTS[MY_USERNAME].requests?.resource || [];
            requests = requests.filter(r => (r.resourceType !== RESOURCE_ENERGY && r.roomName === this.name) || r.roomName !== this.name);
            requests.push({
                resourceType: RESOURCE_ENERGY,
                amount: (target * 1.2) - energy,
                priority: 1 - (energy / target),
                roomName: this.name
            });
            ALLY_HELP_REQUESTS[MY_USERNAME].requests.resource = requests;
        } else if (ALLY_HELP_REQUESTS[MY_USERNAME]) {
            let requests = ALLY_HELP_REQUESTS[MY_USERNAME].requests?.resource || [];
            const idx = requests.findIndex(r => r.resourceType === RESOURCE_ENERGY && r.roomName === this.name);
            if (idx !== -1) requests.splice(idx, 1);
        }

        ENERGY_STATE_CACHE[this.name] = {state: this._energyState, tick: Game.time};
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
        if (!this._myCreeps) this._myCreeps = this.find(FIND_CREEPS).filter(c => c.my);
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
                ? this.find(FIND_RUINS, {filter: r => r.pos.getRangeTo(r.pos.findClosestByRange(hostiles)) > 3})
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
        if (!this._energy) this._energy = this.store(RESOURCE_ENERGY, true) + ((this.store(RESOURCE_BATTERY) / 50) * 600);
        return this._energy;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'rawEnergy', {
    get: function () {
        if (!this._rawEnergy) this._rawEnergy = this.store(RESOURCE_ENERGY, true);
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

Room.prototype.store = function (resource, unused = false) {
    if (!this._resourceStore) this._resourceStore = {};
    if (!this._resourceStore[resource]) this._resourceStore[resource] = getRoomResource(this, resource, unused);
    return this._resourceStore[resource];
};

function getRoomResource(room, resource, unused = false) {
    if (!room || !resource) return undefined;
    let count = 0;

    for (const s of room.impassibleStructures) {
        if (!s.store) continue;
        const used = s.store.getUsedCapacity(resource);
        if (used === 0) continue;

        if (!unused) {
            if (![STRUCTURE_NUKER, STRUCTURE_TOWER, STRUCTURE_SPAWN, STRUCTURE_EXTENSION].includes(s.structureType)) count += used;
        } else {
            if ([STRUCTURE_STORAGE, STRUCTURE_TERMINAL, STRUCTURE_CONTAINER, STRUCTURE_FACTORY].includes(s.structureType)) count += used;
        }
    }

    if (!unused || resource !== RESOURCE_ENERGY) {
        for (const c of room.myCreeps) if (c.store[resource]) count += c.store[resource];
    }

    for (const r of room.droppedResources) if (r.resourceType === resource) count += r.amount;

    return count;
}

Room.prototype.cacheRoomIntel = function (force = false, creep = undefined) {
    const currentTime = Game.time;
    const roomIntel = INTEL[this.name] || {name: this.name, shardName: Game.shard.name};
    roomIntel.lastObservation = currentTime;
    roomIntel.safemode = this.controller && this.controller.safeMode ? currentTime + this.controller.safeMode : undefined;

    // SK rooms — detect before light update so tower logic below sees fresh sk, and so
    // skDangerPoints exist for no-vision pathing without waiting for the heavy cadence.
    roomIntel.sk = this.structures.some(s => s.structureType === STRUCTURE_KEEPER_LAIR);
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

    // === LIGHT UPDATE (every ~150 ticks) ===
    if (!roomIntel.microUpdate || roomIntel.microUpdate + 150 < currentTime) {
        const structures = global.roomStructuresFromGame
            ? global.roomStructuresFromGame(this)
            : this.find(FIND_STRUCTURES);
        const deposits = this.find(FIND_DEPOSITS);

        // Invader Core
        const invaderCore = structures.find(s => s.structureType === STRUCTURE_INVADER_CORE);
        if (invaderCore) {
            const effect = invaderCore.effects?.find(e => e.effect === EFFECT_COLLAPSE_TIMER || e.effect === EFFECT_INVULNERABILITY);
            roomIntel.invaderCore = effect ? Game.time + (effect.effect === EFFECT_COLLAPSE_TIMER ? effect.ticksRemaining : 50000 + effect.ticksRemaining) : undefined;
        } else {
            roomIntel.invaderCore = undefined;
        }

        // User / Controller
        roomIntel.user = this.user;
        if (this.controller) {
            const newOwner = this.controller.owner?.username;
            if (newOwner !== roomIntel.owner) roomIntel.ownerChanged = true;
            roomIntel.owner = newOwner;
            if (roomIntel.owner) roomIntel.attackDirection = determineBestAttackRoute(this);
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
        }

        // Highway intel
        if (this.sources.length === 0) {
            const commodityDeposit = deposits.find(d => d.ticksToDecay >= 2000);
            roomIntel.commodity = commodityDeposit?.depositType;
            roomIntel.commodityCooldown = commodityDeposit?.lastCooldown;
            const powerBank = structures.find(s => s.structureType === STRUCTURE_POWER_BANK);
            roomIntel.power = powerBank ? Game.time + powerBank.ticksToDecay : undefined;
            const portal = structures.find(s => s.structureType === STRUCTURE_PORTAL);
            roomIntel.portal = portal ? JSON.stringify({
                destination: portal.destination,
                ticks: portal.ticksToDecay
            }) : undefined;
        }

        // Armed hostiles
        roomIntel.armedHostile = this.hostileCreeps.length && this.hostileCreeps.some(c => c && (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK))) ? Game.time : undefined;

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
        }

        // Remote source data — register new sources or refresh stale distance scores.
        if (this.sources.length && roomIntel.remoteRoom) {
            const staleScores = Game.time - (roomIntel.activeRemote || 0) > 500;
            const needsUpdate = staleScores || roomIntel.remoteRoom.some(colony => {
                const targets = ROOM_REMOTE_TARGETS[colony];
                return !targets || !targets.some(s => s.room === this.name);
            });
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
    }

    roomIntel.cached = currentTime;
    roomIntel.sources = this.sources.length;

    // Expensive check — only on ownership change or force
    if (roomIntel.obstacles === undefined || roomIntel.ownerChanged) {
        roomIntel.obstacles = !areExitsReachable(this);
        roomIntel.ownerChanged = undefined;
    }

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
        roomIntel.owner = controller.owner?.username;
        roomIntel.reservation = controller.reservation?.username;
        roomIntel.safemode = controller.safeMode ? currentTime + controller.safeMode : undefined;

        if (!roomIntel.hubCheck && !roomIntel.obstacles && roomIntel.sources === 2 && !this.find(FIND_HOSTILE_CREEPS).length) {
            roomIntel.hubCheck = roomPlanner.hubCheck(this);
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
        const towers = this.towers.filter(s => {
            try {
                return s.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST && safeStructureIsActive(s);
            } catch (e) {
                return false;
            }
        });
        if (towers.length) {
            purgeBadRoute(this.name);
            roomIntel.towers = towers.length;
            roomIntel.towerData = this.towerData(towers);
            roomIntel.nukeTarget = this.terminal?.pos.toString() || this.storage?.pos.toString();
        } else {
            roomIntel.towers = undefined;
            roomIntel.towerData = undefined;
        }

        // Loot
        roomIntel.loot = !this.hostileCreeps.length && this.structures.some(s =>
            (s.structureType === STRUCTURE_STORAGE || s.structureType === STRUCTURE_TERMINAL) &&
            _.sum(s.store) > 0 &&
            !s.pos.lookFor(LOOK_STRUCTURES).some(str => str.structureType === STRUCTURE_RAMPART)
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
        delete roomIntel.owner;
        delete roomIntel.reservation;
        delete roomIntel.safemode;
        delete roomIntel.hubCheck;
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
    if (!Game.rooms[targetRoom] || !Game.rooms[targetRoom].memory) return Infinity;
    const storage = Game.rooms[targetRoom]?.storage;
    const target = storage || (Game.rooms[targetRoom].memory.bunkerHub
        ? new RoomPosition(Game.rooms[targetRoom].memory.bunkerHub.x, Game.rooms[targetRoom].memory.bunkerHub.y, targetRoom)
        : new RoomPosition(25, 25, targetRoom));
    const pathResult = source.pos.shibMove(target);
    return Math.ceil(pathResult.cost / 2);
}

function updateRemoteSourceData(room, roomName, source, distance) {
    const remoteTargets = ROOM_REMOTE_TARGETS[roomName] || [];
    const existing = remoteTargets.find(s => s.source === source.id);
    if (existing) {
        existing.room = room.name;
        existing.score = distance;
    } else {
        remoteTargets.push({room: room.name, source: source.id, score: distance});
    }
    ROOM_REMOTE_TARGETS[roomName] = remoteTargets;
}

function areExitsReachable(room) {
    if (!room.controller) return true;
    const exits = Object.values(Game.map.describeExits(room.name));
    for (let exitRoom of exits) {
        const exitPositions = room.find(room.findExitTo(exitRoom));
        if (!exitPositions.length) continue;
        let pathsFound = false;
        for (let exitPos of exitPositions) {
            const path = PathFinder.search(room.controller.pos, {pos: exitPos, range: 0}, {
                maxOps: 5000,
                plainCost: 1,
                swampCost: 1,
                roomCallback: function (roomName) {
                    let r = Game.rooms[roomName];
                    if (!r) return false;
                    let costs = new PathFinder.CostMatrix();
                    const rStructs = global.roomStructuresFromGame
                        ? global.roomStructuresFromGame(r)
                        : r.find(FIND_STRUCTURES);
                    rStructs.forEach(s => {
                        if (_.union(OBSTACLE_OBJECT_TYPES, [STRUCTURE_RAMPART]).includes(s.structureType)) costs.set(s.pos.x, s.pos.y, Infinity);
                    });
                    r.find(FIND_CREEPS).forEach(c => costs.set(c.pos.x, c.pos.y, 0));
                    return costs;
                }
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

function determineBestAttackRoute(room) {
    const barriers = global.collectRoomBarriers
        ? global.collectRoomBarriers(room)
        : room.ramparts.concat(room.constructedWalls || []).filter(Boolean);
    if (!barriers.length) return undefined;
    const roomExits = Object.values(Game.map.describeExits(room.name));
    const viableExits = roomExits.filter(exit => !INTEL[exit] || !INTEL[exit].owner || INTEL[exit].owner === MY_USERNAME);
    if (!viableExits.length) return undefined;

    let bestExit = room.findExitTo(viableExits[0]);
    let lowestBarrierCount = Infinity;

    for (const exit of viableExits) {
        const exitDirection = room.findExitTo(exit);
        const exitTiles = room.find(exitDirection).filter(t => t.getRangeTo(t.findClosestByRange(barriers)) > 2);
        if (!exitTiles.length) continue;

        const exitTile = exitTiles[0];
        const attackRoute = room.findPath(room.controller.pos, exitTile, {
            ignoreCreeps: true, ignoreDestructibleStructures: true, ignoreRoads: true
        });

        let barrierCount = 0;
        attackRoute.forEach(tile => {
            const pos = new RoomPosition(tile.x, tile.y, room.name);
            if (pos.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL)) barrierCount++;
        });

        if (barrierCount < lowestBarrierCount) {
            lowestBarrierCount = barrierCount;
            bestExit = Game.map.describeExits(room.name)[exitDirection];
        }
    }
    return bestExit;
}

let invaderAlert = {};

Room.prototype.invaderCheck = function () {
    if (!INTEL[this.name]) return false;
    const roomData = INTEL[this.name];
    const {hostileCreeps, friendlyCreeps} = this;
    const previousCheck = roomData.lastInvaderCheck || Game.time;

    const cooldown = hostileCreeps.length ? 3 : 15;
    if (roomData.lastInvaderCheck + cooldown > Game.time) return false;
    roomData.lastInvaderCheck = Game.time;

    if ((roomData.owner && roomData.owner !== MY_USERNAME) || (roomData.reservation && roomData.reservation !== MY_USERNAME) || findClosestOwnedRoom(this.name, true) > 2) {
        Object.assign(roomData, {
            numberOfHostiles: undefined, alertEmail: undefined, friendlyPower: undefined,
            hostilePower: undefined, requestingSupport: undefined, invaderTTL: undefined,
            roomHeat: undefined, threatLevel: undefined, hostileOwners: undefined
        });
        return false;
    }

    if (!hostileCreeps.length) {
        roomData.lastInvaderSighting = undefined;
        if (!roomData.roomHeat && !roomData.threatLevel) {
            roomData.tickDetected = undefined;
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

Room.prototype.boostCheck = function (body = undefined, parts = undefined, tier = undefined, partCount = 1) {
    if (body && body.includes(ATTACK) && !checkBoostType(this, ATTACK, tier)) return false;
    if (body && body.includes(HEAL) && !checkBoostType(this, HEAL, tier)) return false;
    return !(parts && !checkBoostType(this, parts, tier));

    function checkBoostType(room, part, tier = undefined) {
        const needed = 30 * (body && body.length ? body.filter(p => p === part).length : partCount);
        if (body && body.length && tier === undefined) {
            for (const boost of BOOST_USE[part]) if (room.store(boost) >= needed) return true;
            return false;
        }
        return room.store(BOOST_USE[part][tier]) >= needed;
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