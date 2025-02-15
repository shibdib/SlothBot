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
RoomPosition.prototype.getClosestSource = function () {
    let source = this.findClosestByRange(FIND_SOURCES_ACTIVE, {filter: (s) => s.pos.countOpenTerrainAround() > _.filter(Game.rooms[this.roomName].creeps, (c) => c.memory && c.memory.other.source === s.id).length});
    if (!source) {
        source = this.findClosestByRange(FIND_SOURCES, {filter: (s) => s.pos.countOpenTerrainAround() > _.filter(Game.rooms[this.roomName].creeps, (c) => c.memory && c.memory.other.source === s.id).length});
    }
    return source;
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
RoomPosition.prototype.countOpenTerrainAround = function (borderBuild = undefined, ignore = undefined) {
    const cacheKey = `countOpenTerrain_${this.roomName}_${this.x}_${this.y}_${borderBuild}_${ignore}`;
    const currentTick = Game.time;

    if (!this._openTerrainCache) {
        this._openTerrainCache = {}; // Initialize a cache object for open terrain counts
    }

    if (this._openTerrainCache[cacheKey] && this._openTerrainCache[cacheKey].expiry > currentTick) {
        return this._openTerrainCache[cacheKey].value; // Return cached result if available and not expired
    }

    let openTerrain = 8;
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (xOff !== 0 || yOff !== 0) {
                let pos;
                try {
                    pos = new RoomPosition(this.x + xOff, this.y + yOff, this.roomName);
                } catch (e) {
                    openTerrain--;
                }
                if (pos) {
                    if (ignore && pos.checkForWall()) {
                        openTerrain--;
                    } else if (pos.checkForImpassible(undefined, true) || (pos.checkForCreep() && !pos.checkForCreep().hasActiveBodyparts(MOVE))) {
                        openTerrain--;
                    }
                    if (borderBuild && pos.getRangeTo(pos.findClosestByRange(FIND_EXIT)) <= 2) {
                        openTerrain--;
                    }
                }
            }
        }
    }

    this._openTerrainCache[cacheKey] = {value: openTerrain, expiry: currentTick + 5000}; // Cache the result with expiry
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
RoomPosition.prototype.isInBunker = function () {
    const room = Game.rooms[this.roomName];
    if (!room.memory.bunkerHub || room.level < BUNKER_LEVEL) return false;
    const hub = new RoomPosition(room.memory.bunkerHub.x, room.memory.bunkerHub.y, room.name);
    let spots = JSON.parse(ROOM_RAMPART_SPOTS[room.name]);
    if (!spots.length) return false;
    spots = spots.map(p => new RoomPosition(p.x, p.y, room.name));
    const costMatrix = new PathFinder.CostMatrix();
    for (let spot of spots) costMatrix.set(spot.x, spot.y, Infinity);
    const path = PathFinder.search(hub, {pos: this, range: 0}, {
        roomCallback: function (roomName) {
            if (roomName === room.name) return costMatrix;
            return false;
        }
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
    if (x > 49 || x < 0 || y > 49 || y < 0 || !x || !y) {
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
    const cacheKey = `${this.roomName}_${this.x}_${this.y}`;
    const currentTick = Game.time;

    // Check cache and expiry
    if (OBSTACLE_CACHE[cacheKey] && OBSTACLE_CACHE[cacheKey].expiry > currentTick) {
        return OBSTACLE_CACHE[cacheKey].value;
    }

    // Calculate obstacle presence
    let obstacle = this.lookFor(LOOK_STRUCTURES).some(s => OBSTACLE_OBJECT_TYPES.includes(s.structureType));
    if (!obstacle) {
        obstacle = this.lookFor(LOOK_STRUCTURES).some(
            s => s.structureType === STRUCTURE_RAMPART && !s.my && !s.isPublic && !FRIENDLIES.includes(s.owner.username)
        );
    }
    if (!obstacle) {
        obstacle = this.lookFor(LOOK_CONSTRUCTION_SITES).some(s => OBSTACLE_OBJECT_TYPES.includes(s.structureType));
    }

    // Cache the result with a 5000-tick expiry
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
    return _.filter(this.lookFor(LOOK_STRUCTURES), (s) => s.structureType === STRUCTURE_ROAD)[0];
};

/**
 * Check for container
 * @returns {*}
 */
RoomPosition.prototype.checkForContainer = function () {
    return _.filter(this.lookFor(LOOK_STRUCTURES), (s) => s.structureType === STRUCTURE_CONTAINER)[0];
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
const impassibleCache = {};
RoomPosition.prototype.checkForImpassible = function (ignoreWall = false, ignoreCreep = false) {
    const cacheKey = `checkForImpassible_${this.roomName}_${this.x}_${this.y}_${ignoreWall}_${ignoreCreep}`;
    const currentTick = Game.time;

    if (impassibleCache[cacheKey] && impassibleCache[cacheKey].tick > currentTick) {
        return impassibleCache[cacheKey].value; // Return cached result if available and not expired
    }

    let impassible;

    if (ignoreWall) {
        impassible = this.checkForObstacleStructure() || (!ignoreCreep && this.checkForCreep());
    } else {
        impassible = this.checkForObstacleStructure() || this.checkForWall() || (!ignoreCreep && this.checkForCreep());
    }

    let expires = currentTick + CREEP_LIFE_TIME;
    if (!ignoreCreep) expires = currentTick + 10;
    impassibleCache[cacheKey] = {value: impassible, tick: expires}; // Cache the result with expiry
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
        var onClick = '';
        if (id) onClick += `angular.element('body').injector().get('RoomViewPendingSelector').set('${id}');`;
        if (memWatch) onClick += `angular.element($('section.memory')).scope().Memory.addWatch('${memWatch}');angular.element($('section.memory')).scope().Memory.selectedObjectWatch='${memWatch}';`
        return `<a href="#!/room/${this.roomName}" onClick="${onClick}">[${this.roomName} ${this.x},${this.y}]</a>`;
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