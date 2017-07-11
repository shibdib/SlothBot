let cache = require('module.cache');
const profiler = require('screeps-profiler');

const DEFAULT_MAXOPS = 10000;
const STATE_STUCK = 2;

function shibMove(creep, heading, options = {}) {
    _.defaults(options, {
        ignoreCreeps: true,
        maxOps: DEFAULT_MAXOPS,
        range: 1,
        ignoreStructures: false,
        allowHostile: false,
        maxRooms: 16
    });

    this.updateRoomStatus(creep.room);
    if (!creep.memory._shibMove) {
        delete creep.memory._shibMove;
        creep.memory._shibMove = {};
    }
    let origin = normalizePos(creep);
    let target = normalizePos(heading);
    //Delete path if target changed
    if (creep.memory._shibMove.target && target !== creep.memory._shibMove.target) delete creep.memory._shibMove.path;
    //clear path if stuck
    if (creep.memory._shibMove.pathPosTime && creep.memory._shibMove.pathPosTime >= STATE_STUCK) {
        delete creep.memory._shibMove.path;
        creep.room.visual.circle(this.pos, {fill: 'transparent', radius: 0.55, stroke: 'blue'});
    }
    //Execute path if target is valid and path is set
    if (creep.pos.getRangeTo(target) > options.range && creep.memory._shibMove.path) {
        creep.memory._shibMove.pathAge++;
        if (creep.fatigue > 0) {
            creep.room.visual.circle(creep.pos, {fill: 'transparent', radius: 0.55, stroke: 'black'});
            return;
        }
        if (creep.memory._shibMove.pathPos === JSON.stringify(creep.pos)) {
            creep.memory._shibMove.pathPosTime++;
        } else {
            creep.memory._shibMove.pathPos = JSON.stringify(creep.pos);
            creep.memory._shibMove.pathPosTime = 1;
        }
        let nextDirection = parseInt(this.memory._shibMove.path, 10);
        return creep.move(nextDirection);

        //Otherwise find a path
    } else {
        //check for cached
        let cached = getPath(origin, target);
        if (cached) {
            creep.memory._shibMove.target = target;
            creep.memory._shibMove.path = cached;
        } else {
            let originRoomName = origin.roomName;
            let destRoomName = destination.roomName;
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
                        matrix = this.getStructureMatrix(room, options.freshMatrix);
                    }
                    else {
                        matrix = this.getCreepMatrix(room);
                    }
                }
                return matrix;
            };
            let ret = PathFinder.search(origin, {pos: destination, range: options.range}, {
                maxOps: options.maxOps,
                maxRooms: options.maxRooms,
                plainCost: options.offRoad ? 1 : options.ignoreRoads ? 1 : 2,
                swampCost: options.offRoad ? 1 : options.ignoreRoads ? 5 : 10,
                roomCallback: callback,
            });
            creep.memory._shibMove.path = serializePath(creep.pos, ret.path);
            creep.memory._shibMove.target = target;
            cachePath(origin, destination, creep.memory._shibMove.path);
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
    if (!this.structureMatrixCache[room.name] || (freshMatrix && Game.time !== this.structureMatrixTick)) {
        this.structureMatrixTick = Game.time;
        let matrix = new PathFinder.CostMatrix();
        this.structureMatrixCache[room.name] = Traveler.addStructuresToMatrix(room, matrix, 1);
    }
    return this.structureMatrixCache[room.name];
}
function getCreepMatrix(room) {
    if (!this.creepMatrixCache[room.name] || Game.time !== this.creepMatrixTick) {
        this.creepMatrixTick = Game.time;
        this.creepMatrixCache[room.name] = Traveler.addCreepsToMatrix(room, this.getStructureMatrix(room, true).clone());
    }
    return this.creepMatrixCache[room.name];
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
    this.circle(startPos, color);
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
        if (room.controller.owner && !room.controller.my && _.includes(doNotAggress, room.controller.owner['username']) === false) {
            room.memory.avoid = 1;
        }
        else {
            delete room.memory.avoid;
        }
    }
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

// assigns a function to Creep.prototype: creep.travelTo(destination)
Creep.prototype.shibMove = function (destination, options) {
    return shibMove(this, destination, options);
};