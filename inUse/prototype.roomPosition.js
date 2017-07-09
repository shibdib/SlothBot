/**
 * Created by Bob on 7/3/2017.
 */
'use strict';

RoomPosition.prototype.getClosestSource = function () {
    let source = this.findClosestByRange(FIND_SOURCES_ACTIVE);
    if (source === null) {
        source = this.findClosestByRange(FIND_SOURCES);
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
    var adjacentPos = [
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

RoomPosition.prototype.checkForWall = function () {
    return this.lookFor(LOOK_TERRAIN)[0] === 'wall';
};

RoomPosition.prototype.checkForObstacleStructure = function () {
    return this.lookFor(LOOK_STRUCTURES).some(s => OBSTACLE_OBJECT_TYPES.includes(s.structureType));
};

RoomPosition.prototype.checkForRoad = function () {
    return this.lookFor(LOOK_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_ROAD});
};

RoomPosition.prototype.checkForAllStructure = function () {
    return this.lookFor(LOOK_STRUCTURES, {filter: (s) => s.structureType !== STRUCTURE_RAMPART});
};

RoomPosition.prototype.isExit = function () {
    if (this.x <= 1 || this.x >= 48 || this.y <= 1 || this.y >= 48) {
        return true;
    }
    return false;
};

RoomPosition.prototype.isValid = function () {
    if (this.x < 0 || this.y < 0) {
        return false;
    }
    if (this.x > 49 || this.y > 49) {
        return false;
    }
    return true;
};

RoomPosition.prototype.buildRoomPosition = function (direction, distance) {
    if (distance > 1) {
        console.log('!!!! Distance > 1 not yet implemented');
    }
    return this.getAdjacentPosition((direction - 1) % 8 + 1);
};
