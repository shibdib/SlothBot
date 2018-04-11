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
        if (!this.droppedResources) {
            this.droppedResources = this.find(FIND_DROPPED_RESOURCES);
        }
        return this.droppedResources;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(Room.prototype, 'droppedEnergy', {
    get: function () {
        if (!this.droppedEnergy) {
            this.droppedEnergy = this.find(FIND_DROPPED_ENERGY);
        }
        return this.droppedEnergy;
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
        needsCleaning, power;
    if (room) {
        let cache = Memory.roomCache || {};
        let sources = room.sources;
        let structures = _.filter(room.structures, (e) => e.structureType !== STRUCTURE_WALL && e.structureType !== STRUCTURE_RAMPART && e.structureType !== STRUCTURE_ROAD && e.structureType !== STRUCTURE_CONTAINER && e.structureType !== STRUCTURE_CONTROLLER);
        hostiles = _.filter(room.creeps, (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(FRIENDLIES, e.owner.username) === false);
        nonCombats = _.filter(room.creeps, (e) => (e.getActiveBodyparts(ATTACK) === 1 || e.getActiveBodyparts(RANGED_ATTACK) === 1) && _.includes(FRIENDLIES, e.owner.username) === false);
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
            if (!owner && !reservation && sources.length > 1 && room.controller.pos.countOpenTerrainAround() > 0) {
                let wall = 0;
                let plains = 0;
                let terrain = room.lookForAtArea(LOOK_TERRAIN, 0, 0, 49, 49, true);
                for (let key in terrain) {
                    let position = new RoomPosition(terrain[key].x, terrain[key].y, room.name);
                    if (position.checkForWall()) {
                        wall++
                    } else if (position.checkForPlain()) {
                        plains++
                    }
                }
                if (wall < 600 && plains > 200) {
                    let sourceDist = 0;
                    for (let source in sources) {
                        let range = sources[source].pos.getRangeTo(room.controller);
                        sourceDist = sourceDist + range;
                    }
                    claimValue = plains - sourceDist;
                    let minerals = Memory.ownedMineral;
                    if (!_.includes(minerals, room.mineral[0].mineralType)) claimValue = claimValue / 2;
                    claimWorthy = true;
                } else {
                    claimWorthy = false;
                }
            } else {
                claimValue = undefined;
                claimWorthy = false;
            }
            // Handle abandoned rooms
            if (!owner && !reservation && structures.length > 2) {
                needsCleaning = true;
            }
        }
        let key = room.name;
        cache[key] = {
            cached: Game.time,
            name: room.name,
            sources: sources,
            minerals: minerals,
            owner: owner,
            reservation: reservation,
            reservationTick: reservationTick,
            level: level,
            towers: towers.length,
            hostiles: hostiles.length,
            nonCombats: nonCombats.length,
            sk: sk,
            claimValue: claimValue,
            claimWorthy: claimWorthy,
            needsCleaning: needsCleaning
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
                if (Game.map.findRoute(activeRoom.name, room.name).length <= 2) {
                    if (sk) {
                        if (activeRoom.memory.skRooms) {
                            if (_.includes(activeRoom.memory.skRooms, room.name) === false) {
                                activeRoom.memory.skRooms.push(room.name);
                            }
                        } else {
                            Game.spawns[key].room.memory.skRooms = [];
                        }
                    }
                    if (Game.map.findRoute(activeRoom.name, room.name).length <= 3 && !owner && !sk && !reservation) {
                        if (activeRoom.memory.remoteRooms) {
                            if (_.includes(activeRoom.memory.remoteRooms, room.name) === false) {
                                activeRoom.memory.remoteRooms.push(room.name);
                            }
                        } else {
                            activeRoom.memory.remoteRooms = [];
                        }
                    } else if (_.includes(activeRoom.memory.remoteRooms, room.name) === true) {
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
    let sk;
    if (this.memory.lastInvaderCheck === Game.time) return;
    if (_.filter(this.structures, (e) => e.structureType === STRUCTURE_KEEPER_LAIR).length > 0) sk = true;
    if ((this.controller && this.controller.owner && !_.includes(FRIENDLIES, this.controller.owner.username)) || sk || (this.controller && this.controller.reservation && !_.includes(FRIENDLIES, this.controller.reservation.username))) return;
    this.memory.lastInvaderCheck = Game.time;
    let invader = _.filter(this.creeps, (c) => !_.includes(FRIENDLIES, c.owner.username) && c.owner.username !== 'Source Keeper');
    let armed = _.filter(invader, (s) => s.getActiveBodyparts(ATTACK) >= 1 || s.getActiveBodyparts(RANGED_ATTACK) >= 1 || s.getActiveBodyparts(HEAL) >= 1 || s.getActiveBodyparts(WORK) >= 3);
    if (invader.length > 0) {
        if (Game.time % 50 === 0) log.a('Response Requested in ' + this.name + '. ' + invader.length + ' hostiles detected.');
        let availableLongbows = _.filter(Game.creeps, (c) => c.memory && c.memory.awaitingOrders && Game.map.findRoute(c.room.name, this.name) <= 5);
        if (availableLongbows.length) {
            let retasked = 0;
            for (let key in availableLongbows) {
                if (retasked + 1 >= invader.length) break;
                availableLongbows[key].memory.awaitingOrders = undefined;
                availableLongbows[key].memory.responseTarget = this.name;
                log.a(availableLongbows[key].name + ' has been re-tasked to assist ' + this.name + ' they are en-route from ' + availableLongbows[key].room.name);
                retasked++;
            }
        }
        this.memory.responseNeeded = true;
        this.memory.tickDetected = Game.time;
        if (!this.memory.numberOfHostiles || this.memory.numberOfHostiles < invader.length) {
            this.memory.numberOfHostiles = armed.length || 1;
        }
        // Determine threat
        if (invader.length === 1 && invader[0].owner.username === 'Invader') this.memory.threatLevel = 1;
        if (invader.length > 1 && invader[0].owner.username === 'Invader') this.memory.threatLevel = 2;
        if (invader.length === 1 && invader[0].owner.username !== 'Invader') {
            if (armed.length) {
                this.memory.threatLevel = 3;
                let cache = Memory._badBoyList || {};
                let key = armed[0].owner.username;
                let multiple = 2;
                if (this.controller && this.controller.owner && _.includes(FRIENDLIES, this.controller.owner.username)) multiple = 10;
                else if (this.controller && this.controller.reservation && _.includes(FRIENDLIES, this.controller.reservation.username)) multiple = 2;
                else if (this.controller && this.controller.owner && !_.includes(FRIENDLIES, this.controller.owner.username)) multiple = 0;
                else if (this.controller && this.controller.reservation && !_.includes(FRIENDLIES, this.controller.reservation.username)) multiple = 0;
                let threatRating;
                let gained = armed.length * multiple;
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
                this.memory.roomHeat = roomHeat + (armed.length * 5);
            } else {
                this.memory.threatLevel = 1;
                if (invader[0].getActiveBodyparts(MOVE) === 1) return true;
            }
        }
        if (invader.length > 1 && invader[0].owner.username !== 'Invader') {
            if (armed.length) {
                this.memory.threatLevel = 4;
                let cache = Memory._badBoyList || {};
                let key = armed[0].owner.username;
                let multiple = 2;
                if (this.controller && this.controller.owner && _.includes(FRIENDLIES, this.controller.owner.username)) multiple = 10;
                else if (this.controller && this.controller.reservation && _.includes(FRIENDLIES, this.controller.reservation.username)) multiple = 2;
                else if (this.controller && this.controller.owner && !_.includes(FRIENDLIES, this.controller.owner.username)) multiple = 0;
                else if (this.controller && this.controller.reservation && !_.includes(FRIENDLIES, this.controller.reservation.username)) multiple = 0;
                let threatRating;
                let gained = armed.length * multiple;
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
                this.memory.roomHeat = roomHeat + (armed.length * 5);
            } else {
                this.memory.threatLevel = 2;
                if (invader[0].getActiveBodyparts(MOVE) === 1) return true;
            }
        }
        return !!armed.length;
    }
    if (this.memory.tickDetected < Game.time - 30 || this.memory.responseNeeded === false) {
        this.memory.roomHeat = (this.memory.roomHeat - 0.5) || 0;
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
        let structures = nuke.pos.findInRange(FIND_MY_STRUCTURES, 4, {
            filter: findSaveableStructures
        });
        log.a('Nuke attack !!!!!');
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