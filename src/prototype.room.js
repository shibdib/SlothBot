/**
 * Created by rober on 7/5/2017.
 */
'use strict';

Room.prototype.getConstructionSites = function () {
    if (!this.constructionSites) {
        this.constructionSites = JSON.parse(JSON.stringify(this.find(FIND_CONSTRUCTION_SITES)));
    }
    return this.constructionSites;
};

Room.prototype.getDroppedResources = function () {
    if (!this.droppedResources) {
        this.droppedResources = this.find(FIND_DROPPED_RESOURCES);
    }
    return this.droppedResources;
};

Room.prototype.getAssignedCreeps = function () {
    return _.filter(Game.creeps, (c) => c.memory.overlord === this.name);
};

Room.prototype.getCreepsInRoom = function () {
    return _.filter(Game.creeps, (c) => c.pos.roomName === this.name);
};

Room.prototype.getExtensionCount = function () {
    let level = this.controller.level;
    if (level === 1) {
        return RCL_1_EXTENSIONS;
    } else if (level === 2) {
        return RCL_2_EXTENSIONS
    } else if (level === 3) {
        return RCL_3_EXTENSIONS
    } else if (level === 4) {
        return RCL_4_EXTENSIONS
    } else if (level === 5) {
        return RCL_5_EXTENSIONS
    } else if (level === 6) {
        return RCL_6_EXTENSIONS
    } else if (level === 7) {
        return RCL_7_EXTENSIONS
    } else if (level === 8) {
        return RCL_8_EXTENSIONS
    }
};

Object.defineProperty(Room.prototype, 'sources', {
    get: function () {
        // If we dont have the value stored locally
        if (!this._sources) {
            // If we dont have the value stored in memory
            if (!this.memory.sourceIds) {
                // Find the sources and store their id's in memory,
                // NOT the full objects
                this.memory.sourceIds = this.find(FIND_SOURCES)
                    .map(source => source.id);
            }
            // Get the source objects from the id's in memory and store them locally
            this._sources = this.memory.sourceIds.map(id => Game.getObjectById(id));
        }
        // return the locally stored value
        return this._sources;
    },
    set: function (newValue) {
        // when storing in memory you will want to change the setter
        // to set the memory value as well as the local value
        this.memory.sources = newValue.map(source => source.id);
        this._sources = newValue;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'mineral', {
    get: function () {
        // If we dont have the value stored locally
        if (!this._mineral) {
            // If we dont have the value stored in memory
            if (!this.memory.mineralId) {
                // Find the sources and store their id's in memory,
                // NOT the full objects
                this.memory.mineralId = this.find(FIND_MINERALS)
                    .map(mineral => mineral.id);
            }
            // Get the source objects from the id's in memory and store them locally
            this._mineral = this.memory.mineralId.map(id => Game.getObjectById(id));
        }
        // return the locally stored value
        return this._mineral;
    },
    set: function (newValue) {
        // when storing in memory you will want to change the setter
        // to set the memory value as well as the local value
        this.memory.mineral = newValue.map(mineral => mineral.id);
        this._mineral = newValue;
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

Object.defineProperty(Room.prototype, 'droppedResources', {
    get: function () {
        if (!this._droppedResources) {
            this._droppedResources = this.find(FIND_DROPPED_RESOURCES);
        }
        return this._droppedResources;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'droppedEnergy', {
    get: function () {
        if (!this._droppedEnergy) {
            this._droppedEnergy = this.find(FIND_DROPPED_RESOURCES, {filter: (r) => r.resourceType === RESOURCE_ENERGY});
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

Object.defineProperty(Room.prototype, 'hostileCreeps', {
    get: function () {
        if (!this._Hostilecreeps) {
            this._Hostilecreeps = this.find(FIND_HOSTILE_CREEPS);
        }
        return this._Hostilecreeps;
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
            this._tombstones = this.find(FIND_TOMBSTONES);
        }
        return this._tombstones;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'level', {
    get: function () {
        if (!this._level) {
            this._level = this.controller.level;
        }
        return this._level;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'energy', {
    get: function () {
        if (!this.controller || this.controller.owner.username !== USERNAME) {
            if (!this._energy) {
                this._energy = undefined;
            }
        } else {
            if (!this._energy) {
                this._energy = getRoomEnergy(this);
            }
        }
        return this._energy;
    },
    enumerable: false,
    configurable: true
});

function getRoomEnergy(room) {
    let energy = room.energyAvailable;
    if (room.storage) energy = room.storage.store[RESOURCE_ENERGY] + energy;
    if (room.terminal) energy = room.terminal.store[RESOURCE_ENERGY] + energy;
    return energy;
}

/**
 * Provides structure memory.
 */
Object.defineProperty(StructureLab.prototype, 'memory', {
    get: function () {
        if (Memory.structureMemory === undefined || !Memory.structureMemory) {
            Memory.structureMemory = {};
        }
        if (Memory.structureMemory[this.id] === undefined || !Memory.structureMemory[this.id]) {
            Memory.structureMemory[this.id] = {};
        }
        return Memory.structureMemory[this.id];
    },
    set: function (v) {
        return _.set(Memory, 'structureMemory.' + this.id, v);
    },
    configurable: true,
    enumerable: false,
});

Room.prototype.cacheRoomIntel = function (force = false) {
    if (this.memory.lastIntelCache > Game.time - 500 && !force) return;
    this.memory.lastIntelCache = Game.time;
    let room = Game.rooms[this.name];
    let owner, reservation, reservationTick, level, hostiles, nonCombats, sk, towers, claimValue, claimWorthy,
        needsCleaning, power, abandoned;
    if (room) {
        let cache = Memory.roomCache || {};
        let sources = room.sources;
        let structures = _.filter(room.structures, (e) => e.structureType !== STRUCTURE_WALL && e.structureType !== STRUCTURE_RAMPART && e.structureType !== STRUCTURE_ROAD && e.structureType !== STRUCTURE_CONTAINER && e.structureType !== STRUCTURE_CONTROLLER);
        let barriers, spawns;
        barriers = _.filter(room.structures, (e) => e.structureType === STRUCTURE_WALL || e.structureType === STRUCTURE_RAMPART).length > 5;
        spawns = _.filter(room.structures, (e) => e.structureType === STRUCTURE_SPAWN);
        hostiles = _.filter(room.creeps, (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && !_.includes(FRIENDLIES, e.owner.username));
        nonCombats = _.filter(room.creeps, (e) => (!e.getActiveBodyparts(ATTACK) || !e.getActiveBodyparts(RANGED_ATTACK)) && !_.includes(FRIENDLIES, e.owner.username));
        towers = _.filter(room.structures, (e) => e.structureType === STRUCTURE_TOWER);
        power = _.filter(room.structures, (e) => e.structureType === STRUCTURE_POWER_BANK);
        if (_.filter(room.structures, (e) => e.structureType === STRUCTURE_KEEPER_LAIR).length > 0) sk = true;
        let minerals = room.mineral;
        if (room.controller) {
            owner = room.controller.owner;
            level = room.controller.level;
            if (room.controller.reservation) {
                reservation = room.controller.reservation.username;
                reservationTick = room.controller.reservation.ticksToEnd + Game.time;
            }
            // Handle claim targets
            let closestRoom = this.findClosestOwnedRoom(true);
            let safemodeCooldown = this.controller.safeModeCooldown;
            if (!owner && !safemodeCooldown && !reservation && sources.length > 1 && closestRoom > 2 && !barriers) {
                let sourceDist = 0;
                for (let source in sources) {
                    let range = sources[source].pos.getRangeTo(room.controller);
                    sourceDist = sourceDist + range;
                }
                claimValue = 250 - sourceDist;
                let minerals = Memory.ownedMineral;
                let roomRangeMulti = 0;
                if (3 < closestRoom < 7) roomRangeMulti = 50;
                if (6 < closestRoom < 13) roomRangeMulti = 20;
                claimValue = claimValue + roomRangeMulti;
                if (!_.includes(minerals, room.mineral[0].mineralType)) claimValue = claimValue * 2;
                claimWorthy = true;
            } else {
                claimValue = undefined;
                claimWorthy = undefined;
            }
            // Handle abandoned rooms
            if (!owner && !reservation && structures.length > 2) {
                needsCleaning = true;
            }
        }
        let potentialTarget;
        if (!owner && nonCombats.length >= 2) potentialTarget = true;
        if (owner && !spawns) abandoned = true;
        let key = room.name;
        if (Memory.roomCache[key]) Memory.roomCache[key] = undefined;
        cache[key] = {
            cached: Game.time,
            name: room.name,
            sources: sources,
            minerals: minerals,
            owner: owner,
            abandoned: abandoned,
            reservation: reservation,
            reservationTick: reservationTick,
            level: level,
            towers: towers.length,
            barriers: barriers,
            hostiles: hostiles.length,
            nonCombats: nonCombats.length,
            sk: sk,
            claimValue: claimValue,
            claimWorthy: claimWorthy,
            needsCleaning: needsCleaning,
            potentialTarget: potentialTarget
        };
        Memory.roomCache = cache;
        if (power.length && power[0].ticksToDecay >= 2500) {
            for (let key in Memory.ownedRooms) {
                if (Game.map.findRoute(Memory.ownedRooms[key].name, room.name).length <= 6) {
                    let activeRoom = Memory.ownedRooms[key];
                    cache = {} || activeRoom.memory.powerRooms;
                    cache[room.name] = {
                        cached: Game.time,
                        decayOn: power[0].ticksToDecay + Game.time,
                        hits: power[0].hits,
                        powerAmount: power[0].power
                    };
                    log.a('Power found in ' + room.name + ' adding to power targets for ' + activeRoom.name);
                    activeRoom.memory.powerRooms = cache;
                    break;
                }
            }
        }
        if ((sk || sources.length > 0) && !owner) {
            for (let key in Memory.ownedRooms) {
                let activeRoom = Memory.ownedRooms[key];
                if (activeRoom && Game.map.findRoute(activeRoom.name, room.name).length <= 2) {
                    if (sk) {
                        if (activeRoom.memory.skRooms) {
                            if (_.includes(activeRoom.memory.skRooms, room.name) === false) {
                                activeRoom.memory.skRooms.push(room.name);
                            }
                        } else {
                            activeRoom.memory.skRooms = [];
                        }
                    }
                    if (activeRoom && Game.map.findRoute(activeRoom.name, room.name).length <= 3 && !owner && !sk && !reservation) {
                        if (activeRoom.memory.remoteRooms) {
                            if (_.includes(activeRoom.memory.remoteRooms, room.name) === false) {
                                if (!Game.rooms[room.name] || !Game.rooms[room.name].memory.noRemote) {
                                    activeRoom.memory.remoteRooms.push(room.name);
                                }
                            }
                        } else {
                            activeRoom.memory.remoteRooms = [];
                        }
                    } else if (activeRoom && _.includes(activeRoom.memory.remoteRooms, room.name) === true) {
                        _.remove(activeRoom.memory.remoteRooms, room.name);
                    }
                }
            }
        } else if (owner) {
            for (let key in Memory.ownedRooms) {
                let activeRoom = Memory.ownedRooms[key];
                if (_.includes(activeRoom.memory.remoteRooms, room.name) === true) {
                    activeRoom.memory.remoteRooms = _.filter(activeRoom.memory.remoteRooms, (e) => e !== room.name);
                }
            }
        }
    }
};


Room.prototype.invaderCheck = function () {
    if (this.memory.lastInvaderCheck + 3 >= Game.time) return;
    if (!Memory.roomCache) Memory.roomCache = {};
    if (!Memory.roomCache[this.name]) Memory.roomCache[this.name] = {};
    let sk;
    if (_.filter(this.structures, (e) => e.structureType === STRUCTURE_KEEPER_LAIR).length > 0) sk = true;
    let closestRoomRange = this.findClosestOwnedRoom(true);
    if (((this.controller && this.controller.owner && !this.controller.my) || sk || (this.controller && this.controller.reservation && !this.controller.my)) && closestRoomRange <= 5) {
        this.memory.numberOfHostiles = undefined;
        this.memory.responseNeeded = undefined;
        this.memory.alertEmail = undefined;
        this.memory.requestingSupport = undefined;
        this.memory.threatLevel = undefined;
        return;
    }
    this.memory.lastInvaderCheck = Game.time;
    let invader = _.filter(this.hostileCreeps, (c) => !_.includes(FRIENDLIES, c.owner.username) && c.owner.username !== 'Source Keeper' && c.getActiveBodyparts(ATTACK) >= 1 || c.getActiveBodyparts(RANGED_ATTACK) >= 1 || c.getActiveBodyparts(HEAL) >= 1 || c.getActiveBodyparts(WORK) >= 3);
    if (invader.length > 0) {
        if (Game.time % 50 === 0) log.a('Response Requested in ' + this.name + '. ' + invader.length + ' hostiles detected.');
        this.memory.responseNeeded = true;
        this.memory.tickDetected = Game.time;
        if (!this.memory.numberOfHostiles || this.memory.numberOfHostiles < invader.length) {
            this.memory.numberOfHostiles = invader.length || 1;
        }
        // Determine threat
        if ((invader.length === 1 && invader[0].owner.username === 'Invader') || (this.controller && this.controller.safeMode)) this.memory.threatLevel = 1;
        if (invader.length > 1 && invader[0].owner.username === 'Invader') this.memory.threatLevel = 2;
        if (invader.length === 1 && invader[0].owner.username !== 'Invader') {
                this.memory.threatLevel = 3;
                Memory.roomCache[this.name].threatLevel = 3;
                let cache = Memory._badBoyList || {};
            let key = invader[0].owner.username;
                let multiple = 2;
                if (this.controller && this.controller.owner && _.includes(FRIENDLIES, this.controller.owner.username)) multiple = 10;
                else if (this.controller && this.controller.reservation && _.includes(FRIENDLIES, this.controller.reservation.username)) multiple = 2;
                else if (this.controller && this.controller.owner && !_.includes(FRIENDLIES, this.controller.owner.username)) multiple = 0;
                else if (this.controller && this.controller.reservation && !_.includes(FRIENDLIES, this.controller.reservation.username)) multiple = 0;
                let threatRating;
            let gained = invader.length * multiple;
                if (cache[key]) {
                    if (cache[key].lastAction + 50 > Game.time) return true;
                    threatRating = cache[key]['threatRating'] + gained;
                } else {
                    threatRating = gained;
                }
                cache[key] = {
                    threatRating: threatRating,
                    lastAction: Game.time,
                };
                Memory._badBoyList = cache;
                log.a(key + ' has gained ' + gained + ' and now has a threat rating of ' + threatRating + ' from an incident in ' + this.name);
                let roomHeat = this.memory.roomHeat || 0;
            this.memory.roomHeat = roomHeat + (invader.length * 5);
        }
        if (invader.length > 1 && invader[0].owner.username !== 'Invader') {
                this.memory.threatLevel = 4;
                Memory.roomCache[this.name].threatLevel = 4;
                let cache = Memory._badBoyList || {};
            let key = invader[0].owner.username;
                let multiple = 2;
                if (this.controller && this.controller.owner && _.includes(FRIENDLIES, this.controller.owner.username)) multiple = 10;
                else if (this.controller && this.controller.reservation && _.includes(FRIENDLIES, this.controller.reservation.username)) multiple = 2;
                else if (this.controller && this.controller.owner && !_.includes(FRIENDLIES, this.controller.owner.username)) multiple = 0;
                else if (this.controller && this.controller.reservation && !_.includes(FRIENDLIES, this.controller.reservation.username)) multiple = 0;
                let threatRating;
            let gained = invader.length * multiple;
                if (cache[key]) {
                    if (cache[key].lastAction + 50 > Game.time) return true;
                    threatRating = cache[key]['threatRating'] + gained;
                } else {
                    threatRating = gained;
                }
                cache[key] = {
                    threatRating: threatRating,
                    lastAction: Game.time,
                };
                Memory._badBoyList = cache;
                log.a(key + ' has gained ' + gained + ' and now has a threat rating of ' + threatRating + ' from an incident in ' + this.name);
                let roomHeat = this.memory.roomHeat || 0;
            this.memory.roomHeat = roomHeat + (invader.length * 5);
        }
        return invader.length > 0;
    }
    let waitOut = 25;
    if (this.controller && this.controller.my && this.memory.threatLevel > 1) waitOut = 100;
    if (this.memory.tickDetected < Game.time - waitOut || !this.memory.responseNeeded) {
        Memory.roomCache[this.name].threatLevel = undefined;
        let roomHeat = (this.memory.roomHeat - 0.5) || 0;
        if (roomHeat <= 0) {
            this.memory.roomHeat = undefined;
        } else {
            this.memory.roomHeat = roomHeat;
        }
        this.memory.numberOfHostiles = undefined;
        this.memory.responseNeeded = undefined;
        this.memory.alertEmail = undefined;
        this.memory.requestingSupport = undefined;
        this.memory.threatLevel = undefined;
        if (this.memory.creepBuildQueue) {
            delete this.memory.creepBuildQueue['responder'];
            if (this.memory.creepBuildQueue['longbow'] && this.memory.creepBuildQueue['longbow'].responseTarget === this.name) delete this.memory.creepBuildQueue['longbow'];
        }
    }
    return false;
};

Room.prototype.handleNukeAttack = function () {
    let nukes = this.find(FIND_NUKES);
    if (nukes.length === 0) {
        return false;
    }

    let sorted = _.sortBy(nukes, function (object) {
        return object.timeToLand;
    });

    let findSaveableStructures = function (object) {
        if (object.structureType === STRUCTURE_ROAD) {
            return false;
        }
        if (object.structureType === STRUCTURE_RAMPART) {
            return false;
        }
        if (object.structureType === STRUCTURE_EXTENSION) {
            return false;
        }
        if (object.structureType === STRUCTURE_CONTROLLER) {
            return false;
        }
        return object.structureType !== STRUCTURE_WALL;

    };

    let isRampart = function (object) {
        return object.structureType === STRUCTURE_RAMPART;
    };

    for (let nuke of nukes) {
        if (nuke.timeToLand <= 200) {
            for (let c of nuke.room.creeps) {
                c.memory.fleeNukeTime = Game.time + nuke.timeToLand + 2;
                c.memory.fleeNukeRoom = nuke.room.name;
            }
        }
        let structures = nuke.pos.findInRange(FIND_MY_STRUCTURES, 4, {
            filter: findSaveableStructures
        });
        for (let structure of structures) {
            let lookConstructionSites = structure.pos.lookFor(LOOK_CONSTRUCTION_SITES);
            if (lookConstructionSites.length > 0) {
                continue;
            }
            let lookStructures = structure.pos.lookFor(LOOK_STRUCTURES);
            let lookRampart = _.findIndex(lookStructures, isRampart);
            if (lookRampart > -1) {
                continue;
            }
            structure.pos.createConstructionSite(STRUCTURE_RAMPART);
        }
    }

    return true;
};

Room.prototype.findClosestOwnedRoom = function (range = false, safePath = false) {
    let distance = 0;
    let closest;
    for (let key in Memory.ownedRooms) {
        let range = Game.map.findRoute(this, Memory.ownedRooms[key]).length;
        if (safePath) range = this.shibRoute(Memory.ownedRooms[key]).length - 1;
        if (!distance) {
            distance = range;
            closest = Memory.ownedRooms[key].name;
        } else if (range < distance) {
            distance = range;
            closest = Memory.ownedRooms[key].name;
        }
    }
    if (!range) return closest;
    return distance;
};