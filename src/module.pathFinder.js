let _ = require('lodash');
let shib = require("shibBench");

const DEFAULT_MAXOPS = 25000;
const STATE_STUCK = 3;

const structureMatrixCache = {};
const creepMatrixCache = {};

function shibMove(creep, heading, options = {}) {
    creep.borderCheck();
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
        maxRooms: 1,
        checkPath: false,
        badRoom: undefined,
        returnIncomplete: false,
        stayInHub: false,
    });
    if (creep.fatigue > 0) return creep.room.visual.circle(creep.pos, {
        fill: 'transparent',
        radius: 0.55,
        stroke: 'black'
    });
    let origin = normalizePos(creep);
    let target = normalizePos(heading);
    // Make sure origin and target are good
    if (!origin || !target) return;
    let pathingStart = Game.cpu.getUsed();
    updateRoomStatus(creep.room);
    if (!creep.memory._shibMove || Math.random() > options.repathChance || options.forceRepath) creep.memory._shibMove = {};
    // Check if target moved
    if (creep.memory._shibMove.target && (creep.memory._shibMove.target.x !== target.x || creep.memory._shibMove.target.y !== target.y)) creep.memory._shibMove = {};
    // Set var
    let pathInfo = creep.memory._shibMove;
    pathInfo.targetRoom = targetRoom(heading);
    // Check if target reached or within 1
    let rangeToDestination = creep.pos.getRangeTo(heading);
    if (rangeToDestination <= options.range) {
        creep.memory._shibMove = undefined;
        shib.shibBench('pathfinding', pathingStart);
        return OK;
    } else if (rangeToDestination === 1) {
        let direction = creep.pos.getDirectionTo(heading);
        shib.shibBench('pathfinding', pathingStart);
        return creep.move(direction);
    }
    //Clear path if stuck
    if (pathInfo.pathPosTime && pathInfo.pathPosTime >= STATE_STUCK && Math.random() > .5) {
        delete pathInfo.path;
        pathInfo.pathPosTime = 0;
        options.ignoreCreeps = false;
        options.freshMatrix = true;
        options.useCache = false;
        creep.room.visual.circle(creep.pos, {fill: 'transparent', radius: 0.55, stroke: 'blue'});
        if (Math.random() > .8) return creep.moveRandom();
    }
    //Execute path if target is valid and path is set
    if (pathInfo.path && !options.checkPath) {
        if (pathInfo.newPos && pathInfo.newPos.x === creep.pos.x && pathInfo.newPos.y === creep.pos.y && pathInfo.newPos.roomName === creep.pos.roomName) pathInfo.path = pathInfo.path.slice(1);
        if (pathInfo.pathPos === creep.pos.x + '.' + creep.pos.y + '.' + creep.pos.roomName) {
            pathInfo.pathPosTime++;
        } else {
            pathInfo.pathPos = creep.pos.x + '.' + creep.pos.y + '.' + creep.pos.roomName;
            pathInfo.pathPosTime = 0;
        }
        let nextDirection = parseInt(pathInfo.path[0], 10);
        if (nextDirection && pathInfo.newPos) {
            pathInfo.newPos = positionAtDirection(origin, nextDirection);
            creep.memory._shibMove = pathInfo;
            switch (creep.move(nextDirection)) {
                case OK:
                    break;
                case ERR_TIRED:
                    break;
                case ERR_NO_BODYPART:
                    break;
                case ERR_BUSY:
                    creep.idleFor(10);
                    break;
            }
            shib.shibBench('pathfinding', pathingStart);
        } else {
            delete pathInfo.path;
            shib.shibBench('pathfinding', pathingStart);
        }
    } else {
        shibPath(creep, heading, pathInfo, origin, target, options);
        shib.shibBench('pathfinding', pathingStart);
    }
}

function shibPath(creep, heading, pathInfo, origin, target, options) {
    //check for cached
    let cached;
    if (!target) return creep.moveRandom();
    let roomDistance = Game.map.findRoute(origin.roomName, target.roomName).length;
    if (options.useCache && !options.checkPath) cached = getPath(creep, origin, target);
    if (cached && options.ignoreCreeps && options.useCache) {
        pathInfo.findAttempt = undefined;
        creep.memory.badPathing = undefined;
        pathInfo.target = target;
        pathInfo.path = cached;
        pathInfo.usingCached = true;
        let nextDirection = parseInt(pathInfo.path[0], 10);
        pathInfo.newPos = positionAtDirection(creep.pos, nextDirection);
        return creep.move(nextDirection);
    } else {
        pathInfo.usingCached = undefined;
        let originRoomName = origin.roomName;
        let destRoomName = target.roomName;
        let allowedRooms = pathInfo.route || options.route;
        if (!allowedRooms && roomDistance > 1) {
            let route;
            if (options.useCache) route = getRoute(origin, target);
            if (!route && Game.map.findRoute(origin.roomName, target.roomName)[0]) route = findRoute(origin.roomName, target.roomName, options);
            if (route) {
                allowedRooms = route;
                pathInfo.route = route;
                cacheRoute(origin, target, route);
            } else {
                let exitDir = Game.map.findExit(origin.roomName, pathInfo.targetRoom);
                if (exitDir === ERR_NO_PATH) {
                    let nextRoom = Game.map.findRoute(origin.roomName, pathInfo.targetRoom)[0];
                    exitDir = Game.map.findExit(target.roomName, nextRoom);
                    if (exitDir === ERR_NO_PATH) {
                        return creep.moveTo(target);
                    }
                }
                let exit = creep.pos.findClosestByPath(exitDir);
                target = normalizePos(exit);
                delete pathInfo.path;
                options.useFindRoute = false;
                options.range = 0;
                options.maxRooms = 1;
                return shibPath(creep, target, pathInfo, origin, target, options);
            }
        }
        let roomsSearched = 0;
        let callback = (roomName) => {
            if (allowedRooms) {
                if (!_.includes(allowedRooms, roomName)) {
                    return false;
                }
            }
            if (!options.allowHostile && checkAvoid(roomName)
                && roomName !== destRoomName && roomName !== originRoomName) {
                return false;
            }
            roomsSearched++;
            let matrix;
            let room = creep.room;
            if (room) {
                if (options.ignoreStructures) {
                    matrix = new PathFinder.CostMatrix();
                    if (!options.ignoreCreeps) {
                        addCreepsToMatrix(room, matrix);
                        addSksToMatrix(room, matrix);
                    }
                } else if (options.ignoreCreeps || roomName !== originRoomName) {
                    matrix = getStructureMatrix(room, options.freshMatrix);
                    addSksToMatrix(room, matrix);
                } else {
                    matrix = getCreepMatrix(room);
                    addSksToMatrix(room, matrix);
                }
                addBorderToMatrix(room, matrix);
                if (options.stayInHub) addOutsideHubToMatrix(room, matrix);
            }
            return matrix;
        };
        let ret = PathFinder.search(origin, {pos: target, range: options.range}, {
            maxOps: options.maxOps,
            maxRooms: options.maxRooms,
            plainCost: options.offRoad ? 1 : options.ignoreRoads ? 1 : 5,
            swampCost: options.offRoad ? 1 : options.ignoreRoads ? 10 : 20,
            roomCallback: callback,
        });
        if ((ret.incomplete || options.ensurePath) && !options.returnIncomplete) {
            if (options.checkPath) return false;
            if (roomDistance === 0) return creep.idleFor(1);
            target = new RoomPosition(25, 25, target.roomName);
            options.range = 23;
            if (!pathInfo.findAttempt) {
                options.useFindRoute = true;
                options.returnIncomplete = true;
                options.allowSK = true;
                options.maxRooms = 16;
                pathInfo.findAttempt = true;
                options.maxOps = 30000;
                //console.log("<font color='#ff0000'>PATHING ERROR: Creep " + creep.name + " could not find a path from " + creep.pos.x + "." + creep.pos.y + "." + creep.pos.roomName + " to " + target.x + "." + target.y + "." + target.roomName + " retrying.</font>");
                return shibPath(creep, heading, pathInfo, origin, target, options);
            } else if (pathInfo.findAttempt) {
                if (!creep.memory.badPathing) creep.memory.badPathing = 1;
                if (creep.memory.badPathing) creep.memory.badPathing++;
                if (creep.memory.badPathing > 500) {
                    log.e(creep.name + ' is stuck in ' + creep.room.name + ' and is unable to path from ' + creep.pos.x + "." + creep.pos.y + "." + creep.pos.roomName + " to " + target.x + "." + target.y + "." + target.roomName + '. Suiciding for the good of the CPU.');
                    log.e('Ret - ' + JSON.stringify(ret));
                    if (allowedRooms) log.e('Path - ' + allowedRooms);
                    if (creep.memory.military && creep.memory.targetRoom) {
                        delete Memory.targetRooms[creep.memory.targetRoom];
                        delete Memory.roomCache[creep.memory.targetRoom];
                    }
                    return creep.suicide();
                }
                return creep.moveTo(target);
            }
        }
        if (options.checkPath) return true;
        pathInfo.path = serializePath(creep.pos, ret.path);
        let nextDirection = parseInt(pathInfo.path[0], 10);
        pathInfo.newPos = positionAtDirection(creep.pos, nextDirection);
        pathInfo.target = target;
        cachePath(creep, origin, target, pathInfo.path);
        delete pathInfo.findAttempt;
        delete creep.memory.badPathing;
        creep.memory._shibMove = pathInfo;
        switch (creep.move(nextDirection)) {
            case OK:
                return;
            case ERR_TIRED:
                return;
            case ERR_NO_BODYPART:
                return;
            case ERR_BUSY:
                creep.idleFor(10);
                return;
        }
    }
}

function findRoute(origin, destination, options = {}) {
    let restrictDistance = Game.map.getRoomLinearDistance(origin, destination) + 5;
    let roomDistance = Game.map.findRoute(origin, destination).length;
    let highwayBias = 1;
    if (options.preferHighway) {
        highwayBias = 2.5;
        if (options.highwayBias) {
            highwayBias = options.highwayBias;
        }
    }
    let route = Game.map.findRoute(origin, destination, {
        routeCallback: function (roomName) {
            let rangeToRoom = Game.map.getRoomLinearDistance(origin, roomName);
            if (rangeToRoom > restrictDistance) {
                // room is too far out of the way
                return 256;
            }
            // If room is under attack
            if ((Game.rooms[roomName] && Game.rooms[roomName].memory.responseNeeded) || (Memory.roomCache[roomName] && Memory.roomCache[roomName].threatLevel)) return 100;
            // Get special rooms via name
            let parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(roomName);
            let isHighway = (parsed[1] % 10 === 0) ||
                (parsed[2] % 10 === 0);
            let isMyRoom = Game.rooms[roomName] &&
                Game.rooms[roomName].controller &&
                Game.rooms[roomName].controller.my;
            if (isMyRoom) {
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
            if (isHighway && options.preferHighway) return 1;
            // Avoid rooms owned by others
            if (Memory.roomCache && Memory.roomCache[roomName]) {
                if ((Memory.roomCache[roomName].owner && !_.includes(FRIENDLIES, Memory.roomCache[roomName].owner.username))
                    || (Game.rooms[roomName] && Game.rooms[roomName].controller && Game.rooms[roomName].controller.owner && !_.includes(FRIENDLIES, Game.rooms[roomName].controller.owner.username))) {
                    return 255;
                }
            }
            // Avoid rooms reserved by others
            if (Memory.roomCache && Memory.roomCache[roomName]) {
                if ((Memory.roomCache[roomName].reservation && (!_.includes(FRIENDLIES, Memory.roomCache[roomName].reservation.username) || Memory.roomCache[roomName].potentialTarget))
                    || (Game.rooms[roomName] && Game.rooms[roomName].controller && Game.rooms[roomName].controller.reservation && !_.includes(FRIENDLIES, Game.rooms[roomName].controller.reservation.username))) {
                    return 25;
                }
            }
            // Check for manual flagged rooms
            if (Memory.avoidRooms && _.includes(Memory.avoidRooms, roomName)) {
                return 255;
            }
            return 2.5;
        }
    });
    let path = undefined;
    if (route.length) {
        path = [];
        path.push(origin, destination);
        for (let key in route) {
            path.push(route[key].room)
        }
    }
    if (path && roomDistance > 2 && path[1] === destination) {
        path.splice(1, 1);
    }
    return path;
}

//FUNCTIONS
function normalizePos(destination) {
    if (!(destination instanceof RoomPosition)) {
        if (destination) {
            return destination.pos;
        } else {
            return null;
        }
    }
    return destination;
}

function targetRoom(destination) {
    if (!(destination instanceof RoomPosition)) {
        if (destination) {
            return destination.pos.roomName;
        } else {
            return null;
        }
    }
    return destination.roomName;
}

function checkAvoid(roomName) {
    return Memory.rooms && Memory.rooms[roomName] && Memory.rooms[roomName].avoid;
}

function getStructureMatrix(room, freshMatrix) {
    if (!structureMatrixCache[room.name] || (freshMatrix || (!room.memory.structureMatrixTick || Game.time > room.memory.structureMatrixTick + 5))) {
        room.memory.structureMatrixTick = Game.time;
        let matrix = new PathFinder.CostMatrix();
        structureMatrixCache[room.name] = addStructuresToMatrix(room, matrix, 1).serialize();
    }
    return PathFinder.CostMatrix.deserialize(structureMatrixCache[room.name]);
}

function getCreepMatrix(room) {
    if (!creepMatrixCache[room.name] || (!room.memory.creepMatrixTick || Game.time !== room.memory.creepMatrixTick)) {
        room.memory.creepMatrixTick = Game.time;
        creepMatrixCache[room.name] = addCreepsToMatrix(room, getStructureMatrix(room, true).clone()).serialize();
    }
    return PathFinder.CostMatrix.deserialize(creepMatrixCache[room.name]);
}

function addCreepsToMatrix(room, matrix) {
    let creeps = room.creeps;
    let enemyCreeps = _.filter(creeps, (c) => !_.includes(FRIENDLIES, c.owner.username) && (c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK)));
    for (let key in creeps) {
        matrix.set(creeps[key].pos.x, creeps[key].pos.y, 0xff);
        if (!_.includes(FRIENDLIES, creeps[key].owner.username) && (creeps[key].getActiveBodyparts(ATTACK) || creeps[key].getActiveBodyparts(RANGED_ATTACK))) {
            let range = 6;
            if (!creeps[key].getActiveBodyparts(RANGED_ATTACK)) range = 3;
            let avoidZone = creeps[key].room.lookForAtArea(LOOK_TERRAIN, creeps[key].pos.y - range, creeps[key].pos.x - range, creeps[key].pos.y + range, creeps[key].pos.x + range, true);
            for (let key in avoidZone) {
                let position = new RoomPosition(avoidZone[key].x, avoidZone[key].y, room.name);
                if (!position.checkForWall()) {
                    let inRange = position.findInRange(enemyCreeps, range);
                    matrix.set(position.x, position.y, 50 * inRange)
                }
            }
        }
    }
    return matrix;
}

function addSksToMatrix(room, matrix) {
    let parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(room.name);
    let fMod = parsed[1] % 10;
    let sMod = parsed[2] % 10;
    let isSK = !(fMod === 5 && sMod === 5) &&
        ((fMod >= 4) && (fMod <= 6)) &&
        ((sMod >= 4) && (sMod <= 6));
    if (isSK) {
        let sk = room.find(FIND_CREEPS, {filter: (c) => c.owner.username === 'Source Keeper'});
        if (sk.length > 0) {
            for (let c = 0; c < sk.length; c++) {
                matrix.set(sk[c].pos.x, sk[c].pos.y, 0xff);
                let sites = sk[c].room.lookForAtArea(LOOK_TERRAIN, sk[c].pos.y - 4, sk[c].pos.x - 4, sk[c].pos.y + 4, sk[c].pos.x + 4, true);
                for (let key in sites) {
                    let position = new RoomPosition(sites[key].x, sites[key].y, room.name);
                    if (!position.checkForWall()) {
                        matrix.set(position.x, position.y, 254)
                    }
                }
            }
        }
    }
    return matrix;
}

function addStructuresToMatrix(room, matrix, roadCost) {
    for (let structure of room.structures) {
        if (OBSTACLE_OBJECT_TYPES.includes(structure.structureType)) {
            matrix.set(structure.pos.x, structure.pos.y, 256);
        } else if (structure instanceof StructureRampart && ((!structure.my && !structure.isPublic) || structure.pos.checkForObstacleStructure())) {
            matrix.set(structure.pos.x, structure.pos.y, 256);
        } else if (structure instanceof StructureRampart && (structure.my || structure.isPublic)) {
            matrix.set(structure.pos.x, structure.pos.y, roadCost + 1);
        } else if (structure instanceof StructureRoad) {
            matrix.set(structure.pos.x, structure.pos.y, roadCost);
        } else if (structure instanceof StructureContainer) {
            matrix.set(structure.pos.x, structure.pos.y, 45);
        } else {
            matrix.set(structure.pos.x, structure.pos.y, 256);
        }
    }
    let blockingSites = _.filter(room.constructionSites, (s) => (s.my && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART) || (!s.my && _.includes(FRIENDLIES, s.owner.username)));
    for (let site of blockingSites) {
        matrix.set(site.pos.x, site.pos.y, 256);
    }
    return matrix;
}

function addBorderToMatrix(room, matrix) {
    let exits = Game.map.describeExits(room.name);
    if (exits === undefined) {
        return matrix;
    }
    let top = ((_.get(exits, TOP, undefined) === undefined) ? 1 : 0);
    let right = ((_.get(exits, RIGHT, undefined) === undefined) ? 48 : 49);
    let bottom = ((_.get(exits, BOTTOM, undefined) === undefined) ? 48 : 49);
    let left = ((_.get(exits, LEFT, undefined) === undefined) ? 1 : 0);
    for (let y = top; y <= bottom; ++y) {
        for (let x = left; x <= right; x += ((y % 49 === 0) ? 1 : 49)) {
            if (matrix.get(x, y) < 0x03 && Game.map.getTerrainAt(x, y, room.name) !== "wall") {
                matrix.set(x, y, 0x03);
            }
        }
    }
    return matrix;
}

function addOutsideHubToMatrix(room, matrix) {
    if (!room.memory.extensionHub) return matrix;
    let hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
    let dangerZone = room.lookForAtArea(LOOK_TERRAIN, hub.y - 8, hub.x - 8, hub.y + 8, hub.x + 8, true);
    for (let p in dangerZone) {
        let pos = new RoomPosition(dangerZone[p].x, dangerZone[p].y, room.name);
        if (pos.getRangeTo(hub) <= 6 || Game.map.getTerrainAt(pos.x, pos.y, room.name) === "wall") continue;
        matrix.set(pos.x, pos.y, 175)
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
    if (!room) return;
    if (room.controller) {
        if (room.controller.owner && !room.controller.my && !_.includes(FRIENDLIES, room.controller.owner.username)) {
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
    let key = from.roomName + '_' + to.roomName;
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
        let cachedRoute = cache[from.roomName + '_' + to.roomName];
        if (cachedRoute) {
            cachedRoute.uses += 1;
            Memory.routeCache = cache;
            return JSON.parse(cachedRoute.route);
        }
    } else {
        return null;
    }
}

function cachePath(creep, from, to, path) {
    let key = getPathKey(from, to);
    let cache = Game.rooms[creep.memory.overlord].memory.pathCache || {};
    let tick = Game.time;
    cache[key] = {
        path: path,
        uses: 1,
        tick: tick
    };
    Game.rooms[creep.memory.overlord].memory.pathCache = cache;
}

function getPath(creep, from, to) {
    let cache = Game.rooms[creep.memory.overlord].memory.pathCache;
    if (cache) {
        let cachedPath = cache[getPathKey(from, to)];
        if (cachedPath) {
            cachedPath.uses += 1;
            Game.rooms[creep.memory.overlord].memory.pathCache = cache;
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
Creep.prototype.shibRoute = function (destination, options) {
    return findRoute(this.room.name, destination, options);
};
Room.prototype.shibRoute = function (destination, options) {
    return findRoute(this.name, destination, options);
};