/**
 * Created by Bob on 7/3/2017.
 */
'use strict';

RoomPosition.prototype.getClosestSource = function () {
    let source = this.findClosestByRange(FIND_SOURCES_ACTIVE, {filter: (s) => s.pos.countOpenTerrainAround() > 2});
    if (source === null) {
        source = this.findClosestByRange(FIND_SOURCES, {filter: (s) => s.pos.countOpenTerrainAround() > 2});
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
    const terrainArray = Game.rooms[this.roomName].lookForAtArea(LOOK_TERRAIN, this.y - 1, this.x - 1, this.y + 1, this.x + 1, true);
    const plainArray = _.filter(terrainArray, 'terrain', 'plain');
    const swampArray = _.filter(terrainArray, 'terrain', 'swamp');
    const structures = Game.rooms[this.roomName].lookForAtArea(LOOK_STRUCTURES, this.y - 1, this.x - 1, this.y + 1, this.x + 1, true);
    const wall = _.filter(structures, 'structure', 'constructedWall');
    if (plainArray.length + swampArray.length - wall.length > 0) {
        return plainArray.length + swampArray.length - wall.length;
    }
};

RoomPosition.prototype.checkForWall = function () {
    return this.lookFor(LOOK_TERRAIN)[0] === 'wall';
};

RoomPosition.prototype.checkForPlain = function () {
    return this.lookFor(LOOK_TERRAIN)[0] === 'plain';
};

RoomPosition.prototype.checkForRampart = function () {
    return this.lookFor(LOOK_STRUCTURES)[0] === 'rampart';
};

RoomPosition.prototype.checkForObstacleStructure = function () {
    return this.lookFor(LOOK_STRUCTURES).some(s => OBSTACLE_OBJECT_TYPES.includes(s.structureType));
};

RoomPosition.prototype.checkForRoad = function () {
    if (this.roomName)
        return this.lookFor(LOOK_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_ROAD});
};

RoomPosition.prototype.checkForAllStructure = function () {
    if (Game.rooms[this.roomName]) {
        return this.lookFor(LOOK_STRUCTURES, {filter: (s) => s.structureType !== STRUCTURE_RAMPART});
    } else {
        return undefined;
    }
};

RoomPosition.prototype.checkForImpassible = function () {
    if (Game.rooms[this.roomName]) {
        let structure = this.lookFor(LOOK_STRUCTURES, {filter: (s) => OBSTACLE_OBJECT_TYPES.includes(s.structureType)});
        let wall = this.lookFor(LOOK_TERRAIN)[0] === 'wall';
        if (structure || wall) {
            return true;
        }
    } else {
        return undefined;
    }
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
    let cached = getCachedTargetDistance(this, target);
    if (cached) return cached;
    return cacheTargetDistance(this, target);
};

function cacheTargetDistance(origin, target) {
    let key = getPathKey(origin, target.pos);
    let cache = Memory.distanceCache || {};
    let distance = origin.getRangeTo(target);
    cache[key] = {
        distance: distance,
        uses: 1
    };
    Memory.distanceCache = cache;
    return distance;
}

function getCachedTargetDistance(origin, target) {
    let cache = Memory.distanceCache;
    if (cache) {
        let cachedDistance = cache[getPathKey(origin, target.pos)];
        if (cachedDistance) {
            cachedDistance.uses += 1;
            Memory.distanceCache = cache;
            return cachedDistance.distance;
        }
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
