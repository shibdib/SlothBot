let cache = require('module.cache');
const profiler = require('screeps-profiler');

const DEFAULT_MAXOPS = 10000;
const STATE_STUCK = 3;

function shibMove(creep, heading, options = {}) {
    _.defaults(options, {
        useCache: true,
        ignoreCreeps: true,
        maxOps: DEFAULT_MAXOPS,
        range: 1,
        ignoreStructures: false,
        allowHostile: false,
        allowSK: false,
        forceRepath: false,
        findRoute: false,
        repathChance: 1,
        preferHighway: false,
        highwayBias: 2.5,
        maxRooms: 16
    });
    if (creep.fatigue > 0) {
        creep.room.visual.circle(creep.pos, {fill: 'transparent', radius: 0.55, stroke: 'black'});
        return;
    }

    updateRoomStatus(creep.room);
    if (!creep.memory._shibMove || options.forceRepath || Math.random() > options.repathChance) {
        delete creep.memory._shibMove;
        creep.memory._shibMove = {};
    }
    let pathInfo = creep.memory._shibMove;

    let rangeToDestination = creep.pos.getRangeTo(heading)
    if (rangeToDestination <= options.range) {
        return OK;
    } else if (rangeToDestination <= 1) {
        if (rangeToDestination === 1) {
            let direction = creep.pos.getDirectionTo(heading);
            return creep.move(direction);
        }
        return OK;
    }

    let origin = normalizePos(creep);
    let target = normalizePos(heading);
    //Delete path if target changed
   // if (pathInfo.target && target !== pathInfo.target) delete pathInfo.path;
    //clear path if stuck
    if (pathInfo.pathPosTime && pathInfo.pathPosTime >= STATE_STUCK && Math.random() > .5) {
        delete pathInfo.path;
        pathInfo.pathPosTime = 0;
        options.ignoreCreeps = false;
        options.freshMatrix = true;
        options.useCache = false;
        creep.room.visual.circle(creep.pos, {fill: 'transparent', radius: 0.55, stroke: 'blue'});
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
        shibPath(creep, heading, pathInfo, origin, target, options);
    }
}

function shibPath(creep, heading, pathInfo, origin, target, options) {
    creep.borderCheck();
    pathInfo.pathPosTime = 1;
    //check for cached
    let cached;
    let roomDistance = Game.map.getRoomLinearDistance(origin.roomName, target.roomName);
    if (options.useCache) cached = getPath(origin, target);
    if (cached && options.ignoreCreeps && options.useCache) {
        pathInfo.target = target;
        pathInfo.path = cached;
        pathInfo.usingCached = true;
        let nextDirection = parseInt(pathInfo.path[0], 10);
        pathInfo.newPos = positionAtDirection(creep.pos, nextDirection);
        creep.say(ICONS.recycle);
        return creep.move(nextDirection);
    } else {
        creep.say(ICONS.moveTo);
        pathInfo.usingCached = false;
        let originRoomName = origin.roomName;
        let destRoomName = target.roomName;
        let allowedRooms = options.route;
        if (!allowedRooms && (options.useFindRoute || (options.useFindRoute === undefined && roomDistance > 0))) {
            let route;
            if (options.useCache) {
                route = getRoute(origin, target);
            }
            if (!route) {
                route = findRoute(origin.roomName, target.roomName, options);
            }
            if (route) {
                allowedRooms = route;
                cacheRoute(origin, target, route);
            }
        }
        let roomsSearched = 0;
        let callback = (roomName) => {
            if (allowedRooms) {
                if (!allowedRooms[roomName]) {
                    return false;
                }
            }
            if (!options.allowHostile && checkAvoid(roomName)
                && roomName !== destRoomName && roomName !== originRoomName) {
                return false;
            }
            let parsed;
            if (!options.allowSK && roomName !== destRoomName && roomName !== originRoomName) {
                if (!parsed) {
                    parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(roomName);
                }
                let fMod = parsed[1] % 10;
                let sMod = parsed[2] % 10;
                let isSK = !(fMod === 5 && sMod === 5) &&
                    ((fMod >= 4) && (fMod <= 6)) &&
                    ((sMod >= 4) && (sMod <= 6));
                if (isSK) {
                    return false;
                }
            }
            roomsSearched++;
            let matrix;
            let room = creep.room;
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
        if (ret.incomplete || options.ensurePath) {
            if (roomDistance <= 2 && !pathInfo.findAttempt) {
                options.useFindRoute = true;
                options.allowSK = true;
                pathInfo.findAttempt = true;
                return shibPath(creep, heading, pathInfo, origin, target, options);
            } else if (pathInfo.findAttempt) {
                if (!creep.memory.badPathing) creep.memory.badPathing = 1;
                if (creep.memory.badPathing) creep.memory.badPathing++;
                if (creep.memory.badPathing > 15) {
                    console.log("<font color='#ff0000'>PATHING ERROR: Creep " + creep.name + " is stuck, suiciding for the good of the CPU.</font>");
                    creep.suicide();
                }
                console.log("<font color='#ff0000'>PATHING ERROR: Creep " + creep.name + " could not find a path from " + creep.pos.x + "."+ creep.pos.y + "."+ creep.pos.roomName +" to " + target.x + "."+ target.y + "."+ target.roomName +" reverting to moveTo</font>")
                return creep.moveTo(target);
            }
        }
        pathInfo.path = serializePath(creep.pos, ret.path);
        let nextDirection = parseInt(pathInfo.path[0], 10);
        pathInfo.newPos = positionAtDirection(creep.pos, nextDirection);
        pathInfo.target = target;
        cachePath(origin, target, pathInfo.path);
        pathInfo.findAttempt = undefined;
        creep.memory.badPathing = undefined;
        return creep.move(nextDirection);
    }
}

function findRoute(origin, destination, options = {}) {
    let restrictDistance = Game.map.getRoomLinearDistance(origin, destination) + 5;
    let allowedRooms = {[origin]: true, [destination]: true};
    let highwayBias = 1;
    if (options.preferHighway) {
        highwayBias = 2.5;
        if (options.highwayBias) {
            highwayBias = options.highwayBias;
        }
    }
    return Game.map.findRoute(origin, destination, {
        routeCallback(roomName) {
            let rangeToRoom = Game.map.getRoomLinearDistance(origin, roomName);
            if (rangeToRoom > restrictDistance) {
                // room is too far out of the way
                return Number.POSITIVE_INFINITY;
            }
            let parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(roomName);
            let isHighway = (parsed[1] % 10 === 0) ||
                (parsed[2] % 10 === 0);
            let isMyRoom = Game.rooms[roomName] &&
                Game.rooms[roomName].controller &&
                Game.rooms[roomName].controller.my;
            if (isHighway || isMyRoom) {
                return 1;
            } else
            // SK rooms are avoided when there is no vision in the room, harvested-from SK rooms are allowed
            if (!options.allowSK && !Game.rooms[roomName]) {
                let fMod = parsed[1] % 10;
                let sMod = parsed[2] % 10;
                let isSK = !(fMod === 5 && sMod === 5) &&
                    ((fMod >= 4) && (fMod <= 6)) &&
                    ((sMod >= 4) && (sMod <= 6));
                if (isSK) {
                    return 4 * highwayBias;
                }
            }
            return 2.5;
        }
    }).forEach(function(info) {
        allowedRooms[info.room] = true;
    });
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
function cacheRoute(from, to, route) {
    let key = getPathKey(from, to);
    let cache = Memory.routeCache || {};
    let tick = Game.time;
    cache[key] = {
        route: JSON.stringify(route),
        uses: 1,
        tick: tick
    };
    Memory.routeCache = cache;
}
function getRoute(from, to) {
    let cache = Memory.routeCache;
    if (cache) {
        let cachedRoute = cache[getPathKey(from, to)];
        if (cachedRoute) {
            cachedRoute.uses += 1;
            Memory.routeCache = cache;
            return JSON.parse(cachedRoute.route);
        }
    } else {
        return null;
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
structureMatrixCache = {};
creepMatrixCache = {};

// assigns a function to Creep.prototype: creep.travelTo(destination)
Creep.prototype.shibMove = function (destination, options) {
    return shibMove(this, destination, options);
};