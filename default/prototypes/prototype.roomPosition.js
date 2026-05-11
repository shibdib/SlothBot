/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

/**
 * Created by Bob on 7/3/2017.
 */
'use strict';

/**
 * Check if out of bounds
 * @returns {boolean}
 */
RoomPosition.prototype.checkIfOutOfBounds = function () {
    return this.x >= 49 || this.x <= 1 || this.y >= 49 || this.y <= 1;
};

/**
 * Find the closest source
 * @returns {*}
 */
const SOURCE_CACHE = {};
RoomPosition.prototype.getClosestSource = function () {
    const roomName = this.roomName;
    const room = Game.rooms[roomName];
    if (!room) return undefined;
    if (!SOURCE_CACHE[roomName] || SOURCE_CACHE[roomName].tick !== Game.time) {
        const sources = room.find(FIND_SOURCES);
        const creepAssignments = _.countBy(room.creeps, function (c) {
            return c.memory && c.memory.other && c.memory.other.source ? c.memory.other.source : null;
        });
        SOURCE_CACHE[roomName] = {
            sources: sources.map(function (s) {
                const openSpots = s.pos.countOpenTerrainAround();
                const assigned = creepAssignments[s.id] || 0;
                return {source: s, active: s.energyAvailable > 0, priority: openSpots - assigned};
            }),
            tick: Game.time
        };
    }
    const cachedSources = SOURCE_CACHE[roomName].sources;
    let activeSource = _.find(cachedSources, function (s) {
        return s.active && s.priority > 0;
    });
    if (!activeSource) activeSource = _.find(cachedSources, function (s) {
        return s.priority > 0;
    });
    return activeSource ? this.findClosestByRange(_.map(cachedSources, 'source')) : undefined;
};

/**
 * Find in range structures
 * @param objects
 * @param range
 * @param structureTypes
 * @returns {*}
 */
RoomPosition.prototype.findInRangeStructures = function (objects, range, structureTypes) {
    return this.findInRange(objects, 1, {
        filter: function (object) {
            return structureTypes.indexOf(object.structureType) >= 0;
        }
    });
};

/**
 * Find closest structure
 * @param structures
 * @param structureType
 * @returns {*}
 */
RoomPosition.prototype.findClosestStructure = function (structures, structureType) {
    return this.findClosestByPath(structures, {
        filter: function (object) {
            return object.structureType === structureType;
        }
    });
};

/**
 * Get position at direction
 * @param direction
 * @returns {RoomPosition|undefined}
 */
RoomPosition.prototype.getAdjacentPosition = function (direction) {
    const adjacentPos = [
        [0, 0],
        [0, -1],
        [1, -1],
        [1, 0],
        [1, 1],
        [0, 1],
        [-1, 1],
        [-1, 0],
        [-1, -1]
    ];
    try {
        return new RoomPosition(this.x + adjacentPos[direction][0], this.y + adjacentPos[direction][1], this.roomName);
    } catch (e) {
        return undefined;
    }
};

/**
 * Counts open terrain around a position
 * @param {boolean} borderBuild - Check if the position is within 2 tiles of an exit
 * @param {boolean} ignore - Ignore all obstructions besides walls
 * @returns {number}
 */
RoomPosition.prototype.countOpenTerrainAround = function (borderBuild = false, ignore = false) {
    const cacheKey = 'countOpenTerrain_' + this.roomName + '_' + this.x + '_' + this.y + '_' + (borderBuild || false) + '_' + (ignore || false);
    const currentTick = Game.time;

    if (!this._openTerrainCache) this._openTerrainCache = {};
    const cached = this._openTerrainCache[cacheKey];
    if (cached && cached.expiry > currentTick) return cached.value;

    let openTerrain = 0; // Start at 0, increment for valid positions
    const offsets = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    const terrain = Game.map.getRoomTerrain(this.roomName);
    const room = Game.rooms[this.roomName];

    for (let i = 0; i < offsets.length; i++) {
        const x = this.x + offsets[i][0];
        const y = this.y + offsets[i][1];
        if (x < 0 || x > 49 || y < 0 || y > 49) continue;

        const tile = terrain.get(x, y);
        let isOpen = true;

        if (ignore) {
            if (tile === TERRAIN_MASK_WALL) isOpen = false;
        } else {
            const pos = new RoomPosition(x, y, this.roomName);
            if (tile === TERRAIN_MASK_WALL || (room && pos.checkForObstacleStructure()) ||
                (!ignore && room && pos.checkForCreep() && !pos.checkForCreep().hasActiveBodyparts(MOVE))) {
                isOpen = false;
            }
        }

        if (borderBuild && room) {
            const exitKey = 'exit_' + x + '_' + y + '_' + this.roomName;
            if (!this._exitCache) this._exitCache = {};
            let exitRange = this._exitCache[exitKey];
            if (!exitRange || exitRange.tick !== currentTick) {
                const pos = new RoomPosition(x, y, this.roomName);
                exitRange = {value: pos.getRangeTo(pos.findClosestByRange(FIND_EXIT)), tick: currentTick};
                this._exitCache[exitKey] = exitRange;
            }
            if (exitRange.value <= 2) isOpen = false;
        }

        if (isOpen) openTerrain++;
    }

    const expiry = ignore ? currentTick + 1500 : currentTick + 10; // 1500 for static, 10 for dynamic
    this._openTerrainCache[cacheKey] = {value: openTerrain, expiry: expiry};
    return openTerrain;
};

/**
 * Find an adjacent position that matches the range to the target
 *
 * @param {object} target - The target in question
 * @param {number} range - The range it should be
 * @returns {object} RoomPosition
 */
RoomPosition.prototype.getAdjacentPositionAtRange = function (target, range = 3) {
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (xOff !== 0 || yOff !== 0) {
                let pos = new RoomPosition(this.x + xOff, this.y + yOff, this.roomName);
                if (!pos.checkForImpassible() && pos.getRangeTo(target) === range) return pos;
            }
        }
    }
};

/**
 * Check if a position is protected in the bunker
 *
 * @returns {boolean}
 */
const BUNKER_CACHE = {};
RoomPosition.prototype.isInBunker = function () {
    const room = Game.rooms[this.roomName];
    if (!room || !room.memory.bunkerHub || room.level < 5) return false;

    const hub = new RoomPosition(room.memory.bunkerHub.x, room.memory.bunkerHub.y, room.name);
    const roomName = this.roomName;

    if (!BUNKER_CACHE[roomName] || BUNKER_CACHE[roomName].tick !== Game.time) {
        const spots = JSON.parse(ROOM_RAMPART_SPOTS[roomName] || '[]');
        BUNKER_CACHE[roomName] = {
            spots: spots.map(function (p) {
                return new RoomPosition(p.x, p.y, roomName);
            }),
            minX: _.min(spots, 'x').x,
            maxX: _.max(spots, 'x').x,
            minY: _.min(spots, 'y').y,
            maxY: _.max(spots, 'y').y,
            tick: Game.time
        };
    }

    const cache = BUNKER_CACHE[roomName];
    if (!cache.spots.length) return false;

    if (this.x < cache.minX || this.x > cache.maxX || this.y < cache.minY || this.y > cache.maxY) return false;

    const costMatrix = new PathFinder.CostMatrix();
    for (let spot of cache.spots) costMatrix.set(spot.x, spot.y, Infinity);
    const path = PathFinder.search(hub, {pos: this, range: 0}, {
        roomCallback: function (name) {
            return name === roomName ? costMatrix : false;
        },
        maxOps: 1000 // Limit ops
    });
    return !path.incomplete;
};

/**
 * warinternal's Original Code --
 * Shorthand for lookForAtArea around a room position modified by Shibdib from a roomObject to roomPosition
 *
 * @param {string} lookFor - LOOK_* constant
 * @param {boolean} asArray - Return as array bool
 * @param {number} range - Range to look
 * @returns {object} Returns an object/array of the results
 */
RoomPosition.prototype.lookForNearby = function (lookFor, asArray = true, range = 1) {
    if (!Game.rooms[this.roomName]) return undefined;
    return Game.rooms[this.roomName].lookForAtArea(
        lookFor,
        Math.max(0, this.y - range),
        Math.max(0, this.x - range),
        Math.min(49, this.y + range),
        Math.min(49, this.x + range),
        asArray
    );
};

/**
 * warinternal's Original Code --
 * Shorthand for lookAtArea around a room position modified by Shibdib from a roomObject to roomPosition
 *
 * @param {boolean} asArray - Return as array bool
 * @param {number} range - Range to look
 * @returns {object} Returns an object/array of the results
 */
RoomPosition.prototype.lookNearby = function (asArray, range = 1) {
    return Game.rooms[this.roomName].lookAtArea(
        Math.max(0, this.y - range),
        Math.max(0, this.x - range),
        Math.min(49, this.y + range),
        Math.min(49, this.x + range),
        asArray
    );
};

/**
 * Get position at direction
 *
 * @param {number} direction - The direction in question
 * @returns {RoomPosition} Returns a room position or undefined
 */
RoomPosition.prototype.positionAtDirection = function (direction) {
    let offsetX = [0, 0, 1, 1, 1, 0, -1, -1, -1];
    let offsetY = [0, -1, -1, 0, 1, 1, 1, 0, -1];
    let x = this.x + offsetX[direction];
    let y = this.y + offsetY[direction];
    if (isNaN(x) || isNaN(y) || x > 49 || x < 0 || y > 49 || y < 0) {
        return undefined;
    }
    return new RoomPosition(x, y, this.roomName);
};

/**
 * Check for terrain wall
 * @returns {boolean}
 */
RoomPosition.prototype.checkForWall = function () {
    if (!this._wallCache) {
        this._wallCache = {}; // Initialize a cache object for walls
    }

    const cacheKey = `checkForWall_${this.roomName}_${this.x}_${this.y}`;

    if (this._wallCache[cacheKey] !== undefined) {
        return this._wallCache[cacheKey]; // Return cached result if available
    }

    const result = Game.map.getRoomTerrain(this.roomName).get(this.x, this.y) === 1;
    this._wallCache[cacheKey] = result; // Cache the result indefinitely
    return result;
};

/**
 * Check for terrain swamp
 * @returns {boolean}
 */
RoomPosition.prototype.checkForSwamp = function () {
    if (!this._swampCache) {
        this._swampCache = {}; // Initialize a cache object for swamps
    }

    const cacheKey = `checkForSwamp_${this.roomName}_${this.x}_${this.y}`;

    if (this._swampCache[cacheKey] !== undefined) {
        return this._swampCache[cacheKey]; // Return cached result if available
    }

    const result = Game.map.getRoomTerrain(this.roomName).get(this.x, this.y) === 2;
    this._swampCache[cacheKey] = result; // Cache the result indefinitely
    return result;
};

/**
 * Check for terrain plain
 * @returns {boolean}
 */
RoomPosition.prototype.checkForPlain = function () {
    if (!this._plainCache) {
        this._plainCache = {}; // Initialize a cache object for plains
    }

    const cacheKey = `checkForPlain_${this.roomName}_${this.x}_${this.y}`;

    if (this._plainCache[cacheKey] !== undefined) {
        return this._plainCache[cacheKey]; // Return cached result if available
    }

    const result = Game.map.getRoomTerrain(this.roomName).get(this.x, this.y) === 0;
    this._plainCache[cacheKey] = result; // Cache the result indefinitely
    return result;
};

/**
 * Check for creep
 * @returns {*}
 */
RoomPosition.prototype.checkForCreep = function () {
    return this.lookFor(LOOK_CREEPS)[0];
};

/**
 * Check for built wall
 * @returns {*}
 */
RoomPosition.prototype.checkForBuiltWall = function () {
    return _.find(this.lookFor(LOOK_STRUCTURES), (s) => s.structureType === STRUCTURE_WALL);
};

/**
 * Check for rampart
 * @param active
 * @returns {*}
 */
RoomPosition.prototype.checkForRampart = function (active = undefined) {
    if (active) return _.find(this.lookFor(LOOK_STRUCTURES), (s) => s.structureType === STRUCTURE_RAMPART && !s.isPublic);
    return _.find(this.lookFor(LOOK_STRUCTURES), (s) => s.structureType === STRUCTURE_RAMPART);
};

/**
 * Check for barrier structure
 * @returns {*}
 */
RoomPosition.prototype.checkForBarrierStructure = function () {
    return _.find(this.lookFor(LOOK_STRUCTURES), (s) => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL);
};

/**
 * Check for obstacle structure with caching and expiry
 * @returns {boolean} - True if an obstacle structure is found, false otherwise
 */
global.OBSTACLE_CACHE = global.OBSTACLE_CACHE || {};
RoomPosition.prototype.checkForObstacleStructure = function () {
    const cacheKey = this.roomName + '_' + this.x + '_' + this.y;
    const currentTick = Game.time;

    const cached = OBSTACLE_CACHE[cacheKey];
    if (cached && cached.expiry > currentTick) return cached.value;

    const structures = this.lookFor(LOOK_STRUCTURES);
    let obstacle = false;
    for (let s of structures) {
        if (OBSTACLE_OBJECT_TYPES.includes(s.structureType) ||
            (s.structureType === STRUCTURE_RAMPART && !s.my && !s.isPublic && !FRIENDLIES.includes(s.owner.username))) {
            obstacle = true;
            break;
        }
    }

    if (!obstacle) {
        const sites = this.lookFor(LOOK_CONSTRUCTION_SITES);
        for (let s of sites) {
            if (OBSTACLE_OBJECT_TYPES.includes(s.structureType)) {
                obstacle = true;
                break;
            }
        }
    }

    OBSTACLE_CACHE[cacheKey] = {value: obstacle, expiry: currentTick + 5000};
    return obstacle;
};


/**
 * Check for construction site
 * @returns {*}
 */
RoomPosition.prototype.checkForConstructionSites = function () {
    return this.lookFor(LOOK_CONSTRUCTION_SITES)[0];
};

/**
 * Check for mineral
 * @returns {*}
 */
RoomPosition.prototype.checkForMineral = function () {
    return this.lookFor(LOOK_MINERALS)[0];
};

/**
 * Check for road
 * @returns {*}
 */
RoomPosition.prototype.checkForRoad = function () {
    return _.find(this.lookFor(LOOK_STRUCTURES), s => s.structureType === STRUCTURE_ROAD);
};

/**
 * Check for container
 * @returns {*}
 */
RoomPosition.prototype.checkForContainer = function () {
    return _.find(this.lookFor(LOOK_STRUCTURES), s => s.structureType === STRUCTURE_CONTAINER);
};

/**
 * Check for energy
 * @returns {number|any|PaymentCurrencyAmount}
 */
RoomPosition.prototype.checkForEnergy = function () {
    let energy = this.lookFor(LOOK_ENERGY)[0];
    if (energy) return energy.amount;
};

/**
 * Check for all structures with optional rampart exclusion
 * @param {boolean} ramparts - Include ramparts if true
 * @returns {undefined|Structure|boolean} - Returns the first structure, true/false, or undefined if not in a visible room
 */
RoomPosition.prototype.checkForAllStructure = function (ramparts = false) {
    if (!Game.rooms[this.roomName]) {
        return undefined; // Return undefined if the room is not visible
    }

    const cacheKey = `checkForAllStructure_${this.roomName}_${this.x}_${this.y}_${ramparts}`;
    const currentTick = Game.time;

    if (!this._structureCache) {
        this._structureCache = {}; // Initialize a cache object for the position
    }

    if (this._structureCache[cacheKey] && this._structureCache[cacheKey].expiry > currentTick) {
        return this._structureCache[cacheKey].value; // Return cached result if available and not expired
    }

    const structures = this.lookFor(LOOK_STRUCTURES);

    const result = ramparts
        ? structures[0] || undefined // Cache the first structure if ramparts are included
        : structures.find(s => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_ROAD);

    this._structureCache[cacheKey] = {value: result, expiry: currentTick + 5000}; // Cache the result with expiry
    return result;
};

/**
 * Check for impassable terrain or structures
 * @param {boolean} ignoreWall - Whether to ignore walls
 * @param {boolean} ignoreCreep - Whether to ignore creeps
 * @returns {boolean} - True if the position is impassable, false otherwise
 */
const IMPASSIBLE_CACHE = {};
RoomPosition.prototype.checkForImpassible = function (ignoreWall, ignoreCreep) {
    const cacheKey = 'imp_' + this.roomName + '_' + this.x + '_' + this.y + '_' + (ignoreWall || false) + '_' + (ignoreCreep || false);
    const currentTick = Game.time;

    const cached = IMPASSIBLE_CACHE[cacheKey];
    if (cached && cached.tick > currentTick) return cached.value;

    const terrain = Game.map.getRoomTerrain(this.roomName).get(this.x, this.y);
    let impassible = false;

    if (!ignoreWall && terrain === TERRAIN_MASK_WALL) impassible = true;
    else {
        const room = Game.rooms[this.roomName];
        if (room && this.checkForObstacleStructure()) impassible = true;
        else if (!ignoreCreep && room && this.checkForCreep()) impassible = true;
    }

    const expiry = ignoreCreep ? currentTick + CREEP_LIFE_TIME : currentTick + 10;
    IMPASSIBLE_CACHE[cacheKey] = {value: impassible, tick: expiry};
    return impassible;
};

/**
 * Find first in range
 * @param lookUp
 * @param range
 * @returns {*}
 */
RoomPosition.prototype.findFirstInRange = function (lookUp, range) {
    return _.find(lookUp, (o) => this.inRangeTo(o, range));
};

/**
 * Check is pos is an exit
 * @returns {boolean}
 */
RoomPosition.prototype.isExit = function () {
    return this.x < 1 || this.x > 48 || this.y < 1 || this.y > 48;
};

/* Posted December 25th, 2016 by @semperrabbit */

// Special thanks to @helam for finding the client selection code
RoomPosition.prototype.posToString = function (htmlLink = false, id = undefined, memWatch = undefined) {
    if (htmlLink) {
        return `<a href="#!/room/${this.roomName}">[${this.roomName} ${this.x},${this.y}]</a>`;
    }
    return `[${this.roomName} ${this.x},${this.y}]`;
};

RoomPosition.prototype.posFromString = function (str, dontThrowError = false) {
    let temp = str.split(/[\[\] ,]/);
    if (Game.rooms.sim && temp.length == 7) // sometimes sim's pos.toString() gives wierd
        temp = ['', temp[2], temp[4], temp[5], '']; // stuff like "[room sim pos 25,25]"

    if (dontThrowError) {
        if (temp.length !== 5) return ERR_INVALID_ARGS;
        if (!/^(W|E)\d+(N|S)\d+$/.test(temp[1]) && temp[1] !== 'sim') return ERR_INVALID_ARGS;
        if (!/^\d+$/.test(temp[2])) return ERR_INVALID_ARGS;
        if (!/^\d+$/.test(temp[3])) return ERR_INVALID_ARGS;
    }

    return new RoomPosition(temp[2], temp[3], temp[1]);
}