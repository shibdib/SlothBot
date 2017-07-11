let cache = require('module.cache');
const profiler = require('screeps-profiler');

const DEFAULT_MAXOPS = 10000;
const STATE_STUCK = 3;

function shibMove(creep, heading, options = {}) {
    _.defaults(options, {
        ignoreCreeps: true,
        maxOps: DEFAULT_MAXOPS,
        range: 1,
        ignoreStructures: false,
        allowHostile: false,
        maxRooms: 16
    });
    if (creep.fatigue > 0) {
        creep.room.visual.circle(creep.pos, {fill: 'transparent', radius: 0.55, stroke: 'black'});
        return;
    }

    updateRoomStatus(creep.room);
    if (!creep.memory._shibMove) {
        delete creep.memory._shibMove;
        creep.memory._shibMove = {};
    }
    let pathInfo = creep.memory._shibMove;

    if (creep.pos.getRangeTo(heading) <= options.range) {
        delete pathInfo.path;
    }

    let origin = normalizePos(creep);
    let target = normalizePos(heading);
    //Delete path if target changed
    //if (pathInfo.target && target !== pathInfo.target) delete pathInfo.path;
    //clear path if stuck
    if (pathInfo.pathPosTime && pathInfo.pathPosTime >= STATE_STUCK) {
        delete pathInfo.path;
        pathInfo.pathPosTime = 0;
        options.ignoreCreeps = false;
        creep.room.visual.circle(creep.pos, {fill: 'transparent', radius: 0.55, stroke: 'blue'});
        return;
    }
    //Execute path if target is valid and path is set
    if (pathInfo.path) {
        creep.borderCheck();
        if (pathInfo.newPos && pathInfo.newPos.x === creep.pos.x && pathInfo.newPos.y === creep.pos.y && pathInfo.newPos.roomName === creep.pos.roomName) {
            pathInfo.path = pathInfo.path.slice(1);
        }
        if (pathInfo.pathPos === creep.pos.x + '.' + creep.pos.y + '.' + creep.pos.roomName) {
            pathInfo.pathPosTime++;
        } else {
            pathInfo.pathPos = creep.pos.x + '.' + creep.pos.y + '.' + creep.pos.roomName;
            pathInfo.pathPosTime = 0;
        }
        let nextDirection = parseInt(pathInfo.path[0], 10);
        if (nextDirection && pathInfo.newPos) {
            pathInfo.newPos = positionAtDirection(origin, nextDirection);
            return creep.move(nextDirection);
        } else {
            delete pathInfo.path;
        }

        //Otherwise find a path
    } else {
        creep.borderCheck();
        creep.say(ICONS.moveTo);
        pathInfo.pathPosTime = 1;
        //check for cached
        let cached = getPath(origin, target);
        if (cached) {
            pathInfo.target = target;
            pathInfo.path = cached;
            pathInfo.usingCached = true;
            let nextDirection = parseInt(pathInfo.path[0], 10);
            pathInfo.newPos = positionAtDirection(creep.pos, nextDirection);
            return creep.move(nextDirection);
        } else {
            pathInfo.usingCached = false;
            let originRoomName = origin.roomName;
            let destRoomName = target.roomName;
            let roomsSearched = 0;
            let callback = (roomName) => {
                if (!options.allowHostile && checkAvoid(roomName)
                    && roomName !== destRoomName && roomName !== originRoomName) {
                    return false;
                }
                roomsSearched++;
                let matrix;
                let room = Game.rooms[roomName];
                if (room) {
                    if (options.ignoreStructures) {
                        matrix = new PathFinder.CostMatrix();
                        if (!options.ignoreCreeps) {
                            addCreepsToMatrix(room, matrix);
                        }
                    }
                    else if (options.ignoreCreeps || roomName !== originRoomName) {
                        matrix = getStructureMatrix(room, options.freshMatrix);
                    }
                    else {
                        matrix = getCreepMatrix(room);
                    }
                }
                return matrix;
            };
            let ret = PathFinder.search(origin, {pos: target, range: options.range}, {
                maxOps: options.maxOps,
                maxRooms: options.maxRooms,
                plainCost: options.offRoad ? 1 : options.ignoreRoads ? 1 : 2,
                swampCost: options.offRoad ? 1 : options.ignoreRoads ? 5 : 10,
                roomCallback: callback,
            });
            pathInfo.path = serializePath(creep.pos, ret.path);
            let nextDirection = parseInt(pathInfo.path[0], 10);
            pathInfo.newPos = positionAtDirection(creep.pos, nextDirection);
            pathInfo.target = target;
            cachePath(origin, target, pathInfo.path);
            return creep.move(nextDirection);
        }
    }
}

//FUNCTIONS
function normalizePos(destination) {
    if (!(destination instanceof RoomPosition)) {
        return destination.pos;
    }
    return destination;
}

function checkAvoid(roomName) {
    return Memory.rooms && Memory.rooms[roomName] && Memory.rooms[roomName].avoid;
}

function addCreepsToMatrix(room, matrix) {
    room.find(FIND_CREEPS).forEach((creep) => matrix.set(creep.pos.x, creep.pos.y, 0xff));
    return matrix;
}
function getStructureMatrix(room, freshMatrix) {
    if (!structureMatrixCache[room.name] || (freshMatrix && (!room.memory.structureMatrixTick || Game.time !== room.memory.structureMatrixTick))) {
        room.memory.structureMatrixTick = Game.time;
        let matrix = new PathFinder.CostMatrix();
        structureMatrixCache[room.name] = addStructuresToMatrix(room, matrix, 1);
    }
    return this.structureMatrixCache[room.name];
}
function getCreepMatrix(room) {
    room.memory.creepMatrixTick = Game.time;
    creepMatrixCache[room.name] = addCreepsToMatrix(room, getStructureMatrix(room, true).clone());
    return creepMatrixCache[room.name];
}
function addStructuresToMatrix(room, matrix, roadCost) {
    let impassibleStructures = [];
    for (let structure of room.find(FIND_STRUCTURES)) {
        if (structure instanceof StructureRampart) {
            if (!structure.my && !structure.isPublic) {
                impassibleStructures.push(structure);
            }
        }
        else if (structure instanceof StructureRoad) {
            matrix.set(structure.pos.x, structure.pos.y, roadCost);
        }
        else if (structure instanceof StructureContainer) {
            matrix.set(structure.pos.x, structure.pos.y, 5);
        }
        else {
            impassibleStructures.push(structure);
        }
    }
    for (let site of room.find(FIND_MY_CONSTRUCTION_SITES)) {
        if (site.structureType === STRUCTURE_CONTAINER || site.structureType === STRUCTURE_ROAD
            || site.structureType === STRUCTURE_RAMPART) {
            continue;
        }
        matrix.set(site.pos.x, site.pos.y, 0xff);
    }
    for (let structure of impassibleStructures) {
        matrix.set(structure.pos.x, structure.pos.y, 0xff);
    }
    return matrix;
}

function serializePath(startPos, path, color = "orange") {
    let serializedPath = "";
    let lastPosition = startPos;
    for (let position of path) {
        if (position.roomName === lastPosition.roomName) {
            new RoomVisual(position.roomName)
                .line(position, lastPosition, {color: color, lineStyle: "dashed"});
            serializedPath += lastPosition.getDirectionTo(position);
        }
        lastPosition = position;
    }
    return serializedPath;
}

function updateRoomStatus(room) {
    if (!room) {
        return;
    }
    if (room.controller) {
        if (room.controller.owner && !room.controller.my && _.includes(RawMemory.segments[2], room.controller.owner['username']) === false) {
            room.memory.avoid = 1;
        }
        else {
            delete room.memory.avoid;
        }
    }
}
function positionAtDirection(origin, direction) {
    let offsetX = [0, 0, 1, 1, 1, 0, -1, -1, -1];
    let offsetY = [0, -1, -1, 0, 1, 1, 1, 0, -1];
    let x = origin.x + offsetX[direction];
    let y = origin.y + offsetY[direction];
    if (x > 49 || x < 0 || y > 49 || y < 0 || !x || !y) {
        return;
    }
    return new RoomPosition(x, y, origin.roomName);
}

function cachePath(from, to, path) {
    let key = getPathKey(from, to);
    let cache = Memory.pathCache || {};
    let tick = Game.time;
    cache[key] = {
        path: path,
        uses: 1,
        tick: tick
    };
    Memory.pathCache = cache;
}
function getPath(from, to) {
    let cache = Memory.pathCache;
    if (cache) {
        let cachedPath = cache[getPathKey(from, to)];
        if (cachedPath) {
            cachedPath.uses += 1;
            Memory.pathCache = cache;
            return cachedPath.path;
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
structureMatrixCache = {};
creepMatrixCache = {};

// assigns a function to Creep.prototype: creep.travelTo(destination)
Creep.prototype.shibMove = function (destination, options) {
    return shibMove(this, destination, options);
};