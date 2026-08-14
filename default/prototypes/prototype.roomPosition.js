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
        const sources = room.sources;
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
    let viable = cachedSources.filter(s => s.active && s.priority > 0);
    if (!viable.length) viable = cachedSources.filter(s => s.priority > 0);
    return viable.length ? this.findClosestByRange(viable.map(s => s.source)) : undefined;
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
const openTerrainCache = Object.create(null);

RoomPosition.prototype.countOpenTerrainAround = function (borderBuild = false, ignore = false) {
    const cacheKey = this.roomName + '_' + this.x + '_' + this.y + '_' + (borderBuild ? 1 : 0) + '_' + (ignore ? 1 : 0);
    const currentTick = Game.time;
    const cached = openTerrainCache[cacheKey];
    if (cached && cached.expiry > currentTick) return cached.value;

    let openTerrain = 0;
    const offsets = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    const terrain = Game.map.getRoomTerrain(this.roomName);
    const room = Game.rooms[this.roomName];
    let exits = room && room._exitTiles;
    if (room && !exits) {
        exits = room._exitTiles = room.find(FIND_EXIT);
    }

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
            const occupant = room && pos.checkForCreep();
            if (tile === TERRAIN_MASK_WALL || (room && pos.checkForObstacleStructure()) ||
                (occupant && !occupant.hasActiveBodyparts(MOVE))) {
                isOpen = false;
            }
        }

        // Only tiles near the map edge can be within 2 of an exit.
        if (isOpen && borderBuild && exits && exits.length && (x <= 2 || x >= 47 || y <= 2 || y >= 47)) {
            const pos = new RoomPosition(x, y, this.roomName);
            const closest = pos.findClosestByRange(exits);
            if (closest && pos.getRangeTo(closest) <= 2) isOpen = false;
        }

        if (isOpen) openTerrain++;
    }

    openTerrainCache[cacheKey] = {
        value: openTerrain,
        expiry: ignore ? currentTick + 1500 : currentTick + 10,
    };
    return openTerrain;
};

/**
 * Find an adjacent position that matches the range to the target
 *
 * @param {object} target - The target in question
 * @param {number} range - The range it should be
 * @returns {object} RoomPosition
 */
/**
 * Check if a position is protected in the bunker
 *
 * @returns {boolean}
 */
const BUNKER_CACHE = {};

function buildInsideSet(room, spots, spotsStr) {
    const terrain = new Room.Terrain(room.name);

    // Combined barrier: rampart perimeter tiles + natural terrain walls
    const walls = new Set();
    for (const p of spots) walls.add(p.x * 50 + p.y);
    for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
            if (terrain.get(x, y) & TERRAIN_MASK_WALL) walls.add(x * 50 + y);
        }
    }

    // C4: plan hub or legacy bunkerHub.
    let hx;
    let hy;
    try {
        const hub = require('planDoc').getHub(room);
        if (!hub) return {spotsStr, inside: new Set()};
        hx = hub.x;
        hy = hub.y;
    } catch (e) {
        if (!room.memory.bunkerHub) return {spotsStr, inside: new Set()};
        hx = room.memory.bunkerHub.x;
        hy = room.memory.bunkerHub.y;
    }
    const hubKey = hx * 50 + hy;

    // 8-directional DFS flood fill from hub — same connectivity as PathFinder
    const inside = new Set([hubKey]);
    const stack = [hubKey];

    while (stack.length) {
        const key = stack.pop();
        const x = Math.floor(key / 50);
        const y = key % 50;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
                const nk = nx * 50 + ny;
                if (inside.has(nk) || walls.has(nk)) continue;
                inside.add(nk);
                stack.push(nk);
            }
        }
    }

    return {spotsStr, inside};
}

RoomPosition.prototype.isInBunker = function () {
    const room = Game.rooms[this.roomName];
    if (!room || room.level < 5) return false;
    // C4: need a hub (plan or legacy).
    let hasHub = false;
    try {
        hasHub = !!require('planDoc').getHub(room);
    } catch (e) {
        hasHub = !!(room.memory && room.memory.bunkerHub);
    }
    if (!hasHub) return false;

    const roomName = this.roomName;
    const spotsStr = ROOM_RAMPART_SPOTS[roomName] || '[]';
    const cached = BUNKER_CACHE[roomName];

    if (!cached || cached.spotsStr !== spotsStr) {
        const spots = JSON.parse(spotsStr);
        BUNKER_CACHE[roomName] = spots.length
            ? buildInsideSet(room, spots, spotsStr)
            : {spotsStr, inside: new Set()};
    }

    return BUNKER_CACHE[roomName].inside.has(this.x * 50 + this.y);
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

const roomTerrainCache = Object.create(null);

function terrainAt(pos) {
    let grid = roomTerrainCache[pos.roomName];
    if (!grid) {
        const terrain = Game.map.getRoomTerrain(pos.roomName);
        grid = new Array(2500);
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                grid[y * 50 + x] = terrain.get(x, y);
            }
        }
        roomTerrainCache[pos.roomName] = grid;
    }
    return grid[pos.y * 50 + pos.x];
}

RoomPosition.prototype.checkForWall = function () {
    return terrainAt(this) === TERRAIN_MASK_WALL;
};

RoomPosition.prototype.checkForSwamp = function () {
    return terrainAt(this) === TERRAIN_MASK_SWAMP;
};

RoomPosition.prototype.checkForPlain = function () {
    return terrainAt(this) === 0;
};

/**
 * Check for creep
 * @returns {*}
 */
let lookCacheTick = -1;
const lookStructuresCache = Object.create(null);
const lookCreepsCache = Object.create(null);

function lookCacheKey(pos) {
    return pos.roomName + '_' + pos.x + '_' + pos.y;
}

function resetLookCaches() {
    if (lookCacheTick === Game.time) return;
    lookCacheTick = Game.time;
    for (const key in lookStructuresCache) delete lookStructuresCache[key];
    for (const key in lookCreepsCache) delete lookCreepsCache[key];
}

function lookStructuresAt(pos) {
    resetLookCaches();
    const key = lookCacheKey(pos);
    if (lookStructuresCache[key] !== undefined) return lookStructuresCache[key];
    if (!Game.rooms[pos.roomName]) {
        lookStructuresCache[key] = [];
        return lookStructuresCache[key];
    }
    lookStructuresCache[key] = pos.lookFor(LOOK_STRUCTURES);
    return lookStructuresCache[key];
}

function lookCreepsAt(pos) {
    resetLookCaches();
    const key = lookCacheKey(pos);
    if (lookCreepsCache[key] !== undefined) return lookCreepsCache[key];
    if (!Game.rooms[pos.roomName]) {
        lookCreepsCache[key] = [];
        return lookCreepsCache[key];
    }
    lookCreepsCache[key] = pos.lookFor(LOOK_CREEPS);
    return lookCreepsCache[key];
}

RoomPosition.prototype.checkForCreep = function () {
    return lookCreepsAt(this)[0];
};

/**
 * Check for built wall
 * @returns {*}
 */
RoomPosition.prototype.checkForBuiltWall = function () {
    return _.find(lookStructuresAt(this), (s) => s.structureType === STRUCTURE_WALL);
};

/**
 * Check for rampart
 * @param active
 * @returns {*}
 */
RoomPosition.prototype.checkForRampart = function (active = undefined) {
    const structures = lookStructuresAt(this);
    if (active) return _.find(structures, (s) => s.structureType === STRUCTURE_RAMPART && !s.isPublic);
    return _.find(structures, (s) => s.structureType === STRUCTURE_RAMPART);
};

/**
 * Check for barrier structure
 * @returns {*}
 */
RoomPosition.prototype.checkForBarrierStructure = function () {
    return _.find(lookStructuresAt(this), (s) => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL);
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

    const structures = lookStructuresAt(this);
    let obstacle = false;
    for (let s of structures) {
        if (OBSTACLE_OBJECT_TYPES.includes(s.structureType)) {
            obstacle = true;
            break;
        }
        if (s.structureType === STRUCTURE_RAMPART) {
            try {
                if (!s.my && !s.isPublic && s.owner && !FRIENDLIES.includes(s.owner.username)) {
                    obstacle = true;
                    break;
                }
            } catch (e) {
                obstacle = true;
                break;
            }
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

    OBSTACLE_CACHE[cacheKey] = {value: obstacle, expiry: currentTick + 5};
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
    return _.find(lookStructuresAt(this), s => s.structureType === STRUCTURE_ROAD);
};

/**
 * Check for container
 * @returns {*}
 */
RoomPosition.prototype.checkForContainer = function () {
    return _.find(lookStructuresAt(this), s => s.structureType === STRUCTURE_CONTAINER);
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
    if (!Game.rooms[this.roomName]) return undefined;
    const structures = lookStructuresAt(this);
    return ramparts
        ? structures[0] || undefined
        : structures.find(s => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_ROAD);
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