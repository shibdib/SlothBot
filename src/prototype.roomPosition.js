/**
 * Created by Bob on 7/3/2017.
 */
'use strict';

let distanceCache = {};

RoomPosition.prototype.checkIfOutOfBounds = function () {
    return this.x > 48 || this.x < 1 || this.y > 48 || this.y < 1;
};

RoomPosition.prototype.getClosestSource = function () {
    let source = this.findClosestByRange(FIND_SOURCES_ACTIVE, {filter: (s) => s.pos.countOpenTerrainAround() >= _.filter(Game.rooms[this.roomName].creeps, (c) => c.memory && c.memory.source === s.id).length});
    if (source === null) {
        source = this.findClosestByRange(FIND_SOURCES, {filter: (s) => s.pos.countOpenTerrainAround() >= _.filter(Game.rooms[this.roomName].creeps, (c) => c.memory && c.memory.source === s.id).length});
    }
    return source;
};

RoomPosition.prototype.findInRangeStructures = function (objects, range, structureTypes) {
    return this.findInRange(objects, 1, {
        filter: function (object) {
            return structureTypes.indexOf(object.structureType) >= 0;
        }
    });
};

RoomPosition.prototype.findClosestStructure = function (structures, structureType) {
    return this.findClosestByPath(structures, {
        filter: function (object) {
            return object.structureType === structureType;
        }
    });
};

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
    return new RoomPosition(this.x + adjacentPos[direction][0], this.y + adjacentPos[direction][1], this.roomName);
};

RoomPosition.prototype.countOpenTerrainAround = function () {
    let terrainArray = Game.rooms[this.roomName].lookForAtArea(LOOK_TERRAIN, this.y - 1, this.x - 1, this.y + 1, this.x + 1, true);
    let plainArray = _.filter(terrainArray, 'terrain', 'plain');
    let swampArray = _.filter(terrainArray, 'terrain', 'swamp');
    let structures = Game.rooms[this.roomName].lookForAtArea(LOOK_STRUCTURES, this.y - 1, this.x - 1, this.y + 1, this.x + 1, true);
    let wall = _.filter(structures, 'structure', 'constructedWall');
    return plainArray.length + swampArray.length - wall.length;
};

RoomPosition.prototype.checkForWall = function () {
    return Game.map.getRoomTerrain(this.roomName).get(this.x, this.y) & TERRAIN_MASK_WALL > 0;
};

RoomPosition.prototype.checkForSwamp = function () {
    return Game.map.getRoomTerrain(this.roomName).get(this.x, this.y) & TERRAIN_MASK_SWAMP > 0;
};

RoomPosition.prototype.checkForCreep = function () {
    return _.filter(this.lookFor(LOOK_CREEPS))[0];
};

RoomPosition.prototype.checkForPlain = function () {
    return !Game.map.getRoomTerrain(this.roomName).get(this.x, this.y);
};

RoomPosition.prototype.checkForBuiltWall = function () {
    return _.filter(this.lookFor(LOOK_STRUCTURES), (s) => s.structureType === STRUCTURE_WALL)[0];
};

RoomPosition.prototype.checkForRampart = function () {
    return _.filter(this.lookFor(LOOK_STRUCTURES), (s) => s.structureType === STRUCTURE_RAMPART)[0];
};

RoomPosition.prototype.checkForBarrierStructure = function () {
    return _.filter(this.lookFor(LOOK_STRUCTURES), (s) => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL)[0];
};

RoomPosition.prototype.checkForObstacleStructure = function () {
    return this.lookFor(LOOK_STRUCTURES).some(s => OBSTACLE_OBJECT_TYPES.includes(s.structureType));
};

RoomPosition.prototype.checkForConstructionSites = function () {
    return this.lookFor(LOOK_CONSTRUCTION_SITES).length;
};

RoomPosition.prototype.checkForRoad = function () {
    return _.filter(this.lookFor(LOOK_STRUCTURES), (s) => s.structureType === STRUCTURE_ROAD)[0];
};

RoomPosition.prototype.checkForAllStructure = function (ramparts = false) {
    if (Game.rooms[this.roomName]) {
        if (!ramparts) return _.filter(this.lookFor(LOOK_STRUCTURES), (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_ROAD);
        return this.lookFor(LOOK_STRUCTURES);
    } else {
        return undefined;
    }
};

RoomPosition.prototype.checkForImpassible = function () {
    if (this.checkForObstacleStructure() || this.checkForWall()) return true;
};

RoomPosition.prototype.isExit = function () {
    return this.x <= 1 || this.x >= 48 || this.y <= 1 || this.y >= 48;
};

RoomPosition.prototype.isValid = function () {
    if (this.x < 0 || this.y < 0) {
        return false;
    }
    return !(this.x > 49 || this.y > 49);
};

RoomPosition.prototype.buildRoomPosition = function (direction, distance) {
    if (distance > 1) {
        log.i('!!!! Distance > 1 not yet implemented');
    }
    return this.getAdjacentPosition((direction - 1) % 8 + 1);
};

RoomPosition.prototype.rangeToTarget = function (target) {
    if (!target) return;
    // Distance cache fails hard on MMO
    delete Memory._distanceCache;
    if (Game.shard.name === 'shard0' || Game.shard.name === 'shard1' || Game.shard.name === 'shard2' || Game.shard.name === 'shard3') {
        return this.getRangeTo(target);
    }
    let cached = getCachedTargetDistance(this, target);
    if (cached) return cached;
    return cacheTargetDistance(this, target);
};

function cacheTargetDistance(origin, target) {
    let key, cache;
    if (target instanceof RoomPosition) key = getPathKey(origin, target); else key = getPathKey(origin, target.pos);
    cache = distanceCache
    let distance = origin.getRangeTo(target);
    cache[key] = {
        distance: distance,
        uses: 1,
        tick: Game.time
    };
    distanceCache = cache;
    return distance;
}

function getCachedTargetDistance(origin, target) {
    let cache = distanceCache;
    if (cache) {
        let cachedDistance;
        if (target instanceof RoomPosition) cachedDistance = cache[getPathKey(origin, target)]; else cachedDistance = cache[getPathKey(origin, target.pos)];
        if (cachedDistance) {
            cachedDistance.uses += 1;
            distanceCache = cache;
            return cachedDistance.distance;
        }
        return null;
    } else {
        return null;
    }
}

function getPathKey(from, to) {
    return getPosKey(from) + '$' + getPosKey(to);
}

function getPosKey(pos) {
    return pos.x + 'x' + pos.y + pos.roomName;
}

//SemperRabbit Shares
RoomPosition.prototype.isEqualToXY = function (x, y) {
    return x === this.x && y === this.y;
};
RoomPosition.prototype.isEqualToPos = function (obj) {
    return obj.x === this.x && obj.y === this.y && obj.roomName === this.roomName;
};
RoomPosition.prototype.isEqualToRoomObject = function (obj) {
    return obj.pos.x === this.x && obj.pos.y === this.y && obj.pos.roomName === this.roomName;
};
RoomPosition.prototype.inRangeToXY = function (x, y, range) {
    return ((x - this.x) < 0 ? (this.x - x) : (x - this.x)) <= range && ((y - this.y) < 0 ? (this.y - y) : (y - this.y)) <= range;
};
RoomPosition.prototype.inRangeToPos = function (obj, range) {
    return ((obj.x - this.x) < 0 ? (this.x - obj.x) : (obj.x - this.x)) <= range && ((obj.y - this.y) < 0 ? (this.y - obj.y) : (obj.y - this.y)) <= range;
};
RoomPosition.prototype.inRangeToRoomObject = function (obj, range) {
    return ((obj.pos.x - this.x) < 0 ? (this.x - obj.pos.x) : (obj.pos.x - this.x)) <= range && ((obj.pos.y - this.y) < 0 ? (this.y - obj.pos.y) : (obj.pos.y - this.y)) <= range;
};
RoomPosition.prototype.isNearToXY = function (x, y) {
    return ((x - this.x) < 0 ? (this.x - x) : (x - this.x)) <= 1 && ((y - this.y) < 0 ? (this.y - y) : (y - this.y)) <= 1;
};
RoomPosition.prototype.isNearToPos = function (obj) {
    return ((obj.x - this.x) < 0 ? (this.x - obj.x) : (obj.x - this.x)) <= 1 && ((obj.y - this.y) < 0 ? (this.y - obj.y) : (obj.y - this.y)) <= 1;
};
RoomPosition.prototype.isNearToRoomObject = function (obj) {
    return ((obj.pos.x - this.x) < 0 ? (this.x - obj.pos.x) : (obj.pos.x - this.x)) <= 1 && ((obj.pos.y - this.y) < 0 ? (this.y - obj.pos.y) : (obj.pos.y - this.y)) <= 1;
};
