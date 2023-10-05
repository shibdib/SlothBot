/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
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
    return this.x > 46 || this.x < 3 || this.y > 46 || this.y < 3;
};

/**
 * Find the closest source
 * @returns {*}
 */
RoomPosition.prototype.getClosestSource = function () {
    let source = this.findClosestByRange(FIND_SOURCES_ACTIVE, {filter: (s) => s.pos.countOpenTerrainAround() > _.filter(Game.rooms[this.roomName].creeps, (c) => c.memory && c.memory.source === s.id).length});
    if (!source) {
        source = this.findClosestByRange(FIND_SOURCES, {filter: (s) => s.pos.countOpenTerrainAround() > _.filter(Game.rooms[this.roomName].creeps, (c) => c.memory && c.memory.source === s.id).length});
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
 * Counts open terrain around a POS
 * @param {boolean} borderBuild - Check if the pos is within 2 of an exit
 * @param {boolean} ignore - Ignore all obstructions besides walls
 * @returns {number}
 */
RoomPosition.prototype.countOpenTerrainAround = function (borderBuild = undefined, ignore = undefined) {
    let openTerrain = 8;
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (xOff !== 0 || yOff !== 0) {
                let pos = new RoomPosition(this.x + xOff, this.y + yOff, this.roomName);
                if (ignore && pos.checkForWall()) openTerrain--;
                else if (pos.checkForImpassible(undefined, true) || (pos.checkForCreep() && !pos.checkForCreep().hasActiveBodyparts(MOVE))) openTerrain--;
                if (borderBuild && pos.getRangeTo(pos.findClosestByRange(FIND_EXIT)) <= 2) openTerrain--;
            }
        }
    }
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
RoomPosition.prototype.isInBunker = function (range = 0) {
    let room = Game.rooms[this.roomName];
    if (!room.memory.bunkerHub) return false;
    let closestExit = this.findClosestByRange(FIND_EXIT);
    let path = PathFinder.search(
        this, {pos: closestExit, range: 0},
        {
            plainCost: 1,
            swampCost: 1,
            roomCallback: function () {
                if (!room) return;
                let costs = new PathFinder.CostMatrix;
                room.find(FIND_STRUCTURES).forEach(function (s) {
                    if (OBSTACLE_OBJECT_TYPES.includes(s.structureType) || s.structureType === STRUCTURE_RAMPART) {
                        costs.set(s.pos.x, s.pos.y, 256);
                    }
                });
                return costs;
            },
        }
    );
    return !path.incomplete;
};


/**
 * Find position at direction
 *
 * @param {number} direction - The direction
 * @returns {object} RoomPosition
 */
RoomPosition.prototype.positionAtDirection = function (direction) {
    let offsetX = [0, 0, 1, 1, 1, 0, -1, -1, -1];
    let offsetY = [0, -1, -1, 0, 1, 1, 1, 0, -1];
    let x = this.x + offsetX[direction];
    let y = this.y + offsetY[direction];
    if (x > 49 || x < 0 || y > 49 || y < 0 || !x || !y) {
        return;
    }
    return new RoomPosition(x, y, this.roomName);
}

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
 * Check for terrain wall
 * @returns {boolean}
 */
RoomPosition.prototype.checkForWall = function () {
    return Game.map.getRoomTerrain(this.roomName).get(this.x, this.y) === 1;
};

/**
 * Check for terrain swamp
 * @returns {boolean}
 */
RoomPosition.prototype.checkForSwamp = function () {
    return Game.map.getRoomTerrain(this.roomName).get(this.x, this.y) === 2;
};

/**
 * Check for terrain plain
 * @returns {boolean}
 */
RoomPosition.prototype.checkForPlain = function () {
    return !Game.map.getRoomTerrain(this.roomName).get(this.x, this.y);
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
 * Check for obstacle structure
 * @returns {*}
 */
RoomPosition.prototype.checkForObstacleStructure = function () {
    let obstacle = this.lookFor(LOOK_STRUCTURES).some(s => OBSTACLE_OBJECT_TYPES.includes(s.structureType));
    if (!obstacle) obstacle = _.find(this.lookFor(LOOK_STRUCTURES), (s) => s.structureType === STRUCTURE_RAMPART && !s.my && !s.isPublic && !FRIENDLIES.includes(s.owner.username));
    if (!obstacle) obstacle = this.lookFor(LOOK_CONSTRUCTION_SITES).some(s => OBSTACLE_OBJECT_TYPES.includes(s.structureType));
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
 * Check for all structures
 * @param ramparts
 * @returns {undefined|*}
 */
RoomPosition.prototype.checkForAllStructure = function (ramparts = false) {
    if (Game.rooms[this.roomName]) {
        if (!ramparts) return _.filter(this.lookFor(LOOK_STRUCTURES), (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_ROAD);
        return this.lookFor(LOOK_STRUCTURES)[0];
    } else {
        return undefined;
    }
};

/**
 * Check for impassible
 * @param ignoreWall
 * @param ignoreCreep
 * @returns {boolean}
 */
RoomPosition.prototype.checkForImpassible = function (ignoreWall = false, ignoreCreep = false) {
    if (ignoreWall) {
        if (this.checkForObstacleStructure() || (!ignoreCreep && this.checkForCreep())) return true;
    } else {
        if (this.checkForObstacleStructure() || this.checkForWall() || (!ignoreCreep && this.checkForCreep())) return true;
    }
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